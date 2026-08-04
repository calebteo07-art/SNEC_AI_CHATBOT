"""The three daily quests — the PULL the Home never had.

Generated, never stored: a quest set is a pure function of (student_id, date,
weak_topics, role), and its progress is a pure function of the daily activity tally. That
is deliberate. A stored quest with a stored progress counter is two things that can
disagree, and the one that disagrees is always the one the student is looking at.

Exactly one quest of each kind per day, so the board never shows three of the same shape.
"""
import hashlib
from dataclasses import dataclass

QUEST_KINDS = ("adaptive", "breadth", "stretch")

# Targets and payouts. Quests pay XP — unlike the chest, a quest cannot be completed
# without actually studying, so paying XP here can never buy League rank for showing up.
#
# The unit is DECKS, not cards. The activity tally increments once per completed deck (see
# tools/gamification/daily_state.py), so a quest promising "8 cards" would silently demand
# eight decks. A topic holds 5 decks, so 1-3 is a day's work, not a month's.
_ADAPTIVE_TARGETS = (1, 2, 3)
_BREADTH_SOURCES = (("osce", "Run {n} OSCE station{s}"), ("flashcards", "Clear {n} flashcard deck{s}"),
                    ("tutor", "Ask the tutor {n} question{s}"))
_STRETCH_MULTIPLES = (1.0, 1.25, 1.5)

_REWARD = {"adaptive": 40, "breadth": 30, "stretch": 50}


@dataclass(frozen=True)
class Quest:
    kind: str      # one of QUEST_KINDS
    title: str     # student-facing, e.g. "Clear 2 decks in Gonioscopy"
    metric: str    # "flashcards" | "osce" | "tutor" | "xp" | "topic:<key>"
    target: int
    reward_xp: int


def _seed(student_id: str, day) -> int:
    """Deterministic per student per day, across processes.

    sha256 and NOT hash(): Python salts str hashing per interpreter run, so two uvicorn
    workers would hand the same student two different quest sets on the same day.
    """
    raw = f"{student_id}:{day.isoformat()}".encode()
    return int.from_bytes(hashlib.sha256(raw).digest()[:8], "big")


def daily_quests(student_id: str, day, weak_topics: list[str], role: str,
                 daily_goal: int = 100) -> list[Quest]:
    """Today's three quests — one adaptive, one breadth, one stretch."""
    seed = _seed(student_id, day)

    # Adaptive: the student's weakest topic. A brand-new student has no retention scores
    # yet, so it degrades to a plain flashcard quest rather than vanishing — the set is
    # always three.
    if weak_topics:
        topic = weak_topics[seed % len(weak_topics)]
        n = _ADAPTIVE_TARGETS[(seed >> 8) % len(_ADAPTIVE_TARGETS)]
        adaptive = Quest("adaptive", f"Clear {n} deck{'' if n == 1 else 's'} in {topic.title()}",
                         f"topic:{topic}", n, _REWARD["adaptive"])
    else:
        n = _ADAPTIVE_TARGETS[(seed >> 8) % len(_ADAPTIVE_TARGETS)]
        adaptive = Quest("adaptive", f"Clear {n} flashcard deck{'' if n == 1 else 's'}",
                         "flashcards", n, _REWARD["adaptive"])

    source, template = _BREADTH_SOURCES[(seed >> 16) % len(_BREADTH_SOURCES)]
    bn = 1 + ((seed >> 24) % 2)
    breadth = Quest("breadth", template.format(n=bn, s="" if bn == 1 else "s"),
                    source, bn, _REWARD["breadth"])

    mult = _STRETCH_MULTIPLES[(seed >> 32) % len(_STRETCH_MULTIPLES)]
    xp_target = int(daily_goal * mult)
    stretch = Quest("stretch", f"Earn {xp_target} XP today", "xp", xp_target,
                    _REWARD["stretch"])

    return [adaptive, breadth, stretch]


def quest_progress(quest: Quest, activity: dict) -> int:
    """How far along this quest is, computed from the activity tally.

    `activity` carries the daily_state counters plus `xp` (which lives in the existing
    xp_today column, not in daily_state — the caller merges it in).
    """
    if quest.metric.startswith("topic:"):
        topics = activity.get("topics") or {}
        return int(topics.get(quest.metric.removeprefix("topic:")) or 0)
    return int(activity.get(quest.metric) or 0)


def is_complete(quest: Quest, activity: dict) -> bool:
    return quest_progress(quest, activity) >= quest.target
