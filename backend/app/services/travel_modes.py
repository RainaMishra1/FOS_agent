"""Travel modes for agent navigation: car, bike (motorised two-wheeler) and walk.

Pure helpers so the routing rules can be unit-tested without HTTP calls.

Routing sources
* car  - Google Routes (DRIVE, live traffic) when a key is set, otherwise OSRM car.
* bike - Google Routes (TWO_WHEELER, live traffic) when a key is set. Without a key there is
         no free motorbike router, so the car road route is used and its time is scaled by
         BIKE_TIME_FACTOR (two-wheelers filter through city traffic faster). Marked "estimated".
* walk - OSRM foot profile (free FOSSGIS server). Traffic does not apply to walking.
"""

from __future__ import annotations

from typing import Literal

TravelMode = Literal["car", "bike", "walk"]
TRAVEL_MODES: tuple[str, ...] = ("car", "bike", "walk")

# Motorbike ETA when only a car route is available. Kept conservative on purpose.
BIKE_TIME_FACTOR = 0.85

GOOGLE_TRAVEL_MODE = {"car": "DRIVE", "bike": "TWO_WHEELER"}


def normalize_mode(value: str | None) -> str:
    mode = (value or "car").strip().lower()
    aliases = {"driving": "car", "drive": "car", "two_wheeler": "bike", "motorbike": "bike", "foot": "walk", "walking": "walk"}
    mode = aliases.get(mode, mode)
    if mode not in TRAVEL_MODES:
        raise ValueError(f"Unknown travel mode '{value}'. Use car, bike or walk.")
    return mode


def osrm_url(mode: str, car_base: str, foot_base: str) -> str:
    """Base URL of the OSRM server for a mode (bike uses the car graph, see module doc)."""
    base = foot_base if mode == "walk" else car_base
    return base.rstrip("/")


def scale_route_time(route: dict, factor: float) -> dict:
    """Scale every duration in an OSRM route (route, legs, steps) by factor."""
    scaled = dict(route)
    scaled["duration"] = route.get("duration", 0) * factor
    legs = []
    for leg in route.get("legs") or []:
        new_leg = dict(leg)
        new_leg["duration"] = leg.get("duration", 0) * factor
        new_leg["steps"] = [dict(step, duration=step.get("duration", 0) * factor) for step in leg.get("steps") or []]
        legs.append(new_leg)
    scaled["legs"] = legs
    return scaled


def osrm_route_response(route: dict, mode: str, *, estimated: bool = False, provider: str = "OSRM") -> dict:
    return {
        "geometry": route.get("geometry"),
        "distance_meters": route.get("distance", 0),
        "duration_seconds": route.get("duration", 0),
        "static_duration_seconds": route.get("duration", 0),
        "legs": route.get("legs", []),
        "traffic_aware": False,
        "provider": provider,
        "traffic_speed_intervals": [],
        "mode": mode,
        "estimated": estimated,
    }


def google_maneuver(maneuver: str) -> tuple[str, str]:
    """Map a Google Routes maneuver (e.g. TURN_SLIGHT_LEFT) to OSRM-style (type, modifier)."""
    m = (maneuver or "").upper()
    if "DESTINATION" in m or m.startswith("ARRIVE"):
        return "arrive", ""
    if m.startswith("DEPART"):
        return "depart", ""
    if "ROUNDABOUT" in m:
        return "roundabout", "left" if "LEFT" in m else "right" if "RIGHT" in m else ""
    if "UTURN" in m:
        return "turn", "uturn"
    side = "left" if "LEFT" in m else "right" if "RIGHT" in m else ""
    if not side:
        return "continue", "straight"
    if "SHARP" in m:
        return "turn", f"sharp {side}"
    if "SLIGHT" in m or "FORK" in m or "RAMP" in m or "MERGE" in m:
        return "turn", f"slight {side}"
    return "turn", side


# ── Ola Maps (free tier: 100K direction requests / month) ─────────────
# Verified against the live API: driving, motorcycle and walking are distinct profiles
# ("bike"/"two_wheeler" silently fall back to the car route, so motorcycle is used for bike).
OLA_TRAVEL_MODE = {"car": "driving", "bike": "motorcycle", "walk": "walking"}


