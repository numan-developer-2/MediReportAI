# ============================================================
# MediReport AI — OCR Service
# File: backend/services/ocr_service.py
#
# Pipeline:
#   image_bytes → preprocess → TrOCR (HuggingFace) → text
#                              ↓ (on failure after 3 retries)
#                           pytesseract → text
# ============================================================

import asyncio
import base64
import io
import logging
from dataclasses import dataclass

import httpx
import pytesseract
from PIL import Image, UnidentifiedImageError

from config.settings import settings

logger = logging.getLogger("medireport.ocr")

# ── Tesseract Configuration ─────────────────────────────────
# Configure Tesseract path for Windows installation
# If Tesseract is installed at C:\Program Files\Tesseract-OCR
import os
if os.path.exists(r"C:\Program Files\Tesseract-OCR\tesseract.exe"):
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# ── Constants ─────────────────────────────────────────────
_MAX_IMAGE_DIMENSION = 1024   # px — TrOCR performs best under 1024px
_MIN_IMAGE_DIMENSION = 32     # px — too small = meaningless
_HF_MAX_RETRIES = 3
_HF_RETRY_DELAY_SECONDS = 2.0  # exponential backoff base
_TROCR_ENDPOINT = (
    f"{settings.hf_api_base_url}/{settings.hf_ocr_model}"
)


# ── Custom Exception ──────────────────────────────────────
class OCRException(Exception):
    """Raised when all OCR methods fail."""
    pass


# ── Result Dataclass ──────────────────────────────────────
@dataclass
class OCRResult:
    text: str
    source: str        # "trocr" | "tesseract"
    confidence: float  # 0.0 – 1.0


# ── Image Preprocessing ──────────────────────────────────

def _preprocess_image(image_bytes: bytes) -> tuple[Image.Image, bytes]:
    """
    Validate, decode, resize, and convert image to RGB.

    Returns:
        (pil_image, preprocessed_bytes_as_png)

    Raises:
        ValueError: if image is corrupted or too small.
    """
    try:
        image = Image.open(io.BytesIO(image_bytes))
    except UnidentifiedImageError as exc:
        raise ValueError(
            "Image file is corrupted or unsupported format. "
            "Please upload a valid JPG, PNG, BMP, or TIFF file."
        ) from exc
    except Exception as exc:
        raise ValueError(f"Failed to open image: {str(exc)}") from exc

    # Convert palette/RGBA/grayscale → RGB
    if image.mode != "RGB":
        logger.debug("Converting image mode: %s → RGB", image.mode)
        image = image.convert("RGB")

    width, height = image.size

    # Guard: image too small to contain readable text
    if width < _MIN_IMAGE_DIMENSION or height < _MIN_IMAGE_DIMENSION:
        raise ValueError(
            f"Image is too small ({width}×{height}px). "
            "Minimum size is 32×32 pixels."
        )

    # Resize if larger than _MAX_IMAGE_DIMENSION on either axis
    if width > _MAX_IMAGE_DIMENSION or height > _MAX_IMAGE_DIMENSION:
        ratio = min(_MAX_IMAGE_DIMENSION / width, _MAX_IMAGE_DIMENSION / height)
        new_size = (int(width * ratio), int(height * ratio))
        logger.debug(
            "Resizing image: %dx%d → %dx%d (ratio=%.2f)",
            width, height, new_size[0], new_size[1], ratio,
        )
        image = image.resize(new_size, Image.LANCZOS)

    # Serialize back to PNG bytes for HF API
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    buf.seek(0)

    logger.debug("Image preprocessed: %dx%d px, RGB, PNG", image.width, image.height)
    return image, buf.read()


# ── HuggingFace TrOCR ─────────────────────────────────────

async def _call_trocr(image_bytes: bytes) -> str:
    """
    Call HuggingFace Inference API for TrOCR.
    Sends raw image bytes as application/octet-stream.

    Returns:
        Extracted text string.

    Raises:
        httpx.TimeoutException: on timeout.
        httpx.HTTPStatusError: on 4xx/5xx response.
        ValueError: if response format is unexpected.
    """
    headers = {
        "Authorization": f"Bearer {settings.huggingface_api_key}",
        "Content-Type": "application/octet-stream",
    }

    logger.debug("Sending request to TrOCR: %s", _TROCR_ENDPOINT)

    async with httpx.AsyncClient(timeout=settings.hf_request_timeout) as client:
        response = await client.post(
            _TROCR_ENDPOINT,
            content=image_bytes,
            headers=headers,
        )
        response.raise_for_status()

    data = response.json()
    logger.debug("TrOCR raw response: %s", str(data)[:200])

    # HF Inference API returns: [{"generated_text": "..."}]
    if isinstance(data, list) and data and "generated_text" in data[0]:
        return data[0]["generated_text"].strip()

    # Some model versions return a plain string
    if isinstance(data, str):
        return data.strip()

    # Unexpected format
    raise ValueError(f"Unexpected TrOCR response format: {type(data)} — {str(data)[:100]}")


