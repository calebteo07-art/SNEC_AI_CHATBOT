"""Risk model: weights, renormalisation, banding (spec §6.1, D7)."""
import pytest

from tools.supervisor.risk_model import RISK_RUBRIC, band_for, score_student


def _signals(**over):
    """A started student with no performance data. Override one axis per test."""
    base = dict(days_inactive=0, streak=5, weak_count=0, osce=None, flashcard=None)
    base.update(over)
    return base


# ── The rubric itself ────────────────────────────────────────────────────────

def test_weights_sum_to_one():
    # Renormalisation divides by the weight of the signals PRESENT. If the full set
    # does not sum to 1.0, a student with every signal scores something other than
    # their true weighted deficit and the 0-100 scale silently stops being 0-100.
    assert sum(RISK_RUBRIC["weights"].values()) == pytest.approx(1.0)


def test_rubric_reuses_the_cohort_normalisation_seam():
    # cohort_analytics.WEIGHT_RUBRIC reserves `scales`/`confidence` for this model
    # (cohort_analytics.py:208-211). A forked copy drifts the moment either is tuned.
    from tools.supervisor.cohort_analytics import WEIGHT_RUBRIC
    assert RISK_RUBRIC["scales"] is WEIGHT_RUBRIC["scales"]
    assert RISK_RUBRIC["confidence"] is WEIGHT_RUBRIC["confidence"]


def test_scale_mapping_pins_the_cross_name_coupling():
    # _risk_components reads scales["osce_pass"] under the weight name "osce_failure"
    # (the pass-rate divisor, deliberately reused). If cohort_analytics ever renames
    # osce_pass this must fail here, not with a bare KeyError deep in scoring.
    from tools.supervisor.cohort_analytics import WEIGHT_RUBRIC
    assert "osce_pass" in WEIGHT_RUBRIC["scales"]
    assert WEIGHT_RUBRIC["scales"]["osce_pass"] == 1.0


# ── Missing data: excluded, never zero-filled ────────────────────────────────

def test_never_started_is_no_data_not_a_zero_score():
    # No last_active and no performance rows. A 0 here reads as "lowest risk in the
    # cohort", inverting the feature for exactly the students who never engaged.
    out = score_student(days_inactive=None, streak=0, weak_count=0, osce=None, flashcard=None)
    assert out["band"] == "no_data"
    assert out["risk_score"] is None
    assert [r["factor"] for r in out["reasons"]] == ["never_started"]


def test_new_account_with_zero_streak_does_not_flag_high():
    # A brand-new account has streak 0 and no weak topics. Scoring streak_broken at
    # full weight would flag every new student high on their first day. days_inactive=0
    # (active TODAY, not None/never-started) is the real day-one input.
    out = score_student(**_signals(days_inactive=0, streak=0, osce={
        "pass_rate": 1.0, "graded_n": 1, "safety_fail_rate": None, "safety_gradable_n": 0,
    }))
    assert out["band"] in ("low", "medium")
    assert "streak_broken" not in [r["factor"] for r in out["reasons"]]


def test_active_today_does_not_count_a_broken_streak():
    # Not checking in TODAY is normal for an active student. Before the days_inactive
    # > 0 gate: total_w collapsed to 0.30, streak_broken alone contributed 20.0, and
    # this student scored 28 -> "medium" -> flagged and emailed in the weekly digest.
    out = score_student(**_signals(days_inactive=0, streak=0, weak_count=2))
    assert out["risk_score"] == 10
    assert out["band"] == "low"
    assert "streak_broken" not in [r["factor"] for r in out["reasons"]]


def test_absent_signal_is_dropped_from_the_denominator():
    # Two students, identical inactivity, one with no performance data. Excluding a
    # missing signal must not make the data-less student look SAFER than the other.
    only_inactive = score_student(**_signals(days_inactive=14, streak=0, weak_count=5))
    # Every present signal is at full deficit, so renormalisation must yield 100.
    assert only_inactive["risk_score"] == 100


