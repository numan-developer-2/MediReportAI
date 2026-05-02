# ============================================================
# MediReport AI — Auth Router
# File: backend/routers/auth.py
#
# Endpoints:
#   POST  /api/auth/register  — Sign up + profile + free plan
#   POST  /api/auth/login     — Sign in, return JWT
#   GET   /api/auth/me        — Profile + subscription info
#   POST  /api/auth/logout    — Invalidate session
# ============================================================

import logging
from typing import Optional

import resend
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from supabase import Client, create_client

from config.languages import is_supported
from config.settings import settings
from config.supabase_client import get_supabase_client
from middleware.auth_middleware import CurrentUser, get_current_user

logger = logging.getLogger("medireport.auth")

router = APIRouter()

# ── Resend Email SDK init ─────────────────────────────────
resend.api_key = settings.resend_api_key

# ── Supabase Client ─────────────────────────────────────
# Use centralized client from config.supabase_client

def _get_supabase() -> Client:
    """Get singleton Supabase client from centralized module."""
    return get_supabase_client()


# For auth operations that need anon key, create a separate client
_supabase_anon: Client | None = None


def _get_anon_client() -> Client:
    """Anon client for auth operations (sign in / sign up)."""
    global _supabase_anon
    if _supabase_anon is None:
        _supabase_anon = create_client(
            str(settings.supabase_url),
            settings.supabase_anon_key,
        )
    return _supabase_anon


# ── Pydantic Request Schemas ──────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Minimum 8 characters")
    full_name: str = Field(..., min_length=2, max_length=100)
    language: str = Field(default="ur", description="Preferred language code: ur/en/hi/ar/bn")

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long.")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number.")
        return v

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        if not is_supported(v):
            raise ValueError(f"Unsupported language: '{v}'. Use: ur, en, hi, ar, bn")
        return v

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        stripped = v.strip()
        if len(stripped) < 2:
            raise ValueError("Full name must be at least 2 characters.")
        return stripped


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


# ── Pydantic Response Schemas ─────────────────────────────

