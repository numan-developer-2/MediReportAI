# ============================================================
# MediReport AI — Reports Router
# File: backend/routers/reports.py
#
# Endpoints:
#   POST   /api/reports/upload     — Upload + trigger AI pipeline
#   GET    /api/reports/           — List user's reports (paginated)
#   GET    /api/reports/{id}       — Get single report (full data)
#   DELETE /api/reports/{id}       — Delete report + storage file
# ============================================================

import json
import logging
import math
import mimetypes
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from pydantic import BaseModel, Field
from supabase import Client, create_client

from config.settings import settings
from config.supabase_client import get_supabase_client, safe_storage_upload
from middleware.auth_middleware import CurrentUser
from middleware.plan_middleware import PlanCheck
from services.email_service import email_service
from services.nlp_service import analyze_report
from services.ocr_service import extract_text, OCRException
from services.pdf_service import generate_report_pdf
from services.report_processor import process_report
from services.translate_service import translate_report_fields

logger = logging.getLogger("medireport.reports")

router = APIRouter()

# ── Supabase Client ─────────────────────────────────────
# Use centralized client from config.supabase_client

def _get_supabase() -> Client:
    """Get singleton Supabase client from centralized module."""
    return get_supabase_client()


# ── Constants ─────────────────────────────────────────────
_ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/bmp",
    "image/tiff",
}
_MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


# ── Pydantic Response Schemas ─────────────────────────────

class AbnormalValueSchema(BaseModel):
    name: str
    value: str
    unit: str
    normal_range: str
    status: str   # LOW | HIGH | CRITICAL_LOW | CRITICAL_HIGH


class ReportSummary(BaseModel):
    id: str
    processing_status: str
    language: str
    image_url: str
    pdf_url: Optional[str] = None
    doctor_reviewed: bool
    created_at: str
    has_abnormals: bool
    abnormal_count: int


class ReportDetail(BaseModel):
    id: str
    user_id: str
    hospital_id: Optional[str] = None
    image_url: str
    raw_ocr_text: Optional[str] = None
    explanation_en: Optional[str] = None
    explanation_ur: Optional[str] = None
    explanation_local: Optional[str] = None
    abnormal_values: list[AbnormalValueSchema] = Field(default_factory=list)
    language: str
    pdf_url: Optional[str] = None
    doctor_reviewed: bool
    doctor_notes: Optional[str] = None
    processing_status: str
    created_at: str


class UploadResponse(BaseModel):
    report_id: str
    status: str
    message: str


class PaginatedReports(BaseModel):
    reports: list[ReportSummary]
    total: int
    page: int
    pages: int
    limit: int


class DeleteResponse(BaseModel):
    message: str
    report_id: str


# ── Helpers ───────────────────────────────────────────────

def _validate_file(file: UploadFile, file_bytes: bytes) -> None:
    """
    Validate uploaded file: MIME type and size.

    Raises:
        HTTPException 400: if file is invalid.
    """
    # Check file size
    if len(file_bytes) > _MAX_FILE_SIZE:
        size_mb = len(file_bytes) / 1024 / 1024
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large ({size_mb:.1f} MB). Maximum allowed is 5 MB.",
        )

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    # Detect MIME type from content (more reliable than extension)
    content_type = file.content_type or ""

    # Also guess from filename as fallback
    if not content_type and file.filename:
        guessed, _ = mimetypes.guess_type(file.filename)
        content_type = guessed or ""

    # Normalize
    content_type = content_type.split(";")[0].strip().lower()

    if content_type not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported file type: '{content_type}'. "
                f"Allowed types: JPG, PNG, WEBP, BMP, TIFF."
            ),
        )


def _storage_path(user_id: str, report_id: str, filename: str) -> str:
    """Build Supabase Storage path: user_id/report_id/filename"""
    safe_filename = filename.replace(" ", "_") if filename else "upload.jpg"
    return f"{user_id}/{report_id}/{safe_filename}"


async def _upload_to_storage(
    file_bytes: bytes,
    storage_path: str,
    content_type: str,
) -> str:
    """
    Upload file bytes to Supabase Storage. Returns public URL.
    Re-raises StorageApiError as HTTPException 500.
    Uses centralized safe storage upload.
    """
    try:
        # Use centralized safe upload
        return await safe_storage_upload(
            bucket=settings.reports_bucket,
            path=storage_path,
            file_data=file_bytes,
            content_type=content_type,
        )
    except Exception as exc:
        logger.error("Storage upload failed for %s: %s", storage_path, str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload image. Please try again.",
        )


def _create_report_record(
    report_id: str,
    user_id: str,
    image_url: str,
    language: str,
    hospital_id: Optional[str],
) -> dict:
    """Insert initial report record with 'pending' status."""
    supabase = _get_supabase()

    record = {
        "id":                report_id,
        "user_id":           user_id,
        "hospital_id":       hospital_id,
        "image_url":         image_url,
        "processing_status": "pending",
        "language":          language,
        "doctor_reviewed":   False,
        "abnormal_values":   [],
    }

    try:
        result = supabase.table("reports").insert(record).execute()
        if not result.data:
            raise RuntimeError("No data returned from insert")
        return result.data[0]

    except Exception as exc:
        logger.error("Failed to create report record %s: %s", report_id, str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create report record. Please try again.",
        )


