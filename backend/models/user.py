# backend/models/user.py
# ─────────────────────────────────────────────────────────────
# Pydantic models for User / Profile data
# ─────────────────────────────────────────────────────────────

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Literal
from datetime import datetime
from uuid import UUID


UserRole = Literal["patient", "doctor", "hospital_admin", "super_admin"]
PlanName = Literal["free", "pro", "enterprise"]


class UserProfile(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    role: UserRole = "patient"
    language: str = "ur"
    hospital_id: Optional[UUID] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)
    full_name: str = Field(..., min_length=2, max_length=100)
    role: UserRole = "patient"
    language: str = "ur"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserProfile


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    language: Optional[str] = None
    avatar_url: Optional[str] = None


class Subscription(BaseModel):
    id: UUID
    user_id: UUID
    plan: PlanName
    reports_used_this_month: int
    reports_limit: int
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    current_period_end: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    @property
    def is_limit_reached(self) -> bool:
        return self.reports_used_this_month >= self.reports_limit
