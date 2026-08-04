"""Station scoring — three buckets 40/30/30, checklist coverage is the largest.

The final /100 is:
    Checklist coverage        (0-40)  deterministic, steps performed ÷ steps total
    Consultation & Technique  (0-30)  history (+ examination technique on manual cases)
    Clinical Judgement & Safety (0-30) recognition + escalation, safety-gated

Coverage counts every step alike — a CRITICAL step is worth the same one step here, and
is punished separately (and once) by the ×SAFETY_CAP gate on Judgement. Pure +
deterministic.
"""
from tools.cases.station_score import compute_station_score, SAFETY_CAP, GRADE_SCALE

STEPS = [
    {"step_number": 1, "action": "Identify patient", "critical": True},
    {"step_number": 2, "action": "Hand hygiene", "critical": True},
    {"step_number": 3, "action": "Measure IOP", "critical": False},
    {"step_number": 4, "action": "Record in EMR", "critical": False},
]
NONCRIT = [{**s, "critical": False} for s in STEPS]
FULL = {"history": 10, "investigations": 10, "diagnosis": 10, "management": 10}
MID = {"history": 6, "investigations": 6, "diagnosis": 6, "management": 6}


def test_perfect_score_is_100_and_exam_ready():
    s = compute_station_score(FULL, STEPS, performed=[1, 2, 3, 4])
    assert s["checklist_coverage"] == 40
    assert s["consult_technique"] == 30
    assert s["judgement_safety"] == 30
    assert s["checklist_coverage_max"] == 40
    assert s["consult_technique_max"] == 30
    assert s["judgement_safety_max"] == 30
    assert s["score_100"] == 100
    assert s["verdict"] == "Exam-ready"
    assert s["safe"] is True
    assert s["missed_critical"] == []
    assert s["total_score"] == 40  # round(100 * 0.4), kept for progression/dashboards


def test_score_stamps_the_grade_scale_so_stored_rows_keep_their_denominators():
    """Every score carries the scheme that produced it.

    `consult_technique` and `judgement_safety` persist as bare INTEGERs, and this scheme
    rescaled them from /50 to /30. Without a stamp travelling alongside, stored rows from
    the two eras are indistinguishable and staff read the rescale as a performance drop
    (tests/api/test_admin_case_scale_marker.py). Bump this whenever the maxima move.
    """
    s = compute_station_score(FULL, STEPS, performed=[1, 2, 3, 4])
    assert s["grade_scale"] == GRADE_SCALE == 2
    # The stamp is what makes the stored maxima recoverable, so it must agree with them.
    assert (s["checklist_coverage_max"], s["consult_technique_max"],
            s["judgement_safety_max"]) == (40, 30, 30)


def test_checklist_coverage_drives_40_points_of_the_score():
    # All non-critical → the safety gate can never move Judgement, so checklist coverage
    # is the ONLY thing differing between the two runs — and it is worth a full 40.
    none = compute_station_score(MID, NONCRIT, performed=[])
    full = compute_station_score(MID, NONCRIT, performed=[1, 2, 3, 4])
    assert full["score_100"] - none["score_100"] == 40
    # 6/10 on every domain → each AI scheme is round(30 * 12/20) = 18.
    assert none["checklist_coverage"] == 0
    assert none["score_100"] == 36
    assert full["checklist_coverage"] == 40
    assert full["consult_technique"] == 18
    assert full["judgement_safety"] == 18
    assert full["score_100"] == 76


def test_partial_coverage_is_prorated():
    s = compute_station_score(MID, NONCRIT, performed=[1, 2])
    assert s["checklist_coverage"] == 20   # round(40 * 2/4)


def test_coverage_counts_a_critical_step_as_one_plain_step():
    """The 40 is plain coverage: a missed CRITICAL costs exactly one step's worth here.
    Its extra penalty is the ×SAFETY_CAP gate on Judgement — charged once, not twice."""
    crit_missed = compute_station_score(FULL, STEPS, performed=[1, 3, 4])       # step 2 critical
    plain_missed = compute_station_score(FULL, NONCRIT, performed=[1, 3, 4])    # step 2 not
    assert crit_missed["checklist_coverage"] == plain_missed["checklist_coverage"] == 30


def test_missed_critical_caps_judgement_and_flags():
    # Miss critical step 2 (hand hygiene): Judgement base 30 capped at 60%, safety flagged.
    s = compute_station_score(FULL, STEPS, performed=[1, 3, 4])
    assert s["safe"] is False
    assert "Hand hygiene" in s["missed_critical"]
    assert s["judgement_safety"] == round(30 * SAFETY_CAP)  # 18
    assert s["consult_technique"] == 30                      # scheme 1 unaffected by safety
    assert s["checklist_coverage"] == 30                     # round(40 * 3/4)
    assert s["score_100"] == 78


def test_manual_scheme1_blends_history_and_technique():
    # Manual case: Consultation & Technique = history + investigations, each half.
    domains = {"history": 10, "investigations": 0, "diagnosis": 0, "management": 0}
    s = compute_station_score(domains, STEPS, performed=[1, 2, 3, 4], has_manual=True)
    assert s["consult_technique"] == 15   # round(30 * (10+0)/20)


def test_conversation_only_scheme1_is_history_only():
    # No procedures → investigations (procedure execution) must NOT drag scheme 1 down.
    hist_only = {"history": 10, "investigations": 0, "diagnosis": 0, "management": 0}
    s = compute_station_score(hist_only, STEPS, performed=[1, 2, 3, 4], has_manual=False)
    assert s["consult_technique"] == 30   # round(30 * 10/10) — history alone
    assert s["judgement_safety"] == 0

    inv_only = {"history": 0, "investigations": 10, "diagnosis": 0, "management": 0}
    s2 = compute_station_score(inv_only, STEPS, performed=[1, 2, 3, 4], has_manual=False)
    assert s2["consult_technique"] == 0   # investigations ignored on conversation-only cases


def test_empty_checklist_awards_the_full_bucket_and_does_not_divide_by_zero():
    """A case with no resolved checklist has nothing to be thorough about — the student
    must not be capped at 60 by a data gap (0 of 155 cases hit this today)."""
    s = compute_station_score(FULL, [], performed=[])
    assert s["safe"] is True
    assert s["checklist_coverage"] == 40
    assert s["consult_technique"] == 30
    assert s["judgement_safety"] == 30
    assert s["score_100"] == 100


def test_total_score_scales_to_40_and_verdict_bands():
    s = compute_station_score(MID, NONCRIT, performed=[1, 2, 3, 4])   # score_100 == 76
    assert s["total_score"] == 30                                     # round(76 * 0.4)
    assert s["verdict"] == "Solid"

    # Full coverage + a weak-but-trying 4/10 on every domain → 40+12+12 = 64, a pass.
    developing = compute_station_score(
        {"history": 4, "investigations": 4, "diagnosis": 4, "management": 4},
        NONCRIT, performed=[1, 2, 3, 4])
    assert developing["score_100"] == 64
    assert developing["verdict"] == "Developing"

    weak = compute_station_score(
        {"history": 2, "investigations": 2, "diagnosis": 2, "management": 2}, NONCRIT, performed=[])
    assert weak["verdict"] == "Keep practising"              # 12 < 60


def test_critical_counts_reported():
    s = compute_station_score(FULL, STEPS, performed=[1, 3, 4])
    assert s["critical_total"] == 2
    assert s["critical_hit"] == 1
