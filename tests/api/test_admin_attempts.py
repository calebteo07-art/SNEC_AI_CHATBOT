"""GET /api/admin/student/{id}/attempts — the per-attempt ledger, served on demand.

Deliberately NOT part of /detail: that endpoint is polled every 30s (useAdmin.ts:9) and a
worst-case ledger is ~5KB, so folding it in would add ~152KB per poll for a student with 30
attempts, to carry data only read when a trainer clicks download.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _cookies(role: str = "admin") -> dict:
    return {"eyebot_token": create_access_token("user_001", role, "OA")}


ROW = {
    "case_id": "c1", "total_score": 29, "passed": True, "completed_at": "2026-08-01T00:00:00Z",
    "score_100": 72, "safe": True, "checklist_coverage": 30, "consult_technique": 22,
    "judgement_safety": 20, "grade_scale": 2, "missed_critical": [],
    "coaching": {"do_next": "Slow down on consent."},
    "checklist_detail": [{"step_number": 1, "action": "Perform hand hygiene.",
                          "phase": "Preparation", "critical": True,
                          "performed": False, "skipped": True}],
}


def test_attempts_carries_the_ledger_and_coaching():
    with patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=[ROW])):
        r = client.get("/api/admin/student/stu_x/attempts", cookies=_cookies())
    assert r.status_code == 200
    row = r.json()["attempts"][0]
    assert row["checklist_detail"][0]["action"] == "Perform hand hygiene."
    assert row["checklist_detail"][0]["performed"] is False
    assert row["coaching"]["do_next"] == "Slow down on consent."


def test_attempts_keeps_a_missing_ledger_null_not_empty():
    """NULL means 'this attempt predates migration 019'. [] would assert the student
    performed no steps -- the two must stay distinguishable in the document."""
    bare = {k: v for k, v in ROW.items() if k not in ("checklist_detail", "coaching")}
    with patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=[bare])):
        r = client.get("/api/admin/student/stu_x/attempts", cookies=_cookies())
    assert r.json()["attempts"][0]["checklist_detail"] is None


def test_attempts_are_chronological():
    rows = [dict(ROW, case_id="late", completed_at="2026-08-05T00:00:00Z"),
            dict(ROW, case_id="early", completed_at="2026-08-01T00:00:00Z")]
    with patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=rows)):
        r = client.get("/api/admin/student/stu_x/attempts", cookies=_cookies())
    assert [a["case_id"] for a in r.json()["attempts"]] == ["early", "late"]


def test_attempts_rejects_a_student():
    r = client.get("/api/admin/student/stu_x/attempts", cookies=_cookies("student"))
    assert r.status_code == 403
