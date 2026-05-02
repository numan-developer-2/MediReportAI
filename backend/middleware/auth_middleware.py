# ============================================================
# MediReport AI — Authentication Middleware (REWRITTEN)
# File: backend/middleware/auth_middleware.py
#
# Validates Bearer JWT via Supabase Auth.
# Key improvements:
#   - Uses centralized Supabase client
#   - Proper error handling with detailed logging
#   - JWT local decode for fast expiry detection
#   - Authoritative Supabase validation for security
#   - Profile enrichment with fallback defaults
# ============================================================

import base64
import json
import logging
import time
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config.settings import settings
from config.supabase_client import get_supabase_client

logger = logging.getLogger("medireport.auth")

# FastAPI security scheme for Bearer token
_bearer_scheme = HTTPBearer(auto_error=False)


# ── Token Extraction ─────────────────────────────────────
def _extract_token(credentials: HTTPAuthorizationCredentials | None) -> str:
    """
    Extract raw JWT from HTTP Authorization header.
    
    Args:
        credentials: FastAPI HTTPAuthorizationCredentials
        
    Returns:
        Raw JWT string
        
    Raises:
        HTTPException 401: If credentials missing or not Bearer token
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please include a Bearer token in the Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Expected Bearer token, got {credentials.scheme}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    if not token or len(token) < 20:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token format.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return token


# ── JWT Local Decode ──────────────────────────────────────
def _decode_jwt(token: str) -> dict:
    """
    Fast-fail on locally-detectable token expiry.
    Does NOT validate signature — just checks exp claim for speed.
    
    Args:
        token: JWT string
        
    Returns:
        Decoded payload dict
        
    Raises:
        HTTPException 401: If token expired or malformed
    """
    try:
        # JWT format: header.payload.signature
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Invalid JWT format")
        
        # Decode payload (base64url)
        payload_b64 = parts[1]
        # Add padding if needed
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding
        
        payload = base64.urlsafe_b64decode(payload_b64)
        decoded = json.loads(payload.decode("utf-8"))
        
        # Check expiry
        exp = decoded.get("exp")
        if exp and isinstance(exp, (int, float)):
            now = time.time()
            if now > exp:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Your session has expired. Please log in again.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        
        return decoded
        
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token format.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token format.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ── Supabase Auth Verification ────────────────────────────
async def _verify_with_supabase(token: str) -> dict:
    """
    Authoritative token validation via Supabase Auth API.
    
    Args:
        token: JWT string
        
    Returns:
        Supabase user dict with id, email, metadata
        
    Raises:
        HTTPException 401: If token invalid or user not found
    """
    try:
        supabase = get_supabase_client()
        
        # Call Supabase auth.get_user() with token
        response = supabase.auth.get_user(token)
        
        if not response or not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        user = response.user
        
        return {
            "id": str(user.id),
            "email": user.email or "",
            "app_metadata": dict(user.app_metadata or {}),
            "user_metadata": dict(user.user_metadata or {}),
        }
        
    except HTTPException:
        raise  # Re-raise our own 401s
        
    except Exception as exc:
        logger.error(
            "Supabase auth verification failed: %s",
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not verify your credentials. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── Profile Fetch ───────────────────────────────────────
async def _fetch_user_profile(user_id: str) -> dict:
    """
    Fetch user role and profile from public.profiles table.
    
    Args:
        user_id: Supabase user UUID
        
    Returns:
        Profile dict with role, full_name, preferred_language, hospital_id
        Returns defaults if profile not found (new user in progress)
    """
    supabase = get_supabase_client()
    
    try:
        result = (
            supabase.table("profiles")
            .select("role, full_name, preferred_language, hospital_id")
            .eq("id", user_id)
            .single()
            .execute()
        )
        
        if result.data:
            logger.debug("Profile fetched for user %s", user_id)
            return result.data
            
    except Exception as exc:
        # Profile might not exist yet (trigger might be delayed)
        logger.warning("Could not fetch profile for user %s: %s", user_id, exc)
    
    # Return safe defaults
    return {
        "role": "patient",
        "full_name": None,
        "preferred_language": "ur",
        "hospital_id": None,
    }


# ── Public Dependency: get_current_user ───────────────────
async def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(_bearer_scheme),
    ],
) -> dict:
    """
    FastAPI dependency — validates Bearer JWT and returns authenticated user.
    
    Returns:
        User dict with id, email, role, full_name, preferred_language, etc.
        
    Raises:
        HTTPException 401: If token missing, expired, or invalid.
    """
    # Step 1: Extract raw token from header
    token = _extract_token(credentials)
    
    # Step 2: Fast-fail on locally-detectable expiry
    _decode_jwt(token)
    
    # Step 3: Authoritative validation via Supabase API
    supabase_user = await _verify_with_supabase(token)
    
    # Step 4: Enrich with profile data (role, language preference)
    profile = await _fetch_user_profile(supabase_user["id"])
    
    logger.debug(
        "Authenticated user: id=%s role=%s",
        supabase_user["id"],
        profile.get("role", "patient"),
    )
    
    return {
        **supabase_user,
        "role": profile.get("role", "patient"),
        "full_name": profile.get("full_name"),
        "preferred_language": profile.get("preferred_language", "ur"),
        "hospital_id": profile.get("hospital_id"),
    }


# ── Role Guard Dependencies ─────────────────────────────
async def require_doctor(
    user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """
    Dependency that requires doctor or hospital_admin role.
    
    Args:
        user: Current user from get_current_user
        
    Returns:
        User dict if authorized
        
    Raises:
        HTTPException 403: If user not doctor or hospital_admin
    """
    if user["role"] not in ("doctor", "hospital_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint requires a Doctor or Hospital Administrator account.",
        )
    return user


async def require_hospital_admin(
    user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """
    Dependency that requires hospital_admin role.
    
    Args:
        user: Current user from get_current_user
        
    Returns:
        User dict if authorized
        
    Raises:
        HTTPException 403: If user not hospital_admin
    """
    if user["role"] != "hospital_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint requires a Hospital Administrator account.",
        )
    return user


# ── Type Aliases for FastAPI ─────────────────────────────
CurrentUser = Annotated[dict, Depends(get_current_user)]
DoctorUser = Annotated[dict, Depends(require_doctor)]
HospitalAdminUser = Annotated[dict, Depends(require_hospital_admin)]


__all__ = [
    "get_current_user",
    "require_doctor",
    "require_hospital_admin",
    "CurrentUser",
    "DoctorUser",
    "HospitalAdminUser",
]
