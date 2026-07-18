# tests/cases/test_station_endpoints.py
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

CASE = {
    "case_id": "case_test_station",
    "title": "Test NCT",
    "difficulty": "beginner",
    "topic": "nct_glaucoma_suspect",
    "estimated_minutes": 15,
    "patient": {"name": "Mr Tan", "age": 60, "presenting_complaint": "review"},
    "examination_findings": {"iop": {"right": "18 mmHg", "left": "20 mmHg"}},
    "rubric": {"history": {"key_points": ["Ask compliance"]}},
}

CHECKLIST = {
    "procedure_name": "Non-Contact Tonometry",
    "steps": {"steps": [
        {"step_number": 1, "category": "patient_identification", "action": "Identify patient name NRIC", "critical": True, "notes": None},
        {"step_number": 2, "category": "clinical_assessment", "action": "Measure IOP with tonometer", "critical": True, "notes": None},
        {"step_number": 3, "category": "post_procedure", "action": "Record readings in EMR", "critical": False, "notes": None},
    ]},
}


def _cookie():
    return {"eyebot_token": create_access_token("stu_test", "student", "OA")}


def test_get_case_requires_auth():
    """rank 11: /api/cases/{id} must not serve case content to an unauthenticated
    caller — every sibling case route requires a JWT."""
    r = client.get("/api/cases/case_test_station")
    assert r.status_code == 401


def test_get_case_checklist_requires_auth():
    """rank 11: the procedure checklist (steps + critical flags) must require auth."""
    r = client.get("/api/cases/case_test_station/checklist")
    assert r.status_code == 401


def test_station_returns_phases_and_actions():
    with patch.dict("tools.api.shared._case_cache", {"case_test_station": CASE}, clear=False), \
         patch("tools.api.routers.cases.get_checklist_by_name", return_value=CHECKLIST):
        r = client.get("/api/cases/case_test_station/station", cookies=_cookie())
    assert r.status_code == 200
    data = r.json()
    phase_names = [p["name"] for p in data["checklist"]["phases"]]
    assert "Preparation & Identification" in phase_names
    assert "Clinical Assessment" in phase_names
    # every step is now a clickable chip; the IOP step (2) reveals its finding.
    iop = next(a for a in data["examination_actions"] if 2 in a["satisfies_steps"])
    assert "18 mmHg" in iop["reveal_text"]
    assert iop["mode"] == "do"
    assert iop["kind"] == "manual"
    ident = next(a for a in data["examination_actions"] if 1 in a["satisfies_steps"])
    assert ident["kind"] == "verbal"  # "Identify patient name NRIC" → verbal, stays in chat
    covered = {n for a in data["examination_actions"] for n in a["satisfies_steps"]}
    assert covered == {1, 2, 3}  # nothing missing


def test_station_rubric_fallback_when_no_checklist():
    case = {**CASE, "topic": "ishihara_colour_vision", "checklist_procedure": ""}
    with patch.dict("tools.api.shared._case_cache", {"case_ishi": case}, clear=False), \
         patch("tools.api.routers.cases.get_checklist_by_name", return_value=None):
        r = client.get("/api/cases/case_ishi/station", cookies=_cookie())
    assert r.status_code == 200
    assert r.json()["checklist"]["source"] == "rubric"


def test_observe_returns_newly_satisfied():
    with patch.dict("tools.api.shared._case_cache", {"case_test_station": CASE}, clear=False), \
         patch("tools.api.routers.cases.get_checklist_by_name", return_value=CHECKLIST), \
         patch("tools.api.routers.cases.observe", return_value=[1]):
        r = client.post(
            "/api/cases/case_test_station/observe",
            json={"messages": [{"role": "user", "content": "name and NRIC please"}], "already_ticked": []},
            cookies=_cookie(),
        )
    assert r.status_code == 200
    assert r.json()["newly_satisfied"] == [1]


def test_action_grades_against_model_answer():
    # ricoe C6: the action panel returns a real-time GRADE vs the crafted model answer,
    # not a hardcoded "good job". The verdict/covered/missing/model_answer are deterministic.
    case = {**CASE, "rubric": {"investigations": {"key_points": [
        "Performs NCT correctly: explains to patient, takes 3 readings per eye, records average",
        "Records the reading accurately in the patient record",
    ]}}}
    with patch.dict("tools.api.shared._case_cache", {"case_test_station": case}, clear=False), \
         patch("tools.api.routers.cases.ask", side_effect=RuntimeError("no ai")):
        r = client.post(
            "/api/cases/case_test_station/action",
            json={
                "action_label": "Measure IOP",
                "technique": "I explained the NCT to the patient, took 3 readings per eye and recorded the average.",
                "finding": "IOP R 18 mmHg · L 20 mmHg",
                "satisfies_steps": [2],
            },
            cookies=_cookie(),
        )
    assert r.status_code == 200
    body = r.json()
    assert body["verdict"] in ("strong", "partial", "developing")
    assert "readings" in body["model_answer"].lower()  # crafted model answer surfaced
    assert "good job" not in body["coaching"].lower()


def test_action_degrades_gracefully_on_model_error():
    # With no AI, the panel still returns the DETERMINISTIC grade + a grounded coaching
    # line (never a silent empty string, never a 500).
    with patch.dict("tools.api.shared._case_cache", {"case_test_station": CASE}, clear=False), \
         patch("tools.api.routers.cases.ask", side_effect=RuntimeError("model down")):
        r = client.post(
            "/api/cases/case_test_station/action",
            json={"action_label": "Measure IOP", "technique": "x" * 12, "finding": "", "satisfies_steps": [2]},
            cookies=_cookie(),
        )
    assert r.status_code == 200
    body = r.json()
    assert body["coaching"]           # grounded deterministic line, not empty
    assert body["model_answer"]       # always surfaces a reference to learn from
    assert body["verdict"] in ("strong", "partial", "developing")
