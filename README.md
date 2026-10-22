# Location-Based Field Agent Management System (FOS Agent)

A production-oriented web application for managing field agents, customer leads, customer visits, geographic territories, and multi-stop route optimization.

---

## Current Status: Phase 4 Complete (Admin Dashboard Real Backend Data Integration)

- **Phase 0:** Architecture, monorepo directory layout, and roadmap approved.
- **Phase 1:** Core project shell setup, environment configuration templates, frontend Next.js shell with live backend health monitor, and FastAPI `/api/v1/health` endpoint with automated tests.
- **Phase 2:** PostgreSQL + PostGIS database connection, Core SQLAlchemy 2.0 async models, Alembic migrations, and database diagnostics.
- **Phase 3:** Supabase Authentication and Role-Based Authorization with asymmetric JWKS and role isolation.
- **Phase 4:** Admin Dashboard Real Backend Data Integration:
  - Centralized typed API client (`frontend/src/lib/api.ts`) supporting Bearer token authorization and error handling.
  - Dedicated admin metrics endpoint (`GET /api/v1/dashboard/summary`) computing agent totals, customer/lead counts, visits scheduled/completed today, pending dispatches, recent assignments, and 7-day weekly run rates.
  - Replaced mock KPI cards, on-shift agents, recent assignments table, and today's visits list with authenticated backend data.
  - Integrated server-side pagination, search, and filtering in the Field Agent Directory (`GET /api/v1/agents`).
  - Implemented loading skeletons, error states with interactive retry, and empty database handlers without mock fabrication.


---

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons, `@supabase/supabase-js`.
- **Backend:** Python, FastAPI, Pydantic v2, Pydantic-Settings, SQLAlchemy 2.0 (asyncpg), `python-jose` (cryptography), `httpx`, Uvicorn, Pytest.
- **Database:** Supabase PostgreSQL + PostGIS (geospatial distance and territory boundaries).
- **Authentication:** Supabase Auth with JWT bearer tokens and server-verified profile roles.
- **Routing & Optimization:** OSRM road distance matrix + Google OR-Tools routing engine.

---

## Directory Structure

```text
FOS_agent/
├── .gitignore
├── README.md
├── backend/
│   ├── .env.example
│   ├── requirements.txt
│   ├── app/
│   │   ├── config.py             # Settings & environment validation
│   │   ├── main.py               # FastAPI app, CORS, lifespan, sys.path
│   │   ├── core/
│   │   │   └── auth.py           # Supabase JWT verification & role dependencies
│   │   ├── db/
│   │   │   ├── session.py        # SQLAlchemy 2.0 asyncpg engine & get_db
│   │   │   └── diagnose.py       # DB & PostGIS diagnostic utilities
│   │   ├── models/               # Profile, Agent, Visit, Customer, LocationLog
│   │   ├── schemas/              # Pydantic v2 schemas for agents, visits, auth
│   │   └── api/
│   │       └── v1/
│   │           ├── api.py        # V1 router aggregation
│   │           ├── auth.py       # /auth/me, bootstrap & provisioning
│   │           ├── agents.py     # Role-guarded agents endpoints
│   │           ├── customers.py  # Authenticated customer endpoints
│   │           ├── visits.py     # Role-isolated field visits
│   │           └── health.py     # Health checks
│   └── tests/
│       ├── conftest.py           # TestClient fixtures
│       ├── test_health.py        # Automated health endpoint tests
│       ├── test_database.py      # Database configuration tests
│       └── test_auth.py          # Token verification & role isolation tests
└── frontend/
    ├── .env.example
    ├── package.json
    ├── tsconfig.json
    ├── tailwind.config.ts
    └── src/
        ├── app/
        │   ├── globals.css
        │   ├── layout.tsx        # Root layout with AuthProvider
        │   ├── page.tsx          # Admin Operations Overview
        │   ├── login/
        │   │   └── page.tsx      # Supabase Sign In with role-based routing
        │   └── agent/
        │       ├── layout.tsx    # Mobile agent layout with route guard
        │       └── dashboard/    # Agent field dashboard
        ├── components/
        │   ├── AppShell.tsx      # Admin shell with route protection & logout
        │   ├── HealthChecker.tsx # Interactive health monitor
        │   └── agent/
        │       └── AgentLayout.tsx # Mobile agent portal with logout
        ├── context/
        │   ├── AuthContext.tsx   # Supabase session persistence & role sync
        │   └── AgentContext.tsx  # Agent operational state
        └── lib/
            ├── api.ts            # Typed backend API client
            └── supabaseClient.ts # Browser Supabase client (anon key only)
```

---

## Authentication & Authorization Architecture

### 1. Token Verification Strategy
FastAPI does not assume a legacy JWT secret. The verification engine (`app/core/auth.py`):
1. Reads the unverified token header to inspect the algorithm (`alg`) and key ID (`kid`).
2. If `alg` is asymmetric (`RS256` or `ES256`), fetches and caches the project's JWKS from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
3. If `alg` is `HS256`, verifies the signature using `SUPABASE_JWT_SECRET`.
4. As a resilient fallback, validates against Supabase Auth's user endpoint `GET {SUPABASE_URL}/auth/v1/user` with the public anonymous key.
5. Derives the authenticated user UUID from `sub`.
6. Queries the database `profiles` table to load application permissions and the user's role.

### 2. Role-Based Permissions
- **`admin`**: Full access to all operations, listing field agents (`GET /api/v1/agents`), viewing any agent's telemetry, managing all scheduled visits, and provisioning administrators.
- **`agent`**: Access to their own profile (`GET /api/v1/auth/me`), their own operational record (`GET /api/v1/agents/me`), submitting live GPS coordinates (`PATCH /api/v1/agents/me/location`), and viewing/updating only their own assigned visits (`GET /api/v1/visits`, `PATCH /api/v1/visits/{id}/status`).
- **Privacy Isolation**: Any attempt by a field agent to query another agent's records or visit schedule is rejected with `403 Forbidden` at the API level.

### 3. Secure First Administrator Provisioning
Users can never assign themselves administrative privileges:
1. **Initial Bootstrap (`POST /api/v1/auth/bootstrap-first-admin`)**:
   - Only functions when `SELECT COUNT(id) FROM profiles WHERE role = 'admin'` is `0`.
   - As soon as the first administrator is provisioned, this endpoint is permanently disabled and returns `403 Forbidden`.
2. **Subsequent Administrators (`POST /api/v1/auth/provision-admin`)**:
   - Strictly protected with the `require_admin` dependency.
   - Can only be invoked by an active, authenticated administrator.

---

## Quickstart & Verification

### 1. Backend Setup

```bash
cd backend

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

7

Backend URLs:
- Health check: `http://localhost:8000/api/v1/health`
- Auth profile: `http://localhost:8000/api/v1/auth/me`
- Interactive Swagger docs: `http://localhost:8000/api/v1/docs`

### 2. Frontend Setup

```bash
cd frontend

# Install Node dependencies
npm install

# Start Next.js development server
npm run dev
```

Visit `http://localhost:3000`:
- Unauthenticated requests automatically redirect to `http://localhost:3000/login`.
- Logging in as an Administrator redirects to the Operations Control Center (`/`).
- Logging in as a Field Agent redirects to the Field Agent Mobile Dashboard (`/agent/dashboard`).
- Clicking Sign Out in either portal terminates the session and returns to `/login`.
