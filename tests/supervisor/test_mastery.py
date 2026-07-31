"""Three mastery scales against a leave-one-out cohort (spec §6.2, D13)."""

from tools.supervisor.mastery import leave_one_out, mastery_block, retention_mastery


# ── leave-one-out ────────────────────────────────────────────────────────────

def test_leave_one_out_excludes_the_student():
    # Three students at 90/60/30. For the 90, the cohort is (60+30)/2 = 45.
    assert leave_one_out(total=180.0, n=3, value=90.0) == 45.0


def test_solo_student_has_no_cohort():
    # Including the student makes delta exactly 0.0, which renders as "exactly at the
    # cohort average" when the truth is "there is no cohort" — the common case at
    # SNEC's volume, and the reason this must be null.
    assert leave_one_out(total=90.0, n=1, value=90.0) is None


def test_zero_cohort_is_none_not_zero():
    assert leave_one_out(total=0.0, n=0, value=None) is None


# ── the three scales ─────────────────────────────────────────────────────────

def _per_student():
    return {
        "s1": {"osce": 90.0, "flashcard": 40.0, "retention": None},
        "s2": {"osce": 60.0, "flashcard": 80.0, "retention": 50.0},
        "s3": {"osce": 30.0, "flashcard": None, "retention": 70.0},
    }


def test_three_named_scales_are_never_blended():
    out = mastery_block("s1", _per_student())
    assert set(out) == {"osce_mastery", "flashcard_mastery", "retention_mastery"}
    assert out["osce_mastery"]["value"] == 90.0
    assert out["flashcard_mastery"]["value"] == 40.0


def test_delta_is_against_the_leave_one_out_mean():
    out = mastery_block("s1", _per_student())
    assert out["osce_mastery"]["cohort_avg"] == 45.0     # (60+30)/2
    assert out["osce_mastery"]["delta"] == 45.0          # 90 - 45
    # cohort_n counts every student WITH the scale, s1 included — deliberately not
    # the divisor of cohort_avg, which is the mean over the other 2. See the
    # mastery_block docstring: a UI rendering this as "vs 3 peers" is wrong.
    assert out["osce_mastery"]["cohort_n"] == 3


def test_a_scale_the_student_lacks_is_null_but_still_reports_the_cohort():
    # s1 has no retention data. Their own value is null — but a trainer still needs
    # to see what the cohort managed, so cohort_avg is populated and delta is null.
    out = mastery_block("s1", _per_student())
    assert out["retention_mastery"]["value"] is None
    assert out["retention_mastery"]["delta"] is None
    assert out["retention_mastery"]["cohort_avg"] == 60.0   # (50+70)/2
    assert out["retention_mastery"]["cohort_n"] == 2


def test_students_without_the_scale_are_out_of_its_denominator():
    # s3 has no flashcard data, so the flashcard cohort is 2, not 3. Counting them as
    # a 0 would drag the cohort average down and flatter everyone against it.
    out = mastery_block("s1", _per_student())
    assert out["flashcard_mastery"]["cohort_n"] == 2
    assert out["flashcard_mastery"]["cohort_avg"] == 80.0   # s2 only


def test_unknown_student_gets_nulls_not_a_crash():
    out = mastery_block("nobody", _per_student())
    assert out["osce_mastery"]["value"] is None
    assert out["osce_mastery"]["delta"] is None


def test_empty_cohort_is_all_nulls():
    out = mastery_block("s1", {})
    for scale in out.values():
        assert scale["value"] is None and scale["cohort_avg"] is None
        assert scale["cohort_n"] == 0


# ── retention bucketing ──────────────────────────────────────────────────────

def test_retention_buckets_both_namespaces_before_averaging():
    # retention_scores mixes raw case topics and flashcard tags. Averaging the raw
    # keys lets whichever namespace is more finely subdivided outvote the other: here
    # the two tonometry keys are ONE topic measured twice, and unbucketed they carry
    # 2/3 of the score instead of 1/2.
    scores = {"tonometry_a": 0.2, "tonometry_b": 0.2, "acute_angle_closure": 0.8}
    #   strict  -> {"screening": [0.2, 0.2], "knowledge_general": [0.8]} -> mean(0.2, 0.8)
    assert retention_mastery(scores, role="OT") == 50.0
    #   unbucketed raw mean would be 40.0; so would the LENIENT resolver, which files
    #   acute_angle_closure into _DEFAULT["OT"] == "screening" and merges the two groups.


def test_retention_is_scaled_to_0_100():
    # retention_scores are stored 0-1; the other two scales are 0-100. Mixing them
    # would show a strong student as a 0.8 next to a weak one's 40.
    assert retention_mastery({"oct_macula": 1.0}, role="OT") == 100.0


def test_unparseable_retention_value_is_skipped_not_zeroed():
    out = retention_mastery({"oct_macula": "n/a", "oct_rnfl": 1.0}, role="OT")
    assert out == 100.0


def test_empty_retention_is_none():
    assert retention_mastery({}, role="OT") is None
    assert retention_mastery(None, role="OT") is None