async def _trocr_with_retries(image_bytes: bytes) -> str:
    """
    TrOCR call with exponential backoff retry (up to _HF_MAX_RETRIES attempts).

    Raises:
        OCRException: after all retries exhausted.
    """
    last_error: Exception | None = None

    for attempt in range(1, _HF_MAX_RETRIES + 1):
        try:
            logger.info("TrOCR attempt %d/%d", attempt, _HF_MAX_RETRIES)
            text = await _call_trocr(image_bytes)

            if not text:
                raise ValueError("TrOCR returned empty text")

            logger.info("TrOCR succeeded on attempt %d (chars: %d)", attempt, len(text))
            return text

        except httpx.TimeoutException as exc:
            last_error = exc
            logger.warning(
                "TrOCR attempt %d/%d timed out after %ds",
                attempt, _HF_MAX_RETRIES, settings.hf_request_timeout,
            )

        except httpx.HTTPStatusError as exc:
            last_error = exc
            status_code = exc.response.status_code

            # 503 = model loading on HF (cold start) → worth retrying
            # 429 = rate limit → worth retrying with backoff
            # 400/401/403 → fatal, no point retrying
            if status_code in (400, 401, 403):
                logger.error(
                    "TrOCR fatal HTTP error %d — stopping retries: %s",
                    status_code, exc.response.text[:200],
                )
                break

            logger.warning(
                "TrOCR attempt %d/%d HTTP %d error: %s",
                attempt, _HF_MAX_RETRIES, status_code, exc.response.text[:200],
            )

        except ValueError as exc:
            last_error = exc
            logger.warning("TrOCR attempt %d/%d value error: %s", attempt, _HF_MAX_RETRIES, str(exc))

        except Exception as exc:
            last_error = exc
            logger.warning("TrOCR attempt %d/%d unexpected error: %s", attempt, _HF_MAX_RETRIES, str(exc))

        # Exponential backoff before next retry (skip after last attempt)
        if attempt < _HF_MAX_RETRIES:
            delay = _HF_RETRY_DELAY_SECONDS * (2 ** (attempt - 1))
            logger.debug("Waiting %.1fs before retry %d", delay, attempt + 1)
            await asyncio.sleep(delay)

    raise OCRException(
        f"TrOCR failed after {_HF_MAX_RETRIES} attempts. "
        f"Last error: {type(last_error).__name__}: {str(last_error)}"
    )


# ── Tesseract Fallback ────────────────────────────────────

def _tesseract_ocr(pil_image: Image.Image) -> tuple[str, float]:
    """
    Run pytesseract OCR as synchronous fallback.
    Supports Latin + Urdu script (if tesseract-urdu is installed).

    Returns:
        (extracted_text, confidence_score)
    """
    try:
        # Get detailed output including confidence scores
        data = pytesseract.image_to_data(
            pil_image,
            output_type=pytesseract.Output.DICT,
            config="--oem 3 --psm 6",   # OCR Engine Mode 3 = best, PSM 6 = uniform block
            lang="eng+urd" if _urdu_tesseract_available() else "eng",
        )

        # Filter out empty/low-confidence tokens
        words = []
        confidences = []

        for i, word in enumerate(data["text"]):
            conf = int(data["conf"][i])
            if word.strip() and conf > 0:
                words.append(word)
                confidences.append(conf)

        text = " ".join(words).strip()

        # Normalize confidence from 0-100 to 0.0-1.0
        avg_confidence = (sum(confidences) / len(confidences) / 100.0) if confidences else 0.0

        logger.info(
            "Tesseract OCR complete: %d words, avg confidence=%.2f",
            len(words), avg_confidence,
        )
        return text, avg_confidence

    except pytesseract.TesseractNotFoundError as exc:
        raise OCRException(
            "Tesseract is not installed or not in PATH. "
            "Install from: https://github.com/tesseract-ocr/tesseract"
        ) from exc

    except Exception as exc:
        raise OCRException(f"Tesseract OCR failed: {str(exc)}") from exc


def _urdu_tesseract_available() -> bool:
    """Check if Urdu language pack is installed for Tesseract."""
    try:
        langs = pytesseract.get_languages()
        return "urd" in langs
    except Exception:
        return False


# ── Public API ────────────────────────────────────────────

async def extract_text(image_bytes: bytes) -> dict[str, str | float]:
    """
    Primary entry point for OCR extraction.

    Strategy:
      1. Preprocess image (convert, resize, validate)
      2. Try TrOCR via HuggingFace API (3 retries with backoff)
      3. On failure → fallback to local pytesseract

    Args:
        image_bytes: Raw bytes of the uploaded image file.

    Returns:
        {
            "text":       str,   — Extracted text content
            "source":     str,   — "trocr" | "tesseract"
            "confidence": float, — Estimated confidence 0.0-1.0
        }

    Raises:
        ValueError:    Image is corrupted or too small.
        OCRException:  Both OCR methods failed completely.
    """
    if not image_bytes:
        raise ValueError("No image data provided. Please upload a valid image file.")

    logger.info("Starting OCR extraction (input size: %d bytes)", len(image_bytes))

    # Step 1: Preprocess
    pil_image, processed_bytes = _preprocess_image(image_bytes)

    # Step 2: Try TrOCR (primary)
    try:
        text = await _trocr_with_retries(processed_bytes)
        logger.info("OCR completed via TrOCR (%d chars extracted)", len(text))
        return {
            "text": text,
            "source": "trocr",
            "confidence": 0.90,  # TrOCR doesn't expose per-token confidence → use high default
        }

    except OCRException as trocr_exc:
        logger.warning(
            "TrOCR pipeline failed — switching to Tesseract fallback. Reason: %s",
            str(trocr_exc),
        )

    # Step 3: Tesseract fallback (runs in thread pool to avoid blocking event loop)
    try:
        loop = asyncio.get_event_loop()
        text, confidence = await loop.run_in_executor(None, _tesseract_ocr, pil_image)

        if not text:
            raise OCRException("Tesseract extracted no text from the image.")

        logger.info(
            "OCR completed via Tesseract (%d chars, confidence=%.2f)",
            len(text), confidence,
        )
        return {
            "text": text,
            "source": "tesseract",
            "confidence": confidence,
        }

    except OCRException:
        raise  # re-raise tesseract's own OCRException

    except Exception as exc:
        raise OCRException(
            f"Both TrOCR and Tesseract failed to extract text. "
            f"Tesseract error: {str(exc)}"
        ) from exc
