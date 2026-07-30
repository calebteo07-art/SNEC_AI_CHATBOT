"""The daily check-in's question bank — the student's own flashcards.

The check-in serves ONE card a day, drawn from the easiest tier of EVERY topic
in the role's scope (Foundations + its procedural pool, exactly as the flashcard
feature defines it). Reusing the flashcard bank instead of a parallel pool means
the check-in can never drift out of sync with what the student actually studies,
and the rotation spans hundreds of cards across every topic rather than a few
dozen: 430 cards for OA/PSA, 515 for OT — over a year before a repeat.

Only the easy tier is served: the check-in is deliberately the lightest feature
in the app, a ten-second icebreaker that keeps the streak alive.

A question is identified by a hash of its stem, not its position in the bank, so
the card a student answers is the card they were shown even if the bank is
re-authored or re-ranked between the two requests.
"""
from __future__ import annotations

import hashlib

from tools.flashcards.static_cards import get_all_cards

# The check-in only ever serves the easiest authored tier.
CHECKIN_DIFFICULTY = "easy"

# stem-hash -> card, over every pool any role studies. A read-only index derived
# from static content, built once per worker on first use (never a shared counter
# — nothing mutates it, and every worker derives the same map).
_BY_ID: dict[str, dict] = {}


def question_id(stem: str) -> str:
    """Stable id for a card, derived from its stem rather than its index so it
    survives a re-authored or re-ranked bank between serve and grade."""
    return hashlib.sha1(stem.encode("utf-8")).hexdigest()[:12]


def checkin_pool(role: str) -> list[dict]:
    """Every card the check-in may serve to `role`.

    Single-answer MCQs only: the check-in submits on tap and reveals one correct
    option, so a multi-answer card could not be answered or marked.
    """
    return [
        c for c in get_all_cards(role)
        if c.get("difficulty") == CHECKIN_DIFFICULTY
        and c.get("qtype") == "single"
        and len(c.get("correct") or []) == 1
        and len(c.get("options") or []) >= 2
    ]


def find_card(qid: str) -> dict | None:
    """The card a `question_id` refers to, or None if it names nothing.

    Role-free by design: the id identifies content, and role scope is enforced
    when the question is SERVED. That keeps grading a pure lookup — no profile
    read, no per-worker cache to miss, and nothing taken from the client but the
    id and the option text it chose.
    """
    if not _BY_ID:
        # OA covers Foundations + Clinical, OT the remaining procedural pool —
        # together every card any role can be served.
        for role in ("OA", "OT"):
            _BY_ID.update({question_id(c["stem"]): c for c in checkin_pool(role)})
    return _BY_ID.get(qid)
