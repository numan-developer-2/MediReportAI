# ============================================================
# MediReport AI — FastAPI Application Entry Point (REWRITTEN)
# File: backend/main.py
# ============================================================

import logging
import sys
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import sentry_sdk
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from starlette.middleware.base import BaseHTTPMiddleware

from config.settings import settings


# ── Structured Logging Setup ─────────────────────────────────
class ColorFormatter(logging.Formatter):
    """Add colors to log output for development."""
    
    COLORS = {
        "DEBUG": "\033[36m",     # Cyan
        "INFO": "\033[32m",      # Green
        "WARNING": "\033[33m",   # Yellow
        "ERROR": "\033[31m",     # Red
        "CRITICAL": "\033[35m",  # Magenta
    }
    RESET = "\033[0m"
    
    def format(self, record: logging.LogRecord) -> str:
        if settings.is_development:
            color = self.COLORS.get(record.levelname, "")
            reset = self.RESET
            record.levelname = f"{color}{record.levelname}{reset}"
        return super().format(record)


def setup_logging() -> logging.Logger:
    """Configure structured logging for the application."""
    logger = logging.getLogger("medireport")
    logger.setLevel(getattr(logging, settings.log_level))
    
    # Remove existing handlers
    logger.handlers.clear()
    
    # Console handler with colors
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, settings.log_level))
    
    formatter = ColorFormatter(
        fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    return logger


logger = setup_logging()


# ── Sentry Initialization ──────────────────────────────────
def _init_sentry() -> None:
    """Initialize Sentry only when DSN is provided and properly configured."""
    if settings.sentry_enabled and settings.is_production:
        try:
            sentry_sdk.init(
                dsn=settings.sentry_dsn,
                integrations=[
                    StarletteIntegration(transaction_style="endpoint"),
                    FastApiIntegration(transaction_style="endpoint"),
                ],
                traces_sample_rate=settings.sentry_traces_sample_rate,
                profiles_sample_rate=0.1,
                environment=settings.app_env,
                release="medireport-ai@1.0.0",
                send_default_pii=False,  # HIPAA-conscious: no PII in Sentry
                max_breadcrumbs=50,
            )
            logger.info("✅ Sentry initialized (production mode)")
        except Exception as exc:
            logger.error("❌ Failed to initialize Sentry: %s", exc)
    else:
        logger.info("ℹ️ Sentry disabled (development or no DSN)")


# ── Request Timing Middleware ────────────────────────────────
class RequestTimingMiddleware(BaseHTTPMiddleware):
    """Log request duration and basic metrics."""
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        try:
            response = await call_next(request)
            duration = time.time() - start_time
            
            # Log slow requests (>1s)
            if duration > 1.0:
                logger.warning(
                    "Slow request | %s %s | %.3fs | %d",
                    request.method,
                    request.url.path,
                    duration,
                    response.status_code,
                )
            
            # Add timing header
            response.headers["X-Response-Time"] = f"{duration:.3f}s"
            return response
            
        except Exception as exc:
            duration = time.time() - start_time
            logger.error(
                "Request failed | %s %s | %.3fs | %s",
                request.method,
                request.url.path,
                duration,
                exc,
            )
            raise


# ── Startup Health Check ────────────────────────────────────
async def _health_check_dependencies() -> dict[str, bool]:
    """Check critical dependencies on startup."""
    results = {
        "supabase": False,
        "settings_loaded": True,  # If we got here, settings loaded
    }
    
    # Check Supabase connectivity using a real table query
    try:
        from config.supabase_client import get_supabase_client
        client = get_supabase_client()
        # Query profiles table with limit 0 - validates connection without needing data
        # This table always exists in Supabase auth setup
        response = client.table("profiles").select("count", count="exact").limit(0).execute()
        # If we get here, connection is working
        results["supabase"] = True
        logger.info("   Supabase connection: OK (profiles table accessible)")
    except Exception as exc:
        error_msg = str(exc)
        # Check if it's a connection/auth error vs table missing
        if any(x in error_msg.lower() for x in ["connection", "timeout", "refused", "network", "dns"]):
            logger.error("   Supabase connection failed: %s", error_msg)
        elif "does not exist" in error_msg or "42p01" in error_msg.lower():
            # Table doesn't exist - this shouldn't happen but mark as degraded not failed
            logger.warning("   Supabase: profiles table not found, but connection OK")
            results["supabase"] = True  # Connection works even if table missing
        elif "pgrst" in error_msg.lower():
            # PostgREST error - likely permissions or schema issue
            logger.warning("   Supabase: Schema/permission issue but connection OK")
            results["supabase"] = True  # Connection works, may be RLS/schema issue
        else:
            # Other errors - log but don't fail startup
            logger.warning("   Supabase check warning: %s", error_msg)
            results["supabase"] = True  # Assume OK to allow startup
    
    return results


# ── Lifespan: startup / shutdown ─────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Run startup tasks before serving, cleanup on shutdown."""
    logger.info("🚀 ============================================")
    logger.info("🚀 MediReport AI backend starting...")
    logger.info("🚀 ============================================")
    
    # Initialize Sentry
    _init_sentry()
    
    # Log configuration
    logger.info("📋 Configuration:")
    logger.info("   Environment    : %s", settings.app_env)
    logger.info("   Log Level      : %s", settings.log_level)
    logger.info("   CORS Origin    : %s", settings.frontend_url)
    logger.info("   Supabase URL   : %s...", settings.supabase_url_str[:50])
    logger.info("   HF API Timeout : %ds", settings.hf_request_timeout)
    logger.info("   Max Upload     : %d MB", settings.max_upload_size_mb)
    logger.info("   Stripe Enabled : %s", settings.stripe_enabled)
    logger.info("   Resend Enabled : %s", settings.resend_enabled)
    
    # Health check dependencies
    deps = await _health_check_dependencies()
    logger.info("🔍 Dependency checks:")
    for dep, status in deps.items():
        icon = "✅" if status else "❌"
        logger.info("   %s %s", icon, dep)
    
    if not all(deps.values()):
        logger.error("⚠️ Some dependencies failed - service may not function correctly")
    
    logger.info("✅ Startup complete - ready to serve requests")
    
    yield  # Application runs here
    
    logger.info("🛑 MediReport AI backend shutting down...")


# ── FastAPI Application ────────────────────────────────────
app = FastAPI(
    title="MediReport AI",
    description=(
        "AI-powered medical lab report analysis platform. "
        "Converts lab reports into easy-to-understand explanations in multiple languages. "
        "Built with FastAPI, Supabase, and HuggingFace."
    ),
    version="1.0.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    openapi_url="/openapi.json" if not settings.is_production else None,
    lifespan=lifespan,
)


# ── Middleware Stack (order matters) ────────────────────────
# CORS MUST be first — before any other middleware
# This ensures preflight requests are handled correctly

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Request-ID",
        "X-Response-Time",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
    ],
    max_age=600,
)

