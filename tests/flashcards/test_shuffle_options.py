"""Option-order randomisation for served MCQs.

The static bank authors the correct option(s) first (96% of single cards had the
answer at index 0), so without a shuffle every answer reads as "option A". The
serve path permutes each card's options and remaps `correct` to the new
positions; these tests pin the contract: option TEXT is preserved, the remap is
faithful, the source bank is never mutated, and positions are actually spread.
"""
import random

from tools.flashcards.static_cards import shuffle_card_options


def _correct_texts(card: dict) -> set[str]:
    return {card["options"][i] for i in card["correct"]}


def test_remap_preserves_correct_option_text():
    """After shuffling, the options at the new `correct` indices are exactly the
    same answer texts as before — a faithful remap, not a stale index."""
    card = {
        "stem": "Q", "qtype": "single", "kind": "theory", "explanation": "e",
        "options": ["RIGHT", "wrong1", "wrong2", "wrong3"], "correct": [0],
    }
    out = shuffle_card_options(card, random.Random(7))
    assert sorted(out["options"]) == sorted(card["options"])  # same multiset
    assert _correct_texts(out) == {"RIGHT"}
    assert all(0 <= i < len(out["options"]) for i in out["correct"])


def test_multi_select_remap_is_faithful():
    card = {
        "stem": "Q", "qtype": "multi", "kind": "theory", "explanation": "e",
        "options": ["A-right", "B-right", "C-wrong", "D-wrong"], "correct": [0, 1],
    }
    out = shuffle_card_options(card, random.Random(3))
    assert _correct_texts(out) == {"A-right", "B-right"}
    assert len(out["correct"]) == 2


def test_does_not_mutate_source_card():
    card = {
        "stem": "Q", "qtype": "single", "kind": "theory", "explanation": "e",
        "options": ["x", "y", "z", "w"], "correct": [0],
    }
    before_opts = list(card["options"])
    before_correct = list(card["correct"])
    shuffle_card_options(card, random.Random(1))
    assert card["options"] == before_opts
    assert card["correct"] == before_correct


def test_positions_are_spread_not_all_index_zero():
    """The whole point: a batch of answer-first cards must NOT all keep the
    correct answer at index 0 after serving."""
    rng = random.Random(2026)
    cards = [
        {"stem": f"Q{i}", "qtype": "single", "kind": "theory", "explanation": "e",
         "options": ["RIGHT", "a", "b", "c"], "correct": [0]}
        for i in range(40)
    ]
    out = [shuffle_card_options(c, rng) for c in cards]
    positions = {o["correct"][0] for o in out}
    assert len(positions) > 1, "correct index never moved"
    assert sum(1 for o in out if o["correct"] == [0]) < len(out), "all still at index 0"


def test_short_or_missing_options_are_noop():
    free = {"stem": "Q", "options": [], "correct": [], "qtype": "single",
            "kind": "theory", "explanation": "e"}
    assert shuffle_card_options(free, random.Random(0))["options"] == []
