# tests/cases/test_case_access.py
"""Tests for _check_case_access and its enforcement in case_chat / case_submit."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import HTTPException
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.api.routers.cases import _check_case_access
from tools.api.shared import _case_cache
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _auth_headers(student_id: str = "stu_test") -> dict:
    token = create_access_token(student_id, "student", "OA")
    return {"Authorization": f"Bearer {token}"}


def _make_case(case_id: str, difficulty: str) -> dict:
    return {
        "case_id": case_id,
        "difficulty": difficulty,
        "title": f"Test case {case_id}",
        "topic": "Glaucoma",
        "estimated_minutes": 15,
        "patient": {"name": "Pat", "age": 50, "presenting_complaint": "blurry vision"},
    }


ALL_CASES = [
    _make_case("beg_1", "beginner"),
    _make_case("beg_2", "beginner"),
    _make_case("beg_3", "beginner"),
    _make_case("int_1", "intermediate"),
    _make_case("int_2", "intermediate"),
    _make_case("int_3", "intermediate"),
    _make_case("adv_1", "advanced"),
]


def _patch_all_cases(progress: dict):
    from contextlib import ExitStack
    stack = ExitStack()
    stack.enter_context(
        patch("tools.api.routers.cases.list_available_cases",
              return_value=[c["case_id"] for c in ALL_CASES])
    )
    stack.enter_context(
        patch("tools.api.routers.cases.load_case",
              side_effect=lambda cid: next(c for c in ALL_CASES if c["case_id"] == cid))
    )
    stack.enter_context(
        patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value=progress))
    )
    stack.enter_context(patch.dict("tools.api.shared._case_cache", {}, clear=True))
    return stack


@pytest.mark.asyncio
async def test_beginner_always_allowed():
    """Beginner case is always allowed regardless of progress."""
    case = _make_case("beg_1", "beginner")
    with _patch_all_cases({}):
        await _check_case_access("stu_test", case)


@pytest.mark.asyncio
async def test_intermediate_blocked_zero_beginner_passes():
    """Intermediate case is blocked when student has 0 beginner passes."""
    case = _make_case("int_1", "intermediate")
    with _patch_all_cases({}):
        with pytest.raises(HTTPException) as exc_info:
            await _check_case_access("stu_test", case)
    assert exc_info.value.status_code == 403
    assert "beginner" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_intermediate_blocked_one_beginner_pass():
    """Intermediate case is blocked when student has only 1 beginner pass."""
    case = _make_case("int_1", "intermediate")
    progress = {"beg_1": {"total_score": 30, "passed": True}}
    with _patch_all_cases(progress):
        with pytest.raises(HTTPException) as exc_info:
            await _check_case_access("stu_test", case)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_intermediate_allowed_two_beginner_passes():
    """Intermediate case is allowed when student has 2 beginner passes."""
    case = _make_case("int_1", "intermediate")
    progress = {
        "beg_1": {"total_score": 30, "passed": True},
        "beg_2": {"total_score": 28, "passed": True},
    }
    with _patch_all_cases(progress):
        await _check_case_access("stu_test", case)


@pytest.mark.asyncio
async def test_advanced_blocked_zero_intermediate_passes():
    """Advanced case is blocked when student has 0 intermediate passes."""
    case = _make_case("adv_1", "advanced")
    progress = {
        "beg_1": {"total_score": 30, "passed": True},
        "beg_2": {"total_score": 28, "passed": True},
    }
    with _patch_all_cases(progress):
        with pytest.raises(HTTPException) as exc_info:
            await _check_case_access("stu_test", case)
    assert exc_info.value.status_code == 403
    assert "intermediate" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_advanced_blocked_one_intermediate_pass():
    """Advanced case is blocked when student has only 1 intermediate pass."""
    case = _make_case("adv_1", "advanced")
    progress = {
        "beg_1": {"total_score": 30, "passed": True},
        "beg_2": {"total_score": 28, "passed": True},
        "int_1": {"total_score": 35, "passed": True},
    }
    with _patch_all_cases(progress):
        with pytest.raises(HTTPException) as exc_info:
            await _check_case_access("stu_test", case)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_advanced_allowed_two_intermediate_passes():
    """Advanced case is allowed when student has 2 intermediate passes."""
    case = _make_case("adv_1", "advanced")
    progress = {
        "beg_1": {"total_score": 30, "passed": True},
        "beg_2": {"total_score": 28, "passed": True},
        "int_1": {"total_score": 35, "passed": True},
        "int_2": {"total_score": 32, "passed": True},
    }
    with _patch_all_cases(progress):
        await _check_case_access("stu_test", case)


@pytest.mark.asyncio
async def test_unknown_difficulty_allowed():
    """Unknown difficulty is treated as beginner (allowed)."""
    case = _make_case("mystery_1", "expert")
    with _patch_all_cases({}):
        await _check_case_access("stu_test", case)


def _locked_advanced_case() -> dict:
    return _make_case("adv_locked", "advanced")


def test_submit_locked_case_returns_403():
    """POST /api/cases/{case_id}/submit returns 403 when case is locked."""
    case = _locked_advanced_case()
    with patch.dict("tools.api.shared._case_cache", {"adv_locked": case}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["adv_locked"]), \
         patch("tools.api.routers.cases.load_case", return_value=case), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})):

        r = client.post(
            "/api/cases/adv_locked/submit",
            json={
                "student_id": "stu_test",
                "messages": [],
                "diagnosis": "Glaucoma",
                "management_plan": "Timolol drops",
                "performed_steps": [],
            },
            headers=_auth_headers("stu_test"),
        )

    assert r.status_code == 403
    assert "intermediate" in r.json()["detail"].lower()


def test_chat_locked_case_returns_403():
    """POST /api/cases/{case_id}/chat returns 403 when case is locked."""
    case = _locked_advanced_case()
    with patch.dict("tools.api.shared._case_cache", {"adv_locked": case}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["adv_locked"]), \
         patch("tools.api.routers.cases.load_case", return_value=case), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})):

        r = client.post(
            "/api/cases/adv_locked/chat",
            json={
                "student_id": "stu_test",
                "messages": [{"role": "user", "content": "Hello"}],
            },
            headers=_auth_headers("stu_test"),
        )

    assert r.status_code == 403
    assert "intermediate" in r.json()["detail"].lower()
