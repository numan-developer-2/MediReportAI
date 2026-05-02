# ============================================================
# MediReport AI — Billing Router
# File: backend/routers/billing.py
#
# Endpoints:
#   GET   /api/billing/plans      — Static plan data
#   POST  /api/billing/subscribe  — Stripe checkout session
#   POST  /api/billing/webhook    — Stripe webhook handler
#   GET   /api/billing/usage      — Current plan usage
# ============================================================

import logging
from calendar import monthrange
from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from supabase import Client, create_client

from config.settings import settings
from config.supabase_client import get_supabase_client
from middleware.auth_middleware import CurrentUser, get_current_user

logger = logging.getLogger("medireport.billing")

router = APIRouter()

# ── Stripe Init ───────────────────────────────────────────
stripe.api_key = settings.stripe_secret_key

# ── Supabase Client ─────────────────────────────────────
# Use centralized client from config.supabase_client

def _get_supabase() -> Client:
    """Get singleton Supabase client from centralized module."""
    return get_supabase_client()


# ── Plan Definitions ──────────────────────────────────────
# Source of truth for plan metadata — used by /plans endpoint

PLANS_DATA: list[dict] = [
    {
        "id":             "free",
        "name":           "Free",
        "name_ur":        "مفت",
        "price_pkr":      0,
        "price_usd":      0,
        "reports_limit":  settings.free_plan_limit,   # 3
        "stripe_price_id": None,
        "features": [
            "3 reports/month",
            "Urdu + English output",
            "Basic AI explanation",
            "Abnormal value detection",
        ],
        "features_ur": [
            "3 رپورٹس فی مہینہ",
            "اردو + انگریزی",
            "بنیادی وضاحت",
            "غیر معمولی قدریں",
        ],
        "popular": False,
        "cta": "Get Started Free",
    },
    {
        "id":             "pro",
        "name":           "Pro",
        "name_ur":        "پرو",
        "price_pkr":      1500,
        "price_usd":      5,
        "reports_limit":  settings.pro_plan_limit,    # 30
        "stripe_price_id": None,   # Will be set from ENV after Stripe product creation
        "features": [
            "30 reports/month",
            "PDF export",
            "All 6 languages",
            "Abnormal flags with highlights",
            "Full report history",
            "Doctor review request",
        ],
        "features_ur": [
            "30 رپورٹس فی مہینہ",
            "پی ڈی ایف ایکسپورٹ",
            "تمام 6 زبانیں",
            "غیر معمولی جھنڈے",
            "مکمل تاریخ",
            "ڈاکٹر جائزہ",
        ],
        "popular": True,
        "cta": "Upgrade to Pro",
    },
    {
        "id":             "enterprise",
        "name":           "Enterprise",
        "name_ur":        "انٹرپرائز",
        "price_pkr":      15000,
        "price_usd":      50,
        "reports_limit":  -1,   # Unlimited
        "stripe_price_id": None,
        "features": [
            "Unlimited reports",
            "White-label API access",
            "Team / staff accounts",
            "Analytics dashboard",
            "Priority email support",
            "Custom branding & subdomain",
            "Bulk upload (hospitals)",
        ],
        "features_ur": [
            "لامحدود رپورٹس",
            "وائٹ لیبل API",
            "ٹیم اکاؤنٹس",
            "تجزیاتی ڈیش بورڈ",
            "ترجیحی سپورٹ",
            "کسٹم برانڈنگ",
            "بلک اپ لوڈ",
        ],
        "popular": False,
        "cta": "Contact Sales",
    },
]

# Map plan_id → plan config for quick lookup
PLAN_MAP: dict[str, dict] = {p["id"]: p for p in PLANS_DATA}


# ── Pydantic Schemas ──────────────────────────────────────

class SubscribeRequest(BaseModel):
    plan_id: str = Field(..., description="Plan ID: 'pro' or 'enterprise'")

    def validate_plan(self) -> None:
        if self.plan_id not in PLAN_MAP:
            valid = ", ".join(PLAN_MAP.keys())
            raise ValueError(f"Invalid plan_id: '{self.plan_id}'. Valid: {valid}")
        if self.plan_id == "free":
            raise ValueError("Cannot subscribe to free plan via Stripe. Free plan is default.")


class PlansResponse(BaseModel):
    plans: list[dict]


class SubscribeResponse(BaseModel):
    checkout_url: str
    session_id: str


