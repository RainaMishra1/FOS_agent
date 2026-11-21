"""Tests for the GPS geofence check and public signup hardening."""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.v1 import agent as agent_api
from app.api.v1 import auth as auth_api
from app.config import settings
from app.models.agent_location import AgentLocation
from app.schemas.auth import AccountRegistrationRequest


def _run(coroutine):
    return asyncio.run(coroutine)


# --------------------------------------------------------------------------
# Geofence
# --------------------------------------------------------------------------

CUSTOMER_LAT, CUSTOMER_LNG = 12.9716, 77.5946


def _visit():
    return SimpleNamespace(customer=SimpleNamespace(latitude=CUSTOMER_LAT, longitude=CUSTOMER_LNG))


def _agent(**overrides):
    values = dict(
        id=uuid.uuid4(),
        current_latitude=CUSTOMER_LAT,
        current_longitude=CUSTOMER_LNG,
        battery_level=80,
        location_source="admin_provided",
    )
    values.update(overrides)
    return SimpleNamespace(**values)


def _reading(age_seconds=10, accuracy=20.0, lat=CUSTOMER_LAT, lng=CUSTOMER_LNG):
    return AgentLocation(
        agent_id=uuid.uuid4(),
        latitude=lat,
        longitude=lng,
        gps_accuracy=accuracy,
        recorded_at=datetime.now(timezone.utc) - timedelta(seconds=age_seconds),
    )


def _db(latest):
    db = AsyncMock()
    db.scalar.return_value = latest
    db.add = MagicMock()
    return db


def test_geofence_accepts_fresh_accurate_gps_on_site():
    location, distance = _run(agent_api._verify_visit_geofence(_agent(), _visit(), _db(_reading())))
    assert distance < 1
    assert location.gps_accuracy == 20.0


def test_geofence_does_not_synthesize_reading_from_saved_coordinates():
    db = _db(None)
    agent = _agent()
    with pytest.raises(HTTPException) as exc:
        _run(agent_api._verify_visit_geofence(agent, _visit(), db))
    assert exc.value.status_code == 409
    db.add.assert_not_called()
    assert agent.location_source == "admin_provided"


def test_geofence_rejects_stale_reading_without_retimestamping():
    reading = _reading(age_seconds=settings.LOCATION_STALE_THRESHOLD_SECONDS + 60)
    original = reading.recorded_at
    with pytest.raises(HTTPException) as exc:
        _run(agent_api._verify_visit_geofence(_agent(), _visit(), _db(reading)))
    assert exc.value.status_code == 409
    assert "out of date" in exc.value.detail
    assert reading.recorded_at == original


def test_geofence_rejects_manual_location():
    with pytest.raises(HTTPException) as exc:
        _run(agent_api._verify_visit_geofence(_agent(), _visit(), _db(_reading(accuracy=None))))
    assert exc.value.status_code == 409
    assert "manually" in exc.value.detail


def test_geofence_rejects_inaccurate_reading():
    reading = _reading(accuracy=settings.MAX_ACCEPTABLE_GPS_ACCURACY_METERS + 1)
    with pytest.raises(HTTPException) as exc:
        _run(agent_api._verify_visit_geofence(_agent(), _visit(), _db(reading)))
    assert exc.value.status_code == 409
    assert "accuracy" in exc.value.detail.lower()


def test_geofence_rejects_reading_outside_radius():
    far = _reading(lat=CUSTOMER_LAT + 0.1)  # roughly 11 km north
    with pytest.raises(HTTPException) as exc:
        _run(agent_api._verify_visit_geofence(_agent(), _visit(), _db(far)))
    assert exc.value.status_code == 409
    assert "away from the customer" in exc.value.detail


# --------------------------------------------------------------------------
# Signup
# --------------------------------------------------------------------------

ADMIN_KEY = "admin-test-key"


@pytest.fixture(autouse=True)
def _signup_settings(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_REGISTRATION_KEY", ADMIN_KEY)
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "service-role")
    auth_api._key_failures.clear()
    yield
    auth_api._key_failures.clear()


def _payload(key=ADMIN_KEY, email="boss@example.com"):
    return AccountRegistrationRequest(
        full_name="Boss", email=email, password="password123", secret_key=key,
    )


def _request(ip="203.0.113.7"):
    return SimpleNamespace(headers={}, client=SimpleNamespace(host=ip))


