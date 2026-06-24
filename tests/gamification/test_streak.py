"""Streak engine — weekday rest days + 1 auto-freeze.

The streak counts consecutive *weekday* (Mon-Fri) check-ins. Weekends are rest
days: not checking in on Sat/Sun never breaks the streak. A single missed weekday
is bridged by a banked freeze; two missed weekdays (or one with no freeze) resets.
"""
from datetime import date

from tools.gamification.streak import (
    advance_streak,
    current_week_states,
    is_weekday,
    missed_weekdays,
    streak_alive,
    tier_for,
)

# Reference dates (May 2026): 4th = Mon ... 8th = Fri, 9th = Sat, 10th = Sun, 11th = Mon
MON = date(2026, 5, 4)
TUE = date(2026, 5, 5)
WED = date(2026, 5, 6)
THU = date(2026, 5, 7)
FRI = date(2026, 5, 8)
SAT = date(2026, 5, 9)
SUN = date(2026, 5, 10)
NEXT_MON = date(2026, 5, 11)
NEXT_TUE = date(2026, 5, 12)


# ── primitives ──────────────────────────────────────────────────────────────

def test_is_weekday():
    assert is_weekday(FRI) is True
    assert is_weekday(SAT) is False
    assert is_weekday(SUN) is False
    assert is_weekday(NEXT_MON) is True


def test_missed_weekdays_consecutive_days():
    assert missed_weekdays(MON, TUE) == 0


def test_missed_weekdays_skips_weekend():
    # Fri -> Mon: only Sat/Sun in between, which are not weekdays -> 0 missed.
    assert missed_weekdays(FRI, NEXT_MON) == 0


def test_missed_weekdays_one_gap():
    # Mon -> Wed: Tuesday missed.
    assert missed_weekdays(MON, WED) == 1


def test_missed_weekdays_friday_to_tuesday():
    # Fri -> Tue: Monday missed (Sat/Sun don't count).
    assert missed_weekdays(FRI, NEXT_TUE) == 1


def test_missed_weekdays_full_week_gap():
    # Fri -> next Fri: Mon,Tue,Wed,Thu missed.
    assert missed_weekdays(FRI, date(2026, 5, 15)) == 4


# ── advance_streak ──────────────────────────────────────────────────────────

def test_first_checkin_starts_at_one():
    r = advance_streak(None, MON, streak=0, freezes=0)
    assert r["streak"] == 1
    assert r["froze"] is False
    assert r["reset"] is False


def test_consecutive_weekday_increments():
    r = advance_streak(MON, TUE, streak=4, freezes=0)
    assert r["streak"] == 5


def test_weekend_gap_keeps_streak():
    # Checked in Friday, next check-in Monday -> weekend doesn't break it.
    r = advance_streak(FRI, NEXT_MON, streak=6, freezes=0)
    assert r["streak"] == 7
    assert r["froze"] is False


def test_same_day_no_double_count():
    r = advance_streak(MON, MON, streak=4, freezes=1)
    assert r["streak"] == 4
    assert r["changed"] is False


def test_one_missed_weekday_with_freeze_survives():
    # Missed Tuesday, but a freeze is banked -> bridged, streak continues.
    r = advance_streak(MON, WED, streak=6, freezes=1)
    assert r["streak"] == 7
    assert r["froze"] is True
    assert r["freezes"] == 0
    assert r["reset"] is False


def test_one_missed_weekday_without_freeze_resets():
    r = advance_streak(MON, WED, streak=6, freezes=0)
    assert r["streak"] == 1
    assert r["reset"] is True
    assert r["froze"] is False


def test_two_missed_weekdays_resets_even_with_freeze():
    # Mon -> Thu: Tue and Wed missed. A single freeze can't bridge two.
    r = advance_streak(MON, THU, streak=9, freezes=1)
    assert r["streak"] == 1
    assert r["reset"] is True
    assert r["freezes"] == 1  # freeze not spent on an unbridgeable gap


def test_freeze_granted_at_fifth_weekday():
    # Reaching a multiple of 5 banks a freeze (capped at 1).
    r = advance_streak(THU, FRI, streak=4, freezes=0)
    assert r["streak"] == 5
    assert r["freezes"] == 1


def test_freeze_capped_at_one():
    r = advance_streak(THU, FRI, streak=9, freezes=1)
    assert r["streak"] == 10
    assert r["freezes"] == 1  # already at cap, stays 1


def test_backwards_clock_is_noop():
    r = advance_streak(WED, MON, streak=3, freezes=0)
    assert r["changed"] is False
    assert r["streak"] == 3


# ── streak_alive (read-time, before today's check-in) ───────────────────────

def test_alive_over_weekend():
    # Friday check-in, today is Monday, not yet checked in -> still alive.
    assert streak_alive(FRI, NEXT_MON, freezes=0) is True


def test_alive_one_missed_with_freeze():
    assert streak_alive(MON, WED, freezes=1) is True


def test_dead_one_missed_without_freeze():
    assert streak_alive(MON, WED, freezes=0) is False


def test_dead_two_missed():
    assert streak_alive(MON, THU, freezes=1) is False


def test_alive_same_day():
    assert streak_alive(MON, MON, freezes=0) is True


# ── current_week_states ─────────────────────────────────────────────────────

def test_week_states_marks_done_today_rest():
    # Today is Wednesday; Mon and Tue were checked in.
    history = [MON.isoformat(), TUE.isoformat()]
    cells = current_week_states(WED, history)
    assert len(cells) == 7
    by_day = {c["day"]: c["state"] for c in cells}
    assert by_day["Mon"] == "done"
    assert by_day["Tue"] == "done"
    assert by_day["Wed"] == "today"
    assert by_day["Thu"] == "upcoming"
    assert by_day["Fri"] == "upcoming"
    assert by_day["Sat"] == "rest"
    assert by_day["Sun"] == "rest"


def test_week_states_marks_missed_weekday():
    # Today is Thursday; only Mon checked in -> Tue/Wed are missed.
    history = [MON.isoformat()]
    by_day = {c["day"]: c["state"] for c in current_week_states(THU, history)}
    assert by_day["Mon"] == "done"
    assert by_day["Tue"] == "missed"
    assert by_day["Wed"] == "missed"
    assert by_day["Thu"] == "today"


# ── tier_for ────────────────────────────────────────────────────────────────

def test_tier_progression():
    assert tier_for(0)["next"] == "First Light"
    assert tier_for(12)["tier"] == "20/20 Vision"
    assert tier_for(12)["next"] == "Eagle Eye"
    assert tier_for(12)["to_next"] == 8


def test_tier_top():
    top = tier_for(60)
    assert top["tier"] == "Visionary"
    assert top["next"] is None
    assert top["to_next"] == 0
