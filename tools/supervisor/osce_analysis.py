"""Cross-attempt OSCE analysis for one student (spec §4.2-4.4).

Everything here answers a question a table of totals cannot: where the marks actually go,
which steps a student misses HABITUALLY rather than once, and whether they are getting better.

Pure: no I/O, no clock, no AI.
"""
from __future__ import annotations

from dataclasses import dataclass

from tools.supervisor.topic_map import norm_key

# migration 017's stamp: 2 = the 40/30/30 buckets, NULL = the retired x50 era.
GRADE_SCALE_CURRENT = 2
BUCKET_MAX = {"checklist": 40, "consult": 30, "judgement": 30}
_BUCKET_COLUMN = {"checklist": "checklist_coverage", "consult": "consult_technique",
                  "judgement": "judgement_safety"}


@dataclass(frozen=True)
class MarkLoss:
    lost: dict[str, int]
    total_lost: int
    shares: dict[str, float]
    attempts: int
    excluded_legacy: int


def mark_loss(case_rows: list[dict]) -> MarkLoss:
    """Decompose the marks LOST across attempts (spec §4.2).

    Only attempts stamped with the current scale are summed. A row on the retired x50 scale
    is counted and named as excluded, never blended: its sub-scores are out of 50, and adding
    them to /30 figures would read as a performance collapse that is only a rescale.
    """
    lost = {"checklist": 0, "consult": 0, "judgement": 0}
    attempts = 0
    excluded = 0
    for row in case_rows:
        if row.get("grade_scale") != GRADE_SCALE_CURRENT:
            excluded += 1
            continue
        values = {b: row.get(col) for b, col in _BUCKET_COLUMN.items()}
        if any(v is None for v in values.values()):
            # Stamped current but missing a bucket: not decomposable, and guessing the
            # missing one would invent the very figure this section reports.
            excluded += 1
            continue
        for bucket, value in values.items():
            lost[bucket] += max(0, BUCKET_MAX[bucket] - int(value))
        attempts += 1
    total = sum(lost.values())
    shares = ({b: round(100 * v / total, 1) for b, v in lost.items()} if total
              else {b: 0.0 for b in lost})
    return MarkLoss(lost=lost, total_lost=total, shares=shares,
                    attempts=attempts, excluded_legacy=excluded)


MIN_REPEATS = 2


@dataclass(frozen=True)
class Offender:
    action: str
    missed: int
    critical: bool
    # How many attempts CONTAINED this step. None when nothing recorded it (the
    # missed_critical path) -- an absent denominator is honest, a fabricated one is not.
    appeared: int | None = None


def repeat_offenders(case_rows: list[dict], minimum: int = MIN_REPEATS) -> list[Offender]:
    """Steps missed in `minimum` or more attempts, with the denominator (spec §4.3).

    Reads the migration-019 ledger. An attempt without one contributes nothing -- treating a
    NULL as "every step performed" would quietly clear a student's record.
    """
    seen: dict[str, dict] = {}
    for row in case_rows:
        detail = row.get("checklist_detail")
        if not isinstance(detail, list):
            continue
        for step in detail:
            key = norm_key(step.get("action"))
            if not key:
                continue
            entry = seen.setdefault(key, {"action": str(step.get("action") or ""),
                                          "missed": 0, "appeared": 0, "critical": False})
            entry["appeared"] += 1
            if not step.get("performed"):
                entry["missed"] += 1
            if step.get("critical"):
                entry["critical"] = True
    out = [Offender(action=e["action"], missed=e["missed"], appeared=e["appeared"],
                    critical=e["critical"])
           for e in seen.values() if e["missed"] >= minimum]
    return sorted(out, key=lambda o: (-o.missed, -(o.appeared or 0), o.action))


def critical_offenders(case_rows: list[dict], minimum: int = MIN_REPEATS) -> list[Offender]:
    """The same idea over `missed_critical`, stored since migration 011 -- so this half works
    on attempts that predate the ledger."""
    seen: dict[str, dict] = {}
    for row in case_rows:
        for raw in (row.get("missed_critical") or []):
            key = norm_key(raw)
            if not key:
                continue
            entry = seen.setdefault(key, {"action": str(raw), "missed": 0})
            entry["missed"] += 1
    out = [Offender(action=e["action"], missed=e["missed"], appeared=None, critical=True)
           for e in seen.values() if e["missed"] >= minimum]
    return sorted(out, key=lambda o: (-o.missed, o.action))


MIN_TRAJECTORY_N = 4
# Movement smaller than this is inside the noise of a per-station grade.
TRAJECTORY_DEAD_BAND = 5.0


@dataclass(frozen=True)
class Trajectory:
    band: str                    # improving | steady | declining | insufficient
    delta: float | None
    n: int
    needed: int
    first_mean: float | None
    second_mean: float | None


def trajectory(values: list[float], minimum: int = MIN_TRAJECTORY_N) -> Trajectory:
    """First half vs second half (spec §4.4).

    `values` MUST already be in chronological order: the timestamp column differs by source
    (case_progress.completed_at vs flashcard_attempts.created_at), so ordering is the
    caller's job and sorting here would silently accept an unordered list.

    Below `minimum` this returns `insufficient` WITH the counts. It does not draw a line
    through two points -- which is what `learning_velocity`, the single word this replaces,
    has always been willing to do.
    """
    n = len(values)
    if n < minimum:
        return Trajectory(band="insufficient", delta=None, n=n, needed=minimum,
                          first_mean=None, second_mean=None)
    half = n // 2
    first, second = values[:half], values[n - half:]
    first_mean = sum(first) / len(first)
    second_mean = sum(second) / len(second)
    delta = round(second_mean - first_mean, 1)
    if delta >= TRAJECTORY_DEAD_BAND:
        band = "improving"
    elif delta <= -TRAJECTORY_DEAD_BAND:
        band = "declining"
    else:
        band = "steady"
    return Trajectory(band=band, delta=delta, n=n, needed=minimum,
                      first_mean=round(first_mean, 1), second_mean=round(second_mean, 1))
