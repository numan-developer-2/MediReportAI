# MediReport AI — CLAUDE.md

> URGENT: A to Z complete in 1 day | 4-6 hours sprint
> Har naye chat mein yeh file paste karo — Claude instantly context samjhega

---

## Project Identity

- **Name:** MediReport AI
- **Tagline:** Every patient deserves to understand their health
- **Type:** Global Medical SaaS — B2C + B2B
- **Goal:** Lab report image → AI explanation → Urdu/multilingual output
- **Deadline:** URGENT — complete in 1 day

---

## Tech Stack — Fixed, Change Mat Karna

```
FRONTEND
  React 18 + Vite + TypeScript
  Tailwind CSS + Shadcn/ui
  Zustand (state)
  React Query v5 + Axios
  React Router v6
  React Hook Form + Zod
  i18next (multi-language)

BACKEND
  FastAPI (Python 3.11)
  Supabase Auth + JWT
  Supabase client v2 (python)
  Python-multipart (file upload)
  ReportLab (PDF export, free)
  Resend (email, free)
  FastAPI BackgroundTasks (queue)

DATABASE
  Supabase PostgreSQL
  Supabase Storage (images/PDFs)
  Supabase Auth

AI MODELS — HuggingFace FREE Inference API only
  OCR:        microsoft/trocr-base-printed
  Explain:    google/flan-t5-base
  Urdu:       Helsinki-NLP/opus-mt-en-ur
  Hindi:      Helsinki-NLP/opus-mt-en-hi
  Arabic:     Helsinki-NLP/opus-mt-en-ar
  Fallback:   pytesseract (local)

DEPLOYMENT — Zero Cost
  Frontend:   Vercel (free)
  Backend:    Railway (free)
  CI/CD:      GitHub Actions (free)

TOOLS — All Free
  Sentry      (error tracking)
  Stripe      (payments — free setup)
  Resend      (3K emails/month free)
```

---

## 10 Rules — Never Break

```
1. Zero paid tools
2. Ek prompt = ek file only
3. Working code only — no pseudocode
4. Error handling in every file
5. HuggingFace free inference API only
6. Supabase client v2 syntax
7. TypeScript strict — no 'any'
8. async/await only — no .then()
9. All secrets in .env
10. No hardcoded values ever
```

---

## Folder Structure

```
medireport-ai/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Landing.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Upload.tsx
│   │   │   ├── Result.tsx
│   │   │   ├── History.tsx
│   │   │   ├── Billing.tsx
│   │   │   └── HospitalAdmin.tsx
│   │   ├── components/
│   │   │   ├── ReportUploader.tsx
│   │   │   ├── ResultCard.tsx
│   │   │   ├── AbnormalBadge.tsx
│   │   │   ├── PlanGate.tsx
│   │   │   ├── LanguageSwitcher.tsx
│   │   │   └── Navbar.tsx
│   │   ├── lib/
│   │   │   ├── supabase.ts
│   │   │   ├── api.ts
│   │   │   └── i18n.ts
│   │   └── store/
│   │       ├── useAuthStore.ts
│   │       └── useReportStore.ts
│
├── backend/
│   ├── main.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── reports.py
│   │   ├── billing.py
│   │   └── hospital.py
│   ├── services/
│   │   ├── ocr_service.py
│   │   ├── nlp_service.py
│   │   ├── translate_service.py
│   │   ├── pdf_service.py
│   │   └── email_service.py
│   ├── middleware/
│   │   ├── auth_middleware.py
│   │   ├── plan_middleware.py
│   │   └── tenant_middleware.py
│   ├── models/
│   │   ├── user.py
│   │   ├── report.py
│   │   └── hospital.py
│   └── config/
│       ├── settings.py
│       └── languages.py
│
├── docs/
│   ├── API.md
│   ├── DATABASE.md
│   ├── DEPLOYMENT.md
│   └── HOSPITAL_INTEGRATION.md
│
├── tests/
│   ├── test_ocr.py
│   ├── test_nlp.py
│   └── test_api.py
│
├── CLAUDE.md
├── .env.example
├── docker-compose.yml
└── README.md
```

