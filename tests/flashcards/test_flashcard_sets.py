from tools.flashcards.flashcard_sets import DIFFICULTIES, sets_for, make_set_key


def test_three_difficulty_tiers():
    assert DIFFICULTIES == ["easy", "medium", "hard"]


def test_sets_for_has_three_tiers_per_topic():
    sets = sets_for("OA")  # CLINICAL pool, 15 topics
    assert len(sets) == 15 * 3
    keys = {s["set_key"] for s in sets}
    assert make_set_key("triage", "hard") in keys


def test_ot_pool_separate_from_clinical():
    ot = {s["topic_key"] for s in sets_for("OT")}
    clinical = {s["topic_key"] for s in sets_for("OA")}
    assert ot.isdisjoint(clinical)
