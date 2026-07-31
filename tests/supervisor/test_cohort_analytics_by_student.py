"""Per-student aggregation for the at-risk and mastery models (spec §6.1, §6.2, D9)."""

from tools.supervisor.cohort_analytics import flashcard_by_student, osce_by_group, osce_by_student


def _row(sid, case_id, **over):
    row = {"student_id": sid, "case_id": case_id, "score_100": None,
           "passed": False, "safe": None, "missed_critical": []}
    row.update(over)
    return row


def test_retakes_use_the_best_attempt_per_case():
    # D9: five attempts at one case is ONE attainment datapoint at the high-water mark,
    # but five raw attempts for volume. Averaging all five would let a student lower
    # their own mastery by practising.
    rows = [_row("s1", "c1", score_100=20 + i * 10, passed=i >= 3) for i in range(5)]
    out = osce_by_student(rows)
    assert out["s1"]["attempts"] == 5
    assert out["s1"]["avg_score"] == 60.0     # best of 20/30/40/50/60
    assert out["s1"]["scored_n"] == 1         # one (student, case) pair
    assert out["s1"]["pass_rate"] == 1.0      # best attempt passed
    assert out["s1"]["graded_n"] == 1


def test_unscored_retake_still_high_waters_on_passed():
    # Over half of production case_progress rows have NULL score_100. For those pairs
    # score and null-ness tie, so `passed` is the only separator — and rows arrive
    # oldest-first. Without the tie-break a fail-then-pass reads as a fail.
    rows = [_row("s1", "c1", passed=False), _row("s1", "c1", passed=True)]
    out = osce_by_student(rows)
    assert out["s1"]["pass_rate"] == 1.0
    assert out["s1"]["avg_score"] is None      # nothing was scored
    assert out["s1"]["scored_n"] == 0


def test_safety_is_over_raw_attempts_not_best_per_case():
    # A safety fail is an EVENT. Deduping it to the best attempt would let a student
    # erase an unsafe encounter by retaking the case safely.
    rows = [_row("s1", "c1", safe=False), _row("s1", "c1", safe=True)]
    out = osce_by_student(rows)
    assert out["s1"]["safety_gradable_n"] == 2
    assert out["s1"]["safety_fail_rate"] == 0.5


def test_null_safe_is_excluded_from_the_safety_denominator():
    rows = [_row("s1", "c1", safe=None), _row("s1", "c2", safe=False)]
    out = osce_by_student(rows)
    assert out["s1"]["safety_gradable_n"] == 1
    assert out["s1"]["safety_fail_rate"] == 1.0


def test_no_gradable_rows_yields_none_not_zero():
    # D13. A 0.0 pass_rate renders as "failed everything"; the truth is "nothing graded".
    rows = [_row("s1", "c1", passed=None, safe=None)]
    out = osce_by_student(rows)
    assert out["s1"]["pass_rate"] is None
    assert out["s1"]["safety_fail_rate"] is None
    assert out["s1"]["avg_score"] is None
    assert out["s1"]["attempts"] == 1


def test_students_are_kept_separate():
    rows = [_row("s1", "c1", score_100=90, passed=True),
            _row("s2", "c1", score_100=10, passed=False)]
    out = osce_by_student(rows)
    assert out["s1"]["avg_score"] == 90.0
    assert out["s2"]["avg_score"] == 10.0


def test_rows_without_a_student_id_are_dropped():
    out = osce_by_student([_row("", "c1", score_100=50, passed=True)])
    assert out == {}


def test_flashcard_accuracy_is_per_student_on_the_0_100_scale():
    # Same `pct` convention as db.get_topic_accuracy (db.py:240-243), so a student's
    # mastery figure and their own topic breakdown are directly comparable.
    rows = [{"student_id": "s1", "topic_tag": "glaucoma", "correct": True},
            {"student_id": "s1", "topic_tag": "glaucoma", "correct": False},
            {"student_id": "s1", "topic_tag": "retina", "correct": True},
            {"student_id": "s2", "topic_tag": "glaucoma", "correct": False}]
    out = flashcard_by_student(rows)
    assert out["s1"] == {"accuracy": 66.7, "n": 3}
    assert out["s2"] == {"accuracy": 0.0, "n": 1}


