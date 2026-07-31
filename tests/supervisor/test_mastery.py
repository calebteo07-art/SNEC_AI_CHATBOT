"""Three mastery scales against an explicit peer set (spec §6.2, D13)."""

from tools.supervisor.mastery import mastery_block, retention_mastery


# ── the three scales ─────────────────────────────────────────────────────────

def _own(osce=90.0, flashcard=80.0, retention=70.0):
    return {"osce": osce, "flashcard": flashcard, "retention": retention}


def _peers():
    """Two peers with every scale, one with only retention. The viewed student is NEVER
    in here — the caller drops them before calling."""
    return {
        "s2": {"osce": 60.0, "flashcard": 40.0, "retention": 50.0},
        "s3": {"osce": 30.0, "flashcard": 60.0, "retention": 70.0},
        "s4": {"retention": 60.0},
    }


def test_returns_three_separately_named_scales():
    # Never one blended number: OSCE attainment, flashcard recall and retention measure
    # different things, and averaging them would hide which one to act on.
    out = mastery_block(_own(), _peers())
    assert set(out) == {"osce_mastery", "flashcard_mastery", "retention_mastery"}


def test_the_cohort_average_is_the_mean_of_the_peers_only():
    out = mastery_block(_own(), _peers())
    assert out["osce_mastery"]["cohort_avg"] == 45.0     # (60 + 30) / 2
    assert out["osce_mastery"]["peers_n"] == 2
    assert out["retention_mastery"]["cohort_avg"] == 60.0  # (50 + 70 + 60) / 3
    assert out["retention_mastery"]["peers_n"] == 3


def test_delta_is_against_the_peer_mean():
    out = mastery_block(_own(), _peers())
    assert out["osce_mastery"]["value"] == 90.0
    assert out["osce_mastery"]["delta"] == 45.0          # 90 - 45


def test_the_student_is_never_in_their_own_peer_average():
    # The reason this takes `peers` instead of the whole cohort. Including the student
    # makes a solo student's delta exactly 0.0 — "exactly at the cohort average" when the
    # truth is "there is no cohort" — and it is the caller who knows which id to drop.
    peers = _peers()
    solo = mastery_block(_own(), {})
    assert solo["osce_mastery"]["cohort_avg"] is None
    assert solo["osce_mastery"]["delta"] is None
    assert solo["osce_mastery"]["peers_n"] == 0
    # ...and a peer set that is missing this student gives a mean untouched by their score.
    assert mastery_block(_own(osce=0.0), peers)["osce_mastery"]["cohort_avg"] == 45.0


def test_a_fresh_own_value_does_not_move_the_peer_mean():
    # The whole point of dropping leave_one_out. The own value is read fresh while the
    # peer rows come from a cache up to 45s old, so a peer mean derived by SUBTRACTING the
    # own value from a total that includes them is computed from two different moments:
    # a student cached at 60 who has since scored 80 yielded (180-80)/2 = 50 instead of 60.
    peers = {"s2": {"osce": 60.0}, "s3": {"osce": 60.0}}
    assert mastery_block({"osce": 60.0}, peers)["osce_mastery"]["cohort_avg"] == 60.0
    assert mastery_block({"osce": 80.0}, peers)["osce_mastery"]["cohort_avg"] == 60.0
    assert mastery_block({"osce": None}, peers)["osce_mastery"]["cohort_avg"] == 60.0


def test_cohort_n_counts_the_student_in_only_when_they_have_the_scale():
    # cohort_n is a data-density figure ("how much evidence backs this comparison"),
    # peers_n is the divisor. A UI rendering cohort_n as the peer count reads "vs 3 peers"
    # beside an average of 2.
    out = mastery_block(_own(flashcard=None), _peers())
    assert (out["osce_mastery"]["cohort_n"], out["osce_mastery"]["peers_n"]) == (3, 2)
    assert (out["flashcard_mastery"]["cohort_n"], out["flashcard_mastery"]["peers_n"]) == (2, 2)


def test_a_scale_the_student_lacks_is_null_with_the_cohort_still_shown():
    out = mastery_block(_own(retention=None), _peers())
    assert out["retention_mastery"]["value"] is None
    assert out["retention_mastery"]["delta"] is None, "a delta against nothing is not a zero"
    assert out["retention_mastery"]["cohort_avg"] == 60.0


def test_a_genuine_zero_is_a_value_not_missing_data():
    out = mastery_block({"osce": 0.0}, {"s2": {"osce": 50.0}})
    assert out["osce_mastery"]["value"] == 0.0
    assert out["osce_mastery"]["delta"] == -50.0
    assert out["osce_mastery"]["cohort_n"] == 2, "a real 0.0 counts toward the density"


def test_a_peer_missing_a_scale_is_excluded_not_zero_filled():
    # A zero would join the denominator and drag the average down, flattering everyone
    # measured against it.
    out = mastery_block({"osce": 90.0}, {"s2": {"osce": 60.0}, "s3": {"osce": None}})
    assert out["osce_mastery"]["cohort_avg"] == 60.0
    assert out["osce_mastery"]["peers_n"] == 1


def test_no_peers_and_no_own_value_is_all_nulls():
    out = mastery_block({}, {})
    for scale in ("osce_mastery", "flashcard_mastery", "retention_mastery"):
        assert out[scale] == {"value": None, "cohort_avg": None, "delta": None,
                              "cohort_n": 0, "peers_n": 0}


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
