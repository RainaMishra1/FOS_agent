"""Dispatch View stage logic."""
import uuid
from datetime import date, datetime, timezone

from app.services.dispatch_stages import VisitSnapshot, latest_visit, lead_stage

AGENT = uuid.uuid4()


def test_stages():
    assert lead_stage("rejected", AGENT, None) is None
    assert lead_stage("pending", None, None) == "awaiting_verification"
    assert lead_stage("approved", None, None) == "unassigned"
    assert lead_stage("approved", AGENT, None) == "assigned"
    assert lead_stage("approved", AGENT, VisitSnapshot("pending", date(2026, 11, 22))) == "assigned"
    assert lead_stage("approved", AGENT, VisitSnapshot("in_progress", date(2026, 11, 22))) == "in_progress"
    assert lead_stage("approved", AGENT, VisitSnapshot("completed", date(2026, 11, 22))) == "completed"


def test_latest_visit_wins():
    old = VisitSnapshot("completed", date(2026, 11, 1), datetime(2026, 11, 1, 12))
    new = VisitSnapshot("pending", date(2026, 11, 25))
    assert latest_visit([old, new]) is new
    assert latest_visit([]) is None
    # a completed revisit later the same day beats an earlier one
    a = VisitSnapshot("completed", date(2026, 11, 20), datetime(2026, 11, 20, 9))
    b = VisitSnapshot("completed", date(2026, 11, 20), datetime(2026, 11, 20, 17))
    assert latest_visit([a, b]) is b


def test_mixed_completion_times_do_not_crash():
    done = VisitSnapshot("completed", date(2026, 11, 20), datetime(2026, 11, 20, 9, tzinfo=timezone.utc))
    open_visit = VisitSnapshot("pending", date(2026, 11, 20))
    assert latest_visit([open_visit, done]) is done
