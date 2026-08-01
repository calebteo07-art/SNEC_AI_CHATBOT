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


PROFILES = [
    # sealed by the earn path (already earning in the new week)
    {"student_id": "a", "division": 2, "xp_week": 40, "xp_week_start": THIS_WEEK.isoformat()},
    # still carrying the old stamp — the sweep must read these directly
    {"student_id": "b", "division": 2, "xp_week": 800, "xp_week_start": LAST_WEEK.isoformat()},
    {"student_id": "c", "division": 2, "xp_week": 600, "xp_week_start": LAST_WEEK.isoformat()},
    {"student_id": "d", "division": 2, "xp_week": 400, "xp_week_start": LAST_WEEK.isoformat()},
    {"student_id": "e", "division": 2, "xp_week": 200, "xp_week_start": LAST_WEEK.isoformat()},
    # hidden: must not rank and must not consume a promotion slot
    {"student_id": "h", "division": 2, "xp_week": 9999,
     "xp_week_start": LAST_WEEK.isoformat(), "leaderboard_hidden": True},
]
SEALED = [{"student_id": "a", "week_start": LAST_WEEK.isoformat(),
           "division": 2, "xp_final": 900}]


@pytest.mark.asyncio
@patch("tools.shared.db.update_profile", new_callable=AsyncMock)
@patch("tools.shared.db.upsert_league_week", new_callable=AsyncMock)
@patch("tools.shared.db.get_league_week_all", new_callable=AsyncMock, return_value=SEALED)
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=True)
async def test_rollover_merges_sealed_and_swept_scores(seal, getall, upsert, upd):
    from tools.gamification.league_rollover import run_rollover
    did = await run_rollover(PROFILES, LAST_WEEK)
    assert did is True
    rows = {r["student_id"]: r for r in upsert.await_args.args[0]}
    # 'a' comes from the sealed row (900), not from its reset live column (40)
    assert rows["a"]["xp_final"] == 900
    assert rows["a"]["rank_final"] == 1
    assert rows["b"]["rank_final"] == 2
    assert "h" not in rows                                   # hidden never ranks
    assert rows["a"]["outcome"] == "promoted"
    promoted = [sid for sid, r in rows.items() if r["outcome"] == "promoted"]
    assert len(promoted) == 3                                # pool of 5 -> 3 promote


@pytest.mark.asyncio
@patch("tools.shared.db.update_profile", new_callable=AsyncMock)
@patch("tools.shared.db.upsert_league_week", new_callable=AsyncMock)
@patch("tools.shared.db.get_league_week_all", new_callable=AsyncMock, return_value=SEALED)
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=True)
async def test_rollover_bumps_division_only_for_the_promoted(seal, getall, upsert, upd):
    from tools.gamification.league_rollover import run_rollover
    await run_rollover(PROFILES, LAST_WEEK)
    bumped = {c.args[0]: c.kwargs.get("division") for c in upd.await_args_list}
    assert bumped == {"a": 3, "b": 3, "c": 3}                # exactly the promoted three


@pytest.mark.asyncio
@patch("tools.shared.db.upsert_league_week", new_callable=AsyncMock)
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=False)
async def test_rollover_is_a_noop_when_another_worker_holds_the_seal(seal, upsert):
    """Idempotency is the headline: a second caller must write nothing at all."""
    from tools.gamification.league_rollover import run_rollover
    assert await run_rollover(PROFILES, LAST_WEEK) is False
    upsert.assert_not_awaited()
