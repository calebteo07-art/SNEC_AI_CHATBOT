"""The knowledge x performance map (spec §4.1)."""
from tools.supervisor.topic_map import (
    Cell, MIN_PEERS, TopicRow, band_for, build_topic_map, cohort_topic_means,
    contrast_for, flag_for, flashcard_cells, norm_key, retention_cells,
    station_cells, topic_union,
)


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


def test_flashcard_cells_bucket_a_blank_tag_as_general_rather_than_dropping_it():
    """A blank-but-truthy tag reaches the table through a direct API call (student.py:462
    has no content validation). Dropping the row would lose an attempt with no counter --
    the one thing station_cells' `excluded` dict exists to prevent."""
    cells = flashcard_cells([{"topic_tag": "   ", "correct": True},
                             {"topic_tag": None, "correct": False}])
    assert cells["general"].n == 2


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


def test_every_flag_for_output_is_ranked():
    """build_topic_map subscripts _FLAG_RANK, so a new flag added to flag_for without a rank
    is a KeyError at report time. Pinned here so the omission fails in CI instead."""
    from tools.supervisor.topic_map import _FLAG_RANK
    assert set(_FLAG_RANK) == {"knows_cant_do", "consistent_gap", "rote", ""}


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


def test_a_topic_with_no_banded_axis_sorts_below_a_confirmed_strong_one():
    """A 2-card topic has no verdict, so it sorts last among unflagged rows. Deliberate: the
    map is read top-down for what to TEACH, and 'we have not measured this' is an assessment
    gap, not a teaching one. It is still printed, with its band and its n, so it never
    disappears -- that is what makes sinking it honest rather than quiet."""
    result = build_topic_map(
        card_rows=([{"topic_tag": "unmeasured", "correct": True}] * 2
                   + [{"topic_tag": "solid", "correct": True}] * 20),
        case_rows=[], retention_scores=None, case_topics={},
    )
    assert [r.topic for r in result.rows] == ["solid", "unmeasured"]
    assert result.rows[1].flashcards.band == "thin"
    assert result.rows[1].flashcards.n == 2


def test_cohort_means_exclude_the_student_being_measured():
    """Leave-one-out: a student is never an input to the average they are measured against."""
    cards = ([{"student_id": "me", "topic_tag": "tonometry", "correct": False}] * 10
             + [{"student_id": "p1", "topic_tag": "tonometry", "correct": True}] * 10
             + [{"student_id": "p2", "topic_tag": "tonometry", "correct": True}] * 10)
    means = cohort_topic_means(card_rows=cards, case_rows=[], case_topics={},
                               exclude_student_id="me")
    assert means["tonometry"]["flashcards"] == (100.0, 2)


def test_cohort_means_average_students_not_pooled_cards():
    """Per-student then mean, so one heavy user cannot dominate the baseline."""
    cards = ([{"student_id": "p1", "topic_tag": "t", "correct": True}] * 100
             + [{"student_id": "p2", "topic_tag": "t", "correct": False}] * 2)
    means = cohort_topic_means(card_rows=cards, case_rows=[], case_topics={},
                               exclude_student_id="me")
    assert means["t"]["flashcards"] == (50.0, 2)


def test_contrast_individual_gap():
    row = TopicRow(topic="t", flashcards=_fc(40.0), station=Cell(), retention=Cell())
    c = contrast_for(row, {"t": {"flashcards": (80.0, 5)}})
    assert c is not None and c.label == "individual_gap"
    assert c.cohort_mean == 80.0 and c.peers == 5


def test_contrast_cohort_gap_when_the_peers_are_weak_too():
    """The curriculum signal: the student is weak AND so is everyone else."""
    row = TopicRow(topic="t", flashcards=_fc(52.0), station=Cell(), retention=Cell())
    c = contrast_for(row, {"t": {"flashcards": (55.0, 5)}})
    assert c is not None and c.label == "cohort_gap"


def test_contrast_both_when_the_student_trails_a_weak_cohort():
    row = TopicRow(topic="t", flashcards=_fc(30.0), station=Cell(), retention=Cell())
    c = contrast_for(row, {"t": {"flashcards": (60.0, 5)}})
    assert c is not None and c.label == "individual_gap_in_cohort_gap"


def test_contrast_refuses_a_baseline_below_the_peer_minimum():
    """Two peers is not a cohort. The row reports the shortfall instead of a number."""
    row = TopicRow(topic="t", flashcards=_fc(30.0), station=Cell(), retention=Cell())
    c = contrast_for(row, {"t": {"flashcards": (90.0, MIN_PEERS - 1)}})
    assert c is not None and c.label == "no_baseline" and c.peers == MIN_PEERS - 1


def test_contrast_is_none_when_the_student_is_not_weak_there():
    row = TopicRow(topic="t", flashcards=_fc(90.0), station=Cell(), retention=Cell())
    assert contrast_for(row, {"t": {"flashcards": (50.0, 9)}}) is None
