import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.db.session import engine, async_session_factory, get_db


def test_database_url_configuration():
    """Verify that DATABASE_URL is loaded and uses the asyncpg driver."""
    assert settings.DATABASE_URL is not None
    assert settings.DATABASE_URL.startswith("postgresql+asyncpg://"), (
        f"DATABASE_URL must start with 'postgresql+asyncpg://', got: {settings.DATABASE_URL.split('://')[0]}://"
    )


def test_engine_and_session_factory():
    """Verify that SQLAlchemy 2.x async engine and session factory are properly configured."""
    assert engine is not None
    assert engine.dialect.name == "postgresql"
    assert engine.dialect.driver == "asyncpg"
    assert async_session_factory is not None


def test_health_db_endpoint(client: TestClient):
    """Test the development-only /api/v1/health/db connectivity check endpoint."""
    response = client.get("/api/v1/health/db")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "database_connected" in data
    assert "postgis_enabled" in data
    assert "environment" in data
    assert "timestamp" in data
    # Ensure credentials are never exposed in the response
    response_text = response.text.lower()
    assert "password" not in response_text or data.get("error") is not None