class UserProfile(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    preferred_language: str
    role: str
    hospital_id: Optional[str] = None
    created_at: Optional[str] = None


class SubscriptionInfo(BaseModel):
    plan: str
    reports_used: int
    reports_limit: int
    current_period_end: Optional[str] = None


class RegisterResponse(BaseModel):
    message: str
    user: UserProfile
    access_token: str
    token_type: str = "bearer"


class LoginResponse(BaseModel):
    user: UserProfile
    access_token: str
    token_type: str = "bearer"
    expires_at: Optional[str] = None


class MeResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    preferred_language: str
    role: str
    hospital_id: Optional[str] = None
    plan: str
    reports_used: int
    reports_limit: int
    current_period_end: Optional[str] = None


class LogoutResponse(BaseModel):
    message: str


# ── Email Helpers ─────────────────────────────────────────

def _send_welcome_email(email: str, full_name: str, language: str) -> None:
    """
    Send welcome email via Resend.
    Non-blocking: errors are logged but never raise to caller.
    """
    if not settings.resend_api_key:
        logger.info("Resend API key not set — skipping welcome email for %s", email)
        return

    # Language-aware subject line
    subjects = {
        "ur": "MediReport AI میں خوش آمدید — آپ کی صحت ہماری ترجیح",
        "hi": "MediReport AI में आपका स्वागत है",
        "ar": "مرحباً بك في MediReport AI",
        "en": "Welcome to MediReport AI",
    }
    subject = subjects.get(language, subjects["en"])

    try:
        resend.Emails.send({
            "from":    settings.email_from,
            "to":      [email],
            "subject": subject,
            "html": f"""
<!DOCTYPE html>
<html lang="{'ur' if language == 'ur' else 'en'}" dir="{'rtl' if language in ('ur','ar') else 'ltr'}">
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #0ea5e9, #6366f1); padding: 30px; border-radius: 12px; text-align: center;">
    <h1 style="color: white; margin: 0;">🩺 MediReport AI</h1>
    <p style="color: rgba(255,255,255,0.9); margin-top: 8px;">Every patient deserves to understand their health</p>
  </div>

  <div style="padding: 30px 0;">
    <h2>Welcome, {full_name}! 👋</h2>
    <p>Your MediReport AI account is ready.</p>
    <p>You can now:</p>
    <ul>
      <li>📷 Upload lab report photos</li>
      <li>🤖 Get AI-powered explanations in Urdu</li>
      <li>🔴 See abnormal values highlighted instantly</li>
      <li>📄 Download PDF reports</li>
    </ul>
    <p><strong>Free plan includes 3 reports/month.</strong></p>
    <br/>
    <a href="{settings.frontend_url}/upload"
       style="background: #0ea5e9; color: white; padding: 12px 28px;
              border-radius: 8px; text-decoration: none; font-weight: bold;">
      Upload First Report →
    </a>
  </div>

  <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; color: #6b7280; font-size: 13px;">
    <p>MediReport AI | <a href="{settings.frontend_url}">medireport.ai</a></p>
  </div>
</body>
</html>
            """,
        })
        logger.info("Welcome email sent to %s", email)

    except Exception as exc:
        logger.warning("Failed to send welcome email to %s: %s", email, str(exc))


# ── Profile/Subscription Helpers ─────────────────────────

def _upsert_profile(user_id: str, full_name: str, language: str, email: str) -> None:
    """
    Upsert profile row — handles race condition where trigger already created it.
    """
    supabase = _get_supabase()
    try:
        supabase.table("profiles").upsert({
            "id":                 user_id,
            "full_name":          full_name,
            "preferred_language": language,
            "role":               "patient",
        }, on_conflict="id").execute()
        logger.debug("Profile upserted for user %s", user_id)
    except Exception as exc:
        logger.warning("Profile upsert failed for %s: %s", user_id, str(exc))


def _upsert_subscription(user_id: str) -> None:
    """
    Upsert free subscription row — handles race condition with trigger.
    """
    supabase = _get_supabase()
    try:
        supabase.table("subscriptions").upsert({
            "user_id":        user_id,
            "plan":           "free",
            "reports_used":   0,
            "reports_limit":  settings.free_plan_limit,
        }, on_conflict="user_id").execute()
        logger.debug("Subscription upserted for user %s", user_id)
    except Exception as exc:
        logger.warning("Subscription upsert failed for %s: %s", user_id, str(exc))


def _fetch_subscription(user_id: str) -> dict:
    """Fetch subscription row for /me endpoint."""
    supabase = _get_supabase()
    try:
        result = (
            supabase.table("subscriptions")
            .select("plan, reports_used, reports_limit, current_period_end")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        if result.data:
            return result.data
    except Exception as exc:
        logger.warning("Could not fetch subscription for %s: %s", user_id, str(exc))

    # Fallback defaults
    return {
        "plan":               "free",
        "reports_used":       0,
        "reports_limit":      settings.free_plan_limit,
        "current_period_end": None,
    }


def _parse_user_profile(sb_user: object, profile: dict) -> UserProfile:
    """Build UserProfile from Supabase user object + profile dict."""
    return UserProfile(
        id=sb_user.id,
        email=sb_user.email or "",
        full_name=profile.get("full_name"),
        preferred_language=profile.get("preferred_language", "ur"),
        role=profile.get("role", "patient"),
        hospital_id=profile.get("hospital_id"),
        created_at=str(sb_user.created_at) if sb_user.created_at else None,
    )


# ── ENDPOINT 1: Register ──────────────────────────────────

@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register new user",
    description="Create a new patient account with free plan (3 reports/month).",
)
async def register(body: RegisterRequest) -> RegisterResponse:
    """
    Register a new MediReport AI user.

    - Creates Supabase Auth account
    - Creates profile row (role=patient)
    - Creates free subscription (3 reports/month)
    - Sends welcome email via Resend
    """
    supabase = _get_anon_client()

    logger.info("Registration attempt for email: %s", body.email)

    # Step 1: Supabase Auth signup
    try:
        auth_response = supabase.auth.sign_up({
            "email":    body.email,
            "password": body.password,
            "options": {
                "data": {
                    "full_name":          body.full_name,
                    "preferred_language": body.language,
                    "role":               "patient",
                }
            },
        })
    except Exception as exc:
        error_msg = str(exc).lower()
        logger.warning("Supabase signup error for %s: %s", body.email, str(exc))

        if "already registered" in error_msg or "already exists" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists. Please log in.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Registration failed: {str(exc)}",
        )

    if not auth_response.user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration failed. Please check your details and try again.",
        )

    sb_user = auth_response.user
    user_id = sb_user.id

    # Step 2: Upsert profile (trigger may have already created it)
    _upsert_profile(user_id, body.full_name, body.language, body.email)

    # Step 3: Upsert subscription
    _upsert_subscription(user_id)

    # Step 4: Send welcome email (non-blocking)
    _send_welcome_email(body.email, body.full_name, body.language)

    # Step 5: Get JWT token
    token = ""
    if auth_response.session:
        token = auth_response.session.access_token

    profile = {
        "full_name":          body.full_name,
        "preferred_language": body.language,
        "role":               "patient",
        "hospital_id":        None,
    }

    logger.info("User registered successfully: id=%s email=%s", user_id, body.email)

    return RegisterResponse(
        message="Account created successfully! Check your email to verify your account.",
        user=_parse_user_profile(sb_user, profile),
        access_token=token,
    )


