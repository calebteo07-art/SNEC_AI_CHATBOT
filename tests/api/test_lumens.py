from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport
from tools.api.server import app
from tools.shared.jwt_utils import create_access_token
from tests.api.conftest import auth_headers


@pytest.mark.asyncio
async def test_forfeit_deducts_flat_penalty(monkeypatch):
    from tools.api.routers import student as mod
    applied = []

    async def _update_profile(_sid, **k):
        applied.append(k.get("xp_delta"))
    async def _profile(_sid):
        return {"xp": 80}

    monkeypatch.setattr(mod, "update_profile", _update_profile)
    monkeypatch.setattr(mod, "get_profile", _profile)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.post("/api/flashcards/forfeit", headers=auth_headers(role="OA"))
    assert r.status_code == 200
    assert applied == [-20]           # server owns the penalty amount
    assert r.json()["xp"] == 80       # new balance echoed back


def test_osce_lumens_scales_with_grade():
    from tools.api.routers.cases import osce_lumens
    assert osce_lumens(100) == 200
    assert osce_lumens(60) == 120
    assert osce_lumens(0) == 0


# End-to-end: /submit must actually pass the scaled award into update_profile AND echo
# it back as lumens_awarded. Mirrors the OSCE-submit monkeypatch pattern in
# tests/cases/test_checklist_counts_in_score.py; compute_station_score is pinned so
# score_100 is a known value (80 -> round(80*2) == 160).
_OSCE_CASE = {
    "case_id": "case_lumen",
    "title": "Routine IOP check",
    "difficulty": "beginner",   # always unlocked → no access gate in the way
    "topic": "iop_va_measurement",
    "estimated_minutes": 15,
    "patient": {"name": "Mr Tan", "age": 60, "presenting_complaint": "glaucoma review"},
    "examination_findings": {},
}

# raw_result — supplies the DomainScore required fields the response builder reads.
_OSCE_DOMAINS = {
    "history_score": 5, "investigations_score": 5, "diagnosis_score": 5, "management_score": 5,
    "history_feedback": "", "investigations_feedback": "", "diagnosis_feedback": "",
    "management_feedback": "", "overall_feedback": "", "total_score": 20,
    "critical_hit": 0, "critical_total": 0,
}

# Pinned station score so score_100 is deterministic (drives the Lumen award).
_OSCE_SCORE = {
    "score_100": 80, "total_score": 32, "verdict": "Competent",
    "consult_technique": 40, "consult_technique_max": 50,
    "judgement_safety": 40, "judgement_safety_max": 50, "safe": True,
    "missed_critical": [], "critical_hit": 0, "critical_total": 0,
}


def test_osce_submit_awards_lumens_and_updates_profile():
    from tools.api.routers.cases import osce_lumens
    applied = []

    async def _update_profile(_sid, **k):
        applied.append(k.get("xp_delta"))

    client = TestClient(app)
    with patch.dict("tools.api.shared._case_cache", {"case_lumen": _OSCE_CASE}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["case_lumen"]), \
         patch("tools.api.routers.cases.load_case", return_value=_OSCE_CASE), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})), \
         patch("tools.api.routers.cases._station_checklist",
               return_value={"procedure_name": "Non-Contact Tonometry", "steps": [], "source": "checklist"}), \
         patch("tools.api.routers.cases.evaluate_case", return_value=_OSCE_DOMAINS), \
         patch("tools.api.routers.cases.compute_station_score", return_value=_OSCE_SCORE), \
         patch("tools.api.routers.cases.log_session", new=AsyncMock(return_value=None)), \
         patch("tools.api.routers.cases.log_case_completion", new=AsyncMock(return_value=None)), \
         patch("tools.api.routers.cases.ask", return_value="{}"), \
         patch("tools.profile.update_profile.update_profile", new=_update_profile):
        r = client.post(
            "/api/cases/case_lumen/submit",
            json={
                "messages": [{"role": "user", "content": "Good morning, can I confirm your name?"}],
                "findings": "IOP within range on repeat readings; no red flags.",
                "recommendation": "Document and hand over to the doctor for review.",
                "performed_steps": [],
            },
            cookies={"eyebot_token": create_access_token("stu_lumen", "student", "OA")},
        )

    assert r.status_code == 200, r.text
    expected = osce_lumens(80)          # round(80 * 2) == 160
    assert applied == [expected]        # scaled award reaches update_profile as xp_delta
    assert r.json()["lumens_awarded"] == expected  # …and is echoed back
