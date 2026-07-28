"""Flashcard aggregation + the weakness score that replaces the weak_topics Counter.

Four defects are pinned here, each of which would put a wrong topic at the top of the
trainer's "teach this next" list:

1. Scale mixing. Inputs arrive on three scales — score_100 (0-100), pass/fail rates
   (0-1) and flashcard accuracy (0-100, the db.get_topic_accuracy `pct` convention,
   db.py:240-243). A naive weighted sum lets the OSCE score dominate the rates 100x.
2. Zero-filling an absent signal. Treating a missing avg_score as 0 makes the group with
   the LEAST data look maximally weak, so the ranking sends trainers to the emptiest
   topics rather than the worst (D13: nulls, not zeros).
3. Small-n noise. One 20/100 attempt is not a weaker topic than a 62-average over 30.
4. Zeroing the safety term when nothing was safety-gradable, which reads as "this topic
   has a perfect safety record" when the truth is "no attempt here carried a safety
   signal at all".
"""
import pytest

from tools.supervisor.cohort_analytics import (
    MIN_ATTEMPTS,
    MIN_STUDENTS,
    SHRINKAGE_K,
    WEIGHT_RUBRIC,
    _weakness_components,
    flashcard_by_group,
    weakness_scores,
)
from tools.supervisor.topic_crosswalk import (
    KNOWLEDGE_GROUP,
    flashcard_group,
    is_knowledge_group,
)

# Resolve group keys THROUGH the crosswalk rather than hardcoding them, so this file
# tests the bucketing path and not a private copy of Task 3's map.
RED = flashcard_group("red_eye")
OCT = flashcard_group("oct_macula")
# Task 3's code review split the 12 FOUNDATIONS topics out of the single knowledge
# bucket, so this is `knowledge_anatomy_physiology` and NOT the KNOWLEDGE_GROUP
# fallback — asserting against KNOWLEDGE_GROUP here would pin the pre-split contract.
ANATOMY = flashcard_group("anatomy_physiology")

POOLS = {"cl1": "CLINICAL", "cl2": "CLINICAL", "ot1": "OT"}


def _row(sid: str, tag: str, correct: bool) -> dict:
    return {"student_id": sid, "topic_tag": tag, "correct": correct, "ts": "2026-07-20T02:00:00Z"}


def _osce(**over) -> dict:
    """An osce_by_group row with every denominator at zero — override only what a test
    actually supplies evidence for."""
    row = {
        "attempts": 0, "students": 0,
        "avg_score": None, "scored_n": 0,
        "pass_rate": None, "graded_n": 0,
        "safety_fail_rate": None, "safety_gradable_n": 0,
        "missed_top": [],
        "by_difficulty": {"beginner": 0, "intermediate": 0, "advanced": 0},
    }
    row.update(over)
    return row


# ── flashcard_by_group ────────────────────────────────────────────────────────

def test_flashcard_by_group_buckets_through_the_crosswalk():
    """Raw topic_tags collapse into case set_key groups, difficulty suffix stripped —
    "red_eye__hard" is the same teaching topic as "red_eye"."""
    rows = [
        _row("cl1", "red_eye", True),
        _row("cl1", "red_eye__hard", False),
        _row("cl2", "red_eye", True),
        _row("cl1", "anatomy_physiology", False),
    ]
    out = flashcard_by_group(rows, POOLS)
    assert out[RED] == {"accuracy": 66.7, "n": 3, "students": 2}
    # 0.0 here is a MEASURED zero (one attempt, wrong), not a stand-in for missing data.
    assert out[ANATOMY] == {"accuracy": 0.0, "n": 1, "students": 1}
    # And a FOUNDATIONS topic keeps its OWN knowledge group rather than collapsing into
    # the shared fallback bucket, which held 28.9% of the card bank in one unactionable row.
    assert is_knowledge_group(ANATOMY) and ANATOMY != KNOWLEDGE_GROUP


def test_flashcard_by_group_filters_to_the_requested_pool():
    """An attempt's discipline comes from the STUDENT, never the topic (spec 4.4), so a
    shared FOUNDATIONS topic still lands in the right pool's view."""
    rows = [_row("cl1", "red_eye", True), _row("ot1", "oct_macula", True)]
    assert set(flashcard_by_group(rows, POOLS, pool="OT")) == {OCT}
    assert set(flashcard_by_group(rows, POOLS, pool="CLINICAL")) == {RED}
    assert set(flashcard_by_group(rows, POOLS)) == {RED, OCT}


