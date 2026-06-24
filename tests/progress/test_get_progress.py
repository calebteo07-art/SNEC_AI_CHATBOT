"""Progress payload — the new gamification fields the dashboard reads."""
import pytest
from datetime import date
from unittest.mock import AsyncMock, patch


def _profile(**kwargs):
    base = {
        "student_id": "stu-001",
        "retention_scores": {},
        "weak_topics": [],
        "session_count": 3,
        "streak": 7,
        "xp": 1250,
        "hearts": 5,
        "learning_velocity": "stable",
        "streak_freezes": 1,
        "best_streak": 9,
        "checkin_history": ["2026-05-04", "2026-05-05"],
        "last_checkin_date": "2026-05-05",
        "xp_today": 60,
        "xp_today_date": "2026-05-05",
    }
    base.update(kwargs)
    return base


async def _progress(profile, today):
    with patch("tools.progress.get_progress.get_profile", new=AsyncMock(return_value=profile)), \
         patch("tools.shared.db.get_sessions", new=AsyncMock(return_value=[])), \
         patch("tools.progress.get_progress.app_today", return_value=today), \
         patch("tools.gamification.streak.current_week_states") as wk, \
         patch("tools.gamification.streak.streak_alive", return_value=True):
        wk.return_value = []
        from tools.progress.get_progress import get_progress
        return await get_progress("stu-001")


@pytest.mark.asyncio
async def test_progress_includes_streak_detail():
    data = await _progress(_profile(), date(2026, 5, 5))
    sd = data["streak_detail"]
    assert sd["current"] == 7
    assert sd["best"] == 9
    assert sd["freezes"] == 1
    assert sd["done_today"] is True       # 2026-05-05 is in checkin_history
    assert sd["tier"] == "Clear View"     # 7 >= 5


@pytest.mark.asyncio
async def test_progress_xp_today_current_day():
    data = await _progress(_profile(), date(2026, 5, 5))
    assert data["xp_today"] == 60
    assert data["daily_goal"] == 100


@pytest.mark.asyncio
async def test_progress_xp_today_resets_on_new_day():
    # xp_today_date is stale (yesterday) -> today's tally reads zero.
    data = await _progress(_profile(xp_today=60, xp_today_date="2026-05-05"), date(2026, 5, 6))
    assert data["xp_today"] == 0


@pytest.mark.asyncio
async def test_progress_streak_zeroed_when_not_alive():
    with patch("tools.progress.get_progress.get_profile", new=AsyncMock(return_value=_profile(streak=7))), \
         patch("tools.shared.db.get_sessions", new=AsyncMock(return_value=[])), \
         patch("tools.progress.get_progress.app_today", return_value=date(2026, 5, 20)), \
         patch("tools.gamification.streak.current_week_states", return_value=[]), \
         patch("tools.gamification.streak.streak_alive", return_value=False):
        from tools.progress.get_progress import get_progress
        data = await get_progress("stu-001")
    assert data["streak"] == 0
    assert data["streak_detail"]["current"] == 0
