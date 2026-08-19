#!/usr/bin/env python3
"""Aggregate all student profiles into cohort-level statistics."""
import sys
from collections import Counter
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db
from tools.shared.clock import app_today
from tools.supervisor.at_risk import get_at_risk


async def cohort_summary() -> dict:
    """
    Returns:
        {
            "total": int,
            "active_this_week": int,
            "inactive_7_plus_days": list[dict],
            "weakest_topics": list[{"topic": str, "count": int}],
            "at_risk_count": int,
        }
    """
    # Failures propagate: supervisor.py:74-75 turns them into a 500. The old
    # all-zeros return made that guard unreachable and rendered an outage as a
    # perfectly healthy cohort of 0 students.
    #
    # STAFF-FREE, by membership. This read get_active_profiles(), which filters on
    # approved_students alone with no supervisors check, so a promoted trainer and the
    # SUPER_ADMIN_EMAIL account were counted as students indefinitely — while
    # `at_risk_count` directly below, and the console's own "students in scope" pill,
    # were already staff-free. The console therefore printed two different student
    # populations side by side, one of them wrong.
    profiles, staff_excluded = await db.get_active_student_profiles()

    # SGT, not date.today(): last_active is written in SGT, so a UTC host can read an
    # evening check-in as tomorrow and report days_inactive == -1.
    today = app_today()
    active_this_week = 0
    inactive_7_plus = []
    topic_counter: Counter = Counter()

    for p in profiles:
        last_active_raw = p.get("last_active")
        if last_active_raw:
            try:
                last = date.fromisoformat(str(last_active_raw))
                days_inactive = (today - last).days
                if days_inactive < 7:
                    active_this_week += 1
                else:
                    inactive_7_plus.append({
                        "student_id": p["student_id"],
                        "last_active": str(last_active_raw),
                        "days_inactive": days_inactive,
                    })
            except (ValueError, TypeError):
                pass

        topic_counter.update(p.get("weak_topics") or [])

    return {
        "total": len(profiles),
        # How many accounts were subtracted as staff. Rendered on the card, because a
        # headcount that silently drops by two between one release and the next reads as
        # lost students rather than as a corrected denominator.
        "staff_excluded": staff_excluded,
        "active_this_week": active_this_week,
        "inactive_7_plus_days": inactive_7_plus,
        "weakest_topics": [
            {"topic": t, "count": n} for t, n in topic_counter.most_common(8)
        ],
        # ONE definition of "at risk", shared with the list this KPI sits above.
        # A second copy of the rule here is what made the count contradict the list —
        # and AdminCohort.tsx:41 prefers this number over the list's own length, while
        # supervisor_insights feeds both into a single AI prompt.
        #
        # Counted over the STAFF-FREE population (get_at_risk reads
        # get_active_student_profiles) — the same population `total` above now uses, so
        # the two figures on the card finally describe the same set of people.
        #
        # Costs two whole-table scans, deduplicated per worker by get_at_risk's 45s
        # cache and its single-flight lock — the console polls /cohort and /at-risk
        # concurrently on the same 30s interval, so without that lock both would miss
        # and both would scan.
        "at_risk_count": len(await get_at_risk()),
    }
