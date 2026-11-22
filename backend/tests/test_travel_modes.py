import pytest

from app.services.travel_modes import (
    BIKE_TIME_FACTOR,
    google_maneuver,
    normalize_mode,
    osrm_route_response,
    osrm_url,
    scale_route_time,
)


def test_normalize_mode_aliases_and_rejects_unknown():
    assert normalize_mode(None) == "car"
    assert normalize_mode("Driving") == "car"
    assert normalize_mode("two_wheeler") == "bike"
    assert normalize_mode("walking") == "walk"
    with pytest.raises(ValueError):
        normalize_mode("boat")


def test_walk_uses_foot_server_and_bike_uses_car_graph():
    assert osrm_url("walk", "http://car/", "https://foot/") == "https://foot"
    assert osrm_url("bike", "http://car/", "https://foot/") == "http://car"
    assert osrm_url("car", "http://car", "https://foot") == "http://car"


def test_scale_route_time_scales_route_legs_and_steps_without_mutating():
    route = {"duration": 100, "distance": 900, "legs": [{"duration": 100, "steps": [{"duration": 60}, {"duration": 40}]}]}
    scaled = scale_route_time(route, BIKE_TIME_FACTOR)
    assert scaled["duration"] == pytest.approx(85)
    assert scaled["legs"][0]["duration"] == pytest.approx(85)
    assert [s["duration"] for s in scaled["legs"][0]["steps"]] == pytest.approx([51, 34])
    assert route["duration"] == 100 and route["legs"][0]["steps"][0]["duration"] == 60
    assert scaled["distance"] == 900


def test_osrm_route_response_marks_mode_and_estimate():
    body = osrm_route_response({"duration": 10, "distance": 20, "geometry": None, "legs": []}, "bike", estimated=True)
    assert body["mode"] == "bike" and body["estimated"] is True and body["traffic_aware"] is False


@pytest.mark.parametrize(
    "maneuver,expected",
    [
        ("TURN_LEFT", ("turn", "left")),
        ("TURN_SLIGHT_RIGHT", ("turn", "slight right")),
        ("TURN_SHARP_LEFT", ("turn", "sharp left")),
        ("UTURN_RIGHT", ("turn", "uturn")),
        ("ROUNDABOUT_LEFT", ("roundabout", "left")),
        ("FORK_RIGHT", ("turn", "slight right")),
        ("STRAIGHT", ("continue", "straight")),
        ("DEPART", ("depart", "")),
        ("", ("continue", "straight")),
    ],
)
def test_google_maneuver_mapping(maneuver, expected):
    assert google_maneuver(maneuver) == expected
