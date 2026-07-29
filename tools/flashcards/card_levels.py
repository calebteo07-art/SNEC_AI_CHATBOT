"""Deck levels — a topic's 50 cards split into 5 decks of 10, easiest deck first.

A topic's difficulty ramp is stored as a PERMUTATION of its card indices
(easiest -> hardest) in card_levels.json; deck N is the slice
[(N-1)*10 : N*10]. This keeps the 2,700-line card bank untouched — re-ranking a
topic rewrites 50 integers, never a card.

The identity permutation is the fallback and is ALREADY a valid ramp, because
get_topic_cards returns easy(17) -> medium(17) -> hard(16). So a missing or
stale ranking degrades to a coarser (but still ascending) ramp rather than
breaking the deck.
"""
from __future__ import annotations

import json
from pathlib import Path

from tools.flashcards.static_cards import get_topic_cards

DECK_SIZE = 10
DECK_COUNT = 5

_TIER_RANK = {"easy": 0, "medium": 1, "hard": 2}

# The authored easy/medium/hard tag is only a 3-level proxy for difficulty, so a
# 10-card deck's mean carries real bucketing noise — two adjacent decks drawn from a
# genuinely continuous scale routinely differ by a tenth or two in either direction.
# A dip inside the tolerance is sampling; a bigger one means the ranking disagrees
# with the bank structurally, which is how a misjudged topic gets caught.
RAMP_TOLERANCE = 0.35
RAMP_MIN_SPAN = 0.8


def deck_tier_means(cards: list[dict], order: list[int]) -> list[float]:
    """Mean authored-tier rank of each deck, in ladder order."""
    return [
        sum(_TIER_RANK[cards[i]["difficulty"]]
            for i in order[(lvl - 1) * DECK_SIZE: lvl * DECK_SIZE]) / DECK_SIZE
        for lvl in range(1, DECK_COUNT + 1)
    ]


def ramp_ok(means: list[float]) -> bool:
    """Does this ladder actually get harder? Requires a real end-to-end span and no
    adjacent dip beyond what the 3-tier proxy's resolution explains."""
    if len(means) < 2:
        return False
    return (means[-1] - means[0] >= RAMP_MIN_SPAN
            and all(b - a >= -RAMP_TOLERANCE for a, b in zip(means, means[1:])))

_RANKINGS_PATH = Path(__file__).with_name("card_levels.json")


def _load_rankings() -> dict:
    try:
        return json.loads(_RANKINGS_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


_RANKINGS = _load_rankings()


def level_order(topic_key: str, pool_size: int, rankings: dict | None = None) -> list[int]:
    """Card indices for `topic_key` ordered easiest -> hardest.

    Accepts the stored ranking only when it is a valid permutation of exactly
    this topic's cards: a stale entry (the bank grew) or a malformed one must
    fall back rather than mis-serve or drop cards."""
    entry = (_RANKINGS if rankings is None else rankings).get(topic_key) or {}
    order = entry.get("order")
    if (entry.get("cards") == pool_size and isinstance(order, list)
            and sorted(order) == list(range(pool_size))):
        return list(order)
    return list(range(pool_size))


def get_deck_cards(role: str, topic_key: str, level: int,
                   rankings: dict | None = None) -> list[dict]:
    """The DECK_SIZE cards of deck `level` (1..DECK_COUNT) for a topic."""
    if not 1 <= level <= DECK_COUNT:
        return []
    cards = get_topic_cards(role, topic_key)
    order = level_order(topic_key, len(cards), rankings)
    start = (level - 1) * DECK_SIZE
    return [cards[i] for i in order[start:start + DECK_SIZE]]
