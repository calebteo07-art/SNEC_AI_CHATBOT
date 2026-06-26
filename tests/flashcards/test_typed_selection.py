from tools.flashcards.flashcard_sets import typed_count
from tools.flashcards.static_cards import mark_typed_cards


def test_typed_count_is_about_one_per_five():
    assert typed_count(5) == 1
    assert typed_count(10) == 2
    assert typed_count(20) == 4
    assert typed_count(0) == 0


def test_mark_typed_only_marks_eligible_and_caps_count():
    deck = [
        {"stem": "a", "reasoning_eligible": True},
        {"stem": "b", "reasoning_eligible": False},
        {"stem": "c", "reasoning_eligible": True},
        {"stem": "d", "reasoning_eligible": True},
    ]
    out = mark_typed_cards(deck, n=10)  # typed_count(10) == 2
    typed = [c for c in out if c.get("requires_explanation")]
    assert len(typed) == 2
    assert all(c["reasoning_eligible"] for c in typed)
    # non-eligible card never marked
    assert not next(c for c in out if c["stem"] == "b").get("requires_explanation")


def test_mark_typed_handles_too_few_eligible():
    deck = [{"stem": "a", "reasoning_eligible": True},
            {"stem": "b", "reasoning_eligible": False}]
    out = mark_typed_cards(deck, n=20)  # wants 4, only 1 eligible
    typed = [c for c in out if c.get("requires_explanation")]
    assert len(typed) == 1
