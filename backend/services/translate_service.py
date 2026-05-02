# ============================================================
# MediReport AI — Translation Service (REWRITTEN)
# File: backend/services/translate_service.py
#
# Pipeline:
#   English text + target_lang
#       ↓
#   Skip if target_lang == "en"
#       ↓
#   Chunk text (Helsinki-NLP has ~512 char limit)
#       ↓
#   HuggingFace Inference API (3 retries per chunk)
#       ↓
#   Validate translation (not same as input)
#       ↓
#   Return translated text or original with warning
#
# RULES:
#   - Every HF call has retry with exponential backoff
#   - 503 = model loading → wait and retry
#   - 429 = rate limit → exponential backoff
#   - Validate: translation != original (or log warning)
#   - Fallback: return original with warning flag, never crash
#   - All model responses validated before returning
# ============================================================

import asyncio
import logging
from typing import Optional

import httpx

from config.languages import SUPPORTED_LANGUAGES, get_language, is_rtl
from config.settings import settings

logger = logging.getLogger("medireport.translate")


# ── Constants ─────────────────────────────────────────────
_MAX_RETRIES = settings.hf_max_retries
_RETRY_DELAY = settings.hf_retry_delay
_MAX_INPUT_CHARS = 480    # Helsinki-NLP models have ~512 char limit
_CHUNK_OVERLAP = 20       # Overlap to preserve context


# ── Custom Exceptions ──────────────────────────────────────
class TranslationException(Exception):
    """Raised when translation fails completely."""
    pass


class ModelLoadingException(TranslationException):
    """Raised when model is still loading (503)."""
    pass


class RateLimitException(TranslationException):
    """Raised when rate limited (429)."""
    pass


# ── Model ID Mapping ───────────────────────────────────────
_MODEL_MAP: dict[str, str] = {
    "ur": settings.hf_translate_ur_model,
    "hi": settings.hf_translate_hi_model,
    "ar": settings.hf_translate_ar_model,
    "bn": settings.hf_translate_bn_model,
}


# ── Chunking ───────────────────────────────────────────────
def _split_into_chunks(text: str, max_chars: int = _MAX_INPUT_CHARS) -> list[str]:
    """
    Split long text into sentence-aware chunks.
    
    Args:
        text: Input text
        max_chars: Maximum characters per chunk
        
    Returns:
        List of chunks
    """
    if len(text) <= max_chars:
        return [text]
    
    chunks: list[str] = []
    
    # Split on sentence boundaries
    sentences = [s.strip() for s in text.replace(".\n", ". ").split(". ") if s.strip()]
    
    current_chunk = ""
    for sentence in sentences:
        candidate = f"{current_chunk}. {sentence}".strip() if current_chunk else sentence
        
        if len(candidate) <= max_chars:
            current_chunk = candidate
        else:
            if current_chunk:
                chunks.append(current_chunk)
            
            # If single sentence is too long, hard split
            if len(sentence) > max_chars:
                for i in range(0, len(sentence), max_chars - _CHUNK_OVERLAP):
                    chunks.append(sentence[i: i + max_chars])
                current_chunk = ""
            else:
                current_chunk = sentence
    
    if current_chunk:
        chunks.append(current_chunk)
    
    logger.debug("Split text into %d chunks for translation", len(chunks))
    return chunks


# ── HuggingFace API Call ─────────────────────────────────
async def _call_translation_api(text: str, model_id: str) -> str:
    """
    Single HuggingFace Inference API call.
    
    Args:
        text: Text to translate
        model_id: Helsinki-NLP model ID
        
    Returns:
        Translated text
        
    Raises:
        httpx.TimeoutException: On timeout
        httpx.HTTPStatusError: On API error (including 503, 429)
        TranslationException: On invalid response
    """
    endpoint = f"{settings.hf_api_base_url}/{model_id}"
    headers = {
        "Authorization": f"Bearer {settings.huggingface_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "inputs": text,
        "options": {
            "wait_for_model": True,
            "use_cache": True,
        },
    }
    
    logger.debug("Translating %d chars via %s", len(text), model_id)
    
    async with httpx.AsyncClient(timeout=settings.hf_request_timeout) as client:
        response = await client.post(endpoint, json=payload, headers=headers)
        
        # Handle specific status codes
        if response.status_code == 503:
            raise ModelLoadingException(f"Model {model_id} is loading (503)")
        elif response.status_code == 429:
            raise RateLimitException("Rate limited by HuggingFace (429)")
        
        response.raise_for_status()
    
    data = response.json()
    
    # Extract translation
    return _extract_translation(data, model_id)


