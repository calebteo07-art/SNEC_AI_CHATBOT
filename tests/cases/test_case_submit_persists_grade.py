from contextlib import ExitStack
from unittest.mock import patch, AsyncMock

import pytest
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token


@pytest.fixture(autouse=True)
def _stub_submit_db():
    """The two reads /submit makes that this test doesn't pin itself.

    Both ran against production Supabase: the content-pool profile lookup (a miss also
    made `tools.profile.get_profile` CREATE the row, so it wrote) and the prior-attempt
    scan behind the Lumens high-water mark. The assertion here is on what reaches
    log_case_completion, which neither affects. See `_forbid_real_supabase` in
    tests/conftest.py.
    """
    defaults = {
        "tools.shared.db.get_profile": {"role": "OA"},
        "tools.shared.db.get_case_results": [],
    }
    with ExitStack() as stack:
        for target, value in defaults.items():
            stack.enter_context(patch(target, new=AsyncMock(return_value=value)))
        yield

_CASE = {
    "case_id": "case_grade",
    "title": "Routine IOP check",
    "difficulty": "beginner",           # always unlocked → no access gate in the way
    "topic": "iop_va_measurement",
    "estimated_minutes": 15,
    "patient": {"name": "Mr Tan", "age": 60, "presenting_complaint": "glaucoma review"},
    "examination_findings": {},
}
_DOMAINS = {
    "history_score": 5, "investigations_score": 5, "diagnosis_score": 5, "management_score": 5,
    "history_feedback": "", "investigations_feedback": "", "diagnosis_feedback": "",
    "management_feedback": "", "overall_feedback": "", "total_score": 20,
    "critical_hit": 1, "critical_total": 2,
}
# Pinned station score → the rich grade the persist path must forward.
_SCORE = {
    "score_100": 80, "total_score": 32, "verdict": "Competent", "grade_scale": 2,
    "checklist_coverage": 32, "checklist_coverage_max": 40,
    "consult_technique": 24, "consult_technique_max": 30,
    "judgement_safety": 24, "judgement_safety_max": 30, "safe": False,
    "missed_critical": ["Measure IOP with tonometer"], "critical_hit": 1, "critical_total": 2,
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
_COACH_JSON = '{"highlights":["calm rapport"],"did_wrong":[],"missed":["IOP"],"focus":"escalate sooner"}'


def test_submit_persists_rich_grade_to_case_progress():
    captured = {}

    async def _log(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs

    client = TestClient(app)
    with patch.dict("tools.api.shared._case_cache", {"case_grade": _CASE}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["case_grade"]), \
         patch("tools.api.routers.cases.load_case", return_value=_CASE), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})), \
         patch("tools.api.routers.cases._station_checklist",
               return_value={"procedure_name": "NCT", "steps": [], "source": "checklist"}), \
         patch("tools.api.routers.cases.evaluate_case", return_value=_DOMAINS), \
         patch("tools.api.routers.cases.compute_station_score", return_value=_SCORE), \
         patch("tools.api.routers.cases.log_session", new=AsyncMock(return_value=None)), \
         patch("tools.api.routers.cases.ask", return_value=_COACH_JSON), \
         patch("tools.profile.update_profile.update_profile", new=AsyncMock(return_value=None)), \
         patch("tools.api.routers.cases.log_case_completion", new=_log):
        r = client.post(
            "/api/cases/case_grade/submit",
            json={
                "messages": [{"role": "user", "content": "Good morning, can I confirm your name?"}],
                "findings": "IOP within range on repeat readings.",
                "recommendation": "Document and hand over to the doctor.",
                "performed_steps": [],
            },
            cookies={"eyebot_token": create_access_token("stu_grade", "student", "OA")},
        )
    assert r.status_code == 200, r.text
    kw = captured["kwargs"]
    assert kw["score_100"] == 80
    assert kw["safe"] is False
    assert kw["consult_technique"] == 24
    assert kw["judgement_safety"] == 24
    assert kw["missed_critical"] == ["Measure IOP with tonometer"]
    assert kw["coaching"]["focus"] == "escalate sooner"
    assert kw["coaching"]["missed"] == ["IOP"]
    # The checklist is 40 of the 100 and was computed but never stored, so staff could not
    # see the largest bucket at all; `grade_scale` stamps which maxima these sub-scores use.
    assert kw["checklist_coverage"] == 32
    assert kw["grade_scale"] == 2
