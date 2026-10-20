import asyncio
from datetime import datetime, timezone
from typing import List, Optional
import re
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    project: str
    environment: str
    version: str
    timestamp: str


class ExtensionInfo(BaseModel):
    name: str
    version: str


class DatabaseCheckResponse(BaseModel):
    status: str
    environment: str
    database_connected: bool
    postgis_enabled: bool
    postgis_version: Optional[str] = None
    postgis_full_version: Optional[str] = None
    installed_extensions: List[ExtensionInfo] = []
    existing_tables: List[str] = []
    error: Optional[str] = None
    timestamp: str


@router.get("/health", response_model=HealthResponse, tags=["Health"])
async def check_health() -> HealthResponse:
    """Returns the operational status of the FOS Agent API service."""
    return HealthResponse(
        status="healthy",
        project=settings.PROJECT_NAME,
        environment=settings.ENVIRONMENT,
        version="0.1.0",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


def _sanitize_error(error_message: str) -> str:
    """Removes sensitive credentials such as passwords and connection strings from error messages."""
    sanitized = re.sub(r"://([^:]+):([^@]+)@", r"://***:***@", error_message)
    sanitized = re.sub(r"(password\s*=\s*['\"]?)[^'\"\s]+(['\"]?)", r"\1***\2", sanitized, flags=re.IGNORECASE)
    return sanitized


@router.get("/health/database", response_model=DatabaseCheckResponse, tags=["Health"])
@router.get("/health/db", response_model=DatabaseCheckResponse, tags=["Health"])
@router.get("/db-check", response_model=DatabaseCheckResponse, tags=["Health"])
async def check_database_connectivity(
    db: AsyncSession = Depends(get_db),
) -> DatabaseCheckResponse:
    """
    Temporary development-only database connectivity and PostGIS check.
    Verifies that PostgreSQL is reachable, tests the FastAPI database dependency,
    and inspects pg_extension to check if PostGIS is enabled.
    Credentials are never exposed.
    """
    # In production, verify connectivity and PostGIS without exposing full schema tables
    is_prod = settings.ENVIRONMENT.lower() == "production"

    try:
        # 1. Verify PostgreSQL is reachable with a 7-second timeout
        await asyncio.wait_for(db.execute(text("SELECT 1")), timeout=7.0)

        # 2. Query pg_extension to check installed extensions and PostGIS
        extension_results = await asyncio.wait_for(
            db.execute(text("SELECT extname, extversion FROM pg_extension ORDER BY extname")),
            timeout=7.0,
        )
        extensions = [
            ExtensionInfo(name=row[0], version=row[1])
            for row in extension_results.fetchall()
        ]

        postgis_ext = next((ext for ext in extensions if ext.name.lower() == "postgis"), None)
        postgis_enabled = postgis_ext is not None
        postgis_version = postgis_ext.version if postgis_ext else None
        postgis_full_version = None

        if postgis_enabled and not is_prod:
            try:
                gis_ver = await asyncio.wait_for(
                    db.execute(text("SELECT PostGIS_Full_Version()")),
                    timeout=5.0,
                )
                postgis_full_version = gis_ver.scalar_one_or_none()
            except Exception:
                pass

        # 3. Query existing tables in public schema (development only)
        existing_tables: List[str] = []
        if not is_prod:
            table_results = await asyncio.wait_for(
                db.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")),
                timeout=5.0,
            )
            existing_tables = [row[0] for row in table_results.fetchall()]

        return DatabaseCheckResponse(
            status="connected" if postgis_enabled else "connected_without_postgis",
            environment=settings.ENVIRONMENT,
            database_connected=True,
            postgis_enabled=postgis_enabled,
            postgis_version=postgis_version,
            postgis_full_version=postgis_full_version,
            installed_extensions=extensions if not is_prod else [],
            existing_tables=existing_tables,
            error=None,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
    except asyncio.TimeoutError:
        return DatabaseCheckResponse(
            status="error",
            environment=settings.ENVIRONMENT,
            database_connected=False,
            postgis_enabled=False,
            postgis_version=None,
            installed_extensions=[],
            error="Connection timed out after 7 seconds. Host may be unreachable or dropping connections.",
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
    except Exception as exc:
        safe_error = _sanitize_error(str(exc))
        return DatabaseCheckResponse(
            status="error",
            environment=settings.ENVIRONMENT,
            database_connected=False,
            postgis_enabled=False,
            postgis_version=None,
            installed_extensions=[],
            error=f"{exc.__class__.__name__}: {safe_error}" if not is_prod else "Database connection failed.",
            timestamp=datetime.now(timezone.utc).isoformat(),
        )


@router.get("/health/db-diagnostics", tags=["Health"])
@router.get("/db-diagnostics", tags=["Health"])
async def get_db_diagnostics():
    """Safe database and DNS diagnostics. Does not expose credentials."""
    if settings.ENVIRONMENT.lower() == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Diagnostics endpoint is disabled in production.",
        )
    from app.db.diagnose import run_full_diagnosis
    return run_full_diagnosis()


@router.get("/health/migrate", tags=["Health"])
@router.post("/health/migrate", tags=["Health"])
async def trigger_migrations():
    """Applies Alembic migrations up to head in development environment."""
    if settings.ENVIRONMENT.lower() == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Migrations cannot be executed via HTTP in production. Run 'alembic upgrade head' as a build or release step.",
        )
    from app.db.migrate import apply_migrations_async
    try:
        res = await apply_migrations_async()
        return res
    except Exception as exc:
        safe_err = _sanitize_error(str(exc))
        return {"status": "error", "error_type": exc.__class__.__name__, "message": safe_err}


@router.get("/health/seed", tags=["Health"])
@router.post("/health/seed", tags=["Health"])
async def trigger_seed():
    """Seeds real agents, customers, leads, assignments, and visits into PostgreSQL (development only)."""
    if settings.ENVIRONMENT.lower() == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Database seeding is disabled in production.",
        )
    try:
        from app.db.seeder import run_seed
        res = await run_seed()
        return res
    except Exception as exc:
        safe_err = _sanitize_error(str(exc))
        return {"status": "exception", "error_type": exc.__class__.__name__, "error": safe_err}









