"""Deck levels: every topic's 50 cards split into 5 decks of 10, easiest first.

The level assignment is a per-topic PERMUTATION of the topic's card indices
(easiest -> hardest). The identity permutation is the shipped fallback and is
already a valid ramp, because get_topic_cards returns easy(17) -> medium(17)
-> hard(16). An AI-generated ranking replaces the permutation without touching
the card bank.
"""
import pytest

from tools.flashcards.card_levels import (
    DECK_COUNT, DECK_SIZE, deck_tier_means, get_deck_cards, level_order, ramp_ok,
)
from tools.flashcards.flashcard_sets import topics_for
from tools.flashcards.static_cards import get_topic_cards

_TIER_RANK = {"easy": 0, "medium": 1, "hard": 2}

# (role, topic_key) for every topic any role studies — FOUNDATIONS is shared, so
# dedupe on topic_key to avoid ranking the same topic twice.
def _all_topics() -> list[tuple[str, str]]:
    seen: dict[str, str] = {}
    for role in ("OA", "OT"):
        for topic_key, _ in topics_for(role):
            seen.setdefault(topic_key, role)
    return [(role, topic) for topic, role in seen.items()]


def test_deck_shape_is_five_decks_of_ten():
    assert DECK_SIZE == 10
    assert DECK_COUNT == 5


def test_every_topic_serves_five_decks_of_ten():
    for role, topic in _all_topics():
        for level in range(1, DECK_COUNT + 1):
            deck = get_deck_cards(role, topic, level)
            assert len(deck) == DECK_SIZE, f"{topic} L{level} has {len(deck)} cards"


def test_the_five_decks_partition_every_card_exactly_once():
    for role, topic in _all_topics():
        served = [c["stem"] for lvl in range(1, DECK_COUNT + 1)
                  for c in get_deck_cards(role, topic, lvl)]
        pool = {c["stem"] for c in get_topic_cards(role, topic)}
        assert len(served) == len(set(served)), f"{topic} repeats a card across decks"
        assert set(served) == pool, f"{topic} does not use all 50 cards exactly once"


def test_every_shipped_ladder_ramps():
    """The quality gate on the AI ranking pass, measured against the authored tier:
    a real end-to-end span and no adjacent dip beyond the 3-tier proxy's resolution.

    Shares its definition with the generator (ramp_ok), so a ranking the tool would
    refuse to write can never sit in the shipped file either. A topic whose ranking
    fails is dropped from card_levels.json and falls back to the authored
    easy->medium->hard order, which ramps by construction — so this holds for every
    topic whether it is AI-ranked or not."""
    for role, topic in _all_topics():
        cards = get_topic_cards(role, topic)
        order = level_order(topic, len(cards))
        means = deck_tier_means(cards, order)
        assert ramp_ok(means), f"{topic} does not ramp: {[round(m, 2) for m in means]}"


def test_the_fallback_ramp_runs_pure_easy_to_pure_hard():
    """With no ranking the identity order still ramps, because the card bank is
    authored easy(17) -> medium(17) -> hard(16): deck 1 lands wholly in the easy
    tier and deck 5 wholly in the hard one. This is what a student sees if the
    ranking file is ever missing."""
    for role, topic in _all_topics():
        first = get_deck_cards(role, topic, 1, rankings={})
        last = get_deck_cards(role, topic, DECK_COUNT, rankings={})
        assert {c["difficulty"] for c in first} == {"easy"}
        assert {c["difficulty"] for c in last} == {"hard"}


def test_default_order_is_the_identity_permutation():
    assert level_order("glaucoma", 50, rankings={}) == list(range(50))


def test_a_supplied_ranking_overrides_the_default_order():
    reversed_order = list(reversed(range(50)))
    rankings = {"glaucoma": {"cards": 50, "order": reversed_order}}
    assert level_order("glaucoma", 50, rankings=rankings) == reversed_order


def test_ranking_for_a_different_card_count_falls_back_to_identity():
    """Guard: the bank grew/shrank since the ranking was generated, so the
    stored indices no longer describe this topic. Fall back, never mis-serve."""
    stale = {"glaucoma": {"cards": 40, "order": list(reversed(range(40)))}}
    assert level_order("glaucoma", 50, rankings=stale) == list(range(50))


@pytest.mark.parametrize("order", [
    list(range(49)),            # too short
    [0] * 50,                   # not a permutation
    list(range(1, 51)),         # out of range
])
def test_a_malformed_ranking_falls_back_to_identity(order):
    rankings = {"glaucoma": {"cards": 50, "order": order}}
    assert level_order("glaucoma", 50, rankings=rankings) == list(range(50))


@pytest.mark.parametrize("level", [0, -1, DECK_COUNT + 1])
def test_a_level_outside_one_to_five_serves_nothing(level):
    assert get_deck_cards("OA", "glaucoma", level) == []


def test_an_unknown_topic_serves_nothing():
    assert get_deck_cards("OA", "not_a_topic", 1) == []
