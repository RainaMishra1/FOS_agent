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
    installed_extensions: List[ExtensionInfo] = []
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
    if settings.ENVIRONMENT.lower() == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Database connectivity check is disabled in production.",
        )

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

        return DatabaseCheckResponse(
            status="connected" if postgis_enabled else "connected_without_postgis",
            environment=settings.ENVIRONMENT,
            database_connected=True,
            postgis_enabled=postgis_enabled,
            postgis_version=postgis_version,
            installed_extensions=extensions,
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
            error=f"{exc.__class__.__name__}: {safe_error}",
            timestamp=datetime.now(timezone.utc).isoformat(),
        )


