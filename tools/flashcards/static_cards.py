"""Static flashcard pool — self-contained MCQs organised as 45 sets per role.

Each card is a complete MCQ: stem, options, correct indices, qtype (single /
multi), kind (theory / practical), model-answer explanation, and a
reasoning_eligible flag. The browser grades MCQ correctness instantly (no AI);
a handful of reasoning-eligible cards per deck carry a compulsory typed box
graded by one background AI call.

Structure: FLASHCARDS[pool][topic_key][difficulty] = [ {MCQ card}, ... ].
Served via GET /api/flashcards/generate (optionally ?set_key=) using
tools.shared.static_pools.pick_next_unseen for per-user no-repeat rotation.

Pools mirror check-in pooling (see flashcard_sets.py):
- OT  -> "OT" pool (ophthalmic investigations / imaging).
- OA and PSA share the "CLINICAL" pool.
"""
from __future__ import annotations

from tools.flashcards.flashcard_sets import (
    DIFFICULTIES,
    pool_for_role,
    topics_for,
    make_set_key,
)

# FLASHCARDS[pool][topic_key][difficulty] = list of MCQ card dicts
FLASHCARDS: dict[str, dict[str, dict[str, list[dict]]]] = {
    "CLINICAL": {
        "triage": {
            "easy": [
                {
                    "stem": "Within how long must a Triage Category 1 case be seen?",
                    "options": ["Within 10 minutes", "Within 30 minutes",
                                "Within 60 minutes", "Within 2 hours"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Category 1 is the most urgent — it must be seen "
                                   "within 10 minutes (e.g. chemical burn, CRAO).",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [],
            "hard": [],
        },
    },
    "OT": {},
}


# ── Serving helpers ──────────────────────────────────────────────────────────

_PASSTHROUGH = ("stem", "options", "correct", "qtype", "kind",
                "explanation", "reasoning_eligible")


def _tag(topic_key: str, difficulty: str, card: dict) -> dict:
    out = {k: card[k] for k in _PASSTHROUGH if k in card}
    out["reasoning_eligible"] = bool(card.get("reasoning_eligible", False))
    out["topic_tag"] = topic_key
    out["difficulty"] = difficulty
    return out


def get_set_cards(role: str, topic_key: str, difficulty: str) -> list[dict]:
    """Cards for one (topic, difficulty) set, tagged for serving."""
    pool = FLASHCARDS.get(pool_for_role(role), {})
    cards = pool.get(topic_key, {}).get(difficulty, [])
    return [_tag(topic_key, difficulty, c) for c in cards]


def get_all_cards(role: str) -> list[dict]:
    """Every authored card for a role's pool (used by the no-arg rotation)."""
    pool = FLASHCARDS.get(pool_for_role(role), {})
    out: list[dict] = []
    for topic_key, _ in topics_for(role):
        by_diff = pool.get(topic_key, {})
        for difficulty in DIFFICULTIES:
            for c in by_diff.get(difficulty, []):
                out.append(_tag(topic_key, difficulty, c))
    return out


def set_card_counts(role: str) -> dict[str, int]:
    """{set_key: number of authored cards} for every set in the role's pool."""
    pool = FLASHCARDS.get(pool_for_role(role), {})
    counts: dict[str, int] = {}
    for topic_key, _ in topics_for(role):
        by_diff = pool.get(topic_key, {})
        for difficulty in DIFFICULTIES:
            counts[make_set_key(topic_key, difficulty)] = len(by_diff.get(difficulty, []))
    return counts


def card_by_stem(role: str) -> dict[str, dict]:
    """{stem: tagged card} index for the role pool — used to rehydrate MCQ fields
    onto SM-2 due cards (which the DB stores only as front/back)."""
    return {c["stem"]: c for c in get_all_cards(role)}
