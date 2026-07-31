"""One student's mastery against the cohort, on three separately-named scales (§6.2).

Pure: no I/O. The endpoint assembles the per-student inputs; this module owns the
comparison policy.

**Three scales, never one blended number.** OSCE attainment, flashcard recall and
retention measure different things, and `retention_scores` is itself a mixture of two
key namespaces (flashcard tags and raw case topics). A single "mastery" figure would
average incomparable quantities and hide which one a trainer should act on.

**The cohort mean is leave-one-out.** Including the student makes a solo student's
delta exactly 0.0, which renders as "exactly at the cohort average" when the truth is
"there is no cohort" — the common case at ~10 students, and the most misleading
possible answer. `cohort_avg` and `delta` are null when fewer than 2 OTHER students
have the scale.
"""
from __future__ import annotations

from tools.cases.topic_sets import case_pool, resolve_set_strict
from tools.supervisor.topic_crosswalk import flashcard_group

SCALES = ("osce", "flashcard", "retention")


def leave_one_out(total: float, n: int, value: float | None) -> float | None:
    """Mean of the cohort EXCLUDING this student, or None when no one else has data.

    `total`/`n` cover every student with the scale, `value` is this student's own
    contribution (None when they are not in the total).
    """
    others_n = n - (1 if value is not None else 0)
    if others_n < 1:
        return None
    others_total = total - (value or 0.0)
    return round(others_total / others_n, 1)


def retention_mastery(scores: dict | None, *, role: str) -> float | None:
    """Mean retention as 0-100, bucketed across both key namespaces first.

    `retention_scores` is written with BOTH raw case-topic keys and flashcard tags, so
    the same underlying topic can appear twice and double-count. Keys are resolved to
    topic groups — case keys via `resolve_set_strict` (None on no match, unlike
    `resolve_set`, which silently files an unrelated topic into `_DEFAULT`) and the
    rest via the flashcard crosswalk — and the GROUP means are averaged, so a finely
    subdivided namespace cannot outvote the other.

    Values are stored 0-1 and returned 0-100 to match the other two scales.
    """
    if not scores:
        return None
    pool = case_pool(role)
    groups: dict[str, list[float]] = {}
    for key, raw in scores.items():
        try:
            value = float(raw)
        except (TypeError, ValueError):
            # A malformed value is skipped, never coerced to 0.0 — a 0 reads as total
            # failure on that topic.
            continue
        group = resolve_set_strict(role, str(key)) or flashcard_group(str(key), pool)
        groups.setdefault(group, []).append(value)
    if not groups:
        return None
    means = [sum(v) / len(v) for v in groups.values()]
    return round(100.0 * sum(means) / len(means), 1)


def mastery_block(student_id: str, per_student: dict[str, dict]) -> dict:
    """The three scales for one student, each against its own leave-one-out cohort.

    Args:
        student_id: the student to report on.
        per_student: student_id -> {"osce": float|None, "flashcard": float|None,
            "retention": float|None}, all on 0-100. A student missing a scale must
            carry None for it, NOT 0.0 — a zero would join that scale's denominator
            and drag the cohort average down, flattering everyone against it.

    Returns `{"<scale>_mastery": {"value", "cohort_avg", "delta", "cohort_n"}}`. Every
    figure is `float | None`.

    `cohort_n` is the number of students who HAVE that scale, **including this student
    themself** — it is the size of the population the scale was measured over, not the
    divisor of `cohort_avg`. `cohort_avg` is leave-one-out, so it is the mean of the
    OTHER `cohort_n - 1` students (or of all `cohort_n` when this student lacks the
    scale and is therefore not in the total). The two are deliberately not the same
    count: `cohort_n` stays a stable "how much data backs this scale" figure that does
    not change shape depending on whether the student has a value. A caller rendering
    it must not label it as the number of peers compared against — "vs 3 peers" beside
    an average of 2 is the mislabeling this note exists to prevent.
    """
    mine = per_student.get(student_id) or {}
    out: dict[str, dict] = {}
    for scale in SCALES:
        present = [
            float(row[scale])
            for row in per_student.values()
            if row.get(scale) is not None
        ]
        value = mine.get(scale)
        value = float(value) if value is not None else None
        cohort_avg = leave_one_out(sum(present), len(present), value)
        out[f"{scale}_mastery"] = {
            "value": value,
            "cohort_avg": cohort_avg,
            # Null unless BOTH sides exist. A delta against nothing is not a zero.
            "delta": round(value - cohort_avg, 1)
            if value is not None and cohort_avg is not None else None,
            "cohort_n": len(present),
        }
    return out
