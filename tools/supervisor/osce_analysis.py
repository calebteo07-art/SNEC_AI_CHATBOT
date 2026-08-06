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
