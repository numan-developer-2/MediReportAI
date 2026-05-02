# ============================================================
# MediReport AI — Hospital Router (B2B)
# File: backend/routers/hospital.py
#
# Endpoints:
#   POST  /api/hospital/register    — Register B2B hospital
#   GET   /api/hospital/dashboard   — Admin analytics summary
#   POST  /api/hospital/bulk-upload — Multi-image batch job
#   GET   /api/hospital/analytics   — 30-day detailed analytics
# ============================================================

import logging
import secrets
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field, field_validator
from supabase import Client, create_client

from config.settings import settings
from config.supabase_client import get_supabase_client
from middleware.auth_middleware import (
    CurrentUser,
    HospitalAdminUser,
    get_current_user,
    require_hospital_admin,
)
from services.report_processor import process_report

logger = logging.getLogger("medireport.hospital")

router = APIRouter()

# ── Supabase Client ─────────────────────────────────────
# Use centralized client from config.supabase_client

def _get_supabase() -> Client:
    """Get singleton Supabase client from centralized module."""
    return get_supabase_client()


# ── Pydantic Schemas ──────────────────────────────────────

class RegisterHospitalRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    subdomain: str = Field(
        ...,
        min_length=3,
        max_length=50,
        pattern=r"^[a-z0-9-]+$",
        description="Lowercase letters, numbers, hyphens only. Used as hospital.medireport.ai",
    )
    logo_url: Optional[str] = Field(default=None, description="Public URL to hospital logo")
    primary_color: str = Field(default="#0ea5e9", description="Brand hex color")
    languages: list[str] = Field(
        default=["ur", "en"],
        description="Supported output languages e.g. ['ur', 'en', 'hi']",
    )
    plan: str = Field(default="basic", description="Hospital plan: basic | professional | enterprise")

    @field_validator("subdomain")
    @classmethod
    def validate_subdomain(cls, v: str) -> str:
        reserved = {"www", "api", "app", "admin", "mail", "docs", "blog", "help"}
        if v in reserved:
            raise ValueError(f"Subdomain '{v}' is reserved. Please choose another.")
        return v.lower().strip()

    @field_validator("languages")
    @classmethod
    def validate_languages(cls, v: list[str]) -> list[str]:
        supported = {"ur", "en", "hi", "ar", "bn", "pa", "sd", "ps"}
        invalid = [lang for lang in v if lang not in supported]
        if invalid:
            raise ValueError(f"Unsupported language codes: {invalid}. Supported: {supported}")
        return v

    @field_validator("plan")
    @classmethod
    def validate_plan(cls, v: str) -> str:
        allowed = {"basic", "professional", "enterprise"}
        if v not in allowed:
            raise ValueError(f"Plan must be one of: {allowed}")
        return v


class HospitalInfo(BaseModel):
    id: str
    name: str
    subdomain: str
    logo_url: Optional[str] = None
    primary_color: str
    languages: list[str]
    plan: str
    is_active: bool
    created_at: str


class RegisterHospitalResponse(BaseModel):
    hospital: HospitalInfo
    api_key: str
    message: str


class DashboardResponse(BaseModel):
    hospital_name: str
    total_patients: int
    reports_today: int
    reports_this_month: int
    abnormal_rate_percent: float
    pending_reports: int
    completed_reports: int


class BulkUploadResponse(BaseModel):
    job_id: str
    file_count: int
    status: str
    message: str


class DailyReportPoint(BaseModel):
    date: str
    count: int
    abnormal_count: int


class AnalyticsResponse(BaseModel):
    daily_reports: list[DailyReportPoint]
    top_tests: list[dict]
    abnormal_percentage: float
    language_breakdown: dict[str, int]
    total_reports: int
    total_patients: int


# ── Helpers ───────────────────────────────────────────────

def _generate_api_key() -> str:
    """Generate a secure 48-character hex API key."""
    return secrets.token_hex(24)


def _today_iso() -> str:
    """Return today's date in ISO format (UTC)."""
    return datetime.now(timezone.utc).date().isoformat()


def _month_start_iso() -> str:
    """Return first day of current month in ISO format (UTC)."""
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, 1, tzinfo=timezone.utc).isoformat()


# ── ENDPOINT 1: Register Hospital ────────────────────────

