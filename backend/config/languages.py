# ============================================================
# MediReport AI — Multi-Language Configuration
# File: backend/config/languages.py
# ============================================================

from typing import Optional


# ── Language Registry ─────────────────────────────────────
# Each entry: language code → config dict
# direction: "rtl" | "ltr"
# model:     HuggingFace Helsinki-NLP translation model (None = English, no translation)
# tts:       HuggingFace TTS model for audio output (optional future use)

SUPPORTED_LANGUAGES: dict[str, dict] = {
    "ur": {
        "name":        "Urdu",
        "native_name": "اردو",
        "direction":   "rtl",
        "model":       "Helsinki-NLP/opus-mt-en-ur",
        "tts":         "facebook/mms-tts-urd",
    },
    "hi": {
        "name":        "Hindi",
        "native_name": "हिन्दी",
        "direction":   "ltr",
        "model":       "Helsinki-NLP/opus-mt-en-hi",
        "tts":         "facebook/mms-tts-hin",
    },
    "ar": {
        "name":        "Arabic",
        "native_name": "العربية",
        "direction":   "rtl",
        "model":       "Helsinki-NLP/opus-mt-en-ar",
        "tts":         "facebook/mms-tts-ara",
    },
    "bn": {
        "name":        "Bangla",
        "native_name": "বাংলা",
        "direction":   "ltr",
        "model":       "Helsinki-NLP/opus-mt-en-bn",
        "tts":         "facebook/mms-tts-ben",
    },
    "pa": {
        "name":        "Punjabi",
        "native_name": "ਪੰਜਾਬੀ",
        "direction":   "ltr",
        "model":       "Helsinki-NLP/opus-mt-en-pa",
        "tts":         "facebook/mms-tts-pan",
    },
    "sd": {
        "name":        "Sindhi",
        "native_name": "سنڌي",
        "direction":   "rtl",
        "model":       "Helsinki-NLP/opus-mt-en-ur",   # Urdu model — closest available
        "tts":         "facebook/mms-tts-snd",
    },
    "ps": {
        "name":        "Pashto",
        "native_name": "پښتو",
        "direction":   "rtl",
        "model":       "Helsinki-NLP/opus-mt-en-ar",   # Arabic model — closest available
        "tts":         "facebook/mms-tts-pbt",
    },
    "en": {
        "name":        "English",
        "native_name": "English",
        "direction":   "ltr",
        "model":       None,                            # No translation needed
        "tts":         "facebook/mms-tts-eng",
    },
}

# ── Convenience Sets ──────────────────────────────────────
RTL_LANGUAGES: frozenset[str] = frozenset(
    code for code, cfg in SUPPORTED_LANGUAGES.items()
    if cfg["direction"] == "rtl"
)

TRANSLATABLE_LANGUAGES: frozenset[str] = frozenset(
    code for code, cfg in SUPPORTED_LANGUAGES.items()
    if cfg["model"] is not None
)

# Default language for the platform
DEFAULT_LANGUAGE = "ur"


# ── Helper Functions ──────────────────────────────────────

def get_language(code: str) -> dict:
    """
    Get language config dict by ISO 639-1 code.

    Raises:
        ValueError: if code is not supported.
    """
    lang = SUPPORTED_LANGUAGES.get(code)
    if lang is None:
        supported = ", ".join(SUPPORTED_LANGUAGES.keys())
        raise ValueError(
            f"Unsupported language: '{code}'. Supported codes: {supported}"
        )
    return lang


def get_translation_model(lang_code: str) -> Optional[str]:
    """Return HuggingFace model ID for translation, or None for English."""
    return get_language(lang_code)["model"]


def is_rtl(lang_code: str) -> bool:
    """Return True if language is right-to-left (Urdu, Arabic, Sindhi, Pashto)."""
    return lang_code in RTL_LANGUAGES


def get_language_name(lang_code: str, native: bool = False) -> str:
    """Return display name for a language code."""
    cfg = get_language(lang_code)
    return cfg["native_name"] if native else cfg["name"]


def is_supported(lang_code: str) -> bool:
    """Return True if language code is in the registry."""
    return lang_code in SUPPORTED_LANGUAGES
