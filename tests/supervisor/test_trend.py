"""Performance over time, bucketed on the SGT calendar (spec §7.2, D13).

Two traps this pins, both of which produce a chart that is wrong but plausible:

**The day boundary.** P1's activity-trend buckets with `str(ts)[:10]`, the UTC date. SNEC
is UTC+8, so that starts every "day" at 08:00 SGT: an 8am-to-midnight teaching day is
split across two columns, and the evening half is credited to the day before. A trend is
read for its SHAPE, so a systematic half-day shear is worse than a missing point.

**Zero is not "no data".** A day nobody attempted a case has no average score. Rendering
0.0 draws a cliff to the floor and reads as a cohort collapse (D13).
"""
from datetime import date

from tools.supervisor.trend import build_points, period_for, sgt_day, window_start_utc


# ── the SGT day boundary ─────────────────────────────────────────────────────

def test_a_late_evening_utc_completion_belongs_to_the_next_sgt_day():
    # 23:00 UTC is 07:00 the NEXT morning in Singapore. `str(ts)[:10]` says the 30th.
    assert sgt_day("2026-07-30T23:00:00Z") == date(2026, 7, 31)


def test_an_afternoon_sgt_completion_stays_on_its_own_day():
    # 06:00 UTC = 14:00 SGT, mid-teaching-day. Both conventions agree here, which is
    # exactly why a UTC-prefix bug survives casual inspection.
    assert sgt_day("2026-07-30T06:00:00Z") == date(2026, 7, 30)


def test_the_offset_forms_postgrest_actually_returns_are_all_understood():
    for ts in ("2026-07-30T23:00:00Z", "2026-07-30T23:00:00+00:00",
               "2026-07-30T23:00:00.123456Z", "2026-07-30T23:00:00"):
        assert sgt_day(ts) == date(2026, 7, 31), ts


def test_an_unparseable_timestamp_is_dropped_not_bucketed_as_today():
    # Coercing junk to "now" would pile phantom attempts onto the newest column, which is
    # the one a trainer is actually looking at.
    assert sgt_day("") is None
    assert sgt_day("not-a-date") is None
    assert sgt_day(None) is None


# ── bucketing ────────────────────────────────────────────────────────────────

def _row(ts, score=80.0, passed=True, safe=True, sid="s1"):
    return {"student_id": sid, "completed_at": ts, "case_id": "C001",
            "score_100": score, "passed": passed, "safe": safe}


def test_a_day_with_no_attempts_is_null_not_zero():
    points = build_points([], days=3, today=date(2026, 7, 31), period="day")

    assert [p["date"] for p in points] == ["2026-07-29", "2026-07-30", "2026-07-31"]
    for p in points:
        assert p == {"date": p["date"], "n": 0, "avg_score": None,
                     "pass_rate": None, "safety_fail_rate": None}


def test_the_window_is_fully_populated_even_where_nothing_happened():
    # A sparse series must still render as a continuous axis; dropping empty days would
    # space three attempts evenly and hide a two-week gap.
    points = build_points([_row("2026-07-31T02:00:00Z")], days=5, today=date(2026, 7, 31),
                          period="day")

    assert len(points) == 5
    assert points[-1]["n"] == 1
    assert all(p["n"] == 0 for p in points[:-1])


def test_each_metric_holds_its_own_denominator():
    # Grade columns are NULL on pre-Tier-2 rows (over half of production). Such a row is
    # still an ATTEMPT — it counts in n — but it must not drag an average it has no
    # opinion about, and zero-filling it would invent a failure.
    rows = [
        _row("2026-07-31T02:00:00Z", score=90.0, passed=True, safe=True),
        _row("2026-07-31T03:00:00Z", score=None, passed=None, safe=None),
    ]
    p = build_points(rows, days=1, today=date(2026, 7, 31), period="day")[0]

    assert p["n"] == 2, "an ungraded attempt is still an attempt"
    assert p["avg_score"] == 90.0
    assert p["pass_rate"] == 100.0
    assert p["safety_fail_rate"] == 0.0


def test_safety_fail_rate_counts_the_unsafe_share_not_the_safe_one():
    rows = [_row("2026-07-31T02:00:00Z", safe=False), _row("2026-07-31T03:00:00Z", safe=True),
            _row("2026-07-31T04:00:00Z", safe=True), _row("2026-07-31T05:00:00Z", safe=True)]
    p = build_points(rows, days=1, today=date(2026, 7, 31), period="day")[0]

    assert p["safety_fail_rate"] == 25.0, "1 unsafe of 4 — not the 75% that passes safely"