def test_zero_filling_a_missing_signal_would_be_visible_here():
    # Same student, now WITH a perfect OSCE record. The score must fall, proving the
    # renormalised denominator actually grew rather than the deficit being summed raw.
    perfect_osce = score_student(**_signals(
        days_inactive=14, streak=0, weak_count=5,
        osce={"pass_rate": 1.0, "graded_n": 20, "safety_fail_rate": 0.0, "safety_gradable_n": 20},
    ))
    only_inactive = score_student(**_signals(days_inactive=14, streak=0, weak_count=5))
    assert perfect_osce["risk_score"] < only_inactive["risk_score"]
    # Pinned exact. 20 graded attempts shrink to 20/25, so 1/5 of the OSCE and safety
    # weight is UN-EVIDENCED. That remainder is not proof of safety, so it does not sit
    # at zero deficit — it is redistributed across the profile facts, which are all at
    # full deficit here:
    #   unevidenced = (0.30 + 0.22) * 0.2                       = 0.104
    #   facts       = 0.18 + 0.06 + 0.06                        = 0.30
    #   score       = 0.30 * (1 + 0.104/0.30) / 0.82            -> 49
    # Under the pre-monotonicity model that remainder counted as "this student is fine"
    # and the same student scored 37 — the same arithmetic that let a FAILED attempt
    # lower a score (see the monotonicity block below).
    assert perfect_osce["risk_score"] == 49


def test_osce_pass_rate_with_null_graded_n_drops_the_signal():
    # pass_rate non-null but graded_n: None must not crash `graded_n > 0` — and
    # pass_rate alone is not evidence without its own denominator.
    out = score_student(**_signals(days_inactive=None, streak=None, osce={
        "pass_rate": 0.5, "graded_n": None, "safety_fail_rate": None, "safety_gradable_n": 0,
    }))
    assert out["band"] == "no_data"
    assert out["risk_score"] is None


# ── Shrinkage on sampled signals ─────────────────────────────────────────────

def test_one_failed_attempt_is_damped_by_shrinkage():
    # deficit 1.0 shrunk by n/(n+5) = 1/6, over a denominator of just this one signal.
    out = score_student(**_signals(days_inactive=None, streak=None, weak_count=0, osce={
        "pass_rate": 0.0, "graded_n": 1, "safety_fail_rate": None, "safety_gradable_n": 0,
    }))
    assert out["risk_score"] == 17
    assert out["band"] == "low"


def test_sustained_failure_outranks_a_single_attempt():
    # Same 0% pass rate over 20 attempts: 20/25 = 0.8 of the deficit survives.
    out = score_student(**_signals(days_inactive=None, streak=None, weak_count=0, osce={
        "pass_rate": 0.0, "graded_n": 20, "safety_fail_rate": None, "safety_gradable_n": 0,
    }))
    assert out["risk_score"] == 80
    assert out["band"] == "high"


def test_profile_facts_are_not_shrunk():
    # inactivity and weak_breadth are facts about the profile, not samples of size 1.
    # Both are at full deficit here (14/14 days, 5/5 topics) and nothing else is
    # present, so the renormalised score must be exactly 100. Shrinking a profile fact
    # uses n=0, giving a shrink factor of 0/(0+5) = 0, which would drop this to 25.
    out = score_student(**_signals(days_inactive=14, streak=None, weak_count=5))
    assert out["risk_score"] == 100


# ── Monotonicity: evidence of failure can only raise risk ────────────────────
#
# The three tests above hold the signal SET constant and vary only n, so none of them
# exercises ADDING a signal. Renormalising over the full rubric weight while shrinking
# only the contribution meant a thin sampled signal absorbed its whole weight and gave
# almost none of it back — so attaching a failed station to an otherwise-identical
# student LOWERED their score, and could drop them out of the two bands `at_risk.py`
# returns. That is the exact inversion this model was built to end.

_ENGAGEMENT = [
    pytest.param(dict(days_inactive=7, streak=3, weak_count=2), id="quiet-7d"),
    pytest.param(dict(days_inactive=14, streak=0, weak_count=5), id="gone-14d"),
    pytest.param(dict(days_inactive=0, streak=9, weak_count=0), id="engaged-daily"),
    pytest.param(dict(days_inactive=3, streak=0, weak_count=1), id="slipping"),
]


@pytest.mark.parametrize("engagement", _ENGAGEMENT)
def test_a_failed_attempt_never_lowers_risk(engagement):
    before = score_student(**_signals(**engagement))["risk_score"]
    after = score_student(**_signals(**engagement, osce={
        "pass_rate": 0.0, "graded_n": 1, "safety_fail_rate": None, "safety_gradable_n": 0,
    }))["risk_score"]
    assert after >= before, f"failing a station dropped risk {before} -> {after}"