class UsageResponse(BaseModel):
    plan: str
    reports_used: int
    reports_limit: int
    percentage_used: float
    remaining: int
    reset_date: str   # ISO date — first day of next month


class WebhookResponse(BaseModel):
    received: bool


# ── Helpers ───────────────────────────────────────────────

def _get_reset_date() -> str:
    """
    Return ISO date string for first day of next month (subscription reset date).
    """
    now = datetime.now(timezone.utc)
    if now.month == 12:
        reset = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        reset = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    return reset.date().isoformat()


def _calculate_percentage(used: int, limit: int) -> float:
    """Calculate usage percentage. Returns 0.0 for unlimited plans."""
    if limit == -1 or limit == 0:
        return 0.0
    return round(min((used / limit) * 100, 100.0), 1)


async def _get_or_create_stripe_customer(user_id: str, email: str) -> str:
    """
    Get existing Stripe customer ID from subscriptions table,
    or create a new Stripe customer and save it.

    Returns:
        Stripe customer ID string.
    """
    supabase = _get_supabase()

    # Check if customer ID already exists
    try:
        result = (
            supabase.table("subscriptions")
            .select("stripe_customer_id")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        if result.data and result.data.get("stripe_customer_id"):
            return result.data["stripe_customer_id"]
    except Exception as exc:
        logger.warning("Could not fetch stripe_customer_id for %s: %s", user_id, str(exc))

    # Create new Stripe customer
    try:
        customer = stripe.Customer.create(
            email=email,
            metadata={
                "supabase_user_id": user_id,
                "platform":         "medireport-ai",
            },
        )
        customer_id = customer.id

        # Save to subscriptions table
        supabase.table("subscriptions").update(
            {"stripe_customer_id": customer_id}
        ).eq("user_id", user_id).execute()

        logger.info("Created Stripe customer %s for user %s", customer_id, user_id)
        return customer_id

    except stripe.StripeError as exc:
        logger.error("Stripe customer creation failed for %s: %s", user_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to initialize payment session. Please try again.",
        )


def _update_subscription_from_stripe(
    stripe_customer_id: str,
    plan_id: str,
    stripe_subscription_id: str,
    current_period_end: Optional[int],
) -> None:
    """
    Update subscriptions table after successful Stripe payment.
    """
    supabase = _get_supabase()
    plan_config = PLAN_MAP.get(plan_id, PLAN_MAP["free"])

    updates: dict = {
        "plan":                    plan_id,
        "reports_limit":           plan_config["reports_limit"],
        "stripe_subscription_id":  stripe_subscription_id,
    }

    if current_period_end:
        period_end_dt = datetime.fromtimestamp(current_period_end, tz=timezone.utc)
        updates["current_period_end"] = period_end_dt.isoformat()

    try:
        supabase.table("subscriptions").update(updates).eq(
            "stripe_customer_id", stripe_customer_id
        ).execute()
        logger.info(
            "Subscription updated: customer=%s plan=%s", stripe_customer_id, plan_id
        )
    except Exception as exc:
        logger.error(
            "Failed to update subscription for customer %s: %s",
            stripe_customer_id, str(exc), exc_info=True,
        )


def _downgrade_to_free(stripe_customer_id: str) -> None:
    """Downgrade subscription to free tier on cancellation."""
    supabase = _get_supabase()
    try:
        supabase.table("subscriptions").update({
            "plan":                   "free",
            "reports_limit":          settings.free_plan_limit,
            "stripe_subscription_id": None,
            "current_period_end":     None,
        }).eq("stripe_customer_id", stripe_customer_id).execute()
        logger.info("Subscription downgraded to free: customer=%s", stripe_customer_id)
    except Exception as exc:
        logger.error(
            "Failed to downgrade subscription for customer %s: %s",
            stripe_customer_id, str(exc), exc_info=True,
        )


# ── ENDPOINT 1: Plans ─────────────────────────────────────

@router.get(
    "/plans",
    response_model=PlansResponse,
    status_code=status.HTTP_200_OK,
    summary="Get available subscription plans",
    description="Returns all plan tiers with pricing, features, and limits. No auth required.",
)
async def get_plans() -> PlansResponse:
    """
    Returns static plan definitions.
    No auth required — used on public landing/billing pages.
    """
    # Return plans without sensitive internal fields
    public_plans = []
    for plan in PLANS_DATA:
        public_plans.append({
            "id":            plan["id"],
            "name":          plan["name"],
            "name_ur":       plan["name_ur"],
            "price_pkr":     plan["price_pkr"],
            "price_usd":     plan["price_usd"],
            "reports_limit": plan["reports_limit"],
            "features":      plan["features"],
            "features_ur":   plan["features_ur"],
            "popular":       plan["popular"],
            "cta":           plan["cta"],
        })

    return PlansResponse(plans=public_plans)


# ── ENDPOINT 2: Subscribe (Stripe Checkout) ───────────────

@router.post(
    "/subscribe",
    response_model=SubscribeResponse,
    status_code=status.HTTP_200_OK,
    summary="Create Stripe checkout session",
    description="Initiates Stripe checkout for Pro or Enterprise plan. Redirects user to Stripe.",
)
async def subscribe(
    body: SubscribeRequest,
    user: CurrentUser,
) -> SubscribeResponse:
    """
    Create a Stripe Checkout Session for upgrading subscription.

    Returns a checkout_url that the frontend redirects the user to.
    After payment, Stripe calls /webhook to update the subscription.
    """
    # Validate plan
    try:
        body.validate_plan()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment system is not configured. Please contact support.",
        )

    user_id = user["id"]
    user_email = user.get("email", "")
    plan = PLAN_MAP[body.plan_id]

    logger.info("Checkout requested: user=%s plan=%s", user_id, body.plan_id)

    # Get or create Stripe customer
    customer_id = await _get_or_create_stripe_customer(user_id, user_email)

    # Build line items — use price_data for dynamic pricing (no pre-created Stripe Price needed)
    line_items = [
        {
            "price_data": {
                "currency":     "usd",
                "unit_amount":  plan["price_usd"] * 100,   # cents
                "recurring":    {"interval": "month"},
                "product_data": {
                    "name":        f"MediReport AI — {plan['name']} Plan",
                    "description": ", ".join(plan["features"][:3]),
                    "metadata":    {"plan_id": body.plan_id},
                },
            },
            "quantity": 1,
        }
    ]

    try:
        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card"],
            line_items=line_items,
            mode="subscription",
            success_url=(
                f"{settings.frontend_url}/billing/success"
                f"?session_id={{CHECKOUT_SESSION_ID}}&plan={body.plan_id}"
            ),
            cancel_url=f"{settings.frontend_url}/billing?cancelled=true",
            metadata={
                "user_id": user_id,
                "plan_id": body.plan_id,
            },
            subscription_data={
                "metadata": {
                    "user_id": user_id,
                    "plan_id": body.plan_id,
                }
            },
        )

        logger.info(
            "Stripe checkout session created: %s for user=%s plan=%s",
            session.id, user_id, body.plan_id,
        )

        return SubscribeResponse(
            checkout_url=session.url,
            session_id=session.id,
        )

    except stripe.StripeError as exc:
        logger.error("Stripe checkout error for user %s: %s", user_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Payment session creation failed: {str(exc)}",
        )


