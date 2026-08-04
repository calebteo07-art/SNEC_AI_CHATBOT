"""The daily chest — the PAYOFF for showing up — and the boost clock it winds.

The chest pays BOOSTS, never XP. That is the rule that keeps The League honest: a student
who only ever opens the app and claims a chest gains nothing on the board, because a boost
is worth exactly zero until they actually study and earn something to multiply.

The drop is a pure function of (student_id, date). Variable across days, unpredictable,
and impossible to re-roll — so a repeat claim cannot pay differently even if the first
claim's write failed.
"""
import hashlib
from dataclasses import dataclass
from datetime import datetime

# How long a claimed 2x boost runs. Short on purpose: the countdown is the pull.
BOOST_MINUTES = 20


@dataclass(frozen=True)
class Drop:
    key: str
    label: str
    boost_minutes: int = 0   # winds the xp2x clock
    freezes: int = 0         # grants streak freezes (the existing streak_freezes column)


DROPS = (
    Drop("xp2x", f"2x Lumens for {BOOST_MINUTES} minutes", boost_minutes=BOOST_MINUTES),
    Drop("xp2x_long", f"2x Lumens for {BOOST_MINUTES * 2} minutes", boost_minutes=BOOST_MINUTES * 2),
    Drop("freeze", "A streak freeze", freezes=1),
)

# Weights, most common first. The long boost is the rare one — a variable reward needs a
# tier a student is pleased to see.
_WEIGHTS = (6, 2, 3)


def _seed(student_id: str, day) -> int:
    """Deterministic per student per day, across processes. sha256 and NOT hash(), which
    Python salts per interpreter run — two workers would disagree about today's chest."""
    raw = f"chest:{student_id}:{day.isoformat()}".encode()
    return int.from_bytes(hashlib.sha256(raw).digest()[:8], "big")


def roll_chest(student_id: str, day) -> Drop:
    """Today's drop for this student. Pure, and identical on every call."""
    total = sum(_WEIGHTS)
    point = _seed(student_id, day) % total
    upto = 0
    for drop, weight in zip(DROPS, _WEIGHTS):
        upto += weight
        if point < upto:
            return drop
    return DROPS[0]


def boost_multiplier(profile: dict, now: datetime) -> float:
    """The student's active earning multiplier — 2.0 while a boost runs, else 1.0.

    An expiry rather than a banked charge: consuming it writes nothing, so concurrent
    submits cannot race over the same charge, and there is no read-modify-write to lose.

    Any malformed value is 1.0. A corrupt stamp must never 500 an earn — the student would
    lose the XP, not just the boost.
    """
    boosts = profile.get("boosts")
    if not isinstance(boosts, dict):
        return 1.0
    try:
        until = datetime.fromisoformat(str(boosts.get("xp2x_until")))
    except (ValueError, TypeError):
        return 1.0
    if until.tzinfo is None or now.tzinfo is None:
        return 1.0
    return 2.0 if now < until else 1.0