def test_flashcard_by_group_resolves_the_group_from_the_students_pool():
    """The pool handed to the crosswalk is load-bearing, not decoration. A deck studied by
    every role but examined by a station in only ONE pool (`ocular_emergencies`, the
    joint-largest CLINICAL set) is an OSCE-backed set_key for OA/PSA and a knowledge group
    for OT, who never sit it. Calling flashcard_group() without the student's pool
    collapses both into the knowledge bucket and silently empties a real station's group —
    the pool-filter test above cannot see that, because it only checks WHICH rows survive."""
    rows = [_row("cl1", "ocular_emergencies", True), _row("ot1", "ocular_emergencies", False)]
    clinical = flashcard_group("ocular_emergencies", "CLINICAL")
    ot = flashcard_group("ocular_emergencies", "OT")
    assert not is_knowledge_group(clinical) and is_knowledge_group(ot)
    assert set(flashcard_by_group(rows, POOLS)) == {clinical, ot}


def test_flashcard_by_group_excludes_students_with_no_discipline():
    """Fail closed: a student whose role didn't resolve is dropped from every view,
    `all` included. The endpoint reports them as totals.unclassified_students instead of
    silently folding staff and typo'd roles into oa_psa."""
    rows = [_row("cl1", "red_eye", True), _row("ghost", "red_eye", False)]
    out = flashcard_by_group(rows, POOLS)
    assert out[RED] == {"accuracy": 100.0, "n": 1, "students": 1}


def test_flashcard_by_group_empty_rows_returns_no_groups():
    """flashcard_attempts is empty in production until Plan A task 0.1 ships, so this is
    the common case, not an edge case: a group with no attempts is ABSENT and the
    endpoint renders `flashcard: null`. It must never materialise as accuracy 0.0."""
    assert flashcard_by_group([], POOLS) == {}


# ── WEIGHT_RUBRIC ─────────────────────────────────────────────────────────────

def test_weight_rubric_is_the_single_source_of_the_constants():
    """No inline magic numbers: the confidence policy Plan B's at-risk model reuses lives
    in the rubric and nowhere else."""
    assert sum(WEIGHT_RUBRIC["weights"].values()) == pytest.approx(1.0)
    assert set(WEIGHT_RUBRIC["scales"]) == set(WEIGHT_RUBRIC["weights"])
    assert WEIGHT_RUBRIC["confidence"] == {
        "min_students": MIN_STUDENTS,
        "min_attempts": MIN_ATTEMPTS,
        "shrinkage_k": SHRINKAGE_K,
    }


# ── weakness_scores ───────────────────────────────────────────────────────────

def test_weakness_components_normalised_to_unit_range():
    """Every component is a 0-1 deficit before weighting. Three signals that all mean
    "25% good" must produce the SAME 0.75 deficit — on raw inputs the 0-100 OSCE score
    would outweigh the 0-1 pass rate 100x."""
    comps = _weakness_components(
        _osce(students=4, avg_score=25.0, scored_n=9, pass_rate=0.25, graded_n=9,
              safety_fail_rate=0.25, safety_gradable_n=9),
        {"accuracy": 25.0, "n": 9, "students": 4},
    )
    assert set(comps) == {"osce_score", "osce_pass", "safety", "flashcard"}
    for name, c in comps.items():
        assert 0.0 <= c["deficit"] <= 1.0, name
    assert comps["osce_score"]["deficit"] == pytest.approx(0.75)
    assert comps["osce_pass"]["deficit"] == pytest.approx(0.75)
    assert comps["flashcard"]["deficit"] == pytest.approx(0.75)
    # Safety is the one signal where HIGHER is worse, so it is not inverted.
    assert comps["safety"]["deficit"] == pytest.approx(0.25)


def test_weakness_components_clamp_out_of_range_inputs():
    """Bad rows must not push a component outside 0-1 and blow past the renormalised
    weight budget — a 140/100 score would otherwise contribute a NEGATIVE deficit."""
    dirty = _weakness_components(
        _osce(students=4, avg_score=140.0, scored_n=9, pass_rate=1.6, graded_n=9,
              safety_fail_rate=2.5, safety_gradable_n=9),
        {"accuracy": -20.0, "n": 9, "students": 4},
    )
    for name, c in dirty.items():
        assert 0.0 <= c["deficit"] <= 1.0, name
    assert dirty["osce_score"]["deficit"] == 0.0
    assert dirty["safety"]["deficit"] == 1.0
    assert dirty["flashcard"]["deficit"] == 1.0


def test_weakness_score_ignores_absent_signals():
    """Weights renormalise over the signals actually present. Identical evidence on
    different signals must score identically — an absent signal is dropped from the
    denominator, never zero-filled (which would score the emptiest group 1.0)."""
    osce = {"osce_only": _osce(attempts=40, students=10, avg_score=90.0, scored_n=40)}
    flashcard = {"flash_only": {"accuracy": 90.0, "n": 40, "students": 10}}
    out = weakness_scores(osce, flashcard)
    assert out["osce_only"]["signals_present"] == ["osce_score"]
    assert out["flash_only"]["signals_present"] == ["flashcard"]
    assert out["osce_only"]["weakness_score"] == 0.0889
    assert out["flash_only"]["weakness_score"] == out["osce_only"]["weakness_score"]
    assert out["osce_only"]["low_confidence"] is False


