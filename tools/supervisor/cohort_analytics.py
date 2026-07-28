"""Pure cohort aggregation over raw performance events (P2a, spec §5.1).

No I/O: every function takes already-fetched rows plus the case index and the
student->pool map, so the endpoint stays a thin ranking/projection and P4 can swap
a body for a SQL/RPC pushdown behind the same `dict[topic_group, {...}]` contract (D4).

Two rules run through everything here:

* **Per-metric denominators (§5.3).** In production only 11 of 24 `case_progress`
  rows carry non-NULL `score_100`/`safe`, while `passed` is written by the base
  insert on every row (`tools/shared/db.py:154-159`). `scored_n`, `graded_n` and
  `safety_gradable_n` are genuinely different numbers; one shared denominator would
  silently mis-state two metrics out of three.
* **Nulls, not zeros (D13).** Every rate/mean is `float | None`, null when its own
  denominator is 0. P1 zero-fills *counts* on the activity trend; copying that to a
  *mean* is wrong — a topic with no graded attempt has no average, and a 0.0 would
  rank it as the cohort's worst.
"""
from __future__ import annotations

# The three stored tier names (project-locked; never renamed). An unrecognised
# difficulty is DROPPED rather than folded into "beginner" — a mis-tiered case must
# surface as by_difficulty summing below `attempts`, not as a fabricated tier count.
_DIFFICULTIES = ("beginner", "intermediate", "advanced")

_MISSED_TOP_N = 3
_MISSED_STEP_MAXLEN = 80
_MISSED_MIN_STUDENTS = 2


def _score_rank(row: dict) -> tuple[int, int]:
    """Sort key for "best attempt at this case". An unscored (pre-Tier-2) row ranks
    below every scored one — it carries no attainment signal — but still holds the
    pair's slot, so a pair with only unscored rows can still feed `pass_rate` via the
    always-present `passed` column."""
    val = row.get("score_100")
    if val is None:
        return (0, 0)
    try:
        return (1, int(val))
    except (TypeError, ValueError):
        return (0, 0)


def _missed_top(missed: dict) -> list[dict]:
    """Rank the group's missed critical steps: >=2 distinct students, top 3, capped text.

    The two-student floor is signal and privacy at once — across a ~10-student cohort
    a step missed once identifies the individual, and a single miss is not a curriculum
    problem. Aggregation keys on the FULL step text and truncates only on the way out,
    so two distinct steps sharing an 80-char prefix stay two rows instead of merging
    into one inflated count. The "3 of 40" denominator is the group's own `students`,
    so no extra field is needed on the wire.
    """
    ranked = [
        {"step": step[:_MISSED_STEP_MAXLEN],
         "count": agg["count"],
         "students": len(agg["students"])}
        for step, agg in missed.items()
        if len(agg["students"]) >= _MISSED_MIN_STUDENTS
    ]
    # Fully ordered: worst first, then step text. Dict insertion order must not leak
    # into a ranked list a trainer acts on.
    ranked.sort(key=lambda m: (-m["count"], -m["students"], m["step"]))
    return ranked[:_MISSED_TOP_N]


