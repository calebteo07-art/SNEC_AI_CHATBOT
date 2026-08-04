"""update_profile as the single writer of the daily activity tally.

It is already the one funnel every Lumen in the app is credited through, which is exactly
why the tally belongs here: one writer means quest progress cannot drift from what the
student actually did. The rules with a test each:
  · An earn with a source records that source.
  · An earn with NO source records nothing (role updates, check-ins).
  · A stale daily_state_date does not carry yesterday's counts into today.
  · An active boost multiplies the XP that lands.
  · A boost never multiplies a penalty.
"""
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from tools.profile.update_profile import update_profile

SGT = timezone(timedelta(hours=8))
TODAY = date(2026, 8, 4)


def _writes(mock_update):
    """Merge every guarded write into one dict — they are dispatched concurrently as
    disjoint column groups, so the test should not care which call carried which field."""
    merged = {}
    for call in mock_update.call_args_list:
        merged.update(call.kwargs)
    return merged


@pytest.mark.asyncio
async def test_an_earn_with_a_source_records_the_activity():
    profile = {"student_id": "ann", "xp": 0, "division": 1}
    with patch("tools.profile.update_profile.get_profile", AsyncMock(return_value=profile)), \
         patch("tools.profile.update_profile.db.update_profile", AsyncMock()) as upd, \
         patch("tools.profile.update_profile.app_today", return_value=TODAY):
        await update_profile("ann", xp_delta=10, source="flashcards", topic="gonioscopy")
    written = _writes(upd)
    assert written["daily_state"]["activity"]["flashcards"] == 1
    assert written["daily_state"]["activity"]["topics"]["gonioscopy"] == 1
    assert written["daily_state_date"] == TODAY.isoformat()


@pytest.mark.asyncio
async def test_no_source_records_no_activity():
    profile = {"student_id": "ann", "xp": 0, "division": 1}
    with patch("tools.profile.update_profile.get_profile", AsyncMock(return_value=profile)), \
         patch("tools.profile.update_profile.db.update_profile", AsyncMock()) as upd, \
         patch("tools.profile.update_profile.app_today", return_value=TODAY):
        await update_profile("ann", xp_delta=10)
    assert "daily_state" not in _writes(upd)


@pytest.mark.asyncio
async def test_a_stale_daily_state_does_not_carry_into_today():
    profile = {"student_id": "ann", "xp": 0, "division": 1,
               "daily_state": {"activity": {"flashcards": 9, "osce": 0, "tutor": 0, "topics": {}},
                               "quests_claimed": [], "chest_claimed": True},
               "daily_state_date": "2026-08-03"}
    with patch("tools.profile.update_profile.get_profile", AsyncMock(return_value=profile)), \
         patch("tools.profile.update_profile.db.update_profile", AsyncMock()) as upd, \
         patch("tools.profile.update_profile.app_today", return_value=TODAY):
        await update_profile("ann", xp_delta=10, source="flashcards")
    written = _writes(upd)
    assert written["daily_state"]["activity"]["flashcards"] == 1   # not 10
    assert written["daily_state"]["chest_claimed"] is False


@pytest.mark.asyncio
async def test_an_active_boost_multiplies_the_xp_that_lands():
    until = (datetime.now(SGT) + timedelta(minutes=10)).isoformat()
    profile = {"student_id": "ann", "xp": 0, "division": 1, "boosts": {"xp2x_until": until}}
    with patch("tools.profile.update_profile.get_profile", AsyncMock(return_value=profile)), \
         patch("tools.profile.update_profile.db.update_profile", AsyncMock()) as upd, \
         patch("tools.profile.update_profile.app_today", return_value=TODAY):
        await update_profile("ann", xp_delta=10, source="flashcards")
    assert _writes(upd)["xp"] == 20


@pytest.mark.asyncio
async def test_a_boost_never_multiplies_a_forfeit():
    until = (datetime.now(SGT) + timedelta(minutes=10)).isoformat()
    profile = {"student_id": "ann", "xp": 100, "division": 1, "boosts": {"xp2x_until": until}}
    with patch("tools.profile.update_profile.get_profile", AsyncMock(return_value=profile)), \
         patch("tools.profile.update_profile.db.update_profile", AsyncMock()) as upd, \
         patch("tools.profile.update_profile.app_today", return_value=TODAY):
        await update_profile("ann", xp_delta=-30, source="flashcards")
    assert _writes(upd)["xp"] == 70   # 100 - 30, not 100 - 60
