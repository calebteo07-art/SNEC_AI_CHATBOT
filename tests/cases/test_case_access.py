# tests/cases/test_case_access.py
"""Per-topic difficulty gate: _check_case_access + its enforcement on the case-list, chat,
submit, station, observe and action endpoints (model in tools/cases/tier_gate.py).

Unlock model (2026-07-20): a Developing case unlocks once the student has completed
min(2, #Foundational in ITS topic) Foundational cases in that same topic — or, when the
topic has no Foundational case, any 3 cases in any topic. Advanced mirrors it over the
Developing tier. "Completed" = an attempt exists (pass or fail).
"""
import pytest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.api.routers.cases import _check_case_access
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


@pytest.fixture(autouse=True)
def _stub_profile_read():
    """GET /api/cases resolves the student's content pool from their profile.

    The two case-list tests never patched that read, so it hit production Supabase for a
    `stu_test` id that isn't there — and a miss makes `tools.profile.get_profile` CREATE
    the row (db.upsert_profile), so it wrote too. "OA" is what the real read already
    resolved to via the route's `or "OA"` fallback, so the lock assertions are unchanged.
    See `_forbid_real_supabase` in tests/conftest.py.
    """
    with patch("tools.shared.db.get_profile", new=AsyncMock(return_value={"role": "OA"})):
        yield


def _auth_cookie(student_id: str = "stu_test") -> dict:
    return {"eyebot_token": create_access_token(student_id, "student", "OA")}


def _make_case(case_id: str, difficulty: str, topic_set: str) -> dict:
    return {
        "case_id": case_id,
        "difficulty": difficulty,
        "title": f"Test case {case_id}",
        "topic": "Glaucoma",
        "topic_set": topic_set,   # explicit → deterministic bucketing (no resolve_set guessing)
        "estimated_minutes": 15,
        "patient": {"name": "Pat", "age": 50, "presenting_complaint": "blurry vision"},
    }


# Two Foundational-bearing topics + one with NO Foundational case, so the per-topic gate,
# cross-topic isolation, and the any-3 fallback are all exercised.
ALL_CASES = [
    _make_case("va_beg1", "beginner", "visual_acuity"),
    _make_case("va_beg2", "beginner", "visual_acuity"),
    _make_case("va_beg3", "beginner", "visual_acuity"),
    _make_case("va_int1", "intermediate", "visual_acuity"),
    _make_case("va_int2", "intermediate", "visual_acuity"),
    _make_case("va_adv1", "advanced", "visual_acuity"),
    _make_case("tono_beg1", "beginner", "tonometry_iop"),
    _make_case("tono_beg2", "beginner", "tonometry_iop"),
    _make_case("tono_int1", "intermediate", "tonometry_iop"),
    _make_case("oe_int1", "intermediate", "ocular_emergencies"),   # topic has NO Foundational
    _make_case("oe_adv1", "advanced", "ocular_emergencies"),
]
_BY_ID = {c["case_id"]: c for c in ALL_CASES}


def _completed(*ids: str) -> dict:
    """Progress dict marking `ids` as completed. Presence — not `passed` — is what the gate
    counts now, so these rows are deliberately failing (passed=False)."""
    return {i: {"total_score": 20, "passed": False, "completed_at": "t"} for i in ids}


def _patch_all_cases(progress: dict):
    from contextlib import ExitStack
    stack = ExitStack()
    stack.enter_context(patch("tools.api.routers.cases.list_available_cases",
                              return_value=[c["case_id"] for c in ALL_CASES]))
    stack.enter_context(patch("tools.api.routers.cases.load_case", side_effect=lambda cid: _BY_ID[cid]))
    stack.enter_context(patch("tools.api.routers.cases.get_case_progress",
                              new=AsyncMock(return_value=progress)))
    stack.enter_context(patch.dict("tools.api.shared._case_cache", {}, clear=True))
    return stack


# ── Foundational / unknown: always open ────────────────────────────────────
@pytest.mark.asyncio
async def test_foundational_always_allowed():
    with _patch_all_cases({}):
        await _check_case_access("stu_test", _BY_ID["va_beg1"])