def osce_by_group(
    rows: list[dict],
    case_index: dict,
    pools_by_student: dict,
    *,
    pool: str | None = None,
) -> dict[str, dict]:
    """Aggregate raw `case_progress` rows into per-set_key OSCE metrics.

    Args:
        rows: case_progress rows. `student_id` and `case_id` are required; the grade
            columns (`score_100`, `passed`, `safe`, `missed_critical`) are optional
            per row, because pre-Tier-2 rows genuinely lack them. The caller's
            projection MUST include `missed_critical` or `missed_top` is always empty
            — it is the one field here with no fallback.
        case_index: case_id -> {"pool", "set_key", "label", "difficulty"}.
        pools_by_student: student_id -> "CLINICAL" | "OT", from
            discipline.pool_by_student(). Students with an unknown role are absent
            (§4.4) and their attempts are excluded.
        pool: when set, keep only attempts by students in that pool. Resolved from the
            STUDENT, never the case, so a future role:"any" case counts in both
            disciplines.

    Returns dict[set_key, metrics]; a group with no surviving attempt is ABSENT, never
    a zero-filled row — the endpoint fills the full group frame from the index.

    Retakes (D9): attainment (`avg_score`, `pass_rate`) uses the BEST `score_100` per
    (student_id, case_id) — the same high-water rule the OSCE reward already applies.
    `attempts` counts every raw row and `safety_fail_rate` is over raw attempts,
    because an unsafe encounter is an event, not an attainment level.

    NULL `score_100` is NOT back-derived. `tools/api/routers/cases.py:96` derives
    `round(total_score / 0.4)` for a student's own history, but for cohort attainment
    that would (a) quantise to 2.5-point steps, (b) mix rubrics — those rows are the
    pre-Tier-2 attempts, whose /40 predates the two-scheme /100 grade that dropped
    checklist coverage (`tools/cases/station_score.py:1-12`) — and (c) still leave
    `safe` NULL, so `avg_score` would span a wider population than `safety_fail_rate`
    over the very same rows. An honest `scored_n` beats a larger fabricated one.

    Safety denominator caveat (§5.3): `safe = not missed_critical`, and
    `missed_critical` only fills for steps flagged critical, so an attempt on a
    checklist with NO critical step scores `safe=True` while carrying no safety
    signal. The index has no `has_critical` flag, so this falls back to
    `safe IS NOT NULL` — `safety_fail_rate` is therefore diluted downward on groups
    whose checklists lack critical steps. The rubric block must state this.
    """
    acc: dict[str, dict] = {}
    for r in rows:
        sid = str(r.get("student_id") or "")
        case_id = str(r.get("case_id") or "")
        meta = case_index.get(case_id)
        spool = pools_by_student.get(sid)
        # Fail closed on both axes. An attempt we cannot place in a topic group, or
        # whose student has no discipline, is EXCLUDED and counted by the endpoint as
        # totals.unclassified_*. Bucketing it anyway is exactly what resolve_set's
        # _DEFAULT fallback does, and it lands other people's cases in history_taking.
        if not sid or meta is None or spool is None:
            continue
        if pool is not None and spool != pool:
            continue

        g = acc.setdefault(meta["set_key"], {
            "attempts": 0,
            "students": set(),
            "best": {},            # (student_id, case_id) -> best attainment row
            "safety_fails": 0,
            "safety_gradable_n": 0,
            "missed": {},          # full step text -> {"count", "students"}
            "by_difficulty": {d: 0 for d in _DIFFICULTIES},
        })
        g["attempts"] += 1
        g["students"].add(sid)

        difficulty = str(meta.get("difficulty") or "")
        if difficulty in g["by_difficulty"]:
            g["by_difficulty"][difficulty] += 1

        safe = r.get("safe")
        if safe is not None:
            g["safety_gradable_n"] += 1
            if not safe:
                g["safety_fails"] += 1

        for step in (r.get("missed_critical") or []):
            entry = g["missed"].setdefault(str(step), {"count": 0, "students": set()})
            entry["count"] += 1
            entry["students"].add(sid)

        key = (sid, case_id)
        current = g["best"].get(key)
        if current is None or _score_rank(r) > _score_rank(current):
            g["best"][key] = r

    out: dict[str, dict] = {}
    for set_key, g in acc.items():
        best = list(g["best"].values())
        scores = [int(b["score_100"]) for b in best if b.get("score_100") is not None]
        graded = [bool(b["passed"]) for b in best if b.get("passed") is not None]
        gradable = g["safety_gradable_n"]
        out[set_key] = {
            "attempts": g["attempts"],
            "students": len(g["students"]),
            # Rounded on the way out so the wire carries 66.7, not 66.66666666666667.
            "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
            "scored_n": len(scores),
            "pass_rate": round(sum(graded) / len(graded), 3) if graded else None,
            "graded_n": len(graded),
            "safety_fail_rate": round(g["safety_fails"] / gradable, 3) if gradable else None,
            "safety_gradable_n": gradable,
            "missed_top": _missed_top(g["missed"]),
            "by_difficulty": g["by_difficulty"],
        }
    return out
