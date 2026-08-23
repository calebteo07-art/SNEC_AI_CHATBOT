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
must not drag an average it has no opinion about. A pre-2026-08-04 row reads the same way
(`_current_scale`): its score came off a different instrument, so it counts in `n` and in
no mean.

**A bucket is not the window.** `build_points` is for the CHART. The console's hero and
pass-rate card read `build_window`, which pools the raw rows once — reading `points[-1]`
under a "90 days" caption reports one WEEK, and averaging the bucket means instead lets a
week with one attempt weigh as much as a week with forty.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from tools.shared.clock import SGT
from tools.supervisor.cohort_analytics import MIN_ATTEMPTS, MIN_STUDENTS
from tools.supervisor.osce_analysis import GRADE_SCALE_CURRENT, is_current_scale, trajectory

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


def _current_scale(row: dict) -> bool:
    """True when the row was graded on the CURRENT scale (migration 017's stamp).

    NULL is the retired x50 era, read exactly as `osce_analysis.mark_loss` reads it.
    score_100 is nominally 0-100 in BOTH eras, which is why this survived review: what
    changed on 2026-08-04 is the INSTRUMENT (two AI schemes x50 -> checklist 40 /
    consult 30 / judgement 30), so a mean spanning the boundary compares two different
    measurements and prints the rescale as a trend.

    A legacy row is treated exactly like an ungraded one: it counts in `n` — it is an
    attempt — and contributes to no score. `safe` is untouched by the rescale (it comes
    from missed_critical, migration 011), so the safety series keeps every row.
    """
    # Delegates: cohort_analytics needs the same predicate and a third hand-copy of one
    # `==` is how two panels on one screen end up disagreeing about which era a row is in.
    return is_current_scale(row)


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
        scores = [float(r["score_100"]) for r in group
                  if _current_scale(r) and r.get("score_100") is not None]
        graded = [r for r in group if _current_scale(r) and r.get("passed") is not None]
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


def build_window(rows: list[dict], *, days: int, today: date) -> dict:
    """The WINDOW-level reading, pooled over every row — the figure the hero renders.

    `points[-1]` is not this number and never was: the console's `latestReading` walks
    back to the newest non-null BUCKET, and past `_MAX_DAILY_SPAN` a bucket is one WEEK,
    so a hero captioned "90 days" showed the most recent week that happened to carry a
    grade. An unweighted mean of the bucket means is the same error one layer up, so this
    pools the raw rows and divides once.

    Below the confidence floor `cohort_analytics` already enforces, the figure is None and
    never a number: a headline percentage off two attempts is a claim the data cannot
    support, and the console's em-dash path exists for exactly this. Every denominator
    rides along so the card can say WHY rather than just look broken.
    """
    start = today - timedelta(days=days - 1)
    kept = [r for r in rows
            if (d := sgt_day(r.get("completed_at"))) is not None and start <= d <= today]

    # Distinct students across the WHOLE window — the upper bound on any one metric's
    # student count, the same simplification cohort_analytics makes. The attempt floor is
    # the tight one; this keeps the student floor honest without carrying three sets.
    students = len({str(r.get("student_id") or "") for r in kept})
    # Sorted, because trajectory() refuses to sort and says so: rows arrive ordered by
    # case_progress.id, which a backfill or an import reorders against completed_at, and
    # an unordered list would invert the direction printed under the hero.
    current = sorted((r for r in kept if _current_scale(r)),
                     key=lambda r: str(r.get("completed_at") or ""))
    scores = [float(r["score_100"]) for r in current if r.get("score_100") is not None]
    graded = [r for r in current if r.get("passed") is not None]

    def _floored(value: float | None, n: int) -> float | None:
        return value if students >= MIN_STUDENTS and n >= MIN_ATTEMPTS else None

    traj = trajectory(scores)
    return {
        "attempts": len(kept),
        "students": students,
        "avg_score": _floored(round(sum(scores) / len(scores), 1) if scores else None,
                              len(scores)),
        "scored_n": len(scores),
        "pass_rate": _floored(_rate(sum(1 for r in graded if r["passed"]), len(graded)),
                              len(graded)),
        "graded_n": len(graded),
        # Attempts written before the 2026-08-04 rescale. They happened, so they count in
        # `attempts`; their score came off a different instrument, so they are in no mean.
        # Stated on the wire because a silently shorter graded window reads as "nobody was
        # graded for eleven weeks" — the same lie in the other direction.
        "legacy_excluded": sum(1 for r in kept if not _current_scale(r)),
        # Echoed rather than restated in the UI: one place to change the floor.
        "min_students": MIN_STUDENTS,
        "min_attempts": MIN_ATTEMPTS,
        # First half vs second half of the SCORED rows, pooled (dead band 5.0, minimum 4).
        # NOT points[0] vs points[-1]: those are single-bucket means, routinely n=1, and
        # "up 12 points" off two thin buckets is the hero's own defect wearing a sentence.
        "trajectory": {"band": traj.band, "delta": traj.delta,
                       "n": traj.n, "needed": traj.needed},
    }
