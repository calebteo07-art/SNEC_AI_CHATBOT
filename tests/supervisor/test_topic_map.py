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
