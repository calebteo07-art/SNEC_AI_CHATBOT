"""Performance over time, bucketed on the SGT calendar (spec §7.2, D13).

Two traps this pins, both of which produce a chart that is wrong but plausible:

**The day boundary.** P1's activity-trend buckets with `str(ts)[:10]`, the UTC date. SNEC
is UTC+8, so that starts every "day" at 08:00 SGT: an 8am-to-midnight teaching day is
split across two columns, and the evening half is credited to the day before. A trend is
read for its SHAPE, so a systematic half-day shear is worse than a missing point.

**Zero is not "no data".** A day nobody attempted a case has no average score. Rendering
0.0 draws a cliff to the floor and reads as a cohort collapse (D13).

**A score is only comparable within its own era.** `grade_scale` (migration 017) stamps
the 40/30/30 rubric; NULL is the retired x50 one. A mean spanning 2026-08-04 compares two
instruments and draws the rescale as a trend, so `_row` stamps the CURRENT era by default
and the legacy case is pinned explicitly.
"""
from datetime import date

from tools.supervisor.osce_analysis import GRADE_SCALE_CURRENT
from tools.supervisor.trend import (
    build_points, build_window, period_for, sgt_day, window_start_utc,
)


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

def _row(ts, score=80.0, passed=True, safe=True, sid="s1", scale=GRADE_SCALE_CURRENT):
    return {"student_id": sid, "completed_at": ts, "case_id": "C001",
            "score_100": score, "passed": passed, "safe": safe, "grade_scale": scale}


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


# ── the 2026-08-04 rescale ───────────────────────────────────────────────────

def test_a_legacy_score_counts_as_an_attempt_but_not_in_any_mean():
    # score_100 is nominally 0-100 in BOTH eras, which is why this went unnoticed: what
    # changed is the INSTRUMENT. Averaging across the boundary draws the rescale as a
    # cohort trend. A legacy row reads exactly like an ungraded one.
    rows = [
        _row("2026-08-10T02:00:00Z", score=90.0, passed=True, safe=True),
        _row("2026-08-10T03:00:00Z", score=40.0, passed=False, safe=True, scale=None),
    ]
    p = build_points(rows, days=1, today=date(2026, 8, 10), period="day")[0]

    assert p["n"] == 2, "a legacy attempt is still an attempt"
    assert p["avg_score"] == 90.0, "the x50-era score must not enter the mean"
    assert p["pass_rate"] == 100.0, "nor its pass/fail"


def test_safety_keeps_every_era():
    # `safe` comes from missed_critical (migration 011) and is untouched by the rescale,
    # so excluding legacy rows from the SAFETY series would discard real safety failures.
    rows = [
        _row("2026-08-10T02:00:00Z", safe=True),
        _row("2026-08-10T03:00:00Z", safe=False, scale=None),
    ]
    p = build_points(rows, days=1, today=date(2026, 8, 10), period="day")[0]
    assert p["safety_fail_rate"] == 50.0


# ── build_window: the figure the hero renders ────────────────────────────────

def _window_rows(n, *, score, sid_of=lambda i: f"s{i}", scale=GRADE_SCALE_CURRENT):
    return [_row(f"2026-08-1{i % 10}T02:00:00Z", score=score, passed=score >= 60,
                 safe=True, sid=sid_of(i), scale=scale) for i in range(n)]


def test_the_window_pools_rows_it_does_not_average_the_buckets():
    """The defect this function exists for. One busy week at 50 and one quiet day at 90
    is not "70": an unweighted mean of bucket means lets a week with one attempt weigh as
    much as a week with forty."""
    rows = ([_row("2026-08-03T02:00:00Z", score=50.0, sid=f"s{i}") for i in range(9)]
            + [_row("2026-08-17T02:00:00Z", score=90.0, sid="s9")])
    w = build_window(rows, days=30, today=date(2026, 8, 19))

    assert w["scored_n"] == 10
    assert w["avg_score"] == 54.0        # (9*50 + 90) / 10, NOT (50 + 90) / 2
    assert w["students"] == 10


def test_the_window_is_none_below_the_confidence_floor_never_a_number():
    # Four scored attempts across two students. A headline "72%" off this is a claim the
    # data cannot support, and the console's em-dash path already exists for it.
    rows = _window_rows(4, score=72.0, sid_of=lambda i: f"s{i % 2}")
    w = build_window(rows, days=30, today=date(2026, 8, 19))

    assert w["avg_score"] is None
    assert w["pass_rate"] is None
    # The denominators still ride along, so the card can say WHY rather than look broken.
    assert w["scored_n"] == 4
    assert w["students"] == 2
    assert (w["min_students"], w["min_attempts"]) == (3, 5)


def test_the_window_states_how_many_attempts_the_rescale_excluded():
    # A silently shorter graded window reads as "nobody was graded for eleven weeks" —
    # the same lie in the other direction, so the count is on the wire.
    rows = (_window_rows(5, score=80.0)
            + _window_rows(3, score=20.0, sid_of=lambda i: f"old{i}", scale=None))
    w = build_window(rows, days=30, today=date(2026, 8, 19))

    assert w["attempts"] == 8, "a legacy attempt still happened"
    assert w["legacy_excluded"] == 3
    assert w["scored_n"] == 5
    assert w["avg_score"] == 80.0
