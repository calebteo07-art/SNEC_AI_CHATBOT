"""Per-topic difficulty-unlock gate for OSCE virtual-patient cases (2026-07-20).

Pure logic, no I/O — the single source of truth for both the case-list lock flags
(`get_cases`) and the fail-closed access check (`_check_case_access`) in
tools/api/routers/cases.py.

Model — for a case of difficulty `d` in topic-set `T`, over the cases visible to the
student's role ("complete" = any graded attempt, pass or fail):

- Foundational (`beginner`)      -> never gated (always open).
- Developing (`intermediate`):
    * T has >=1 Foundational  -> completed >= min(2, #Foundational in T) Foundational IN T
    * T has  0 Foundational   -> completed >= 3 cases in ANY topic (account-wide fallback)
- Advanced (`advanced`)          -> mirrors Developing over the Developing tier.
- Unknown difficulty             -> open (matches prior behaviour).

`min(2, available)` keeps topics that have a single prerequisite case satisfiable; the
zero-prerequisite fallback is always reachable because Foundational cases are never gated.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass

# Cases to complete in any topic to open a tier that has no prerequisite case of its own.
ANY_TOPIC_FALLBACK = 3

# gated difficulty -> (prerequisite difficulty key, its student-facing label)
_PREREQ: dict[str, tuple[str, str]] = {
    "intermediate": ("beginner", "Foundational"),
    "advanced": ("intermediate", "Developing"),
}


@dataclass
class TierCensus:
    """Per-set tier tallies for one student, built once per request."""
    available: dict[str, Counter]   # set_key -> Counter(difficulty -> count of cases)
    completed: dict[str, Counter]   # set_key -> Counter(difficulty -> completed count)
    total_completed: int            # completed cases across all topics


def build_census(items) -> TierCensus:
    """items: iterable of (set_key, difficulty, completed: bool) over the visible cases."""
    available: dict[str, Counter] = defaultdict(Counter)
    completed: dict[str, Counter] = defaultdict(Counter)
    total = 0
    for set_key, difficulty, done in items:
        d = (difficulty or "").lower()
        available[set_key][d] += 1
        if done:
            completed[set_key][d] += 1
            total += 1
    return TierCensus(available, completed, total)


def evaluate(difficulty: str, set_key: str, census: TierCensus) -> tuple[bool, str]:
    """Return (locked, hint) for a case of `difficulty` in `set_key`. hint is "" when open."""
    d = (difficulty or "").lower()
    if d not in _PREREQ:
        return (False, "")  # Foundational / unknown tiers are never gated.

    prereq_key, prereq_label = _PREREQ[d]
    available_here = census.available.get(set_key, Counter()).get(prereq_key, 0)

    if available_here >= 1:
        need = min(2, available_here)
        done = census.completed.get(set_key, Counter()).get(prereq_key, 0)
        if done >= need:
            return (False, "")
        noun = f"{prereq_label} case" if need == 1 else f"{prereq_label} cases"
        return (True, f"Complete {need} {noun} in this topic to unlock.")

    # No prerequisite-tier case in this topic -> account-wide fallback.
    if census.total_completed >= ANY_TOPIC_FALLBACK:
        return (False, "")
    return (True, f"Complete any {ANY_TOPIC_FALLBACK} cases in any topic to unlock.")
