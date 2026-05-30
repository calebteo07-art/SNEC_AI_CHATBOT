import pytest
from datetime import date
from unittest.mock import AsyncMock, patch


def _profile(**kwargs):
    defaults = {
        "student_id": "stu-001",
        "weak_topics": [],
        "missed_findings": [],
        "retention_scores": {},
        "session_count": 2,
        "streak": 1,
        "last_active": "2026-05-09",
        "learning_velocity": "stable",
        "checkin_done_today": False,
    }
    defaults.update(kwargs)
    return defaults


@pytest.mark.asyncio
async def test_update_profile_increments_session_count():
    profile = _profile()
    with patch("tools.profile.update_profile.get_profile", new=AsyncMock(return_value=profile)), \
         patch("tools.shared.db.update_profile", new=AsyncMock()) as mock_update, \
         patch("tools.profile.update_profile.date") as mock_date:
        mock_date.today.return_value = date(2026, 5, 10)
        mock_date.fromisoformat = date.fromisoformat
        from tools.profile.update_profile import update_profile
        await update_profile("stu-001")
    call_kwargs = mock_update.call_args[1]
    assert call_kwargs["session_count"] == 3


@pytest.mark.asyncio
async def test_update_profile_increments_streak_from_yesterday():
    profile = _profile(last_active="2026-05-09", streak=4)
    with patch("tools.profile.update_profile.get_profile", new=AsyncMock(return_value=profile)), \
         patch("tools.shared.db.update_profile", new=AsyncMock()) as mock_update, \
         patch("tools.profile.update_profile.date") as mock_date:
        mock_date.today.return_value = date(2026, 5, 10)
        mock_date.fromisoformat = date.fromisoformat
        from tools.profile.update_profile import update_profile
        await update_profile("stu-001")
    call_kwargs = mock_update.call_args[1]
    assert call_kwargs["streak"] == 5


@pytest.mark.asyncio
async def test_update_profile_resets_streak_after_gap():
    profile = _profile(last_active="2026-05-07", streak=10)
    with patch("tools.profile.update_profile.get_profile", new=AsyncMock(return_value=profile)), \
         patch("tools.shared.db.update_profile", new=AsyncMock()) as mock_update, \
         patch("tools.profile.update_profile.date") as mock_date:
        mock_date.today.return_value = date(2026, 5, 10)
        mock_date.fromisoformat = date.fromisoformat
        from tools.profile.update_profile import update_profile
        await update_profile("stu-001")
    call_kwargs = mock_update.call_args[1]
    assert call_kwargs["streak"] == 1


@pytest.mark.asyncio
async def test_update_profile_updates_retention_scores():
    profile = _profile(retention_scores={"glaucoma": 0.8})
    with patch("tools.profile.update_profile.get_profile", new=AsyncMock(return_value=profile)), \
         patch("tools.shared.db.update_profile", new=AsyncMock()) as mock_update, \
         patch("tools.profile.update_profile.date") as mock_date:
        mock_date.today.return_value = date(2026, 5, 10)
        mock_date.fromisoformat = date.fromisoformat
        from tools.profile.update_profile import update_profile
        await update_profile("stu-001", topic="retina", score=0.5)
    call_kwargs = mock_update.call_args[1]
    scores = call_kwargs["retention_scores"]
    assert scores["retina"] == 0.5
    assert scores["glaucoma"] == 0.8


@pytest.mark.asyncio
async def test_update_profile_marks_weak_topics():
    profile = _profile(retention_scores={"glaucoma": 0.8, "retina": 0.4})
    with patch("tools.profile.update_profile.get_profile", new=AsyncMock(return_value=profile)), \
         patch("tools.shared.db.update_profile", new=AsyncMock()) as mock_update, \
         patch("tools.profile.update_profile.date") as mock_date:
        mock_date.today.return_value = date(2026, 5, 10)
        mock_date.fromisoformat = date.fromisoformat
        from tools.profile.update_profile import update_profile
        await update_profile("stu-001")
    call_kwargs = mock_update.call_args[1]
    weak = call_kwargs["weak_topics"]
    assert "retina" in weak
    assert "glaucoma" not in weak


@pytest.mark.asyncio
async def test_update_profile_appends_missed_findings():
    profile = _profile(missed_findings=["disc haemorrhage"])
    with patch("tools.profile.update_profile.get_profile", new=AsyncMock(return_value=profile)), \
         patch("tools.shared.db.update_profile", new=AsyncMock()) as mock_update, \
         patch("tools.profile.update_profile.date") as mock_date:
        mock_date.today.return_value = date(2026, 5, 10)
        mock_date.fromisoformat = date.fromisoformat
        from tools.profile.update_profile import update_profile
        await update_profile("stu-001", new_missed_findings=["RNFL thinning"])
    call_kwargs = mock_update.call_args[1]
    findings = call_kwargs["missed_findings"]
    assert "disc haemorrhage" in findings
    assert "RNFL thinning" in findings


@pytest.mark.asyncio
async def test_update_profile_noop_on_sheet_error():
    with patch("tools.profile.update_profile.get_profile", new=AsyncMock(side_effect=RuntimeError("db error"))):
        from tools.profile.update_profile import update_profile
        await update_profile("stu-001")  # must not raise
