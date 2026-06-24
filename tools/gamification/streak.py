"""Streak engine — pure, testable logic. No I/O.

The streak counts consecutive *weekday* (Mon-Fri) check-ins. Weekends are rest
days: missing Sat/Sun never breaks the streak. A single missed weekday is bridged
by a banked freeze; a second missed weekday (or one with no freeze) resets it.
Reaching every 5th weekday banks one freeze (capped at one).

All functions take dates explicitly so they're deterministic; call sites supply
`today` from `tools.shared.clock.app_today()` (Singapore time).
"""
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


def streak_alive(last_checkin: date | None, today: date, freezes: int) -> bool:
    """Whether the running streak is still continuable as of `today`, *before*
    today's check-in. Used at read time to decide whether to show or zero it."""
    if last_checkin is None or today <= last_checkin:
        return True
    tolerance = 1 if int(freezes or 0) > 0 else 0
    return missed_weekdays(last_checkin, today) <= tolerance


def current_week_states(today: date, history) -> list[dict]:
    """Seven cells (Mon..Sun) for the week containing `today`, each
    {day, date, state} with state in done | today | missed | upcoming | rest."""
    done = set(history or [])
    monday = today - timedelta(days=today.weekday())
    cells: list[dict] = []
    for i in range(7):
        d = monday + timedelta(days=i)
        iso = d.isoformat()
        is_weekend = d.weekday() >= 5
        if is_weekend:
            state = "rest-done" if iso in done else "rest"
        elif iso in done:
            state = "done"
        elif d == today:
            state = "today"
        elif d < today:
            state = "missed"
        else:
            state = "upcoming"
        cells.append({"day": _DAY_NAMES[i], "date": iso, "state": state})
    return cells


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
