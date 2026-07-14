from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

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
    "score_100": 80, "total_score": 32, "verdict": "Competent",
    "consult_technique": 40, "consult_technique_max": 50,
    "judgement_safety": 40, "judgement_safety_max": 50, "safe": False,
    "missed_critical": ["Measure IOP with tonometer"], "critical_hit": 1, "critical_total": 2,
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
    assert kw["consult_technique"] == 40
    assert kw["judgement_safety"] == 40
    assert kw["missed_critical"] == ["Measure IOP with tonometer"]
    assert kw["coaching"]["focus"] == "escalate sooner"
    assert kw["coaching"]["missed"] == ["IOP"]
