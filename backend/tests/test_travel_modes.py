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


# ── Ola Maps parsing (shapes taken from a live Ola response, Kalyan East, 22 Nov 2026) ──
from app.services.travel_modes import decode_polyline, ola_maneuver, ola_route_response, ola_speed_intervals


def test_decode_polyline_precision_5():
    # "_p~iF~ps|U" is the classic Google example point (38.5, -120.2)
    assert decode_polyline("_p~iF~ps|U") == [[-120.2, 38.5]]


@pytest.mark.parametrize(
    "maneuver,expected",
    [
        ("depart", ("depart", "")),
        ("turn-left", ("turn", "left")),
        ("turn-right", ("turn", "right")),
        ("turn-slight-left", ("turn", "slight left")),
        ("turn-sharp-right", ("turn", "sharp right")),
        ("uturn-right", ("turn", "uturn")),
        ("roundabout-left", ("roundabout", "left")),
        ("keep-right", ("turn", "slight right")),
        ("fork-left", ("turn", "slight left")),
        ("continue", ("continue", "straight")),
        ("arrive", ("arrive", "")),
    ],
)
def test_ola_maneuver_mapping(maneuver, expected):
    assert ola_maneuver(maneuver) == expected


def test_ola_speed_intervals_levels():
    assert ola_speed_intervals("0,12,0|12,13,5|13,20,12|bad|20,21") == [
        {"startPolylinePointIndex": 0, "endPolylinePointIndex": 12, "speed": "NORMAL"},
        {"startPolylinePointIndex": 12, "endPolylinePointIndex": 13, "speed": "SLOW"},
        {"startPolylinePointIndex": 13, "endPolylinePointIndex": 20, "speed": "TRAFFIC_JAM"},
    ]
    assert ola_speed_intervals(None) == []


def _ola_payload():
    return {
        "status": "SUCCESS",
        "routes": [{
            "overview_polyline": "_p~iF~ps|U_ulLnnqC",
            "travel_advisory": "0,1,5",
            "legs": [{
                "distance": 2418, "duration": 529,
                "steps": [
                    {"instructions": "Head north on Chinchpada Road", "distance": 862, "duration": 190,
                     "maneuver": "depart", "start_location": {"lat": 19.219, "lng": 73.14009}},
                    {"instructions": "Turn left onto Hanuman Nagar Road", "distance": 43, "duration": 24,
                     "maneuver": "turn-left", "start_location": {"lat": 19.22671, "lng": 73.14054}},
                ],
            }],
        }],
    }


def test_ola_route_response_car():
    body = ola_route_response(_ola_payload(), "car")
    assert body["provider"] == "Ola Maps" and body["traffic_aware"] is True
    assert body["distance_meters"] == 2418 and body["duration_seconds"] == 529
    assert body["geometry"]["coordinates"][0] == [-120.2, 38.5]
    step = body["legs"][0]["steps"][1]
    assert step["maneuver"] == {"type": "turn", "modifier": "left", "instruction": "Turn left onto Hanuman Nagar Road", "location": [73.14054, 19.22671]}
    assert body["traffic_speed_intervals"][0]["speed"] == "SLOW"


def test_ola_route_response_walk_has_no_traffic():
    body = ola_route_response(_ola_payload(), "walk")
    assert body["traffic_aware"] is False and body["traffic_speed_intervals"] == []


def test_ola_route_response_rejects_failures():
    with pytest.raises(ValueError):
        ola_route_response({"status": "BAD_REQUEST", "routes": []}, "car")


def test_real_ola_fixtures_parse():
    """Live Ola responses (Kalyan East, saved 22 Nov 2026) convert into drawable routes."""
    import json
    from pathlib import Path

    fixtures = Path(__file__).parent / "fixtures"
    for name, mode in (("driving", "car"), ("motorcycle", "bike"), ("walking", "walk")):
        body = ola_route_response(json.loads((fixtures / f"ola_directions_{name}.json").read_text()), mode)
        coords = body["geometry"]["coordinates"]
        assert len(coords) > 10
        assert coords[0] == pytest.approx([73.14009, 19.219])
        assert coords[-1] == pytest.approx([73.14523, 19.22601])
        steps = body["legs"][0]["steps"]
        assert steps[0]["maneuver"]["type"] == "depart" and steps[-1]["maneuver"]["type"] == "arrive"
        assert all(step["maneuver"]["location"] for step in steps)
        if mode == "walk":
            assert body["traffic_speed_intervals"] == []
        else:
            assert max(i["endPolylinePointIndex"] for i in body["traffic_speed_intervals"]) == len(coords) - 1
