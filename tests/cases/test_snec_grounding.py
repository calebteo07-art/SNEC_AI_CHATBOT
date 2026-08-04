# tests/cases/test_snec_grounding.py
"""The OSCE grade must be argued from SNEC's own procedure, not the model's priors.

Reported 2026-08-04: "the 40/30/30 grading is not against SNEC standards, I suspect it is
open graded against internet, instead of SNEC procedure." It was. Only the 40-point
coverage bucket touched SNEC material (a deterministic count against the `checklists`
table). The 60 AI-graded points were argued from generic few-shot anchors plus the case
JSON, and `evaluate_response` FETCHED the SNEC checklist on every grade only to drop it on
the floor (`checklist_section = ...  # noqa: F841 — available if needed`).

The coach — the prose the student actually reads — was blinder still: its prompt held the
case TITLE, the transcript and bare step names, but not the case's expected `diagnosis`,
its `management` plan, its `rubric.key_points`, or the steps' `notes`. It could not check
the student's submitted findings against the right answer because the right answer was
never in the prompt.

These tests pin the grounding at both AI calls:
  - the domain grader argues from the station-resolved SNEC steps, including the `notes`
    that say WHY each step matters, and grades the steps the student actually saw;
  - the coach sees the case's expected answer AND the grade, so its prose cannot praise
    what the grader failed.
"""
from contextlib import ExitStack
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.cases.evaluate_response import evaluate_case
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

# A step's `notes` is SNEC's own rationale for the step ("Incorrect lighting invalidates
# the pseudoisochromatic plates") — the part a model cannot invent from general knowledge,
# so it is the sharpest probe that real SNEC material reached the prompt.
STEPS = [
    {"step_number": 1, "action": "Perform hand hygiene and confirm the patient's identity",
     "critical": True, "notes": "Wrong-patient testing invalidates the whole record."},
    {"step_number": 2, "action": "Wipe the occluder with an alcohol wipe before use",
     "critical": False, "notes": "Shared occluders transmit adenoviral conjunctivitis."},
    {"step_number": 3, "action": "Take three NCT readings per eye and record the average",
     "critical": False, "notes": "A single reading is not repeatable enough to act on."},
]

CASE = {
    "case_id": "case_snec",
    "title": "Routine IOP check",
    "difficulty": "beginner",
    "topic": "iop_va_measurement",
    "estimated_minutes": 15,
    "patient": {"name": "Mr Tan", "age": 60, "presenting_complaint": "glaucoma review"},
    "examination_findings": {"iop": {"right": "18 mmHg", "left": "20 mmHg"}},
    "diagnosis": "Stable primary open-angle glaucoma on treatment",
    "management": "Record VA and IOP for the doctor; patient keeps their appointment time",
    "rubric": {
        "investigations": {"points": 10, "key_points": [
            "Performs NCT correctly: explains to patient, takes 3 readings per eye",
        ]},
        "management": {"points": 10, "key_points": [
            "Flags eye-drop compliance to the doctor",
        ]},
    },
}

CONVERSATION = [
    {"role": "user", "content": "Good morning, can I confirm your name and NRIC?"},
    {"role": "assistant", "content": "I'm Tan Ah Kow."},
]


# ── The domain grader ──────────────────────────────────────────────────────────

def _grade_prompt(performed, steps=STEPS):
    """Run evaluate_case with the AI stubbed and return the prompt it built."""
    seen = {}

    def _fake_ask(**kw):
        seen["prompt"] = kw["messages"][0]["content"]
        return ('{"history":{"score":7,"feedback":"ok"},'
                '"investigations":{"score":7,"feedback":"ok"},'
                '"diagnosis":{"score":7,"feedback":"ok"},'
                '"management":{"score":7,"feedback":"ok"}}')

    with patch("tools.cases.evaluate_response.ask", side_effect=_fake_ask), \
         patch("tools.shared.audit_log.log", return_value=None):
        evaluate_case(CASE, CONVERSATION, "stu_snec", performed, steps)
    return seen["prompt"]


def test_grader_argues_from_the_snec_procedure_steps():
    prompt = _grade_prompt([1, 2, 3])
    for step in STEPS:
        assert step["action"] in prompt, f"SNEC step missing from the grader prompt: {step['action']}"


def test_grader_sees_why_each_snec_step_matters():
    # Without `notes` the grader knows WHAT the step is but not what skipping it costs —
    # exactly the judgement it is being asked to make, left to the model's own priors.
    prompt = _grade_prompt([1, 2, 3])
    for step in STEPS:
        assert step["notes"] in prompt, f"SNEC rationale missing: {step['notes']}"


def test_grader_is_told_which_steps_the_student_actually_did():
    prompt = _grade_prompt([1, 3])
    performed_line = next(ln for ln in prompt.splitlines() if STEPS[0]["action"] in ln)
    missed_line = next(ln for ln in prompt.splitlines() if STEPS[1]["action"] in ln)
    assert "NOT" not in performed_line.upper().replace("NOTES", ""), performed_line
    assert "NOT" in missed_line.upper().replace("NOTES", ""), missed_line


