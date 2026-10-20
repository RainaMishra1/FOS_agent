import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from fastapi.testclient import TestClient

from app.models.profile import Profile
from app.models.agent import Agent
from app.core.auth import get_current_profile, get_db
from app.main import app
from tests.test_auth import create_test_token


def test_agent_endpoints_require_admin(client: TestClient):
    """POST /api/agents and GET /api/agents require admin credentials."""
    # 1. Unauthenticated request
    res = client.post("/api/agents", json={
        "auth_user_id": str(uuid.uuid4()),
        "name": "Unauthorized User",
        "email": "unauth@fos.test",
        "agent_code": "AGT-UNAUTH",
    })
    assert res.status_code == 401
    assert "WWW-Authenticate" in res.headers

    res = client.get("/api/agents")
    assert res.status_code == 401

    # 2. Agent role request (non-admin)
    agent_user_id = uuid.uuid4()
    agent_token = create_test_token(str(agent_user_id))
    agent_profile = Profile(
        id=agent_user_id,
        full_name="Regular Field Agent",
        email="agent@fos.test",
        role="agent",
    )
    agent_entity = Agent(
        id=uuid.uuid4(),
        profile_id=agent_user_id,
        agent_code="AGT-REG",
        status="active",
    )
    agent_profile.agent = agent_entity

    app.dependency_overrides[get_current_profile] = lambda: agent_profile
    try:
        # Non-admin attempting to create agent
        res = client.post(
            "/api/agents",
            json={
                "auth_user_id": str(uuid.uuid4()),
                "name": "Subordinate Agent",
                "email": "sub@fos.test",
                "agent_code": "AGT-SUB",
            },
            headers={"Authorization": f"Bearer {agent_token}"},
        )
        assert res.status_code == 403
        assert "administrative privileges required" in res.text.lower()

        # Non-admin attempting to list all agents
        res = client.get(
            "/api/agents",
            headers={"Authorization": f"Bearer {agent_token}"},
        )
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_create_agent_validation_errors(client: TestClient):
    """Validation errors on missing fields, bad email format, or short code."""
    admin_id = uuid.uuid4()
    admin_token = create_test_token(str(admin_id))
    admin_profile = Profile(
        id=admin_id,
        full_name="Admin Supervisor",
        email="admin@fos.test",
        role="admin",
    )

    app.dependency_overrides[get_current_profile] = lambda: admin_profile
    try:
        # Missing required fields
        res = client.post(
            "/api/agents",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 422

        # Invalid email format
        res = client.post(
            "/api/agents",
            json={
                "auth_user_id": str(uuid.uuid4()),
                "name": "Jane Agent",
                "email": "not-an-email",
                "agent_code": "AGT-999",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 422

        # Invalid status
        res = client.post(
            "/api/agents",
            json={
                "auth_user_id": str(uuid.uuid4()),
                "name": "Jane Agent",
                "email": "valid@email.com",
                "agent_code": "AGT-999",
                "status": "flying",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_create_agent_duplicate_code(client: TestClient):
    """Attempting to create an agent with an existing employee ID returns 409 Conflict."""
    admin_id = uuid.uuid4()
    admin_token = create_test_token(str(admin_id))
    admin_profile = Profile(
        id=admin_id,
        full_name="Admin Supervisor",
        email="admin@fos.test",
        role="admin",
    )

    # Mock DB where scalar returns an existing Agent
    mock_db = AsyncMock()
    existing_agent = Agent(
        id=uuid.uuid4(),
        profile_id=uuid.uuid4(),
        agent_code="AGT-DUPE",
        status="active",
    )
    mock_db.scalar.return_value = existing_agent

    app.dependency_overrides[get_current_profile] = lambda: admin_profile
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        res = client.post(
            "/api/agents",
            json={
                "auth_user_id": str(uuid.uuid4()),
                "name": "Duplicate Agent",
                "email": "dupe@fos.test",
                "agent_code": "AGT-DUPE",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 409
        assert "already exists" in res.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def test_create_agent_duplicate_email_with_existing_agent(client: TestClient):
    """Attempting to register an email already tied to another agent returns 409 Conflict."""
    admin_id = uuid.uuid4()
    admin_token = create_test_token(str(admin_id))
    admin_profile = Profile(
        id=admin_id,
        full_name="Admin Supervisor",
        email="admin@fos.test",
        role="admin",
    )

    existing_profile = Profile(
        id=uuid.uuid4(),
        full_name="Already Registered",
        email="existing@fos.test",
        role="agent",
    )
    existing_profile.agent = Agent(
        id=uuid.uuid4(),
        profile_id=existing_profile.id,
        agent_code="AGT-EXIST",
    )

    mock_db = AsyncMock()
    # First call checks agent_code -> None
    mock_db.scalar.return_value = None
    # execute call checks Profile with joinedload
    mock_result = MagicMock()
    mock_result.unique.return_value.scalars.return_value.first.return_value = existing_profile
    mock_db.execute.return_value = mock_result

    app.dependency_overrides[get_current_profile] = lambda: admin_profile
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        res = client.post(
            "/api/agents",
            json={
                "auth_user_id": str(uuid.uuid4()),
                "name": "New Name",
                "email": "existing@fos.test",
                "agent_code": "AGT-BRANDNEW",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 409
        assert "already exists" in res.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def test_create_agent_success(client: TestClient):
    """Admin successfully creates an agent, returning 201 Created with full payload."""
    admin_id = uuid.uuid4()
    admin_token = create_test_token(str(admin_id))
    admin_profile = Profile(
        id=admin_id,
        full_name="Admin Supervisor",
        email="admin@fos.test",
        role="admin",
    )

    agent_id = uuid.uuid4()
    profile_id = uuid.uuid4()
    persisted_profile = Profile(
        id=profile_id,
        full_name="Deepak Chopra",
        email="deepak@fos.test",
        phone="+91 9988776655",
        role="agent",
    )
    persisted_agent = Agent(
        id=agent_id,
        profile_id=profile_id,
        agent_code="AGT-200",
        status="active",
        territory="Whitefield Zone",
        battery_level=100,
        created_at=datetime.now(timezone.utc),
    )
    persisted_agent.profile = persisted_profile

    mock_db = AsyncMock()
    # agent_code check -> None
    mock_db.scalar.return_value = None

    # First execute: profile lookup -> None
    # Second execute: fetch complete agent with profile -> persisted_agent
    res_empty = MagicMock()
    res_empty.unique.return_value.scalars.return_value.first.return_value = None
    res_agent = MagicMock()
    res_agent.unique.return_value.scalars.return_value.first.return_value = persisted_agent
    mock_db.execute.side_effect = [res_empty, res_agent]

    app.dependency_overrides[get_current_profile] = lambda: admin_profile
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        res = client.post(
            "/api/agents",
            json={
                "auth_user_id": str(uuid.uuid4()),
                "name": "Deepak Chopra",
                "email": "deepak@fos.test",
                "phone": "+91 9988776655",
                "agent_code": "AGT-200",
                "status": "active",
                "territory": "Whitefield Zone",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["id"] == str(agent_id)
        assert data["name"] == "Deepak Chopra"
        assert data["email"] == "deepak@fos.test"
        assert data["agent_code"] == "AGT-200"
        assert data["territory"] == "Whitefield Zone"
        assert data["status"] == "active"
        assert mock_db.commit.called
    finally:
        app.dependency_overrides.clear()


def test_get_agent_by_id_and_code(client: TestClient):
    """GET /api/agents/{agent_id} resolves by UUID or employee code."""
    admin_id = uuid.uuid4()
    admin_token = create_test_token(str(admin_id))
    admin_profile = Profile(
        id=admin_id,
        full_name="Admin Supervisor",
        email="admin@fos.test",
        role="admin",
    )

    agent_id = uuid.uuid4()
    persisted_profile = Profile(
        id=uuid.uuid4(),
        full_name="Rohan Varma",
        email="rohan@fos.test",
        role="agent",
    )
    persisted_agent = Agent(
        id=agent_id,
        profile_id=persisted_profile.id,
        agent_code="AGT-ROHAN",
        status="busy",
        territory="Indiranagar",
        battery_level=80,
        created_at=datetime.now(timezone.utc),
    )
    persisted_agent.profile = persisted_profile

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.unique.return_value.scalars.return_value.first.return_value = persisted_agent
    mock_db.execute.return_value = mock_result
    mock_db.scalar.return_value = 0  # assigned_tasks / completed_visits

    app.dependency_overrides[get_current_profile] = lambda: admin_profile
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        # 1. Lookup by UUID
        res = client.get(
            f"/api/agents/{agent_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200
        assert res.json()["name"] == "Rohan Varma"

        # 2. Lookup by code (string)
        res = client.get(
            "/api/agents/AGT-ROHAN",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200
        assert res.json()["agent_code"] == "AGT-ROHAN"

        # 3. Non-existent returns 404
        mock_result.unique.return_value.scalars.return_value.first.return_value = None
        res = client.get(
            "/api/agents/NON-EXISTENT",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_create_agent_with_coordinates_and_address(client: TestClient):
    """Admin creates agent with valid coordinates and address, marked as admin_provided."""
    admin_id = uuid.uuid4()
    admin_token = create_test_token(str(admin_id))
    admin_profile = Profile(id=admin_id, full_name="Admin", email="admin@fos.test", role="admin")

    agent_id = uuid.uuid4()
    profile_id = uuid.uuid4()
    persisted_profile = Profile(
        id=profile_id,
        full_name="Meera Joshi",
        email="meera@fos.test",
        role="agent",
    )
    persisted_agent = Agent(
        id=agent_id,
        profile_id=profile_id,
        agent_code="AGT-MEERA",
        status="active",
        address="100 Feet Rd, Indiranagar",
        location_source="admin_provided",
        current_latitude=12.971598,
        current_longitude=77.594566,
        battery_level=100,
        created_at=datetime.now(timezone.utc),
    )
    persisted_agent.profile = persisted_profile

    mock_db = AsyncMock()
    mock_db.scalar.return_value = None
    res_empty = MagicMock()
    res_empty.unique.return_value.scalars.return_value.first.return_value = None
    res_agent = MagicMock()
    res_agent.unique.return_value.scalars.return_value.first.return_value = persisted_agent
    mock_db.execute.side_effect = [res_empty, res_agent]

    app.dependency_overrides[get_current_profile] = lambda: admin_profile
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        res = client.post(
            "/api/agents",
            json={
                "auth_user_id": str(uuid.uuid4()),
                "name": "Meera Joshi",
                "email": "meera@fos.test",
                "agent_code": "AGT-MEERA",
                "address": "100 Feet Rd, Indiranagar",
                "latitude": 12.971598,
                "longitude": 77.594566,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["current_latitude"] == 12.971598
        assert data["current_longitude"] == 77.594566
        assert data["location_source"] == "admin_provided"
        assert data["address"] == "100 Feet Rd, Indiranagar"
    finally:
        app.dependency_overrides.clear()


def test_coordinate_validation_rules(client: TestClient):
    """Coordinates must be valid numbers within [-90, 90] and [-180, 180] and paired together."""
    admin_id = uuid.uuid4()
    admin_token = create_test_token(str(admin_id))
    admin_profile = Profile(id=admin_id, full_name="Admin", email="admin@fos.test", role="admin")

    app.dependency_overrides[get_current_profile] = lambda: admin_profile
    try:
        # 1. Latitude provided without longitude -> 422
        res = client.post(
            "/api/agents",
            json={
                "auth_user_id": str(uuid.uuid4()),
                "name": "Invalid Agent",
                "email": "invalid1@fos.test",
                "agent_code": "AGT-INV1",
                "latitude": 12.9716,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 422
        assert "both latitude and longitude must be supplied together" in res.text.lower()

        # 2. Longitude provided without latitude -> 422
        res = client.post(
            "/api/agents",
            json={
                "auth_user_id": str(uuid.uuid4()),
                "name": "Invalid Agent",
                "email": "invalid2@fos.test",
                "agent_code": "AGT-INV2",
                "longitude": 77.5946,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 422
        assert "both latitude and longitude must be supplied together" in res.text.lower()

        # 3. Latitude out of range (> 90) -> 422
        res = client.post(
            "/api/agents",
            json={
                "auth_user_id": str(uuid.uuid4()),
                "name": "Invalid Agent",
                "email": "invalid3@fos.test",
                "agent_code": "AGT-INV3",
                "latitude": 95.5,
                "longitude": 77.5946,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 422

        # 4. Longitude out of range (> 180) -> 422
        res = client.post(
            "/api/agents",
            json={
                "auth_user_id": str(uuid.uuid4()),
                "name": "Invalid Agent",
                "email": "invalid4@fos.test",
                "agent_code": "AGT-INV4",
                "latitude": 12.9716,
                "longitude": 195.0,
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_agent_device_location_update_sets_gps_source(client: TestClient):
    """Field agent device updating location sets location_source to 'gps'."""
    agent_id = uuid.uuid4()
    profile_id = uuid.uuid4()
    agent_token = create_test_token(str(profile_id))

    agent_profile = Profile(id=profile_id, full_name="Field Agent Alex", email="alex@fos.test", role="agent")
    agent_entity = Agent(
        id=agent_id,
        profile_id=profile_id,
        agent_code="AGT-ALEX",
        status="active",
        location_source="unknown",
        current_latitude=None,
        current_longitude=None,
    )
    agent_profile.agent = agent_entity

    mock_db = AsyncMock()

    app.dependency_overrides[get_current_profile] = lambda: agent_profile
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        res = client.patch(
            "/api/agents/me/location",
            json={
                "latitude": 12.9352,
                "longitude": 77.6245,
                "gps_accuracy": 12.5,
                "battery_level": 92,
            },
            headers={"Authorization": f"Bearer {agent_token}"},
        )
        assert res.status_code == 200
        assert agent_entity.location_source == "gps"
        assert agent_entity.current_latitude == 12.9352
        assert agent_entity.current_longitude == 77.6245
        assert agent_entity.battery_level == 92
        assert mock_db.commit.called
    finally:
        app.dependency_overrides.clear()

