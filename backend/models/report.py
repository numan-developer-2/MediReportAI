# backend/models/report.py
# ─────────────────────────────────────────────────────────────
# Pydantic models for Lab Report data
# ─────────────────────────────────────────────────────────────

from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime
from uuid import UUID


ReportStatus = Literal["pending", "processing", "completed", "failed"]


class AbnormalValue(BaseModel):
    """A single lab value that is out of normal range."""
    test_name: str
    value: str
    unit: Optional[str] = None
    normal_range: Optional[str] = None
    status: Literal["high", "low", "critical"] = "high"
    explanation_en: str
    explanation_translated: str


class ReportResult(BaseModel):
    """AI analysis output for a lab report."""
    ocr_raw_text: str
    summary_en: str
    summary_translated: str
    language: str
    abnormal_values: list[AbnormalValue] = []
    overall_status: Literal["normal", "attention", "critical"] = "normal"


class Report(BaseModel):
    id: UUID
    user_id: UUID
    hospital_id: Optional[UUID] = None
    image_url: str
    pdf_url: Optional[str] = None
    status: ReportStatus = "pending"
    language: str = "ur"
    result: Optional[ReportResult] = None
    created_at: datetime
    updated_at: datetime


class ReportUploadResponse(BaseModel):
    report_id: UUID
    status: ReportStatus
    message: str


class ReportDetailResponse(BaseModel):
    report: Report
    processing_time_seconds: Optional[float] = None


class ReportListItem(BaseModel):
    id: UUID
    status: ReportStatus
    language: str
    overall_status: Optional[str] = None
    summary_translated: Optional[str] = None
    created_at: datetime
    image_url: str


class ReportListResponse(BaseModel):
    reports: list[ReportListItem]
    total: int
    page: int
    page_size: int
