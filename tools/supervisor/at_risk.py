#!/usr/bin/env python3
"""Score every active student for academic risk and return the flagged ones.

Thin wiring: `risk_model` owns the weight policy and `cohort_analytics` owns the
aggregation, so this module only assembles the population, reads the events and
projects the rows. Replaces a single binary rule
(`days_inactive >= 5 AND len(weak_topics) >= 2`) that carried no score, no reason and
no performance signal — a student who failed every station yesterday was invisible.

Three deliberate departures from the old implementation:

* **Failures propagate.** The old `except Exception: return []` made the router's 500
  guard (`supervisor.py:83-84`) unreachable, so a Supabase outage rendered as "0
  students at risk" — the most dangerous possible way for this feature to fail.
* **Population is staff-free.** `db.get_active_profiles()` filters on
  approved_students membership alone, and `admin_promote` leaves that row in place, so
  a promoted trainer carrying a real "OA" role stayed in the cohort — flagged at risk
  and emailed in the weekly digest. `get_active_student_profiles()` subtracts
  `supervisors` membership.
* **SGT clock.** `last_active` is written in SGT and the product defines a day that
  way; `date.today()` on a UTC host can return `days_inactive == -1`.

Only `band in {high, medium}` is returned (D12). `low` and `no_data` are computed and
dropped, so all four consumers keep reading "the students to act on" — and the row is
a strict SUPERSET of the old shape, because `weekly_digest._risk_section` indexes
`days_inactive` and `weak_topics` directly.
"""
import sys
import time
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db
from tools.shared.clock import app_today
from tools.supervisor.cohort_analytics import flashcard_by_student, osce_by_student
from tools.supervisor.risk_model import score_student

# Bands worth a trainer's attention. `low`/`no_data` are computed, then dropped (D12).
FLAGGED_BANDS = ("high", "medium")

# Per-worker read cache. get_at_risk does two whole-table paginated reads and
# /api/supervisor/at-risk sits on the console's 30s poll, so an open console would
# otherwise scan both tables twice a minute on Render's SINGLE uvicorn worker. This is
# the idempotent-read-cache carve-out of production invariant #2: derived output only,
# no counters, no cross-request semantics. Tests patch _CACHE_TTL_S to 0.
_CACHE_TTL_S: float = 45.0
_cache: dict[str, tuple[float, list[dict]]] = {}


def _days_inactive(last_active_raw) -> int | None:
    """Whole days since `last_active` in SGT, or None when it is absent or unparseable.

    None means "unknown", which `risk_model` drops as a missing signal. Returning 0
    would read as "active today" and hide a genuinely stale account behind bad data.
    """
    if not last_active_raw:
        return None
    try:
        return (app_today() - date.fromisoformat(str(last_active_raw))).days
    except (ValueError, TypeError):
        return None


async def get_at_risk() -> list[dict]:
    """Flagged students, worst first.

    Returns list of dicts:
        {student_id, risk_score, band, reasons, last_active, days_inactive,
         weak_topics, weak_count}

    Raises on a read failure — the caller's 500 guard is the correct response, not an
    empty list.
    """
    now = time.monotonic()
    if _CACHE_TTL_S > 0:
        # Evict on write rather than only skipping stale entries, so a long-running
        # worker cannot accumulate them.
        for key in [k for k, (ts, _) in _cache.items() if now - ts >= _CACHE_TTL_S]:
            _cache.pop(key, None)
        hit = _cache.get("all")
        if hit is not None:
            return hit[1]

    profiles, _staff_excluded = await db.get_active_student_profiles()
    case_rows, _cases_complete = await db.get_all_case_scores()
    card_rows, _cards_complete = await db.get_all_flashcard_attempts()

    osce = osce_by_student(case_rows)
    flashcard = flashcard_by_student(card_rows)

    flagged: list[dict] = []
    for p in profiles:
        sid = str(p.get("student_id") or "")
        if not sid:
            continue
        weak = p.get("weak_topics") or []
        last_active_raw = p.get("last_active")
        days = _days_inactive(last_active_raw)
        streak = p.get("streak")

        scored = score_student(
            days_inactive=days,
            streak=int(streak) if streak is not None else None,
            weak_count=len(weak),
            osce=osce.get(sid),
            flashcard=flashcard.get(sid),
        )
        if scored["band"] not in FLAGGED_BANDS:
            continue
        flagged.append({
            "student_id": sid,
            "risk_score": scored["risk_score"],
            "band": scored["band"],
            "reasons": scored["reasons"],
            # Back-compat superset — weekly_digest indexes these directly.
            "last_active": str(last_active_raw) if last_active_raw else "",
            "days_inactive": days,
            "weak_topics": weak,
            "weak_count": len(weak),
        })

    # Fully ordered: worst first, then id, so a tie does not reorder between polls.
    flagged.sort(key=lambda r: (-(r["risk_score"] or 0), r["student_id"]))
    if _CACHE_TTL_S > 0:
        _cache["all"] = (now, flagged)
    return flagged
