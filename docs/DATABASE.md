# MediReport AI — Supabase SQL Schema
# Run this entire file in: Supabase Dashboard → SQL Editor → New Query

-- ─────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- PROFILES — extends Supabase auth.users
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          TEXT NOT NULL UNIQUE,
  full_name      TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'patient'
                   CHECK (role IN ('patient','doctor','hospital_admin','super_admin')),
  language       TEXT NOT NULL DEFAULT 'ur'
                   CHECK (language IN ('ur','hi','ar','bn','en')),
  hospital_id    UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  avatar_url     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- HOSPITALS — B2B tenants
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hospitals (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                      TEXT NOT NULL,
  slug                      TEXT NOT NULL UNIQUE,
  logo_url                  TEXT,
  contact_email             TEXT NOT NULL,
  contact_phone             TEXT,
  address                   TEXT,
  website                   TEXT,
  api_key                   TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  monthly_report_limit      INTEGER NOT NULL DEFAULT 500,
  reports_used_this_month   INTEGER NOT NULL DEFAULT 0,
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS — user plan tracking
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                   UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  plan                      TEXT NOT NULL DEFAULT 'free'
                              CHECK (plan IN ('free','pro','enterprise')),
  reports_used_this_month   INTEGER NOT NULL DEFAULT 0,
  reports_limit             INTEGER NOT NULL DEFAULT 3,
  stripe_customer_id        TEXT,
  stripe_subscription_id    TEXT,
  current_period_end        TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- REPORTS — lab report uploads and AI results
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  hospital_id       UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  image_url         TEXT NOT NULL,
  pdf_url           TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','processing','completed','failed')),
  language          TEXT NOT NULL DEFAULT 'ur',
  ocr_raw_text      TEXT,
  summary_en        TEXT,
  summary_translated TEXT,
  abnormal_values   JSONB DEFAULT '[]'::JSONB,
  overall_status    TEXT DEFAULT 'normal'
                      CHECK (overall_status IN ('normal','attention','critical')),
  error_message     TEXT,
  processing_time_ms INTEGER,
  is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reports_user_id    ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status     ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_hospital   ON reports(hospital_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);

-- ─────────────────────────────────────────────────────────────
-- AUTO-UPDATE updated_at trigger
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_hospitals_updated_at
  BEFORE UPDATE ON hospitals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- RPC — increment_report_usage (atomic, avoids race conditions)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_report_usage(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE subscriptions
  SET reports_used_this_month = reports_used_this_month + 1
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────
-- RPC — reset_monthly_usage (run via cron on 1st of each month)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reset_monthly_usage()
RETURNS VOID AS $$
BEGIN
  UPDATE subscriptions SET reports_used_this_month = 0;
  UPDATE hospitals      SET reports_used_this_month = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports        ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only read/update their own
CREATE POLICY "profiles_self" ON profiles
  FOR ALL USING (auth.uid() = id);

-- Subscriptions: users can only see their own
CREATE POLICY "subscriptions_self" ON subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- Reports: users can only see their own non-deleted reports
CREATE POLICY "reports_self" ON reports
  FOR ALL USING (auth.uid() = user_id AND is_deleted = FALSE);

-- ─────────────────────────────────────────────────────────────
-- SUPABASE STORAGE BUCKETS
-- Run separately in Storage tab or via API:
-- ─────────────────────────────────────────────────────────────
-- Bucket: lab-reports    (private, 10MB limit)
-- Bucket: report-pdfs    (private, 10MB limit)
-- Bucket: hospital-logos (public,  2MB limit)
