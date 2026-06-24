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
    app clock pinned to `today`. Returns the db.update_profile mock."""
    with patch("tools.profile.update_profile.get_profile", new=AsyncMock(return_value=profile)), \
         patch("tools.shared.db.update_profile", new=AsyncMock()) as mock_update, \
         patch("tools.profile.update_profile.app_today", return_value=today):
        from tools.profile.update_profile import update_profile
        await update_profile("stu-001", **kwargs)
    return mock_update


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
    profile = _profile(last_checkin_date="2026-05-04", last_active="2026-05-01", streak=4)
    mock_update = await _run(profile, TUE, checkin_done=True)
    assert _main_update_kwargs(mock_update)["streak"] == 5


@pytest.mark.asyncio
async def test_update_profile_keeps_streak_over_weekend():
    # Checked in Friday, checking in Monday — the weekend is a rest period, so the
    # streak continues (no freeze needed).
    profile = _profile(last_checkin_date="2026-05-08", last_active="2026-05-08", streak=6)
    mock_update = await _run(profile, NEXT_MON, checkin_done=True)
    assert _main_update_kwargs(mock_update)["streak"] == 7


@pytest.mark.asyncio
async def test_update_profile_freeze_bridges_one_missed_weekday():
    # Missed Tuesday but a freeze is banked -> streak survives and the freeze is spent.
    profile = _profile(last_checkin_date="2026-05-04", streak=6, streak_freezes=1)
    mock_update = await _run(profile, WED, checkin_done=True)
    assert _main_update_kwargs(mock_update)["streak"] == 7
    assert _streak_cols_kwargs(mock_update)["streak_freezes"] == 0


@pytest.mark.asyncio
async def test_update_profile_resets_streak_after_two_missed_weekdays():
    # Mon -> Thu: Tue and Wed missed, no freeze can bridge two -> reset to 1 (today counts).
    profile = _profile(last_checkin_date="2026-05-04", last_active="2026-05-06", streak=10)
    mock_update = await _run(profile, THU, checkin_done=True)
    assert _main_update_kwargs(mock_update)["streak"] == 1


@pytest.mark.asyncio
async def test_update_profile_starts_streak_on_first_checkin():
    profile = _profile(last_checkin_date=None, last_active="2026-05-01", streak=0)
    mock_update = await _run(profile, MON, checkin_done=True)
    assert _main_update_kwargs(mock_update)["streak"] == 1


@pytest.mark.asyncio
async def test_update_profile_records_best_streak_and_history():
    profile = _profile(last_checkin_date="2026-05-04", streak=6, best_streak=6, checkin_history=["2026-05-04"])
    mock_update = await _run(profile, TUE, checkin_done=True)
    cols = _streak_cols_kwargs(mock_update)
    assert cols["best_streak"] == 7
    assert "2026-05-05" in cols["checkin_history"]


@pytest.mark.asyncio
async def test_update_profile_does_not_double_increment_same_day():
    profile = _profile(last_checkin_date="2026-05-04", last_active="2026-05-04", streak=4)
    mock_update = await _run(profile, MON, checkin_done=True)
    assert _main_update_kwargs(mock_update)["streak"] == 4


@pytest.mark.asyncio
async def test_update_profile_updates_retention_scores():
    profile = _profile(retention_scores={"glaucoma": 0.8})
    mock_update = await _run(profile, TUE, topic="retina", score=0.5)
    scores = _main_update_kwargs(mock_update)["retention_scores"]
    assert scores["retina"] == 0.5
    assert scores["glaucoma"] == 0.8


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
async def test_update_profile_noop_on_sheet_error():
    with patch("tools.profile.update_profile.get_profile", new=AsyncMock(side_effect=RuntimeError("db error"))):
        from tools.profile.update_profile import update_profile
        await update_profile("stu-001")  # must not raise