def test_weakness_score_lists_signals_in_rubric_order():
    """signals_present is what the UI reads back to a trainer to justify a score, so it
    must come out in rubric order — attainment first, recall last — every time, not in
    dict-insertion or alphabetical order. Every other assertion on signals_present in this
    file is a one-element list or a membership check, neither of which can see an order
    change; only a group carrying all four signals discriminates."""
    out = weakness_scores(
        {"g": _osce(attempts=9, students=4, avg_score=50.0, scored_n=9, pass_rate=0.5,
                    graded_n=9, safety_fail_rate=0.1, safety_gradable_n=9)},
        {"g": {"accuracy": 50.0, "n": 9, "students": 4}},
    )["g"]
    assert out["signals_present"] == list(WEIGHT_RUBRIC["weights"])
    # Guards the assertion above from going blind if the rubric is ever reordered into
    # alphabetical order, at which point `sorted(comps)` would satisfy it by accident.
    assert out["signals_present"] != sorted(out["signals_present"])


def test_weakness_score_excludes_safety_term_when_ungradable():
    """safe = not missed_critical, so an attempt on a checklist with no critical step
    yields safe=True carrying no safety signal. With safety_gradable_n == 0 the term is
    EXCLUDED; zero-filling it would renormalise the OSCE weight down and score 0.2222 —
    reading as "safer than the evidence supports"."""
    ungradable = weakness_scores(
        {"g": _osce(attempts=10, students=5, avg_score=50.0, scored_n=10)}, {}
    )["g"]
    assert "safety" not in ungradable["signals_present"]
    assert ungradable["weakness_score"] == 0.3333

    gradable = weakness_scores(
        {"g": _osce(attempts=10, students=5, avg_score=50.0, scored_n=10,
                    safety_fail_rate=0.0, safety_gradable_n=8)}, {}
    )["g"]
    # A MEASURED zero safety-fail rate legitimately pulls the weakness down. That is the
    # whole difference between "no signal" and "a clean signal".
    assert "safety" in gradable["signals_present"]
    assert gradable["weakness_score"] == 0.2222


def test_weakness_score_small_n_does_not_top_ranking():
    """One catastrophic attempt must not outrank a well-sampled mediocre topic.
    Undamped, `thin` scores 0.8769 vs `deep` 0.4261 and tops the list off n=1."""
    osce = {
        "thin": _osce(attempts=1, students=1, avg_score=20.0, scored_n=1,
                      pass_rate=0.0, graded_n=1),
        "deep": _osce(attempts=30, students=8, avg_score=62.0, scored_n=30,
                      pass_rate=0.5, graded_n=30),
    }
    out = weakness_scores(osce, {})
    assert out["thin"]["weakness_score"] == 0.1462
    assert out["deep"]["weakness_score"] == 0.3653
    assert out["thin"]["low_confidence"] is True
    assert out["deep"]["low_confidence"] is False
    # The endpoint's ranking key — low-confidence groups sort below confident ones.
    ranked = sorted(
        out.items(), key=lambda kv: (kv[1]["low_confidence"], -kv[1]["weakness_score"])
    )
    assert [k for k, _ in ranked] == ["deep", "thin"]


def test_weakness_score_low_confidence_needs_both_floors():
    """Both floors, not either: 20 attempts from 2 students is one pair of students'
    habits, and 3 students with 4 attempts between them is noise."""
    osce = {
        "few_students": _osce(attempts=20, students=2, avg_score=50.0, scored_n=20),
        "few_attempts": _osce(attempts=4, students=3, avg_score=50.0, scored_n=4),
        "confident": _osce(attempts=MIN_ATTEMPTS, students=MIN_STUDENTS,
                           avg_score=50.0, scored_n=MIN_ATTEMPTS),
    }
    out = weakness_scores(osce, {})
    assert out["few_students"]["low_confidence"] is True
    assert out["few_attempts"]["low_confidence"] is True
    assert out["confident"]["low_confidence"] is False


def test_weakness_score_null_when_no_signals():
    """A group with attempts but no gradable column, and a group with nothing at all,
    both score None — never 0.0, which renders as "this topic is perfect" (D13)."""
    out = weakness_scores({"ungraded": _osce(attempts=3, students=2), "bare": _osce()}, {})
    for key in ("ungraded", "bare"):
        assert out[key]["weakness_score"] is None
        assert out[key]["signals_present"] == []
        assert out[key]["low_confidence"] is True
