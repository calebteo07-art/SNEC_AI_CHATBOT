# tests/cases/test_checklist_counts_in_score.py
"""Phase 17 / ricoe C7 — the OSCE checklist counts toward the final session score /100.

This is the end-to-end ship-check regression: holding the AI-graded domains constant,
submitting with every checklist step performed must score materially HIGHER than
submitting with none. It locks the invariant at the /submit boundary (not just the
pure station_score unit) so the checklist can never silently stop counting.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

CASE = {
    "case_id": "case_c7",
    "title": "Routine IOP check",
    "difficulty": "beginner",   # always unlocked → no access gate in the way
    "topic": "iop_va_measurement",
    "estimated_minutes": 15,
    "patient": {"name": "Mr Tan", "age": 60, "presenting_complaint": "glaucoma review"},
    "examination_findings": {"iop": {"right": "18 mmHg", "left": "20 mmHg"}},
}

# All non-critical so the safety gate can't move Judgement — this isolates the
# checklist's Thoroughness contribution as the ONLY difference between the two runs.
STEPS = [
    {"step_number": 1, "action": "Introduce self and identify patient", "critical": False},
    {"step_number": 2, "action": "Measure IOP with the non-contact tonometer", "critical": False},
    {"step_number": 3, "action": "Record the readings in the patient record", "critical": False},
    {"step_number": 4, "action": "Advise the patient on their follow-up", "critical": False},
]
CL = {"procedure_name": "Non-Contact Tonometry", "steps": STEPS, "source": "checklist"}

# Constant AI-graded domains so the ONLY thing that changes between runs is the checklist.
DOMAINS = {
    "history_score": 5, "investigations_score": 5, "diagnosis_score": 5, "management_score": 5,
    "history_feedback": "", "investigations_feedback": "", "diagnosis_feedback": "",
    "management_feedback": "", "overall_feedback": "", "total_score": 20,
    "critical_hit": 0, "critical_total": 0,
}


def _cookie():
    return {"eyebot_token": create_access_token("stu_c7", "student", "OA")}


def _submit(performed):
    with patch.dict("tools.api.shared._case_cache", {"case_c7": CASE}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["case_c7"]), \
         patch("tools.api.routers.cases.load_case", return_value=CASE), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})), \
         patch("tools.api.routers.cases._station_checklist", return_value=CL), \
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


def test_checklist_completion_raises_the_final_score_100():
    none = _submit([])
    full = _submit([1, 2, 3, 4])

    # The checklist is a real, visible component of the /100 …
    assert none["thoroughness"] == 0
    assert full["thoroughness"] == 40
    # … and doing it raises the final session score (ricoe C7).
    assert full["score_100"] > none["score_100"]
    # With domains held constant and no criticals, the entire delta IS the checklist.
    assert full["score_100"] - none["score_100"] == 40


def test_partial_checklist_scores_between_none_and_full():
    none = _submit([])
    half = _submit([1, 2])
    full = _submit([1, 2, 3, 4])
    assert none["score_100"] < half["score_100"] < full["score_100"]
