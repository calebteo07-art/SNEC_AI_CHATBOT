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


@pytest.mark.asyncio
@patch("tools.shared.db.release_seal", new_callable=AsyncMock)
@patch("tools.shared.db.upsert_league_week", new_callable=AsyncMock, side_effect=RuntimeError("boom"))
@patch("tools.shared.db.get_league_week_all", new_callable=AsyncMock, return_value=SEALED)
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=True)
async def test_rollover_releases_the_seal_when_the_write_fails(seal, getall, upsert, release):
    """A transient write failure must not leave the week permanently sealed-but-empty: the
    seal has to come back off so the next board read retries the whole rollover instead of
    finding the week already "closed" with no outcomes ever written."""
    from tools.gamification.league_rollover import run_rollover
    await run_rollover(PROFILES, LAST_WEEK)
    release.assert_awaited_once_with(f"week:{LAST_WEEK.isoformat()}")


@pytest.mark.asyncio
@patch("tools.shared.db.release_seal", new_callable=AsyncMock)
@patch("tools.shared.db.update_profile", new_callable=AsyncMock)
@patch("tools.shared.db.upsert_league_week", new_callable=AsyncMock)
@patch("tools.shared.db.get_league_week_all", new_callable=AsyncMock, return_value=SEALED)
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=True)
async def test_rollover_success_does_not_release_the_seal(seal, getall, upsert, upd, release):
    """A legitimately closed week must stay closed — releasing it on success would let a
    second caller re-run the rollover and double-write (or double-promote) the cohort."""
    from tools.gamification.league_rollover import run_rollover
    did = await run_rollover(PROFILES, LAST_WEEK)
    assert did is True
    release.assert_not_awaited()


@pytest.mark.asyncio
@patch("tools.gamification.league_rollover.log")
@patch("tools.shared.db.release_seal", new_callable=AsyncMock)
@patch("tools.shared.db.upsert_league_week", new_callable=AsyncMock, side_effect=RuntimeError("boom"))
@patch("tools.shared.db.get_league_week_all", new_callable=AsyncMock, return_value=SEALED)
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=True)
async def test_rollover_failure_returns_false_and_is_logged_not_raised(seal, getall, upsert, release, log):
    """The caller is a fire-and-forget BackgroundTask with no way to usefully handle an
    exception, so a failed rollover must resolve to False rather than raise. But it still
    has to leave a trace — otherwise a real outage looks identical to the ordinary
    'someone else already holds the seal' case, and nobody would ever notice the retries
    are failing every time."""
    from tools.gamification.league_rollover import run_rollover
    did = await run_rollover(PROFILES, LAST_WEEK)
    assert did is False
    log.assert_called_once_with("league_rollover_error", feature="gamification", detail="boom")


# A division bigger than league.POOL_MAX (30) — migration 016 defaults everyone to
# division 1, so this is not a hypothetical, it is the whole cohort on day one.
BIG_DIVISION = [
    {"student_id": f"s{i:02d}", "division": 1, "xp_week": 1000 - i,
     "xp_week_start": LAST_WEEK.isoformat()}
    for i in range(35)
]


@pytest.mark.asyncio
@patch("tools.shared.db.insert_audit_event", new_callable=AsyncMock)   # the tripwire fires here
@patch("tools.shared.db.update_profile", new_callable=AsyncMock)
@patch("tools.shared.db.upsert_league_week", new_callable=AsyncMock)
@patch("tools.shared.db.get_league_week_all", new_callable=AsyncMock, return_value=[])
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=True)
async def test_a_division_over_pool_max_is_still_ranked_as_one_pool(seal, getall, upsert, upd, audit):
    """35 > POOL_MAX (30). Under the old split_pools behaviour this division would break
    into two hash-bucketed sub-pools, each producing its own rank 1 — while the live board
    (which never splits) kept showing all 35 as one race. That divergence is exactly what
    dropping the split removes: one division must close as one ranked list, 1..35, with
    nobody sharing a rank."""
    from tools.gamification.league_rollover import run_rollover
    did = await run_rollover(BIG_DIVISION, LAST_WEEK)
    assert did is True
    rows = {r["student_id"]: r for r in upsert.await_args.args[0]}
    assert len(rows) == 35
    ranks = sorted(r["rank_final"] for r in rows.values())
    assert ranks == list(range(1, 36))                                  # one contiguous ladder
    assert sum(1 for r in rows.values() if r["rank_final"] == 1) == 1   # exactly one #1


@pytest.mark.asyncio
@patch("tools.shared.db.insert_audit_event", new_callable=AsyncMock)
@patch("tools.shared.db.update_profile", new_callable=AsyncMock)
@patch("tools.shared.db.upsert_league_week", new_callable=AsyncMock)
@patch("tools.shared.db.get_league_week_all", new_callable=AsyncMock, return_value=[])
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=True)
async def test_an_oversized_division_trips_the_audit_tripwire(seal, getall, upsert, upd, audit):
    """A documented threshold nobody is watching is how this bug shipped in the first
    place — an oversized division must leave a trace, so it surfaces before a student
    notices their rank stopped meaning anything.

    It has to be the DURABLE trace: audit_log.log() writes .tmp/audit_log.jsonl, which no
    reader on this app ever opens and which Render's ephemeral disk throws away on every
    restart. audit_events is the table GET /api/admin/audit actually serves."""
    from tools.gamification.league_rollover import run_rollover
    did = await run_rollover(BIG_DIVISION, LAST_WEEK)
    assert did is True
    audit.assert_awaited_once_with(
        action="league_pool_max_exceeded", feature="gamification",
        detail="division 1 has 35 members (max 30)",
    )


@pytest.mark.asyncio
@patch("tools.shared.db.insert_audit_event", new_callable=AsyncMock)
@patch("tools.shared.db.update_profile", new_callable=AsyncMock)
@patch("tools.shared.db.upsert_league_week", new_callable=AsyncMock)
@patch("tools.shared.db.get_league_week_all", new_callable=AsyncMock, return_value=SEALED)
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=True)
async def test_a_normal_division_does_not_trip_the_tripwire(seal, getall, upsert, upd, audit):
    """The common case (a division at or under POOL_MAX) must stay silent — the tripwire
    is for the exceptional case only, not noise on every rollover."""
    from tools.gamification.league_rollover import run_rollover
    did = await run_rollover(PROFILES, LAST_WEEK)
    assert did is True
    audit.assert_not_awaited()


@pytest.mark.asyncio
@patch("tools.shared.db.release_seal", new_callable=AsyncMock)
@patch("tools.shared.db.insert_audit_event", new_callable=AsyncMock,
       side_effect=RuntimeError("audit table missing"))
@patch("tools.shared.db.update_profile", new_callable=AsyncMock)
@patch("tools.shared.db.upsert_league_week", new_callable=AsyncMock)
@patch("tools.shared.db.get_league_week_all", new_callable=AsyncMock, return_value=[])
@patch("tools.shared.db.take_seal", new_callable=AsyncMock, return_value=True)
async def test_a_failing_tripwire_write_never_aborts_the_rollover(
    seal, getall, upsert, upd, audit, release,
):
    """The tripwire is an observer. It fires from inside the try/except that releases the
    seal, so an unguarded raise here would turn "this division is a bit big" into "the week
    never closed and nobody was promoted" — the watcher breaking the thing it watches."""
    from tools.gamification.league_rollover import run_rollover
    did = await run_rollover(BIG_DIVISION, LAST_WEEK)
    assert did is True
    upsert.assert_awaited_once()
    assert len(upsert.await_args.args[0]) == 35   # the whole division still closed
    release.assert_not_awaited()
