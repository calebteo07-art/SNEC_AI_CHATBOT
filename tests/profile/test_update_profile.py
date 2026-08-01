import asyncio
import pytest
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch


def _profile(**kwargs):
    defaults = {
        "student_id": "stu-001",
        "weak_topics": [],
        "missed_findings": [],
        "retention_scores": {},
        "session_count": 2,
        "streak": 1,
        "last_active": "2026-05-04",
        "learning_velocity": "stable",
        "checkin_done_today": False,
        "streak_freezes": 0,
        "best_streak": 0,
        "checkin_history": [],
    }
    defaults.update(kwargs)
    return defaults


def _main_update_kwargs(mock_update):
    """Return the kwargs of the main profile-update db call.

    update_profile() persists the session fields in one db.update_profile call
    (session_count, retention_scores, weak_topics, missed_findings, and — on a
    check-in — streak), then makes separate trailing db.update_profile calls for
    the new streak columns and the daily hearts reset. Locate the call that
    actually persists the session fields.
    """
    for call in mock_update.call_args_list:
        if "session_count" in call.kwargs:
            return call.kwargs
    raise AssertionError("db.update_profile was never called with the session fields")


def _streak_cols_kwargs(mock_update):
    """Return the kwargs of the separate streak-columns db call (freezes/best/history)."""
    for call in mock_update.call_args_list:
        if "streak_freezes" in call.kwargs:
            return call.kwargs
    raise AssertionError("db.update_profile was never called with the streak columns")


async def _run(profile, today, **kwargs):
    """Invoke update_profile with get_profile + db.update_profile mocked and the
    app clock pinned to `today` (and the weekly boundary to that week's Monday).
    Returns the db.update_profile mock (with the seal_week_score mock attached at
    .seal_week_score, for the one test that crosses a week boundary and checks it)."""
    week_start = today - timedelta(days=today.weekday())  # Monday of `today`'s week
    # The earn path now seals the outgoing week's score (seal_outgoing_week, called from
    # update_profile) before weekly_tally discards it, so any test here that crosses a
    # Monday boundary with a non-zero xp_week reaches db.seal_week_score too — stub it or
    # it trips the global _forbid_real_supabase guard.
    with patch("tools.profile.update_profile.get_profile", new=AsyncMock(return_value=profile)), \
         patch("tools.shared.db.update_profile", new=AsyncMock()) as mock_update, \
         patch("tools.shared.db.seal_week_score", new=AsyncMock()) as mock_seal, \
         patch("tools.profile.update_profile.app_today", return_value=today), \
         patch("tools.profile.update_profile.app_week_start", return_value=week_start):
        from tools.profile.update_profile import update_profile
        await update_profile("stu-001", **kwargs)
    mock_update.seal_week_score = mock_seal
    return mock_update


def _xp_week_kwargs(mock_update):
    """Return the kwargs of the separate xp_week (weekly-leaderboard tally) db call."""
    for call in mock_update.call_args_list:
        if "xp_week" in call.kwargs:
            return call.kwargs
    raise AssertionError("db.update_profile was never called with xp_week")


def _xp_kwargs(mock_update):
    """Return the kwargs of the xp/hearts db call (the currency write)."""
    for call in mock_update.call_args_list:
        if "xp" in call.kwargs:
            return call.kwargs
    raise AssertionError("db.update_profile was never called with the xp field")


def _coins_kwargs(mock_update):
    """Return the kwargs of the lifetime coins_earned db call."""
    for call in mock_update.call_args_list:
        if "coins_earned" in call.kwargs:
            return call.kwargs
    raise AssertionError("db.update_profile was never called with coins_earned")


# Reference weekdays: 2026-05-04 Mon ... 08 Fri, 09 Sat, 10 Sun, 11 Mon
MON = date(2026, 5, 4)
TUE = date(2026, 5, 5)
WED = date(2026, 5, 6)
THU = date(2026, 5, 7)
FRI = date(2026, 5, 8)
NEXT_MON = date(2026, 5, 11)


@pytest.mark.asyncio
async def test_update_profile_increments_session_count():
    mock_update = await _run(_profile(), date(2026, 5, 5))
    assert _main_update_kwargs(mock_update)["session_count"] == 3


