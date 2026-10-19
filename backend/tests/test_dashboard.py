import uuid
from datetime import date, datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock
from fastapi.testclient import TestClient

from app.models.profile import Profile
from app.models.agent import Agent
from app.models.customer import Customer
from app.models.lead import Lead
from app.models.visit import Visit
from app.models.assignment import Assignment
from app.core.auth import get_current_profile, get_db
from app.main import app
from tests.test_auth import create_test_token


def test_dashboard_summary_requires_authentication(client: TestClient):
    """GET /api/v1/dashboard/summary must reject requests without an Authorization header."""
    response = client.get("/api/v1/dashboard/summary")
    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers


def test_dashboard_summary_rejects_agent_role(client: TestClient):
    """GET /api/v1/dashboard/summary must return 403 when called by a user with role 'agent'."""
    agent_user_id = uuid.uuid4()
    agent_token = create_test_token(str(agent_user_id))

    agent_profile = Profile(
        id=agent_user_id,
        full_name="Field Agent Bob",
        email="bob@example.com",
        role="agent",
    )

    app.dependency_overrides[get_current_profile] = lambda: agent_profile
    try:
        response = client.get(
            "/api/v1/dashboard/summary",
            headers={"Authorization": f"Bearer {agent_token}"},
        )
        assert response.status_code == 403
        assert "administrative privileges required" in response.text.lower()
    finally:
        app.dependency_overrides.clear()


def test_dashboard_summary_success_for_admin_empty_database(client: TestClient):
    """
    When accessed by an Administrator on an empty database,
    the endpoint returns 200 OK with zeroed metrics and empty collections without error.
    """
    admin_user_id = uuid.uuid4()
    admin_token = create_test_token(str(admin_user_id))

    admin_profile = Profile(
        id=admin_user_id,
        full_name="Admin Chief",
        email="admin@example.com",
        role="admin",
    )

    mock_db = AsyncMock()
    # Mock scalars to return 0 for counts
    mock_db.scalar.return_value = 0
    # Mock execute for queries to return empty lists
    mock_result = MagicMock()
    mock_result.unique.return_value.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result

    app.dependency_overrides[get_current_profile] = lambda: admin_profile
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        response = client.get(
            "/api/v1/dashboard/summary",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "kpi" in data
        assert data["kpi"]["total_field_agents"] == 0
        assert data["kpi"]["agents_currently_active"] == 0
        assert data["kpi"]["total_customers"] == 0
        assert data["kpi"]["visits_scheduled_today"] == 0
        assert data["kpi"]["visits_completed_today"] == 0
        assert data["kpi"]["completed_percentage"] == 0.0
        assert data["kpi"]["pending_assignments"] == 0
        assert data["active_agents"] == []
        assert data["recent_assignments"] == []
        assert data["today_visits"] == []
        assert len(data["weekly_activity"]) == 7
    finally:
        app.dependency_overrides.clear()


def test_dashboard_summary_calculates_completion_rate(client: TestClient):
    """
    Verify that the backend calculates completion percentage accurately based on
    scheduled and completed visits.
    """
    admin_user_id = uuid.uuid4()
    admin_token = create_test_token(str(admin_user_id))

    admin_profile = Profile(
        id=admin_user_id,
        full_name="Admin Chief",
        email="admin@example.com",
        role="admin",
    )

    mock_db = AsyncMock()
    # Return: total_agents=5, active_agents=3, total_cust=20, total_leads=15,
    # visits_sched=10, visits_comp=8, pending_asn=2, avg_acc=14.2
    counts = [5, 3, 20, 15, 10, 8, 2]
    # For weekly activity loop (7 days * 2 queries = 14) + avg accuracy (1)
    weekly_counts = [10, 8] * 7 + [14.2]
    mock_db.scalar.side_effect = counts + weekly_counts

    mock_result = MagicMock()
    mock_result.unique.return_value.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result

    app.dependency_overrides[get_current_profile] = lambda: admin_profile
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        response = client.get(
            "/api/v1/dashboard/summary",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["kpi"]["total_field_agents"] == 5
        assert data["kpi"]["agents_currently_active"] == 3
        assert data["kpi"]["visits_scheduled_today"] == 10
        assert data["kpi"]["visits_completed_today"] == 8
        assert data["kpi"]["completed_percentage"] == 80.0
        assert data["kpi"]["pending_assignments"] == 2
    finally:
        app.dependency_overrides.clear()


def test_agents_search_query_param(client: TestClient):
    """
    GET /api/v1/agents supports ?search= parameter and is admin-restricted.
    """
    admin_user_id = uuid.uuid4()
    admin_token = create_test_token(str(admin_user_id))

    admin_profile = Profile(
        id=admin_user_id,
        full_name="Admin Chief",
        email="admin@example.com",
        role="admin",
    )

    mock_db = AsyncMock()
    mock_db.scalar.return_value = 0
    mock_result = MagicMock()
    mock_result.unique.return_value.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result

    app.dependency_overrides[get_current_profile] = lambda: admin_profile
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        response = client.get(
            "/api/v1/agents?search=Marcus&status=active&territory=South&skip=0&limit=10",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert data["skip"] == 0
        assert data["limit"] == 10
    finally:
        app.dependency_overrides.clear()
