import asyncio
import uuid
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1 import visits
from app.models.agent import Agent
from app.schemas.visit import VisitDispatchRequest


def _run(coroutine):
    return asyncio.run(coroutine)


def _result(name="Divine Paradise High School", lat="19.2189", lon="73.1401", place_id=101):
    return {
        "lat": lat,
        "lon": lon,
        "display_name": f"{name}, Kalyan East, Maharashtra, 421306, India",
        "address": {"suburb": "Kalyan East", "state": "Maharashtra", "postcode": "421306", "country": "India"},
        "place_id": place_id,
        "type": "school",
        "importance": 0.5,
    }


def test_candidate_parser_validates_and_extracts_address_details():
    candidate = visits._candidate_from_nominatim(_result())
    assert candidate["latitude"] == pytest.approx(19.2189)
    assert candidate["longitude"] == pytest.approx(73.1401)
    assert candidate["locality"] == "Kalyan East"
    assert candidate["postal_code"] == "421306"
    assert visits._candidate_from_nominatim({**_result(), "lat": "NaN"}) is None
    assert visits._candidate_from_nominatim({"lat": "1", "lon": "2"}) is None


def test_dispatch_payload_rejects_out_of_range_coordinates():
    with pytest.raises(ValidationError):
        VisitDispatchRequest(
            agent_id=uuid.uuid4(), customer_name="Site", address="Street address",
            city="Kalyan East", latitude=91, longitude=73,
            scheduled_date=date(2026, 10, 20), scheduled_time="14:30",
        )


def test_geocode_uses_bounded_address_fallback_and_returns_all_candidates(monkeypatch):
    calls = []

    async def search(path, params, db):
        calls.append(params["q"])
        if len(calls) < 3:
            return []
        return [_result(place_id=101), _result(name="Divine Paradise School", lat="19.2190", lon="73.1402", place_id=102)]

    monkeypatch.setattr(visits, "_request_nominatim", search)
    unique = f"School landmark {uuid.uuid4()}"
    result = _run(visits.geocode_dispatch_address(
        address=f"{unique} near Church", locality="Kalyan East", state="Maharashtra",
        postal_code="421306", country="India", current_admin=object(),
    ))
    assert len(calls) == 3
    assert len(set(calls)) == 3
    assert "421306" in calls[0]
    assert "Kalyan East" in calls[2]
    assert len(result["candidates"]) == 2


def test_geocode_preserves_empty_result_as_no_match(monkeypatch):
    monkeypatch.setattr(visits, "_request_nominatim", AsyncMock(return_value=[]))
    result = _run(visits.geocode_dispatch_address(
        address=f"No listed landmark {uuid.uuid4()}", locality="Kalyan East",
        state="Maharashtra", postal_code="421306", country="India", current_admin=object(),
    ))
    assert result["candidates"] == []
    assert len(result["attempted_queries"]) == 3


@pytest.mark.parametrize(
    ("response", "expected_status"),
    [
        (SimpleNamespace(status_code=429), 429),
        (SimpleNamespace(status_code=503), 502),
        (SimpleNamespace(status_code=200, json=lambda: {"unexpected": "object"}), 502),
    ],
)
def test_geocoder_provider_failures_are_not_reported_as_no_match(monkeypatch, response, expected_status):
    monkeypatch.setattr(visits, "_nominatim_get", AsyncMock(return_value=response))
    with pytest.raises(HTTPException) as error:
        _run(visits._request_nominatim("search", {"q": "test"}, object()))
    assert error.value.status_code == expected_status


def test_geocoder_timeout_has_distinct_status(monkeypatch):
    monkeypatch.setattr(visits, "_nominatim_get", AsyncMock(side_effect=httpx.TimeoutException("timeout")))
    with pytest.raises(HTTPException) as error:
        _run(visits._request_nominatim("search", {"q": "test"}, object()))
    assert error.value.status_code == 504


def test_dispatch_persists_confirmed_coordinates_without_regeocoding():
    agent = Agent(id=uuid.uuid4(), profile_id=uuid.uuid4(), status="active")
    persisted_customer = SimpleNamespace(
        id=uuid.uuid4(), name="Nupur Site", company=None, contact_person=None,
        phone=None, email=None, address="Divine Paradise High School near Church",
        city="Kalyan East, Maharashtra, 421306, India", latitude=19.2189, longitude=73.1401,
    )
    persisted_visit = SimpleNamespace(
        id=uuid.uuid4(), visit_code="VST-TEST", customer_id=persisted_customer.id,
        agent_id=agent.id, customer=persisted_customer, scheduled_date=date(2026, 10, 20),
        scheduled_time="14:30", status="pending", geofence_verified=False,
        check_in_time=None, completed_time=None, completion_notes=None, order_index=1,
        estimated_duration_minutes=45, purpose=None, created_at=None,
    )
    db = AsyncMock()
    db.get.return_value = agent
    db.scalar.return_value = None
    db.execute.return_value.unique.return_value.scalars.return_value.first.return_value = persisted_visit
    db.add = MagicMock()
    db.add_all = MagicMock()
    admin = SimpleNamespace(id=uuid.uuid4())
    payload = VisitDispatchRequest(
        agent_id=agent.id, customer_name="Nupur Site", address=persisted_customer.address,
        city=persisted_customer.city, latitude=19.2189, longitude=73.1401,
        scheduled_date=date(2026, 10, 20), scheduled_time="14:30",
    )
    result = _run(visits.dispatch_visit(payload, current_admin=admin, db=db))
    saved_customer = db.add.call_args.args[0]
    assert saved_customer.address == persisted_customer.address
    assert saved_customer.latitude == pytest.approx(19.2189)
    assert saved_customer.longitude == pytest.approx(73.1401)
    assert result.customer_latitude == pytest.approx(19.2189)
    assert result.customer_longitude == pytest.approx(73.1401)
    db.commit.assert_awaited_once()