# ── ENDPOINT 3: Webhook ───────────────────────────────────

@router.post(
    "/webhook",
    response_model=WebhookResponse,
    status_code=status.HTTP_200_OK,
    summary="Stripe webhook handler",
    description="Receives Stripe events. Verifies signature. Updates subscription on payment.",
)
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(
        ...,
        alias="stripe-signature",
        description="Stripe webhook signature header",
    ),
) -> WebhookResponse:
    """
    Handle incoming Stripe webhook events.

    Supported events:
    - checkout.session.completed          → activate subscription
    - invoice.payment_succeeded           → renew subscription
    - customer.subscription.deleted       → downgrade to free
    - customer.subscription.updated       → plan change
    """
    if not settings.stripe_webhook_secret:
        logger.error("STRIPE_WEBHOOK_SECRET not configured")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook not configured.",
        )

    # Read raw body (must be bytes for signature verification)
    try:
        payload = await request.body()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read request body: {str(exc)}",
        )

    # Verify Stripe signature
    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=stripe_signature,
            secret=settings.stripe_webhook_secret,
        )
    except stripe.SignatureVerificationError:
        logger.warning("Stripe webhook signature verification failed")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook signature.",
        )
    except Exception as exc:
        logger.error("Webhook construction error: %s", str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Webhook error: {str(exc)}",
        )

    event_type = event["type"]
    event_data = event["data"]["object"]

    logger.info("Stripe webhook received: %s", event_type)

    # ── Event Handlers ────────────────────────────────────

    if event_type == "checkout.session.completed":
        # User completed checkout — activate plan
        customer_id = event_data.get("customer")
        subscription_id = event_data.get("subscription")
        metadata = event_data.get("metadata", {})
        plan_id = metadata.get("plan_id", "pro")

        if customer_id and subscription_id:
            # Fetch subscription to get period_end
            try:
                sub = stripe.Subscription.retrieve(subscription_id)
                period_end = sub.get("current_period_end")
            except Exception:
                period_end = None

            _update_subscription_from_stripe(
                stripe_customer_id=customer_id,
                plan_id=plan_id,
                stripe_subscription_id=subscription_id,
                current_period_end=period_end,
            )
            logger.info(
                "Plan activated: customer=%s plan=%s", customer_id, plan_id
            )

    elif event_type == "invoice.payment_succeeded":
        # Monthly renewal — update period_end
        customer_id = event_data.get("customer")
        subscription_id = event_data.get("subscription")

        if customer_id and subscription_id:
            try:
                sub = stripe.Subscription.retrieve(subscription_id)
                plan_id = sub.get("metadata", {}).get("plan_id", "pro")
                period_end = sub.get("current_period_end")

                _update_subscription_from_stripe(
                    stripe_customer_id=customer_id,
                    plan_id=plan_id,
                    stripe_subscription_id=subscription_id,
                    current_period_end=period_end,
                )

                # Reset monthly usage counter on renewal
                _get_supabase().table("subscriptions").update(
                    {"reports_used": 0}
                ).eq("stripe_customer_id", customer_id).execute()

                logger.info(
                    "Subscription renewed + usage reset: customer=%s", customer_id
                )
            except Exception as exc:
                logger.error("Renewal processing error: %s", str(exc), exc_info=True)

    elif event_type == "customer.subscription.deleted":
        # Cancellation — downgrade to free
        customer_id = event_data.get("customer")
        if customer_id:
            _downgrade_to_free(customer_id)
            logger.info("Subscription cancelled → free: customer=%s", customer_id)

    elif event_type == "customer.subscription.updated":
        # Plan change (upgrade or downgrade via Stripe dashboard)
        customer_id = event_data.get("customer")
        subscription_id = event_data.get("id")
        metadata = event_data.get("metadata", {})
        plan_id = metadata.get("plan_id")
        period_end = event_data.get("current_period_end")

        if customer_id and plan_id:
            _update_subscription_from_stripe(
                stripe_customer_id=customer_id,
                plan_id=plan_id,
                stripe_subscription_id=subscription_id or "",
                current_period_end=period_end,
            )
            logger.info(
                "Subscription updated: customer=%s plan=%s", customer_id, plan_id
            )

    else:
        logger.debug("Unhandled Stripe event type: %s", event_type)

    return WebhookResponse(received=True)


