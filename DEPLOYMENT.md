# FOS Enterprise — Production Deployment Guide

This guide details the step-by-step production deployment for the **FOS Enterprise** platform using:
- **Render** for the FastAPI backend service
- **Vercel** for the Next.js frontend application
- **Supabase** for PostgreSQL with PostGIS and User Authentication

---

## 1. Repository Structure

This repository is structured as a two-tier application:

```text
FOS_agent/
├── backend/                   # Python FastAPI Backend
│   ├── app/
│   │   ├── api/v1/            # REST API endpoints (health, auth, agents, visits)
│   │   ├── core/              # Security, JWT auth, and bootstrap utilities
│   │   ├── db/                # SQLAlchemy session & database engine
│   │   ├── models/            # SQLAlchemy ORM models (PostGIS Geography)
│   │   ├── schemas/           # Pydantic validation schemas
│   │   ├── config.py          # Settings and environment configuration
│   │   └── main.py            # FastAPI entry point (app.main:app)
│   ├── alembic/               # Database migrations
│   ├── alembic.ini            # Alembic configuration
│   ├── requirements.txt       # Production Python dependencies
│   ├── .python-version        # Declares Python 3.11.9
│   ├── .env.example           # Backend environment template
│   └── .env                   # Local secrets (never committed)
│
├── frontend/                  # Next.js 14 Frontend
│   ├── src/
│   │   ├── app/               # Next.js App Router pages
│   │   ├── components/        # UI and Leaflet map components
│   │   ├── context/           # Auth and Operations React Context
│   │   ├── lib/               # API client, geo utilities, and Supabase client
│   │   └── types/             # TypeScript definitions
│   ├── package.json           # npm scripts and dependencies
│   ├── tailwind.config.ts     # Design tokens and theme
│   ├── tsconfig.json          # TypeScript compiler configuration
│   ├── .env.example           # Frontend environment template
│   └── .env.local             # Local secrets (never committed)
│
├── render.yaml                # Optional Render Blueprint definition
└── DEPLOYMENT.md              # Production deployment documentation
```

---

## 2. Part 1: Deploy Backend to Render

### 2.1 Create Render Web Service
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** > **Web Service**.
3. Connect your GitHub repository.
4. Configure the service parameters:

| Setting | Value |
| :--- | :--- |
| **Name** | `fos-enterprise-backend` (or your chosen name) |
| **Region** | Select region closest to your Supabase database (e.g. `Singapore` or `Frankfurt`) |
| **Branch** | `main` |
| **Root Directory** | `backend` |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| **Instance Type** | Starter or Standard |

> [!NOTE]
> For multi-worker concurrency on Render Standard or higher, you can alternately use:
> `gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT`

### 2.2 Configure Health Check
In Render Service Settings > **Health Check Path**, enter:
```text
/health
```
*(Render will send periodic HTTP GET requests to verify liveness before routing traffic).*

### 2.3 Set Backend Environment Variables
In the Render dashboard under **Environment**, add the following variables:

| Variable | Recommended Value / Description | Sensitive? |
| :--- | :--- | :---: |
| `ENVIRONMENT` | `production` | No |
| `DEBUG` | `false` | No |
| `PROJECT_NAME` | `FOS Agent Management System` | No |
| `PYTHON_VERSION` | `3.11.9` | No |
| `DATABASE_URL` | `postgresql+asyncpg://postgres.[REF]:[PASS]@aws-0-[REGION].pooler.supabase.com:5432/postgres` | **YES** |
| `DIRECT_URL` | `postgresql://postgres.[REF]:[PASS]@aws-0-[REGION].pooler.supabase.com:5432/postgres` | **YES** |
| `SUPABASE_URL` | `https://[YOUR-PROJECT-REF].supabase.co` | No |
| `SUPABASE_JWT_SECRET` | From Supabase > Settings > API > JWT Secret | **YES** |
| `SUPABASE_ANON_KEY` | Public Anon key from Supabase | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only `service_role` key from Supabase API settings | **YES** |
| `ADMIN_REGISTRATION_KEY` | High-entropy secret key for admin account creation | **YES** |
| `AGENT_REGISTRATION_KEY` | High-entropy secret key for agent onboarding | **YES** |
| `CORS_ORIGINS` | `["https://your-frontend.vercel.app"]` *(update once Vercel is deployed)* | No |
| `CORS_ORIGIN_REGEX` | `https:\/\/.*\.vercel\.app` *(permits Vercel preview URLs)* | No |
| `GEOFENCE_RADIUS_METERS` | `750.0` | No |
| `MAX_ACCEPTABLE_GPS_ACCURACY_METERS` | `100.0` | No |
| `LOCATION_STALE_THRESHOLD_SECONDS` | `300` | No |

