# ============================================================
# MediReport AI — Text-to-Speech Service (TTS)
# File: backend/services/tts_service.py
#
# Converts report explanations to audio using HuggingFace MMS-TTS.
# Supports: Urdu, Hindi, English, Arabic, Bengali, Punjabi, Sindhi, Pashto
#
# Pipeline:
#   Explanation text (Urdu/Local language)
#       ↓
#   HuggingFace MMS-TTS model (facebook/mms-tts-*)
#       ↓
#   MP3 audio file → Supabase Storage
# ============================================================

import asyncio
import logging
from io import BytesIO

import httpx
from config.languages import SUPPORTED_LANGUAGES, get_language
from config.settings import settings
from config.supabase_client import safe_storage_upload

logger = logging.getLogger("medireport.tts")

# ── Constants ─────────────────────────────────────────────
_MAX_RETRIES = 3
_RETRY_DELAY = 2.0
_MAX_TEXT_LENGTH = 500  # TTS works best with shorter text


class TTSException(Exception):
    """Raised when TTS generation fails."""
    pass


def _get_tts_model(lang_code: str) -> str | None:
    """Get HuggingFace TTS model ID for a language."""
    try:
        lang = get_language(lang_code)
        return lang.get("tts")
    except ValueError:
        return None


def _chunk_text(text: str, max_length: int = _MAX_TEXT_LENGTH) -> list[str]:
    """Split long text into chunks for TTS."""
    if len(text) <= max_length:
        return [text]
    
    chunks = []
    sentences = text.replace("!", ".").replace("?", ".").split(".")
    current_chunk = ""
    
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
            
        if len(current_chunk) + len(sentence) + 1 <= max_length:
            current_chunk += sentence + ". "
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = sentence + ". "
    
    if current_chunk:
        chunks.append(current_chunk.strip())
    
    return chunks if chunks else [text[:max_length]]


async def _call_tts_api(text: str, model_id: str) -> bytes:
    """
    Call HuggingFace Inference API for TTS.
    
    Args:
        text: Text to convert to speech
        model_id: HuggingFace model ID (e.g., facebook/mms-tts-urd)
        
    Returns:
        Audio bytes (MP3 format)
        
    Raises:
        TTSException: On API error
    """
    endpoint = f"{settings.hf_api_base_url}/{model_id}"
    headers = {
        "Authorization": f"Bearer {settings.huggingface_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "inputs": text,
    }
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                logger.debug(f"TTS API call attempt {attempt}/{_MAX_RETRIES} | model={model_id}")
                
                response = await client.post(
                    endpoint,
                    headers=headers,
                    json=payload,
                )
                
                if response.status_code == 503:
                    logger.warning(f"TTS model loading (503), waiting... | attempt={attempt}")
                    await asyncio.sleep(_RETRY_DELAY * attempt)
                    continue
                
                if response.status_code == 429:
                    logger.warning(f"TTS rate limited (429), backing off... | attempt={attempt}")
                    await asyncio.sleep(_RETRY_DELAY * 2 * attempt)
                    continue
                
                response.raise_for_status()
                
                # MMS-TTS returns audio bytes directly
                audio_bytes = response.content
                
                if not audio_bytes or len(audio_bytes) < 100:
                    raise TTSException(f"Invalid audio response: too small ({len(audio_bytes)} bytes)")
                
                logger.info(f"TTS successful | model={model_id} | audio_size={len(audio_bytes)} bytes")
                return audio_bytes
                
            except httpx.HTTPStatusError as exc:
                logger.error(f"TTS API error: {exc.response.status_code} - {exc.response.text[:200]}")
                if attempt == _MAX_RETRIES:
                    raise TTSException(f"TTS failed after {_MAX_RETRIES} attempts: {exc}")
                await asyncio.sleep(_RETRY_DELAY * attempt)
                
            except Exception as exc:
                logger.error(f"TTS unexpected error: {exc}")
                if attempt == _MAX_RETRIES:
                    raise TTSException(f"TTS failed after {_MAX_RETRIES} attempts: {exc}")
                await asyncio.sleep(_RETRY_DELAY * attempt)
    
    raise TTSException("TTS failed - max retries exceeded")


