"""Endpoint test for POST /visits/suggest-agent (mocked database)."""
import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.api.v1 import visits
from app.schemas.visit import AgentSuggestionRequest


def _agent(code, lat, lng, name):
    return SimpleNamespace(
        id=uuid.uuid4(), agent_code=code, current_latitude=lat, current_longitude=lng,
        location_source="gps", profile=SimpleNamespace(full_name=name), status="active",
    )


def _db(agents, rows):
    agents_result = MagicMock()
    agents_result.unique.return_value.scalars.return_value.all.return_value = agents
    rows_result = MagicMock()
    rows_result.all.return_value = rows
    db = AsyncMock()
    db.execute.side_effect = [agents_result, rows_result]
    return db


def test_suggest_agent_picks_agent_whose_work_area_contains_lead():
    andheri = _agent("AGT-1", 19.1197, 72.8468, "Asha")
    thane = _agent("AGT-2", 19.2183, 72.9781, "Bilal")
    no_location = _agent("AGT-3", None, None, "Chetan")
    rows = [
        (thane.id, "pending", 19.0771, 72.9986),
        (thane.id, "pending", 19.0745, 73.0010),
        (thane.id, "completed", 19.0800, 72.9950),
    ]
    result = asyncio.run(visits.suggest_agent_for_new_lead(
        AgentSuggestionRequest(latitude=19.0330, longitude=73.0297),
        current_admin=None,
        db=_db([andheri, thane, no_location], rows),
    ))
    assert result.recommended_agent_id == thane.id
    assert result.agents_considered == 2
    assert result.skipped_agents_without_location == 1
    assert result.work_points_used == 3
    top = result.suggestions[0]
    assert top.agent_id == thane.id and top.in_lead_cluster
    assert top.open_visits == 2


def test_suggest_agent_without_located_agents_asks_for_manual_choice():
    result = asyncio.run(visits.suggest_agent_for_new_lead(
        AgentSuggestionRequest(latitude=19.0, longitude=73.0),
        current_admin=None,
        db=_db([_agent("AGT-9", None, None, "Dev")], []),
    ))
    assert result.recommended_agent_id is None
    assert result.suggestions == []
    assert "manually" in result.detail