def test_flashcard_student_with_no_rows_is_absent_not_zero():
    # Absence is the no-data signal; the caller passes None to score_student, which
    # drops the signal. A 0.0 accuracy row would score as total recall failure.
    out = flashcard_by_student([])
    assert out == {}


def test_group_and_student_projections_agree_on_the_same_rows():
    # osce_by_group and osce_by_student duplicate the same metric projection on
    # purpose (a shared accumulator would need key_fn/filter_fn/three group-only
    # sub-accumulators — callback soup, and P4 dissolves both into SQL anyway). Nothing
    # else pins the two copies together, so this exists to catch one silently
    # diverging from the other — e.g. a rounding change made in only one of them.
    # Three distinct cases so avg_score/pass_rate/safety_fail_rate are all
    # non-terminating fractions, not integers a rounding-precision bug could hide in.
    rows = [_row("s1", "c1", score_100=55, passed=True, safe=True),
            _row("s1", "c2", score_100=60, passed=False, safe=False),
            _row("s1", "c3", score_100=70, passed=True, safe=True)]
    case_index = {cid: {"pool": "CLINICAL", "set_key": "g1", "label": "Group 1",
                         "difficulty": "beginner"} for cid in ("c1", "c2", "c3")}
    pools_by_student = {"s1": "CLINICAL"}

    group = osce_by_group(rows, case_index, pools_by_student)["g1"]
    student = osce_by_student(rows)["s1"]

    assert group["avg_score"] == student["avg_score"]
    assert group["pass_rate"] == student["pass_rate"]
    assert group["safety_fail_rate"] == student["safety_fail_rate"]


def test_flashcard_accuracy_is_the_whole_bank_figure():
    from tools.supervisor.cohort_analytics import flashcard_accuracy

    # db.get_topic_accuracy's shape: {topic_tag: {"correct", "total", "pct"}}.
    topics = {"red_eye": {"correct": 3, "total": 4, "pct": 75.0},
              "glaucoma": {"correct": 1, "total": 6, "pct": 16.7}}
    # 4 of 10 attempts, NOT the mean of 75.0 and 16.7 (45.9) — averaging the per-topic
    # percentages would weight a 4-card topic the same as a 40-card one.
    assert flashcard_accuracy(topics) == 40.0


def test_flashcard_accuracy_agrees_with_the_cohort_definition():
    from tools.supervisor.cohort_analytics import flashcard_accuracy

    # The student's own value and their peers' MUST be one definition, or the delta on
    # the detail page compares two different measurements.
    rows = [{"student_id": "s1", "topic_tag": "red_eye", "correct": True},
            {"student_id": "s1", "topic_tag": "red_eye", "correct": False},
            {"student_id": "s1", "topic_tag": "glaucoma", "correct": True}]
    from_cohort = flashcard_by_student(rows)["s1"]["accuracy"]
    from_topics = flashcard_accuracy({"red_eye": {"correct": 1, "total": 2},
                                      "glaucoma": {"correct": 1, "total": 1}})
    assert from_topics == from_cohort == 66.7


def test_flashcard_accuracy_is_none_not_zero_without_attempts():
    from tools.supervisor.cohort_analytics import flashcard_accuracy

    # A thin flashcard_attempts table is the norm. 0.0 reads as total recall failure and
    # would drag the cohort average down as if the student had answered everything wrong.
    assert flashcard_accuracy({}) is None
    assert flashcard_accuracy({"red_eye": {"correct": 0, "total": 0}}) is None


def test_flashcard_accuracy_keeps_a_genuine_zero():
    from tools.supervisor.cohort_analytics import flashcard_accuracy

    # The opposite error: a student who really did get every card wrong scores 0.0, and
    # that is a real reading, not missing data.
    assert flashcard_accuracy({"red_eye": {"correct": 0, "total": 5}}) == 0.0
