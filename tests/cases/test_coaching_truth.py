# tests/cases/test_coaching_truth.py
"""The debrief may not claim what the ledger contradicts, and may not say nothing.

Reported 2026-08-04: a student performed 15 of 16 checklist steps and their downloaded
session report told them they had completed every step, with an empty "Missed or lacking"
column. Both faults are the same root cause — the coaching call is free prose that nothing
checks against the recorded result.

Three contracts, pinned here:
  1. the coach is TOLD the counts (it was only ever told which actions were outstanding,
     never that any were, so "all done" was never contradicted by its own input);
  2. a completion claim is STRIPPED when a step is outstanding — the model cannot overclaim
     past the ledger, whatever it returns;
  3. "missed" is never empty — when the model has nothing, a deterministic insight is
     synthesised, and it is never a bare restatement of a checklist row (the report already
     prints every unticked step; repeating one is not feedback).
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
    """Neutral defaults for the db calls /submit makes outside the coaching path."""
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
    "case_id": "case_truth",
    "title": "Routine IOP check",
    "difficulty": "beginner",
    "topic": "iop_va_measurement",
    "estimated_minutes": 15,
    "patient": {"name": "Mr Tan", "age": 60, "presenting_complaint": "glaucoma review"},
    "examination_findings": {"iop": {"right": "18 mmHg", "left": "20 mmHg"}},
}
STEPS = [
    {"step_number": 1, "action": "Introduce self and identify patient", "critical": False},
    {"step_number": 2, "action": "Measure IOP with the non-contact tonometer", "critical": False},
    {"step_number": 3, "action": "Record the readings in the patient record", "critical": False},
]
CL = {"procedure_name": "Non-Contact Tonometry", "steps": STEPS, "source": "checklist"}

DOMAINS = {
    "history_score": 5, "investigations_score": 5, "diagnosis_score": 5, "management_score": 5,
    "history_feedback": "", "investigations_feedback": "", "diagnosis_feedback": "",
    "management_feedback": "", "total_score": 20,
    "critical_hit": 0, "critical_total": 0,
}


def _submit(performed, coach_json, skipped=(), domains=None):
    """Returns (coaching block from the response, the coaching prompt the model saw)."""
    seen = {}

    def fake_ask(**kwargs):
        seen["prompt"] = kwargs["messages"][0]["content"]
        return coach_json

    def fake_evaluate(case, conversation, student_id, performed_steps=None, steps=None):
        return domains or DOMAINS

    with patch.dict("tools.api.shared._case_cache", {"case_truth": CASE}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["case_truth"]), \
         patch("tools.api.routers.cases.load_case", return_value=CASE), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})), \
         patch("tools.api.routers.cases._station_checklist", return_value=CL), \
         patch("tools.api.routers.cases.evaluate_case", fake_evaluate), \
         patch("tools.api.routers.cases.log_session", new=AsyncMock(return_value=None)), \
         patch("tools.api.routers.cases.ask", fake_ask):
        r = client.post(
            "/api/cases/case_truth/submit",
            json={
                "messages": [{"role": "user", "content": "Good morning, can I confirm your name?"}],
                "findings": "IOP within range on repeat readings; no red flags.",
                "recommendation": "Document and hand over to the doctor for review.",
                "performed_steps": list(performed),
                "skipped_steps": list(skipped),
            },
            cookies={"eyebot_token": create_access_token("stu_truth", "student", "OA")},
        )
    assert r.status_code == 200, r.text
    return r.json()["coaching"], seen["prompt"]


def test_the_coach_is_told_how_many_steps_were_performed():
    # It was only ever told WHICH steps were outstanding. Being told "2 of 3" is what makes
    # "you completed every step" contradict its own input rather than merely exceed it.
    _, prompt = _submit([1, 2], '{"highlights":[],"did_wrong":[],"missed":[],"focus":""}')
    assert "2 of 3" in prompt, f"the counts must be in the coaching prompt:\n{prompt}"


def test_a_completion_claim_is_stripped_when_a_step_is_outstanding():
    # The reported bug, at the layer that can actually stop it. Whatever the model returns,
    # a claim of full coverage cannot survive a ledger that says otherwise.
    coach, _ = _submit(
        [1, 2],
        '{"highlights":["Completed all the checklist steps in order",'
        '"Warm, unhurried rapport with the patient"],'
        '"did_wrong":[],"missed":["Never confirmed the reading with the patient"],"focus":"x"}',
    )
    assert not any("all the checklist steps" in h for h in coach["highlights"]), \
        f"a false completion claim survived: {coach['highlights']}"
    assert any("rapport" in h for h in coach["highlights"]), "the true highlight must survive"


def test_a_completion_claim_survives_when_the_student_really_did_every_step():
    # The guard is about truth, not about censoring praise — full coverage may be praised.
    coach, _ = _submit(
        [1, 2, 3],
        '{"highlights":["Completed all the checklist steps in order"],'
        '"did_wrong":[],"missed":["Readings not read back to the patient"],"focus":"x"}',
    )
    assert any("all the checklist steps" in h for h in coach["highlights"]), \
        "a TRUE completion claim must not be stripped"


def test_missed_is_never_empty():
    # An empty "Missed or lacking" column reads as "nothing was missing", which is the same
    # false reassurance as the completion claim.
    coach, _ = _submit(
        [1, 2],
        '{"highlights":["Warm rapport"],"did_wrong":[],"missed":[],"focus":"x"}',
    )
    assert coach["missed"], "missed must never come back empty"


def test_the_synthesised_miss_is_not_a_bare_restatement_of_a_checklist_row():
    # Full coverage, weak history: the report already lists every step as done, so the only
    # honest gap is depth. Restating a step here would be both wrong and useless.
    domains = {**DOMAINS, "history_score": 4}
    coach, _ = _submit(
        [1, 2, 3],
        '{"highlights":["Warm rapport"],"did_wrong":[],"missed":[],"focus":"x"}',
        domains=domains,
    )
    assert coach["missed"], "missed must never come back empty"
    actions = {s["action"] for s in STEPS}
    for item in coach["missed"]:
        assert item not in actions, f"a bare checklist row is not an insight: {item!r}"


def test_the_synthesised_miss_names_the_step_that_was_given_up_on():
    # A step attempted and abandoned is the single most coachable gap in the session, and it
    # is the one the student is least likely to have noticed themselves.
    coach, _ = _submit(
        [1, 3],
        '{"highlights":[],"did_wrong":[],"missed":[],"focus":"x"}',
        skipped=[2],
    )
    joined = " ".join(coach["missed"]).lower()
    assert "tonometer" in joined or "measure iop" in joined, \
        f"the abandoned step must be surfaced: {coach['missed']}"