@pytest.mark.asyncio
async def test_unknown_difficulty_allowed():
    with _patch_all_cases({}):
        await _check_case_access("stu_test", _make_case("mystery", "expert", "visual_acuity"))


# ── Developing: per-topic Foundational gate ────────────────────────────────
@pytest.mark.asyncio
async def test_developing_blocked_with_zero_foundational_in_topic():
    with _patch_all_cases({}):
        with pytest.raises(HTTPException) as exc:
            await _check_case_access("stu_test", _BY_ID["va_int1"])
    assert exc.value.status_code == 403
    assert exc.value.detail == "Complete 2 Foundational cases in this topic to unlock."


@pytest.mark.asyncio
async def test_developing_blocked_with_one_foundational_in_topic():
    with _patch_all_cases(_completed("va_beg1")):
        with pytest.raises(HTTPException):
            await _check_case_access("stu_test", _BY_ID["va_int1"])


@pytest.mark.asyncio
async def test_developing_allowed_with_two_foundational_attempts_same_topic():
    # Two *failed* attempts still count — completion, not passing, is the gate.
    with _patch_all_cases(_completed("va_beg1", "va_beg2")):
        await _check_case_access("stu_test", _BY_ID["va_int1"])


@pytest.mark.asyncio
async def test_developing_foundational_in_other_topic_does_not_unlock():
    # 3 Foundational done, but all in visual_acuity — tonometry Developing stays locked
    # (tonometry HAS Foundational cases, so the any-3 fallback does not apply to it).
    with _patch_all_cases(_completed("va_beg1", "va_beg2", "va_beg3")):
        with pytest.raises(HTTPException):
            await _check_case_access("stu_test", _BY_ID["tono_int1"])


# ── Developing: no-Foundational topic → any 3 cases in any topic ───────────
@pytest.mark.asyncio
async def test_no_foundational_topic_blocked_under_three_completions():
    with _patch_all_cases(_completed("va_beg1", "va_beg2")):  # only 2 completed anywhere
        with pytest.raises(HTTPException) as exc:
            await _check_case_access("stu_test", _BY_ID["oe_int1"])
    assert exc.value.detail == "Complete any 3 cases in any topic to unlock."


@pytest.mark.asyncio
async def test_no_foundational_topic_allowed_at_three_completions_any_topic():
    with _patch_all_cases(_completed("va_beg1", "va_beg2", "tono_beg1")):
        await _check_case_access("stu_test", _BY_ID["oe_int1"])


# ── Advanced: mirrors Developing, per topic ────────────────────────────────
@pytest.mark.asyncio
async def test_advanced_blocked_until_two_developing_in_topic():
    with _patch_all_cases(_completed("va_beg1", "va_beg2")):  # Foundational done, 0 Developing
        with pytest.raises(HTTPException) as exc:
            await _check_case_access("stu_test", _BY_ID["va_adv1"])
    assert exc.value.detail == "Complete 2 Developing cases in this topic to unlock."


@pytest.mark.asyncio
async def test_advanced_allowed_with_two_developing_attempts_same_topic():
    with _patch_all_cases(_completed("va_int1", "va_int2")):
        await _check_case_access("stu_test", _BY_ID["va_adv1"])


# ── Case-list endpoint: full library, per-topic lock flags + hints ─────────
def test_cases_list_returns_full_library_with_pertopic_locks():
    with _patch_all_cases({}):  # nothing completed
        r = client.get("/api/cases", cookies=_auth_cookie())
    assert r.status_code == 200
    cases = {c["case_id"]: c for c in r.json()["cases"]}
    assert set(cases) == set(_BY_ID), "every case must be returned, not a window"
    locked = {cid for cid, c in cases.items() if c["locked"]}
    assert locked == {"va_int1", "va_int2", "tono_int1", "oe_int1", "va_adv1", "oe_adv1"}
    # Foundational cards carry no hint; gated cards carry the actionable per-topic note.
    assert cases["va_beg1"]["unlock_hint"] == ""
    assert cases["va_int1"]["unlock_hint"] == "Complete 2 Foundational cases in this topic to unlock."
    assert cases["oe_int1"]["unlock_hint"] == "Complete any 3 cases in any topic to unlock."


