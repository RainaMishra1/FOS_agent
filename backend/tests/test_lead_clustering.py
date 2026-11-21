"""Tests for automatic nearest-work-area agent suggestion (anchored k-means)."""
import pytest

from app.services.lead_clustering import (
    AgentAnchor,
    WorkPoint,
    anchored_kmeans,
    haversine_m,
    suggest_agent_for_lead,
)

# Mumbai-area reference points
ANDHERI = (19.1197, 72.8468)
THANE = (19.2183, 72.9781)
VASHI = (19.0771, 72.9986)
NERUL = (19.0330, 73.0297)
JUHU = (19.1075, 72.8263)


def test_no_agents_means_no_suggestion():
    result = suggest_agent_for_lead([], [WorkPoint(*VASHI)], *NERUL)
    assert result.recommended_agent_id is None
    assert result.clusters == []


def test_single_agent_is_always_suggested():
    result = suggest_agent_for_lead([AgentAnchor("A", *ANDHERI)], [], *NERUL)
    assert result.recommended_agent_id == "A"
    assert result.clusters[0].contains_lead


def test_without_work_history_nearest_agent_wins():
    agents = [AgentAnchor("A", *ANDHERI), AgentAnchor("B", *THANE)]
    assert suggest_agent_for_lead(agents, [], *JUHU).recommended_agent_id == "A"


def test_work_area_beats_raw_distance_to_agent():
    """B is based in Thane but works in Vashi, so a Nerul lead goes to B."""
    agents = [AgentAnchor("A", *ANDHERI), AgentAnchor("B", *THANE)]
    work = [WorkPoint(19.0771, 72.9986), WorkPoint(19.0745, 73.0010), WorkPoint(19.0800, 72.9950)]
    result = suggest_agent_for_lead(agents, work, *NERUL)
    assert result.recommended_agent_id == "B"
    best = result.clusters[0]
    assert best.agent_id == "B" and best.contains_lead
    assert best.point_count == 3
    # B's area centre has moved toward Vashi, closer to the lead than B himself.
    assert best.distance_to_centroid_m < best.distance_to_agent_m


def test_clusters_are_ranked_by_distance_to_area():
    agents = [AgentAnchor("A", *ANDHERI), AgentAnchor("B", *THANE)]
    result = suggest_agent_for_lead(agents, [], *JUHU)
    distances = [c.distance_to_centroid_m for c in result.clusters]
    assert distances == sorted(distances)
    assert sum(c.contains_lead for c in result.clusters) == 1


def test_anchor_keeps_each_cluster_tied_to_its_agent():
    """Even with all work far away, every centre stays between its agent and that work."""
    anchors = [(0.0, 0.0), (10_000.0, 0.0)]
    points = [(100_000.0, 0.0)] * 5
    centres, assignment, iterations = anchored_kmeans(anchors, points, anchor_weight=3.0)
    assert assignment == [1] * 5  # nearest anchor takes the work
    assert centres[0] == (0.0, 0.0)  # untouched agent stays at its own location
    assert 10_000 < centres[1][0] < 100_000
    assert iterations >= 1


def test_haversine_known_distance():
    # Andheri to Thane is roughly 17-18 km in a straight line.
    assert 16_000 < haversine_m(*ANDHERI, *THANE) < 19_000