def test_every_retake_counts_on_the_day_it_happened():
    # DELIBERATE divergence from D9 (best score_100 per student+case), which is the right
    # rule for a standing mastery figure and the wrong one for a time series: collapsing
    # five attempts to their best would move a score to a day it was not earned and erase
    # the improvement curve, which is the only thing this chart exists to show.
    rows = [_row("2026-07-30T02:00:00Z", score=40.0), _row("2026-07-31T02:00:00Z", score=80.0)]
    points = build_points(rows, days=2, today=date(2026, 7, 31), period="day")

    assert [p["n"] for p in points] == [1, 1]
    assert [p["avg_score"] for p in points] == [40.0, 80.0]


def test_attempts_outside_the_window_are_ignored():
    rows = [_row("2026-07-01T02:00:00Z"), _row("2026-07-31T02:00:00Z")]
    points = build_points(rows, days=2, today=date(2026, 7, 31), period="day")

    assert sum(p["n"] for p in points) == 1


# ── weekly rollup ────────────────────────────────────────────────────────────

def test_a_long_window_rolls_up_to_weeks_starting_monday():
    # 90 daily points in a 320px chart is 3.5px per point — unreadable, and the axis
    # labels collide. Weeks start Monday to agree with app_week_start().
    assert period_for(31) == "day"
    assert period_for(32) == "week"
    assert period_for(90) == "week"

    # 2026-07-31 is a Friday; its week starts Monday 2026-07-27.
    points = build_points([_row("2026-07-31T02:00:00Z"), _row("2026-07-28T02:00:00Z")],
                          days=14, today=date(2026, 7, 31), period="week")

    assert points[-1]["date"] == "2026-07-27"
    assert points[-1]["n"] == 2, "both attempts fall in the same ISO week"


def test_a_week_bucket_does_not_reach_back_behind_the_window():
    # The oldest bucket is the MONDAY of the oldest day's week, which can predate the
    # window — so the bucket boundary alone does not bound the data, and the daily case
    # cannot show it (there, the two coincide). A 14-day window ending Fri 2026-07-31
    # opens on Sat 2026-07-18, inside the week that began Mon 2026-07-13; an attempt from
    # that Monday sits in the first bucket's week but outside the window the caller asked
    # for, and counting it would inflate the oldest column a trend is read against.
    rows = [_row("2026-07-13T02:00:00Z"), _row("2026-07-31T02:00:00Z")]
    points = build_points(rows, days=14, today=date(2026, 7, 31), period="week")

    assert sum(p["n"] for p in points) == 1


def test_a_future_timestamp_is_not_credited_to_the_current_week():
    # Clock skew and backfilled imports do produce completed_at ahead of today. A daily
    # bucket has nowhere to put such a row, but a weekly one does — the week containing
    # today — so it would land on the newest column, the one being read.
    rows = [_row("2026-08-01T02:00:00Z")]  # Saturday, same ISO week as Friday the 31st
    points = build_points(rows, days=14, today=date(2026, 7, 31), period="week")

    assert sum(p["n"] for p in points) == 0


def test_a_weekly_window_still_spans_the_whole_range():
    points = build_points([], days=28, today=date(2026, 7, 31), period="week")

    assert len(points) >= 4, "four weeks of Mondays, however the range lands"
    assert all(date.fromisoformat(p["date"]).weekday() == 0 for p in points)


# ── the window edge ──────────────────────────────────────────────────────────

def test_the_window_opens_at_sgt_midnight_not_utc_midnight():
    # The same eight hours the bucketing fixes, at the other end of the pipe. Filtering
    # the DB read on the plain ISO date starts it at 08:00 SGT, so the morning of the
    # oldest day renders empty — a chart that silently begins half a day late.
    assert window_start_utc(date(2026, 7, 31), 1) == "2026-07-30T16:00:00+00:00"
    assert window_start_utc(date(2026, 7, 31), 7) == "2026-07-24T16:00:00+00:00"


def test_an_early_morning_attempt_on_the_oldest_day_is_inside_the_window():
    # 2026-07-25T01:00 SGT == 2026-07-24T17:00Z, which is AFTER the window opens at
    # 16:00Z but BEFORE the naive "2026-07-25" bound would admit it.
    start = window_start_utc(date(2026, 7, 31), 7)
    assert "2026-07-24T17:00:00+00:00" >= start
    assert "2026-07-24T17:00:00+00:00" < "2026-07-25"