---

## Database Schema

```
profiles        → user info, language pref, role
hospitals       → B2B tenants, white-label
subscriptions   → plan, usage limits
reports         → uploads, AI results, translations
```

### Plans

```
free:       3 reports/month
pro:        30 reports/month — PKR 1,500
enterprise: unlimited        — PKR 15,000+
```

---

## AI Pipeline

```
Image upload
    ↓
FastAPI → auth check → plan limit check
    ↓
ocr_service.py    → TrOCR      → raw text
    ↓
nlp_service.py    → Flan-T5    → explanation + abnormal flags
    ↓
translate_service → Helsinki   → Urdu/local language
    ↓
Save to Supabase
    ↓
Return to frontend
```

---

## API Endpoints

```
POST  /api/auth/register
POST  /api/auth/login
GET   /api/auth/me

POST  /api/reports/upload
GET   /api/reports/
GET   /api/reports/{id}
GET   /api/reports/{id}/pdf
DEL   /api/reports/{id}

GET   /api/billing/plans
POST  /api/billing/subscribe
POST  /api/billing/webhook
GET   /api/billing/usage

POST  /api/hospital/register
GET   /api/hospital/dashboard
POST  /api/hospital/bulk-upload
GET   /api/hospital/analytics
```

---

## Environment Variables

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
HUGGINGFACE_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
SENTRY_DSN=
APP_ENV=production
FRONTEND_URL=
SECRET_KEY=
```

---

## Multi-Language Config

```python
SUPPORTED_LANGUAGES = {
    "ur": {"name": "Urdu",   "dir": "rtl", "model": "Helsinki-NLP/opus-mt-en-ur"},
    "hi": {"name": "Hindi",  "dir": "ltr", "model": "Helsinki-NLP/opus-mt-en-hi"},
    "ar": {"name": "Arabic", "dir": "rtl", "model": "Helsinki-NLP/opus-mt-en-ar"},
    "bn": {"name": "Bangla", "dir": "ltr", "model": "Helsinki-NLP/opus-mt-en-bn"},
    "en": {"name": "English","dir": "ltr", "model": None},
}
```

---

## Business Context

```
B2C  → patients — subscription monthly
B2B  → hospitals — white-label API retainer
B2D  → doctors — practice dashboard

Phase 1: Pakistan (Urdu)
Phase 2: Bangladesh + India
Phase 3: MENA — UAE, Saudi
Phase 4: Global 40+ languages
```

---

## URGENT 1-DAY SPRINT PLAN

### Sach yeh hai:

```
A to Z in 1 day = possible ONLY agar
smart shortcuts lo + ek feature at a time karo
Har step kaam kare tab next step
```

---

### BLOCK 1 — Setup (1 ghanta)

```
STEP 01 → GitHub repo banao
          medireport-ai/frontend + backend folders

STEP 02 → Supabase project banao (free)
          supabase.com → new project → SQL editor

STEP 03 → Supabase SQL schema paste karo
          (Claude se maango: "Day 01 SQL schema do")

STEP 04 → HuggingFace account → API key lo
          huggingface.co → settings → tokens

STEP 05 → .env.example fill karo
          Supabase keys + HF key paste karo
```

---

### BLOCK 2 — Backend Core (1.5 ghante)

```
STEP 06 → FastAPI setup
          main.py + settings.py + requirements.txt
          (Claude se: "FastAPI main.py banao")

STEP 07 → OCR service
          ocr_service.py — TrOCR + pytesseract fallback
          TEST: python test_ocr.py

STEP 08 → NLP + Translate service
          nlp_service.py + translate_service.py
          TEST: simple string input/output check

STEP 09 → Auth middleware
          auth_middleware.py — Supabase JWT verify

STEP 10 → Reports router
          reports.py — upload + analyze endpoint
          TEST: Postman/curl se image upload karo
