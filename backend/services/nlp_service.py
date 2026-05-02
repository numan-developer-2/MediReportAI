# ============================================================
# MediReport AI — NLP Service (REWRITTEN)
# File: backend/services/nlp_service.py
#
# Pipeline:
#   OCR text → Extract lab values → Detect abnormals
#     ↓
#   Build prompt → Flan-T5 (HuggingFace) with retry
#     ↓
#   Validate response → Structured explanation
#
# RULES:
#   - HuggingFace calls have exponential backoff, 3 retries
#   - 503 model loading → wait and retry
#   - 429 rate limit → exponential backoff
#   - Response validated before returning
#   - Fallback with warning flag on failure
#   - No blocking calls in async functions
# ============================================================

import asyncio
import json
import logging
import re
from dataclasses import asdict, dataclass
from typing import Literal

import httpx

from config.settings import settings

logger = logging.getLogger("medireport.nlp")


# ── Constants ─────────────────────────────────────────────
_MAX_RETRIES = settings.hf_max_retries
_RETRY_DELAY = settings.hf_retry_delay
_MAX_INPUT_CHARS = 2000  # Flan-T5 has limited context

_FLAN_ENDPOINT = f"{settings.hf_api_base_url}/{settings.hf_explain_model}"

# Lab value patterns for extraction
_LAB_PATTERNS = [
    # Pattern: "Name: value unit (range)" or "Name value unit range"
    r"(?P<name>[A-Za-z][A-Za-z\s\-/]+?)[:\s]+(?P<value>\d+\.?\d*)\s*(?P<unit>[a-zA-Z/%μµ]+)?(?:\s*[:\(\[]?(?P<range>\d+\.?\d*\s*[-–]\s*\d+\.?\d*)?\)?]?)?",
    # Pattern: "Name 123.45 mg/dL"
    r"(?P<name>[A-Za-z][A-Za-z\s]+)\s+(?P<value>\d+\.?\d*)\s*(?P<unit>[a-zA-Z/%μµ]+)?",
]


# ── Custom Exceptions ────────────────────────────────────
class NLPException(Exception):
    """Raised when NLP processing fails completely."""
    pass


class ModelUnavailableException(NLPException):
    """Raised when HuggingFace model is unavailable."""
    pass


class InvalidResponseException(NLPException):
    """Raised when model response is invalid."""
    pass


# ── Dataclasses ───────────────────────────────────────────
@dataclass
class LabValue:
    """A single lab value extracted from the report."""
    name: str
    value: str
    unit: str
    normal_range: str
    status: Literal["NORMAL", "LOW", "HIGH", "CRITICAL_LOW", "CRITICAL_HIGH"]


@dataclass
class NLPResult:
    """Complete NLP analysis result."""
    explanation: str
    abnormal_values: list[LabValue]
    is_fallback: bool  # True if explanation is from fallback, not AI
    warning_message: str | None = None


# ── Prompt Template ───────────────────────────────────────
_PROMPT_TEMPLATE = """You are a medical lab report explainer. Explain this lab report in simple, clear language that a patient can understand.

LAB VALUES:
{lab_values_text}

ABNORMAL VALUES:
{abnormal_text}

RULES:
- Use simple, everyday language
- Be factual but reassuring
- Highlight any concerning values
- Suggest when to see a doctor
- Keep under 200 words

Provide a clear explanation:"""

_FALLBACK_TEMPLATES = {
    "critical": (
        "⚠️ Your lab report shows CRITICAL values significantly outside the normal range. "
        "Please contact your doctor IMMEDIATELY for urgent medical advice. "
        "Do not wait - seek medical attention as soon as possible."
    ),
    "abnormal": (
        "Your lab report shows some values outside the normal range. "
        "While this may not be an emergency, please consult your doctor within a few days "
        "to discuss these results and get appropriate guidance on next steps."
    ),
    "normal": (
        "Good news! Your lab report has been analyzed and most values appear to be within normal ranges. "
        "Please review the detailed results and consult your doctor if you have any specific concerns."
    ),
}


# ── Lab Value Extraction ─────────────────────────────────
def _extract_lab_values(ocr_text: str) -> list[dict]:
    """
    Extract lab values from OCR text using regex patterns.
    
    Args:
        ocr_text: Raw text from OCR
        
    Returns:
        List of extracted values with name, value, unit, range
    """
    values = []
    seen = set()
    
    for pattern in _LAB_PATTERNS:
        for match in re.finditer(pattern, ocr_text, re.IGNORECASE):
            name = match.group("name").strip().title()
            if name.lower() in seen or len(name) < 2:
                continue
            seen.add(name.lower())
            
            value = match.group("value")
            unit = match.group("unit") if match.group("unit") else ""
            range_str = match.group("range") if match.group("range") else ""
            
            values.append({
                "name": name,
                "value": value,
                "unit": unit,
                "normal_range": range_str,
            })
    
    logger.debug("Extracted %d lab values from text", len(values))
    return values