def _extract_translation(data: any, model_id: str) -> str:
    """
    Extract translation text from API response.
    
    Args:
        data: Response data
        model_id: Model ID for logging
        
    Returns:
        Translated text
        
    Raises:
        TranslationException: If response format is invalid
    """
    # Expected: [{"translation_text": "..."}]
    if isinstance(data, list) and data and isinstance(data[0], dict):
        if "translation_text" in data[0]:
            return data[0]["translation_text"].strip()
        elif "generated_text" in data[0]:
            return data[0]["generated_text"].strip()
    
    # Plain string fallback
    if isinstance(data, str):
        return data.strip()
    
    # Error response
    if isinstance(data, dict) and "error" in data:
        raise TranslationException(f"API error: {data['error']}")
    
    raise TranslationException(f"Unexpected response format from {model_id}: {str(data)[:200]}")


async def _translate_chunk_with_retry(
    chunk: str,
    model_id: str,
    chunk_index: int,
) -> tuple[str, bool]:
    """
    Translate a chunk with exponential backoff retry.
    
    Args:
        chunk: Text chunk to translate
        model_id: Model ID
        chunk_index: Index for logging
        
    Returns:
        Tuple of (translated_text, is_fallback)
        is_fallback is True if original was returned
    """
    last_error: Exception | None = None
    
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            logger.info("Chunk %d: translation attempt %d/%d", chunk_index, attempt, _MAX_RETRIES)
            result = await _call_translation_api(chunk, model_id)
            
            # Validate: translation should be different from input
            if result.lower().strip() == chunk.lower().strip():
                logger.warning(
                    "Chunk %d: translation identical to input (possible model error)",
                    chunk_index,
                )
                # Only use as fallback if all retries exhausted
                if attempt < _MAX_RETRIES:
                    raise TranslationException("Translation identical to input - retrying")
            
            logger.debug("Chunk %d translated successfully (%d chars)", chunk_index, len(result))
            return result, False
            
        except (ModelLoadingException, RateLimitException) as exc:
            last_error = exc
            logger.warning("Chunk %d: model loading/rate limit on attempt %d", chunk_index, attempt)
            
        except httpx.TimeoutException as exc:
            last_error = exc
            logger.warning("Chunk %d: timeout on attempt %d", chunk_index, attempt)
            
        except httpx.HTTPStatusError as exc:
            last_error = exc
            status = exc.response.status_code
            
            if status in (400, 401, 403):
                logger.error("Chunk %d: fatal HTTP %d — stopping retries", chunk_index, status)
                break
            logger.warning("Chunk %d: HTTP %d on attempt %d", chunk_index, status, attempt)
            
        except TranslationException as exc:
            last_error = exc
            logger.warning("Chunk %d: translation error on attempt %d: %s", chunk_index, attempt, exc)
        
        except Exception as exc:
            last_error = exc
            logger.warning("Chunk %d: unexpected error on attempt %d: %s", chunk_index, attempt, exc)
        
        # Exponential backoff
        if attempt < _MAX_RETRIES:
            delay = _RETRY_DELAY * (2 ** (attempt - 1))
            # Add extra delay for rate limits
            if isinstance(last_error, RateLimitException):
                delay += 5
            logger.debug("Waiting %.1fs before retry %d", delay, attempt + 1)
            await asyncio.sleep(delay)
    
    # All retries exhausted — return original as fallback
    logger.error(
        "Chunk %d: all %d retries failed — returning original. Last error: %s",
        chunk_index, _MAX_RETRIES, last_error,
    )
    return chunk, True