class _FakeClient:
    """Records Supabase admin API calls made through httpx.AsyncClient."""

    def __init__(self, post_response):
        self.post_response = post_response
        self.calls = []

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, **kwargs):
        self.calls.append(("POST", url))
        return self.post_response

    async def get(self, url, **kwargs):
        self.calls.append(("GET", url))
        raise AssertionError("signup must not list Supabase users")

    async def put(self, url, **kwargs):
        self.calls.append(("PUT", url))
        raise AssertionError("signup must not change an existing user's password")

    async def delete(self, url, **kwargs):
        self.calls.append(("DELETE", url))
        return SimpleNamespace(status_code=200)


def _response(status_code, body=None):
    return SimpleNamespace(status_code=status_code, json=lambda: body or {})


def test_admin_signup_refuses_existing_profile_instead_of_promoting():
    existing = SimpleNamespace(id=uuid.uuid4(), role="agent", email="boss@example.com")
    db = AsyncMock()
    db.scalar.return_value = existing
    fake = _FakeClient(_response(201))
    with patch.object(auth_api.httpx, "AsyncClient", fake):
        with pytest.raises(HTTPException) as exc:
            _run(auth_api._register_account(_payload(), "admin", db, _request()))
    assert exc.value.status_code == 409
    assert existing.role == "agent"
    assert fake.calls == []
    db.commit.assert_not_called()


def test_signup_does_not_reset_or_delete_existing_supabase_login():
    db = AsyncMock()
    db.scalar.return_value = None
    fake = _FakeClient(_response(422))
    with patch.object(auth_api.httpx, "AsyncClient", fake):
        with pytest.raises(HTTPException) as exc:
            _run(auth_api._register_account(_payload(), "admin", db, _request()))
    assert exc.value.status_code == 409
    assert [method for method, _ in fake.calls] == ["POST"]  # no GET/PUT/DELETE


def test_signup_rolls_back_only_the_login_it_created():
    new_id = uuid.uuid4()
    db = AsyncMock()
    db.scalar.return_value = None
    db.add = MagicMock()
    db.commit.side_effect = RuntimeError("database unavailable")
    fake = _FakeClient(_response(201, {"id": str(new_id), "email": "boss@example.com"}))
    with patch.object(auth_api.httpx, "AsyncClient", fake):
        with pytest.raises(HTTPException) as exc:
            _run(auth_api._register_account(_payload(), "admin", db, _request()))
    assert exc.value.status_code == 502
    assert ("DELETE", f"https://example.supabase.co/auth/v1/admin/users/{new_id}") in fake.calls


def test_registration_key_attempts_are_limited_per_ip():
    db = AsyncMock()
    for _ in range(auth_api._KEY_FAILURE_LIMIT):
        with pytest.raises(HTTPException) as exc:
            _run(auth_api._register_account(_payload(key="wrong"), "admin", db, _request()))
        assert exc.value.status_code == 403

    # Even the correct key is refused while this IP is blocked.
    with pytest.raises(HTTPException) as exc:
        _run(auth_api._register_account(_payload(), "admin", db, _request()))
    assert exc.value.status_code == 429

    # A different IP is unaffected (fails later on the existing-profile check).
    db.scalar.return_value = SimpleNamespace(id=uuid.uuid4(), role="agent")
    with pytest.raises(HTTPException) as exc:
        _run(auth_api._register_account(_payload(), "admin", db, _request(ip="198.51.100.1")))
    assert exc.value.status_code == 409


def test_client_ip_uses_last_forwarded_entry():
    request = SimpleNamespace(
        headers={"x-forwarded-for": "1.2.3.4, 203.0.113.9"},
        client=SimpleNamespace(host="10.0.0.1"),
    )
    assert auth_api._client_ip(request) == "203.0.113.9"


# --------------------------------------------------------------------------
# Database outage is reported as 503, not "profile not provisioned"
# --------------------------------------------------------------------------

def test_profile_lookup_reports_database_outage_as_503():
    from app.core import auth as core_auth

    class SSLCertVerificationError(Exception):
        pass

    db = AsyncMock()
    db.execute.side_effect = SSLCertVerificationError("certificate verify failed")
    claims = {"sub": str(uuid.uuid4()), "email": "agent@example.com"}
    with pytest.raises(HTTPException) as exc:
        _run(core_auth.get_current_profile(claims=claims, db=db))
    assert exc.value.status_code == 503
    assert "temporarily unavailable" in exc.value.detail


def test_missing_profile_is_still_403_when_database_works():
    from app.core import auth as core_auth

    empty = MagicMock()
    empty.unique.return_value.scalars.return_value.first.return_value = None
    db = AsyncMock()
    db.execute.return_value = empty
    claims = {"sub": str(uuid.uuid4()), "email": "nobody@example.com"}
    with pytest.raises(HTTPException) as exc:
        _run(core_auth.get_current_profile(claims=claims, db=db))
    assert exc.value.status_code == 403
