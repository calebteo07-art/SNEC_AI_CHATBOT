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
    assert applied == [-30]           # server owns the penalty amount (unified 30)
    assert r.json()["xp"] == 80       # new balance echoed back


def test_station_forfeit_deducts_flat_penalty():
    """Leaving a virtual-patient station before submitting the handover deducts the flat,
    server-owned penalty — the same 30 Lumens as the flashcards forfeit. The client never
    sends an amount, so it can't be gamed; update_profile floors the balance at 0 and
    leaves lifetime coins_earned untouched (so an earned badge is never lost)."""
    from tools.api.routers.cases import FORFEIT_PENALTY
    applied = []

    async def _update_profile(_sid, **k):
        applied.append(k.get("xp_delta"))

    client = TestClient(app)
    with patch("tools.profile.update_profile.update_profile", new=_update_profile):
        r = client.post(
            "/api/cases/case_abandoned/forfeit",
            cookies={"eyebot_token": create_access_token("stu_forfeit", "student", "OA")},
        )
    assert r.status_code == 200, r.text
    assert FORFEIT_PENALTY == 30           # unified flashcards + station penalty (gentler stake)
    assert applied == [-FORFEIT_PENALTY]   # server owns the amount
    assert r.json()["penalty"] == FORFEIT_PENALTY


def test_osce_reward_scales_with_grade_and_difficulty():
    from tools.api.routers.cases import osce_reward
    # A pass (>=60) pays the tier base scaled by the grade; harder tiers pay more.
    assert osce_reward(100, "beginner") == 150
    assert osce_reward(60, "beginner") == 90        # round(150 * 0.6)
    assert osce_reward(100, "intermediate") == 220
    assert osce_reward(60, "intermediate") == 132   # round(220 * 0.6)
    assert osce_reward(100, "advanced") == 300
    assert osce_reward(60, "advanced") == 180        # round(300 * 0.6)
    # A sub-pass attempt pays only a flat consolation (not a linear payout); 0 pays 0.
    assert osce_reward(59, "beginner") == 20
    assert osce_reward(30, "advanced") == 20
    assert osce_reward(0, "beginner") == 0
    # Unknown / missing difficulty falls back to the beginner scale (never crashes).
    assert osce_reward(100) == 150
    assert osce_reward(100, "bogus") == 150


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
    "checklist_coverage": 32, "checklist_coverage_max": 40,
    "consult_technique": 24, "consult_technique_max": 30,
    "judgement_safety": 24, "judgement_safety_max": 30, "safe": True,
    "missed_critical": [], "critical_hit": 0, "critical_total": 0,
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


def _submit_case(prior_results):
    """Drive a full /submit for the pinned beginner case (score_100=80), with the
    student's prior case rows controlled via db.get_case_results. Returns
    (applied_xp_deltas, response_json).

    db.get_profile is stubbed only to keep the route's role lookup off production
    Supabase (see `_forbid_real_supabase` in tests/conftest.py); the award maths
    reads nothing from it."""
    applied = []

    async def _update_profile(_sid, **k):
        applied.append(k.get("xp_delta"))

    client = TestClient(app)
    with patch.dict("tools.api.shared._case_cache", {"case_lumen": _OSCE_CASE}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["case_lumen"]), \
         patch("tools.api.routers.cases.load_case", return_value=_OSCE_CASE), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})), \
         patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=prior_results)), \
         patch("tools.shared.db.get_profile", new=AsyncMock(return_value={"role": "OA"})), \
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
    return applied, r.json()


def test_osce_submit_awards_first_pass_reward():
    from tools.api.routers.cases import osce_reward
    applied, body = _submit_case(prior_results=[])   # never attempted before
    expected = osce_reward(80, "beginner")           # round(150 * 0.8) == 120
    assert expected == 120
    assert applied == [expected]                     # scaled award reaches update_profile
    assert body["lumens_awarded"] == expected        # …and is echoed back


def test_osce_retry_of_aced_case_pays_nothing():
    # High-water mark: a re-run at the same (or lower) grade re-pays 0 — no farming.
    prior = [{"case_id": "case_lumen", "score_100": 80, "passed": True, "total_score": 48}]
    applied, body = _submit_case(prior_results=prior)
    assert applied == [0]
    assert body["lumens_awarded"] == 0


def test_osce_retry_pays_only_the_improvement():
    # Failed before (40 -> consolation 20), now passes at 80 -> earns the delta only.
    from tools.api.routers.cases import osce_reward
    prior = [{"case_id": "case_lumen", "score_100": 40, "passed": False, "total_score": 16}]
    applied, body = _submit_case(prior_results=prior)
    expected = osce_reward(80, "beginner") - osce_reward(40, "beginner")   # 120 - 20 == 100
    assert expected == 100
    assert applied == [expected]
    assert body["lumens_awarded"] == expected


def test_sync_clamps_oversized_xp(monkeypatch):
    # The chat/gamification sync endpoint must clamp a tampered xp_delta (it was fully
    # unclamped — the one endpoint a client could inject arbitrary Lumens through).
    from tools.api.routers import student as mod
    applied = []

    async def _update_profile(_sid, **k):
        applied.append(k.get("xp_delta"))
    async def _profile(_sid):
        return {"xp": 0, "hearts": 5}

    monkeypatch.setattr(mod, "update_profile", _update_profile)
    monkeypatch.setattr(mod, "get_profile", _profile)

    client = TestClient(app)
    r = client.post(
        "/api/gamification/sync",
        json={"xp_delta": 999999, "hearts_used": 0},
        cookies={"eyebot_token": create_access_token("stu_sync", "student", "OA")},
    )
    assert r.status_code == 200, r.text
    assert applied == [100]   # clamped to the per-request ceiling