def _detect_abnormals(values: list[dict]) -> list[LabValue]:
    """
    Detect which lab values are outside normal ranges.
    
    Args:
        values: List of extracted lab values
        
    Returns:
        List of abnormal values with status
    """
    abnormals = []
    
    for v in values:
        try:
            val = float(v["value"])
            range_str = v.get("normal_range", "")
            
            if not range_str or "-" not in range_str:
                continue
                
            # Parse range
            range_parts = range_str.replace("–", "-").split("-")
            if len(range_parts) != 2:
                continue
                
            low = float(range_parts[0].strip())
            high = float(range_parts[1].strip())
            
            # Determine status
            if val < low:
                status = "CRITICAL_LOW" if val < low * 0.7 else "LOW"
            elif val > high:
                status = "CRITICAL_HIGH" if val > high * 1.3 else "HIGH"
            else:
                continue  # Normal
            
            abnormals.append(LabValue(
                name=v["name"],
                value=v["value"],
                unit=v["unit"],
                normal_range=range_str,
                status=status,
            ))
            
        except (ValueError, TypeError):
            continue
    
    # Sort by severity
    severity_order = {"CRITICAL_LOW": 0, "CRITICAL_HIGH": 1, "LOW": 2, "HIGH": 3}
    abnormals.sort(key=lambda x: severity_order.get(x.status, 4))
    
    logger.info("Detected %d abnormal values", len(abnormals))
    return abnormals


def _build_prompt(ocr_text: str, abnormals: list[LabValue]) -> str:
    """
    Build a structured prompt for Flan-T5.
    
    Args:
        ocr_text: Raw OCR text (truncated)
        abnormals: List of abnormal values
        
    Returns:
        Formatted prompt string
    """
    # Truncate if too long
    text = ocr_text[:_MAX_INPUT_CHARS]
    
    # Format abnormal values
    if abnormals:
        abnormal_text = "\n".join([
            f"- {a.name}: {a.value} {a.unit} (normal: {a.normal_range})"
            for a in abnormals
        ])
    else:
        abnormal_text = "All values appear to be within normal ranges."
    
    return _PROMPT_TEMPLATE.format(
        lab_values_text=text,
        abnormal_text=abnormal_text,
    )


# ── HuggingFace API Call with Retry ──────────────────────
async def _call_flan_t5(prompt: str) -> str:
    """
    Call HuggingFace Inference API for Flan-T5.
    
    Args:
        prompt: The prompt to send
        
    Returns:
        Generated text
        
    Raises:
        httpx.TimeoutException: On timeout
        httpx.HTTPStatusError: On API error
        InvalidResponseException: On invalid response format
    """
    headers = {
        "Authorization": f"Bearer {settings.huggingface_api_key}",
        "Content-Type": "application/json",
    }
    
    payload = {
        "inputs": prompt,
        "parameters": {
            "max_length": 300,
            "min_length": 50,
            "do_sample": False,
        },
    }
    
    logger.debug("Calling Flan-T5 with prompt length: %d chars", len(prompt))
    
    async with httpx.AsyncClient(timeout=settings.hf_request_timeout) as client:
        response = await client.post(
            _FLAN_ENDPOINT,
            json=payload,
            headers=headers,
        )
        response.raise_for_status()
    
    data = response.json()
    logger.debug("Flan-T5 response type: %s", type(data).__name__)
    
    # Validate and extract text
    text = _validate_and_extract_response(data)
    
    if not text or len(text) < 20:
        raise InvalidResponseException(f"Response too short or empty: {text[:100]}")
    
    return text


def _validate_and_extract_response(data: any) -> str:
    """
    Validate HuggingFace API response and extract generated text.
    
    Args:
        data: Raw response data
        
    Returns:
        Extracted text
        
    Raises:
        InvalidResponseException: If response format is invalid
    """
    # Expected: [{"generated_text": "..."}]
    if isinstance(data, list) and data and isinstance(data[0], dict):
        if "generated_text" in data[0]:
            text = data[0]["generated_text"]
            if isinstance(text, str):
                # Remove prompt echo if present
                if "Provide a clear explanation:" in text:
                    text = text.split("Provide a clear explanation:")[-1]
                return text.strip()
        elif "text" in data[0]:
            return data[0]["text"].strip()
    
    # Some models return plain string
    if isinstance(data, str):
        return data.strip()
    
    # Some return {"error": "..."}
    if isinstance(data, dict) and "error" in data:
        raise InvalidResponseException(f"API returned error: {data['error']}")
    
    raise InvalidResponseException(f"Unexpected response format: {str(data)[:200]}")


