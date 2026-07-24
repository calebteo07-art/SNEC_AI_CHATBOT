# tests/api/test_admin_activity_trend.py
"""The cohort activity trend must be counted server-side over a real window.

It was previously derived client-side from /api/admin/activity, whose feed is capped
at 80 items (50 sessions + 50 cases, then [:80]) — so a "last 3 weeks" chart actually
covered days at real cohort volume, and undercounted without saying so.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

TODAY = datetime.now(timezone.utc).date()
D0 = TODAY.isoformat()
D1 = (TODAY - timedelta(days=1)).isoformat()


def _staff_cookie(sub: str = "stu_trend"):
    return {"eyebot_token": create_access_token(sub, "trainer", "OA")}


def _patches(sessions, cases, active):
    return (
        patch("tools.shared.db.get_sessions_since", new=AsyncMock(return_value=sessions)),
        patch("tools.shared.db.get_case_progress_since", new=AsyncMock(return_value=cases)),
        patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=active)),
    )


def test_activity_trend_buckets_counts_by_day():
    sessions = [
        {"student_id": "act1", "created_at": f"{D0}T09:00:00Z"},
        {"student_id": "act1", "created_at": f"{D1}T09:00:00Z"},
    ]
    cases = [{"student_id": "act1", "completed_at": f"{D0}T11:00:00Z"}]
    p1, p2, p3 = _patches(sessions, cases, [{"student_id": "act1"}])
    with p1, p2, p3:
        r = client.get("/api/admin/activity-trend?days=3", cookies=_staff_cookie())
    assert r.status_code == 200
    days = r.json()["days"]
    assert len(days) == 3
    by_date = {d["date"]: d for d in days}
    assert by_date[D0]["sessions"] == 1
    assert by_date[D0]["cases"] == 1
    assert by_date[D0]["total"] == 2
    assert by_date[D1]["sessions"] == 1
    assert by_date[D1]["total"] == 1


def test_activity_trend_excludes_removed_students():
    """Honors the active-members invariant, exactly like /activity and /token-summary."""
    sessions = [
        {"student_id": "act1", "created_at": f"{D0}T09:00:00Z"},
        {"student_id": "rem1", "created_at": f"{D0}T09:30:00Z"},
    ]
    p1, p2, p3 = _patches(sessions, [], [{"student_id": "act1"}])
    with p1, p2, p3:
        r = client.get("/api/admin/activity-trend?days=2", cookies=_staff_cookie("stu_trend2"))
    assert r.status_code == 200
    by_date = {d["date"]: d for d in r.json()["days"]}
    assert by_date[D0]["sessions"] == 1


def test_activity_trend_returns_contiguous_days_including_empty_ones():
    """Every day in the window is present, even with zero activity — a gap-free x-axis."""
    p1, p2, p3 = _patches([], [], [{"student_id": "act1"}])
    with p1, p2, p3:
        r = client.get("/api/admin/activity-trend?days=7", cookies=_staff_cookie("stu_trend3"))
    days = r.json()["days"]
    assert len(days) == 7
    assert all(d["total"] == 0 for d in days)
    assert [d["date"] for d in days] == sorted(d["date"] for d in days)


def test_activity_trend_clamps_days():
    p1, p2, p3 = _patches([], [], [])
    with p1, p2, p3:
        r = client.get("/api/admin/activity-trend?days=999", cookies=_staff_cookie("stu_trend4"))
    assert len(r.json()["days"]) == 90
    p1, p2, p3 = _patches([], [], [])
    with p1, p2, p3:
        r = client.get("/api/admin/activity-trend?days=0", cookies=_staff_cookie("stu_trend5"))
    assert len(r.json()["days"]) == 1
