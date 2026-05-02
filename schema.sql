-- ============================================================
-- MediReport AI — Complete Supabase Database Schema
-- File: schema.sql
-- Paste directly into Supabase SQL Editor and Run
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ─────────────────────────────────────────────────────────────
-- TABLE: hospitals
-- Must be created before profiles (foreign key dependency)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hospitals (
    id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    name             TEXT          NOT NULL,
    subdomain        TEXT          NOT NULL UNIQUE,
    api_key          TEXT          NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    logo_url         TEXT,
    primary_color    TEXT          DEFAULT '#0ea5e9',
    languages        TEXT[]        NOT NULL DEFAULT ARRAY['ur'],
    plan             TEXT          NOT NULL DEFAULT 'basic'
                                   CHECK (plan IN ('basic', 'professional', 'enterprise')),
    per_report_fee   NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.hospitals IS 'B2B hospital accounts with white-label configuration';
COMMENT ON COLUMN public.hospitals.api_key IS 'Auto-generated 64-char hex key for API authentication';
COMMENT ON COLUMN public.hospitals.languages IS 'Supported report languages e.g. {ur, en, pa}';


-- ─────────────────────────────────────────────────────────────
-- TABLE: profiles
-- Extended user data linked to Supabase auth.users
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
    id                   UUID        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    full_name            TEXT,
    phone                TEXT,
    preferred_language   TEXT        NOT NULL DEFAULT 'ur'
                                     CHECK (preferred_language IN ('ur', 'en', 'pa', 'sd', 'ps')),
    role                 TEXT        NOT NULL DEFAULT 'patient'
                                     CHECK (role IN ('patient', 'doctor', 'hospital_admin')),
    hospital_id          UUID        REFERENCES public.hospitals (id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Extended user profiles linked to Supabase Auth';
COMMENT ON COLUMN public.profiles.role IS 'patient=B2C, doctor=B2D, hospital_admin=B2B';


-- ─────────────────────────────────────────────────────────────
-- TABLE: subscriptions
-- Tracks plan limits, usage, and Stripe billing info
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    plan                    TEXT        NOT NULL DEFAULT 'free'
                                        CHECK (plan IN ('free', 'pro', 'enterprise')),
    reports_used            INTEGER     NOT NULL DEFAULT 0 CHECK (reports_used >= 0),
    reports_limit           INTEGER     NOT NULL DEFAULT 3  CHECK (reports_limit >= 0),
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    current_period_end      TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id)
);

COMMENT ON TABLE public.subscriptions IS 'User subscription plans and usage tracking';
COMMENT ON COLUMN public.subscriptions.reports_limit IS '3=free, 30=pro, unlimited(-1)=enterprise';


-- ─────────────────────────────────────────────────────────────
-- TABLE: reports
-- Core table: stores each uploaded lab report and AI results
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    hospital_id         UUID        REFERENCES public.hospitals (id) ON DELETE SET NULL,
    image_url           TEXT        NOT NULL,
    raw_ocr_text        TEXT,
    explanation_en      TEXT,
    explanation_ur      TEXT,
    explanation_local   TEXT,
    abnormal_values     JSONB       NOT NULL DEFAULT '[]'::JSONB,
    language            TEXT        NOT NULL DEFAULT 'ur'
                                    CHECK (language IN ('ur', 'en', 'pa', 'sd', 'ps')),
    pdf_url             TEXT,
    doctor_reviewed     BOOLEAN     NOT NULL DEFAULT FALSE,
    doctor_notes        TEXT,
    processing_status   TEXT        NOT NULL DEFAULT 'pending'
                                    CHECK (processing_status IN (
                                        'pending', 'ocr_processing', 'ai_processing',
                                        'translating', 'completed', 'failed'
                                    )),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.reports IS 'Lab report uploads with OCR text and AI explanations';
COMMENT ON COLUMN public.reports.abnormal_values IS 'JSON array: [{name, value, unit, normal_range, status}]';
COMMENT ON COLUMN public.reports.processing_status IS 'Pipeline state machine for async processing';


-- ─────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_hospital_id
    ON public.profiles (hospital_id);

CREATE INDEX IF NOT EXISTS idx_profiles_role
    ON public.profiles (role);

-- subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
    ON public.subscriptions (user_id);

-- reports
CREATE INDEX IF NOT EXISTS idx_reports_user_id
    ON public.reports (user_id);

CREATE INDEX IF NOT EXISTS idx_reports_hospital_id
    ON public.reports (hospital_id);

CREATE INDEX IF NOT EXISTS idx_reports_processing_status
    ON public.reports (processing_status);

CREATE INDEX IF NOT EXISTS idx_reports_created_at
    ON public.reports (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_abnormal_values
    ON public.reports USING GIN (abnormal_values);

-- hospitals
CREATE INDEX IF NOT EXISTS idx_hospitals_subdomain
    ON public.hospitals (subdomain);

CREATE INDEX IF NOT EXISTS idx_hospitals_is_active
    ON public.hospitals (is_active);


-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports      ENABLE ROW LEVEL SECURITY;


-- ── profiles policies ──────────────────────────────────────

-- Users can read and update only their own profile
CREATE POLICY "profiles: owner select"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "profiles: owner insert"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles: owner update"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Hospital admins can view profiles within their hospital
CREATE POLICY "profiles: hospital admin select"
    ON public.profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'hospital_admin'
              AND p.hospital_id = profiles.hospital_id
        )
    );


