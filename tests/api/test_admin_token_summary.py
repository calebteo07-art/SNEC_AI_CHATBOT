"""/api/admin/token-summary must count every session, or say that it could not.

The endpoint read db.get_all_sessions(), which defaults limit=500 — past 500 sessions the
"AI tokens" KPI rendered a confident number that was simply too small, with nothing on the
wire to say so. It now reads the paginated two-column sibling and emits `complete`.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token
from tests.support.postgrest_fake import FakeClient

client = TestClient(app)


def _admin_cookie():
    # Unique sub per test file so this file's requests never share a limiter bucket.
    return {"eyebot_token": create_access_token("stu_token_summary", "admin", "OA")}


def test_token_summary_counts_past_500_sessions():
    """1200 sessions x 100 tokens = 120_000. A limit=500 read reports 50_000 — a wrong
    number with no way for the UI to know. Patched at the client seam so the pagination
    itself is exercised end to end, not just the aggregation."""
    fake = FakeClient({"chat_sessions": [
        {"student_id": "act1", "token_count": 100} for _ in range(1200)
    ]})
    active = [{"student_id": "act1", "role": "OA"}]
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=fake)), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=active)):
        r = client.get("/api/admin/token-summary", cookies=_admin_cookie())
    assert r.status_code == 200
    body = r.json()
    assert body["total_tokens"] == 120_000
    assert body["complete"] is True
    by_student = {row["student_id"]: row["tokens"] for row in body["by_student"]}
    assert by_student == {"act1": 120_000}


def test_token_summary_flags_incomplete_at_cap():
    """A cap hit must reach the wire. `complete: false` means total_tokens is a FLOOR, and
    the KPI renders "≥ 30.0k" — a truthful lower bound beats a confident wrong total."""
    rows = [{"student_id": "act1", "token_count": 30_000}]
    active = [{"student_id": "act1", "role": "OA"}]
    with patch("tools.shared.db.get_all_session_tokens", new=AsyncMock(return_value=(rows, False))), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=active)):
        r = client.get("/api/admin/token-summary", cookies=_admin_cookie())
    assert r.status_code == 200
    body = r.json()
    assert body["complete"] is False
    assert body["total_tokens"] == 30_000


def test_token_summary_reports_complete_on_a_full_read():
    rows = [{"student_id": "act1", "token_count": 42}]
    active = [{"student_id": "act1", "role": "OA"}]
    with patch("tools.shared.db.get_all_session_tokens", new=AsyncMock(return_value=(rows, True))), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=active)):
        r = client.get("/api/admin/token-summary", cookies=_admin_cookie())
    assert r.json()["complete"] is True
    assert r.json()["total_tokens"] == 42


def test_token_summary_db_failure_is_a_500_not_a_zero():
    """P1's invariant: a failed read must never render as a real measurement of zero."""
    with patch("tools.shared.db.get_all_session_tokens",
               new=AsyncMock(side_effect=Exception("chat_sessions unavailable"))), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=[])):
        r = client.get("/api/admin/token-summary", cookies=_admin_cookie())
    assert r.status_code == 500


def test_token_summary_is_rate_limited_per_user():
    """The most expensive read on the board (a paginated full-table scan) is now the
    only admin analytics GET with no cap. Every other expensive sibling has one
    (activity-trend 60/min, audit 30/min) — match audit's 30/min here."""
    cookie = {"eyebot_token": create_access_token("stu_token_summary_rl", "admin", "OA")}
    with patch("tools.shared.db.get_all_session_tokens", new=AsyncMock(return_value=([], True))), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=[])):
        statuses = [client.get("/api/admin/token-summary", cookies=cookie).status_code for _ in range(32)]
    assert statuses[0] == 200, statuses
    assert 429 in statuses, f"expected a 429 once the per-minute cap is exceeded, got {statuses}"
