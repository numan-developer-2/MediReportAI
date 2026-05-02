# MediReport AI — Deployment Guide

## Frontend → Vercel

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com) → Import repository
3. Set **Root Directory** to `frontend`
4. Add Environment Variables:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_API_URL=https://your-backend.railway.app
   ```
5. Deploy → get URL like `medireportai.vercel.app`

## Backend → Railway

1. Go to [railway.app](https://railway.app) → New Project
2. Deploy from GitHub → select `backend/` folder
3. Add Environment Variables (all from `.env.example`)
4. Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Deploy → get URL like `medireport-production.railway.app`

## Post-Deploy Checklist

- [ ] Update `FRONTEND_URL` in backend env to Vercel URL
- [ ] Update `VITE_API_URL` in Vercel env to Railway URL
- [ ] Add Railway URL to Supabase Auth → Redirect URLs
- [ ] Set up Supabase cron: `reset_monthly_usage()` on 1st each month
- [ ] Test `/health` endpoint on Railway
- [ ] Test full upload flow end-to-end
