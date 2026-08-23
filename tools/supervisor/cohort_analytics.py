"""Pure cohort aggregation over raw performance events (P2a, spec §5.1).

No I/O: every function takes already-fetched rows; the `by_group` functions also
take the case index and the student->pool map, so the endpoint stays a thin
ranking/projection and P4 can swap a body for a SQL/RPC pushdown behind the same
`dict[key, {...}]` contract (D4).

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

from tools.supervisor.osce_analysis import is_current_scale
from tools.supervisor.topic_crosswalk import flashcard_group

# The three stored tier names (project-locked; never renamed). An unrecognised
# difficulty is DROPPED rather than folded into "beginner" — a mis-tiered case must
# surface as by_difficulty summing below `attempts`, not as a fabricated tier count.
_DIFFICULTIES = ("beginner", "intermediate", "advanced")

_MISSED_TOP_N = 3
_MISSED_STEP_MAXLEN = 80
_MISSED_MIN_STUDENTS = 2


def _score_rank(row: dict) -> tuple[int, int, int]:
    """Sort key for "best attempt at this case" — high-water on every axis available.

    An unscored (pre-Tier-2) row ranks below every scored one: it carries no attainment
    signal. It still holds the pair's slot, so a pair of unscored rows can feed
    `pass_rate` through the always-present `passed` column.

    `passed` is the LAST tie-break and it is load-bearing, not cosmetic. Over half of
    production case_progress rows are unscored, so for those pairs the first two
    components tie and `passed` is the ONLY thing separating a retake from its original.
    Without it the strict `>` at the call site never fires and the FIRST row wins —
    and get_all_case_scores orders by `id`, i.e. oldest first — so a student who failed
    pre-Tier-2 and passed on retake would be reported as failed, on the majority of rows.
    Score still dominates: a higher score_100 wins even if that attempt was safety-gated
    to passed=False, because D9 defines attainment as the best score."""
    val = row.get("score_100")
    passed = 1 if row.get("passed") else 0
    if val is None:
        return (0, 0, passed)
    try:
        return (1, int(val), passed)
    except (TypeError, ValueError):
        return (0, 0, passed)


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

    Safety denominator (§5.3): `safe = not missed_critical`, and `missed_critical` only
    fills for steps flagged critical, so an attempt on a checklist with NO critical step
    scores `safe=True` while carrying no safety signal. `safety_gradable_n` therefore
    counts an attempt only when its case's checklist can carry one, via the index's
    `has_critical` — False for the 16 of 155 cases that resolve to the rubric fallback,
    which `build_rubric_checklist` emits with `critical: False` on every step and
    `critical_count: 0`. Before this gate those attempts sat in the denominator as
    guaranteed passes and pulled every affected group's rate toward zero.

    The remaining hole is a CONTENT one, not an arithmetic one, and it is the more
    serious of the two: those 16 cases include the highest-acuity stations on the
    platform (penetrating eye injury, hyphaema, retinal detachment, chemical-splash
    triage). They are now honestly reported as carrying no safety signal rather than as
    passing one — but they still need critical steps authored before the safety figure
    covers the cases where safety matters most. The rubric block states this.
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
            "best": {},            # (student_id, case_id) -> best CURRENT-SCALE row
            "legacy_excluded": 0,  # attempts marked on the retired x50 instrument
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
        # `has_critical` False means the case resolved to the rubric fallback, whose steps
        # are ALL critical=False — such an attempt is `safe` by construction and carries no
        # safety signal, so counting it here could only dilute the rate toward zero. An
        # ABSENT flag counts as True: only a checklist PROVEN unable to fail is excluded,
        # so an index built before this field cannot silently empty the denominator.
        if safe is not None and meta.get("has_critical", True):
            g["safety_gradable_n"] += 1
            if not safe:
                g["safety_fails"] += 1

        for step in (r.get("missed_critical") or []):
            entry = g["missed"].setdefault(str(step), {"count": 0, "students": set()})
            entry["count"] += 1
            entry["students"].add(sid)

        # ATTAINMENT ONLY, and the era filter runs HERE — before the high-water pick, not
        # after it. Filtering afterwards lets a retired-scale row win the (student, case)
        # slot on a score it earned on a different instrument and then be dropped, taking
        # the current-era attempt with it: the one comparable reading in the set, deleted.
        if is_current_scale(r):
            key = (sid, case_id)
            current = g["best"].get(key)
            if current is None or _score_rank(r) > _score_rank(current):
                g["best"][key] = r
        else:
            g["legacy_excluded"] += 1

    out: dict[str, dict] = {}
    for set_key, g in acc.items():
        best = list(g["best"].values())
        scores = [int(b["score_100"]) for b in best if b.get("score_100") is not None]
        graded = [bool(b["passed"]) for b in best if b.get("passed") is not None]
        gradable = g["safety_gradable_n"]
        out[set_key] = {
            "attempts": g["attempts"],
            "students": len(g["students"]),
            # Attempts that happened but are on no attainment figure. Stated on the wire
            # for the same reason the hero states it: a silently shorter denominator reads
            # as "nobody was graded", which is the same lie in the other direction.
            "legacy_excluded": g["legacy_excluded"],
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


# ── Weakness scoring ──────────────────────────────────────────────────────────

# Confidence floor. A component below EITHER floor still contributes (shrunk), but flags
# the group low_confidence so the endpoint ranks it below confident groups. Dropping
# below-floor components outright would null all 21 groups at today's ~24 attempts and
# leave the panel permanently blank — the flag is the mechanism, not exclusion.
MIN_STUDENTS: int = 3
MIN_ATTEMPTS: int = 5
# Shrinkage toward the no-evidence prior (deficit 0): w = n / (n + K). K=5 means a single
# attempt keeps ~17% of its deficit and 30 attempts keep ~86%.
SHRINKAGE_K: int = 5

# The ONE place any weighting number lives — Plan B's at-risk model reuses `scales` and
# `confidence` verbatim and declares its own weight block beside them, so the three
# sub-dicts are kept independent: neither model has to fork the normalisation policy to
# change its own weights. Never inline these numbers at a call site.
WEIGHT_RUBRIC: dict = {
    "version": 1,
    # Sum to 1.0, then renormalised over the signals actually present.
    "weights": {
        "osce_score": 0.40,   # graded attainment — the richest signal
        "osce_pass": 0.25,    # pass/fail is coarser than the score, so it weighs less
        "safety": 0.20,       # a safety fail matters out of proportion to its frequency
        "flashcard": 0.15,    # recall, not performance — the weakest evidence of the four
    },
    # Divisor that maps each raw input onto 0-1. score_100 and flashcard accuracy arrive
    # on 0-100; pass_rate and safety_fail_rate are already rates. Without this the OSCE
    # score outweighs the rates 100x in the sum.
    "scales": {
        "osce_score": 100.0,
        "osce_pass": 1.0,
        "safety": 1.0,
        "flashcard": 100.0,
    },
    "confidence": {
        "min_students": MIN_STUDENTS,
        "min_attempts": MIN_ATTEMPTS,
        "shrinkage_k": SHRINKAGE_K,
    },
    # Stated ON THE WIRE because a diluted rate reads as good news. §5.3.
    "caveats": {
        "safety": (
            "safe = not missed_critical, and missed_critical only fills for steps "
            "flagged critical. Attempts on the 16 of 155 cases whose checklist has NO "
            "critical step are excluded from safety_gradable_n rather than counted as "
            "passes, so the rate is no longer diluted toward zero — but those cases "
            "carry no safety signal at all, and they include the highest-acuity "
            "stations. Read this rate with safety_gradable_n."
        ),
    },
}


def _unit(value: float) -> float:
    """Clamp to 0-1. A malformed row (score_100 of 140) would otherwise contribute a
    negative deficit and spend more than its share of the renormalised weight budget."""
    return min(1.0, max(0.0, value))


def _weakness_components(osce_row: dict | None, flashcard_row: dict | None) -> dict[str, dict]:
    """Present signals only, as {name: {"deficit": 0-1, "n": int, "students": int}}.

    A signal is present only when its own metric is non-null AND its own denominator is
    positive — each metric carries its own n, and 54% of production case_progress rows
    have NULL grades, so a group can easily have attempts but no score. An absent signal
    is simply missing from this dict; it is never zero-filled, which would score the
    emptiest group as the weakest.
    """
    scales = WEIGHT_RUBRIC["scales"]
    comps: dict[str, dict] = {}
    o = osce_row or {}
    # osce["students"] is the group's distinct-student count, an upper bound on the
    # per-metric one (which the pinned osce_by_group shape does not carry). The attempt
    # floor is the tight one; this keeps the student floor honest without a shape change.
    o_students = int(o.get("students") or 0)

    if o.get("avg_score") is not None and int(o.get("scored_n") or 0) > 0:
        comps["osce_score"] = {
            "deficit": _unit(1.0 - float(o["avg_score"]) / scales["osce_score"]),
            "n": int(o["scored_n"]),
            "students": o_students,
        }
    if o.get("pass_rate") is not None and int(o.get("graded_n") or 0) > 0:
        comps["osce_pass"] = {
            "deficit": _unit(1.0 - float(o["pass_rate"]) / scales["osce_pass"]),
            "n": int(o["graded_n"]),
            "students": o_students,
        }
    # Excluded, never zeroed, when nothing was gradable: safe = not missed_critical, so an
    # attempt on a checklist with no critical step yields safe=True carrying no safety
    # signal at all. A zero here would read as a clean safety record.
    if o.get("safety_fail_rate") is not None and int(o.get("safety_gradable_n") or 0) > 0:
        comps["safety"] = {
            # The only signal where higher is worse, so it is not inverted.
            "deficit": _unit(float(o["safety_fail_rate"]) / scales["safety"]),
            "n": int(o["safety_gradable_n"]),
            "students": o_students,
        }

    f = flashcard_row or {}
    if f.get("accuracy") is not None and int(f.get("n") or 0) > 0:
        comps["flashcard"] = {
            "deficit": _unit(1.0 - float(f["accuracy"]) / scales["flashcard"]),
            "n": int(f["n"]),
            "students": int(f.get("students") or 0),
        }
    return comps


def flashcard_by_group(rows: list[dict], pools_by_student: dict,
                       *, pool: str | None = None) -> dict[str, dict]:
    """Flashcard accuracy per topic group, from raw flashcard_attempts rows
    ({student_id, topic_tag, correct, ts}).

    `pools_by_student` maps student_id -> "CLINICAL" | "OT"; `pool` filters to one of those
    code literals (None = every discipline). A group only materialises when a row lands in
    it, so `accuracy` is always a float here — absence is the no-data signal, and the
    endpoint projects a missing key to `flashcard: null`. That is the `| None` in the
    contract; it must never appear as an accuracy of 0.0.
    """
    agg: dict[str, dict] = {}
    for r in rows:
        sid = str(r.get("student_id") or "")
        student_pool = pools_by_student.get(sid)
        # Fail closed. A student whose role didn't resolve has no discipline and is
        # dropped from every view, `all` included — the endpoint surfaces them under
        # totals.unclassified_students rather than folding staff and typo'd roles into
        # oa_psa. Pool comes from the STUDENT, not the topic, so a future role-neutral
        # item still counts in the right place.
        if student_pool is None:
            continue
        if pool is not None and student_pool != pool:
            continue
        # Same `or "general"` fallback as db.get_topic_accuracy (db.py:235), and the
        # crosswalk routes "general" to the knowledge group — so an untagged attempt lands
        # in the same bucket here as on the student's own topic breakdown.
        #
        # The STUDENT's pool is passed to flashcard_group (Task 3 added the parameter): a
        # deck studied by every role but examined in only one pool — `ocular_emergencies`,
        # the joint-largest CLINICAL set (10 cases) — pairs with that station for OA/PSA
        # while staying a knowledge group for OT, who never sit it. Pool comes from the
        # student, never from the topic.
        group = flashcard_group(str(r.get("topic_tag") or "general"), student_pool)
        bucket = agg.setdefault(group, {"correct": 0, "n": 0, "students": set()})
        bucket["n"] += 1
        bucket["students"].add(sid)
        if r.get("correct"):
            bucket["correct"] += 1
    return {
        g: {
            # 0-100 at 1dp — exactly db.get_topic_accuracy's `pct` convention
            # (db.py:240-243), so a cohort figure and a student's own breakdown are
            # directly comparable. weakness_scores divides by WEIGHT_RUBRIC["scales"].
            "accuracy": round(100 * b["correct"] / b["n"], 1),
            "n": b["n"],
            "students": len(b["students"]),
        }
        for g, b in agg.items()
    }


def weakness_scores(osce: dict, flashcard: dict) -> dict[str, dict]:
    """Rank-ready weakness per topic group: 0-1, higher = needs teaching attention.

    Replaces cohort_summary's Counter over self-reported weak_topics with real
    performance. Three rules make the ranking trustworthy at SNEC's volume:

    - Weights renormalise over the signals PRESENT, so a group is judged only on the
      evidence it has and a missing metric can't push it up or down the list.
    - Each component is shrunk toward the no-evidence prior by n / (n + SHRINKAGE_K), so
      one catastrophic attempt cannot outrank a well-sampled mediocre topic.
    - `low_confidence` is set unless at least one contributing signal clears BOTH floors;
      the endpoint sorts on (low_confidence, -weakness_score).

    Per-component denominators are not repeated here — the osce/flashcard blocks on the
    same row already carry scored_n / graded_n / safety_gradable_n / n.
    """
    weights = WEIGHT_RUBRIC["weights"]
    out: dict[str, dict] = {}
    for group in sorted(set(osce) | set(flashcard)):
        comps = _weakness_components(osce.get(group), flashcard.get(group))
        if not comps:
            # No signal at all. None, never 0.0 — a zero renders as a perfect topic (D13).
            out[group] = {"weakness_score": None, "low_confidence": True, "signals_present": []}
            continue
        total_w = sum(weights[name] for name in comps)
        score = 0.0
        for name, c in comps.items():
            shrink = c["n"] / (c["n"] + SHRINKAGE_K)
            score += (weights[name] / total_w) * c["deficit"] * shrink
        confident = any(
            c["students"] >= MIN_STUDENTS and c["n"] >= MIN_ATTEMPTS for c in comps.values()
        )
        out[group] = {
            "weakness_score": round(score, 4),
            "low_confidence": not confident,
            # Rubric order, so the UI's explanation of a score reads the same every time.
            "signals_present": [name for name in weights if name in comps],
        }
    return out


# ── Per-student aggregation (Plan B: at-risk + mastery) ───────────────────────
#
# The by_group functions above answer "which TOPIC needs teaching". These answer
# "which STUDENT needs help" over the same rows, and deliberately live here rather
# than in at_risk.py so `_score_rank` — and the D9 high-water rule it encodes — has
# exactly one implementation. There is no `case_index` or `pool` parameter: a
# per-student figure needs no case->topic mapping, and a student must never be
# filtered out of their own row.


def osce_by_student(rows: list[dict]) -> dict[str, dict]:
    """Per-student OSCE metrics from raw `case_progress` rows.

    Same denominator and retake discipline as `osce_by_group`: attainment
    (`avg_score`, `pass_rate`) is the BEST attempt per (student, case) via
    `_score_rank`, `attempts` counts every raw row, and `safety_fail_rate` is over
    raw attempts because an unsafe encounter is an event, not an attainment level —
    a student must not be able to erase one by retaking the case safely.

    Returns dict[student_id, metrics]; a student with no rows is ABSENT, never a
    zero-filled entry, so the caller can pass None and have the signal dropped.
    """
    acc: dict[str, dict] = {}
    for r in rows:
        sid = str(r.get("student_id") or "")
        case_id = str(r.get("case_id") or "")
        if not sid:
            continue
        g = acc.setdefault(sid, {
            "attempts": 0, "best": {}, "legacy_excluded": 0,
            "safety_fails": 0, "safety_gradable_n": 0,
        })
        g["attempts"] += 1

        safe = r.get("safe")
        if safe is not None:
            g["safety_gradable_n"] += 1
            if not safe:
                g["safety_fails"] += 1

        # case_id is NOT NULL from db.insert_case_result, the only writer
        # (tools/shared/db.py:154-159). Unlike osce_by_group, there is no case_index
        # here for a blank case_id to miss against — the `or ""` above would MERGE
        # every blank-case_id row into one dedupe slot instead of dropping it. Left
        # unguarded: no error handling for an impossible case.
        # Same era rule, and for a sharper reason than the group version: this feed is
        # risk_model's `osce_failure` signal, so blending eras scores a student against an
        # instrument they were never marked on — and then bands them on it.
        if is_current_scale(r):
            key = (sid, case_id)
            current = g["best"].get(key)
            if current is None or _score_rank(r) > _score_rank(current):
                g["best"][key] = r
        else:
            g["legacy_excluded"] += 1

    out: dict[str, dict] = {}
    for sid, g in acc.items():
        best = list(g["best"].values())
        scores = [int(b["score_100"]) for b in best if b.get("score_100") is not None]
        graded = [bool(b["passed"]) for b in best if b.get("passed") is not None]
        gradable = g["safety_gradable_n"]
        out[sid] = {
            "attempts": g["attempts"],
            "legacy_excluded": g["legacy_excluded"],
            "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
            "scored_n": len(scores),
            "pass_rate": round(sum(graded) / len(graded), 3) if graded else None,
            "graded_n": len(graded),
            "safety_fail_rate": round(g["safety_fails"] / gradable, 3) if gradable else None,
            "safety_gradable_n": gradable,
        }
    return out


def flashcard_by_student(rows: list[dict]) -> dict[str, dict]:
    """Per-student flashcard accuracy (0-100, 1dp) from raw `flashcard_attempts` rows.

    No topic bucketing and no pool filter — this is the student's whole-bank recall
    rate. 0-100 at 1dp is `db.get_topic_accuracy`'s `pct` convention (db.py:240-243),
    so this figure and the student's own per-topic breakdown are directly comparable.

    A student with no attempts is ABSENT, not `{"accuracy": 0.0}` — the table only
    started accruing rows when Plan A's Task 1 shipped, so a thin table is the norm
    and a 0.0 would read as total recall failure.
    """
    agg: dict[str, dict] = {}
    for r in rows:
        sid = str(r.get("student_id") or "")
        if not sid:
            continue
        bucket = agg.setdefault(sid, {"correct": 0, "n": 0})
        bucket["n"] += 1
        if r.get("correct"):
            bucket["correct"] += 1
    return {
        sid: {"accuracy": round(100 * b["correct"] / b["n"], 1), "n": b["n"]}
        for sid, b in agg.items()
    }


def flashcard_accuracy(topic_accuracy: dict) -> float | None:
    """One student's whole-bank flashcard accuracy (0-100, 1dp) from
    `db.get_topic_accuracy`'s `{topic_tag: {"correct", "total", "pct"}}`.

    The per-student twin of `flashcard_by_student` above, and deliberately adjacent to it:
    both are `100 * correct / attempts` at 1dp over EVERY attempt with no topic bucketing,
    so a student's own figure and the peers they are compared against are ONE definition.
    Split across two files they would drift, and the delta between them is exactly what a
    trainer reads.

    Re-aggregated from the per-topic counts rather than averaging the stored `pct`, which
    would weight a 2-card topic like a 200-card one.

    Exists so the detail page can source a student's own value from the per-student read it
    already performs, instead of from a cached cohort scan — the scan is up to 45s stale
    while `db.get_topic_accuracy` is not, and the same page renders both.

    None — never 0.0 — at a zero denominator. An empty dict is "no attempts logged", the
    normal state on a thin flashcard_attempts table; a 0.0 reads as total recall failure.
    """
    total = sum(int(b.get("total") or 0) for b in topic_accuracy.values())
    if total <= 0:
        return None
    correct = sum(int(b.get("correct") or 0) for b in topic_accuracy.values())
    return round(100 * correct / total, 1)
