import time
import uuid
import asyncio
import pytest
from fastapi import HTTPException
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from jose import jwt

from app.config import settings
from app.models.profile import Profile
from app.models.agent import Agent
from app.core.auth import verify_supabase_token, get_current_profile, get_db
from app.main import app
from app.api.v1.auth import _register_account
from app.schemas.auth import AccountRegistrationRequest


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


def test_admin_cannot_access_agent_route_endpoints(client: TestClient):
    """Route data and optimization are restricted to authenticated agent profiles."""
    admin_user_id = uuid.uuid4()
    token = create_test_token(str(admin_user_id))
    admin_profile = Profile(
        id=admin_user_id,
        full_name="Admin Tester",
        email="admin@example.com",
        role="admin",
    )
    app.dependency_overrides[get_current_profile] = lambda: admin_profile
    try:
        for method, path in (
            ("get", "/api/v1/agent/routes/today?as_of_date=2026-10-20"),
            ("post", "/api/v1/agent/routes/optimize?as_of_date=2026-10-20"),
        ):
            response = getattr(client, method)(path, headers={"Authorization": f"Bearer {token}"})
            assert response.status_code == 403
            assert "agent privileges required" in response.text.lower()
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
        assert "administrative privileges required" in response.text.lower()
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


def test_public_first_admin_bootstrap_is_disabled(client: TestClient):
    """Public callers cannot grant themselves the first admin role."""
    new_admin_id = str(uuid.uuid4())
    try:
        response = client.post(
            "/api/v1/auth/bootstrap-first-admin",
            json={
                "user_id": new_admin_id,
                "full_name": "First Admin",
                "email": "firstadmin@fos-system.internal",
            },
        )
        assert response.status_code == 403
        assert "public administrator bootstrap is disabled" in response.text.lower()
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
        assert "public administrator bootstrap is disabled" in response.text.lower()
    finally:
        app.dependency_overrides.clear()


def test_registration_keys_are_independent(monkeypatch):
    """Admin and Agent registration secrets cannot authorize each other's endpoints."""
    monkeypatch.setattr(settings, "ADMIN_REGISTRATION_KEY", "admin-test-secret")
    monkeypatch.setattr(settings, "AGENT_REGISTRATION_KEY", "agent-test-secret")
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", None)
    mock_db = AsyncMock()
    admin_payload = AccountRegistrationRequest(full_name="Test Admin", email="admin-new@example.com", password="password-123", secret_key="agent-test-secret")
    agent_payload = AccountRegistrationRequest(full_name="Test Agent", email="agent-new@example.com", password="password-123", secret_key="admin-test-secret", employee_id="AGT-999")
    with pytest.raises(HTTPException) as admin_error:
        asyncio.run(_register_account(admin_payload, "admin", mock_db))
    with pytest.raises(HTTPException) as agent_error:
        asyncio.run(_register_account(agent_payload, "agent", mock_db))
    assert admin_error.value.status_code == 403
    assert agent_error.value.status_code == 403


def test_valid_registration_key_reaches_server_configuration_check(monkeypatch):
    """A correct key is accepted by its endpoint, then registration fails closed without Auth provisioning config."""
    monkeypatch.setattr(settings, "ADMIN_REGISTRATION_KEY", "admin-test-secret")
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", None)
    mock_db = AsyncMock()
    payload = AccountRegistrationRequest(full_name="Test Admin", email="admin-new@example.com", password="password-123", secret_key="admin-test-secret")
    with pytest.raises(HTTPException) as error:
        asyncio.run(_register_account(payload, "admin", mock_db))
    assert error.value.status_code == 503
    assert "server-side supabase" in error.value.detail.lower()

