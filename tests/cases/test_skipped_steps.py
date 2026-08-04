# tests/cases/test_skipped_steps.py
"""A skipped checklist step is never credited.

The station's way-out used to be labelled "Examiner didn't catch that?" and its presses
counted for the grade — the reading was "after three tries the examiner probably missed
it". The button now says the student is *unable to complete the item*, so the same press
means the opposite: they didn't do it. That flips the contract, and this pins the flip at
the /submit boundary.

The client already keeps skipped steps out of `performed_steps`, but the endpoint must not
depend on it — a step named in `skipped_steps` is subtracted server-side too, so the safety
gate can never be cleared by giving up on a critical step.
"""
from contextlib import ExitStack
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


@pytest.fixture(autouse=True)
def _stub_submit_db():
    """Neutral defaults for the db calls /submit makes outside the scoring path — the
    subject here is the grade contract, not persistence. See tests/conftest.py."""
    defaults = {
        "tools.shared.db.get_profile": {"role": "OA"},
        "tools.shared.db.get_case_results": [],
        "tools.shared.db.insert_case_result": None,
        "tools.shared.db.update_profile": None,
    }
    with ExitStack() as stack:
        for target, value in defaults.items():
            stack.enter_context(patch(target, new=AsyncMock(return_value=value)))
        yield


CASE = {
    "case_id": "case_skip",
    "title": "Routine IOP check",
    "difficulty": "beginner",
    "topic": "iop_va_measurement",
    "estimated_minutes": 15,
    "patient": {"name": "Mr Tan", "age": 60, "presenting_complaint": "glaucoma review"},
    "examination_findings": {"iop": {"right": "18 mmHg", "left": "20 mmHg"}},
}
# Step 2 is the critical one — the step the tests skip.
STEPS = [
    {"step_number": 1, "action": "Introduce self and identify patient", "critical": False},
    {"step_number": 2, "action": "Measure IOP with the non-contact tonometer", "critical": True},
    {"step_number": 3, "action": "Record the readings in the patient record", "critical": False},
]
CL = {"procedure_name": "Non-Contact Tonometry", "steps": STEPS, "source": "checklist"}

DOMAINS = {
    "history_score": 5, "investigations_score": 5, "diagnosis_score": 5, "management_score": 5,
    "history_feedback": "", "investigations_feedback": "", "diagnosis_feedback": "",
    "management_feedback": "", "total_score": 20,
    "critical_hit": 0, "critical_total": 0,
}


def _submit(performed, skipped):
    """Returns (response json, the coaching prompt the model would have seen,
    the performed_steps the grader would have seen)."""
    seen = {}

    def fake_ask(**kwargs):
        seen["prompt"] = kwargs["messages"][0]["content"]
        return "{}"

    def fake_evaluate(case, conversation, student_id, performed_steps=None, steps=None):
        seen["graded"] = list(performed_steps or [])
        return DOMAINS

    with patch.dict("tools.api.shared._case_cache", {"case_skip": CASE}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["case_skip"]), \
         patch("tools.api.routers.cases.load_case", return_value=CASE), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})), \
         patch("tools.api.routers.cases._station_checklist", return_value=CL), \
         patch("tools.api.routers.cases.evaluate_case", fake_evaluate), \
         patch("tools.api.routers.cases.log_session", new=AsyncMock(return_value=None)), \
         patch("tools.api.routers.cases.ask", fake_ask):
        r = client.post(
            "/api/cases/case_skip/submit",
            json={
                "messages": [{"role": "user", "content": "Good morning, can I confirm your name?"}],
                "findings": "IOP within range on repeat readings; no red flags.",
                "recommendation": "Document and hand over to the doctor for review.",
                "performed_steps": performed,
                "skipped_steps": skipped,
            },
            cookies={"eyebot_token": create_access_token("stu_skip", "student", "OA")},
        )
    assert r.status_code == 200, r.text
    return r.json(), seen["prompt"], seen["graded"]


def test_skipping_a_critical_step_does_not_clear_the_safety_gate():
    # The whole point of the rename: giving up on a critical step must not pass as doing it.
    data, _, _ = _submit(performed=[1, 3], skipped=[2])
    assert data["result"]["safe"] is False
    assert data["result"]["missed_critical"], "the skipped critical step must be flagged"


def test_a_skipped_step_is_stripped_even_if_the_client_still_sends_it_as_performed():
    # Defence in depth: an old or hand-rolled client that leaves the skipped step in
    # performed_steps must not buy credit with it.
    data, _, graded = _submit(performed=[1, 2, 3], skipped=[2])
    assert 2 not in graded, "a skipped step must never reach the grader as performed"
    assert data["result"]["safe"] is False


def test_the_coach_is_told_the_step_was_attempted_and_abandoned():
    # A step they tried and gave up on is coachable in a way a never-attempted one isn't,
    # so the debrief prompt has to keep the two apart.
    _, prompt, _ = _submit(performed=[1, 3], skipped=[2])
    assert "Measure IOP with the non-contact tonometer" in prompt
    assert "COULD NOT COMPLETE" in prompt


def test_no_skips_reports_none_and_grades_everything_performed():
    data, prompt, graded = _submit(performed=[1, 2, 3], skipped=[])
    assert graded == [1, 2, 3]
    assert data["result"]["safe"] is True
    assert "COULD NOT COMPLETE" in prompt and "none" in prompt
