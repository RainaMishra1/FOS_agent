# Location-Based Field Agent Management System (FOS Agent)

A production-oriented web application for managing field agents, customer leads, customer visits, geographic territories, and multi-stop route optimization.

---

## Current Status: Phase 1 Complete

- **Phase 0:** Architecture, monorepo directory layout, and roadmap approved.
- **Phase 1:** Core project shell setup, environment configuration templates, frontend Next.js shell with live backend health monitor, and FastAPI `/api/v1/health` endpoint with automated tests.

---

## Tech Stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons.
- **Backend:** Python, FastAPI, Pydantic v2, Pydantic-Settings, SQLAlchemy 2.0, Uvicorn, Pytest.
- **Database:** Supabase PostgreSQL + PostGIS (geospatial distance and territory boundaries).
- **Routing:** OSRM road distance matrix + Google OR-Tools routing engine.

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
│   │   ├── config.py         # Settings & environment validation
│   │   ├── main.py           # FastAPI app & CORS configuration
│   │   └── api/
│   │       └── v1/
│   │           ├── api.py    # V1 router aggregation
│   │           └── health.py # Health check endpoint (/api/v1/health)
│   └── tests/
│       ├── conftest.py       # TestClient fixtures
│       └── test_health.py    # Automated health endpoint tests
└── frontend/
    ├── .env.example
    ├── package.json
    ├── tsconfig.json
    ├── tailwind.config.ts
    └── src/
        ├── app/
        │   ├── globals.css
        │   ├── layout.tsx
        │   └── page.tsx      # Landing shell with role portals
        ├── components/
        │   └── HealthChecker.tsx # Interactive health monitor
        └── lib/
            └── api.ts        # Typed backend API client
```

---

## Quickstart & Verification

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env from template
copy .env.example .env

# Run automated tests
pytest tests/ -v

# Start FastAPI development server
uvicorn app.main:app --reload --port 8000
```

Verify backend in your browser or curl:
- Health check: `http://localhost:8000/api/v1/health`
- Interactive Swagger docs: `http://localhost:8000/api/v1/docs`

### 2. Frontend Setup

```bash
cd frontend

# Install Node dependencies
npm install

# Create .env.local from template
copy .env.example .env.local

# Start Next.js development server
npm run dev
```

Visit `http://localhost:3000` to interact with the Operations Control shell and test the live backend health monitor.
