"""Read-only lead stage logic for the Dispatch View (no database access)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Iterable, Optional

# Order matters: it is also the order the UI lists stages in.
STAGES = ("awaiting_verification", "unassigned", "assigned", "in_progress", "completed")


@dataclass(frozen=True)
class VisitSnapshot:
    status: str
    scheduled_date: date
    completed_time: Optional[datetime] = None


def latest_visit(visits: Iterable[VisitSnapshot]) -> Optional[VisitSnapshot]:
    """Most recent visit by scheduled date (completion time breaks ties)."""
    def key(visit: VisitSnapshot):
        # timestamp() works for timezone-aware database values; no time sorts first
        done = visit.completed_time.timestamp() if visit.completed_time else float("-inf")
        return (visit.scheduled_date, done)

    best = None
    for visit in visits:
        if best is None or key(visit) > key(best):
            best = visit
    return best


def lead_stage(
    verification_status: str,
    assigned_agent_id,
    visit: Optional[VisitSnapshot],
) -> Optional[str]:
    """Where a lead is in the dispatch flow, or None if it should not be shown (rejected).

    - awaiting_verification: an agent created it and an admin hasn't approved it yet
    - unassigned: verified but no agent owns it
    - assigned: has an agent, no visit started yet
    - in_progress: the agent has checked in to its latest visit
    - completed: its latest visit is completed
    """
    if verification_status == "rejected":
        return None
    if verification_status == "pending":
        return "awaiting_verification"
    if not assigned_agent_id:
        return "unassigned"
    if visit is not None:
        if visit.status == "completed":
            return "completed"
        if visit.status == "in_progress":
            return "in_progress"
    return "assigned"