@pytest.mark.asyncio
async def test_update_profile_increments_streak_from_yesterday():
    profile = _profile(checkin_history=["2026-05-04"], last_active="2026-05-01", streak=4)
    mock_update = await _run(profile, TUE, checkin_done=True)
    assert _main_update_kwargs(mock_update)["streak"] == 5


@pytest.mark.asyncio
async def test_update_profile_never_writes_phantom_last_checkin_date():
    # Regression for the streak-persistence bug: last_checkin_date is not a real
    # column — writing it in the main batch failed the whole PATCH so the streak
    # never saved. No db write may ever include that key.
    mock_update = await _run(_profile(checkin_history=["2026-05-04"], streak=4), TUE, checkin_done=True)
    for call in mock_update.call_args_list:
        assert "last_checkin_date" not in call.kwargs
    # ...and the streak IS persisted in the same batch as checkin_done_today.
    main = _main_update_kwargs(mock_update)
    assert main["streak"] == 5 and main["checkin_done_today"] is True


@pytest.mark.asyncio
async def test_update_profile_recovers_streak_from_history_when_column_zero():
    # The stored streak column read back as 0 (the persistence bug), but the check-in
    # log kept accruing. Checking in must continue the *recovered* streak, not restart
    # at 1. History = Mon-Fri; today is the next Monday (weekend bridges) -> 6.
    hist = ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08"]
    profile = _profile(checkin_history=hist, streak=0, best_streak=0)
    mock_update = await _run(profile, NEXT_MON, checkin_done=True)
    assert _main_update_kwargs(mock_update)["streak"] == 6


@pytest.mark.asyncio
async def test_update_profile_keeps_streak_over_weekend():
    # Checked in Friday, checking in Monday — the weekend is a rest period, so the
    # streak continues (no freeze needed).
    profile = _profile(checkin_history=["2026-05-08"], last_active="2026-05-08", streak=6)
    mock_update = await _run(profile, NEXT_MON, checkin_done=True)
    assert _main_update_kwargs(mock_update)["streak"] == 7


@pytest.mark.asyncio
async def test_update_profile_freeze_bridges_one_missed_weekday():
    # Missed Tuesday but a freeze is banked -> streak survives and the freeze is spent.
    profile = _profile(checkin_history=["2026-05-04"], streak=6, streak_freezes=1)
    mock_update = await _run(profile, WED, checkin_done=True)
    assert _main_update_kwargs(mock_update)["streak"] == 7
    assert _streak_cols_kwargs(mock_update)["streak_freezes"] == 0


@pytest.mark.asyncio
async def test_update_profile_resets_streak_after_two_missed_weekdays():
    # Mon -> Thu: Tue and Wed missed, no freeze can bridge two -> reset to 1 (today counts).
    profile = _profile(checkin_history=["2026-05-04"], last_active="2026-05-06", streak=10)
    mock_update = await _run(profile, THU, checkin_done=True)
    assert _main_update_kwargs(mock_update)["streak"] == 1


@pytest.mark.asyncio
async def test_update_profile_starts_streak_on_first_checkin():
    profile = _profile(checkin_history=[], last_active="2026-05-01", streak=0)
    mock_update = await _run(profile, MON, checkin_done=True)
    assert _main_update_kwargs(mock_update)["streak"] == 1


@pytest.mark.asyncio
async def test_update_profile_records_best_streak_and_history():
    profile = _profile(streak=6, best_streak=6, checkin_history=["2026-05-04"])
    mock_update = await _run(profile, TUE, checkin_done=True)
    cols = _streak_cols_kwargs(mock_update)
    assert cols["best_streak"] == 7
    assert "2026-05-05" in cols["checkin_history"]


@pytest.mark.asyncio
async def test_update_profile_does_not_double_increment_same_day():
    profile = _profile(checkin_history=["2026-05-04"], last_active="2026-05-04", streak=4)
    mock_update = await _run(profile, MON, checkin_done=True)
    assert _main_update_kwargs(mock_update)["streak"] == 4


# ── Check-in streak bonus (the daily ritual pays out) ───────────────────────
# Regression for the dead-code bug: the +50 sat behind `if xp_delta or hearts_used`,
# so a plain check-in (xp_delta=0) silently awarded nothing.

