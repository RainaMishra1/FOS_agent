import sys
from pathlib import Path
from contextlib import asynccontextmanager

# Ensure backend root is on sys.path for direct python execution
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.v1.api import api_router
from app.db import engine



@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions: ensure new columns exist without dropping data
    try:
        from sqlalchemy import text
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE agents ADD COLUMN IF NOT EXISTS address VARCHAR(500);"))
            await conn.execute(text("ALTER TABLE agents ADD COLUMN IF NOT EXISTS location_source VARCHAR(50) DEFAULT 'unknown' NOT NULL;"))
        from app.db.seed import seed_database_if_needed
        await seed_database_if_needed()
    except Exception as exc:
        pass
    yield
    # Shutdown actions
    await engine.dispose()



app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend API for Location-Based Field Agent Management System",
    version="0.1.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan,
)

# CORS Middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(api_router, prefix="/api")
from app.api.v1 import health
app.include_router(health.router)


@app.get("/", tags=["Root"])
async def root():
    return {
        "service": settings.PROJECT_NAME,
        "docs": f"{settings.API_V1_STR}/docs",
        "health": "/health",
        "database_health": "/health/database",
        "agents": "/api/agents",
        "customers": "/api/customers",
    }


# Force uvicorn reload on seed update
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.PORT, reload=settings.DEBUG)