@router.post(
    "/register",
    response_model=RegisterHospitalResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new hospital (B2B)",
    description="Creates a hospital account with auto-generated API key for white-label access.",
)
async def register_hospital(
    body: RegisterHospitalRequest,
    user: CurrentUser,
) -> RegisterHospitalResponse:
    """
    Register a new B2B hospital account.
    The requesting user becomes the hospital admin.
    """
    supabase = _get_supabase()
    user_id = user["id"]

    logger.info(
        "Hospital registration: name='%s' subdomain='%s' by user=%s",
        body.name, body.subdomain, user_id,
    )

    # Step 1: Check subdomain uniqueness
    try:
        existing = (
            supabase.table("hospitals")
            .select("id")
            .eq("subdomain", body.subdomain)
            .execute()
        )
        if existing.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Subdomain '{body.subdomain}' is already taken. Please choose another.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Subdomain check failed: %s", str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to validate subdomain. Please try again.",
        )

    # Step 2: Generate API key
    api_key = _generate_api_key()
    hospital_id = str(uuid.uuid4())

    # Step 3: Insert hospital
    try:
        hospital_record = {
            "id":            hospital_id,
            "name":          body.name,
            "subdomain":     body.subdomain,
            "api_key":       api_key,
            "logo_url":      body.logo_url,
            "primary_color": body.primary_color,
            "languages":     body.languages,
            "plan":          body.plan,
            "per_report_fee": 0.00,
            "is_active":     True,
        }
        result = supabase.table("hospitals").insert(hospital_record).execute()
        if not result.data:
            raise RuntimeError("No data returned from hospital insert")
        row = result.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Hospital insert failed: %s", str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create hospital record.",
        )

    # Step 4: Update requesting user's profile to hospital_admin
    try:
        supabase.table("profiles").update({
            "role":        "hospital_admin",
            "hospital_id": hospital_id,
        }).eq("id", user_id).execute()
        logger.info("User %s promoted to hospital_admin for hospital %s", user_id, hospital_id)
    except Exception as exc:
        logger.warning("Failed to update user role: %s", str(exc))

    hospital_info = HospitalInfo(
        id=row["id"],
        name=row["name"],
        subdomain=row["subdomain"],
        logo_url=row.get("logo_url"),
        primary_color=row["primary_color"],
        languages=row["languages"],
        plan=row["plan"],
        is_active=row["is_active"],
        created_at=str(row.get("created_at", "")),
    )

    logger.info("Hospital registered: id=%s subdomain=%s", hospital_id, body.subdomain)

    return RegisterHospitalResponse(
        hospital=hospital_info,
        api_key=api_key,
        message=(
            f"Hospital '{body.name}' registered successfully! "
            f"Your subdomain: {body.subdomain}.medireport.ai. "
            f"Keep your API key secure — it won't be shown again."
        ),
    )


# ── ENDPOINT 2: Dashboard ─────────────────────────────────

@router.get(
    "/dashboard",
    response_model=DashboardResponse,
    status_code=status.HTTP_200_OK,
    summary="Hospital admin dashboard summary",
    description="Returns key metrics for the hospital. Requires hospital_admin role.",
)
async def get_dashboard(user: HospitalAdminUser) -> DashboardResponse:
    """
    Return dashboard summary for a hospital admin.
    Includes patient counts, report volumes, and abnormal rate.
    """
    supabase = _get_supabase()
    hospital_id = user.get("hospital_id")

    if not hospital_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your account is not linked to a hospital.",
        )

    # Fetch hospital name
    hospital_name = "Your Hospital"
    try:
        h_result = (
            supabase.table("hospitals")
            .select("name")
            .eq("id", hospital_id)
            .single()
            .execute()
        )
        if h_result.data:
            hospital_name = h_result.data["name"]
    except Exception:
        pass

    today = _today_iso()
    month_start = _month_start_iso()

    # Run stats queries
    try:
        # Total unique patients in this hospital
        patients_result = (
            supabase.table("profiles")
            .select("id", count="exact")
            .eq("hospital_id", hospital_id)
            .execute()
        )
        total_patients = patients_result.count or 0

        # Reports today
        today_result = (
            supabase.table("reports")
            .select("id", count="exact")
            .eq("hospital_id", hospital_id)
            .gte("created_at", today)
            .execute()
        )
        reports_today = today_result.count or 0

        # Reports this month
        month_result = (
            supabase.table("reports")
            .select("id", count="exact")
            .eq("hospital_id", hospital_id)
            .gte("created_at", month_start)
            .execute()
        )
        reports_this_month = month_result.count or 0

        # Pending reports
        pending_result = (
            supabase.table("reports")
            .select("id", count="exact")
            .eq("hospital_id", hospital_id)
            .in_("processing_status", ["pending", "ocr_processing", "ai_processing", "translating"])
            .execute()
        )
        pending_reports = pending_result.count or 0

        # Completed reports
        completed_result = (
            supabase.table("reports")
            .select("id", count="exact")
            .eq("hospital_id", hospital_id)
            .eq("processing_status", "completed")
            .execute()
        )
        completed_reports = completed_result.count or 0

        # Abnormal rate: reports with at least one abnormal value
        all_reports_result = (
            supabase.table("reports")
            .select("abnormal_values")
            .eq("hospital_id", hospital_id)
            .eq("processing_status", "completed")
            .execute()
        )
        all_reports = all_reports_result.data or []
        reports_with_abnormals = sum(
            1 for r in all_reports
            if r.get("abnormal_values") and len(r["abnormal_values"]) > 0
        )
        total_completed = len(all_reports)
        abnormal_rate = (
            round((reports_with_abnormals / total_completed) * 100, 1)
            if total_completed > 0 else 0.0
        )

    except Exception as exc:
        logger.error("Dashboard query failed for hospital %s: %s", hospital_id, str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load dashboard data.",
        )

    return DashboardResponse(
        hospital_name=hospital_name,
        total_patients=total_patients,
        reports_today=reports_today,
        reports_this_month=reports_this_month,
        abnormal_rate_percent=abnormal_rate,
        pending_reports=pending_reports,
        completed_reports=completed_reports,
    )


