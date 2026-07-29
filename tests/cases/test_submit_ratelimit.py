"""Regression: /api/cases/{id}/submit must be rate-limited.

The station-submit endpoint fires TWO paid Gemini calls (grade + coaching) and
grants XP, yet — unlike every sibling AI endpoint (observe/action/chat: 30-40/min)
— it carried no @limiter.limit. A client loop (or a raced double-submit) could
re-fire both Gemini calls and re-trigger the high-water XP award unthrottled. This
locks in a per-user cap so a hammering client is refused with HTTP 429.
"""
from contextlib import ExitStack
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

_CASE = {
    "case_id": "case_rl",
    "title": "Routine IOP check",
    "difficulty": "beginner",
    "topic": "iop_va_measurement",
    "estimated_minutes": 15,
    "patient": {"name": "Mr Tan", "age": 60, "presenting_complaint": "review"},
    "examination_findings": {},
}
_DOMAINS = {
    "history_score": 5, "investigations_score": 5, "diagnosis_score": 5, "management_score": 5,
    "history_feedback": "", "investigations_feedback": "", "diagnosis_feedback": "",
    "management_feedback": "", "overall_feedback": "", "total_score": 20,
    "critical_hit": 1, "critical_total": 2,
}
_SCORE = {
    "score_100": 80, "total_score": 32, "verdict": "Competent",
    "consult_technique": 40, "consult_technique_max": 50,
    "judgement_safety": 40, "judgement_safety_max": 50, "safe": True,
    "missed_critical": [], "critical_hit": 1, "critical_total": 2,
    # Mirrors what compute_station_score really returns (tests/test_station_score_breakdown.py);
    # kept in the fixture so a stale mock can't hide a shape change from the submit route.
    "breakdown": {
        "consult": {"parts": [{"label": "History-taking", "pts": 8, "max": 10}],
                    "total": 40, "max": 50, "capped": False, "cap_reason": ""},
        "judgement": {"parts": [{"label": "Recognition", "pts": 8, "max": 10}],
                      "total": 40, "max": 50, "capped": False, "cap_reason": ""},
    },
}


def _submit(client):
    return client.post(
        "/api/cases/case_rl/submit",
        json={
            "messages": [{"role": "user", "content": "Good morning."}],
            "findings": "IOP within range.",
            "recommendation": "Hand over to the doctor.",
            "performed_steps": [],
        },
        cookies={"eyebot_token": create_access_token("stu_rl", "student", "OA")},
    )


def test_submit_is_rate_limited_per_user():
    client = TestClient(app)
    with ExitStack() as es:
        p = es.enter_context
        p(patch.dict("tools.api.shared._case_cache", {"case_rl": _CASE}, clear=False))
        p(patch("tools.api.routers.cases.load_case", return_value=_CASE))
        p(patch("tools.api.routers.cases.list_available_cases", return_value=["case_rl"]))
        p(patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})))
        p(patch("tools.api.routers.cases._station_checklist",
                return_value={"procedure_name": "NCT", "steps": [], "source": "checklist"}))
        p(patch("tools.api.routers.cases.evaluate_case", return_value=_DOMAINS))
        p(patch("tools.api.routers.cases.compute_station_score", return_value=_SCORE))
        p(patch("tools.api.routers.cases.ask", return_value="{}"))
        p(patch("tools.api.routers.cases.log_session", new=AsyncMock(return_value=None)))
        p(patch("tools.api.routers.cases.log_case_completion", new=AsyncMock(return_value=None)))
        p(patch("tools.profile.update_profile.update_profile", new=AsyncMock(return_value=None)))
        p(patch("tools.api.routers.cases.db.get_case_results", new=AsyncMock(return_value=[])))

        statuses = [_submit(client).status_code for _ in range(11)]

    assert statuses[0] == 200, statuses
    assert 429 in statuses, f"expected a 429 once the per-minute cap is exceeded, got {statuses}"