def test_grader_marks_the_critical_steps():
    prompt = _grade_prompt([1, 2, 3])
    crit_line = next(ln for ln in prompt.splitlines() if STEPS[0]["action"] in ln)
    assert "CRITICAL" in crit_line.upper(), crit_line


def test_grader_does_not_refetch_its_own_checklist():
    # The endpoint resolves the checklist through resolve_procedure_name (superseded rows
    # remapped, tally sheets excluded). A second raw name lookup inside the grader could
    # return a DIFFERENT checklist than the student ticked — grading them on steps they
    # were never shown.
    with patch("tools.kb.search.get_checklist_by_name") as fetch:
        _grade_prompt([1, 2, 3])
    fetch.assert_not_called()


def test_grader_counts_criticals_from_the_station_steps():
    with patch("tools.cases.evaluate_response.ask", return_value=(
            '{"history":{"score":7,"feedback":""},"investigations":{"score":7,"feedback":""},'
            '"diagnosis":{"score":7,"feedback":""},"management":{"score":7,"feedback":""}}')), \
         patch("tools.shared.audit_log.log", return_value=None):
        result = evaluate_case(CASE, CONVERSATION, "stu_snec", [2, 3], STEPS)
    assert result["critical_total"] == 1
    assert result["critical_hit"] == 0        # step 1 is the critical one and was not done


# ── The coach ──────────────────────────────────────────────────────────────────

DOMAINS = {
    "history_score": 3, "investigations_score": 9, "diagnosis_score": 5, "management_score": 8,
    "history_feedback": "Thin history.", "investigations_feedback": "Good technique.",
    "diagnosis_feedback": "Adequate.", "management_feedback": "Clear handover.",
    "overall_feedback": "", "total_score": 25, "critical_hit": 1, "critical_total": 1,
}
CL = {"procedure_name": "Non-Contact Tonometry", "steps": STEPS, "source": "checklist"}


@pytest.fixture(autouse=True)
def _stub_submit_db():
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


def _coach_prompt(performed=(1, 2, 3)):
    """Submit a station and return the system+user text of the COACHING call."""
    seen = {}

    def _fake_ask(**kw):
        seen["system"] = kw.get("system_prompt", "")
        seen["user"] = kw["messages"][0]["content"]
        return "{}"

    with patch.dict("tools.api.shared._case_cache", {"case_snec": CASE}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["case_snec"]), \
         patch("tools.api.routers.cases.load_case", return_value=CASE), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})), \
         patch("tools.api.routers.cases._station_checklist", return_value=CL), \
         patch("tools.api.routers.cases.evaluate_case", return_value=DOMAINS), \
         patch("tools.api.routers.cases.log_session", new=AsyncMock(return_value=None)), \
         patch("tools.api.routers.cases.ask", side_effect=_fake_ask):
        r = client.post(
            "/api/cases/case_snec/submit",
            json={
                "messages": [{"role": "user", "content": "Good morning, can I confirm your name?"}],
                "findings": "IOP within range; no red flags.",
                "recommendation": "Document and hand over to the doctor.",
                "performed_steps": list(performed),
            },
            cookies={"eyebot_token": create_access_token("stu_snec", "student", "OA")},
        )
    assert r.status_code == 200, r.text
    return seen["system"] + "\n" + seen["user"]


def test_coach_knows_the_cases_expected_answer():
    # It is asked to judge the student's findings and recommendation. Without the case's
    # own diagnosis and management plan in the prompt there is nothing to judge them
    # against except the model's general knowledge.
    prompt = _coach_prompt()
    assert CASE["diagnosis"] in prompt
    assert CASE["management"] in prompt


def test_coach_sees_the_cases_rubric_key_points():
    prompt = _coach_prompt()
    for domain in CASE["rubric"].values():
        for kp in domain["key_points"]:
            assert kp in prompt, f"rubric key_point missing from the coach prompt: {kp}"


def test_coach_sees_why_each_snec_step_matters():
    prompt = _coach_prompt()
    for step in STEPS:
        assert step["notes"] in prompt, f"SNEC rationale missing from the coach prompt: {step['notes']}"


def test_coach_sees_the_grade_it_is_narrating():
    # Grader and coach used to run CONCURRENTLY, so the prose could praise a domain the
    # grader scored 3/10. The coach must be told the scores it is explaining.
    prompt = _coach_prompt()
    assert "History-taking" in prompt and "3/10" in prompt, prompt
    assert "9/10" in prompt, prompt


def test_coach_is_told_the_bucket_totals():
    prompt = _coach_prompt()
    assert "/40" in prompt, "the checklist bucket total must reach the coach"
    assert "/30" in prompt, "the two 30-point bucket totals must reach the coach"
