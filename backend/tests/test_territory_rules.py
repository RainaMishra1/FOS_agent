"""Territory polygon validation, lead GPS evidence and territory-based ranking."""
from datetime import datetime, timedelta, timezone

import pytest

from app.services.territory_rules import (
    GpsReading,
    RuleViolation,
    TerritoryMatch,
    check_lead_gps,
    normalize_ring,
    rank_by_territory,
    ring_to_wkt,
)

NOW = datetime(2026, 11, 22, 10, 0, tzinfo=timezone.utc)
LIMITS = dict(max_accuracy_m=100.0, max_age_seconds=300.0, max_distance_m=750.0, now=NOW)


# ---------------------------------------------------------------- polygons
def test_ring_is_converted_to_closed_lng_lat_ring():
    ring = normalize_ring([[19.0, 72.8], [19.1, 72.8], [19.1, 72.9]])
    assert ring == [(72.8, 19.0), (72.8, 19.1), (72.9, 19.1), (72.8, 19.0)]
    assert ring_to_wkt(ring).startswith("POLYGON((72.8000000 19.0000000,")


def test_ring_drops_duplicate_clicks_and_explicit_closing_point():
    ring = normalize_ring([[19.0, 72.8], [19.0, 72.8], [19.1, 72.8], [19.1, 72.9], [19.0, 72.8]])
    assert len(ring) == 4


@pytest.mark.parametrize("points", [
    [[19.0, 72.8], [19.1, 72.8]],                    # too few corners
    [[19.0, 72.8], [19.0, 72.8], [19.0, 72.8]],      # all the same point
    [[95.0, 72.8], [19.1, 72.8], [19.1, 72.9]],      # latitude out of range
    [[19.0, 72.8, 1.0], [19.1, 72.8], [19.1, 72.9]],  # malformed point
])
def test_invalid_outlines_are_rejected(points):
    with pytest.raises(RuleViolation):
        normalize_ring(points)


# ---------------------------------------------------------------- lead GPS evidence
def _reading(**overrides):
    values = dict(latitude=19.0, longitude=72.8, accuracy_meters=20.0, recorded_at=NOW - timedelta(seconds=30))
    values.update(overrides)
    return GpsReading(**values)


def test_lead_next_to_agent_is_accepted():
    distance = check_lead_gps(_reading(), 19.001, 72.8, **LIMITS)
    assert 100 < distance < 120


@pytest.mark.parametrize("reading, message", [
    (None, "No GPS reading"),
    (_reading(accuracy_meters=None), "entered manually"),
    (_reading(accuracy_meters=500.0), "accuracy"),
    (_reading(recorded_at=NOW - timedelta(minutes=10)), "out of date"),
])
def test_untrustworthy_gps_is_rejected(reading, message):
    with pytest.raises(RuleViolation, match=message):
        check_lead_gps(reading, 19.0, 72.8, **LIMITS)


def test_lead_far_from_agent_is_rejected():
    with pytest.raises(RuleViolation, match="within 750m"):
        check_lead_gps(_reading(), 19.02, 72.8, **LIMITS)  # about 2.2 km away


# ---------------------------------------------------------------- suggestion ranking
def _match(agent, territory, covers, distance, active=True):
    return TerritoryMatch(agent, active, territory, territory, covers, distance)


def test_agent_whose_territory_contains_point_wins():
    recommended, inside, ranked = rank_by_territory([
        _match("A", "Andheri", False, 300.0),
        _match("B", "Kalyan", True, 0.0),
    ])
    assert recommended == "B" and inside
    assert [f.agent_id for f in ranked] == ["B", "A"]


def test_outside_every_territory_suggests_nearest_and_flags_it():
    recommended, inside, ranked = rank_by_territory([
        _match("A", "Andheri", False, 4000.0),
        _match("B", "Kalyan", False, 900.0),
    ])
    assert recommended == "B" and not inside
    assert ranked[0].distance_m == 900.0


def test_inactive_agents_are_never_suggested():
    recommended, _, ranked = rank_by_territory([_match("C", "Thane", True, 0.0, active=False)])
    assert recommended is None and ranked == []


def test_agent_with_several_territories_uses_the_best_one():
    _, _, ranked = rank_by_territory([
        _match("A", "Andheri East", False, 2000.0),
        _match("A", "Andheri West", True, 0.0),
    ])
    assert len(ranked) == 1 and ranked[0].territory_name == "Andheri West" and ranked[0].inside
