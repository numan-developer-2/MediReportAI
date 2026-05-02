# backend/services/__init__.py
# Service exports for easy importing

from .email_service import email_service, EmailService
from .nlp_service import (
    analyze_report,
    NLPException,
    ModelUnavailableException,
    InvalidResponseException,
    LabValue,
    NLPResult,
)
from .ocr_service import (
    extract_text,
    OCRException,
    OCRResult,
)
from .pdf_service import generate_report_pdf
from .report_processor import process_report
from .translate_service import (
    translate_text,
    translate_report_fields,
    TranslationException,
    ModelLoadingException,
    RateLimitException,
)
from .tts_service import (
    generate_speech,
    generate_report_audio,
    TTSException,
)

__all__ = [
    # Email
    "email_service",
    "EmailService",
    # NLP
    "analyze_report",
    "NLPException",
    "ModelUnavailableException",
    "InvalidResponseException",
    "LabValue",
    "NLPResult",
    # OCR
    "extract_text",
    "OCRException",
    "OCRResult",
    # PDF
    "generate_report_pdf",
    # Report Processor
    "process_report",
    # Translation
    "translate_text",
    "translate_report_fields",
    "TranslationException",
    "ModelLoadingException",
    "RateLimitException",
    # TTS (Audio)
    "generate_speech",
    "generate_report_audio",
    "TTSException",
]