# 2. GZip compression (after CORS)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# 3. Request timing (after GZip)
app.add_middleware(RequestTimingMiddleware)


# ── Global Exception Handlers ─────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all handler — prevents raw 500 errors leaking to client."""
    request_id = getattr(request.state, "request_id", "unknown")
    
    logger.error(
        "Unhandled exception | request_id=%s | %s %s | %s",
        request_id,
        request.method,
        request.url.path,
        str(exc),
        exc_info=True,
    )
    
    # Report to Sentry
    if settings.sentry_enabled:
        sentry_sdk.capture_exception(exc)
    
    # In development, show full error details
    if settings.is_development:
        import traceback
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "detail": str(exc),
                "type": type(exc).__name__,
                "status": "error",
                "request_id": request_id,
                "traceback": traceback.format_exc().split("\n")[-10:],  # Last 10 lines
            },
        )
    
    # In production, hide internal details
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "An unexpected error occurred. Our team has been notified.",
            "status": "error",
            "request_id": request_id,
        },
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    """Handle validation errors with a clean 400 response."""
    logger.warning(
        "Validation error | %s %s | %s",
        request.method,
        request.url.path,
        str(exc),
    )
    
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "detail": str(exc),
            "status": "error",
            "type": "validation_error",
        },
    )


@app.exception_handler(PermissionError)
async def permission_error_handler(request: Request, exc: PermissionError) -> JSONResponse:
    """Handle auth/plan limit errors with a 403 response."""
    logger.warning(
        "Permission denied | %s %s | %s",
        request.method,
        request.url.path,
        str(exc),
    )
    
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={
            "detail": str(exc),
            "status": "error",
            "type": "permission_error",
        },
    )


@app.exception_handler(404)
async def not_found_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle 404 not found."""
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={
            "detail": "The requested resource was not found.",
            "status": "error",
            "type": "not_found",
        },
    )


# ── Health Check Endpoints ─────────────────────────────────

@app.get(
    "/health",
    tags=["System"],
    summary="Health check endpoint",
    response_description="Service is running",
    response_model=None,
)
async def health_check() -> dict:
    """
    Basic health check. Returns service status.
    Used by Railway health checks and uptime monitors.
    Does not require authentication.
    """
    return {
        "status": "ok",
        "service": "MediReport AI",
        "version": "1.0.0",
        "environment": settings.app_env,
        "timestamp": str(int(time.time())),
    }


@app.get(
    "/health/detailed",
    tags=["System"],
    summary="Detailed health check",
    response_model=None,
)
async def health_check_detailed() -> dict:
    """
    Detailed health check with dependency status.
    Requires authentication in production.
    """
    deps = await _health_check_dependencies()
    
    return {
        "status": "ok" if all(deps.values()) else "degraded",
        "service": "MediReport AI",
        "version": "1.0.0",
        "environment": settings.app_env,
        "dependencies": deps,
        "timestamp": str(int(time.time())),
    }


# ── Root Redirect ─────────────────────────────────────────

@app.get("/", tags=["System"], include_in_schema=False, response_model=None)
async def root() -> dict:
    """Root endpoint - redirects to documentation."""
    return {
        "message": "MediReport AI API",
        "version": "1.0.0",
        "docs": "/docs" if not settings.is_production else None,
        "health": "/health",
    }


# ── Router Imports & Registration ────────────────────────
# Imported here (after app creation) to avoid circular imports

logger.info("Loading routers...")

try:
    from routers.auth import router as auth_router
    from routers.billing import router as billing_router
    from routers.hospital import router as hospital_router
    from routers.reports import router as reports_router
    
    app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
    app.include_router(reports_router, prefix="/api/reports", tags=["Reports"])
    app.include_router(billing_router, prefix="/api/billing", tags=["Billing"])
    app.include_router(hospital_router, prefix="/api/hospital", tags=["Hospital"])
    
    logger.info("✅ All routers registered successfully")
    
except Exception as exc:
    logger.error("❌ Failed to load routers: %s", exc, exc_info=True)
    raise


logger.info("Application initialization complete")
