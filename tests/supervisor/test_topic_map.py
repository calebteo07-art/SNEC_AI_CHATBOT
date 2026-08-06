"""The knowledge x performance map (spec §4.1)."""
from tools.supervisor.topic_map import norm_key, topic_union


def test_norm_key_collapses_the_three_namespaces():
    assert norm_key("Visual_Fields") == "visual fields"
    assert norm_key("  VISUAL   FIELDS  ") == "visual fields"
    assert norm_key("visual fields") == "visual fields"


def test_norm_key_is_empty_for_nothing():
    assert norm_key(None) == ""
    assert norm_key("   ") == ""


def test_topic_union_keeps_a_topic_present_in_only_one_source():
    """The defect this module exists to fix: the old report iterated retention_scores and
    looked flashcards up by that key, so a flashcard-only topic never appeared at all."""
    rows = topic_union(
        flashcards={"tonometry": 1},
        stations={"visual fields": 1},
        retention={"Gonioscopy": 1},
    )
    assert rows == ["gonioscopy", "tonometry", "visual fields"]


def test_topic_union_merges_the_same_topic_written_three_ways():
    rows = topic_union(
        flashcards={"visual_fields": 1},
        stations={"Visual Fields": 1},
        retention={"VISUAL FIELDS": 1},
    )
    assert rows == ["visual fields"]


from tools.supervisor.topic_map import Cell, band_for, flashcard_cells, station_cells, retention_cells


def test_band_for_uses_the_axis_weak_line():
    # 62 is a PASS at a station (pass mark 60) and WEAK on flashcards (weak line 65).
    assert band_for(62.0, n=10, minimum=5, weak_line=60.0) == "developing"
    assert band_for(62.0, n=10, minimum=5, weak_line=65.0) == "weak"


def test_band_for_is_thin_below_the_minimum():
    """A value computed from 2 cards is reported WITH its n and no verdict -- 'weak' off two
    cards is a claim the data cannot support."""
    assert band_for(20.0, n=2, minimum=5, weak_line=65.0) == "thin"


def test_band_for_is_absent_with_no_data():
    assert band_for(None, n=0, minimum=5, weak_line=65.0) == "absent"


def test_flashcard_cells_grade_on_correctness_not_on_score():
    """`score` is an XP value with a combo multiplier (student.py:528). Averaging it would
    print a grade that rises with a student's answer STREAK."""
    rows = [
        {"topic_tag": "tonometry", "correct": True, "score": 24},
        {"topic_tag": "Tonometry", "correct": False, "score": 0},
        {"topic_tag": "tonometry", "correct": True, "score": 2},
    ]
    cells = flashcard_cells(rows)
    assert cells["tonometry"].value == 66.7
    assert cells["tonometry"].n == 3
    assert cells["tonometry"].band == "thin"   # n=3 < MIN_CARDS


def test_station_cells_average_the_hundred_scale_and_report_exclusions():
    rows = [
        {"case_id": "c1", "score_100": 80},
        {"case_id": "c1", "score_100": 60},
        {"case_id": "c9", "score_100": 10},    # not in the index -> unmapped
        {"case_id": "c1", "total_score": 30},  # pre-011 row, no /100 -> unscored
    ]
    cells, excl = station_cells(rows, {"c1": "Tonometry"})
    assert cells["tonometry"].value == 70.0
    assert cells["tonometry"].n == 2
    assert excl == {"unmapped_case": 1, "unscored": 1}


def test_retention_cells_scale_the_zero_to_one_dict():
    cells = retention_cells({"Visual_Fields": 0.42})
    assert cells["visual fields"].value == 42.0
    assert cells["visual fields"].band == "weak"


from tools.supervisor.topic_map import flag_for, build_topic_map


def _cell(value, n, minimum, weak_line):
    return Cell(value=value, n=n, band=band_for(value, n=n, minimum=minimum, weak_line=weak_line))


def _fc(value, n=20):
    return _cell(value, n, 5, 65.0)


def _st(value, n=3):
    return _cell(value, n, 1, 60.0)


def test_flag_knows_it_cant_do_it():
    assert flag_for(_fc(88.0), _st(41.0)) == "knows_cant_do"


def test_flag_rote():
    assert flag_for(_fc(50.0), _st(82.0)) == "rote"


def test_flag_consistent_gap():
    assert flag_for(_fc(48.0), _st(52.0)) == "consistent_gap"


def test_no_flag_when_the_two_agree():
    assert flag_for(_fc(80.0), _st(78.0)) == ""


def test_a_flag_never_fires_off_a_thin_cell():
    """4 cards is not evidence of knowledge, so 'knows it, can't do it' is not a claim we can
    make -- however tempting the shape of the numbers."""
    assert flag_for(_fc(100.0, n=4), _st(30.0)) == ""


def test_a_flag_never_fires_off_an_absent_cell():
    assert flag_for(Cell(), _st(30.0)) == ""
    assert flag_for(_fc(90.0), Cell()) == ""


def test_build_topic_map_leads_with_the_flagged_rows():
    """A trainer reads the map top-down for what to do next, so the actionable rows are
    first and the order is deterministic."""
    result = build_topic_map(
        card_rows=([{"topic_tag": "tonometry", "correct": True}] * 18
                   + [{"topic_tag": "gonioscopy", "correct": True}] * 18),
        case_rows=[{"case_id": "c1", "score_100": 30}, {"case_id": "c2", "score_100": 95}],
        retention_scores={"perimetry": 0.9},
        case_topics={"c1": "Tonometry", "c2": "Gonioscopy"},
    )
    assert [r.topic for r in result.rows][0] == "tonometry"
    assert result.rows[0].flag == "knows_cant_do"
    # The retention-only topic still gets a row, with two absent cells.
    perimetry = next(r for r in result.rows if r.topic == "perimetry")
    assert perimetry.flashcards.band == "absent" and perimetry.station.band == "absent"
    assert perimetry.retention.value == 90.0