async def generate_speech(
    text: str,
    lang_code: str,
    report_id: str,
    user_id: str,
) -> dict:
    """
    Generate speech from text and upload to storage.
    
    Args:
        text: Text to convert to speech
        lang_code: Language code (ur, hi, en, etc.)
        report_id: Report UUID for file naming
        user_id: User UUID for storage path
        
    Returns:
        Dict with audio_url and metadata
        
    Raises:
        TTSException: On failure
    """
    # Get TTS model for language
    model_id = _get_tts_model(lang_code)
    if not model_id:
        raise TTSException(f"TTS not supported for language: {lang_code}")
    
    # Chunk long text
    chunks = _chunk_text(text)
    logger.info(f"Generating TTS | lang={lang_code} | model={model_id} | chunks={len(chunks)}")
    
    # Generate audio for each chunk
    audio_parts = []
    for i, chunk in enumerate(chunks):
        try:
            audio_bytes = await _call_tts_api(chunk, model_id)
            audio_parts.append(audio_bytes)
            logger.debug(f"TTS chunk {i+1}/{len(chunks)} generated | size={len(audio_bytes)} bytes")
        except Exception as exc:
            logger.error(f"TTS chunk {i+1} failed: {exc}")
            raise TTSException(f"Failed to generate audio chunk {i+1}: {exc}")
    
    # Combine audio parts (simple concatenation for MP3)
    # For proper MP3 concatenation, we'd need ffmpeg, but for now we use first chunk
    # TODO: Implement proper audio concatenation
    if len(audio_parts) > 1:
        logger.warning(f"Multiple TTS chunks generated, using first chunk only. Full concatenation not yet implemented.")
    
    combined_audio = audio_parts[0] if audio_parts else b""
    
    # Upload to Supabase Storage
    bucket = "report-audio"
    file_path = f"{user_id}/{report_id}/explanation_{lang_code}.mp3"
    
    try:
        audio_url = await safe_storage_upload(
            bucket=bucket,
            path=file_path,
            file_data=combined_audio,
            content_type="audio/mpeg",
        )
        
        logger.info(f"TTS audio uploaded | url={audio_url}")
        
        return {
            "audio_url": audio_url,
            "lang_code": lang_code,
            "lang_name": get_language(lang_code)["name"],
            "duration_estimate": len(text) // 15,  # Rough estimate: ~15 chars per second
            "chunks": len(chunks),
        }
        
    except Exception as exc:
        logger.error(f"TTS audio upload failed: {exc}")
        raise TTSException(f"Failed to upload audio: {exc}")


async def generate_report_audio(
    explanation_ur: str | None,
    explanation_local: str | None,
    user_lang: str,
    report_id: str,
    user_id: str,
) -> dict:
    """
    Generate audio for both Urdu and local language explanations.
    
    Args:
        explanation_ur: Urdu explanation text
        explanation_local: Local language explanation (may be same as Urdu)
        user_lang: User's preferred language
        report_id: Report UUID
        user_id: User UUID
        
    Returns:
        Dict with audio URLs for each language
    """
    results = {
        "urdu_audio": None,
        "local_audio": None,
    }
    
    # Generate Urdu audio
    if explanation_ur:
        try:
            urdu_result = await generate_speech(
                text=explanation_ur,
                lang_code="ur",
                report_id=report_id,
                user_id=user_id,
            )
            results["urdu_audio"] = urdu_result["audio_url"]
            logger.info(f"Urdu TTS generated for report {report_id}")
        except Exception as exc:
            logger.warning(f"Urdu TTS failed for report {report_id}: {exc}")
    
    # Generate local language audio (if different from Urdu)
    if explanation_local and user_lang != "ur" and explanation_local != explanation_ur:
        try:
            local_result = await generate_speech(
                text=explanation_local,
                lang_code=user_lang,
                report_id=report_id,
                user_id=user_id,
            )
            results["local_audio"] = local_result["audio_url"]
            logger.info(f"Local language ({user_lang}) TTS generated for report {report_id}")
        except Exception as exc:
            logger.warning(f"Local TTS failed for report {report_id}: {exc}")
    
    return results


__all__ = [
    "generate_speech",
    "generate_report_audio",
    "TTSException",
]
