# tests/api/test_admin_activity_fields.py
"""The activity feed must carry structured case-grade fields, not just a display string.

AdminCohort previously regex-parsed "32/40" back out of `detail` for its avg-OSCE KPI,
and its two Tier-2 OSCE panels filtered on a `safe` field the feed never emitted — so
they permanently rendered a placeholder blaming migration 011, which has been applied
since 2026-07-14. The data is in case_progress; the endpoint just never sent it.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _admin_cookie():
    return {"eyebot_token": create_access_token("stu_feed_fields", "admin", "OA")}


def _patches(cases):
    consent = [{"student_id": "act1", "student_name": "Active Ann"}]
    active = [{"student_id": "act1", "role": "OA"}]
    return (
        patch("tools.shared.db.get_all_sessions", new=AsyncMock(return_value=[])),
        patch("tools.shared.db.get_all_case_progress", new=AsyncMock(return_value=cases)),
        patch("tools.shared.db.get_all_consent", new=AsyncMock(return_value=consent)),
        patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=active)),
    )


def test_activity_feed_emits_case_grade_fields():
    cases = [{
        "student_id": "act1", "case_id": "case_ot_001", "total_score": 32,
        "passed": True, "completed_at": "2026-07-20T10:00:00Z",
        "score_100": 82, "safe": False, "missed_critical": ["Did not check IOP"],
    }]
    p1, p2, p3, p4 = _patches(cases)
    with p1, p2, p3, p4:
        r = client.get("/api/admin/activity", cookies=_admin_cookie())
    assert r.status_code == 200
    item = next(i for i in r.json()["feed"] if i["type"] == "case")
    assert item["case_id"] == "case_ot_001"
    assert item["total_score"] == 32
    assert item["passed"] is True
    assert item["score_100"] == 82
    assert item["safe"] is False
    assert item["missed_critical"] == ["Did not check IOP"]


def test_activity_feed_omits_grade_fields_when_ungraded():
    """A pre-Tier-2 row has no rich columns — omit the keys rather than inventing zeros,
    so the frontend can distinguish 'ungraded' from 'scored 0'."""
    cases = [{
        "student_id": "act1", "case_id": "case_oa_002", "total_score": 28,
        "passed": True, "completed_at": "2026-07-20T10:00:00Z",
    }]
    p1, p2, p3, p4 = _patches(cases)
    with p1, p2, p3, p4:
        r = client.get("/api/admin/activity", cookies=_admin_cookie())
    assert r.status_code == 200
    item = next(i for i in r.json()["feed"] if i["type"] == "case")
    assert "score_100" not in item
    assert "safe" not in item
    assert item["total_score"] == 28


def test_activity_feed_keeps_display_detail_string():
    """`detail` still drives the human-readable feed row — additive change only."""
    cases = [{
        "student_id": "act1", "case_id": "case_ot_001", "total_score": 32,
        "passed": True, "completed_at": "2026-07-20T10:00:00Z",
    }]
    p1, p2, p3, p4 = _patches(cases)
    with p1, p2, p3, p4:
        r = client.get("/api/admin/activity", cookies=_admin_cookie())
    item = next(i for i in r.json()["feed"] if i["type"] == "case")
    assert item["detail"] == "case_ot_001 ✓ · 32/40"