# ── ENDPOINT 3: Bulk Upload ───────────────────────────────

@router.post(
    "/bulk-upload",
    response_model=BulkUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Bulk upload lab reports (hospital)",
    description="Upload up to 50 lab report images for batch AI processing.",
)
async def bulk_upload(
    background_tasks: BackgroundTasks,
    user: HospitalAdminUser,
    files: list[UploadFile] = File(
        ...,
        description="Up to 50 lab report images (JPG/PNG/WEBP)",
    ),
) -> BulkUploadResponse:
    """
    Upload multiple lab report images for batch processing.
    Each file is processed independently through the full AI pipeline.
    Returns a job_id — future analytics will be grouped under it.
    """
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided.",
        )

    if len(files) > 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum 50 files per batch. You sent {len(files)}.",
        )

    user_id = user["id"]
    hospital_id = user.get("hospital_id")
    user_lang = user.get("preferred_language", "ur")
    job_id = str(uuid.uuid4())

    logger.info(
        "Bulk upload job %s: %d files from hospital=%s user=%s",
        job_id, len(files), hospital_id, user_id,
    )

    # Read all files into memory and validate before queuing
    valid_files: list[tuple[str, bytes]] = []
    skipped = 0

    allowed_types = {
        "image/jpeg", "image/jpg", "image/png",
        "image/webp", "image/bmp", "image/tiff",
    }
    max_size = 5 * 1024 * 1024  # 5 MB

    for f in files:
        try:
            file_bytes = await f.read()
        except Exception:
            skipped += 1
            continue

        content_type = (f.content_type or "image/jpeg").split(";")[0].strip().lower()

        if content_type not in allowed_types:
            logger.warning("Bulk upload skipping %s: unsupported type %s", f.filename, content_type)
            skipped += 1
            continue

        if len(file_bytes) > max_size:
            logger.warning("Bulk upload skipping %s: too large (%d bytes)", f.filename, len(file_bytes))
            skipped += 1
            continue

        if len(file_bytes) == 0:
            skipped += 1
            continue

        valid_files.append((f.filename or f"file_{len(valid_files)+1}.jpg", file_bytes))

    if not valid_files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid image files found in the upload.",
        )

    # Queue each valid file as a separate background report task
    supabase = _get_supabase()
    queued = 0

    for filename, file_bytes in valid_files:
        report_id = str(uuid.uuid4())

        # Upload image to storage
        try:
            storage_path = f"{user_id}/{report_id}/{filename.replace(' ', '_')}"
            supabase.storage.from_(settings.reports_bucket).upload(
                path=storage_path,
                file=file_bytes,
                file_options={"content-type": "image/jpeg", "upsert": "false"},
            )
            image_url = supabase.storage.from_(settings.reports_bucket).get_public_url(storage_path)
        except Exception as exc:
            logger.warning("Storage upload failed for bulk file %s: %s", filename, str(exc))
            continue

        # Insert report record
        try:
            supabase.table("reports").insert({
                "id":                report_id,
                "user_id":           user_id,
                "hospital_id":       hospital_id,
                "image_url":         image_url,
                "processing_status": "pending",
                "language":          user_lang,
                "doctor_reviewed":   False,
                "abnormal_values":   [],
            }).execute()
        except Exception as exc:
            logger.warning("DB insert failed for bulk report %s: %s", report_id, str(exc))
            continue

        # Queue AI pipeline
        background_tasks.add_task(
            process_report,
            report_id=report_id,
            image_bytes=file_bytes,
            user_lang=user_lang,
            hospital_id=hospital_id,
            user_id=user_id,
        )
        queued += 1

    if queued == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="All files failed to process. Please try again.",
        )

    logger.info("Bulk job %s: %d/%d files queued (%d skipped)", job_id, queued, len(files), skipped)

    return BulkUploadResponse(
        job_id=job_id,
        file_count=queued,
        status="processing",
        message=(
            f"{queued} reports queued for AI analysis."
            + (f" {skipped} file(s) skipped (invalid type or size)." if skipped else "")
        ),
    )


