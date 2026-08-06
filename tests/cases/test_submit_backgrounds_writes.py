"""OSCE submit tail-latency: the post-grade DB writes run AFTER the response.

`case_submit` grades the station, then persists three best-effort records — the
session log, the profile/XP update (itself 1 read + several writes), and the case
completion. None of their return values feed the response (lumens + coaching are
computed locally first). On the single Render worker, awaiting them inline adds
their round-trips to the student's wait after they've already finished the station.
They must be scheduled on FastAPI BackgroundTasks (run after the response is sent),
funnelled through one `_persist_submit` helper.
"""
from contextlib import ExitStack
from unittest.mock import patch, AsyncMock

import pytest
from fastapi import BackgroundTasks
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token


@pytest.fixture(autouse=True)
def _stub_submit_db():
    """The reads /submit makes INLINE, before the backgrounded writes.

    Stubbing BackgroundTasks.add_task stops the persistence writes from running, but these
    two run inline on the request path regardless — and hit production Supabase: the
    content-pool profile lookup (a miss also made `tools.profile.get_profile` CREATE the
    row) and the prior-attempt scan behind the Lumens award. See `_forbid_real_supabase`
    in tests/conftest.py.
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
    "case_id": "case_bg",
    "title": "Routine IOP check",
    "difficulty": "beginner",
    "topic": "iop_va_measurement",
    "estimated_minutes": 15,
    "patient": {"name": "Mr Tan", "age": 60, "presenting_complaint": "glaucoma review"},
    "examination_findings": {},
}
_DOMAINS = {
    "history_score": 5, "investigations_score": 5, "diagnosis_score": 5, "management_score": 5,
    "history_feedback": "", "investigations_feedback": "", "diagnosis_feedback": "",
    "management_feedback": "", "total_score": 20,
    "critical_hit": 1, "critical_total": 2,
}
_SCORE = {
    "score_100": 80, "total_score": 32, "verdict": "Competent",
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


def _post(client):
    return client.post(
        "/api/cases/case_bg/submit",
        json={
            "messages": [{"role": "user", "content": "Good morning, can I confirm your name?"}],
            "findings": "IOP within range on repeat readings.",
            "recommendation": "Document and hand over to the doctor.",
            "performed_steps": [],
        },
        cookies={"eyebot_token": create_access_token("stu_bg", "student", "OA")},
    )


def test_submit_schedules_persistence_as_background_task():
    scheduled = []

    def _spy(self, func, *a, **k):
        # Record the scheduled callable WITHOUT running it — proves the writes
        # are backgrounded, not awaited inline before the response.
        scheduled.append(getattr(func, "__name__", str(func)))

    client = TestClient(app)
    with patch.dict("tools.api.shared._case_cache", {"case_bg": _CASE}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["case_bg"]), \
         patch("tools.api.routers.cases.load_case", return_value=_CASE), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})), \
         patch("tools.api.routers.cases._station_checklist",
               return_value={"procedure_name": "NCT", "steps": [], "source": "checklist"}), \
         patch("tools.api.routers.cases.evaluate_case", return_value=_DOMAINS), \
         patch("tools.api.routers.cases.compute_station_score", return_value=_SCORE), \
         patch("tools.api.routers.cases.ask", return_value=_COACH_JSON), \
         patch.object(BackgroundTasks, "add_task", _spy):
        r = _post(client)

    assert r.status_code == 200, r.text
    assert "_persist_submit" in scheduled, f"post-grade writes not backgrounded; scheduled={scheduled}"
    # The response still carries locally-computed values that never depended on the writes.
    body = r.json()
    assert isinstance(body["lumens_awarded"], int)
    assert body["coaching"]["focus"] == "escalate sooner"


def test_submit_survives_a_broken_checklist_detail_builder():
    """checklist_detail is built as an ARGUMENT to background_tasks.add_task(...), which
    Python evaluates on the request path, before the response is sent -- NOT inside the
    backgrounded _persist_submit like everything else scheduled there. Unlike its sibling
    arguments (already-computed values that cannot raise), it does real work over authored
    checklist data. A purely-additive analytics field must never be able to 500 a submission
    that was already graded and coached successfully -- and the fallback (an empty ledger)
    must still reach persistence, not silently drop the rest of the record with it.

    add_task is NOT stubbed here (unlike the sibling test above) so _persist_submit really
    runs; its other writes (log_session, update_profile, log_case_completion) are mocked
    individually instead, matching tests/cases/test_case_submit_persists_grade.py.
    """
    captured = {}

    async def _log(*args, **kwargs):
        captured["kwargs"] = kwargs

    client = TestClient(app)
    with patch.dict("tools.api.shared._case_cache", {"case_bg": _CASE}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["case_bg"]), \
         patch("tools.api.routers.cases.load_case", return_value=_CASE), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})), \
         patch("tools.api.routers.cases._station_checklist",
               return_value={"procedure_name": "NCT", "steps": [], "source": "checklist"}), \
         patch("tools.api.routers.cases.evaluate_case", return_value=_DOMAINS), \
         patch("tools.api.routers.cases.compute_station_score", return_value=_SCORE), \
         patch("tools.api.routers.cases.log_session", new=AsyncMock(return_value=None)), \
         patch("tools.api.routers.cases.ask", return_value=_COACH_JSON), \
         patch("tools.profile.update_profile.update_profile", new=AsyncMock(return_value=None)), \
         patch("tools.api.routers.cases.log_case_completion", new=_log), \
         patch("tools.api.routers.cases._build_checklist_detail",
               side_effect=RuntimeError("boom")):
        r = _post(client)

    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body["lumens_awarded"], int)
    assert body["coaching"]["focus"] == "escalate sooner"
    # The fallback reaches persistence as an empty ledger, not a dropped record.
    assert captured["kwargs"]["checklist_detail"] == []
