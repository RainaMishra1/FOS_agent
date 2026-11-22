"""Turn visit check-ins and completions into admin notifications (pure helpers, easy to test)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Optional


@dataclass(frozen=True)
class VisitRecord:
    visit_id: str
    visit_code: Optional[str]
    agent_name: str
    agent_code: Optional[str]
    customer_name: str
    check_in_time: Optional[datetime]
    completed_time: Optional[datetime]
    geofence_verified: bool


def visit_events(visits: Iterable[VisitRecord], since: datetime, limit: int) -> list[dict]:
    """Newest first: one "started" event per check-in and one "completed" event per completion after `since`."""
    events: list[dict] = []
    for visit in visits:
        for kind, at in (("started", visit.check_in_time), ("completed", visit.completed_time)):
            if at is None or at < since:
                continue
            events.append({
                "id": f"{visit.visit_id}:{kind}",
                "kind": kind,
                "at": at,
                "visit_id": visit.visit_id,
                "visit_code": visit.visit_code,
                "agent_name": visit.agent_name,
                "agent_code": visit.agent_code,
                "customer_name": visit.customer_name,
                "geofence_verified": visit.geofence_verified,
            })
    events.sort(key=lambda event: event["at"], reverse=True)
    return events[:limit]
