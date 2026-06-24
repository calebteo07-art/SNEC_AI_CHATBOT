import pytest
from datetime import date
from unittest.mock import AsyncMock, patch


def _make_profile(**kwargs):
    defaults = {
        "student_id": "stu-001",
        "weak_topics": [],
        "missed_findings": [],
        "retention_scores": {},
        "session_count": 0,
        "streak": 0,
        "last_active": None,
        "learning_velocity": "stable",
        "checkin_done_today": False,
        "supervisor_note": "",
    }
    defaults.update(kwargs)
    return defaults


@pytest.mark.asyncio
async def test_get_profile_returns_existing_row():
    profile_row = _make_profile(student_id="stu-001", streak=3)
    with patch("tools.shared.db.get_profile", new=AsyncMock(return_value=profile_row)):
        from tools.profile.get_profile import get_profile
        result = await get_profile("stu-001")
    assert result["streak"] == 3


@pytest.mark.asyncio
async def test_get_profile_creates_default_when_missing():
    with patch("tools.shared.db.get_profile", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.upsert_profile", new=AsyncMock()) as mock_upsert:
        from tools.profile.get_profile import get_profile
        result = await get_profile("stu-new")
    assert result["student_id"] == "stu-new"
    assert result["session_count"] == 0
    mock_upsert.assert_called_once()


@pytest.mark.asyncio
async def test_get_profile_resets_checkin_on_new_day():
    yesterday = "2026-05-09"
    profile_row = _make_profile(
        student_id="stu-001",
        last_active=yesterday,
        checkin_done_today=True,
    )
    with patch("tools.shared.db.get_profile", new=AsyncMock(return_value=profile_row)), \
         patch("tools.shared.db.update_profile", new=AsyncMock()) as mock_update, \
         patch("tools.profile.get_profile.app_today", return_value=date(2026, 5, 10)):
        from tools.profile.get_profile import get_profile
        result = await get_profile("stu-001")
    mock_update.assert_called_once()
    assert result["checkin_done_today"] is False


@pytest.mark.asyncio
async def test_get_profile_does_not_reset_checkin_same_day():
    today = "2026-05-10"
    profile_row = _make_profile(
        student_id="stu-001",
        last_active=today,
        checkin_done_today=True,
    )
    with patch("tools.shared.db.get_profile", new=AsyncMock(return_value=profile_row)), \
         patch("tools.shared.db.update_profile", new=AsyncMock()) as mock_update, \
         patch("tools.profile.get_profile.app_today", return_value=date(2026, 5, 10)):
        from tools.profile.get_profile import get_profile
        result = await get_profile("stu-001")
    mock_update.assert_not_called()
    assert result["checkin_done_today"] is True


@pytest.mark.asyncio
async def test_get_profile_returns_default_on_sheet_error():
    with patch("tools.shared.db.get_profile", new=AsyncMock(side_effect=RuntimeError("db error"))):
        from tools.profile.get_profile import get_profile
        result = await get_profile("stu-broken")
    assert result["student_id"] == "stu-broken"
    assert result["session_count"] == 0
