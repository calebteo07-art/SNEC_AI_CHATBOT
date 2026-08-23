#!/usr/bin/env python3
"""The brief handed to the cohort-narrative model, and the rules it must obey.

Pure: no I/O, no clock, no AI. `routers/supervisor.py` owns the reads and the call; this
module owns what the model is allowed to know and say — so the constraint is testable
without spending a Gemini call, which is the only way it stays true.

WHY IT IS A MODULE. The console printed this, as a quoted line under the hero:

    "...a systemic failure in foundational optics and clinical triage. Immediately
     pause new instruction..."

Neither topic exists in this product. The brief had listed "Ocular Anatomy,
Microbiology, Eyelid & Lacrimal": three names in, two different names out. And it
escalated to a teaching directive from a brief carrying no score, no pass rate and no
attempt count — six inches below a card that correctly read "—" because every attempt in
the window predates the 2026-08-04 rescale.

The old brief was five lines and offered three openings, all of which were taken:

* the topic list was open — nothing said those were the ONLY permissible names;
* there was no performance data AND no statement that there was none, so absence read as
  licence rather than as a limit;
* the system prompt demanded "the single most important action the supervisor should
  take today", which forces a directive off any brief at all, including an empty one.

So: name every figure, declare the topic list closed, state what is absent, and let the
model decline. WAT — deterministic code decides what is true, the model only phrases it.
"""
from __future__ import annotations

from collections import Counter

INSIGHT_SYSTEM = (
    "You are writing a short status note for an ophthalmology education supervisor, "
    "from the brief supplied by the user. "
    "Write 2-3 sentences. Be specific and direct. No preamble.\n"
    "RULES:\n"
    "1. Use ONLY figures that appear in the brief. Never estimate, extrapolate or "
    "round a number the brief does not give you.\n"
    "2. You may name a clinical topic ONLY if it appears verbatim in the brief's "
    "weakest-topics list. If that list is empty, do not name any topic at all.\n"
    "3. The brief contains no OSCE score, pass rate, grade or exam-readiness figure. "
    "Do not comment on scores, grades, marks or readiness, and do not describe the "
    "cohort's performance as strong, weak, improving or failing.\n"
    "4. Say what the figures show, then the most useful next step. If the brief does "
    "not support a recommendation, say what the supervisor should look at instead. "
    "Never recommend suspending, pausing or restructuring teaching."
)

# The reason factors at_risk emits, in the order a supervisor would triage them, with
# the wording the brief uses. Names them explicitly rather than echoing the raw factor
# key, so a renamed key surfaces as a missing line instead of as leaked jargon.
_FACTOR_LABEL: dict[str, str] = {
    "osce_failure": "osce_failure (failed graded stations)",
    "safety": "safety (missed a critical safety step)",
    "flashcard": "flashcard (low recall accuracy)",
    "inactivity": "inactivity (no recent activity)",
    "streak_broken": "streak_broken (check-in habit lapsed)",
    "weak_breadth": "weak_breadth (many weak topics recorded)",
}


def _int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def build_insight_context(cohort: dict, at_risk: list[dict]) -> str:
    """The user-role brief. Every line is a figure or an explicit absence.

    Tolerant of a partial `cohort` dict and of malformed at-risk rows: the narrative is
    decoration on a console that renders without it, so a shape surprise here must
    degrade to a thinner brief, never to a 500 on the endpoint.
    """
    cohort = cohort if isinstance(cohort, dict) else {}
    rows = [r for r in (at_risk or []) if isinstance(r, dict)]

    total = _int(cohort.get("total"))
    active = _int(cohort.get("active_this_week"))
    inactive = len(cohort.get("inactive_7_plus_days") or [])
    # The LIST's length, not at_risk_count: they are the same number by construction
    # (cohort_summary derives the count from this list) and quoting the one we can see
    # keeps the brief from asserting a total its own breakdown contradicts.
    flagged = len(rows)

    bands = Counter(str(r.get("band") or "unknown") for r in rows)
    factors: Counter = Counter()
    for r in rows:
        for reason in (r.get("reasons") or []):
            if isinstance(reason, dict) and reason.get("factor"):
                factors[str(reason["factor"])] += 1

    topics = [t for t in (cohort.get("weakest_topics") or []) if isinstance(t, dict)]
    topic_lines = [f"  - {t.get('topic')} ({_int(t.get('count'))} students)"
                   for t in topics if t.get("topic")]

    lines = [
        "COHORT BRIEF",
        f"Students in scope: {total}"
        + (f" ({_int(cohort.get('staff_excluded'))} staff excluded)"
           if cohort.get("staff_excluded") else ""),
        f"Active in the last 7 days: {active}",
        f"Inactive 7+ days: {inactive}",
        "",
        f"Flagged as needing attention: {flagged if flagged else 'none'}"
        + (f" (high: {bands.get('high', 0)}, medium: {bands.get('medium', 0)})"
           if flagged else ""),
    ]

    if factors:
        # THE LINE THAT WAS MISSING. "At-risk: 13" is identical for a cohort that has
        # stopped logging in and one that is failing its stations; those call for
        # opposite responses, and the old brief could not tell them apart. at_risk
        # already computed this — it was simply never passed on.
        lines.append("Why they are flagged (students per signal, students may carry several):")
        for factor, n in factors.most_common():
            lines.append(f"  - {_FACTOR_LABEL.get(factor, factor)}: {n}")

    lines.append("")
    # ASCII deliberately: this string is a PROMPT, not UI copy, and a non-ASCII dash buys
    # nothing while giving the transport one more thing to mangle.
    lines.append("Weakest topics - these are the ONLY topic names you may use:")
    lines.extend(topic_lines or ["  - none recorded"])

    lines.append("")
    # Stated, not omitted. The absence of these figures is itself a fact about the
    # cohort, and leaving it silent is what the model filled in with a verdict.
    lines.append(
        "NOT IN THIS BRIEF: no OSCE score, pass rate, grade or exam-readiness figure is "
        "available here. Do not infer one."
    )
    return "\n".join(lines)
