# 🏥 MediReport AI

> **Every patient deserves to understand their health**

MediReport AI is a global medical SaaS platform that reads lab report photos and explains them in simple Urdu (and other languages) using AI — highlighting abnormal values in red/orange.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-green)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-blue)](https://react.dev)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)](https://supabase.com)

---

## 🚀 Features

- 📸 **Lab Report OCR** — Upload any lab report photo
- 🤖 **AI Explanation** — Plain-language health insights via Flan-T5
- 🌍 **Multilingual** — Urdu, Hindi, Arabic, Bangla, English
- 🚨 **Abnormal Flags** — Red/orange highlights for out-of-range values
- 📄 **PDF Export** — Download your explained report
- 🏥 **B2B White-label** — Hospital API integration
- 👨‍⚕️ **Doctor Dashboard** — Practice management for B2D

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + Shadcn/ui |
| Backend | FastAPI (Python 3.11) |
| Database | Supabase (PostgreSQL + Auth + Storage) |
| AI/OCR | HuggingFace Free Inference API |
| Deploy | Vercel (FE) + Railway (BE) |

---

## 📦 Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- [Supabase account](https://supabase.com) (free)
- [HuggingFace account](https://huggingface.co) + API token (free)

### 1. Clone & Setup

```bash
git clone https://github.com/yourusername/medireport-ai.git
cd medireport-ai
cp .env.example .env
# Fill in your .env values
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
# Runs at http://localhost:5173
```

### 4. Database Setup

Run the SQL schema in Supabase SQL Editor:
```
docs/DATABASE.md → copy the SQL and paste in Supabase
```

---

## 🗂️ Project Structure

```
medireport-ai/
├── frontend/          # React 18 + Vite + TypeScript
├── backend/           # FastAPI Python 3.11
├── docs/              # API, DB, Deployment docs
├── tests/             # Backend test suite
├── .env.example       # Environment variables template
├── docker-compose.yml # Local dev with Docker
└── README.md
```

---

## 💰 Pricing Plans

| Plan | Reports/Month | Price |
|---|---|---|
| Free | 3 | PKR 0 |
| Pro | 30 | PKR 1,500 |
| Enterprise | Unlimited | PKR 15,000+ |

---

## 🌍 Supported Languages

| Language | Direction | Translation Model |
|---|---|---|
| Urdu | RTL | Helsinki-NLP/opus-mt-en-ur |
| Hindi | LTR | Helsinki-NLP/opus-mt-en-hi |
| Arabic | RTL | Helsinki-NLP/opus-mt-en-ar |
| Bangla | LTR | Helsinki-NLP/opus-mt-en-bn |
| English | LTR | (native) |

---

## 🚢 Deployment

- **Frontend** → [Vercel](https://vercel.com) (free tier)
- **Backend** → [Railway](https://railway.app) (free tier)
- See `docs/DEPLOYMENT.md` for step-by-step guide

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

_MediReport AI | Version 1.0 | Built with ❤️ for global health access_


 