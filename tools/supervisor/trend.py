"""Cohort performance over time, bucketed on the SGT calendar (spec §7.2).

Pure: no I/O. The endpoint windows and filters the rows; this module owns the calendar
and the arithmetic.

**The day boundary is SGT, not UTC.** P1's activity-trend buckets with `str(ts)[:10]` —
the UTC date — and SNEC is UTC+8, so that starts every "day" at 08:00 SGT. An 8am-to-
midnight teaching day is split across two columns and its evening half is credited to the
day before. A trend is read for its shape, so a systematic half-day shear is worse than a
missing point. `app_today()` in tools/shared/clock.py is the same boundary the streak and
check-in paths already use; this agrees with it rather than inventing a third convention.

**A day with no attempts has no score.** Every metric is None when its denominator is
empty, never 0.0 (D13) — a zero draws a cliff to the floor and reads as a cohort collapse.

**Each metric holds its own denominator.** Grade columns stay NULL on pre-Tier-2 rows
(over half of production today). Such a row is still an attempt and counts in `n`, but it
must not drag an average it has no opinion about.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from tools.shared.clock import SGT

# A daily point below this many days, a weekly rollup above it. 90 daily points in a
# 320px-wide chart is 3.5px each — the line becomes noise and the axis labels collide.
_MAX_DAILY_SPAN = 31


def period_for(days: int) -> str:
    """"day" for a window that reads at daily resolution, "week" beyond it."""
    return "day" if days <= _MAX_DAILY_SPAN else "week"


def sgt_day(ts) -> date | None:
    """The SGT calendar day an ISO timestamp falls on, or None if it is not a timestamp.

    A naive timestamp is read as UTC: Postgres `timestamptz` serialises with an offset,
    and the rows that arrive without one came from a `timestamp` column written by a UTC
    process. Guessing SGT for those would shift them forward eight hours.

    Junk is DROPPED rather than coerced to today — a phantom attempt would land on the
    newest column, which is the one being read.
    """
    if not isinstance(ts, str) or not ts:
        return None
    try:
        # fromisoformat handles the offset forms PostgREST returns; "Z" only lands in
        # 3.11+, and normalising it costs less than depending on that.
        parsed = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(SGT).date()


def window_start_utc(today: date, days: int) -> str:
    """The instant the window opens, in UTC — for a `completed_at >= …` database filter.

    NOT the plain ISO date. SGT midnight is 16:00 UTC the PREVIOUS day, so filtering on
    the date alone drops the first eight hours of the oldest day in the window: the
    morning of the day the chart claims to start renders as empty. The same eight hours
    the bucketing fixes, at the other end of the pipe.
    """
    start = today - timedelta(days=days - 1)
    return datetime.combine(start, time.min, tzinfo=SGT).astimezone(timezone.utc).isoformat()


def _week_start(d: date) -> date:
    """Monday of `d`'s week — the same boundary app_week_start() uses."""
    return d - timedelta(days=d.weekday())


def _bucket_of(d: date, period: str) -> date:
    return _week_start(d) if period == "week" else d


def _rate(hits: int, total: int) -> float | None:
    return round(100.0 * hits / total, 1) if total else None


def build_points(rows: list[dict], *, days: int, today: date, period: str) -> list[dict]:
    """One point per bucket across the whole window, oldest first.

    Args:
        rows: case attempts, each `{completed_at, score_100, passed, safe}`. Already
            filtered to the population and discipline the caller is reporting on.
        days: window length in days, inclusive of `today`.
        today: the SGT date the window ends on.
        period: "day" or "week" (see `period_for`).

    Every bucket in the range is emitted even when empty, so a sparse series still renders
    as a continuous axis — dropping empty days would space three attempts evenly and hide
    a two-week gap.

    Retakes count once EACH, on the day they happened. This is a deliberate divergence
    from D9 (best score_100 per student+case), which is right for a standing mastery
    figure and wrong for a time series: collapsing five attempts to their best moves a
    score to a day it was not earned and erases the improvement curve, which is the only
    thing this chart exists to show.
    """
    start = today - timedelta(days=days - 1)
    buckets: dict[date, list[dict]] = {}
    cursor = _bucket_of(start, period)
    while cursor <= today:
        buckets[cursor] = []
        cursor += timedelta(days=7 if period == "week" else 1)

    for row in rows:
        day = sgt_day(row.get("completed_at"))
        if day is None or day < start or day > today:
            continue
        key = _bucket_of(day, period)
        if key in buckets:
            buckets[key].append(row)

    points = []
    for key in sorted(buckets):
        group = buckets[key]
        scores = [float(r["score_100"]) for r in group if r.get("score_100") is not None]
        graded = [r for r in group if r.get("passed") is not None]
        judged = [r for r in group if r.get("safe") is not None]
        points.append({
            "date": key.isoformat(),
            "n": len(group),
            "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
            "pass_rate": _rate(sum(1 for r in graded if r["passed"]), len(graded)),
            # The UNSAFE share: a safety figure a trainer acts on is the failure rate, and
            # labelling the safe share "safety_fail_rate" would invert every alarm.
            "safety_fail_rate": _rate(sum(1 for r in judged if not r["safe"]), len(judged)),
        })
    return points