@pytest.mark.asyncio
async def test_checkin_that_advances_streak_awards_bonus_xp():
    profile = _profile(checkin_history=["2026-05-04"], last_active="2026-05-04", streak=4, xp=100)
    mock_update = await _run(profile, TUE, checkin_done=True)
    assert _xp_kwargs(mock_update)["xp"] == 150          # 100 + 50 check-in bonus


@pytest.mark.asyncio
async def test_checkin_bonus_counts_toward_lifetime_lumens():
    profile = _profile(checkin_history=["2026-05-04"], last_active="2026-05-04", streak=4, xp=100)
    mock_update = await _run(profile, TUE, checkin_done=True)
    assert _coins_kwargs(mock_update)["coins_earned"] == 50   # lifetime rises by the bonus


@pytest.mark.asyncio
async def test_checkin_same_day_awards_no_bonus():
    # Already checked in today -> streak does not advance -> no bonus, no currency write.
    profile = _profile(checkin_history=["2026-05-04"], last_active="2026-05-04", streak=4, xp=100)
    mock_update = await _run(profile, MON, checkin_done=True)
    assert not any("xp" in c.kwargs for c in mock_update.call_args_list)


@pytest.mark.asyncio
async def test_checkin_bonus_stacks_on_an_explicit_xp_delta():
    # A rare path where a check-in also carries xp: bonus adds on top of the delta.
    profile = _profile(checkin_history=["2026-05-04"], last_active="2026-05-04", streak=4, xp=100)
    mock_update = await _run(profile, TUE, checkin_done=True, xp_delta=10)
    assert _xp_kwargs(mock_update)["xp"] == 160          # 100 + 10 + 50


@pytest.mark.asyncio
async def test_update_profile_updates_retention_scores():
    profile = _profile(retention_scores={"glaucoma": 0.8})
    mock_update = await _run(profile, TUE, topic="retina", score=0.5)
    scores = _main_update_kwargs(mock_update)["retention_scores"]
    assert scores["retina"] == 0.5
    assert scores["glaucoma"] == 0.8


# ── retention_scores stays a 0-1 fraction ──────────────────────────────────
# Every consumer reads this column as a fraction (mastery multiplies by 100,
# weak_topics compares against WEAK_THRESHOLD, the cohort/report/progress readers
# average it raw). `score` arrives client-supplied on the /api/gamification/sync
# path, so the bound belongs here — the one write all three callers funnel
# through — not in each reader.

@pytest.mark.asyncio
async def test_update_profile_clamps_a_score_above_one():
    mock_update = await _run(_profile(), TUE, topic="glaucoma", score=100.0)
    assert _main_update_kwargs(mock_update)["retention_scores"]["glaucoma"] == 1.0


@pytest.mark.asyncio
async def test_update_profile_clamps_a_negative_score():
    # A negative score also silently marks the topic weak (s < WEAK_THRESHOLD).
    mock_update = await _run(_profile(), TUE, topic="glaucoma", score=-5.0)
    assert _main_update_kwargs(mock_update)["retention_scores"]["glaucoma"] == 0.0


@pytest.mark.asyncio
async def test_update_profile_clamps_the_score_before_blending():
    # The clamp lands on the incoming score, not on the blended result: clamping
    # afterwards would store a flat 1.0 and erase the 0.8 of stored history.
    profile = _profile(retention_scores={"glaucoma": 0.8})
    mock_update = await _run(profile, TUE, topic="glaucoma", score=100.0)
    assert _main_update_kwargs(mock_update)["retention_scores"]["glaucoma"] == 0.86  # .3*1.0 + .7*0.8


@pytest.mark.asyncio
async def test_update_profile_heals_an_out_of_range_stored_score():
    # A row poisoned before the clamp existed is blended back into range rather
    # than carried forward — bounding only the incoming score would still write
    # 0.3*0.9 + 0.7*30.56 = 21.66 out of a legitimate call.
    profile = _profile(retention_scores={"glaucoma": 30.56})
    mock_update = await _run(profile, TUE, topic="glaucoma", score=0.9)
    assert _main_update_kwargs(mock_update)["retention_scores"]["glaucoma"] == 0.97  # .3*0.9 + .7*1.0


