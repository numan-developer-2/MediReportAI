# ============================================================
# MediReport AI — Plan Limit Middleware (REWRITTEN)
# File: backend/middleware/plan_middleware.py
#
# Checks user subscription and monthly report usage.
# Key improvements:
#   - Uses centralized Supabase client
#   - Better error handling with logging
#   - Atomic report counting from database
#   - Clear upgrade messages per plan
#   - Graceful fallback to free tier on errors
# ============================================================

import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, status

from config.settings import settings
from config.supabase_client import get_supabase_client
from middleware.auth_middleware import CurrentUser, get_current_user

logger = logging.getLogger("medireport.plan")


# ── Plan Definitions ──────────────────────────────────────
# Maps plan name → monthly report limit (-1 = unlimited)
# Always read from settings for development flexibility
PLAN_LIMITS: dict[str, int] = {
    "free": 100,  # Hardcoded for development - unlimited effectively
    "pro": 100,
    "enterprise": -1,  # -1 = unlimited
}

PLAN_UPGRADE_MESSAGES: dict[str, str] = {
    "free": (
        "You have reached your free plan limit of {limit} reports/month. "
        "Upgrade to Pro (PKR 1,500/month) for 30 reports."
    ),
    "pro": (
        "You have reached your Pro plan limit of {limit} reports/month. "
        "Upgrade to Enterprise for unlimited reports."
    ),
    "enterprise": "Unlimited plan — this should never trigger.",
}


# ── Subscription Fetch ────────────────────────────────────
async def _get_subscription(user_id: str) -> dict:
    """
    Fetch user's subscription row from Supabase.
    
    Args:
        user_id: Supabase user UUID
        
    Returns:
        Subscription dict with plan, reports_used, reports_limit
        Returns free tier defaults if subscription not found
    """
    supabase = get_supabase_client()
    
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
        logger.error(
            "Failed to fetch subscription for user %s: %s",
            user_id, exc, exc_info=True,
        )
    
    # Subscription row missing (e.g., trigger delay on new signup)
    # Default to free tier as a safe fallback
    logger.warning("No subscription found for user %s — defaulting to free tier", user_id)
    return {
        "plan": "free",
        "reports_used": 0,
        "reports_limit": PLAN_LIMITS["free"],
        "current_period_end": None,
    }


# ── Report Counting ───────────────────────────────────────
async def _count_reports_this_month(user_id: str) -> int:
    """
    Count how many reports the user has submitted in the current calendar month.
    Uses the reports table directly — source of truth for actual usage.
    
    Args:
        user_id: Supabase user UUID
        
    Returns:
        Integer count of reports this month
        Returns 0 on database error to avoid blocking users
    """
    supabase = get_supabase_client()
    
    # Build start-of-month timestamp in UTC
    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    month_start_iso = month_start.isoformat()
    
    try:
        result = (
            supabase.table("reports")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .gte("created_at", month_start_iso)
            .execute()
        )
        count = result.count or 0
        logger.debug("User %s has %d reports this month", user_id, count)
        return count
        
    except Exception as exc:
        logger.error(
            "Failed to count reports for user %s: %s",
            user_id, exc, exc_info=True,
        )
        # On DB error, fail open (allow the request) to avoid blocking users
        return 0


# ── Plan Evaluation ───────────────────────────────────────
async def _evaluate_plan_limit(user_id: str) -> dict:
    """
    Core business logic: evaluate whether user can submit another report.
    
    Args:
        user_id: Supabase user UUID
        
    Returns:
        Dict with:
        - allowed: bool — can user submit report
        - plan: str — plan name
        - current: int — reports used this month
        - limit: int — plan limit (-1 = unlimited)
        - remaining: int — reports left (-1 = unlimited)
    """
    subscription = await _get_subscription(user_id)
    plan = subscription.get("plan", "free")
    
    # Always use fresh settings values (not cached)
    plan_limit = {
        "free": settings.free_plan_limit,
        "pro": settings.pro_plan_limit,
        "enterprise": settings.enterprise_plan_limit,
    }.get(plan, settings.free_plan_limit)
    
    # Enterprise / unlimited plan
    if plan_limit == -1:
        return {
            "allowed": True,
            "plan": plan,
            "current": subscription.get("reports_used", 0),
            "limit": -1,
            "remaining": -1,
        }
    
    # Count actual reports this month (more reliable than cached reports_used)
    current_count = await _count_reports_this_month(user_id)
    
    allowed = current_count < plan_limit
    remaining = max(0, plan_limit - current_count)
    
    return {
        "allowed": allowed,
        "plan": plan,
        "current": current_count,
        "limit": plan_limit,
        "remaining": remaining,
    }


# ── FastAPI Dependency: Enforce Plan Limit ──────────────
async def check_plan_limit(
    user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """
    FastAPI dependency — enforces monthly report limits based on subscription plan.
    
    Attach to any endpoint that consumes a report credit:
        @router.post("/upload")
        async def upload(
            user: CurrentUser,
            plan: dict = Depends(check_plan_limit),
        ):
            # plan["remaining"] tells you how many reports are left
    
    Returns:
        Plan status dict (passed to route handler as extra context).
        
    Raises:
        HTTPException 403: if monthly limit is exceeded.
    """
    user_id = user["id"]
    
    # DEVELOPER MODE: Specific user gets unlimited access
    # Add your user ID here for unlimited reports
    DEVELOPER_USER_IDS = [
        "e2fcf7de-f8a5-4948-aef3-b1c3258c8221",  # Your user ID
    ]
    
    if user_id in DEVELOPER_USER_IDS:
        logger.info("Developer unlimited access granted for user %s", user_id)
        return {
            "allowed": True,
            "plan": "enterprise",
            "current": 0,
            "limit": -1,
            "remaining": -1,
        }
    
    # Normal plan check for all other users
    plan_status = await _evaluate_plan_limit(user_id)
    
    if not plan_status["allowed"]:
        plan = plan_status["plan"]
        limit = plan_status["limit"]
        current = plan_status["current"]
        
        upgrade_msg = PLAN_UPGRADE_MESSAGES.get(
            plan, "Please upgrade your plan."
        ).format(limit=limit)
        
        logger.warning(
            "Plan limit exceeded for user %s: plan=%s, current=%d, limit=%d",
            user_id, plan, current, limit,
        )
        
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "limit_exceeded",
                "message": upgrade_msg,
                "current": current,
                "limit": limit,
                "plan": plan,
                "upgrade_url": f"{settings.frontend_url}/billing",
            },
        )
    
    logger.debug(
        "Plan check passed for user %s: plan=%s, %d/%s used",
        user_id,
        plan_status["plan"],
        plan_status["current"],
        str(plan_status["limit"]) if plan_status["limit"] != -1 else "∞",
    )
    
    return plan_status


# ── Non-blocking Usage Info ───────────────────────────────
async def get_plan_usage(
    user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """
    FastAPI dependency — returns plan usage info WITHOUT blocking the request.
    
    Use on GET endpoints (e.g., dashboard) where you want to show usage stats
    but should not block the user.
    
    Returns same shape as check_plan_limit but always allows through.
    """
    user_id = user["id"]
    return await _evaluate_plan_limit(user_id)


# ── Type Aliases ──────────────────────────────────────────
PlanCheck = Annotated[dict, Depends(check_plan_limit)]
PlanUsage = Annotated[dict, Depends(get_plan_usage)]


__all__ = [
    "check_plan_limit",
    "get_plan_usage",
    "PlanCheck",
    "PlanUsage",
    "PLAN_LIMITS",
]
