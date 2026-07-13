"""Check-in status — once-per-day truth + streak recovery from the check-in log.

`checkin_done_today` must be true whenever today is already in checkin_history (so the
UI never re-shows the check-in the same day), and the reported streak must recover from
the log even when the stored `streak` column read back as 0 (the last_checkin_date bug).
"""
import pytest
from datetime import date
from unittest.mock import AsyncMock, patch

from tools.api.routers.checkin import checkin_status


async def _status(profile, today):
    with patch("tools.api.routers.checkin.get_profile", new=AsyncMock(return_value=profile)), \
         patch("tools.api.routers.checkin.app_today", return_value=today):
        return await checkin_status(current_user={"sub": "stu-1"})


def _profile(**kw):
    base = {"streak": 3, "streak_freezes": 0, "checkin_history": [],
            "checkin_done_today": False, "weak_topics": []}
    base.update(kw)
    return base


@pytest.mark.asyncio
async def test_status_done_today_when_today_in_history():
    # Once-per-day: today already logged -> report done so the UI won't nag again.
    res = await _status(_profile(checkin_history=["2026-05-04", "2026-05-05"]), date(2026, 5, 5))
    assert res.checkin_done_today is True


@pytest.mark.asyncio
async def test_status_not_done_on_a_fresh_day():
    res = await _status(_profile(checkin_history=["2026-05-04"], checkin_done_today=False), date(2026, 5, 5))
    assert res.checkin_done_today is False


@pytest.mark.asyncio
async def test_status_recovers_streak_from_history_when_column_zero():
    hist = ["2026-05-04", "2026-05-05", "2026-05-06"]
    res = await _status(_profile(streak=0, checkin_history=hist), date(2026, 5, 6))
    assert res.streak == 3


@pytest.mark.asyncio
async def test_status_zeroes_a_lapsed_streak():
    # Last check-in weeks ago -> streak no longer alive -> reported as 0.
    res = await _status(_profile(streak=0, checkin_history=["2026-05-04"]), date(2026, 5, 20))
    assert res.streak == 0