def _update_report(report_id: str, updates: dict) -> None:
    """Patch report record in Supabase."""
    supabase = _get_supabase()
    try:
        supabase.table("reports").update(updates).eq("id", report_id).execute()
    except Exception as exc:
        logger.error("Failed to update report %s: %s", report_id, str(exc), exc_info=True)


def _increment_reports_used(user_id: str) -> None:
    """Increment reports_used counter on subscription table."""
    supabase = _get_supabase()
    try:
        supabase.rpc("increment_reports_used", {"p_user_id": user_id}).execute()
    except Exception as exc:
        logger.warning("Failed to increment reports_used for %s: %s", user_id, str(exc))


# ── ENDPOINT 1: Upload ────────────────────────────────────

@router.post(
    "/upload",
    response_model=UploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload lab report image",
    description=(
        "Upload a lab report image (JPG/PNG/WEBP). "
        "AI analysis runs asynchronously. Poll GET /api/reports/{id} for results."
    ),
)
async def upload_report(
    background_tasks: BackgroundTasks,
    user: CurrentUser,
    plan: PlanCheck,
    file: UploadFile = File(..., description="Lab report image — JPG, PNG, WEBP, BMP, TIFF (max 5MB)"),
) -> UploadResponse:
    """
    Upload a lab report image and trigger the AI analysis pipeline.

    Returns immediately with report_id and status="processing".
    AI pipeline runs in the background — check status via GET /api/reports/{id}.
    """
    # Step 1: Read file bytes
    try:
        file_bytes = await file.read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read uploaded file: {str(exc)}",
        )

    # Step 2: Validate type and size
    _validate_file(file, file_bytes)

    # Step 3: Generate unique report ID
    report_id = str(uuid.uuid4())
    user_id = user["id"]
    user_lang = user.get("preferred_language", "ur")
    hospital_id = user.get("hospital_id")
    content_type = (file.content_type or "image/jpeg").split(";")[0].strip()

    logger.info(
        "Upload started: report_id=%s, user=%s, size=%d bytes, lang=%s",
        report_id, user_id, len(file_bytes), user_lang,
    )

    # Step 4: Upload to Supabase Storage
    storage_path = _storage_path(user_id, report_id, file.filename or "report.jpg")
    image_url = await _upload_to_storage(file_bytes, storage_path, content_type)

    # Step 5: Create report record in DB
    _create_report_record(report_id, user_id, image_url, user_lang, hospital_id)

    # Step 6: Queue background AI pipeline
    background_tasks.add_task(
        process_report,
        report_id=report_id,
        image_bytes=file_bytes,
        user_lang=user_lang,
        hospital_id=hospital_id,
        user_id=user_id,
    )

    logger.info("Report %s queued for processing, returning 202", report_id)

    return UploadResponse(
        report_id=report_id,
        status="processing",
        message=(
            "Your report has been uploaded and is being analyzed. "
            "Results will be ready in 30-60 seconds."
        ),
    )


# ── ENDPOINT 2: List Reports ──────────────────────────────

