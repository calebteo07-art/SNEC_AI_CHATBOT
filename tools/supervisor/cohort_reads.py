#!/usr/bin/env python3
"""One shared read of the three cohort-wide tables, cached per worker for 45s.

Three admin features need the same three whole-table reads —
`db.get_active_student_profiles`, `db.get_all_case_scores`,
`db.get_all_flashcard_attempts`:

* `at_risk.get_at_risk()` (the console's 30s /at-risk poll)
* `GET /api/admin/cohort-analytics`
* `GET /api/admin/student/{id}/detail`

The rows are BYTE-IDENTICAL for all three — and, for the detail page, for every student a
trainer opens. So the cache lives here, over the RAW reads, rather than as a third or
fourth memoised derived output. The detail endpoint was uncached entirely and its query
background-refetches (`frontend/src/hooks/useAdmin.ts:9`), so a trainer reviewing ten
students cost ~60 whole-table scans against Render's SINGLE uvicorn worker, on
`flashcard_attempts` — the product's highest-volume table.

This is the idempotent-read-cache carve-out of production invariant #2, and the narrowest
possible version of it: no counters, no cross-request semantics, no derived output at all,
and a cold worker simply re-reads. Consumers keep their OWN derived caches on top —
those exist to keep a full-table Python bucketing pass off the event loop (invariant #1),
which is a different job from the egress this one saves.

**The failure split is the contract, and it is asymmetric on purpose.**

* Population and OSCE **fail closed** — this call raises, and each caller's existing guard
  turns that into its own answer (a 500 for cohort-analytics, propagation for at-risk,
  `mastery: null` for the detail page). An empty cohort is a lie, not a degraded reading:
  "the database is down" and "nobody has attempted anything" must never render alike.
* Flashcards **degrade** to `card_rows=[]` + `flashcard_ok=False`.
  `get_all_flashcard_attempts` documents that the CALLER must catch (`db.py:565-568`)
  because a thin or absent `flashcard_attempts` table is the NORMAL pre-migration-010
  state. `flashcard_ok` is load-bearing: it is the only thing keeping "unavailable"
  distinguishable from "empty", and conflating them renders an outage as a confident 0%.

A failed population/OSCE read is NEVER cached — an outage must retry. A degraded flashcard
read IS cached, because the missing-table case is the steady state and re-attempting it on
every request would defeat the cache exactly where it is needed most.

Resident set is one copy of the three tables per worker for 45s, versus up to three
concurrent per-request copies before — strictly less than the status quo. `db._fetch_all`
already caps each read at 50 x 1000 rows.

Tests patch `_READ_TTL_S` to 0, which disables the read AND the write. Every existing
endpoint test file does exactly that, so its own per-test stubs are always honoured.
`tests/conftest.py` clears `_cache` around every test — an unregistered cache here would
serve one test's stubbed rows to every later test in the process.
"""
import asyncio
import sys
import time
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db

# Matches at_risk._CACHE_TTL_S and admin._COHORT_TTL_SECONDS. 0 disables read and write.
_READ_TTL_S: float = 45.0

# One view, so the key is constant — shaped exactly like at_risk._cache so conftest's
# reset block is a copy of the one already there. Add a dimension here the day this
# module takes a filter, or a filtered caller is served the unfiltered rows.
_cache: dict[str, tuple[float, "CohortReads"]] = {}

# Single-flight. The cache alone is check-then-fill with three awaited reads in between,
# and the console mounts its admin queries on ONE 30s refetchInterval, so concurrent
# callers all miss a cold cache and all scan. Serialising the miss path means the later
# callers wait for the first's result instead of duplicating it. Per-worker, like the
# cache it guards.
_refresh_lock = asyncio.Lock()


@dataclass(frozen=True)
class CohortReads:
    """The three raw tables plus the two facts a caller cannot recover from the rows.

    Named fields rather than a tuple: five positional values unpacked at three call sites
    is how a caller silently swaps `staff_excluded` for `flashcard_ok`.

    `staff_excluded` is the count `get_active_student_profiles` subtracted, surfaced by
    /cohort-analytics so a shrunken cohort is explained rather than just smaller.
    `flashcard_ok` is False when the flashcard read failed — see the module docstring.

    The lists are per-caller copies; the row dicts inside are SHARED and read-only by
    contract. No aggregator mutates a row today, and none may start.
    """
    profiles: list[dict]
    staff_excluded: int
    case_rows: list[dict]
    card_rows: list[dict]
    flashcard_ok: bool


def _handout(bundle: CohortReads) -> CohortReads:
    """A per-caller view with fresh list objects.

    Same reason at_risk._fresh() returns a copy: a consumer that sorts or pops a returned
    list would otherwise poison every hit for the rest of the TTL. Three shallow copies of
    pointer lists, not a deep copy — the rows themselves stay shared.
    """
    return CohortReads(
        profiles=list(bundle.profiles),
        staff_excluded=bundle.staff_excluded,
        case_rows=list(bundle.case_rows),
        card_rows=list(bundle.card_rows),
        flashcard_ok=bundle.flashcard_ok,
    )


def _fresh() -> CohortReads | None:
    """The cached bundle if it is still inside the TTL, else None."""
    hit = _cache.get("all")
    if _READ_TTL_S > 0 and hit and (time.monotonic() - hit[0]) < _READ_TTL_S:
        return _handout(hit[1])
    return None


async def get_cohort_reads() -> CohortReads:
    """The three cohort-wide tables, shared across consumers for up to `_READ_TTL_S`.

    Raises if the population or OSCE read fails. Degrades the flashcard read to
    `card_rows=[]` + `flashcard_ok=False`. See the module docstring for why those two
    are different.
    """
    cached = _fresh()
    if cached is not None:
        return cached

    async with _refresh_lock:
        # Re-check under the lock: a concurrent caller may have filled the cache while we
        # queued, which is exactly the console's simultaneous admin queries.
        cached = _fresh()
        if cached is not None:
            return cached

        # Timestamped BEFORE the reads, like at_risk: the entry's age then includes the
        # time the reads took, which errs toward refreshing sooner.
        now = time.monotonic()
        # Sequential, NOT asyncio.gather. Gathering would fire the case scan even after
        # the population read has already failed — a second full-table scan against a
        # database that is evidently struggling, and in the test suite an unstubbed db
        # call reaching live production Supabase.
        #
        # `complete` is unpacked and deliberately dropped on both scans: no consumer's
        # response shape has a completeness field, and _fetch_all caps at 50 x 1000 rows,
        # ~2000x the current volume.
        profiles, staff_excluded = await db.get_active_student_profiles()
        case_rows, _cases_complete = await db.get_all_case_scores()
        flashcard_ok = True
        try:
            card_rows, _cards_complete = await db.get_all_flashcard_attempts()
        except Exception:
            # Degrade, don't raise — see the module docstring.
            card_rows, flashcard_ok = [], False

        bundle = CohortReads(
            profiles=profiles,
            staff_excluded=staff_excluded,
            case_rows=case_rows,
            card_rows=card_rows,
            flashcard_ok=flashcard_ok,
        )
        if _READ_TTL_S > 0:
            _cache["all"] = (now, bundle)
        return _handout(bundle)
