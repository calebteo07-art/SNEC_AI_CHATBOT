"""One student's mastery against the cohort, on three separately-named scales (§6.2).

Pure: no I/O. The endpoint assembles the per-student inputs; this module owns the
comparison policy.

**Three scales, never one blended number.** OSCE attainment, flashcard recall and
retention measure different things, and `retention_scores` is itself a mixture of two
key namespaces (flashcard tags and raw case topics). A single "mastery" figure would
average incomparable quantities and hide which one a trainer should act on.

**The cohort mean excludes this student.** Including them makes a solo student's delta
exactly 0.0, which renders as "exactly at the cohort average" when the truth is "there is
no cohort" — the common case at ~10 students, and the most misleading possible answer.
`cohort_avg` and `delta` are null when no OTHER student has the scale. The exclusion is
done by construction, not by subtraction; `mastery_block` explains why.

A cohort of one other student is thin, not invalid, so it is reported rather than
suppressed — but only because every scale also carries `peers_n`, the count actually
divided by. Rendering the average without that count is what turns "one classmate
scored 95" into "the cohort scored 95".
"""
from __future__ import annotations

from tools.cases.topic_sets import case_pool, resolve_set_strict
from tools.supervisor.topic_crosswalk import KNOWLEDGE_GROUP, flashcard_group, is_known_tag

SCALES = ("osce", "flashcard", "retention")


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


def mastery_block(own: dict, peers: dict[str, dict]) -> dict:
    """The three scales for one student, each against the peers they are NOT in.

    Args:
        own: this student's own figures, `{"osce", "flashcard", "retention"}`, all on
            0-100 with None for a scale they have no data on. Sourced from the student's
            OWN reads, not from the cohort scan — see below.
        peers: student_id -> the same three keys, with THIS STUDENT ALREADY REMOVED. A
            student missing a scale must carry None for it, NOT 0.0 — a zero would join
            that scale's denominator and drag the average down, flattering everyone
            measured against it.

    Returns `{"<scale>_mastery": {"value", "cohort_avg", "delta", "cohort_n",
    "peers_n"}}`. Every figure is `float | None` except the two counts.

    **The cohort mean excludes this student by construction.** Including them makes a solo
    student's delta exactly 0.0, which renders as "exactly at the cohort average" when the
    truth is "there is no cohort" — the common case at ~10 students, and the most
    misleading possible answer. `cohort_avg` and `delta` are null when `peers` has nobody
    with the scale.

    It is done by leaving the student OUT of `peers` rather than by subtracting their
    value from a cohort total that includes them, and that is not a stylistic choice. The
    two are equal only while both numbers come from one read. `own` is now read fresh on
    every request while the peer rows come from a cohort scan cached for up to 45s, so
    subtraction would mix two moments: a student cached at 60 who has since scored 80, in
    a total of 180 over 3, yields (180-80)/2 = 50 peers instead of the true 60 — and can
    go negative in a thin cohort. Excluding by id cannot express that bug.

    The two counts answer different questions and a caller must not swap them:

    - `cohort_n` — how many students HAVE the scale, **including this student**. A
      data-density figure: "how much evidence backs this comparison at all".
    - `peers_n` — how many OTHERS `cohort_avg` is the mean of. This is the divisor, and it
      is the one to put in front of a trainer. Rendering `cohort_n` as the peer count
      reads "vs 3 peers" beside an average of 2.

    `peers_n` is also the thinness signal. It is 1 far more often than the design suggests
    at ~10 students, and a `cohort_avg` of 95 drawn from a single classmate who happened to
    take one easy case is not a benchmark. The number is still reported — suppressing real
    data is its own distortion — but only because `peers_n` travels with it.
    """
    out: dict[str, dict] = {}
    for scale in SCALES:
        raw = own.get(scale)
        value = float(raw) if raw is not None else None
        # `.get`, not `[scale]`: a row carries only the scales it has.
        present = [
            float(row[scale])
            for row in peers.values()
            if row.get(scale) is not None
        ]
        cohort_avg = round(sum(present) / len(present), 1) if present else None
        out[f"{scale}_mastery"] = {
            "value": value,
            "cohort_avg": cohort_avg,
            # Null unless BOTH sides exist. A delta against nothing is not a zero.
            "delta": round(value - cohort_avg, 1)
            if value is not None and cohort_avg is not None else None,
            # `is not None`, not truthiness: a student who genuinely scored 0.0 is evidence
            # and counts toward the density.
            "cohort_n": len(present) + (1 if value is not None else 0),
            "peers_n": len(present),
        }
    return out