def test_cases_list_unlocks_only_the_topic_whose_foundational_is_cleared():
    with _patch_all_cases(_completed("va_beg1", "va_beg2")):
        r = client.get("/api/cases", cookies=_auth_cookie())
    cases = {c["case_id"]: c for c in r.json()["cases"]}
    assert cases["va_int1"]["locked"] is False   # this topic's Foundational cleared
    assert cases["va_int2"]["locked"] is False
    assert cases["tono_int1"]["locked"] is True  # a different topic — not unlocked
    assert cases["oe_int1"]["locked"] is True    # fallback needs 3 completions, only 2 done


# ── Fail-closed on every case-content endpoint (a locked case → 403) ────────
# A lone locked Advanced case sits in a topic with no Developing case, so it falls to the
# account-wide any-3 fallback and its 403 detail is that hint.
def _locked_advanced_case() -> dict:
    return _make_case("adv_locked", "advanced", "ocular_emergencies")


_LOCKED_HINT = "Complete any 3 cases in any topic to unlock."


def _locked_ctx():
    case = _locked_advanced_case()
    return case, [
        patch.dict("tools.api.shared._case_cache", {"adv_locked": case}, clear=False),
        patch("tools.api.routers.cases.list_available_cases", return_value=["adv_locked"]),
        patch("tools.api.routers.cases.load_case", return_value=case),
        patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})),
    ]


def test_submit_locked_case_returns_403():
    case = _locked_advanced_case()
    with patch.dict("tools.api.shared._case_cache", {"adv_locked": case}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["adv_locked"]), \
         patch("tools.api.routers.cases.load_case", return_value=case), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})):
        r = client.post(
            "/api/cases/adv_locked/submit",
            json={"student_id": "stu_test", "messages": [],
                  "findings": "Raised IOP on repeat readings; no red flags noted.",
                  "recommendation": "Document and escalate to the doctor for review.",
                  "performed_steps": []},
            cookies=_auth_cookie("stu_test"),
        )
    assert r.status_code == 403
    assert r.json()["detail"] == _LOCKED_HINT


def test_chat_locked_case_returns_403():
    case = _locked_advanced_case()
    with patch.dict("tools.api.shared._case_cache", {"adv_locked": case}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["adv_locked"]), \
         patch("tools.api.routers.cases.load_case", return_value=case), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})):
        r = client.post(
            "/api/cases/adv_locked/chat",
            json={"student_id": "stu_test", "messages": [{"role": "user", "content": "Hello"}]},
            cookies=_auth_cookie("stu_test"),
        )
    assert r.status_code == 403
    assert r.json()["detail"] == _LOCKED_HINT


def test_station_locked_case_returns_403():
    from contextlib import ExitStack
    _case, patches = _locked_ctx()
    with ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)
        r = client.get("/api/cases/adv_locked/station", cookies=_auth_cookie("stu_test"))
    assert r.status_code == 403
    assert r.json()["detail"] == _LOCKED_HINT


def test_observe_locked_case_returns_403():
    from contextlib import ExitStack
    _case, patches = _locked_ctx()
    with ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)
        r = client.post(
            "/api/cases/adv_locked/observe",
            json={"messages": [{"role": "user", "content": "hi"}], "already_ticked": []},
            cookies=_auth_cookie("stu_test"),
        )
    assert r.status_code == 403


def test_action_locked_case_returns_403():
    from contextlib import ExitStack
    _case, patches = _locked_ctx()
    with ExitStack() as stack:
        for p in patches:
            stack.enter_context(p)
        r = client.post(
            "/api/cases/adv_locked/action",
            json={"action_label": "Measure IOP", "technique": "x" * 12, "finding": "", "satisfies_steps": [2]},
            cookies=_auth_cookie("stu_test"),
        )
    assert r.status_code == 403
