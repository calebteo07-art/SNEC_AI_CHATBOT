#!/usr/bin/env python3
"""Compute per-topic average retention scores across the whole cohort."""

import json

from tools.shared.gsheets import get_rows


def get_cohort_benchmarks() -> list[dict]:
    """Return topics sorted weakest-first with cohort average retention.

    Only includes topics that appear in >= 2 student profiles so single
    outliers don't skew the benchmark view.

    Returns:
        list of {"topic": str, "avg_score": float, "student_count": int}
    """
    try:
        profiles = get_rows("snec_profiles")
    except Exception:
        return []

    totals: dict[str, float] = {}
    counts: dict[str, int] = {}

    for p in profiles:
        raw = p.get("retention_scores", "") or "{}"
        try:
            scores: dict[str, float] = json.loads(raw)
        except Exception:
            continue
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
