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


def test_a_real_zero_is_a_score_not_a_missing_student():
    # 0.0 is producible (score_100 == 0; an all-wrong deck) and is falsy. Any truthiness
    # test in here silently re-files the weakest student in the cohort as "no data", so
    # their peer average is computed over the wrong denominator and flatters them.
    assert leave_one_out(total=50.0, n=2, value=0.0) == 50.0


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


def test_peers_n_is_the_divisor_cohort_n_is_the_population():
    # The two counts differ exactly when the student has the scale, and that is the case
    # a UI gets wrong: osce is 3 students but an average over 2, flashcard is 2 students
    # but an average over 1. peers_n is the one to render.
    out = mastery_block("s1", _per_student())
    assert (out["osce_mastery"]["cohort_n"], out["osce_mastery"]["peers_n"]) == (3, 2)
    assert (out["flashcard_mastery"]["cohort_n"], out["flashcard_mastery"]["peers_n"]) == (2, 1)
    # When the student lacks the scale they are not in the total, so the two agree.
    assert (out["retention_mastery"]["cohort_n"], out["retention_mastery"]["peers_n"]) == (2, 2)


def test_a_zero_scoring_student_keeps_their_value_and_their_place():
    # The failing student is the one a trainer most needs to see. A truthiness test on
    # `value` would render their 0 as "—" (no data) or drop them from the denominator.
    out = mastery_block("s1", {"s1": {"osce": 0.0}, "s2": {"osce": 50.0}})
    assert out["osce_mastery"] == {
        "value": 0.0, "cohort_avg": 50.0, "delta": -50.0, "cohort_n": 2, "peers_n": 1,
    }


def test_a_solo_student_has_a_null_delta_not_a_zero_one():
    # The headline invariant of the whole module, and the one the docstring calls "the
    # most misleading possible answer": a delta of 0.0 renders as "exactly at the cohort
    # average" when the truth is that there is no cohort at all.
    out = mastery_block("s1", {"s1": {"osce": 90.0}})
    assert out["osce_mastery"]["delta"] is None
    assert out["osce_mastery"]["cohort_avg"] is None
    assert out["osce_mastery"]["peers_n"] == 0


def test_unknown_student_gets_nulls_not_a_crash():
    out = mastery_block("nobody", _per_student())
    assert out["osce_mastery"]["value"] is None
    assert out["osce_mastery"]["delta"] is None


def test_empty_cohort_is_all_nulls():
    out = mastery_block("s1", {})
    for scale in out.values():
        assert scale["value"] is None and scale["cohort_avg"] is None
        assert scale["delta"] is None
        assert scale["cohort_n"] == 0 and scale["peers_n"] == 0


# ── retention bucketing ──────────────────────────────────────────────────────

def test_retention_buckets_both_namespaces_before_averaging():
    # Every key below is REAL — two are OT case topics written by cases.py, one is a
    # flashcard tag written by student.py. A synthetic key proves nothing here, because
    # the whole hazard is how the two real namespaces collide.
    scores = {
        "cirrus_oct_macular_scan": 0.2,   # case topic     -> oct_imaging
        "oct_macula": 0.2,                # flashcard tag  -> oct_imaging (SAME topic)
        "ascan_biometry": 0.2,            # flashcard tag  -> biometry
        "anatomy_physiology": 0.8,        # flashcard tag  -> knowledge_anatomy_physiology
    }
    #   grouped -> {oct_imaging: [0.2, 0.2], biometry: [0.2], knowledge_...: [0.8]}
    #           -> mean(0.2, 0.2, 0.8) = 0.4
    assert retention_mastery(scores, role="OT") == 40.0
    #   Averaging the RAW keys gives 35.0: the one OCT topic, written under both
    #   namespaces, would carry 2/4 of the score instead of 1/3.


def test_a_flashcard_tag_never_lands_in_a_procedural_set():
    # resolve_set_strict is a SUBSTRING matcher over case topics, so it captures real
    # flashcard tags whose spelling happens to contain a rule keyword — "anatomy_
    # phys(iol)ogy" hits the "iol" biometry rule. Routing every key through it merges a
    # FOUNDATIONS knowledge deck into a station's score and, worse, contaminates that
    # station's mean: the genuine biometry weakness below (0.2) would read as 0.5.
    same_but_split = {"ascan_biometry": 0.2, "anatomy_physiology": 0.8}
    assert retention_mastery(same_but_split, role="OT") == 50.0   # two groups: 0.2, 0.8
    #   Case-matcher-first would merge both into `biometry` -> one group -> 50.0 too,
    #   so pin the contamination directly: a third key already in `biometry` separates
    #   them. Grouped: {biometry: [0.2, 0.2], knowledge_...: [0.8]} -> mean(0.2, 0.8).
    with_biometry = {"ascan_biometry": 0.2, "optical_biometry": 0.2, "anatomy_physiology": 0.8}
    assert retention_mastery(with_biometry, role="OT") == 50.0
    #   Case-matcher-first: {biometry: [0.2, 0.2, 0.8]} -> 40.0.


def test_an_unmatched_case_topic_is_not_filed_into_the_default_set():
    # resolve_set (lenient) sends a no-match to _DEFAULT["OT"] == "screening", which here
    # is already a real group — so an unrelated triage topic would be averaged into the
    # colour-vision/DR screening score. All three keys are real OT case topics.
    scores = {
        "dr_grading_sorc_retinopathy": 0.2,          # -> screening
        "ishihara_colour_vision": 0.2,               # -> screening
        "acute_angle_closure_glaucoma_triage": 0.8,  # -> no match -> knowledge_general
    }
    assert retention_mastery(scores, role="OT") == 50.0
    #   The lenient resolver merges all three into `screening` -> one group -> 40.0.


def test_a_corrupt_out_of_range_score_cannot_reach_a_trainer():
    # retention_scores is fed by a client-supplied `score` on POST /api/gamification/sync
    # that, unlike the xp_delta clamped beside it, is unbounded. Unclamped this returns
    # 10000.0 and renders as a five-figure "mastery" percentage.
    assert retention_mastery({"oct_macula": 100.0}, role="OT") == 100.0
    assert retention_mastery({"oct_macula": -5.0}, role="OT") == 0.0


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
