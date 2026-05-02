# backend/routers/__init__.py
# Router exports for easy importing

from .auth import router as auth_router
from .billing import router as billing_router
from .hospital import router as hospital_router
from .reports import router as reports_router

__all__ = [
    "auth_router",
    "reports_router",
    "billing_router",
    "hospital_router",
]