def decode_polyline(encoded: str, precision: int = 5) -> list[list[float]]:
    """Decode an encoded polyline into GeoJSON [longitude, latitude] points."""
    points: list[list[float]] = []
    index = lat = lng = 0
    factor = 10 ** precision
    while index < len(encoded):
        values = []
        for _ in range(2):
            result = shift = 0
            while True:
                byte = ord(encoded[index]) - 63
                index += 1
                result |= (byte & 0x1F) << shift
                shift += 5
                if byte < 0x20:
                    break
            values.append(~(result >> 1) if result & 1 else result >> 1)
        lat += values[0]
        lng += values[1]
        points.append([lng / factor, lat / factor])
    return points


def ola_maneuver(maneuver: str) -> tuple[str, str]:
    """Map an Ola maneuver (turn-left, turn-slight-right, uturn-left, roundabout-right...) to (type, modifier)."""
    m = (maneuver or "").strip().lower().replace("_", "-")
    if m.startswith("arrive"):
        return "arrive", ""
    if m.startswith("keep-") or m.startswith("fork-") or m.startswith("ramp-") or m.startswith("merge"):
        side = "left" if "left" in m else "right" if "right" in m else ""
        return ("turn", f"slight {side}") if side else ("continue", "straight")
    return google_maneuver(m.upper().replace("-", "_"))


def ola_speed_intervals(advisory: str | None) -> list[dict]:
    """Parse Ola's travel_advisory "start,end,level|..." into Google-style speed intervals.

    Ola does not document the level scale. Observed values: 0 on free-flowing roads and higher
    numbers on slowed stretches, so 0 is treated as NORMAL and anything above as SLOW
    (TRAFFIC_JAM from 10 upwards, in case larger values appear).
    """
    intervals: list[dict] = []
    if not advisory:
        return intervals
    for part in advisory.split("|"):
        bits = part.split(",")
        if len(bits) != 3:
            continue
        try:
            start, end, level = int(bits[0]), int(bits[1]), int(float(bits[2]))
        except ValueError:
            continue
        speed = "NORMAL" if level <= 0 else "TRAFFIC_JAM" if level >= 10 else "SLOW"
        intervals.append({"startPolylinePointIndex": start, "endPolylinePointIndex": end, "speed": speed})
    return intervals


def ola_route_response(payload: dict, mode: str) -> dict:
    """Convert an Ola Maps directions response into this app's route format."""
    routes = payload.get("routes") or []
    if (payload.get("status") or "").upper() not in ("SUCCESS", "OK") or not routes:
        raise ValueError("Ola Maps returned no route")
    route = routes[0]
    polyline = route.get("overview_polyline")
    if isinstance(polyline, dict):
        polyline = polyline.get("points")
    coordinates = decode_polyline(polyline) if polyline else []

    legs = []
    for leg in route.get("legs") or []:
        steps = []
        for step in leg.get("steps") or []:
            step_type, modifier = ola_maneuver(step.get("maneuver") or "")
            start = step.get("start_location") or {}
            location = [start["lng"], start["lat"]] if "lat" in start and "lng" in start else None
            steps.append({
                "distance": step.get("distance", 0) or 0,
                "duration": step.get("duration", 0) or 0,
                "name": "",
                "maneuver": {
                    "type": step_type,
                    "modifier": modifier,
                    "instruction": step.get("instructions") or None,
                    "location": location,
                },
            })
        legs.append({
            "distance": leg.get("distance", 0) or 0,
            "duration": leg.get("duration", 0) or 0,
            "static_duration": leg.get("duration", 0) or 0,
            "steps": steps,
        })

    intervals = ola_speed_intervals(route.get("travel_advisory")) if mode != "walk" else []
    return {
        "geometry": {"type": "LineString", "coordinates": coordinates} if len(coordinates) > 1 else None,
        "distance_meters": sum(leg["distance"] for leg in legs),
        "duration_seconds": sum(leg["duration"] for leg in legs),
        "static_duration_seconds": None,
        "legs": legs,
        "traffic_aware": mode != "walk",
        "provider": "Ola Maps",
        "traffic_speed_intervals": intervals,
        "mode": mode,
        "estimated": False,
    }
