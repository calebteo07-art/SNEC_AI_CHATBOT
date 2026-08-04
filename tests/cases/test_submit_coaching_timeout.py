"""Regression: a stalled coaching Gemini call must not make the student wait.

/api/cases/{id}/submit fires the coaching call concurrently with grading and
awaits it before responding. It is already best-effort (a deterministic fallback
fills in on any failure), but the await had no timeout — so a slow/hung Gemini
coaching call could keep the student waiting minutes after the station is already
graded. This bounds the coaching await; on timeout the deterministic fallback is
used and the response returns promptly.
"""
import time
from contextlib import ExitStack
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token


@pytest.fixture(autouse=True)
def _stub_profile_read():
    """/submit resolves the student's content pool from their profile.

    The test pins every other db call but not this one, so it read production Supabase for
    a `stu_coach` id that isn't there — and a miss makes `tools.profile.get_profile` CREATE
    the row (db.upsert_profile), so it wrote too. The subject is the coaching timeout,
    which this doesn't touch. See `_forbid_real_supabase` in tests/conftest.py.
    """
    with patch("tools.shared.db.get_profile", new=AsyncMock(return_value={"role": "OA"})):
        yield

_CASE = {
    "case_id": "case_coach",
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
    "checklist_coverage": 32, "checklist_coverage_max": 40,
    "consult_technique": 24, "consult_technique_max": 30,
    "judgement_safety": 24, "judgement_safety_max": 30, "safe": True,
    "missed_critical": [], "critical_hit": 1, "critical_total": 2,
    # Mirrors what compute_station_score really returns (tests/test_station_score_breakdown.py);
    # kept in the fixture so a stale mock can't hide a shape change from the submit route.
    "breakdown": {
        "checklist": {"parts": [{"label": "Steps performed", "pts": 4, "max": 5}],
                      "total": 32, "max": 40, "capped": False, "cap_reason": ""},
        "consult": {"parts": [{"label": "History-taking", "pts": 8, "max": 10}],
                    "total": 24, "max": 30, "capped": False, "cap_reason": ""},
        "judgement": {"parts": [{"label": "Recognition", "pts": 8, "max": 10}],
                      "total": 24, "max": 30, "capped": False, "cap_reason": ""},
    },
}
_SLOW_FOCUS = "SLOW_COACHING_SHOULD_BE_ABANDONED"


def _slow_coaching(*args, **kwargs):
    # Runs inside asyncio.to_thread; blocking here simulates a hung Gemini call.
    time.sleep(0.6)
    return '{"highlights":["x"],"did_wrong":[],"missed":[],"focus":"%s"}' % _SLOW_FOCUS


def test_submit_falls_back_when_coaching_call_stalls():
    client = TestClient(app)
    with ExitStack() as es:
        p = es.enter_context
        p(patch.dict("tools.api.shared._case_cache", {"case_coach": _CASE}, clear=False))
        p(patch("tools.api.routers.cases.load_case", return_value=_CASE))
        p(patch("tools.api.routers.cases.list_available_cases", return_value=["case_coach"]))
        p(patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})))
        p(patch("tools.api.routers.cases._station_checklist",
                return_value={"procedure_name": "NCT", "steps": [], "source": "checklist"}))
        p(patch("tools.api.routers.cases.evaluate_case", return_value=_DOMAINS))
        p(patch("tools.api.routers.cases.compute_station_score", return_value=_SCORE))
        p(patch("tools.api.routers.cases.log_session", new=AsyncMock(return_value=None)))
        p(patch("tools.api.routers.cases.log_case_completion", new=AsyncMock(return_value=None)))
        p(patch("tools.profile.update_profile.update_profile", new=AsyncMock(return_value=None)))
        p(patch("tools.api.routers.cases.db.get_case_results", new=AsyncMock(return_value=[])))
        # A coaching call that stalls well past the bound; and a tiny bound.
        p(patch("tools.api.routers.cases.ask", new=_slow_coaching))
        p(patch("tools.api.routers.cases._COACH_TIMEOUT_S", 0.05, create=True))

        r = client.post(
            "/api/cases/case_coach/submit",
            json={
                "messages": [{"role": "user", "content": "Good morning."}],
                "findings": "IOP within range.",
                "recommendation": "Hand over to the doctor.",
                "performed_steps": [],
            },
            cookies={"eyebot_token": create_access_token("stu_coach", "student", "OA")},
        )

    assert r.status_code == 200, r.text
    coaching = r.json()["coaching"]
    # The stalled coaching result must NOT be used; the deterministic fallback fills in.
    assert coaching["focus"] != _SLOW_FOCUS, coaching
    # The fallback always leaves a non-empty focus so the student sees real feedback.
    assert coaching["focus"], coaching