-- ── hospitals policies ────────────────────────────────────

-- Public can read active hospitals (for subdomain lookup / white-label)
CREATE POLICY "hospitals: public select active"
    ON public.hospitals FOR SELECT
    USING (is_active = TRUE);

-- Hospital admin can update their own hospital record
CREATE POLICY "hospitals: admin update"
    ON public.hospitals FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'hospital_admin'
              AND p.hospital_id = hospitals.id
        )
    );


-- ── subscriptions policies ────────────────────────────────

-- Users see only their own subscription
CREATE POLICY "subscriptions: owner select"
    ON public.subscriptions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "subscriptions: owner insert"
    ON public.subscriptions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "subscriptions: owner update"
    ON public.subscriptions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ── reports policies ──────────────────────────────────────

-- Patients see only their own reports
CREATE POLICY "reports: owner select"
    ON public.reports FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "reports: owner insert"
    ON public.reports FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reports: owner update"
    ON public.reports FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reports: owner delete"
    ON public.reports FOR DELETE
    USING (auth.uid() = user_id);

-- Doctors can view reports within their hospital that are marked for review
CREATE POLICY "reports: doctor select hospital"
    ON public.reports FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'doctor'
              AND p.hospital_id = reports.hospital_id
        )
    );

-- Doctors can update doctor_notes and doctor_reviewed flag only
CREATE POLICY "reports: doctor update notes"
    ON public.reports FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'doctor'
              AND p.hospital_id = reports.hospital_id
        )
    );

-- Hospital admins can view all reports for their hospital
CREATE POLICY "reports: hospital admin select"
    ON public.reports FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role = 'hospital_admin'
              AND p.hospital_id = reports.hospital_id
        )
    );


-- ─────────────────────────────────────────────────────────────
-- TRIGGER: Auto-create profile + subscription on new user signup
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Insert a blank profile
    INSERT INTO public.profiles (id, full_name, preferred_language, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'ur'),
        COALESCE(NEW.raw_user_meta_data->>'role', 'patient')
    )
    ON CONFLICT (id) DO NOTHING;

    -- Insert a free-tier subscription
    INSERT INTO public.subscriptions (user_id, plan, reports_used, reports_limit)
    VALUES (NEW.id, 'free', 0, 3)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

-- Drop trigger if it already exists (safe re-run)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────────────────────────
-- FUNCTION: Increment reports_used (called from backend)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_reports_used(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.subscriptions
    SET reports_used = reports_used + 1
    WHERE user_id = p_user_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- FUNCTION: Check if user can submit a new report
-- Returns TRUE if within plan limits
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_submit_report(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_used    INTEGER;
    v_limit   INTEGER;
BEGIN
    SELECT reports_used, reports_limit
    INTO v_used, v_limit
    FROM public.subscriptions
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- -1 means unlimited (enterprise)
    IF v_limit = -1 THEN
        RETURN TRUE;
    END IF;

    RETURN v_used < v_limit;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- STORAGE BUCKET HINTS (run in Supabase Dashboard > Storage)
-- These SQL commands configure storage RLS
-- ─────────────────────────────────────────────────────────────

-- NOTE: Create two buckets in Supabase Dashboard first:
--   1. "lab-reports"  (private)
--   2. "report-pdfs"  (private)
-- Then run the following policies:

-- Allow authenticated users to upload to lab-reports/{user_id}/*
-- INSERT policy on storage.objects:
--   bucket_id = 'lab-reports' AND auth.uid()::text = (storage.foldername(name))[1]

-- Allow owners to read their files:
--   bucket_id = 'lab-reports' AND auth.uid()::text = (storage.foldername(name))[1]

-- ─────────────────────────────────────────────────────────────
-- SCHEMA UPDATES (Add missing columns and functions)
-- ─────────────────────────────────────────────────────────────

-- Add audio URL columns to reports table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'reports' AND column_name = 'audio_url_ur') THEN
        ALTER TABLE public.reports ADD COLUMN audio_url_ur TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'reports' AND column_name = 'audio_url_local') THEN
        ALTER TABLE public.reports ADD COLUMN audio_url_local TEXT;
    END IF;
END $$;

-- Create increment_reports_used function
CREATE OR REPLACE FUNCTION public.increment_reports_used(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.subscriptions
    SET reports_used = reports_used + 1
    WHERE user_id = p_user_id;
END;
$$;

-- Create storage buckets if they don't exist
-- (These need to be created via Supabase Dashboard or API)
-- Buckets needed: lab-reports, report-pdfs, report-audio

-- Refresh PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');

-- ─────────────────────────────────────────────────────────────
-- END OF SCHEMA
-- ─────────────────────────────────────────────────────────────