async def _call_with_retry(prompt: str) -> tuple[str, bool]:
    """
    Call Flan-T5 with exponential backoff retry.
    
    Args:
        prompt: The prompt to send
        
    Returns:
        Tuple of (generated_text, is_fallback)
        is_fallback is True if fallback was used
    """
    last_error: Exception | None = None
    
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            logger.info("Flan-T5 attempt %d/%d", attempt, _MAX_RETRIES)
            text = await _call_flan_t5(prompt)
            logger.info("Flan-T5 success on attempt %d", attempt)
            return text, False
            
        except httpx.TimeoutException as exc:
            last_error = exc
            logger.warning("Flan-T5 timeout on attempt %d", attempt)
            
        except httpx.HTTPStatusError as exc:
            last_error = exc
            status = exc.response.status_code
            
            # 503 = model loading, 429 = rate limit → retry
            if status in (503, 429):
                logger.warning("Flan-T5 HTTP %d on attempt %d (will retry)", status, attempt)
            elif status in (400, 401, 403):
                logger.error("Flan-T5 fatal error %d — stopping retries", status)
                break
            else:
                logger.warning("Flan-T5 HTTP %d on attempt %d", status, attempt)
                
        except InvalidResponseException as exc:
            last_error = exc
            logger.warning("Flan-T5 invalid response on attempt %d: %s", attempt, exc)
            
        except Exception as exc:
            last_error = exc
            logger.warning("Flan-T5 unexpected error on attempt %d: %s", attempt, exc)
        
        # Exponential backoff before retry
        if attempt < _MAX_RETRIES:
            delay = _RETRY_DELAY * (2 ** (attempt - 1))
            logger.debug("Waiting %.1fs before retry %d", delay, attempt + 1)
            await asyncio.sleep(delay)
    
    # All retries exhausted — use fallback
    logger.error("Flan-T5 failed after %d attempts — using fallback", _MAX_RETRIES)
    return _generate_fallback(prompt), True


def _generate_fallback(prompt: str) -> str:
    """
    Generate fallback explanation based on prompt content.
    
    Args:
        prompt: The prompt that was sent to the model
        
    Returns:
        Fallback explanation text
    """
    prompt_lower = prompt.lower()
    
    # Check for critical indicators
    if "critical" in prompt_lower or "critical" in prompt_lower:
        return _FALLBACK_TEMPLATES["critical"]
    
    # Check for abnormal indicators
    if any(word in prompt_lower for word in ["abnormal", "low", "high", "outside"]):
        return _FALLBACK_TEMPLATES["abnormal"]
    
    return _FALLBACK_TEMPLATES["normal"]


# ── Public API ───────────────────────────────────────────
async def analyze_report(
    ocr_text: str,
    require_ai: bool = False,
) -> dict[str, any]:
    """
    Analyze OCR text and generate explanation.
    
    Args:
        ocr_text: Raw text from OCR
        require_ai: If True, raise exception instead of using fallback
        
    Returns:
        Dict with:
        - explanation_en: Generated or fallback explanation
        - abnormal_values: List of abnormal lab values
        - is_fallback: Whether fallback was used
        - warning_message: Warning if fallback used (or None)
        
    Raises:
        ValueError: If ocr_text is empty
        NLPException: If require_ai=True and AI fails
    """
    if not ocr_text or not ocr_text.strip():
        raise ValueError("OCR text is empty. Cannot analyze blank report.")
    
    logger.info("Starting NLP analysis (input: %d chars)", len(ocr_text))
    
    try:
        # Step 1: Extract lab values
        raw_values = _extract_lab_values(ocr_text)
        logger.info("Extracted %d lab values", len(raw_values))
        
        # Step 2: Detect abnormals
        abnormals = _detect_abnormals(raw_values)
        logger.info("Found %d abnormal values", len(abnormals))
        
        # Step 3: Build prompt
        prompt = _build_prompt(ocr_text, abnormals)
        
        # Step 4: Call AI with retry
        explanation, is_fallback = await _call_with_retry(prompt)
        
        # Step 5: Validate explanation
        if not explanation or len(explanation) < 20:
            logger.error("Invalid explanation generated (too short)")
            if require_ai:
                raise InvalidResponseException("AI generated invalid explanation")
            explanation = _generate_fallback(prompt)
            is_fallback = True
        
        # Step 6: Build result
        warning = None
        if is_fallback:
            warning = (
                "The AI explanation service is currently unavailable. "
                "This is a basic explanation. Please consult your doctor for detailed analysis."
            )
        
        result = {
            "explanation_en": explanation,
            "abnormal_values": [asdict(a) for a in abnormals],
            "is_fallback": is_fallback,
            "warning_message": warning,
        }
        
        logger.info(
            "NLP complete: %d chars, %d abnormals, fallback=%s",
            len(explanation), len(abnormals), is_fallback,
        )
        
        return result
        
    except ValueError:
        raise
    except Exception as exc:
        logger.error("NLP analysis failed: %s", exc, exc_info=True)
        if require_ai:
            raise NLPException(f"Analysis failed: {exc}") from exc
        
        # Return minimal fallback
        return {
            "explanation_en": _FALLBACK_TEMPLATES["normal"],
            "abnormals": [],
            "is_fallback": True,
            "warning_message": "Analysis service temporarily unavailable. Please try again later.",
        }


__all__ = [
    "analyze_report",
    "NLPException",
    "ModelUnavailableException",
    "InvalidResponseException",
    "LabValue",
    "NLPResult",
]