@pytest.mark.asyncio
async def test_update_profile_marks_weak_topics():
    profile = _profile(retention_scores={"glaucoma": 0.8, "retina": 0.4})
    mock_update = await _run(profile, TUE)
    weak = _main_update_kwargs(mock_update)["weak_topics"]
    assert "retina" in weak
    assert "glaucoma" not in weak


@pytest.mark.asyncio
async def test_update_profile_appends_missed_findings():
    profile = _profile(missed_findings=["disc haemorrhage"])
    mock_update = await _run(profile, TUE, new_missed_findings=["RNFL thinning"])
    findings = _main_update_kwargs(mock_update)["missed_findings"]
    assert "disc haemorrhage" in findings
    assert "RNFL thinning" in findings


@pytest.mark.asyncio
async def test_xp_week_accumulates_within_the_week():
    # Already earned 120 this week (start = Monday 05-04); +30 on Wed of the same week -> 150.
    profile = _profile(xp=200, xp_week=120, xp_week_start="2026-05-04", hearts=5)
    kw = _xp_week_kwargs(await _run(profile, WED, xp_delta=30))
    assert kw["xp_week"] == 150
    assert kw["xp_week_start"] == "2026-05-04"


@pytest.mark.asyncio
async def test_xp_week_resets_on_a_new_week():
    # Last week's tally (start 04-27) is stale; the first earn of the new week starts fresh.
    profile = _profile(xp=999, xp_week=800, xp_week_start="2026-04-27", hearts=5)
    mock_update = await _run(profile, NEXT_MON, xp_delta=40)  # NEXT_MON = 2026-05-11 (Mon)
    kw = _xp_week_kwargs(mock_update)
    assert kw["xp_week"] == 40
    assert kw["xp_week_start"] == "2026-05-11"
    # The outgoing week (04-27) still held a non-zero score, so this boundary-crossing earn
    # must seal it before the tally above discards it — the regression this fix closes.
    mock_update.seal_week_score.assert_awaited_once_with("stu-001", "2026-04-27", 1, 800)


@pytest.mark.asyncio
async def test_update_profile_noop_on_sheet_error():
    with patch("tools.profile.update_profile.get_profile", new=AsyncMock(side_effect=RuntimeError("db error"))):
        from tools.profile.update_profile import update_profile
        await update_profile("stu-001")  # must not raise


@pytest.mark.asyncio
async def test_update_profile_dispatches_writes_concurrently():
    """Latency: the independent profile writes touch DISJOINT columns (session /
    xp+hearts / xp_today / xp_week / coins), so they must be gathered — not awaited
    one-after-another. Hot callers (flashcard XP, check-in) otherwise pay N sequential
    Supabase round-trips on the single Render worker. Proven by peak in-flight > 1."""
    profile = _profile(xp=200, xp_week=120, xp_week_start="2026-05-04", hearts=5, coins_earned=0)
    inflight = 0
    peak = 0
    calls: list[dict] = []

    async def _upd(_sid, **k):
        nonlocal inflight, peak
        inflight += 1
        peak = max(peak, inflight)
        calls.append(k)
        await asyncio.sleep(0)  # yield so concurrently-dispatched writes overlap
        inflight -= 1

    week_start = WED - timedelta(days=WED.weekday())
    with patch("tools.profile.update_profile.get_profile", new=AsyncMock(return_value=profile)), \
         patch("tools.shared.db.update_profile", new=_upd), \
         patch("tools.profile.update_profile.app_today", return_value=WED), \
         patch("tools.profile.update_profile.app_week_start", return_value=week_start):
        from tools.profile.update_profile import update_profile
        await update_profile("stu-001", xp_delta=30)

    # xp_delta=30 → main + xp/hearts + xp_today + xp_week + coins = 5 writes.
    assert peak >= 2, f"writes ran sequentially (peak in-flight={peak}); expected them gathered"
    # ...and none were dropped by the refactor.
    cols = set().union(*(set(c) for c in calls))
    assert {"session_count", "xp", "xp_today", "xp_week", "coins_earned"} <= cols
