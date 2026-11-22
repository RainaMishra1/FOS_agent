from datetime import datetime, timedelta, timezone

from app.services.admin_events import VisitRecord, visit_events

NOW = datetime(2026, 11, 22, 15, 0, tzinfo=timezone.utc)


def record(visit_id, check_in=None, completed=None):
    return VisitRecord(visit_id, f"VST-{visit_id}", "Rishabh Mishra", "121", f"Shop {visit_id}", check_in, completed, True)


def test_started_and_completed_events_newest_first():
    visits = [
        record("a", check_in=NOW - timedelta(hours=2), completed=NOW - timedelta(hours=1)),
        record("b", check_in=NOW - timedelta(minutes=30)),
        record("c"),  # not started yet: no events
    ]
    events = visit_events(visits, since=NOW - timedelta(days=1), limit=10)
    assert [e["id"] for e in events] == ["b:started", "a:completed", "a:started"]
    assert events[1]["kind"] == "completed" and events[1]["customer_name"] == "Shop a"


def test_old_events_and_limit():
    visits = [record("old", check_in=NOW - timedelta(days=9)), record("new", check_in=NOW, completed=NOW + timedelta(minutes=5))]
    events = visit_events(visits, since=NOW - timedelta(days=7), limit=1)
    assert [e["id"] for e in events] == ["new:completed"]
