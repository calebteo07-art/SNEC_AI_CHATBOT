# tests/cases/test_checklist_not_in_score.py
"""The OSCE checklist is NOT part of the final /100 (it was, under ricoe C7; the product
now grades two AI schemes only). This is the /submit-boundary regression:

- Holding the AI-graded domains constant and using NON-critical steps, submitting with
  every step performed must score the SAME as submitting with none — checklist coverage
  awards no points.
- A missed CRITICAL step, however, still lowers the score (the safety gate) and flags it.

It locks the invariant at the endpoint, not just the pure unit, so coverage can never
silently start counting again.
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
    """Neutral defaults for the db calls /submit makes outside the scoring path.

    These tests pin the grading inputs but let the post-grade persistence run, and it was
    unstubbed end to end: two WRITES to production Supabase per submit — the case_progress
    row (insert_case_result) and the XP/profile update (update_profile) — plus the profile
    and prior-attempt reads. Nothing here asserts on them; the subject is the score.
    See `_forbid_real_supabase` in tests/conftest.py.
    """
    defaults = {
        "tools.shared.db.get_profile": {"role": "OA"},   # route's content-pool lookup
        "tools.shared.db.get_case_results": [],          # prior attempts → first-pass award
        "tools.shared.db.insert_case_result": None,      # write: case_progress row
        "tools.shared.db.update_profile": None,          # write: XP / profile update
    }
    with ExitStack() as stack:
        for target, value in defaults.items():
            stack.enter_context(patch(target, new=AsyncMock(return_value=value)))
        yield

CASE = {
    "case_id": "case_c7",
    "title": "Routine IOP check",
    "difficulty": "beginner",   # always unlocked → no access gate in the way
    "topic": "iop_va_measurement",
    "estimated_minutes": 15,
    "patient": {"name": "Mr Tan", "age": 60, "presenting_complaint": "glaucoma review"},
    "examination_findings": {"iop": {"right": "18 mmHg", "left": "20 mmHg"}},
}

# All non-critical → the safety gate can't move Judgement, isolating checklist coverage
# as the ONLY difference between the two runs (it must make NO difference).
STEPS = [
    {"step_number": 1, "action": "Introduce self and identify patient", "critical": False},
    {"step_number": 2, "action": "Measure IOP with the non-contact tonometer", "critical": False},
    {"step_number": 3, "action": "Record the readings in the patient record", "critical": False},
    {"step_number": 4, "action": "Advise the patient on their follow-up", "critical": False},
]
# One critical step, for the safety-gate test.
STEPS_CRIT = [{**s, "critical": (s["step_number"] == 2)} for s in STEPS]
CL = {"procedure_name": "Non-Contact Tonometry", "steps": STEPS, "source": "checklist"}
CL_CRIT = {"procedure_name": "Non-Contact Tonometry", "steps": STEPS_CRIT, "source": "checklist"}

DOMAINS = {
    "history_score": 5, "investigations_score": 5, "diagnosis_score": 5, "management_score": 5,
    "history_feedback": "", "investigations_feedback": "", "diagnosis_feedback": "",
    "management_feedback": "", "overall_feedback": "", "total_score": 20,
    "critical_hit": 0, "critical_total": 0,
}


def _cookie():
    return {"eyebot_token": create_access_token("stu_c7", "student", "OA")}


def _submit(performed, checklist=CL):
    with patch.dict("tools.api.shared._case_cache", {"case_c7": CASE}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["case_c7"]), \
         patch("tools.api.routers.cases.load_case", return_value=CASE), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})), \
         patch("tools.api.routers.cases._station_checklist", return_value=checklist), \
         patch("tools.api.routers.cases.evaluate_case", return_value=DOMAINS), \
         patch("tools.api.routers.cases.log_session", new=AsyncMock(return_value=None)), \
         patch("tools.api.routers.cases.ask", return_value="{}"):
        r = client.post(
            "/api/cases/case_c7/submit",
            json={
                "messages": [{"role": "user", "content": "Good morning, can I confirm your name?"}],
                "findings": "IOP within range on repeat readings; no red flags.",
                "recommendation": "Document and hand over to the doctor for review.",
                "performed_steps": performed,
            },
            cookies=_cookie(),
        )
    assert r.status_code == 200, r.text
    return r.json()["result"]


def test_checklist_coverage_does_not_change_the_final_score():
    none = _submit([])
    full = _submit([1, 2, 3, 4])
    # Two AI schemes, each /50 — visible components of the /100 …
    assert none["consult_technique_max"] == 50
    assert none["judgement_safety_max"] == 50
    # … and checklist coverage makes NO difference to the score (domains constant, no criticals).
    assert none["score_100"] == full["score_100"]


def test_missed_critical_step_still_lowers_the_score_and_flags_safety():
    missed = _submit([1, 3, 4], checklist=CL_CRIT)   # critical step 2 not performed
    done = _submit([1, 2, 3, 4], checklist=CL_CRIT)
    assert missed["safe"] is False
    assert done["safe"] is True
    assert missed["score_100"] < done["score_100"]


def _submit_full(performed, checklist=CL):
    """Same as _submit but returns the whole response (for the coaching block). `ask` returns
    '{}' → the AI coaching is empty, exercising the deterministic fallback."""
    with patch.dict("tools.api.shared._case_cache", {"case_c7": CASE}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["case_c7"]), \
         patch("tools.api.routers.cases.load_case", return_value=CASE), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})), \
         patch("tools.api.routers.cases._station_checklist", return_value=checklist), \
         patch("tools.api.routers.cases.evaluate_case", return_value=DOMAINS), \
         patch("tools.api.routers.cases.log_session", new=AsyncMock(return_value=None)), \
         patch("tools.api.routers.cases.ask", return_value="{}"):
        r = client.post(
            "/api/cases/case_c7/submit",
            json={
                "messages": [{"role": "user", "content": "Good morning, can I confirm your name and NRIC?"}],
                "findings": "IOP within range on repeat readings; no red flags.",
                "recommendation": "Document and hand over to the doctor for review.",
                "performed_steps": performed,
            },
            cookies=_cookie(),
        )
    assert r.status_code == 200, r.text
    return r.json()


def test_coach_summary_is_never_empty_even_without_ai():
    # Regression (ricoe: "coach summary shows nothing"): when the AI returns nothing usable,
    # the debrief must still carry real, grounded feedback derived from the performance —
    # here a missed critical step surfaces as a concrete focus.
    data = _submit_full([1, 3, 4], checklist=CL_CRIT)   # critical step 2 not performed
    coaching = data["coaching"]
    assert coaching["focus"], "there must always be a focus line"
    assert coaching["missed"], "the missed steps must be listed"
    assert coaching["did_wrong"], "an unsafe (missed-critical) run must flag what went wrong"