---

## 3. Part 2: Database Migrations

Never execute migrations over public HTTP endpoints in production. Migrations must be applied safely using Alembic:

### Option A: From Local Terminal (Recommended for initial setup)
From your local environment with direct access to Supabase:
```powershell
cd backend
# Run all pending migrations up to head:
alembic upgrade head
```

### Option B: Render Pre-Deploy Command
Under Render Web Service > **Settings** > **Build & Deploy** > **Pre-Deploy Command**:
```bash
alembic upgrade head
```
*(Render executes this step before routing production traffic to the new build).*

---

## 4. Part 3: Deploy Frontend to Vercel

### 4.1 Import Project to Vercel
1. Log in to [Vercel](https://vercel.com).
2. Click **Add New...** > **Project**.
3. Select your GitHub repository.
4. **CRITICAL**: In the project configuration screen, configure the **Root Directory**:
   - Click **Edit** next to **Root Directory**.
   - Select `frontend`.
   - Click **Continue**.

### 4.2 Build & Output Settings
Vercel automatically detects Next.js:
- **Framework Preset**: `Next.js`
- **Build Command**: `next build` (or `npm run build`)
- **Output Directory**: `.next`
- **Install Command**: `npm install`

### 4.3 Configure Frontend Environment Variables
In Vercel **Environment Variables**, add:

| Variable | Example Value | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | `https://your-frontend.vercel.app` | Public URL of your deployed frontend |
| `NEXT_PUBLIC_API_BASE_URL` | `https://fos-enterprise-backend.onrender.com/api/v1` | Your live Render backend URL |
| `NEXT_PUBLIC_API_URL` | `https://fos-enterprise-backend.onrender.com/api/v1` | Backward-compatibility fallback |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://[YOUR-PROJECT-REF].supabase.co` | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Supabase Public Anon Key (safe for browser) |
| `NEXT_PUBLIC_DEFAULT_MAP_CENTER_LAT` | `12.9716` | Default Map latitude |
| `NEXT_PUBLIC_DEFAULT_MAP_CENTER_LNG` | `77.5946` | Default Map longitude |
| `NEXT_PUBLIC_LOCATION_POLL_INTERVAL_MS`| `15000` | Agent GPS poll interval |

> [!CAUTION]
> NEVER add `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL` to Vercel environment variables. All privileged operations must remain strictly inside the FastAPI backend.

Click **Deploy**.

---

## 5. Part 4: Finalize CORS & Supabase Auth URLs

Once both services are deployed, update the cross-service permissions:

### 5.1 Update Backend CORS on Render
1. Go to your Render backend dashboard.
2. In **Environment Variables**, update `CORS_ORIGINS` to include your production Vercel domain:
   ```json
   ["https://your-app-name.vercel.app", "http://localhost:3000"]
   ```
3. Save changes. Render will automatically redeploy the service.

### 5.2 Configure Supabase Redirect URLs
1. Open [Supabase Dashboard](https://supabase.com/dashboard) > Your Project.
2. Navigate to **Authentication** > **URL Configuration**.
3. Set **Site URL**:
   ```text
   https://your-app-name.vercel.app
   ```
4. In **Redirect URLs**, add:
   ```text
   https://your-app-name.vercel.app/**
   http://localhost:3000/**
   ```
5. Save changes.

---

## 6. Post-Deployment Verification Checklist

Verify your production deployment with these checks:

### 1. Test Backend Liveness
```bash
curl https://your-backend.onrender.com/health
```
**Expected Response:**
```json
{
  "status": "healthy",
  "project": "FOS Agent Management System",
  "environment": "production",
  "version": "0.1.0",
  "timestamp": "2026-..."
}
```

### 2. Test Database & PostGIS Connectivity
```bash
curl https://your-backend.onrender.com/health/database
```
**Expected Response:**
```json
{
  "status": "connected",
  "environment": "production",
  "database_connected": true,
  "postgis_enabled": true,
  "postgis_version": "3.x.x",
  "postgis_full_version": null,
  "installed_extensions": [],
  "existing_tables": [],
  "error": null
}
```

### 3. Test Frontend Authentication & Operations
1. Open `https://your-app-name.vercel.app/admin/login` in your browser.
2. Sign in with your administrator account.
3. Verify the **Admin Dashboard** loads at `/admin/dashboard`:
   - Interactive Leaflet map initializes without errors.
   - Field agent roster, territory filters, and KPI cards display correctly.
   - Browser console has zero CORS or 404 chunk errors.