# ── ENDPOINT 2: Login ─────────────────────────────────────

@router.post(
    "/login",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Login with email and password",
)
async def login(body: LoginRequest) -> LoginResponse:
    """
    Authenticate user and return JWT access token.
    Token is valid for 1 hour by default (Supabase default).
    """
    supabase = _get_anon_client()

    logger.info("Login attempt for email: %s", body.email)

    try:
        auth_response = supabase.auth.sign_in_with_password({
            "email":    body.email,
            "password": body.password,
        })
    except Exception as exc:
        error_msg = str(exc).lower()
        logger.warning("Login failed for %s: %s", body.email, str(exc))

        # Supabase returns "Invalid login credentials" for wrong email/password
        if "invalid" in error_msg or "credentials" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password. Please try again.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if "email not confirmed" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Please verify your email address before logging in.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Login failed: {str(exc)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not auth_response.user or not auth_response.session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Login failed. Please try again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    sb_user = auth_response.user
    session = auth_response.session

    # Fetch profile for role + language
    admin = _get_supabase()
    profile: dict = {
        "full_name":          None,
        "preferred_language": "ur",
        "role":               "patient",
        "hospital_id":        None,
    }
    try:
        profile_result = (
            admin.table("profiles")
            .select("full_name, preferred_language, role, hospital_id")
            .eq("id", sb_user.id)
            .single()
            .execute()
        )
        if profile_result.data:
            profile = profile_result.data
    except Exception as exc:
        logger.warning("Could not fetch profile on login for %s: %s", sb_user.id, str(exc))

    expires_at = str(session.expires_at) if session.expires_at else None
    logger.info("Login successful: id=%s email=%s", sb_user.id, body.email)

    return LoginResponse(
        user=_parse_user_profile(sb_user, profile),
        access_token=session.access_token,
        expires_at=expires_at,
    )


# ── ENDPOINT 3: Me ────────────────────────────────────────

@router.get(
    "/me",
    response_model=MeResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current user profile + subscription",
    description="Returns authenticated user's profile and subscription usage details.",
)
async def me(user: CurrentUser) -> MeResponse:
    """
    Return combined profile + subscription info for the logged-in user.
    Used by frontend to show plan usage, role-based navigation, etc.
    """
    user_id = user["id"]

    # Fetch subscription (profile already enriched by auth_middleware)
    subscription = _fetch_subscription(user_id)

    logger.debug("Returning /me for user %s (plan=%s)", user_id, subscription.get("plan"))

    return MeResponse(
        id=user_id,
        email=user.get("email", ""),
        full_name=user.get("full_name"),
        preferred_language=user.get("preferred_language", "ur"),
        role=user.get("role", "patient"),
        hospital_id=user.get("hospital_id"),
        plan=subscription.get("plan", "free"),
        reports_used=subscription.get("reports_used", 0),
        reports_limit=subscription.get("reports_limit", settings.free_plan_limit),
        current_period_end=subscription.get("current_period_end"),
    )


# ── ENDPOINT 4: Logout ────────────────────────────────────

@router.post(
    "/logout",
    response_model=LogoutResponse,
    status_code=status.HTTP_200_OK,
    summary="Logout current user",
    description="Invalidates the current Supabase session.",
)
async def logout(user: CurrentUser) -> LogoutResponse:
    """
    Sign out the current session.
    Frontend should also clear local storage / Zustand auth state.
    """
    supabase = _get_anon_client()
    user_id = user["id"]

    try:
        supabase.auth.sign_out()
        logger.info("User %s logged out", user_id)
    except Exception as exc:
        # Logout errors are non-fatal — token will expire on its own
        logger.warning("Supabase sign_out warning for user %s: %s", user_id, str(exc))

    return LogoutResponse(message="Logged out successfully.")
