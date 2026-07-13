"""Station scoring — two schemes, each /50, checklist coverage does NOT score.

The final /100 is two AI-graded schemes only:
    Consultation & Technique (0-50)   history (+ examination technique on manual cases)
    Clinical Judgement & Safety (0-50) recognition + escalation, safety-gated

The checklist no longer awards coverage points; a missed CRITICAL step still raises the
safety flag and caps Judgement & Safety. Pure + deterministic.
"""
from tools.cases.station_score import compute_station_score, SAFETY_CAP

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
    assert s["consult_technique"] == 50
    assert s["judgement_safety"] == 50
    assert s["consult_technique_max"] == 50
    assert s["judgement_safety_max"] == 50
    assert s["score_100"] == 100
    assert s["verdict"] == "Exam-ready"
    assert s["safe"] is True
    assert s["missed_critical"] == []
    assert s["total_score"] == 40  # round(100 * 0.4), kept for progression/dashboards


def test_checklist_coverage_does_not_change_the_score():
    # All non-critical → the safety gate can never move Judgement, so checklist coverage
    # is the ONLY thing differing between the two runs — and it must NOT change the score.
    none = compute_station_score(MID, NONCRIT, performed=[])
    full = compute_station_score(MID, NONCRIT, performed=[1, 2, 3, 4])
    assert none["score_100"] == full["score_100"]
    # Score is domain-driven only: history+investigations=12/20 → 30; diagnosis+management=12/20 → 30.
    assert full["consult_technique"] == 30
    assert full["judgement_safety"] == 30
    assert full["score_100"] == 60


def test_missed_critical_caps_judgement_and_flags():
    # Miss critical step 2 (hand hygiene): Judgement base 50 capped at 60%, safety flagged.
    s = compute_station_score(FULL, STEPS, performed=[1, 3, 4])
    assert s["safe"] is False
    assert "Hand hygiene" in s["missed_critical"]
    assert s["judgement_safety"] == round(50 * SAFETY_CAP)  # 30
    assert s["consult_technique"] == 50                      # scheme 1 unaffected by safety
    assert s["score_100"] == 80


def test_manual_scheme1_blends_history_and_technique():
    # Manual case: Consultation & Technique = history + investigations, each half.
    domains = {"history": 10, "investigations": 0, "diagnosis": 0, "management": 0}
    s = compute_station_score(domains, STEPS, performed=[1, 2, 3, 4], has_manual=True)
    assert s["consult_technique"] == 25   # round(50 * (10+0)/20)


def test_conversation_only_scheme1_is_history_only():
    # No procedures → investigations (procedure execution) must NOT drag scheme 1 down.
    hist_only = {"history": 10, "investigations": 0, "diagnosis": 0, "management": 0}
    s = compute_station_score(hist_only, STEPS, performed=[1, 2, 3, 4], has_manual=False)
    assert s["consult_technique"] == 50   # round(50 * 10/10) — history alone
    assert s["judgement_safety"] == 0

    inv_only = {"history": 0, "investigations": 10, "diagnosis": 0, "management": 0}
    s2 = compute_station_score(inv_only, STEPS, performed=[1, 2, 3, 4], has_manual=False)
    assert s2["consult_technique"] == 0   # investigations ignored on conversation-only cases


def test_empty_checklist_is_safe_and_does_not_divide_by_zero():
    s = compute_station_score(FULL, [], performed=[])
    assert s["safe"] is True
    assert s["consult_technique"] == 50
    assert s["judgement_safety"] == 50
    assert s["score_100"] == 100


def test_total_score_scales_to_40_and_verdict_bands():
    s = compute_station_score(MID, NONCRIT, performed=[])   # score_100 == 60
    assert s["total_score"] == 24                            # round(60 * 0.4)
    assert s["verdict"] == "Developing"                      # 60 is the pass line

    weak = compute_station_score(
        {"history": 2, "investigations": 2, "diagnosis": 2, "management": 2}, NONCRIT, performed=[])
    assert weak["verdict"] == "Keep practising"              # 20 < 60


def test_critical_counts_reported():
    s = compute_station_score(FULL, STEPS, performed=[1, 3, 4])
    assert s["critical_total"] == 2
    assert s["critical_hit"] == 1