# ── ENDPOINT 4: Usage ─────────────────────────────────────

@router.get(
    "/usage",
    response_model=UsageResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current plan usage",
    description="Returns how many reports the user has used this month and remaining quota.",
)
async def get_usage(user: CurrentUser) -> UsageResponse:
    """
    Return current subscription usage for the authenticated user.
    Used by frontend dashboard and billing page.
    """
    supabase = _get_supabase()
    user_id = user["id"]

    # Fetch subscription
    try:
        result = (
            supabase.table("subscriptions")
            .select("plan, reports_used, reports_limit, current_period_end")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        sub = result.data or {}
    except Exception as exc:
        logger.warning("Could not fetch subscription for usage: %s", str(exc))
        sub = {}

    plan = sub.get("plan", "free")
    reports_used = sub.get("reports_used", 0)
    reports_limit = sub.get("reports_limit", settings.free_plan_limit)
    period_end = sub.get("current_period_end")

    # Calculate remaining
    if reports_limit == -1:
        remaining = -1          # Unlimited
        percentage = 0.0
    else:
        remaining = max(0, reports_limit - reports_used)
        percentage = _calculate_percentage(reports_used, reports_limit)

    # Reset date: use Stripe period end, or fallback to next calendar month
    if period_end:
        try:
            reset_date = period_end[:10]   # Take YYYY-MM-DD part
        except Exception:
            reset_date = _get_reset_date()
    else:
        reset_date = _get_reset_date()

    logger.debug(
        "Usage for user %s: plan=%s used=%d/%s",
        user_id, plan, reports_used,
        str(reports_limit) if reports_limit != -1 else "∞",
    )

    return UsageResponse(
        plan=plan,
        reports_used=reports_used,
        reports_limit=reports_limit,
        percentage_used=percentage,
        remaining=remaining,
        reset_date=reset_date,
    )
