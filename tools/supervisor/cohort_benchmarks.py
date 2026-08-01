#!/usr/bin/env python3
"""Compute per-topic average retention scores across the whole cohort."""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db


async def get_cohort_benchmarks() -> list[dict]:
    """Return topics sorted weakest-first with cohort average retention.

    Only includes topics that appear in >= 2 student profiles — one student is an
    anecdote, and a single bad attempt would otherwise top a table read as "teach this
    next".

    **Raises on a read failure.** This used to catch everything and return `[]`, which
    made `/api/supervisor/benchmarks`'s own 500 guard (routers/supervisor.py) dead code:
    the exception never reached it, so a database outage rendered as "no topics
    benchmarked yet" — indistinguishable from a cohort that simply has not studied. The
    two other callers already handle this correctly: generate_report has its own
    try/except that degrades the PDF's benchmark section to empty, and weekly_digest
    already propagates from cohort_summary() and get_at_risk() rather than mailing a
    half-empty digest as the weekly record.

    **Population is STAFF-FREE** (D10). `get_active_profiles()` includes trainers and
    admins, so a trainer's own retention_scores were averaged into the student cohort
    mean that the same trainer reads — and at SNEC intake sizes one staff profile moves a
    topic's average visibly.

    Returns:
        list of {"topic": str, "avg_score": float, "student_count": int}
    """
    profiles, _staff_excluded = await db.get_active_student_profiles()

    totals: dict[str, float] = {}
    counts: dict[str, int] = {}

    for p in profiles:
        scores = p.get("retention_scores") or {}
        for topic, score in scores.items():
            try:
                score_f = float(score)
            except (TypeError, ValueError):
                continue
            totals[topic] = totals.get(topic, 0.0) + score_f
            counts[topic] = counts.get(topic, 0) + 1

    benchmarks = [
        {
            "topic": topic,
            "avg_score": round(totals[topic] / counts[topic], 4),
            "student_count": counts[topic],
        }
        for topic in totals
        if counts[topic] >= 2
    ]
    benchmarks.sort(key=lambda x: x["avg_score"])
    return benchmarks
