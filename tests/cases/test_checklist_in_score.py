# tests/cases/test_checklist_in_score.py
"""The OSCE checklist IS 40% of the final /100. This is the /submit-boundary regression.

History: coverage scored under ricoe C7, was dropped entirely on 2026-06-26 (two AI
schemes ×50), and is restored here at 40/30/30 — checklist 40, Consultation & Technique
30, Clinical Judgement & Safety 30. The Branda response column already claimed the
checklist was 40% of the grade; now it is.

- Holding the AI-graded domains constant and using NON-critical steps, submitting with
  every step performed must score exactly 40 more than submitting with none.
- A missed CRITICAL step lowers the score twice over — one step's worth of coverage, plus
  the safety cap on Judgement — and flags the run unsafe.

It locks the invariant at the endpoint, not just the pure unit, so a refactor that stops
threading `performed_steps` into the score cannot pass.
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
# as the ONLY difference between the two runs (it must be worth exactly 40).
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
    "management_feedback": "", "total_score": 20,
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


def test_checklist_coverage_is_worth_40_of_the_final_score():
    none = _submit([])
    full = _submit([1, 2, 3, 4])
    # Three buckets — 40 for the checklist, 30 for each AI scheme …
    assert none["checklist_coverage_max"] == 40
    assert none["consult_technique_max"] == 30
    assert none["judgement_safety_max"] == 30
    # … and coverage is the whole difference: domains constant, no criticals in play.
    assert none["checklist_coverage"] == 0
    assert full["checklist_coverage"] == 40
    assert full["score_100"] - none["score_100"] == 40


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