@router.get(
    "/",
    response_model=PaginatedReports,
    summary="List my reports",
    description="Returns the authenticated user's reports, newest first. Supports pagination.",
)
async def list_reports(
    user: CurrentUser,
    page: int = Query(default=1, ge=1, description="Page number (starts at 1)"),
    limit: int = Query(default=10, ge=1, le=50, description="Results per page (max 50)"),
) -> PaginatedReports:
    """Return paginated list of the current user's lab reports."""
    supabase = _get_supabase()
    user_id = user["id"]
    offset = (page - 1) * limit

    try:
        # Total count
        count_result = (
            supabase.table("reports")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .execute()
        )
        total = count_result.count or 0

        # Paginated data
        data_result = (
            supabase.table("reports")
            .select(
                "id, processing_status, language, image_url, "
                "pdf_url, doctor_reviewed, created_at, abnormal_values"
            )
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

        rows = data_result.data or []

    except Exception as exc:
        logger.error("Failed to list reports for user %s: %s", user_id, str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve reports. Please try again.",
        )

    # Build summary objects
    summaries: list[ReportSummary] = []
    for row in rows:
        abnormals = row.get("abnormal_values") or []
        # abnormal_values may be returned as string by Supabase
        if isinstance(abnormals, str):
            try:
                abnormals = json.loads(abnormals)
            except (json.JSONDecodeError, ValueError):
                abnormals = []

        summaries.append(ReportSummary(
            id=row["id"],
            processing_status=row.get("processing_status", "pending"),
            language=row.get("language", "ur"),
            image_url=row.get("image_url", ""),
            pdf_url=row.get("pdf_url"),
            doctor_reviewed=row.get("doctor_reviewed", False),
            created_at=str(row.get("created_at", "")),
            has_abnormals=len(abnormals) > 0,
            abnormal_count=len(abnormals),
        ))

    pages = math.ceil(total / limit) if total > 0 else 1

    return PaginatedReports(
        reports=summaries,
        total=total,
        page=page,
        pages=pages,
        limit=limit,
    )


# ── ENDPOINT 3: Get Single Report ─────────────────────────

@router.get(
    "/{report_id}",
    response_model=ReportDetail,
    summary="Get report details",
    description="Returns full report data including AI explanation and abnormal values.",
)
async def get_report(
    report_id: str,
    user: CurrentUser,
) -> ReportDetail:
    """Return full detail for a single report. User can only access their own reports."""
    supabase = _get_supabase()
    user_id = user["id"]
    user_role = user.get("role", "patient")
    user_hospital_id = user.get("hospital_id")

    try:
        result = (
            supabase.table("reports")
            .select("*")
            .eq("id", report_id)
            .single()
            .execute()
        )
        row = result.data

    except Exception as exc:
        logger.error("Failed to fetch report %s: %s", report_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report not found: {report_id}",
        )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report not found: {report_id}",
        )

    # ── Ownership check ────────────────────────────────
    # Patients: own reports only
    # Doctors: reports in their hospital
    # Hospital admins: all reports in their hospital
    is_owner = row["user_id"] == user_id
    is_same_hospital = (
        user_hospital_id
        and row.get("hospital_id") == user_hospital_id
        and user_role in ("doctor", "hospital_admin")
    )

    if not is_owner and not is_same_hospital:
        logger.warning(
            "Unauthorized access attempt: user=%s tried to access report=%s (owner=%s)",
            user_id, report_id, row["user_id"],
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this report.",
        )

    # Parse abnormal_values (JSONB may come as string from Supabase)
    abnormals_raw = row.get("abnormal_values") or []
    if isinstance(abnormals_raw, str):
        try:
            abnormals_raw = json.loads(abnormals_raw)
        except (json.JSONDecodeError, ValueError):
            abnormals_raw = []

    abnormals = [
        AbnormalValueSchema(
            name=a.get("name", ""),
            value=a.get("value", ""),
            unit=a.get("unit", ""),
            normal_range=a.get("normal_range", ""),
            status=a.get("status", ""),
        )
        for a in abnormals_raw
        if isinstance(a, dict)
    ]

    return ReportDetail(
        id=row["id"],
        user_id=row["user_id"],
        hospital_id=row.get("hospital_id"),
        image_url=row.get("image_url", ""),
        raw_ocr_text=row.get("raw_ocr_text"),
        explanation_en=row.get("explanation_en"),
        explanation_ur=row.get("explanation_ur"),
        explanation_local=row.get("explanation_local"),
        abnormal_values=abnormals,
        language=row.get("language", "ur"),
        pdf_url=row.get("pdf_url"),
        doctor_reviewed=row.get("doctor_reviewed", False),
        doctor_notes=row.get("doctor_notes"),
        processing_status=row.get("processing_status", "pending"),
        created_at=str(row.get("created_at", "")),
    )


# ── ENDPOINT 4: Delete Report ─────────────────────────────

@router.delete(
    "/{report_id}",
    response_model=DeleteResponse,
    summary="Delete a report",
    description="Permanently deletes report from database and Supabase Storage.",
)
async def delete_report(
    report_id: str,
    user: CurrentUser,
) -> DeleteResponse:
    """Delete a report and its associated storage files. Owner only."""
    supabase = _get_supabase()
    user_id = user["id"]

    # Step 1: Fetch report to verify ownership
    try:
        result = (
            supabase.table("reports")
            .select("id, user_id, image_url")
            .eq("id", report_id)
            .single()
            .execute()
        )
        row = result.data
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report not found: {report_id}",
        )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report not found: {report_id}",
        )

    # Step 2: Ownership check — only the creator can delete
    if row["user_id"] != user_id:
        logger.warning(
            "Unauthorized delete attempt: user=%s tried to delete report=%s (owner=%s)",
            user_id, report_id, row["user_id"],
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this report.",
        )

    # Step 3: Delete from Supabase Storage (images)
    try:
        storage_path = _storage_path(user_id, report_id, "")
        # List all files under this report directory and delete them
        files = supabase.storage.from_(settings.reports_bucket).list(
            path=f"{user_id}/{report_id}"
        )
        if files:
            paths = [f"{user_id}/{report_id}/{f['name']}" for f in files]
            supabase.storage.from_(settings.reports_bucket).remove(paths)
            logger.info("Deleted %d storage file(s) for report %s", len(paths), report_id)

    except Exception as exc:
        # Storage deletion failure is logged but doesn't block DB deletion
        logger.warning("Could not delete storage files for report %s: %s", report_id, str(exc))

    # Step 4: Delete database record (RLS also enforces ownership)
    try:
        supabase.table("reports").delete().eq("id", report_id).eq("user_id", user_id).execute()
        logger.info("Report %s deleted by user %s", report_id, user_id)
    except Exception as exc:
        logger.error("Failed to delete report record %s: %s", report_id, str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete report. Please try again.",
        )

    return DeleteResponse(
        message="Report successfully deleted.",
        report_id=report_id,
    )
