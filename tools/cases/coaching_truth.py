"""Keep the OSCE debrief inside the truth its own ledger records.

Reported 2026-08-04: a student performed 15 of 16 checklist steps and their downloaded
session report congratulated them on completing every step, with an empty "Missed or
lacking" column. Two faults, one cause — the coaching call is free prose and nothing
compared it against the recorded result.

This module is that comparison. It is pure (no I/O, no model call), so the rule is testable
and the endpoint stays a thin caller.

    strip_false_completion  drops a bullet claiming full coverage when the ledger disagrees
    missed_insight          the deterministic "Missed or lacking" line, for when the model
                            returns nothing

On the completion guard: it is a HEURISTIC over free text and makes no claim to catch every
phrasing. The real defence is that the report prints the counts, computed from the record, in
its most prominent block — above anything a model wrote. This is the second line, and it is
deliberately biased towards leaving a bullet alone: a stripped true highlight costs a student
praise they earned, which is worse than one loose sentence under a ledger that contradicts it.
"""

import re

from tools.cases.phase_split import group_by_phase

# "all/every/each ... steps", with enough slack for "all the checklist steps".
_TOTALITY = r"(?:all|every|each|the entire|the whole|the full)"
_STEPS = r"(?:checklist(?:\s+steps?)?|steps?)"
# Verbs that assert the steps HAPPENED. Split in two: "did" is only a completion claim when
# it comes BEFORE the steps ("did all the steps"). After them it is usually a relative clause
# — "every step you did was in the right order" is praise for ORDER, and true either way.
_DONE_BEFORE = r"(?:complet\w+|perform\w+|cover\w+|finish\w+|tick\w+|nail\w+|did|got through|worked through|went through)"
_DONE_AFTER = r"(?:complet\w+|perform\w+|cover\w+|finish\w+|tick\w+|done|carried out)"

_CLAIMS = (
    re.compile(rf"\b{_DONE_BEFORE}\b[^.]{{0,40}}?\b{_TOTALITY}\s+(?:\w+\s+){{0,2}}{_STEPS}\b", re.I),
    re.compile(rf"\b{_TOTALITY}\s+(?:\w+\s+){{0,2}}{_STEPS}\b[^.]{{0,40}}?\b{_DONE_AFTER}\b", re.I),
    re.compile(r"\b(?:no|not a single|none of the)\b[^.]{0,30}\bsteps?\b[^.]{0,30}\b(?:missed|skipped|omitted|left out)\b", re.I),
    re.compile(r"\bnothing\b[^.]{0,25}\b(?:was\s+)?(?:missed|skipped|omitted|left out|left undone)\b", re.I),
)
# A claim scoped to a SUBSET is not a claim about the whole checklist. "Completed the
# safety-critical steps" stays true on a station with an ordinary step outstanding, and the
# safety flag is what decides whether it was true — not this module.
_SCOPED = re.compile(r"\b(?:critical|safety|preparation|identification|assessment|documentation|first|early|opening)\b", re.I)

_DOMAIN_LABELS = (
    ("history", "History-taking"),
    ("investigations", "Examination technique"),
    ("diagnosis", "Recognition"),
    ("management", "Handover & escalation"),
)


def claims_full_coverage(text: str) -> bool:
    """True when this sentence asserts the whole checklist was performed."""
    if _SCOPED.search(text or ""):
        return False
    return any(p.search(text or "") for p in _CLAIMS)


def strip_false_completion(items: list[str], done: int, total: int) -> list[str]:
    """Drop bullets claiming full coverage when the ledger says otherwise.

    A TRUE completion claim survives — the guard is about accuracy, not about censoring
    praise a student earned.
    """
    if total <= 0 or done >= total:
        return list(items or [])
    return [i for i in (items or []) if not claims_full_coverage(i)]


def missed_insight(steps: list[dict], performed: set[int], skipped: set[int],
                   domain_scores: dict) -> str:
    """The "Missed or lacking" line to use when the model supplied none.

    Never a bare restatement of an unticked row: the report already prints every one of
    those, so repeating one is not feedback. Each branch names what the shortfall MEANS —
    where the student should spend their next hour.
    """
    performed = {int(n) for n in (performed or set())}
    skipped = {int(n) for n in (skipped or set())}

    phase_of: dict[int, str] = {}
    for group in group_by_phase(steps or []):
        for s in group.get("steps", []):
            phase_of[int(s.get("step_number", 0))] = str(group.get("name", ""))

    outstanding = [s for s in (steps or []) if int(s.get("step_number", 0)) not in performed]

    # 1) A step attempted and abandoned. The most coachable gap in the session, and the one
    #    the student is least able to diagnose for themselves — they know WHAT they couldn't
    #    do; what they need told is that it is a sequencing gap, not a knowledge one.
    for s in outstanding:
        if int(s.get("step_number", 0)) in skipped:
            return (
                f"You stalled on \"{s.get('action', '')}\" and moved on. Rehearse where that step "
                "sits in the routine rather than re-reading the theory — on the day it is the "
                "order that goes, not the knowledge."
            )

    # 2) Misses clustered in one phase — a pattern the student cannot see from a list of ✗.
    if len(outstanding) >= 2:
        phases = {phase_of.get(int(s.get("step_number", 0)), "") for s in outstanding}
        if len(phases) == 1:
            phase = next(iter(phases))
            return (
                f"Every gap you have is in {phase} — the rest of the station is solid. That makes "
                "this a problem with how the routine ends, not with what you know."
            )

    # 3) Some steps simply never happened.
    if outstanding:
        n = len(outstanding)
        return (
            f"{n} step{'' if n == 1 else 's'} never happened. Those are the cheapest marks on this "
            "station to win back: nothing new to learn, they simply weren't done."
        )

    # 4) Full coverage. The honest gap is depth — anchored to whichever domain actually scored
    #    lowest, so it is specific rather than a platitude about "going deeper".
    label, pts = min(
        ((lbl, int(domain_scores.get(key, 0))) for key, lbl in _DOMAIN_LABELS),
        key=lambda pair: pair[1],
    )
    return (
        f"Nothing was left undone, so what is missing is depth, not breadth — {label} still "
        f"scored {pts}/10. You covered the ground without going far into any of it."
    )
