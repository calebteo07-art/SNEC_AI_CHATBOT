from tools.flashcards.flashcard_sets import (
    DIFFICULTIES, FLASHCARD_TOPICS, sets_for, topics_for, make_set_key,
)


def test_three_difficulty_tiers():
    assert DIFFICULTIES == ["easy", "medium", "hard"]


def test_sets_for_has_three_tiers_per_topic():
    sets = sets_for("OA")  # FOUNDATIONS + CLINICAL topics
    assert len(sets) == len(topics_for("OA")) * 3
    keys = {s["set_key"] for s in sets}
    assert make_set_key("triage", "hard") in keys


def test_procedural_pools_are_disjoint_but_share_foundations():
    # The procedural topics differ between roles; FOUNDATIONS is shared by both.
    foundation = {k for k, _ in FLASHCARD_TOPICS["FOUNDATIONS"]}
    ot_only = {k for k, _ in FLASHCARD_TOPICS["OT"]}
    clinical_only = {k for k, _ in FLASHCARD_TOPICS["CLINICAL"]}
    assert ot_only.isdisjoint(clinical_only)
    assert foundation <= {s["topic_key"] for s in sets_for("OT")}
    assert foundation <= {s["topic_key"] for s in sets_for("OA")}
