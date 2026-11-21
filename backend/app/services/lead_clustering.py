"""Nearest-work-area agent suggestion using anchored k-means clustering.

Each active agent owns one cluster. A cluster's centre starts at the agent's
location and is pulled toward the customer sites the agent is working on, so
it represents the agent's actual work area rather than just where the agent
is standing. k equals the number of eligible agents.

Standard k-means would let a centre drift away from its agent entirely. Here
the agent's own location stays in its cluster as a fixed "anchor" with extra
weight, so every cluster remains tied to one agent and can be named.

Pure Python (no numpy) so it is cheap to run per request at city scale.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional, Sequence

EARTH_RADIUS_M = 6_371_000.0


@dataclass(frozen=True)
class AgentAnchor:
    agent_id: str
    latitude: float
    longitude: float


@dataclass(frozen=True)
class WorkPoint:
    latitude: float
    longitude: float


@dataclass
class ClusterResult:
    agent_id: str
    centroid_latitude: float
    centroid_longitude: float
    point_count: int = 0
    distance_to_centroid_m: float = 0.0
    distance_to_agent_m: float = 0.0
    contains_lead: bool = False


@dataclass
class SuggestionResult:
    recommended_agent_id: Optional[str]
    clusters: list[ClusterResult] = field(default_factory=list)
    iterations: int = 0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


class _Projection:
    """Equirectangular projection to metres around a reference latitude.

    Accurate to well under 1% over a city or district, which is all that
    matters for comparing which area centre is closest.
    """

    def __init__(self, ref_lat: float):
        self.kx = math.cos(math.radians(ref_lat)) * EARTH_RADIUS_M * math.pi / 180
        self.ky = EARTH_RADIUS_M * math.pi / 180

    def to_xy(self, lat: float, lon: float) -> tuple[float, float]:
        return lon * self.kx, lat * self.ky

    def to_latlon(self, x: float, y: float) -> tuple[float, float]:
        return y / self.ky, x / self.kx


def _nearest(point: tuple[float, float], centres: Sequence[tuple[float, float]]) -> int:
    best_index, best_d2 = 0, float("inf")
    for index, (cx, cy) in enumerate(centres):
        d2 = (point[0] - cx) ** 2 + (point[1] - cy) ** 2
        if d2 < best_d2:
            best_index, best_d2 = index, d2
    return best_index


def anchored_kmeans(
    anchors: Sequence[tuple[float, float]],
    points: Sequence[tuple[float, float]],
    anchor_weight: float = 3.0,
    max_iterations: int = 25,
) -> tuple[list[tuple[float, float]], list[int], int]:
    """Cluster projected points around fixed anchors.

    Returns (centres, assignment index per point, iterations run).
    """
    centres = [tuple(a) for a in anchors]
    assignment = [-1] * len(points)
    iterations = 0
    for iterations in range(1, max_iterations + 1):
        new_assignment = [_nearest(p, centres) for p in points]
        sums = [[anchor_weight * ax, anchor_weight * ay, anchor_weight] for ax, ay in anchors]
        for (px, py), cluster in zip(points, new_assignment):
            sums[cluster][0] += px
            sums[cluster][1] += py
            sums[cluster][2] += 1
        centres = [(sx / w, sy / w) for sx, sy, w in sums]
        if new_assignment == assignment:
            break
        assignment = new_assignment
    return centres, assignment, iterations


def suggest_agent_for_lead(
    agents: Sequence[AgentAnchor],
    work_points: Sequence[WorkPoint],
    lead_latitude: float,
    lead_longitude: float,
    anchor_weight: float = 3.0,
) -> SuggestionResult:
    """Cluster current work around the agents and pick the cluster the lead falls in.

    Clusters are returned ranked by distance from the lead to the area centre.
    """
    if not agents:
        return SuggestionResult(recommended_agent_id=None)

    all_lats = [a.latitude for a in agents] + [p.latitude for p in work_points] + [lead_latitude]
    projection = _Projection(sum(all_lats) / len(all_lats))
    anchor_xy = [projection.to_xy(a.latitude, a.longitude) for a in agents]
    point_xy = [projection.to_xy(p.latitude, p.longitude) for p in work_points]

    centres, assignment, iterations = anchored_kmeans(anchor_xy, point_xy, anchor_weight)
    lead_xy = projection.to_xy(lead_latitude, lead_longitude)
    lead_cluster = _nearest(lead_xy, centres)

    counts = [0] * len(agents)
    for cluster in assignment:
        counts[cluster] += 1

    clusters: list[ClusterResult] = []
    for index, agent in enumerate(agents):
        c_lat, c_lon = projection.to_latlon(*centres[index])
        clusters.append(ClusterResult(
            agent_id=agent.agent_id,
            centroid_latitude=c_lat,
            centroid_longitude=c_lon,
            point_count=counts[index],
            distance_to_centroid_m=haversine_m(lead_latitude, lead_longitude, c_lat, c_lon),
            distance_to_agent_m=haversine_m(lead_latitude, lead_longitude, agent.latitude, agent.longitude),
            contains_lead=index == lead_cluster,
        ))
    clusters.sort(key=lambda c: (not c.contains_lead, c.distance_to_centroid_m))
    return SuggestionResult(
        recommended_agent_id=agents[lead_cluster].agent_id,
        clusters=clusters,
        iterations=iterations,
    )
