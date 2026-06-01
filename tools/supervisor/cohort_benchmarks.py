#!/usr/bin/env python3
"""Compute per-topic average retention scores across the whole cohort."""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db


async def get_cohort_benchmarks() -> list[dict]:
    """Return topics sorted weakest-first with cohort average retention.

    Only includes topics that appear in >= 2 student profiles.

    Returns:
        list of {"topic": str, "avg_score": float, "student_count": int}
    """
    try:
        profiles = await db.get_all_profiles()
    except Exception:
        return []

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
