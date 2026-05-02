# ============================================================
# MediReport AI — Email Service (REWRITTEN)
# File: backend/services/email_service.py
#
# Uses Resend.com API (free tier: 3,000 emails/month)
# Key improvements:
#   - Proper Resend integration with retries
#   - Async HTTP calls with httpx
#   - Error handling with detailed logging
#   - Graceful fallback if email disabled
#   - Template-based emails
#   - Never crashes — logs and returns False on failure
# ============================================================

import logging
from typing import Optional

import httpx

from config.settings import settings

logger = logging.getLogger("medireport.email")


# ── Constants ────────────────────────────────────────────
_RESEND_API_BASE = "https://api.resend.com"
_MAX_RETRIES = 2
_RETRY_DELAY = 1.0


# ── Templates ─────────────────────────────────────────────
_REPORT_READY_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #0ea5e9, #6366f1); color: white; padding: 30px; text-align: center; border-radius: 8px; }}
        .content {{ background: #f8fafc; padding: 30px; border-radius: 8px; margin-top: 20px; }}
        .button {{ display: inline-block; background: #0ea5e9; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
        .footer {{ text-align: center; color: #94a3b8; font-size: 12px; margin-top: 30px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🩺 Your Lab Report is Ready!</h1>
        </div>
        <div class="content">
            <p>Hi {user_name},</p>
            <p>Good news! We've successfully analyzed your lab report. Your results are now available in your MediReport AI dashboard.</p>
            <p><strong>Report ID:</strong> {report_id_short}</p>
            <p>You can download your PDF report, view detailed explanations in multiple languages, and share with your doctor.</p>
            <a href="{dashboard_url}" class="button">View Your Report</a>
        </div>
        <div class="footer">
            <p>MediReport AI — Making lab reports understandable</p>
            <p><small>This is an automated message. Please do not reply.</small></p>
        </div>
    </div>
</body>
</html>"""

_WELCOME_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #0ea5e9, #6366f1); color: white; padding: 30px; text-align: center; border-radius: 8px; }}
        .content {{ background: #f8fafc; padding: 30px; border-radius: 8px; margin-top: 20px; }}
        .button {{ display: inline-block; background: #0ea5e9; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
        .features {{ margin-top: 20px; }}
        .feature {{ margin: 10px 0; }}
        .footer {{ text-align: center; color: #94a3b8; font-size: 12px; margin-top: 30px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to MediReport AI! 🩺</h1>
        </div>
        <div class="content">
            <p>Hi {user_name},</p>
            <p>Welcome to MediReport AI! We're excited to help you understand your lab reports in simple, clear language.</p>
            
            <div class="features">
                <p><strong>What you can do with your free account:</strong></p>
                <div class="feature">✅ Upload lab reports (JPG, PNG, PDF)</div>
                <div class="feature">✅ Get AI explanations in English, Urdu, Hindi, Arabic & Bangla</div>
                <div class="feature">✅ Download professional PDF reports</div>
                <div class="feature">✅ {free_limit} free reports per month</div>
            </div>
            
            <a href="{dashboard_url}" class="button">Go to Dashboard</a>
        </div>
        <div class="footer">
            <p>MediReport AI — Making lab reports understandable</p>
            <p><small>Need help? Contact us at support@medireport.ai</small></p>
        </div>
    </div>
</body>
</html>"""

_PLAN_LIMIT_WARNING_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: #f97316; color: white; padding: 30px; text-align: center; border-radius: 8px; }}
        .content {{ background: #f8fafc; padding: 30px; border-radius: 8px; margin-top: 20px; }}
        .button {{ display: inline-block; background: #0ea5e9; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
        .usage {{ background: #fff; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #f97316; }}
        .footer {{ text-align: center; color: #94a3b8; font-size: 12px; margin-top: 30px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚠️ Report Limit Warning</h1>
        </div>
        <div class="content">
            <p>Hi {user_name},</p>
            <p>This is a friendly reminder that you're approaching your monthly report limit.</p>
            
            <div class="usage">
                <p><strong>Current Plan:</strong> {plan_name}</p>
                <p><strong>Reports Used:</strong> {reports_used} / {reports_limit}</p>
                <p><strong>Remaining:</strong> {reports_remaining}</p>
            </div>
            
            <p>Upgrade now to unlock unlimited reports and premium features!</p>
            
            <a href="{billing_url}" class="button">Upgrade Now</a>
        </div>
        <div class="footer">
            <p>MediReport AI</p>
            <p><small>Want to change notification settings? Visit your account settings.</small></p>
        </div>
    </div>
</body>
</html>"""


# ── Private Helper ───────────────────────────────────────
async def _send_email_with_retry(
    to_email: str,
    subject: str,
    html_content: str,
    from_email: str | None = None,
    from_name: str | None = None,
) -> bool:
    """
    Send email via Resend API with retry logic.
    
    Args:
        to_email: Recipient email
        subject: Email subject
        html_content: HTML body
        from_email: Sender email (defaults to settings)
        from_name: Sender name (defaults to settings)
        
    Returns:
        True if sent successfully, False otherwise
    """
    # Check if email is enabled
    if not settings.enable_email_notifications:
        logger.info("Email notifications disabled — skipping send to %s", to_email)
        return False
    
    if not settings.resend_enabled:
        logger.warning("Resend not configured — cannot send email to %s", to_email)
        return False
    
    sender = from_email or settings.email_from
    sender_name = from_name or settings.email_from_name
    
    payload = {
        "from": f"{sender_name} <{sender}>",
        "to": [to_email],
        "subject": subject,
        "html": html_content,
    }
    
    headers = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        "Content-Type": "application/json",
    }
    
    # Retry logic
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            logger.info("Sending email | to=%s subject=%s attempt=%d", to_email, subject, attempt)
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{_RESEND_API_BASE}/emails",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
            
            data = response.json()
            email_id = data.get("id", "unknown")
            
            logger.info(
                "Email sent successfully | to=%s id=%s attempt=%d",
                to_email, email_id, attempt,
            )
            return True
            
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            error_text = exc.response.text[:200]
            
            if status == 429:  # Rate limit
                logger.warning("Resend rate limit hit | attempt=%d", attempt)
                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(_RETRY_DELAY * 2 ** attempt)
                    continue
            elif status == 422:
                logger.error(
                    "Resend validation error | to=%s error=%s",
                    to_email, error_text,
                )
                return False
            else:
                logger.error(
                    "Resend HTTP error | to=%s status=%d error=%s attempt=%d",
                    to_email, status, error_text, attempt,
                )
                
        except httpx.TimeoutException:
            logger.warning("Resend timeout | to=%s attempt=%d", to_email, attempt)
            if attempt < _MAX_RETRIES:
                await asyncio.sleep(_RETRY_DELAY)
                continue
                
        except Exception as exc:
            logger.error(
                "Resend error | to=%s error=%s attempt=%d",
                to_email, exc, attempt,
            )
    
    logger.error("Failed to send email after %d retries | to=%s", _MAX_RETRIES, to_email)
    return False


# ── Public API ───────────────────────────────────────────

class EmailService:
    """Sends transactional emails via Resend.com."""
    
    def __init__(self):
        self.enabled = settings.enable_email_notifications and settings.resend_enabled
        if self.enabled:
            logger.info("Email service initialized (Resend)")
        else:
            logger.info("Email service initialized (disabled)")
    
    async def send_report_ready(
        self,
        to_email: str,
        report_id: str,
        user_name: str,
    ) -> bool:
        """
        Notify user that their report is ready.
        
        Args:
            to_email: Recipient email
            report_id: Full report ID
            user_name: User's display name
            
        Returns:
            True if sent successfully
        """
        report_id_short = report_id[:8] if len(report_id) >= 8 else report_id
        
        html = _REPORT_READY_TEMPLATE.format(
            user_name=_escape_html(user_name),
            report_id_short=report_id_short,
            dashboard_url=f"{settings.frontend_url}/result/{report_id}",
        )
        
        return await _send_email_with_retry(
            to_email=to_email,
            subject="Your Lab Report is Ready — MediReport AI",
            html_content=html,
        )
    
    async def send_welcome(
        self,
        to_email: str,
        user_name: str,
    ) -> bool:
        """
        Send welcome email to new users.
        
        Args:
            to_email: Recipient email
            user_name: User's display name
            
        Returns:
            True if sent successfully
        """
        html = _WELCOME_TEMPLATE.format(
            user_name=_escape_html(user_name),
            dashboard_url=f"{settings.frontend_url}/dashboard",
            free_limit=settings.free_plan_limit,
        )
        
        return await _send_email_with_retry(
            to_email=to_email,
            subject="Welcome to MediReport AI! 🩺",
            html_content=html,
        )
    
    async def send_plan_limit_warning(
        self,
        to_email: str,
        user_name: str,
        plan: str,
        reports_used: int,
        reports_limit: int,
    ) -> bool:
        """
        Warn user they are near their monthly limit.
        
        Args:
            to_email: Recipient email
            user_name: User's display name
            plan: Plan name (free, pro, enterprise)
            reports_used: Number of reports used
            reports_limit: Monthly limit
            
        Returns:
            True if sent successfully
        """
        remaining = max(0, reports_limit - reports_used)
        
        plan_display = {
            "free": "Free Plan",
            "pro": "Pro Plan",
            "enterprise": "Enterprise Plan",
        }.get(plan, plan.title())
        
        html = _PLAN_LIMIT_WARNING_TEMPLATE.format(
            user_name=_escape_html(user_name),
            plan_name=plan_display,
            reports_used=reports_used,
            reports_limit=reports_limit if reports_limit > 0 else "Unlimited",
            reports_remaining="Unlimited" if reports_limit < 0 else remaining,
            billing_url=f"{settings.frontend_url}/billing",
        )
        
        return await _send_email_with_retry(
            to_email=to_email,
            subject="You're Approaching Your Report Limit — MediReport AI",
            html_content=html,
        )


def _escape_html(text: str) -> str:
    """Escape HTML special characters."""
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#x27;"))


# ── Singleton Instance ─────────────────────────────────
email_service = EmailService()


__all__ = ["email_service", "EmailService"]
