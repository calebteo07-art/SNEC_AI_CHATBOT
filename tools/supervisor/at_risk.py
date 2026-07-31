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

The flashcard read is the one exception to "failures propagate", and that split now lives
in `cohort_reads`: `get_all_flashcard_attempts` documents that the CALLER must catch
(`db.py:565-568`), and the sibling cohort endpoint degrades it the same way, because a thin
or absent `flashcard_attempts` table is the NORMAL case. `risk_model` renormalises the
missing signal away, so the other 82% of the rubric still scores. Population and OSCE
stay fail-closed — an empty cohort is a lie, not a degraded reading.

Only `band in {high, medium}` is returned (D12). `low` and `no_data` are computed and
dropped, so every consumer keeps reading "the students to act on" — and the row is a
strict SUPERSET of the old shape, so no consumer loses a key it indexes. Notably
`weekly_digest._risk_section` indexes `days_inactive` and `weak_topics` directly; Task 4
fixes how it *renders* a None.
"""
import asyncio
import sys
import time
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared.clock import app_today
from tools.supervisor.cohort_analytics import flashcard_by_student, osce_by_student
from tools.supervisor.cohort_reads import get_cohort_reads
from tools.supervisor.risk_model import score_student

# Bands worth a trainer's attention. `low`/`no_data` are computed, then dropped (D12).
FLAGGED_BANDS = ("high", "medium")

# Per-worker read cache. get_at_risk does two whole-table paginated reads and
# /api/supervisor/at-risk sits on the console's 30s poll, so an open console would
# otherwise scan both tables twice a minute on Render's SINGLE uvicorn worker. This is
# the idempotent-read-cache carve-out of production invariant #2: derived output only,
# no counters, no cross-request semantics. Shaped exactly like admin.py's _cohort_cache
# (age checked on read) so tests/conftest.py can reset it the same way. Tests patch
# _CACHE_TTL_S to 0. There is one view, so the key is constant — add a dimension here the
# day the endpoint takes a filter, or a filtered request is served the unfiltered list.
_CACHE_TTL_S: float = 45.0
_cache: dict[str, tuple[float, list[dict]]] = {}

# Single-flight over the DERIVED recompute. The reads below are already single-flighted by
# cohort_reads, so this no longer prevents duplicate scans — it stops two concurrent
# callers that both miss this cache from bucketing the same rows twice, and makes the
# second one wait for the first's list instead. Per-worker, like the cache it guards.
_refresh_lock = asyncio.Lock()


def _days_inactive(last_active_raw) -> int | None:
    """Whole days since `last_active` in SGT, or None when it is absent or unparseable.

    None means "unknown", which `risk_model` drops as a missing signal. Returning 0
    would read as "active today" and hide a genuinely stale account behind bad data.

    Clamped at 0: a future `last_active` (clock skew, imported rows) means the student
    HAS been active, and an unclamped negative reaches the weekly digest as the literal
    text "-10d inactive" — the same wire-level bug the SGT switch above exists to fix.
    """
    if not last_active_raw:
        return None
    try:
        return max(0, (app_today() - date.fromisoformat(str(last_active_raw))).days)
    except (ValueError, TypeError):
        return None


def _fresh() -> list[dict] | None:
    """The cached rows if they are still inside the TTL, else None.

    Returns a COPY: a consumer that sorts or pops the returned list would otherwise
    poison every hit for the rest of the TTL.
    """
    hit = _cache.get("all")
    if _CACHE_TTL_S > 0 and hit and (time.monotonic() - hit[0]) < _CACHE_TTL_S:
        return list(hit[1])
    return None


async def get_at_risk() -> list[dict]:
    """Flagged students, worst first.

    Returns list of dicts:
        {student_id, risk_score, band, reasons, last_active, days_inactive,
         weak_topics, weak_count}

    Raises on a read failure — the caller's 500 guard is the correct response, not an
    empty list.
    """
    cached = _fresh()
    if cached is not None:
        return cached

    async with _refresh_lock:
        # Re-check under the lock: a concurrent caller may have filled the cache while
        # we queued, which is exactly the /cohort + /at-risk poll pair.
        cached = _fresh()
        if cached is not None:
            return cached

        now = time.monotonic()
        # One shared read of the three cohort tables, so /at-risk, /cohort-analytics and
        # every student-detail page pay for at most one scan of each per 45s. The failure
        # split is unchanged and now lives in that module: population and OSCE raise (the
        # caller's 500 guard is the correct response), flashcards degrade to [] so
        # risk_model renormalises the missing signal away and the other 82% of the rubric
        # still scores.
        reads = await get_cohort_reads()

        osce = osce_by_student(reads.case_rows)
        flashcard = flashcard_by_student(reads.card_rows)

        flagged: list[dict] = []
        for p in reads.profiles:
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
