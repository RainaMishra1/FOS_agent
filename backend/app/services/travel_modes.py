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
    if "DESTINATION" in m:
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
