"""The week-boundary race: xp_week is ignored at the boundary, not cleared, so the outgoing
week's final score must be sealed before the next earn overwrites it."""
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest

from tools.gamification.leaderboard import weekly_tally

THIS_WEEK = date(2026, 8, 3)   # Monday
LAST_WEEK = date(2026, 7, 27)  # the Monday before


def test_weekly_tally_still_discards_a_stale_stamp():
    """Guard the existing behaviour we are building on top of."""
    assert weekly_tally(5000, LAST_WEEK.isoformat(), THIS_WEEK, 50) == 50
    assert weekly_tally(5000, THIS_WEEK.isoformat(), THIS_WEEK, 50) == 5050


@pytest.mark.asyncio
@patch("tools.shared.db.seal_week_score", new_callable=AsyncMock)
async def test_earning_on_monday_seals_last_weeks_score_first(mock_seal):
    from tools.profile.update_profile import seal_outgoing_week
    await seal_outgoing_week(
        {"student_id": "u1", "xp_week": 5000,
         "xp_week_start": LAST_WEEK.isoformat(), "division": 3},
        THIS_WEEK,
    )
    mock_seal.assert_awaited_once_with("u1", LAST_WEEK.isoformat(), 3, 5000)


@pytest.mark.asyncio
@patch("tools.shared.db.seal_week_score", new_callable=AsyncMock)
async def test_no_seal_within_the_same_week(mock_seal):
    from tools.profile.update_profile import seal_outgoing_week
    await seal_outgoing_week(
        {"student_id": "u1", "xp_week": 300,
         "xp_week_start": THIS_WEEK.isoformat(), "division": 1},
        THIS_WEEK,
    )
    mock_seal.assert_not_awaited()


@pytest.mark.asyncio
@patch("tools.shared.db.seal_week_score", new_callable=AsyncMock)
async def test_no_seal_for_a_zero_score_or_a_missing_stamp(mock_seal):
    from tools.profile.update_profile import seal_outgoing_week
    await seal_outgoing_week(
        {"student_id": "u1", "xp_week": 0, "xp_week_start": LAST_WEEK.isoformat()}, THIS_WEEK)
    await seal_outgoing_week({"student_id": "u1", "xp_week": 900}, THIS_WEEK)
    mock_seal.assert_not_awaited()
