"""Endpoint test for POST /visits/suggest-agent (territory based, mocked database)."""
import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock

from app.api.v1 import visits
from app.schemas.visit import AgentSuggestionRequest


def _result(rows):
    result = MagicMock()
    result.all.return_value = rows
    return result


def test_suggests_agent_whose_territory_contains_the_lead():
    andheri_agent, kalyan_agent = uuid.uuid4(), uuid.uuid4()
    territory_rows = [
        (uuid.uuid4(), "Andheri", andheri_agent, "active", "AGT-1", "Asha", False, 18_500.0),
        (uuid.uuid4(), "Kalyan", kalyan_agent, "active", "AGT-2", "Bilal", True, 0.0),
    ]
    db = AsyncMock()
    db.execute.side_effect = [_result(territory_rows), _result([(kalyan_agent, 3)])]
    db.scalar.return_value = 3  # active agents, one without a territory

    result = asyncio.run(visits.suggest_agent_for_new_lead(
        AgentSuggestionRequest(latitude=19.24, longitude=73.13), current_admin=None, db=db,
    ))
    assert result.recommended_agent_id == kalyan_agent
    assert result.inside_territory and result.territory_name == "Kalyan"
    assert result.skipped_agents_without_territory == 1
    assert result.suggestions[0].open_visits == 3
    assert [s.name for s in result.suggestions] == ["Bilal", "Asha"]


def test_no_territories_means_manual_choice():
    db = AsyncMock()
    db.execute.side_effect = [_result([])]
    db.scalar.return_value = 2
    result = asyncio.run(visits.suggest_agent_for_new_lead(
        AgentSuggestionRequest(latitude=19.0, longitude=73.0), current_admin=None, db=db,
    ))
    assert result.recommended_agent_id is None
    assert "Territories page" in result.detail
