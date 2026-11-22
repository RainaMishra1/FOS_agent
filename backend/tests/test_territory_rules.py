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


# ---------------------------------------------------------------- address-based areas
from app.services.territory_rules import area_ring, distance_outside_area_m, haversine_m  # noqa: E402

KALYAN = (19.2437, 73.1355)
THANE = (19.2183, 72.9781)


def test_radius_area_is_a_closed_circle_of_the_right_size():
    ring = area_ring(KALYAN, None, 3000)
    assert ring[0] == ring[-1] and len(ring) > 40
    for lng, lat in ring[:-1]:
        assert abs(haversine_m(KALYAN[0], KALYAN[1], lat, lng) - 3000) < 15  # within 0.5%


def test_box_has_both_places_inside_with_margin():
    ring = area_ring(KALYAN, THANE, 2000)
    assert len(ring) == 5 and ring[0] == ring[-1]
    lngs = [lng for lng, _ in ring]
    lats = [lat for _, lat in ring]
    for lat, lng in (KALYAN, THANE):
        assert min(lats) < lat < max(lats) and min(lngs) < lng < max(lngs)
    # margin: the southern edge is ~2 km south of the southernmost place
    assert abs(haversine_m(min(lats), THANE[1], THANE[0], THANE[1]) - 2000) < 10


def test_distance_outside_area():
    assert distance_outside_area_m(KALYAN, KALYAN, None, 3000) == 0
    north_5km = (KALYAN[0] + 5000 / 111_195, KALYAN[1])
    assert abs(distance_outside_area_m(north_5km, KALYAN, None, 3000) - 2000) < 20
    midway = ((THANE[0] + KALYAN[0]) / 2, (THANE[1] + KALYAN[1]) / 2)
    assert distance_outside_area_m(midway, THANE, KALYAN, 1000) == 0
    # 3 km north of the box's northern edge (Kalyan + 1 km margin)
    north_of_box = (KALYAN[0] + 4000 / 111_195, (THANE[1] + KALYAN[1]) / 2)
    assert abs(distance_outside_area_m(north_of_box, THANE, KALYAN, 1000) - 3000) < 20


@pytest.mark.parametrize("radius", [50, 60_000])
def test_radius_limits(radius):
    with pytest.raises(RuleViolation, match="Radius"):
        area_ring(KALYAN, None, radius)


def test_box_size_limit():
    with pytest.raises(RuleViolation, match="apart"):
        area_ring((19.0, 72.8), (21.5, 72.8), 1000)  # ~280 km
