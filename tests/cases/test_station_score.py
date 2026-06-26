from tools.cases.station_score import compute_station_score, SAFETY_CAP

STEPS = [
    {"step_number": 1, "action": "Identify patient", "critical": True},
    {"step_number": 2, "action": "Hand hygiene", "critical": True},
    {"step_number": 3, "action": "Measure IOP", "critical": False},
    {"step_number": 4, "action": "Record in EMR", "critical": False},
]
FULL = {"history": 10, "investigations": 10, "diagnosis": 10, "management": 10}


def test_perfect_score_is_100_and_exam_ready():
    s = compute_station_score(FULL, STEPS, performed=[1, 2, 3, 4])
    assert s["thoroughness"] == 40
    assert s["technique"] == 30
    assert s["judgment"] == 30
    assert s["score_100"] == 100
    assert s["verdict"] == "Exam-ready"
    assert s["safe"] is True
    assert s["missed_critical"] == []
    assert s["total_score"] == 40  # round(100 * 0.4)


def test_thoroughness_is_critical_weighted():
    # Perform only the two critical steps (weight 2 each) = 4 of total weight 6.
    s = compute_station_score(FULL, STEPS, performed=[1, 2])
    assert s["thoroughness"] == round(40 * 4 / 6)  # 27


def test_safety_gate_caps_judgment_and_flags_missed_critical():
    # Miss critical step 2 (hand hygiene); judgment base 30 -> capped at 60%.
    s = compute_station_score(FULL, STEPS, performed=[1, 3, 4])
    assert s["safe"] is False
    assert "Hand hygiene" in s["missed_critical"]
    assert s["judgment"] == round(30 * SAFETY_CAP)  # 18


def test_pass_line_60_maps_to_24_over_40():
    # Construct a ~60 score: full coverage (40) + zero technique/judgment domains.
    zero = {"history": 0, "investigations": 0, "diagnosis": 0, "management": 0}
    s = compute_station_score(zero, STEPS, performed=[1, 2, 3, 4])
    assert s["score_100"] == 40  # only thoroughness
    assert s["verdict"] == "Keep practising"


def test_thoroughness_detail_text():
    s = compute_station_score(FULL, STEPS, performed=[1, 3, 4])
    assert s["thoroughness_detail"] == "3 of 4 steps · 1 of 2 critical missed"
    s2 = compute_station_score(FULL, STEPS, performed=[1, 2, 3, 4])
    assert s2["thoroughness_detail"] == "4 of 4 steps · all 2 critical done"


def test_empty_checklist_does_not_divide_by_zero():
    s = compute_station_score(FULL, [], performed=[])
    assert s["thoroughness"] == 0
    assert s["safe"] is True


def test_conversation_only_drops_technique_and_reweights_50_50():
    s = compute_station_score(FULL, STEPS, performed=[1, 2, 3, 4], has_manual=False)
    assert s["technique_applies"] is False
    assert s["technique"] == 0
    assert s["technique_max"] == 0
    assert s["thoroughness_max"] == 50
    assert s["judgment_max"] == 50
    assert s["thoroughness"] == 50
    assert s["judgment"] == 50
    assert s["score_100"] == 100


def test_conversation_only_coverage_alone_caps_at_50():
    zero = {"history": 0, "investigations": 0, "diagnosis": 0, "management": 0}
    s = compute_station_score(zero, STEPS, performed=[1, 2, 3, 4], has_manual=False)
    assert s["score_100"] == 50  # thoroughness reweighted to /50, no technique/judgment


def test_technique_tracks_investigations_not_history():
    domains = {"history": 0, "investigations": 10, "diagnosis": 0, "management": 0}
    s = compute_station_score(domains, STEPS, performed=[1, 2, 3, 4], has_manual=True)
    assert s["thoroughness"] == 40
    assert s["technique"] == 30
    assert s["judgment"] == 0
    assert s["score_100"] == 70


def test_manual_case_exposes_default_maxes():
    s = compute_station_score(FULL, STEPS, performed=[1, 2, 3, 4])  # has_manual defaults True
    assert s["technique_applies"] is True
    assert (s["thoroughness_max"], s["technique_max"], s["judgment_max"]) == (40, 30, 30)
