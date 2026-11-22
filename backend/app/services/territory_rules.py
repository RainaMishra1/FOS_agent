"""Pure rules for territories and agent-generated leads (no database access).

PostGIS decides whether a point is inside a territory polygon. Everything that
can be decided from plain numbers lives here so it can be unit-tested:
polygon input validation, the GPS evidence required to submit a lead, and how
territory matches are ranked into an agent suggestion.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Optional, Sequence

EARTH_RADIUS_M = 6_371_000.0
MAX_POLYGON_VERTICES = 500


class RuleViolation(ValueError):
    """Raised with a message that can be shown to the user as-is."""


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


# --------------------------------------------------------------------------
# Polygon input
# --------------------------------------------------------------------------

def normalize_ring(points: Sequence[Sequence[float]]) -> list[tuple[float, float]]:
    """Validate a polygon outline given as [latitude, longitude] points.

    Returns a closed ring of (longitude, latitude) pairs, the order PostGIS
    and GeoJSON use. Self-intersection is checked afterwards by PostGIS.
    """
    if not isinstance(points, (list, tuple)):
        raise RuleViolation("The territory outline must be a list of points.")
    ring: list[tuple[float, float]] = []
    for point in points:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            raise RuleViolation("Each territory point needs a latitude and a longitude.")
        lat, lng = float(point[0]), float(point[1])
        if not (math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180):
            raise RuleViolation("A territory point has an invalid latitude or longitude.")
        if ring and ring[-1] == (lng, lat):
            continue  # ignore accidental double clicks
        ring.append((lng, lat))
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring.pop()
    if len(set(ring)) < 3:
        raise RuleViolation("Draw at least 3 distinct corners for a territory.")
    if len(ring) > MAX_POLYGON_VERTICES:
        raise RuleViolation(f"A territory can have at most {MAX_POLYGON_VERTICES} corners.")
    ring.append(ring[0])
    return ring


def ring_to_wkt(ring: Sequence[tuple[float, float]]) -> str:
    return "POLYGON((" + ", ".join(f"{lng:.7f} {lat:.7f}" for lng, lat in ring) + "))"


# --------------------------------------------------------------------------
# GPS evidence for an agent-generated lead
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class GpsReading:
    latitude: float
    longitude: float
    accuracy_meters: Optional[float]  # None means the location was entered manually
    recorded_at: datetime


def check_lead_gps(
    reading: Optional[GpsReading],
    lead_latitude: float,
    lead_longitude: float,
    *,
    max_accuracy_m: float,
    max_age_seconds: float,
    max_distance_m: float,
    now: Optional[datetime] = None,
) -> float:
    """Check that the agent is really at the lead. Returns the distance in metres.

    The agent's latest reading must be device GPS (not manual), fresh,
    accurate enough, and within the geofence radius of the lead location.
    Territory membership is checked separately in PostGIS.
    """
    if not (math.isfinite(lead_latitude) and math.isfinite(lead_longitude)):
        raise RuleViolation("The lead location is invalid.")
    if reading is None:
        raise RuleViolation("No GPS reading found. Allow location access and try again.")
    if reading.accuracy_meters is None:
        raise RuleViolation("Your latest location was entered manually. Leads need live GPS.")
    if reading.accuracy_meters > max_accuracy_m:
        raise RuleViolation(
            f"GPS accuracy is ±{reading.accuracy_meters:.0f}m; it must be {max_accuracy_m:.0f}m or better."
        )
    now = now or datetime.now(timezone.utc)
    recorded = reading.recorded_at if reading.recorded_at.tzinfo else reading.recorded_at.replace(tzinfo=timezone.utc)
    if (now - recorded).total_seconds() > max_age_seconds:
        raise RuleViolation("Your GPS location is out of date. Refresh your location and try again.")
    distance = haversine_m(reading.latitude, reading.longitude, lead_latitude, lead_longitude)
    if distance > max_distance_m:
        raise RuleViolation(
            f"The lead must be within {max_distance_m:.0f}m of where you are. "
            f"You are {distance:.0f}m away from the lead location."
        )
    return distance


# --------------------------------------------------------------------------
# Territory-based agent suggestion
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class TerritoryMatch:
    agent_id: str
    agent_active: bool
    territory_id: str
    territory_name: str
    covers_point: bool
    distance_m: float  # 0 when the point is inside


@dataclass(frozen=True)
class AgentTerritoryFit:
    agent_id: str
    territory_id: str
    territory_name: str
    inside: bool
    distance_m: float


def rank_by_territory(matches: Iterable[TerritoryMatch]) -> tuple[Optional[str], bool, list[AgentTerritoryFit]]:
    """Pick the agent whose territory contains the point.

    Returns (recommended agent id, whether the point is inside that agent's
    territory, one best fit per active agent ranked inside-first then by
    distance). If no territory contains the point, the agent with the nearest
    territory is recommended and the flag is False.
    """
    best: dict[str, AgentTerritoryFit] = {}
    for match in matches:
        if not match.agent_active:
            continue
        fit = AgentTerritoryFit(
            agent_id=match.agent_id,
            territory_id=match.territory_id,
            territory_name=match.territory_name,
            inside=match.covers_point,
            distance_m=0.0 if match.covers_point else max(0.0, match.distance_m),
        )
        current = best.get(match.agent_id)
        if current is None or (fit.inside, -fit.distance_m) > (current.inside, -current.distance_m):
            best[match.agent_id] = fit
    ranked = sorted(best.values(), key=lambda f: (not f.inside, f.distance_m, f.territory_name))
    if not ranked:
        return None, False, []
    return ranked[0].agent_id, ranked[0].inside, ranked


# --------------------------------------------------------------------------
# Territories defined by addresses: a radius around one place, or the box
# ("from - to") with the two places at opposite corners, plus a margin.
# --------------------------------------------------------------------------

MIN_RADIUS_M = 100.0
MAX_RADIUS_M = 50_000.0
MAX_BOX_DIAGONAL_M = 200_000.0


def _metres_per_degree(ref_lat: float) -> tuple[float, float]:
    ky = EARTH_RADIUS_M * math.pi / 180
    return math.cos(math.radians(ref_lat)) * ky, ky


def _check_place(lat: float, lng: float) -> None:
    if not (math.isfinite(lat) and math.isfinite(lng) and -85 <= lat <= 85 and -180 <= lng <= 180):
        raise RuleViolation("A territory location has an invalid latitude or longitude.")


def box_bounds(
    start: tuple[float, float], end: tuple[float, float], margin_m: float
) -> tuple[float, float, float, float]:
    """(south, west, north, east) of the box with `start` and `end` at opposite corners, grown by `margin_m`."""
    kx, ky = _metres_per_degree((start[0] + end[0]) / 2)
    south, north = min(start[0], end[0]) - margin_m / ky, max(start[0], end[0]) + margin_m / ky
    west, east = min(start[1], end[1]) - margin_m / kx, max(start[1], end[1]) + margin_m / kx
    return south, west, north, east


def area_ring(
    start: tuple[float, float],
    end: Optional[tuple[float, float]],
    radius_m: float,
    segments: int = 64,
) -> list[tuple[float, float]]:
    """Closed (longitude, latitude) ring for a territory defined by addresses.

    `start`/`end` are (latitude, longitude).
    - Without `end`: a circle of `radius_m` around `start` (64 sides, edge
      within 0.2% of the true radius).
    - With `end`: the north-south / east-west box that has `start` and `end`
      at opposite corners, extended by `radius_m` on every side.
    """
    if not (MIN_RADIUS_M <= radius_m <= MAX_RADIUS_M):
        label = "Margin" if end else "Radius"
        raise RuleViolation(f"{label} must be between {MIN_RADIUS_M / 1000:g} km and {MAX_RADIUS_M / 1000:g} km.")
    _check_place(*start)

    if end is not None:
        _check_place(*end)
        diagonal = haversine_m(start[0], start[1], end[0], end[1])
        if diagonal > MAX_BOX_DIAGONAL_M:
            raise RuleViolation(
                f"From and to are {diagonal / 1000:.0f} km apart; the maximum is {MAX_BOX_DIAGONAL_M / 1000:.0f} km."
            )
        south, west, north, east = box_bounds(start, end, radius_m)
        corners = [(west, south), (east, south), (east, north), (west, north), (west, south)]
        return [(round(lng, 7), round(lat, 7)) for lng, lat in corners]

    kx, ky = _metres_per_degree(start[0])
    cx, cy = start[1] * kx, start[0] * ky
    ring = []
    for i in range(segments):
        angle = 2 * math.pi * i / segments
        ring.append((round((cx + radius_m * math.cos(angle)) / kx, 7), round((cy + radius_m * math.sin(angle)) / ky, 7)))
    ring.append(ring[0])
    return ring


def distance_outside_area_m(
    point: tuple[float, float],
    start: tuple[float, float],
    end: Optional[tuple[float, float]],
    radius_m: float,
) -> float:
    """Metres a (lat, lng) point lies outside a radius or box area (0 if inside)."""
    kx, ky = _metres_per_degree(point[0])
    if end is None:
        return max(0.0, haversine_m(point[0], point[1], start[0], start[1]) - radius_m)
    south, west, north, east = box_bounds(start, end, radius_m)
    dy = max(south - point[0], 0.0, point[0] - north) * ky
    dx = max(west - point[1], 0.0, point[1] - east) * kx
    return math.hypot(dx, dy)
