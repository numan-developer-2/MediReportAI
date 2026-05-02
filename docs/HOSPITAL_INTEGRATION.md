# MediReport AI — Hospital Integration Guide

## Authentication

All hospital API calls require an `X-API-Key` header:

```bash
curl -H "X-API-Key: your-hospital-api-key" \
     https://api.medireportai.com/api/hospital/dashboard
```

## Endpoints

### POST /api/hospital/bulk-upload
Upload multiple lab reports in one request.

### GET /api/hospital/dashboard
Get aggregated analytics for your hospital.

### GET /api/hospital/analytics
Detailed abnormal rate trends, top tests flagged.

## White-Label

Contact: enterprise@medireportai.com