# ── Public API ───────────────────────────────────────────
async def translate_text(
    english_text: str,
    target_lang: str,
) -> dict[str, any]:
    """
    Translate English text to target language.
    
    Args:
        english_text: Source text
        target_lang: Target language code (e.g., "ur", "hi", "ar", "bn")
        
    Returns:
        Dict with:
        - translated_text: Translated or original text
        - is_fallback: Whether original was returned due to failure
        - warning_message: Warning if fallback used
        - source_language: "en"
        - target_language: target_lang
    """
    if not english_text or not english_text.strip():
        return {
            "translated_text": "",
            "is_fallback": False,
            "warning_message": None,
            "source_language": "en",
            "target_language": target_lang,
        }
    
    # Validate language
    try:
        lang_config = get_language(target_lang)
    except ValueError as exc:
        logger.error("Invalid target language: %s", target_lang)
        raise
    
    # Skip translation for English
    model_id = lang_config.get("model")
    lang_name = lang_config.get("name", target_lang)
    
    if target_lang == "en" or not model_id:
        logger.info("Skipping translation — target is English or no model configured")
        return {
            "translated_text": english_text,
            "is_fallback": False,
            "warning_message": None,
            "source_language": "en",
            "target_language": "en",
        }
    
    if not model_id:
        logger.warning("No HF model configured for %s — returning original", lang_name)
        return {
            "translated_text": english_text,
            "is_fallback": True,
            "warning_message": f"Translation to {lang_name} is not available.",
            "source_language": "en",
            "target_language": target_lang,
        }
    
    logger.info(
        "Translating %d chars to %s using %s",
        len(english_text), lang_name, model_id,
    )
    
    # Split into chunks
    chunks = _split_into_chunks(english_text)
    
    # Translate chunks
    translated_parts: list[str] = []
    any_fallback = False
    
    if len(chunks) == 1:
        # Single chunk
        result, is_fallback = await _translate_chunk_with_retry(chunks[0], model_id, 0)
        translated_parts.append(result)
        any_fallback = is_fallback
    else:
        # Multiple chunks — sequential to preserve order
        logger.info("Translating %d chunks sequentially", len(chunks))
        for i, chunk in enumerate(chunks):
            result, is_fallback = await _translate_chunk_with_retry(chunk, model_id, i)
            translated_parts.append(result)
            if is_fallback:
                any_fallback = True
    
    # Join
    separator = " " if not is_rtl(target_lang) else " "
    translated = separator.join(translated_parts)
    
    # Build result
    warning = None
    if any_fallback:
        warning = (
            f"Translation service to {lang_name} is currently experiencing issues. "
            "Some parts may be in English. Please try again later for full translation."
        )
    
    logger.info(
        "Translation complete: %d → %d chars (%s), fallback=%s",
        len(english_text), len(translated), lang_name, any_fallback,
    )
    
    return {
        "translated_text": translated,
        "is_fallback": any_fallback,
        "warning_message": warning,
        "source_language": "en",
        "target_language": target_lang,
    }


async def translate_report_fields(
    explanation_en: str,
    target_lang: str,
) -> dict[str, Optional[str]]:
    """
    Translate report explanation fields.
    
    Args:
        explanation_en: English explanation
        target_lang: Target language
        
    Returns:
        Dict with:
        - explanation_ur: Urdu translation (or None)
        - explanation_local: Local language translation (or None)
    """
    result = {
        "explanation_ur": None,
        "explanation_local": None,
    }
    
    if not explanation_en:
        return result
    
    # Always generate Urdu for Pakistani market
    if target_lang != "en":
        try:
            urdu_result = await translate_text(explanation_en, "ur")
            result["explanation_ur"] = urdu_result["translated_text"]
            if urdu_result["warning_message"]:
                logger.warning("Urdu translation fallback: %s", urdu_result["warning_message"])
        except Exception as exc:
            logger.error("Failed to generate Urdu translation: %s", exc)
    
    # Generate local language if different from Urdu and English
    if target_lang not in ("en", "ur"):
        try:
            local_result = await translate_text(explanation_en, target_lang)
            result["explanation_local"] = local_result["translated_text"]
            if local_result["warning_message"]:
                logger.warning("Local translation fallback: %s", local_result["warning_message"])
        except Exception as exc:
            logger.error("Failed to generate local translation for %s: %s", target_lang, exc)
            # Copy Urdu to local as fallback
            result["explanation_local"] = result.get("explanation_ur")
    elif target_lang == "ur":
        # User wants Urdu — use same for both
        result["explanation_local"] = result.get("explanation_ur")
    
    return result


__all__ = [
    "translate_text",
    "translate_report_fields",
    "TranslationException",
    "ModelLoadingException",
    "RateLimitException",
]
