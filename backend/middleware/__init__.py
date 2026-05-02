# backend/middleware/__init__.py
# Middleware exports for easy importing

from .auth_middleware import (
    get_current_user,
    require_doctor,
    require_hospital_admin,
    CurrentUser,
    DoctorUser,
    HospitalAdminUser,
)

__all__ = [
    "get_current_user",
    "require_doctor",
    "require_hospital_admin",
    "CurrentUser",
    "DoctorUser",
    "HospitalAdminUser",
]
