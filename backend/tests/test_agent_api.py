import uuid
from datetime import date, datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock
from fastapi.testclient import TestClient

from app.models.profile import Profile
from app.models.agent import Agent
from app.models.customer import Customer
from app.models.visit import Visit
from app.core.auth import get_current_profile, get_db
from app.main import app
from tests.test_auth import create_test_token


def test_agent_endpoints_require_authentication(client: TestClient):
    """All /api/v1/agent endpoints must reject requests without an Authorization header."""
    fake_id = uuid.uuid4()
    endpoints = [
        ("GET", "/api/v1/agent/me"),
        ("GET", "/api/v1/agent/dashboard"),
        ("GET", "/api/v1/agent/visits"),
        ("GET", "/api/v1/agent/visit-history"),
        ("GET", f"/api/v1/agent/visits/{fake_id}"),
        ("PATCH", f"/api/v1/agent/visits/{fake_id}/status"),
        ("PATCH", "/api/v1/agent/duty"),
    ]

    for method, path in endpoints:
        if method == "GET":
            response = client.get(path)
        else:
            response = client.patch(path, json={})
        assert response.status_code == 401, f"{method} {path} should return 401 without auth"
        assert "WWW-Authenticate" in response.headers


def test_agent_endpoints_reject_unauthorized_role(client: TestClient):
    """Users with non-agent/admin roles or without an agent entity must receive 403."""
    user_id = uuid.uuid4()
    token = create_test_token(str(user_id))

    # Profile with role "customer"
    customer_profile = Profile(
        id=user_id,
        full_name="Jane Customer",
        email="customer@example.com",
        role="customer",
    )

    app.dependency_overrides[get_current_profile] = lambda: customer_profile
    try:
        response = client.get(
            "/api/v1/agent/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403
        assert "agent privileges required" in response.text.lower()
    finally:
        app.dependency_overrides.clear()


def test_agent_profile_without_agent_record_returns_403(client: TestClient):
    """An account marked role='agent' but without an operational Agent entity returns 403."""
    user_id = uuid.uuid4()
    token = create_test_token(str(user_id))

    unlinked_agent_profile = Profile(
        id=user_id,
        full_name="Agent Without Record",
        email="unlinked@example.com",
        role="agent",
    )
    unlinked_agent_profile.agent = None

    app.dependency_overrides[get_current_profile] = lambda: unlinked_agent_profile
    try:
        response = client.get(
            "/api/v1/agent/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403
        assert "no active field agent record" in response.text.lower()
    finally:
        app.dependency_overrides.clear()


def test_get_agent_me_success(client: TestClient):
    """GET /api/v1/agent/me returns the authenticated agent's profile and task counts."""
    user_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    token = create_test_token(str(user_id))

    agent_entity = Agent(
        id=agent_id,
        profile_id=user_id,
        agent_code="AGT-200",
        status="active",
        territory="Indiranagar Zone",
        battery_level=88,
        shift_hours="09:00 - 18:00",
    )
    profile = Profile(
        id=user_id,
        full_name="Agent Priya Sharma",
        email="priya@example.com",
        phone="+91 98765 43210",
        role="agent",
    )
    profile.agent = agent_entity
    agent_entity.profile = profile

    mock_db = AsyncMock()
    # assigned_tasks = 8, completed_visits = 5
    mock_db.scalar.side_effect = [8, 5]

    app.dependency_overrides[get_current_profile] = lambda: profile
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        response = client.get(
            "/api/v1/agent/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(agent_id)
        assert data["agent_code"] == "AGT-200"
        assert data["full_name"] == "Agent Priya Sharma"
        assert data["territory"] == "Indiranagar Zone"
        assert data["assigned_tasks"] == 8
        assert data["completed_tasks"] == 5
    finally:
        app.dependency_overrides.clear()


def test_agent_dashboard_data_isolation_and_stats(client: TestClient):
    """GET /api/v1/agent/dashboard calculates stats and scopes visits strictly to the agent."""
    user_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    token = create_test_token(str(user_id))

    agent_entity = Agent(
        id=agent_id,
        profile_id=user_id,
        agent_code="AGT-101",
        status="active",
        territory="South Territory",
        battery_level=95,
        shift_hours="08:00 - 17:00",
    )
    profile = Profile(
        id=user_id,
        full_name="Marcus Vance",
        email="marcus@example.com",
        role="agent",
    )
    profile.agent = agent_entity
    agent_entity.profile = profile

    # Customer
    customer = Customer(
        id=uuid.uuid4(),
        name="Apex Industrial Logistics",
        company_name="Apex Logistics",
        address="100 Harbor Way, Dock 4",
        city="Bengaluru",
        contact_person="Ravi Verma",
        phone="+91 99000 11222",
    )

    # 3 visits today: 1 completed, 1 in_progress, 1 pending
    today = datetime.now(timezone.utc).date()
    v1 = Visit(
        id=uuid.uuid4(),
        visit_code="VST-101",
        customer_id=customer.id,
        agent_id=agent_id,
        scheduled_date=today,
        status="completed",
        order_index=1,
        customer=customer,
    )
    v2 = Visit(
        id=uuid.uuid4(),
        visit_code="VST-102",
        customer_id=customer.id,
        agent_id=agent_id,
        scheduled_date=today,
        status="in_progress",
        order_index=2,
        customer=customer,
    )
    v3 = Visit(
        id=uuid.uuid4(),
        visit_code="VST-103",
        customer_id=customer.id,
        agent_id=agent_id,
        scheduled_date=today,
        status="pending",
        order_index=3,
        customer=customer,
    )

    mock_db = AsyncMock()

    # Mock execute returns:
    # 1. today visits
    mock_res_today = MagicMock()
    mock_res_today.unique.return_value.scalars.return_value.all.return_value = [v1, v2, v3]
    # 2. upcoming visits
    mock_res_upcoming = MagicMock()
    mock_res_upcoming.unique.return_value.scalars.return_value.all.return_value = []
    # 3. history visits
    mock_res_history = MagicMock()
    mock_res_history.unique.return_value.scalars.return_value.all.return_value = [v1]

    mock_db.execute.side_effect = [mock_res_today, mock_res_upcoming, mock_res_history]
    # scalar counts for assigned_tasks, total_completed
    mock_db.scalar.side_effect = [3, 1]

    app.dependency_overrides[get_current_profile] = lambda: profile
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        response = client.get(
            "/api/v1/agent/dashboard",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        data = response.json()

        # Check KPI stats
        assert data["stats"]["today_total"] == 3
        assert data["stats"]["today_completed"] == 1
        assert data["stats"]["today_remaining"] == 2
        assert data["stats"]["completion_percentage"] == 33.3
        assert data["stats"]["next_visit"]["visit_code"] == "VST-102"

        # Check visit items
        assert len(data["today_visits"]) == 3
        assert data["today_visits"][0]["customer_name"] == "Apex Industrial Logistics"
        assert len(data["recent_history"]) == 1
    finally:
        app.dependency_overrides.clear()


def test_agent_visit_details_cross_agent_isolation(client: TestClient):
    """
    GET /api/v1/agent/visits/{id} returns:
    - 200 if the visit is assigned to the authenticated agent.
    - 403 Forbidden if the visit belongs to a different agent.
    - 404 Not Found if the visit does not exist.
    """
    user_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    other_agent_id = uuid.uuid4()
    token = create_test_token(str(user_id))

    agent_entity = Agent(id=agent_id, profile_id=user_id, agent_code="AGT-101", status="active")
    profile = Profile(id=user_id, full_name="Agent One", role="agent")
    profile.agent = agent_entity

    customer = Customer(
        id=uuid.uuid4(),
        name="Tech Parks Ltd",
        company_name="Tech Parks",
        address="Tower 2, Outer Ring Road",
        city="Bengaluru",
    )

    my_visit_id = uuid.uuid4()
    my_visit = Visit(
        id=my_visit_id,
        visit_code="VST-MY",
        customer_id=customer.id,
        agent_id=agent_id,
        scheduled_date=datetime.now(timezone.utc).date(),
        status="in_progress",
        customer=customer,
    )

    other_visit_id = uuid.uuid4()
    other_visit = Visit(
        id=other_visit_id,
        visit_code="VST-OTHER",
        customer_id=customer.id,
        agent_id=other_agent_id,  # Assigned to another agent!
        scheduled_date=datetime.now(timezone.utc).date(),
        status="pending",
        customer=customer,
    )

    mock_db = AsyncMock()

    app.dependency_overrides[get_current_profile] = lambda: profile
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        # Case 1: Own visit -> 200 OK
        mock_res_my = MagicMock()
        mock_res_my.unique.return_value.scalars.return_value.first.return_value = my_visit
        mock_db.execute.return_value = mock_res_my

        res_own = client.get(
            f"/api/v1/agent/visits/{my_visit_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_own.status_code == 200
        assert res_own.json()["id"] == str(my_visit_id)
        assert res_own.json()["customer_name"] == "Tech Parks Ltd"

        # Case 2: Other agent's visit -> 403 Forbidden
        mock_res_other = MagicMock()
        mock_res_other.unique.return_value.scalars.return_value.first.return_value = other_visit
        mock_db.execute.return_value = mock_res_other

        res_other = client.get(
            f"/api/v1/agent/visits/{other_visit_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_other.status_code == 403
        assert "cannot view another field agent" in res_other.text.lower()

        # Case 3: Missing visit -> 404 Not Found
        mock_res_none = MagicMock()
        mock_res_none.unique.return_value.scalars.return_value.first.return_value = None
        mock_db.execute.return_value = mock_res_none

        res_none = client.get(
            f"/api/v1/agent/visits/{uuid.uuid4()}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_none.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_agent_visit_status_transitions_and_validation(client: TestClient):
    """
    PATCH /api/v1/agent/visits/{id}/status validates:
    - Permitted status transitions.
    - Prevents reopening completed visits.
    - Rejects invalid status values.
    - Prevents updating another agent's visit.
    """
    user_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    other_agent_id = uuid.uuid4()
    token = create_test_token(str(user_id))

    agent_entity = Agent(id=agent_id, profile_id=user_id, agent_code="AGT-101", status="active")
    profile = Profile(id=user_id, full_name="Agent One", role="agent")
    profile.agent = agent_entity

    customer = Customer(
        id=uuid.uuid4(),
        name="Global Logistics",
        company_name="Global Logistics",
        address="55 Airport Road",
    )

    mock_db = AsyncMock()
    app.dependency_overrides[get_current_profile] = lambda: profile
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        # Case 1: Invalid status string -> 400
        res_bad_status = client.patch(
            f"/api/v1/agent/visits/{uuid.uuid4()}/status",
            json={"status": "invalid_status_abc"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_bad_status.status_code == 400
        assert "invalid status" in res_bad_status.text.lower()

        # Case 2: Attempt to modify another agent's visit -> 403
        other_visit = Visit(
            id=uuid.uuid4(),
            agent_id=other_agent_id,
            status="pending",
            customer=customer,
        )
        mock_res_other = MagicMock()
        mock_res_other.unique.return_value.scalars.return_value.first.return_value = other_visit
        mock_db.execute.return_value = mock_res_other

        res_other = client.patch(
            f"/api/v1/agent/visits/{other_visit.id}/status",
            json={"status": "in_progress"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_other.status_code == 403

        # Case 3: Attempt to reopen a completed visit -> 400
        completed_visit = Visit(
            id=uuid.uuid4(),
            agent_id=agent_id,
            status="completed",
            customer=customer,
        )
        mock_res_comp = MagicMock()
        mock_res_comp.unique.return_value.scalars.return_value.first.return_value = completed_visit
        mock_db.execute.return_value = mock_res_comp

        res_reopen = client.patch(
            f"/api/v1/agent/visits/{completed_visit.id}/status",
            json={"status": "in_progress"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_reopen.status_code == 400
        assert "completed visit cannot be reopened" in res_reopen.text.lower()

        # Case 4: Valid transition to in_progress -> 200 OK
        pending_visit = Visit(
            id=uuid.uuid4(),
            agent_id=agent_id,
            status="pending",
            customer=customer,
        )
        mock_res_pending = MagicMock()
        mock_res_pending.unique.return_value.scalars.return_value.first.return_value = pending_visit
        mock_db.execute.return_value = mock_res_pending

        res_checkin = client.patch(
            f"/api/v1/agent/visits/{pending_visit.id}/status",
            json={"status": "in_progress", "geofence_verified": True},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_checkin.status_code == 200
        assert pending_visit.status == "in_progress"
        assert pending_visit.geofence_verified is True
        mock_db.commit.assert_called()

        # Case 5: Valid completion with notes -> 200 OK
        res_done = client.patch(
            f"/api/v1/agent/visits/{pending_visit.id}/status",
            json={"status": "completed", "completion_notes": "Delivered consignment successfully."},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_done.status_code == 200
        assert pending_visit.status == "completed"
        assert pending_visit.completion_notes == "Delivered consignment successfully."
    finally:
        app.dependency_overrides.clear()


def test_agent_duty_status_toggle(client: TestClient):
    """PATCH /api/v1/agent/duty updates agent operational duty status."""
    user_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    token = create_test_token(str(user_id))

    agent_entity = Agent(
        id=agent_id,
        profile_id=user_id,
        agent_code="AGT-101",
        status="active",
        territory="South Zone",
    )
    profile = Profile(id=user_id, full_name="Agent One", role="agent")
    profile.agent = agent_entity

    mock_db = AsyncMock()
    app.dependency_overrides[get_current_profile] = lambda: profile
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        # Invalid duty -> 400
        res_bad = client.patch(
            "/api/v1/agent/duty",
            json={"status": "sleeping_on_job"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_bad.status_code == 400

        # Valid duty update to off_duty -> 200
        res_off = client.patch(
            "/api/v1/agent/duty",
            json={"status": "off_duty"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_off.status_code == 200
        assert agent_entity.status == "off_duty"
        mock_db.commit.assert_called()
    finally:
        app.dependency_overrides.clear()


def test_agent_location_update_gps_and_manual(client: TestClient):
    """
    PATCH /api/v1/agent/me/location:
    - GPS update sets location_source='gps' and records accuracy.
    - Manual update sets location_source='manual' and forces gps_accuracy=None.
    """
    user_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    token = create_test_token(str(user_id))

    agent_entity = Agent(
        id=agent_id,
        profile_id=user_id,
        agent_code="AGT-101",
        status="active",
        territory="South Zone",
        current_latitude=12.9000,
        current_longitude=77.5000,
        location_source="unknown",
    )
    profile = Profile(id=user_id, full_name="Agent One", role="agent")
    profile.agent = agent_entity

    mock_db = AsyncMock()
    app.dependency_overrides[get_current_profile] = lambda: profile
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        # 1. GPS Auto-Detected update
        res_gps = client.patch(
            "/api/v1/agent/me/location",
            json={
                "latitude": 12.9716,
                "longitude": 77.5946,
                "gps_accuracy": 14.5,
                "battery_level": 92,
                "location_source": "gps",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_gps.status_code == 200
        assert agent_entity.current_latitude == 12.9716
        assert agent_entity.current_longitude == 77.5946
        assert agent_entity.location_source == "gps"
        assert agent_entity.battery_level == 92
        mock_db.commit.assert_called()

        # Check logged breadcrumb
        added_log = mock_db.add.call_args[0][0]
        assert added_log.gps_accuracy == 14.5

        # 2. Manual Coordinate update
        res_manual = client.patch(
            "/api/v1/agent/me/location",
            json={
                "latitude": 12.9352,
                "longitude": 77.6245,
                "gps_accuracy": 10.0,  # Should be stripped for manual
                "battery_level": 88,
                "location_source": "manual",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_manual.status_code == 200
        assert agent_entity.current_latitude == 12.9352
        assert agent_entity.current_longitude == 77.6245
        assert agent_entity.location_source == "manual"

        # Check that manual breadcrumb stripped gps_accuracy
        added_manual_log = mock_db.add.call_args[0][0]
        assert added_manual_log.gps_accuracy is None
    finally:
        app.dependency_overrides.clear()


def test_agent_location_bounds_validation(client: TestClient):
    """PATCH /api/v1/agent/me/location rejects invalid latitude (-90 to 90) and longitude (-180 to 180)."""
    user_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    token = create_test_token(str(user_id))

    agent_entity = Agent(id=agent_id, profile_id=user_id, status="active")
    profile = Profile(id=user_id, full_name="Agent One", role="agent")
    profile.agent = agent_entity

    app.dependency_overrides[get_current_profile] = lambda: profile
    app.dependency_overrides[get_db] = lambda: AsyncMock()

    try:
        # Invalid Latitude > 90
        res_lat_high = client.patch(
            "/api/v1/agent/me/location",
            json={"latitude": 95.5, "longitude": 77.5946, "location_source": "manual"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_lat_high.status_code == 422

        # Invalid Latitude < -90
        res_lat_low = client.patch(
            "/api/v1/agent/me/location",
            json={"latitude": -91.0, "longitude": 77.5946, "location_source": "manual"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_lat_low.status_code == 422

        # Invalid Longitude > 180
        res_lng_high = client.patch(
            "/api/v1/agent/me/location",
            json={"latitude": 12.9716, "longitude": 185.0, "location_source": "manual"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_lng_high.status_code == 422

        # Invalid Longitude < -180
        res_lng_low = client.patch(
            "/api/v1/agent/me/location",
            json={"latitude": 12.9716, "longitude": -190.0, "location_source": "manual"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_lng_low.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_manual_location_cannot_satisfy_geofence(client: TestClient):
    """
    Security check: Manual coordinates must not satisfy server-side geofencing.
    If agent.location_source == 'manual', geofence_verified is forced to False.
    """
    user_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    visit_id = uuid.uuid4()
    token = create_test_token(str(user_id))

    agent_entity = Agent(
        id=agent_id,
        profile_id=user_id,
        status="active",
        location_source="manual",
    )
    profile = Profile(id=user_id, full_name="Agent One", role="agent")
    profile.agent = agent_entity

    visit = Visit(
        id=visit_id,
        visit_code="VST-999",
        agent_id=agent_id,
        customer_id=uuid.uuid4(),
        scheduled_date=date.today(),
        scheduled_time="11:00 AM",
        status="pending",
        geofence_verified=False,
    )

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.unique.return_value.scalars.return_value.first.return_value = visit
    mock_db.execute.return_value = mock_result

    app.dependency_overrides[get_current_profile] = lambda: profile
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        # Agent attempts to claim geofence_verified=True while on manual location
        res = client.patch(
            f"/api/v1/agent/visits/{visit_id}/status",
            json={"status": "in_progress", "geofence_verified": True},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        # Must be rejected because location_source is manual
        assert visit.geofence_verified is False

        # Now simulate verified GPS source
        agent_entity.location_source = "gps"
        res_gps = client.patch(
            f"/api/v1/agent/visits/{visit_id}/status",
            json={"status": "in_progress", "geofence_verified": True},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res_gps.status_code == 200
        # Now geofence_verified is accepted
        assert visit.geofence_verified is True
    finally:
        app.dependency_overrides.clear()

