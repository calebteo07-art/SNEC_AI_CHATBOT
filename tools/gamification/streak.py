"""Streak engine — pure, testable logic. No I/O.

The streak counts consecutive *weekday* (Mon-Fri) check-ins. Weekends are rest
days: missing Sat/Sun never breaks the streak. A single missed weekday is bridged
by a banked freeze; a second missed weekday (or one with no freeze) resets it.
Reaching every 5th weekday banks one freeze (capped at one).

All functions take dates explicitly so they're deterministic; call sites supply
`today` from `tools.shared.clock.app_today()` (Singapore time).
"""
from calendar import monthrange
from datetime import date, timedelta

FREEZE_CAP = 1          # at most one freeze banked at a time
FREEZE_EVERY = 5        # grant a freeze each time the streak hits a multiple of 5

# Eye-themed tier ladder — (weekday threshold, name), ascending.
TIERS: list[tuple[int, str]] = [
    (3, "First Light"),
    (5, "Clear View"),
    (10, "20/20 Vision"),
    (20, "Eagle Eye"),
    (30, "Hawkeye"),
    (50, "Visionary"),
]

_DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def is_weekday(d: date) -> bool:
    """True for Mon-Fri (Python weekday 0-4)."""
    return d.weekday() < 5


def missed_weekdays(last: date | None, today: date) -> int:
    """Count Mon-Fri dates strictly between `last` and `today` — the weekday
    check-in opportunities that were skipped. Weekends never count."""
    if last is None or today <= last:
        return 0
    count = 0
    d = last + timedelta(days=1)
    while d < today:
        if d.weekday() < 5:
            count += 1
        d += timedelta(days=1)
    return count


def advance_streak(
    last_checkin: date | None,
    today: date,
    streak: int,
    freezes: int,
) -> dict:
    """Compute the new streak state when a check-in completes on `today`.

    Returns: {streak, freezes, froze, reset, changed}.
    """
    streak = max(0, int(streak or 0))
    freezes = max(0, int(freezes or 0))

    # Already counted today, or a backwards clock — no change.
    if last_checkin is not None and today <= last_checkin:
        return {"streak": streak, "freezes": freezes, "froze": False, "reset": False, "changed": False}

    froze = False
    reset = False

    if last_checkin is None:
        new_streak = 1
    else:
        missed = missed_weekdays(last_checkin, today)
        if missed == 0:
            new_streak = streak + 1
        elif missed == 1 and freezes > 0:
            new_streak = streak + 1
            freezes -= 1
            froze = True
        else:
            new_streak = 1
            reset = True

    # Bank a freeze at each 5-weekday milestone (capped).
    if new_streak > 0 and new_streak % FREEZE_EVERY == 0:
        freezes = min(FREEZE_CAP, freezes + 1)

    return {"streak": new_streak, "freezes": freezes, "froze": froze, "reset": reset, "changed": True}


def _parse_iso(value) -> date | None:
    """Best-effort ISO-date parse; None for junk so a bad history entry can't crash
    a reconstruction."""
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except (ValueError, TypeError):
        return None


def streak_state_from_history(history, today: date | None = None) -> dict:
    """Reconstruct the streak by replaying `advance_streak` over the sorted, unique
    check-in dates in `history` (the durable log written on every check-in). Returns
    {streak, freezes, best, last_checkin, done_today} — the state AS OF the last
    recorded check-in (NOT display-zeroed for lapsing; `resolve_streak` applies that).
    `checkin_history` is the streak's real source of truth: the incremental `streak`
    column is only a cache, and when it failed to persist (the missing
    last_checkin_date column) this recovers the count from the log. `today` only
    decides `done_today`. Pure — no I/O."""
    dates = sorted({d for d in (_parse_iso(x) for x in (history or [])) if d is not None})
    streak = freezes = best = 0
    last: date | None = None
    for d in dates:
        r = advance_streak(last, d, streak, freezes)
        streak, freezes = r["streak"], r["freezes"]
        best = max(best, streak)
        last = d
    done_today = today is not None and today in dates
    return {"streak": streak, "freezes": freezes, "best": best,
            "last_checkin": last, "done_today": done_today}


def resolve_streak(stored_streak, stored_freezes, history, today: date) -> dict:
    """The streak to DISPLAY. Trust the stored `streak` column when it persisted
    (>0, and it grows past the capped history); otherwise heal the count from
    `checkin_history` — the last_checkin_date bug meant the column never saved, so a
    real streak read back as 0. A lapsed streak is shown as zero. Returns
    {current, freezes, done_today, last_checkin}. Pure — no I/O."""
    recon = streak_state_from_history(history, today)
    stored = max(0, int(stored_streak or 0))
    freezes = max(0, int(stored_freezes or 0)) or recon["freezes"]
    current = stored if stored > 0 else recon["streak"]
    last = recon["last_checkin"]
    if current > 0 and last is not None and not streak_alive(last, today, freezes):
        current = 0
    return {"current": current, "freezes": freezes,
            "done_today": recon["done_today"], "last_checkin": last}


def streak_alive(last_checkin: date | None, today: date, freezes: int) -> bool:
    """Whether the running streak is still continuable as of `today`, *before*
    today's check-in. Used at read time to decide whether to show or zero it."""
    if last_checkin is None or today <= last_checkin:
        return True
    tolerance = 1 if int(freezes or 0) > 0 else 0
    return missed_weekdays(last_checkin, today) <= tolerance


def _day_state(d: date, today: date, done: set) -> str:
    """One calendar day's state: done | today | missed | upcoming | rest | rest-done.
    The single rule behind BOTH the week strip and the month calendar — they must
    never disagree about a day they share."""
    iso = d.isoformat()
    if d.weekday() >= 5:
        return "rest-done" if iso in done else "rest"
    if iso in done:
        return "done"
    if d == today:
        return "today"
    return "missed" if d < today else "upcoming"


def _cell(d: date, today: date, done: set) -> dict:
    return {"day": _DAY_NAMES[d.weekday()], "date": d.isoformat(),
            "state": _day_state(d, today, done)}


def current_week_states(today: date, history) -> list[dict]:
    """Seven cells (Mon..Sun) for the week containing `today`, each
    {day, date, state} with state in done | today | missed | upcoming | rest."""
    done = set(history or [])
    monday = today - timedelta(days=today.weekday())
    return [_cell(monday + timedelta(days=i), today, done) for i in range(7)]


def current_month_states(today: date, history) -> list[dict]:
    """One cell per day of the calendar month containing `today`, 1st → last, each
    {day, date, state}. Feeds the Home streak card's month calendar; the grid derives
    its leading blank offset from the first cell's `day` NAME (never by re-parsing the
    ISO date client-side, which would reintroduce a UTC/SGT off-by-one)."""
    done = set(history or [])
    days = monthrange(today.year, today.month)[1]
    first = today.replace(day=1)
    return [_cell(first + timedelta(days=i), today, done) for i in range(days)]


def tier_for(streak: int) -> dict:
    """Current tier name, next tier name (or None at the top), and weekdays to it."""
    streak = max(0, int(streak or 0))
    current: str | None = None
    nxt: tuple[int, str] | None = None
    for threshold, name in TIERS:
        if streak >= threshold:
            current = name
        elif nxt is None:
            nxt = (threshold, name)
    if nxt is None:
        return {"tier": current or "Getting started", "next": None, "to_next": 0}
    return {"tier": current or "Getting started", "next": nxt[1], "to_next": nxt[0] - streak}
