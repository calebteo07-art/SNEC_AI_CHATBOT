"""Attainment must not blend the two OSCE grading eras (migration 017).

`db.get_case_scores_since` carries `grade_scale` and documents WHY: "score_100 is NOT
comparable across" the 2026-08-04 rescale. Two modules already act on that —
`osce_analysis.mark_loss` excludes retired-scale rows and names them, and
`trend.build_window` holds `avg_score` AND `pass_rate` to current-scale rows only.

`cohort_analytics` was the outlier, and not by choice: its input is
`db.get_all_case_scores`, whose projection did not even SELECT the column, so the
filter could not have been written. Every topic group's `avg_score`/`pass_rate` — and
therefore `weakness_score`, and therefore the "Weakest topics" ranking a trainer teaches
from — pooled both instruments.

This is visible on production today. In the 90-day window every attempt predates the
rescale, so the hero and the pass-rate card correctly render "—" over "All 12 attempts
predate the 4 Aug rescale", while the panel directly beneath them ranked topic mastery
from those very rows. One screen, two answers, and the wrong one is the one that drives
teaching.

The subtle half is the RETAKE interaction, pinned below: attainment is the best attempt
per (student, case), so filtering AFTER that selection lets a retired-scale row win the
slot and then vanish — deleting the current-era attempt that should have been reported.
The filter has to run BEFORE the high-water pick, not after.

What is NOT filtered: `attempts` (those encounters happened) and everything safety —
`safe`/`missed_critical` come from the checklist, which the rescale did not touch.
"""
from tools.supervisor.cohort_analytics import osce_by_group, osce_by_student
from tools.supervisor.osce_analysis import GRADE_SCALE_CURRENT

_INDEX = {
    "c1": {"set_key": "glaucoma", "difficulty": "beginner", "has_critical": True},
    "c2": {"set_key": "glaucoma", "difficulty": "beginner", "has_critical": True},
}
_POOLS = {"s1": "CLINICAL", "s2": "CLINICAL"}


def _row(sid="s1", case="c1", score=70, passed=True, safe=True, scale=GRADE_SCALE_CURRENT):
    return {"student_id": sid, "case_id": case, "score_100": score, "passed": passed,
            "safe": safe, "missed_critical": [], "grade_scale": scale}


def _group(rows):
    return osce_by_group(rows, case_index=_INDEX, pools_by_student=_POOLS)["glaucoma"]


# ── the score must come off one instrument ───────────────────────────────────

def test_a_retired_scale_score_is_not_averaged_with_a_current_one():
    g = _group([_row(score=90, scale=None), _row(sid="s2", case="c2", score=50)])
    assert g["avg_score"] == 50.0
    assert g["scored_n"] == 1


def test_a_retired_scale_pass_is_not_pooled_into_the_pass_rate():
    """`passed` is a verdict against its OWN era's mark, so it does not pool either —
    the same call trend.build_window already makes."""
    g = _group([_row(passed=True, scale=None), _row(sid="s2", case="c2", passed=False)])
    assert g["pass_rate"] == 0.0
    assert g["graded_n"] == 1


def test_an_all_legacy_group_reports_no_score_rather_than_a_wrong_one():
    g = _group([_row(score=88, scale=None), _row(sid="s2", case="c2", score=91, scale=None)])
    assert g["avg_score"] is None and g["scored_n"] == 0
    assert g["pass_rate"] is None and g["graded_n"] == 0


def test_the_excluded_count_is_reported_not_silently_dropped():
    """A silently shorter denominator reads as "nobody was graded", the same lie the
    hero's `legacy_excluded` exists to prevent."""
    g = _group([_row(scale=None), _row(sid="s2", case="c2")])
    assert g["legacy_excluded"] == 1


# ── what the rescale did NOT touch ───────────────────────────────────────────

def test_a_legacy_attempt_still_counts_as_an_attempt():
    """It happened. Dropping it would under-report cohort activity."""
    g = _group([_row(scale=None), _row(sid="s2", case="c2")])
    assert g["attempts"] == 2


def test_safety_still_spans_both_eras():
    """`safe` comes from missed_critical, which the rescale did not change. Excluding
    legacy rows here would throw away real safety evidence."""
    g = _group([_row(scale=None, safe=False), _row(sid="s2", case="c2", safe=True)])
    assert g["safety_gradable_n"] == 2
    assert g["safety_fail_rate"] == 0.5


# ── the retake trap ──────────────────────────────────────────────────────────

def test_a_legacy_retake_cannot_displace_the_current_attempt_it_outscores():
    """THE SUBTLE ONE. Attainment is the best attempt per (student, case).

    Filter after the high-water pick and this row set reports NO score at all: the /50-era
    90 wins the slot, then the era filter deletes it, and the current-era 55 — the only
    comparable reading in the set — is never counted. The filter must run first.
    """
    g = _group([_row(score=90, scale=None), _row(score=55)])
    assert g["scored_n"] == 1
    assert g["avg_score"] == 55.0


def test_the_high_water_rule_still_applies_within_the_current_era():
    g = _group([_row(score=40), _row(score=75)])
    assert g["scored_n"] == 1 and g["avg_score"] == 75.0


# ── the same rule per student (feeds the at-risk OSCE signal) ────────────────

def test_per_student_attainment_excludes_the_retired_scale_too():
    """osce_by_student feeds risk_model's `osce_failure`. Blending eras there scores a
    student against an instrument they were never marked on."""
    out = osce_by_student([_row(score=90, scale=None), _row(case="c2", score=30)])
    assert out["s1"]["scored_n"] == 1
    assert out["s1"]["avg_score"] == 30.0
    assert out["s1"]["legacy_excluded"] == 1
    # Unchanged: the encounters happened, and safety spans both eras.
    assert out["s1"]["attempts"] == 2
    assert out["s1"]["safety_gradable_n"] == 2


def test_per_student_legacy_retake_cannot_displace_a_current_attempt():
    out = osce_by_student([_row(score=95, scale=None), _row(score=44)])
    assert out["s1"]["avg_score"] == 44.0


# ── the column has to actually arrive ────────────────────────────────────────

def test_the_all_scores_projection_selects_grade_scale():
    """Without the column every row reads as legacy and the panel empties itself.

    The filter and the projection are one change: `get_all_case_scores` is the ONLY
    feed for these two functions, and it did not select `grade_scale` at all.
    """
    import inspect

    from tools.shared import db
    src = inspect.getsource(db.get_all_case_scores)
    assert "grade_scale" in src
