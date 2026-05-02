# ============================================================
# MediReport AI — Application Settings (REWRITTEN)
# File: backend/config/settings.py
# Pydantic BaseSettings: reads from .env automatically
# ============================================================

import os
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Central configuration for MediReport AI backend.
    All values are read from environment variables or .env file.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        validate_assignment=True,
    )

    # ── Application ─────────────────────────────────────────
    app_env: Literal["development", "production", "testing"] = Field(
        default="development",
        description="Environment mode"
    )
    secret_key: str = Field(
        ...,
        min_length=32,
        description="JWT signing secret — use strong random value"
    )
    frontend_url: str = Field(
        ...,
        description="Allowed CORS origin e.g. https://medireport.vercel.app"
    )
    api_v1_prefix: str = Field(
        default="/api",
        description="API route prefix"
    )
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO",
        description="Logging level"
    )

    # ── Supabase ────────────────────────────────────────────
    supabase_url: HttpUrl = Field(
        ...,
        description="Project URL from Supabase dashboard"
    )
    supabase_anon_key: str = Field(
        ...,
        min_length=20,
        description="Anon/public key for client-side auth"
    )
    supabase_service_key: str = Field(
        ...,
        min_length=20,
        description="Service role key — never expose to frontend"
    )

    # ── HuggingFace Inference API ───────────────────────────
    huggingface_api_key: str = Field(
        ...,
        min_length=20,
        description="HF token from huggingface.co/settings/tokens"
    )

    # HF model IDs (configurable without code changes)
    hf_ocr_model: str = Field(
        default="microsoft/trocr-base-printed",
        description="Image-to-text OCR model",
    )
    hf_explain_model: str = Field(
        default="google/flan-t5-base",
        description="Text explanation / NLP model",
    )
    hf_translate_ur_model: str = Field(
        default="Helsinki-NLP/opus-mt-en-ur",
        description="English → Urdu translation model",
    )
    hf_translate_hi_model: str = Field(
        default="Helsinki-NLP/opus-mt-en-hi",
        description="English → Hindi translation model",
    )
    hf_translate_ar_model: str = Field(
        default="Helsinki-NLP/opus-mt-en-ar",
        description="English → Arabic translation model",
    )
    hf_translate_bn_model: str = Field(
        default="Helsinki-NLP/opus-mt-en-bn",
        description="English → Bangla translation model",
    )

    # ── API Timeouts ─────────────────────────────────────────
    hf_request_timeout: int = Field(
        default=60,
        ge=10,
        le=300,
        description="Timeout in seconds for HF API calls"
    )
    hf_max_retries: int = Field(
        default=3,
        ge=1,
        le=10,
        description="Max retries for HF API calls"
    )
    hf_retry_delay: float = Field(
        default=2.0,
        ge=0.5,
        le=30.0,
        description="Base delay between retries (seconds)"
    )
    api_request_timeout: int = Field(
        default=30,
        ge=5,
        le=120,
        description="Timeout for internal API requests"
    )

    # ── Stripe (Payments) ───────────────────────────────────
    stripe_secret_key: str = Field(
        default="",
        description="Stripe secret key — sk_live_... or sk_test_..."
    )
    stripe_webhook_secret: str = Field(
        default="",
        description="Stripe webhook signing secret — whsec_..."
    )
    stripe_publishable_key: str = Field(
        default="",
        description="Stripe publishable key for frontend"
    )

    # ── Resend (Email) ──────────────────────────────────────
    resend_api_key: str = Field(
        default="",
        description="Resend API key — re_..."
    )
    email_from: str = Field(
        default="noreply@medireport.ai",
        description="Sender email address"
    )
    email_from_name: str = Field(
        default="MediReport AI",
        description="Sender name"
    )

    # ── Sentry (Error Tracking) ─────────────────────────────
    sentry_dsn: str | None = Field(
        default=None,
        description="Sentry DSN — None/empty = disabled"
    )
    sentry_traces_sample_rate: float = Field(
        default=0.1,
        ge=0.0,
        le=1.0,
        description="Sentry tracing sample rate"
    )

    # ── Plan Limits ─────────────────────────────────────────
    free_plan_limit: int = Field(
        default=100,
        ge=1,
        description="Max reports for free tier/month"
    )
    pro_plan_limit: int = Field(
        default=30,
        ge=1,
        description="Max reports for pro tier/month"
    )
    enterprise_plan_limit: int = Field(
        default=-1,
        description="-1 = unlimited"
    )

    # ── Storage ─────────────────────────────────────────────
    reports_bucket: str = Field(
        default="lab-reports",
        description="Supabase Storage bucket for images"
    )
    pdfs_bucket: str = Field(
        default="report-pdfs",
        description="Supabase Storage bucket for PDFs"
    )
    max_upload_size_mb: int = Field(
        default=5,
        ge=1,
        le=50,
        description="Max upload file size in MB"
    )

    # ── HuggingFace API Base ────────────────────────────────
    hf_api_base_url: str = Field(
        default="https://api-inference.huggingface.co/models",
        description="HuggingFace Inference API base URL",
    )

    # ── Background Tasks ────────────────────────────────────
    enable_background_tasks: bool = Field(
        default=True,
        description="Enable async background task processing"
    )
    pdf_generation_timeout: int = Field(
        default=30,
        ge=5,
        le=120,
        description="PDF generation timeout in seconds"
    )

    # ── Security ────────────────────────────────────────────
    jwt_algorithm: str = Field(
        default="HS256",
        description="JWT signing algorithm"
    )
    jwt_access_token_expire_minutes: int = Field(
        default=60 * 24 * 7,  # 7 days
        ge=1,
        description="JWT access token expiration"
    )
    password_min_length: int = Field(
        default=8,
        ge=6,
        le=128,
        description="Minimum password length"
    )

    # ── Feature Flags ───────────────────────────────────────
    enable_email_notifications: bool = Field(
        default=False,
        description="Enable email notifications"
    )
    enable_pdf_export: bool = Field(
        default=True,
        description="Enable PDF report export"
    )
    enable_oauth: bool = Field(
        default=False,
        description="Enable OAuth login"
    )

    # ── Validators ────────────────────────────────────────────

    @field_validator("supabase_url")
    @classmethod
    def validate_supabase_url(cls, v: HttpUrl) -> HttpUrl:
        """Ensure Supabase URL is valid and uses https in production."""
        url_str = str(v)
        if "supabase.co" not in url_str and "localhost" not in url_str:
            raise ValueError("supabase_url must be a valid Supabase URL")
        return v

    @field_validator("huggingface_api_key")
    @classmethod
    def validate_hf_key(cls, v: str) -> str:
        """Ensure HF API key looks valid (starts with hf_)."""
        if not v.startswith("hf_"):
            raise ValueError("huggingface_api_key must start with 'hf_'")
        return v

    @field_validator("stripe_secret_key")
    @classmethod
    def validate_stripe_key(cls, v: str) -> str:
        """If provided, stripe key must start with sk_ or rk_."""
        if v and not (v.startswith("sk_") or v.startswith("rk_")):
            raise ValueError("stripe_secret_key must start with 'sk_' or 'rk_'")
        return v

    @field_validator("resend_api_key")
    @classmethod
    def validate_resend_key(cls, v: str) -> str:
        """If provided, resend key must start with re_."""
        if v and not v.startswith("re_"):
            raise ValueError("resend_api_key must start with 're_'")
        return v

    @field_validator("frontend_url")
    @classmethod
    def validate_frontend_url(cls, v: str) -> str:
        """Ensure frontend URL is valid."""
        if not v.startswith(("http://", "https://")):
            raise ValueError("frontend_url must start with http:// or https://")
        return v.rstrip("/")

    # ── Computed Properties ─────────────────────────────────

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def is_testing(self) -> bool:
        return self.app_env == "testing"

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    @property
    def supabase_url_str(self) -> str:
        """Return Supabase URL as plain string."""
        return str(self.supabase_url)

    @property
    def sentry_enabled(self) -> bool:
        """Check if Sentry is properly configured."""
        return bool(self.sentry_dsn and self.sentry_dsn.startswith("https://"))

    @property
    def stripe_enabled(self) -> bool:
        """Check if Stripe is properly configured."""
        return bool(self.stripe_secret_key and self.stripe_secret_key.startswith("sk_"))

    @property
    def resend_enabled(self) -> bool:
        """Check if Resend email is properly configured."""
        return bool(self.resend_api_key and self.resend_api_key.startswith("re_"))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Returns cached Settings instance.
    Use as FastAPI dependency: settings = Depends(get_settings)
    Or import directly: from config.settings import get_settings
    
    This is cached to avoid re-reading environment variables on every call.
    """
    return Settings()


# Singleton for direct imports
settings: Settings = get_settings()


# Export for easy access
def get_db_url() -> str:
    """Get PostgreSQL connection URL from Supabase settings."""
    return f"{settings.supabase_url_str}/rest/v1"


def get_storage_url() -> str:
    """Get Storage API URL from Supabase settings."""
    return f"{settings.supabase_url_str}/storage/v1"


__all__ = [
    "Settings",
    "get_settings",
    "settings",
    "get_db_url",
    "get_storage_url",
]
