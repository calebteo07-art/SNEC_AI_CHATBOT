"""What a student's role actually studies — in prose, and as a filter.

The content model is TWO pools, not three. Every role studies the shared FOUNDATIONS
pool plus its own procedural pool, resolved by one line duplicated in flashcards
(`pool_for_role`) and OSCE (`case_pool`): OT gets "OT", everyone else gets "CLINICAL".
So OA and PSA study a byte-identical syllabus and differ ONLY by job title.

The tutor used to state that scope as a HAND-WRITTEN dict (`_ROLE_TUTOR_CONTEXT`),
copied verbatim into two modules, and it had drifted out of agreement with the pools it
was describing: OA and PSA were given different teaching emphasis over the same content.
Deriving the line from FLASHCARD_TOPICS makes that class of drift impossible — rename a
topic or move it between pools and the prompt follows in the same commit.

Two functions, two audiences:
  · `role_focus`  -> the scope as prose, injected into AI system prompts.
  · `in_scope`    -> the scope as a predicate, for filtering `weak_topics`.

They deliberately disagree on an UNKNOWN role. `role_focus` returns "" (a blank or
"trainer" role has no title, and inventing one would state a syllabus the student may
not study), while `in_scope` falls through to the shared clinical pool, matching
`topics_for` and what home.py/quests.py already do. Refusing to name a role is free;
refusing to filter would drop every topic and silently blank the feature.

Pure: no I/O, no state, no event-loop concerns.
"""
from __future__ import annotations

from tools.flashcards.flashcard_sets import (
    DIFFICULTIES,
    FLASHCARD_TOPICS,
    pool_for_role,
    topics_for,
)

# The one thing that legitimately differs between OA and PSA. Keys are the values
# student_profiles.role holds; anything else is not a student role (see module docstring).
ROLE_TITLES: dict[str, str] = {
    "OA": "Ophthalmic Assistant (OA)",
    "OT": "Ophthalmic Technician (OT)",
    "PSA": "Patient Service Associate (PSA)",
}


def _labels(pool: str) -> str:
    """A pool's topic labels, verbatim and in display order.

    Verbatim matters: the model then names a topic exactly as the deck UI labels it,
    so "revise Pinhole Testing" points at a deck the student can actually open.
    """
    return ", ".join(label for _, label in FLASHCARD_TOPICS[pool])


def role_focus(role: str | None) -> str:
    """The student's syllabus as a prompt block, or "" when the role is not a student one.

    Both clauses are included because both pools genuinely are in scope — naming only
    the procedures would tell the model that anatomy and pharmacology are off-syllabus.
    """
    key = (role or "").strip().upper()
    title = ROLE_TITLES.get(key)
    if title is None:
        return ""
    return (
        f"STUDENT ROLE: {title}.\n"
        f"Core knowledge, studied by every role: {_labels('FOUNDATIONS')}.\n"
        f"This role's procedures: {_labels(pool_for_role(key))}."
    )


def bare_key(stored: str) -> str:
    """The flashcard topic a retention entry refers to, with any difficulty suffix removed.

    Both forms reach retention_scores — a plain topic key and a "<topic>__<difficulty>"
    set key (flashcard_sets.make_set_key) — so both have to normalise to the same thing
    before they can be matched against a role's pools. Only a KNOWN difficulty is
    stripped: a bare `rpartition("__")` would blank every unsuffixed tag. Same rule as
    topic_crosswalk._strip_difficulty, which exists for the same reason.
    """
    key = (stored or "").strip().lower()
    head, sep, tail = key.rpartition("__")
    return head if (sep and head and tail in DIFFICULTIES) else key


def in_scope(weak_topics: list[str], role: str) -> list[str]:
    """The weak topics this role actually studies, in the order given.

    `weak_topics` comes from retention_scores, which mixes TWO namespaces: the closed
    flashcard topic namespace, and raw OSCE case topics written server-side by cases.py.
    An entry from outside the role's pools is off-syllabus, and for anything deck-shaped
    it is also unwinnable.

    Returns the STORED keys, not normalised ones: quests builds its progress metric from
    the same string it stores, so normalising here would break that identity.
    """
    allowed = {key for key, _ in topics_for(role)}
    return [t for t in weak_topics if bare_key(t) in allowed]
