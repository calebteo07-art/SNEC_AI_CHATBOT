#!/usr/bin/env python3
"""Flag students who meet the at-risk threshold:
no login in 5+ days AND 2+ unresolved weak topics.
"""
import sys
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db
from tools.shared.audit_log import log

INACTIVE_THRESHOLD_DAYS = 5
WEAK_TOPIC_THRESHOLD = 2


async def get_at_risk() -> list[dict]:
    """
    Returns list of dicts:
        {student_id, last_active, days_inactive, weak_topics, weak_count}
    """
    try:
        profiles = await db.get_active_profiles()
    except Exception as exc:
        log("at_risk_error", feature="supervisor", detail=str(exc))
        return []

    today = date.today()
    at_risk = []

    for p in profiles:
        last_active_raw = p.get("last_active")
        if not last_active_raw:
            continue
        try:
            last = date.fromisoformat(str(last_active_raw))
            days_inactive = (today - last).days
        except (ValueError, TypeError):
            continue

        weak = p.get("weak_topics") or []

        if days_inactive >= INACTIVE_THRESHOLD_DAYS and len(weak) >= WEAK_TOPIC_THRESHOLD:
            at_risk.append({
                "student_id": p["student_id"],
                "last_active": str(last_active_raw),
                "days_inactive": days_inactive,
                "weak_topics": weak,
                "weak_count": len(weak),
            })

    return at_risk
