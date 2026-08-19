"""The staff console must show the SAME streak the student's own app shows.

`update_profile` only ever increments `student_profiles.streak`; nothing decays it. Three
other routers therefore resolve it at read time through `gamification.streak.resolve_streak`,
which heals the count from `checkin_history` and zeroes a lapsed one. The two admin
surfaces read the raw column instead, so the roster printed "14" beside a Last-active of
three weeks ago while the student's Home and the League both showed 0 — a trainer opening
the console saw a thriving habit for an account that had stopped.
"""
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

_TODAY = date(2026, 8, 19)
# Last check-in 20 days ago: long lapsed, with no freeze that could cover it.
_STALE = (_TODAY - timedelta(days=20)).isoformat()


def _cookie():
    return {"eyebot_token": create_access_token("admin_1", "admin", "OA")}


_PROFILE = {
    "student_id": "s1", "role": "OA", "session_count": 4,
    # The raw column, never decayed by the writer.
    "streak": 14, "streak_freezes": 0,
    "checkin_history": [_STALE],
    "last_active": _STALE,
    "weak_topics": [], "learning_velocity": "stable",
}


def test_the_roster_streak_is_resolved_not_the_raw_column():
    with patch("tools.shared.db.get_all_profiles", new=AsyncMock(return_value=[_PROFILE])), \
         patch("tools.shared.db.get_all_consent", new=AsyncMock(return_value=[
             {"student_id": "s1", "email": "a@b.com", "student_name": "Ann Tan"}])), \
         patch("tools.shared.db.get_all_approved", new=AsyncMock(return_value=[
             {"email": "a@b.com"}])), \
         patch("tools.api.routers.admin.app_today", return_value=_TODAY):
        r = client.get("/api/admin/students", cookies=_cookie())

    assert r.status_code == 200, r.text
    row = r.json()["students"][0]
    assert row["streak"] == 0, "a streak last fed 20 days ago has lapsed"


def test_a_live_streak_still_shows():
    """The control. Resolving must not zero a streak that is genuinely running, or the
    fix trades one wrong number for another."""
    live = {**_PROFILE, "checkin_history": [_TODAY.isoformat()], "last_active": _TODAY.isoformat()}
    with patch("tools.shared.db.get_all_profiles", new=AsyncMock(return_value=[live])), \
         patch("tools.shared.db.get_all_consent", new=AsyncMock(return_value=[
             {"student_id": "s1", "email": "a@b.com", "student_name": "Ann Tan"}])), \
         patch("tools.shared.db.get_all_approved", new=AsyncMock(return_value=[
             {"email": "a@b.com"}])), \
         patch("tools.api.routers.admin.app_today", return_value=_TODAY):
        r = client.get("/api/admin/students", cookies=_cookie())

    assert r.json()["students"][0]["streak"] == 14
