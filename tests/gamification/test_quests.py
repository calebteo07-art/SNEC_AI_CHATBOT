"""The three daily quests. Pure — generated from (student_id, date, weak_topics).

Nothing about a quest is stored, so the rules below ARE the feature:
  · Deterministic per student per day. Two uvicorn workers must agree, so the seed is
    sha256 and never Python's hash() (which is salted per process by PYTHONHASHSEED).
  · Exactly one of each kind, so a student never gets three flashcard quests.
  · Progress is computed from the activity tally, never separately advanced — which is
    what makes it impossible for a quest bar to disagree with what the student did.
"""
from datetime import date

from tools.gamification.quests import QUEST_KINDS, daily_quests, quest_progress

TODAY = date(2026, 8, 4)
WEAK = ["gonioscopy", "visual fields"]


def test_the_set_is_deterministic_for_one_student_and_day():
    a = daily_quests("ann", TODAY, WEAK)
    b = daily_quests("ann", TODAY, WEAK)
    assert [q.title for q in a] == [q.title for q in b]


def test_different_days_give_different_sets():
    a = daily_quests("ann", TODAY, WEAK)
    b = daily_quests("ann", date(2026, 8, 5), WEAK)
    assert [q.title for q in a] != [q.title for q in b]


def test_different_students_can_differ_on_the_same_day():
    # Not a guarantee for any single pair, so assert across a spread: if every student got
    # the identical set the seed is not mixing the student id in at all.
    sets = {tuple(q.title for q in daily_quests(f"s{i}", TODAY, WEAK)) for i in range(40)}
    assert len(sets) > 1


def test_exactly_one_quest_of_each_kind():
    quests = daily_quests("ann", TODAY, WEAK)
    assert sorted(q.kind for q in quests) == sorted(QUEST_KINDS)


def test_the_adaptive_quest_targets_a_weak_topic():
    quests = daily_quests("ann", TODAY, WEAK)
    adaptive = next(q for q in quests if q.kind == "adaptive")
    assert adaptive.metric.startswith("topic:")
    assert adaptive.metric.removeprefix("topic:") in WEAK


def test_the_adaptive_quest_falls_back_when_there_are_no_weak_topics():
    # A brand-new student has no retention scores yet. The set must still be three quests.
    quests = daily_quests("new", TODAY, [])
    assert len(quests) == len(QUEST_KINDS)
    adaptive = next(q for q in quests if q.kind == "adaptive")
    assert adaptive.metric == "flashcards"


def test_every_quest_has_a_positive_target_and_reward():
    for q in daily_quests("ann", TODAY, WEAK):
        assert q.target > 0
        assert q.reward_xp > 0


def test_progress_reads_a_plain_source_metric():
    quests = daily_quests("ann", TODAY, WEAK)
    breadth = next(q for q in quests if q.kind == "breadth")
    activity = {"flashcards": 2, "osce": 1, "tutor": 0, "topics": {}, "xp": 0}
    assert quest_progress(breadth, activity) == activity[breadth.metric]


def test_progress_reads_a_topic_metric():
    quests = daily_quests("ann", TODAY, WEAK)
    adaptive = next(q for q in quests if q.kind == "adaptive")
    topic = adaptive.metric.removeprefix("topic:")
    activity = {"flashcards": 5, "osce": 0, "tutor": 0, "topics": {topic: 5}, "xp": 0}
    assert quest_progress(adaptive, activity) == 5


def test_progress_reads_the_xp_metric_from_the_activity_dict():
    # xp is NOT stored in daily_state — it already lives in xp_today. The caller merges it
    # into the activity dict, and this pins that contract.
    quests = daily_quests("ann", TODAY, WEAK)
    stretch = next(q for q in quests if q.kind == "stretch")
    assert stretch.metric == "xp"
    assert quest_progress(stretch, {"flashcards": 0, "osce": 0, "tutor": 0, "topics": {}, "xp": 75}) == 75


def test_progress_is_zero_for_an_untouched_metric():
    quests = daily_quests("ann", TODAY, WEAK)
    for q in quests:
        assert quest_progress(q, {"flashcards": 0, "osce": 0, "tutor": 0, "topics": {}, "xp": 0}) == 0