@pytest.mark.parametrize("engagement", _ENGAGEMENT)
def test_an_unsafe_failed_attempt_never_lowers_risk(engagement):
    # Strictly more evidence than the test above: the same failed attempt, plus a
    # safety fail on it. A student cannot become safer by being unsafe.
    failed = score_student(**_signals(**engagement, osce={
        "pass_rate": 0.0, "graded_n": 1, "safety_fail_rate": None, "safety_gradable_n": 0,
    }))["risk_score"]
    unsafe = score_student(**_signals(**engagement, osce={
        "pass_rate": 0.0, "graded_n": 1, "safety_fail_rate": 1.0, "safety_gradable_n": 1,
    }))["risk_score"]
    assert unsafe >= failed, f"an unsafe fail dropped risk {failed} -> {unsafe}"


@pytest.mark.parametrize("engagement", _ENGAGEMENT)
def test_a_failed_attempt_never_demotes_a_band(engagement):
    # The score is ranked, but the BAND is what `at_risk.py` filters on — it returns
    # only high/medium, so a demotion here does not reorder the panel, it empties a row
    # off it. Pinned separately because a sub-threshold score move is invisible.
    order = {"low": 0, "medium": 1, "high": 2}
    before = score_student(**_signals(**engagement))["band"]
    after = score_student(**_signals(**engagement, osce={
        "pass_rate": 0.0, "graded_n": 1, "safety_fail_rate": 1.0, "safety_gradable_n": 1,
    }))["band"]
    assert order[after] >= order[before], f"band fell {before} -> {after}"


# ── Scale normalisation ──────────────────────────────────────────────────────

def test_flashcard_accuracy_is_scaled_off_100_not_summed_raw():
    # accuracy arrives 0-100 (db.get_topic_accuracy's `pct` convention). Without the
    # /100 divisor a 40% accuracy contributes a deficit of -39 instead of 0.6.
    out = score_student(**_signals(days_inactive=None, streak=None, flashcard={
        "accuracy": 40.0, "n": 100,
    }))
    assert 0 <= out["risk_score"] <= 100
    assert out["risk_score"] == 57  # 0.60 deficit * 100/105 shrink


def test_malformed_input_cannot_exceed_the_scale():
    # A corrupt 140% accuracy would otherwise contribute a NEGATIVE deficit and spend
    # more than its share of the renormalised budget.
    out = score_student(**_signals(days_inactive=None, streak=None, flashcard={
        "accuracy": 140.0, "n": 100,
    }))
    assert out["risk_score"] == 0


# ── Reasons ──────────────────────────────────────────────────────────────────

def test_zero_weight_signals_never_appear_as_reasons():
    # A student active today with a 9-day streak and no weak topics, but failing
    # every graded OSCE attempt with a safety fail on every one — the headline
    # student the 0.70/0.30 split exists to catch. "Streak of 9 days" and "0 weak
    # topics recorded" are compliments, not reasons this student is at risk.
    out = score_student(**_signals(days_inactive=0, streak=9, weak_count=0, osce={
        "pass_rate": 0.0, "graded_n": 12, "safety_fail_rate": 1.0, "safety_gradable_n": 12,
    }))
    factors = [r["factor"] for r in out["reasons"]]
    assert factors == ["osce_failure", "safety"]
    assert all(r["weight"] > 0 for r in out["reasons"])


def test_reasons_are_sorted_by_contribution_descending():
    out = score_student(**_signals(days_inactive=14, streak=0, weak_count=1, osce={
        "pass_rate": 0.0, "graded_n": 20, "safety_fail_rate": 0.5, "safety_gradable_n": 20,
    }))
    weights = [r["weight"] for r in out["reasons"]]
    assert weights == sorted(weights, reverse=True)
    assert all(r["detail"] for r in out["reasons"]), "every reason needs trainer-readable text"


def test_reason_weights_are_the_renormalised_contribution():
    # A trainer reads these as "this is how much of the 100 came from here", so they
    # must sum to the score itself, not to the raw rubric weights.
    out = score_student(**_signals(days_inactive=14, streak=0, weak_count=5))
    # Tolerance covers the per-reason 1dp rounding plus the final int() — the point is
    # that they sum to the SCORE (100), not to the raw rubric weights (which would
    # total 0.30 -> 30 and be nowhere near it.)
    assert sum(r["weight"] for r in out["reasons"]) == pytest.approx(out["risk_score"], abs=1.0)


# ── Bands ────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("score,expected", [
    (100, "high"), (50, "high"), (49, "medium"), (28, "medium"), (27, "low"), (0, "low"),
])
def test_band_boundaries(score, expected):
    assert band_for(score) == expected


def test_band_for_none_is_no_data():
    assert band_for(None) == "no_data"
