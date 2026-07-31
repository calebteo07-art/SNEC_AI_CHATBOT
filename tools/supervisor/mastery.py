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
possible answer. `cohort_avg` and `delta` are null when NO other student has the scale.

A cohort of one other student is thin, not invalid, so it is reported rather than
suppressed — but only because every scale also carries `peers_n`, the count actually
divided by. Rendering the average without that count is what turns "one classmate
scored 95" into "the cohort scored 95".
"""
from __future__ import annotations

from tools.cases.topic_sets import case_pool, resolve_set_strict
from tools.supervisor.topic_crosswalk import KNOWLEDGE_GROUP, flashcard_group, is_known_tag

SCALES = ("osce", "flashcard", "retention")


def _peers_n(n: int, value: float | None) -> int:
    """How many OTHER students back a cohort figure — the divisor `leave_one_out` uses.

    `n` counts everyone with the scale; this student is inside that count only when they
    have a value of their own. Shared by both callers so the number a trainer is shown as
    the peer count cannot drift from the number actually divided by.
    """
    return n - (1 if value is not None else 0)


def leave_one_out(total: float, n: int, value: float | None) -> float | None:
    """Mean of the cohort EXCLUDING this student, or None when no one else has data.

    `total`/`n` cover every student with the scale, `value` is this student's own
    contribution (None when they are not in the total).
    """
    others_n = _peers_n(n, value)
    if others_n < 1:
        return None
    # `is not None`, not `or`: a student who genuinely scored 0.0 is present in the
    # total and must subtract 0.0, which is also what an absent student subtracts. The
    # two coincide here but for opposite reasons, so spell out which one is meant.
    others_total = total - (value if value is not None else 0.0)
    return round(others_total / others_n, 1)


def retention_mastery(scores: dict | None, *, role: str) -> float | None:
    """Mean retention as 0-100, bucketed across both key namespaces first.

    `retention_scores` is written with BOTH raw case-topic keys (`cases.py`, from
    `case["topic"]`) and flashcard tags (`student.py`, from `results[].topic_tag`), so
    the same underlying topic can appear twice and double-count. Each key is resolved to
    a topic group by its OWN namespace, and the GROUP means are averaged, so a finely
    subdivided namespace cannot outvote the other.

    Route by namespace, never by "did the case matcher miss". `resolve_set_strict` is a
    first-match-wins SUBSTRING matcher over case topics, so it silently swallows real
    flashcard tags: `anatomy_phys(iol)ogy` and `microb(iol)ogy_infection` both hit the
    `"iol"` biometry rule, and `conju(nct)iva` hits the `"nct"` tonometry rule. Six OT
    tags and four OA tags land in a procedural set that way, merging FOUNDATIONS
    knowledge into a station's score — precisely the absorption `topic_crosswalk`'s
    module docstring exists to forbid. So a known flashcard tag goes through the
    crosswalk, and only a non-tag is offered to the case matcher.

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
        name = str(key)
        if is_known_tag(name):
            group = flashcard_group(name, pool)
        else:
            group = resolve_set_strict(role, name) or KNOWLEDGE_GROUP
        # Clamp: `retention_scores` is fed by a client-supplied `score` on
        # POST /api/gamification/sync, which — unlike the `xp_delta` clamped beside it —
        # is unbounded (student.py:99, update_profile.py:105). This is the first reader
        # that multiplies by 100, so an unclamped 100.0 would put "10000" in front of a
        # trainer as a mastery figure.
        groups.setdefault(group, []).append(min(1.0, max(0.0, value)))
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

    Returns `{"<scale>_mastery": {"value", "cohort_avg", "delta", "cohort_n",
    "peers_n"}}`. Every figure is `float | None` except the two counts.

    The two counts answer different questions and a caller must not swap them:

    - `cohort_n` — how many students HAVE the scale, **including this student**. A
      data-density figure: "how much evidence backs this comparison at all".
    - `peers_n` — how many OTHER students `cohort_avg` is the mean of. This is the
      divisor, and it is the one to put in front of a trainer. Rendering `cohort_n`
      as the peer count reads "vs 3 peers" beside an average of 2.

    `peers_n` is also the thinness signal. It is 1 far more often than the design
    suggests at ~10 students, and a `cohort_avg` of 95 drawn from a single classmate
    who happened to take one easy case is not a benchmark. The number is still
    reported — suppressing real data is its own distortion — but only because
    `peers_n` travels with it.
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
            "peers_n": _peers_n(len(present), value),
        }
    return out