# ── ENDPOINT 4: Analytics ─────────────────────────────────

@router.get(
    "/analytics",
    response_model=AnalyticsResponse,
    status_code=status.HTTP_200_OK,
    summary="Hospital 30-day analytics",
    description="Returns detailed analytics for the last 30 days.",
)
async def get_analytics(user: HospitalAdminUser) -> AnalyticsResponse:
    """
    Return 30-day analytics for the hospital:
    - Daily report volume + abnormal counts
    - Top abnormal tests detected
    - Language distribution
    """
    supabase = _get_supabase()
    hospital_id = user.get("hospital_id")

    if not hospital_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your account is not linked to a hospital.",
        )

    # 30 days ago
    thirty_days_ago = (
        datetime.now(timezone.utc) - timedelta(days=30)
    ).isoformat()

    try:
        result = (
            supabase.table("reports")
            .select("created_at, abnormal_values, language, processing_status")
            .eq("hospital_id", hospital_id)
            .gte("created_at", thirty_days_ago)
            .order("created_at", desc=False)
            .execute()
        )
        rows = result.data or []
    except Exception as exc:
        logger.error("Analytics query failed for hospital %s: %s", hospital_id, str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load analytics data.",
        )

    # ── Build daily_reports ────────────────────────────
    daily_map: dict[str, dict] = defaultdict(lambda: {"count": 0, "abnormal_count": 0})
    test_counter: Counter = Counter()
    lang_counter: Counter = Counter()
    total_abnormal = 0
    total_completed = 0

    for row in rows:
        # Date extraction
        raw_date = row.get("created_at", "")
        date_str = raw_date[:10] if raw_date else "unknown"

        daily_map[date_str]["count"] += 1

        # Language breakdown
        lang = row.get("language", "ur")
        lang_counter[lang] += 1

        # Abnormal analysis
        abnormals = row.get("abnormal_values") or []
        if isinstance(abnormals, str):
            try:
                import json
                abnormals = json.loads(abnormals)
            except Exception:
                abnormals = []

        if row.get("processing_status") == "completed":
            total_completed += 1
            if abnormals:
                daily_map[date_str]["abnormal_count"] += 1
                total_abnormal += 1
                # Count individual test names
                for ab in abnormals:
                    if isinstance(ab, dict) and ab.get("name"):
                        test_counter[ab["name"]] += 1

    # Fill in all 30 days (including zero-report days)
    daily_reports: list[DailyReportPoint] = []
    for i in range(30):
        day = (datetime.now(timezone.utc) - timedelta(days=29 - i)).date().isoformat()
        data = daily_map[day]
        daily_reports.append(DailyReportPoint(
            date=day,
            count=data["count"],
            abnormal_count=data["abnormal_count"],
        ))

    # Top 10 most commonly flagged tests
    top_tests = [
        {"name": name, "count": count}
        for name, count in test_counter.most_common(10)
    ]

    # Abnormal rate
    abnormal_pct = (
        round((total_abnormal / total_completed) * 100, 1)
        if total_completed > 0 else 0.0
    )

    # Total unique patients
    try:
        patients_result = (
            supabase.table("profiles")
            .select("id", count="exact")
            .eq("hospital_id", hospital_id)
            .execute()
        )
        total_patients = patients_result.count or 0
    except Exception:
        total_patients = 0

    return AnalyticsResponse(
        daily_reports=daily_reports,
        top_tests=top_tests,
        abnormal_percentage=abnormal_pct,
        language_breakdown=dict(lang_counter),
        total_reports=len(rows),
        total_patients=total_patients,
    )
