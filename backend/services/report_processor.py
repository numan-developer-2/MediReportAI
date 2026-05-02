# ============================================================
# MediReport AI — Report Processor Service
# File: backend/services/report_processor.py
#
# Centralized background report processing pipeline.
# Extracted from routers/reports.py to fix circular imports.
#
# Pipeline:
#   1. OCR       → extract raw text
#   2. NLP       → explain + detect abnormals
#   3. Translate → Urdu + local language
#   4. PDF       → generate downloadable PDF
#   5. TTS       → generate audio explanations
#   6. DB Update → mark completed
# ============================================================

import logging
from datetime import datetime, timezone
from typing import Optional

from config.settings import settings
from config.supabase_client import get_supabase_client
from services.email_service import email_service
from services.nlp_service import analyze_report
from services.ocr_service import extract_text, OCRException
from services.pdf_service import generate_report_pdf
from services.translate_service import translate_report_fields
from services.tts_service import generate_report_audio

logger = logging.getLogger("medireport.processor")


def _get_supabase():
    """Get singleton Supabase client."""
    return get_supabase_client()


def _update_report(report_id: str, updates: dict) -> None:
    """Patch report record in Supabase."""
    supabase = _get_supabase()
    try:
        supabase.table("reports").update(updates).eq("id", report_id).execute()
    except Exception as exc:
        logger.error("Failed to update report %s: %s", report_id, str(exc), exc_info=True)


def _increment_reports_used(user_id: str) -> None:
    """Increment reports_used counter on subscription table."""
    supabase = _get_supabase()
    try:
        supabase.rpc("increment_reports_used", {"p_user_id": user_id}).execute()
    except Exception as exc:
        logger.warning("Failed to increment reports_used for %s: %s", user_id, str(exc))


async def process_report(
    report_id: str,
    image_bytes: bytes,
    user_lang: str,
    hospital_id: Optional[str],
    user_id: str,
) -> None:
    """
    Full async AI pipeline — runs in background after upload returns.

    Stages:
      1. OCR       → extract raw text (TrOCR → pytesseract fallback)
      2. NLP       → explain + detect abnormals (Flan-T5 + regex)
      3. Translate → Urdu + local language (Helsinki-NLP)
      4. PDF       → generate downloadable PDF
      5. DB update → save all results + mark completed

    On any stage failure:
      - Sets processing_status = "failed"
      - Saves partial results (if any)
      - Logs full error for debugging
    """
    logger.info("Starting AI pipeline for report %s (lang=%s)", report_id, user_lang)

    raw_text = ""
    explanation_en = ""
    abnormal_values = []

    # ── Stage 1: OCR ─────────────────────────────
    try:
        _update_report(report_id, {"processing_status": "ocr_processing"})

        ocr_result = await extract_text(image_bytes)
        raw_text = ocr_result["text"]
        ocr_source = ocr_result["source"]

        logger.info(
            "OCR complete for %s: source=%s, chars=%d",
            report_id, ocr_source, len(raw_text),
        )

        _update_report(report_id, {"raw_ocr_text": raw_text})

    except (ValueError, OCRException) as exc:
        logger.error("OCR failed for report %s: %s", report_id, str(exc))
        _update_report(report_id, {
            "processing_status": "failed",
            "doctor_notes": f"OCR failed: {str(exc)}",
        })
        return

    except Exception as exc:
        logger.error("Unexpected OCR error for report %s: %s", report_id, str(exc), exc_info=True)
        _update_report(report_id, {"processing_status": "failed"})
        return

    # ── Stage 2: NLP Analysis ─────────────────────
    try:
        _update_report(report_id, {"processing_status": "ai_processing"})

        nlp_result = await analyze_report(raw_text)
        explanation_en = nlp_result["explanation_en"]
        abnormal_values = nlp_result["abnormal_values"]

        logger.info(
            "NLP complete for %s: explanation=%d chars, abnormals=%d",
            report_id, len(explanation_en), len(abnormal_values),
        )

        _update_report(report_id, {
            "explanation_en":  explanation_en,
            "abnormal_values": abnormal_values,
        })

    except ValueError as exc:
        logger.error("NLP failed for report %s: %s", report_id, str(exc))
        _update_report(report_id, {
            "processing_status": "failed",
            "doctor_notes": f"NLP analysis failed: {str(exc)}",
        })
        return

    except Exception as exc:
        logger.error("Unexpected NLP error for report %s: %s", report_id, str(exc), exc_info=True)
        _update_report(report_id, {"processing_status": "failed"})
        return

    # ── Stage 3: Translation ──────────────────────
    translations = {"explanation_ur": None, "explanation_local": None}
    try:
        _update_report(report_id, {"processing_status": "translating"})

        translations = await translate_report_fields(explanation_en, user_lang)

        logger.info(
            "Translation complete for %s: ur=%s, local=%s",
            report_id,
            "yes" if translations.get("explanation_ur") else "no",
            "yes" if translations.get("explanation_local") else "no",
        )

        _update_report(report_id, {
            "explanation_ur":    translations.get("explanation_ur"),
            "explanation_local": translations.get("explanation_local"),
        })

    except Exception as exc:
        # Translation failure is non-fatal — English explanation is still usable
        logger.warning("Translation failed for report %s: %s — continuing", report_id, str(exc))

    # ── Stage 4: Mark Complete ────────────────────
    _update_report(report_id, {"processing_status": "completed"})
    _increment_reports_used(user_id)

    # ── Stage 5: Generate PDF in background ─────────
    try:
        pdf_result = await generate_report_pdf(
            report_id=report_id,
            user_id=user_id,
            explanation_en=explanation_en or "No explanation available.",
            explanation_ur=translations.get("explanation_ur", ""),
            abnormal_values=abnormal_values,
            patient_name=None,  # Fetched from DB in pdf_service
            created_at=str(datetime.now(timezone.utc).isoformat()),
            hospital_id=hospital_id,
        )
        if pdf_result.get("success"):
            logger.info("PDF generated for report %s: %s", report_id, pdf_result.get("pdf_url"))
        else:
            logger.warning("PDF generation failed for %s: %s", report_id, pdf_result.get("error"))
    except Exception as pdf_exc:
        logger.error("PDF generation error for %s: %s", report_id, pdf_exc, exc_info=True)

    # ── Stage 6: Generate Audio (TTS) ───────────────
    try:
        audio_result = await generate_report_audio(
            explanation_ur=translations.get("explanation_ur"),
            explanation_local=translations.get("explanation_local"),
            user_lang=user_lang,
            report_id=report_id,
            user_id=user_id,
        )
        if audio_result.get("urdu_audio") or audio_result.get("local_audio"):
            logger.info(
                "Audio generated for report %s: urdu=%s, local=%s",
                report_id,
                bool(audio_result.get("urdu_audio")),
                bool(audio_result.get("local_audio"))
            )
            # Update report with audio URLs
            _update_report(report_id, {
                "audio_url_ur": audio_result.get("urdu_audio"),
                "audio_url_local": audio_result.get("local_audio"),
            })
    except Exception as tts_exc:
        logger.warning("Audio generation failed for %s: %s", report_id, tts_exc)

    # ── Stage 7: Send Email Notification ──────────
    try:
        await email_service.send_report_ready_email(
            to_email=None,  # Fetched from user profile
            report_id=report_id,
            language=user_lang,
        )
        logger.info("Report ready email queued for %s", report_id)
    except Exception as email_exc:
        logger.warning("Failed to send report ready email for %s: %s", report_id, email_exc)

    logger.info("✅ AI pipeline complete for report %s", report_id)


__all__ = ["process_report"]
