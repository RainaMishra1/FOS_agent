"""One region per agent (mocked database)."""
import asyncio
import uuid
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api.v1 import territories


def test_second_region_for_the_same_agent_is_refused():
    db = AsyncMock()
    db.scalar.return_value = "Kalyan – Thane"
    with pytest.raises(HTTPException) as exc:
        asyncio.run(territories._require_no_region(db, uuid.uuid4()))
    assert exc.value.status_code == 409
    assert "Kalyan – Thane" in exc.value.detail


def test_agent_without_a_region_can_get_one():
    db = AsyncMock()
    db.scalar.return_value = None
    asyncio.run(territories._require_no_region(db, uuid.uuid4()))


def test_from_to_builds_a_box_on_the_server():
    from app.schemas.territory import TerritoryAreaSpec

    area = TerritoryAreaSpec(
        start={"label": "Kalyan Station", "latitude": 19.2437, "longitude": 73.1355},
        end={"label": "Thane Station", "latitude": 19.1863, "longitude": 72.9757},
        radius_meters=1000,
    )
    wkt = territories._boundary_wkt(area=area)
    assert wkt.startswith("POLYGON((") and wkt.count(",") == 4  # 4 corners + closing point
