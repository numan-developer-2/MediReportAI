# MediReport AI — API Reference

## Base URL
- Development: `http://localhost:8000/api`
- Production:  `https://your-backend.railway.app/api`

## Authentication
All protected endpoints require:
```
Authorization: Bearer <supabase_jwt_token>
```

---

## Auth Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | No | Register new user |
| POST | `/auth/login` | No | Login, get JWT |
| GET | `/auth/me` | Yes | Get own profile |
| PATCH | `/auth/me` | Yes | Update profile |
| POST | `/auth/logout` | Yes | Sign out |

---

## Reports Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/reports/upload` | Yes | Upload lab report image |
| GET | `/reports/` | Yes | List own reports |
| GET | `/reports/{id}` | Yes | Get single report |
| GET | `/reports/{id}/pdf` | Yes | Download PDF |
| DELETE | `/reports/{id}` | Yes | Delete report |

---

## Billing Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/billing/plans` | No | List all plans |
| GET | `/billing/usage` | Yes | Get monthly usage |
| POST | `/billing/subscribe` | Yes | Create Stripe session |
| POST | `/billing/webhook` | No | Stripe webhook |

---

## Hospital Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/hospital/register` | Yes | Register hospital |
| GET | `/hospital/dashboard` | API Key | Hospital dashboard |
| POST | `/hospital/bulk-upload` | API Key | Bulk report upload |
| GET | `/hospital/analytics` | API Key | Analytics data |

> Hospital endpoints use `X-API-Key` header instead of Bearer token.

---

## System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/` | API info |
