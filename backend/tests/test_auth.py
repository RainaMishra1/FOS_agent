import time
import uuid
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from jose import jwt

from app.config import settings
from app.models.profile import Profile
from app.models.agent import Agent
from app.core.auth import verify_supabase_token, get_current_profile, get_db
from app.main import app


def create_test_token(sub: str, exp_offset: int = 3600, secret: str = None) -> str:
    """Helper to generate HS256 tokens for testing."""
    key = secret or settings.SUPABASE_JWT_SECRET or "change_me_in_production"
    payload = {
        "sub": sub,
        "email": f"user-{sub[:8]}@example.com",
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + exp_offset,
    }
    return jwt.encode(payload, key, algorithm="HS256")


def test_missing_token_returns_401(client: TestClient):
    """Endpoints requiring authentication must return 401 when Authorization header is absent."""
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_invalid_token_returns_401(client: TestClient):
    """Endpoints must reject forged or corrupted bearer tokens with 401."""
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not.a.valid.jwt.token"},
    )
    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers


def test_expired_token_returns_401(client: TestClient):
    """Endpoints must reject expired tokens with 401 and invalid_token error description."""
    user_id = str(uuid.uuid4())
    expired_token = create_test_token(user_id, exp_offset=-3600)

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert response.status_code == 401
    assert "expired" in response.text.lower()


def test_missing_profile_returns_403(client: TestClient):
    """
    A user with a valid Supabase Auth token whose Profile has not been provisioned in the
    application database must receive 403 Forbidden rather than being given default access.
    """
    unprovisioned_id = str(uuid.uuid4())
    valid_token = create_test_token(unprovisioned_id, exp_offset=3600)

    # Mock DB query to return None (no profile found)
    mock_db = AsyncMock()
    mock_db.execute.return_value.scalars.return_value.first.return_value = None

    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {valid_token}"},
        )
        assert response.status_code == 403
        assert "not provisioned" in response.text.lower()
    finally:
        app.dependency_overrides.clear()


def test_role_restriction_agent_cannot_access_admin_agents_list(client: TestClient):
    """
    Field agents ('agent' role) must receive 403 Forbidden when attempting
    to access administrative agent listings.
    """
    agent_user_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    valid_token = create_test_token(str(agent_user_id))

    mock_profile = Profile(
        id=agent_user_id,
        full_name="Agent Tester",
        email="agent@example.com",
        role="agent",
    )
    mock_agent = Agent(
        id=agent_id,
        profile_id=agent_user_id,
        agent_code="AGT-999",
        status="active",
        territory="South",
    )
    mock_profile.agent = mock_agent

    # Override get_current_profile to return agent profile
    app.dependency_overrides[get_current_profile] = lambda: mock_profile
    try:
        response = client.get(
            "/api/v1/agents",
            headers={"Authorization": f"Bearer {valid_token}"},
        )
        assert response.status_code == 403
        assert "administrative privileges required" in response.text.lower()
    finally:
        app.dependency_overrides.clear()


def test_role_permission_admin_can_access_agents_list(client: TestClient):
    """
    Administrators ('admin' role) can access agent list operations.
    """
    admin_user_id = uuid.uuid4()
    valid_token = create_test_token(str(admin_user_id))

    admin_profile = Profile(
        id=admin_user_id,
        full_name="Admin Chief",
        email="admin@example.com",
        role="admin",
    )

    mock_db = AsyncMock()
    mock_db.scalar.return_value = 0
    mock_db.execute.return_value.scalars.return_value.all.return_value = []

    app.dependency_overrides[get_current_profile] = lambda: admin_profile
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        response = client.get(
            "/api/v1/agents",
            headers={"Authorization": f"Bearer {valid_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
    finally:
        app.dependency_overrides.clear()


def test_agent_cannot_access_other_agent_record(client: TestClient):
    """
    Field agents cannot spy on or retrieve other agents' private operational records.
    """
    agent_user_id = uuid.uuid4()
    my_agent_id = uuid.uuid4()
    other_agent_id = uuid.uuid4()
    valid_token = create_test_token(str(agent_user_id))

    agent_profile = Profile(
        id=agent_user_id,
        full_name="Agent Marcus",
        email="marcus@example.com",
        role="agent",
    )
    mock_agent = Agent(
        id=my_agent_id,
        profile_id=agent_user_id,
        agent_code="AGT-001",
        status="active",
    )
    agent_profile.agent = mock_agent

    app.dependency_overrides[get_current_profile] = lambda: agent_profile
    try:
        # Requesting another agent's ID
        response = client.get(
            f"/api/v1/agents/{other_agent_id}",
            headers={"Authorization": f"Bearer {valid_token}"},
        )
        assert response.status_code == 403
        assert "own operational data" in response.text.lower()
    finally:
        app.dependency_overrides.clear()


def test_agent_cannot_access_other_agents_visits(client: TestClient):
    """
    Field agents querying visits for another agent's ID must be rejected with 403.
    """
    agent_user_id = uuid.uuid4()
    my_agent_id = uuid.uuid4()
    other_agent_id = uuid.uuid4()
    valid_token = create_test_token(str(agent_user_id))

    agent_profile = Profile(
        id=agent_user_id,
        full_name="Agent Sarah",
        email="sarah@example.com",
        role="agent",
    )
    mock_agent = Agent(
        id=my_agent_id,
        profile_id=agent_user_id,
        agent_code="AGT-002",
        status="active",
    )
    agent_profile.agent = mock_agent

    app.dependency_overrides[get_current_profile] = lambda: agent_profile
    try:
        response = client.get(
            f"/api/v1/visits?agent_id={other_agent_id}",
            headers={"Authorization": f"Bearer {valid_token}"},
        )
        assert response.status_code == 403
        assert "cannot access other agents" in response.text.lower()
    finally:
        app.dependency_overrides.clear()


def test_bootstrap_first_admin_success_when_zero_admins(client: TestClient):
    """When no administrators exist in the database, initial admin bootstrap succeeds."""
    new_admin_id = str(uuid.uuid4())
    mock_db = AsyncMock()
    # 0 existing admins
    mock_db.scalar.side_effect = [0, None]
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        response = client.post(
            "/api/v1/auth/bootstrap-first-admin",
            json={
                "user_id": new_admin_id,
                "full_name": "First Admin",
                "email": "firstadmin@fos-system.internal",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "admin"
        assert data["full_name"] == "First Admin"
    finally:
        app.dependency_overrides.clear()


def test_bootstrap_first_admin_rejected_when_admin_already_exists(client: TestClient):
    """When an administrator already exists, self-bootstrap is disabled with 403 Forbidden."""
    candidate_id = str(uuid.uuid4())
    mock_db = AsyncMock()
    # 1 existing admin already in DB
    mock_db.scalar.return_value = 1

    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        response = client.post(
            "/api/v1/auth/bootstrap-first-admin",
            json={
                "user_id": candidate_id,
                "full_name": "Sneaky Self-Promoter",
                "email": "sneaky@example.com",
            },
        )
        assert response.status_code == 403
        assert "bootstrap disabled" in response.text.lower()
    finally:
        app.dependency_overrides.clear()

