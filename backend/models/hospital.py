# backend/models/hospital.py
# ─────────────────────────────────────────────────────────────
# Pydantic models for B2B Hospital tenants
# ─────────────────────────────────────────────────────────────

from pydantic import BaseModel, EmailStr, HttpUrl, Field
from typing import Optional
from datetime import datetime
from uuid import UUID


class Hospital(BaseModel):
    id: UUID
    name: str
    slug: str                         # unique URL slug for white-label
    logo_url: Optional[str] = None
    contact_email: EmailStr
    contact_phone: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    api_key: str                      # generated on registration
    monthly_report_limit: int = 500
    reports_used_this_month: int = 0
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    @property
    def is_limit_reached(self) -> bool:
        return self.reports_used_this_month >= self.monthly_report_limit


class HospitalRegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    contact_email: EmailStr
    contact_phone: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None


class HospitalUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    logo_url: Optional[str] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None


class HospitalAnalytics(BaseModel):
    hospital_id: UUID
    total_reports: int
    reports_this_month: int
    reports_completed: int
    reports_failed: int
    abnormal_rate_percent: float
    top_abnormal_tests: list[str]
    monthly_trend: list[dict]         # [{month: "2024-01", count: 42}, ...]


class HospitalDashboardResponse(BaseModel):
    hospital: Hospital
    analytics: HospitalAnalytics
    recent_reports: list[dict]