```

---

### BLOCK 3 — Frontend Core (1.5 ghante)

```
STEP 11 → React + Vite setup
          npm create vite@latest
          Tailwind + Shadcn install

STEP 12 → Supabase client + Auth
          lib/supabase.ts
          Login.tsx + Register.tsx pages

STEP 13 → Upload page
          Upload.tsx — drag/drop image
          API call to /api/reports/upload

STEP 14 → Result page
          Result.tsx — show Urdu explanation
          AbnormalBadge.tsx — red/green flags

STEP 15 → Dashboard + History
          Dashboard.tsx — past reports list
```

---

### BLOCK 4 — Business Features (1 ghanta)

```
STEP 16 → Plan limits
          plan_middleware.py — free=3, pro=30
          PlanGate.tsx — frontend block

STEP 17 → PDF export
          pdf_service.py — ReportLab
          Download button on Result page

STEP 18 → Billing page
          Billing.tsx — plan cards
          Stripe checkout link

STEP 19 → Hospital B2B panel
          hospital.py router
          HospitalAdmin.tsx — basic dashboard

STEP 20 → Language switcher
          LanguageSwitcher.tsx — ur/en/hi/ar
```

---

### BLOCK 5 — Deploy (30 minutes)

```
STEP 21 → GitHub push
          git init + commit + push

STEP 22 → Vercel deploy (frontend)
          vercel.com → import repo → deploy
          Add env variables

STEP 23 → Railway deploy (backend)
          railway.app → new project → deploy
          Add env variables

STEP 24 → End-to-end test
          Live URL pe image upload karo
          Urdu result aana chahiye

STEP 25 → Done ✅
```

---

## Claude Ko Prompt Karne Ka Tarika

### Har step ke liye exact prompt:

```
CLAUDE.md context: [yeh file paste karo]

Kaam: STEP [number] — [naam]
File: [exact file naam]
Input: [kya aayega]
Output: [kya chahiye]
Rule: free tools, error handling, working code only
```

### Error aaye to:

```
STEP [number] mein yeh error:
[exact error paste]
Code: [code paste]
Fix karo.
```

### Stuck ho to:

```
STEP [number] pe hoon.
Yeh kaam kiya: [batao]
Yeh nahi samjha: [batao]
Next kya karoon?
```

---

## Progress Tracker — Update Karte Jao

```
BLOCK 1 — Setup
[ ] STEP 01 - GitHub repo
[ ] STEP 02 - Supabase project
[ ] STEP 03 - SQL schema
[ ] STEP 04 - HuggingFace API key
[ ] STEP 05 - .env setup

BLOCK 2 — Backend
[ ] STEP 06 - FastAPI main.py
[ ] STEP 07 - OCR service
[ ] STEP 08 - NLP + Translate
[ ] STEP 09 - Auth middleware
[ ] STEP 10 - Reports router

BLOCK 3 — Frontend
[ ] STEP 11 - React + Vite setup
[ ] STEP 12 - Auth pages
[ ] STEP 13 - Upload page
[ ] STEP 14 - Result page
[ ] STEP 15 - Dashboard

BLOCK 4 — Business
[ ] STEP 16 - Plan limits
[ ] STEP 17 - PDF export
[ ] STEP 18 - Billing page
[ ] STEP 19 - Hospital panel
[ ] STEP 20 - Language switcher

BLOCK 5 — Deploy
[ ] STEP 21 - GitHub push
[ ] STEP 22 - Vercel (frontend)
[ ] STEP 23 - Railway (backend)
[ ] STEP 24 - End-to-end test
[ ] STEP 25 - DONE ✅
```

---

## Important Note

```
Agar time kam pade — yeh zaroori hain:
  MUST:  STEP 01-10, 11-15, 21-24  (core working product)
  SKIP:  STEP 16-20 can be added later

Working ugly > perfect broken
Ship karo, polish baad mein
```

---

_MediReport AI | URGENT 1-Day Sprint | Version 2.0_
