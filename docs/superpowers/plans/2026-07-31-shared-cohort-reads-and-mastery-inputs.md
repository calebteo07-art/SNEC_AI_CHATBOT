# Shared cohort reads + per-student mastery inputs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put one 45s cache of the three raw cohort-wide table reads under all three admin
consumers, and re-source a student's own three mastery values from the per-student reads
already on their detail page.

**Architecture:** A new pure-wiring module `tools/supervisor/cohort_reads.py` owns the
three reads, their failure split (profiles + cases raise, flashcards degrade), a 45s TTL
cache and a single-flight lock. The three consumers each swap three `await db.…` calls for
one `await get_cohort_reads()` and keep their own derived caches unchanged. Then
`mastery_block` changes shape from `(student_id, per_student)` to `(own, peers)` so a
student's own figures come from `db.get_case_results` / `db.get_topic_accuracy` /
`get_profile` — the same reads that render the panels beside them — while the cached
cohort scan supplies only the peer average and the membership gate.

**Tech Stack:** Python 3.12, FastAPI, pytest + pytest-asyncio, `unittest.mock.patch` /
`AsyncMock`. No new dependencies, no migration, no frontend change.

**Design doc:** `docs/superpowers/specs/2026-07-31-shared-cohort-reads-and-mastery-inputs-design.md`

---

## Ground rules for every task

- **Read a file before you edit it.** The `Edit`/`Write` tools reject an unread file.
- **Never leave a `db.*` call unstubbed in an endpoint test.** `tests/conftest.py`'s
  autouse `_forbid_real_supabase` patches `db._get_client` to raise and fails the test on
  the way out — but the aborted read can still be swallowed by a handler's degrade, so an
  unstubbed call shows up as a confusing `mastery: null` rather than an obvious error.
- **Tests run keyless.** `MOCK_MODE` is automatic when `GEMINI_API_KEY` is unset. Never
  fire a live Gemini call.
- Run pytest from the repo root: `python -m pytest -q`.
- The dev box is Windows/PowerShell. The `bash` blocks below run fine through the Bash
  tool; use absolute paths, never `cd <relative>`.

## File structure

| File | Responsibility | Task |
|---|---|---|
| `tools/supervisor/cohort_reads.py` | **Create.** The three reads, failure split, 45s cache, single-flight | 1 |
| `tests/supervisor/test_cohort_reads.py` | **Create.** Cache, single-flight, failure split, hand-out copies | 1 |
| `tests/conftest.py` | **Modify.** Register the new cache in `_reset_shared_api_state` | 2 |
| `tests/test_cache_registration.py` | **Create.** Order-independent guard that the reset covers it | 2 |
| `tools/supervisor/at_risk.py` | **Modify.** Consume the shared reads; re-document `_refresh_lock` | 3 |
| `tests/supervisor/test_at_risk.py` | **Modify.** Autouse fixture pinning `_READ_TTL_S = 0` | 3 |
| `tools/api/routers/admin.py` (`admin_cohort_analytics`) | **Modify.** Consume the shared reads | 4 |
| `tests/api/test_admin_cohort_analytics.py` | **Modify.** Extend the autouse fixture to disable the read cache | 4 |
| `tools/api/routers/admin.py` (`admin_student_detail`) | **Modify.** Consume the shared reads (part 1), then own/peers (part 2) | 5, 8 |
| `tests/api/test_admin_read_sharing.py` | **Create.** Cross-endpoint: one read serves both endpoints | 5 |
| `tools/supervisor/cohort_analytics.py` | **Modify.** Add `flashcard_accuracy` beside `flashcard_by_student` | 6 |
| `tests/supervisor/test_cohort_analytics_by_student.py` | **Modify.** Tests for `flashcard_accuracy` | 6 |
| `tools/supervisor/mastery.py` | **Modify.** `mastery_block(own, peers)`; delete `leave_one_out` + `_peers_n` | 7 |
| `tests/supervisor/test_mastery.py` | **Modify.** Re-express the four `leave_one_out` cases as peer-mean tests | 7 |
| `tests/api/test_admin_student_detail.py` | **Modify.** Own-value fixtures + the freshness-contradiction tests | 5, 8 |

**Commit boundaries:** Tasks 1–5 are commit 1 (shared read cache — no output change).
Tasks 6–8 are commit 2 (mastery inputs — semantics change). Task 9 verifies and pushes.

---

## Task 1: The shared read module

**Files:**
- Create: `tools/supervisor/cohort_reads.py`
- Test: `tests/supervisor/test_cohort_reads.py`

- [ ] **Step 1: Read the module this one is modelled on**

Read `tools/supervisor/at_risk.py` lines 50–101. The new module copies its cache shape
(`_cache["all"] = (monotonic_ts, value)`, age checked on read, TTL 0 disables read *and*
write, hand out a copy) so `tests/conftest.py` can reset it identically.

- [ ] **Step 2: Write the failing tests**

Create `tests/supervisor/test_cohort_reads.py`:

```python
"""One shared read of the three cohort-wide tables, cached per worker.

`at_risk`, `/api/admin/cohort-analytics` and `/api/admin/student/{id}/detail` each read
db.get_active_student_profiles + db.get_all_case_scores + db.get_all_flashcard_attempts.
The rows are byte-identical for all three, so they are cached here ONCE — raw, never as
three separate derived outputs.

The failure split is the load-bearing part and is asserted from both sides: population and
OSCE fail CLOSED (an empty cohort is a lie, not a degraded reading), flashcards DEGRADE
(a thin or absent flashcard_attempts table is the documented normal case).
"""
import asyncio
import time
from unittest.mock import AsyncMock, patch

import pytest

from tools.supervisor import cohort_reads as mod

_PROFILES = [{"student_id": "s1", "role": "OA"}]
_CASES = [{"student_id": "s1", "case_id": "c1", "score_100": 90}]
_CARDS = [{"student_id": "s1", "topic_tag": "red_eye", "correct": True}]


def _reads(profiles=None, cases=None, cards=None, ttl=45.0):
    """Patch all three db reads. Every one must be stubbed: an unstubbed db call in this
    suite reaches live production Supabase (tests/conftest.py::_forbid_real_supabase)."""
    return (
        patch("tools.shared.db.get_active_student_profiles",
              new=AsyncMock(return_value=(_PROFILES if profiles is None else profiles, 0))),
        patch("tools.shared.db.get_all_case_scores",
              new=AsyncMock(return_value=(_CASES if cases is None else cases, True))),
        patch("tools.shared.db.get_all_flashcard_attempts",
              new=AsyncMock(return_value=(_CARDS if cards is None else cards, True))),
        patch.object(mod, "_READ_TTL_S", ttl),
    )


@pytest.mark.asyncio
async def test_returns_all_three_tables_and_the_staff_count():
    p1, p2, p3, p4 = _reads()
    with p1, p2, p3, p4:
        reads = await mod.get_cohort_reads()
    assert reads.profiles == _PROFILES
    assert reads.case_rows == _CASES
    assert reads.card_rows == _CARDS
    assert reads.staff_excluded == 0
    assert reads.flashcard_ok is True


@pytest.mark.asyncio
async def test_a_second_call_inside_the_ttl_does_not_reread():
    # The whole point: three consumers, one scan of each table per TTL window.
    cases_read = AsyncMock(return_value=(_CASES, True))
    with patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(return_value=(_PROFILES, 0))), \
         patch("tools.shared.db.get_all_case_scores", new=cases_read), \
         patch("tools.shared.db.get_all_flashcard_attempts",
               new=AsyncMock(return_value=(_CARDS, True))), \
         patch.object(mod, "_READ_TTL_S", 45.0):
        first = await mod.get_cohort_reads()
        second = await mod.get_cohort_reads()
    assert cases_read.await_count == 1
    assert second.case_rows == first.case_rows


@pytest.mark.asyncio
async def test_ttl_zero_disables_the_cache_entirely():
    # Both directions: TTL 0 must disable the WRITE as well as the read, or the entry
    # survives into the next test's stubs. Every existing test file relies on this.
    cases_read = AsyncMock(return_value=(_CASES, True))
    with patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(return_value=(_PROFILES, 0))), \
         patch("tools.shared.db.get_all_case_scores", new=cases_read), \
         patch("tools.shared.db.get_all_flashcard_attempts",
               new=AsyncMock(return_value=(_CARDS, True))), \
         patch.object(mod, "_READ_TTL_S", 0):
        await mod.get_cohort_reads()
        await mod.get_cohort_reads()
    assert cases_read.await_count == 2
    assert mod._cache == {}, "TTL 0 must not write an entry"


@pytest.mark.asyncio
async def test_an_entry_older_than_the_ttl_is_not_served():
    # Age is checked on READ. Seed a stale entry rather than moving the clock, so the
    # asyncio timer heap keeps its real time.monotonic.
    mod._cache["all"] = (time.monotonic() - 46.0,
                         mod.CohortReads(profiles=[], staff_excluded=0, case_rows=[],
                                         card_rows=[], flashcard_ok=True))
    p1, p2, p3, p4 = _reads()
    with p1, p2, p3, p4:
        reads = await mod.get_cohort_reads()
    assert reads.profiles == _PROFILES, "a stale entry must not be served"


@pytest.mark.asyncio
async def test_concurrent_callers_read_once_not_twice():
    # The console mounts several admin queries on the SAME 30s refetchInterval
    # (frontend/src/hooks/useAdmin.ts:9), so the requests arrive together. A bare
    # check-then-fill cache awaits between the check and the fill, so both miss and both
    # scan — the exact doubling this module exists to remove.
    async def _slow(*_a, **_k):
        await asyncio.sleep(0)  # yield, so a naive cache lets the second caller through
        return (_CASES, True)

    cases_read = AsyncMock(side_effect=_slow)
    with patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(side_effect=_slow)), \
         patch("tools.shared.db.get_all_case_scores", new=cases_read), \
         patch("tools.shared.db.get_all_flashcard_attempts", new=AsyncMock(side_effect=_slow)), \
         patch.object(mod, "_READ_TTL_S", 45.0):
        both = await asyncio.gather(mod.get_cohort_reads(), mod.get_cohort_reads())
    assert cases_read.await_count == 1, "concurrent callers must not both scan"
    assert both[0].case_rows == both[1].case_rows == _CASES


@pytest.mark.asyncio
async def test_a_population_failure_propagates_and_is_not_cached():
    # Fail CLOSED. "The database is down" and "nobody is enrolled" must not render
    # identically, and a cached outage would keep lying for the rest of the TTL.
    with patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(side_effect=RuntimeError("supabase down"))), \
         patch.object(mod, "_READ_TTL_S", 45.0):
        with pytest.raises(RuntimeError):
            await mod.get_cohort_reads()
    assert mod._cache == {}, "a failed read must not be cached"


@pytest.mark.asyncio
async def test_the_population_failure_short_circuits_the_other_reads():
    # Sequential, not asyncio.gather. Firing the case scan after the population has
    # already failed costs a second full-table scan against a struggling database — and
    # in this suite it reaches an unstubbed db call, i.e. live production Supabase.
    cases_read = AsyncMock(return_value=(_CASES, True))
    with patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(side_effect=RuntimeError("supabase down"))), \
         patch("tools.shared.db.get_all_case_scores", new=cases_read), \
         patch.object(mod, "_READ_TTL_S", 45.0):
        with pytest.raises(RuntimeError):
            await mod.get_cohort_reads()
    assert cases_read.await_count == 0


@pytest.mark.asyncio
async def test_an_osce_failure_propagates():
    with patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(return_value=(_PROFILES, 0))), \
         patch("tools.shared.db.get_all_case_scores",
               new=AsyncMock(side_effect=RuntimeError("supabase down"))), \
         patch.object(mod, "_READ_TTL_S", 45.0):
        with pytest.raises(RuntimeError):
            await mod.get_cohort_reads()
    assert mod._cache == {}


@pytest.mark.asyncio
async def test_a_flashcard_failure_degrades_and_is_flagged():
    # get_all_flashcard_attempts RAISES by design on a missing table (db.py:565-568) —
    # the normal pre-migration-010 state. flashcard_ok is the only thing that keeps
    # "the table is unavailable" distinguishable from "the table is empty", which is what
    # stops an outage rendering as a confident 0% cohort accuracy.
    with patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(return_value=(_PROFILES, 0))), \
         patch("tools.shared.db.get_all_case_scores",
               new=AsyncMock(return_value=(_CASES, True))), \
         patch("tools.shared.db.get_all_flashcard_attempts",
               new=AsyncMock(side_effect=RuntimeError("relation does not exist"))), \
         patch.object(mod, "_READ_TTL_S", 45.0):
        reads = await mod.get_cohort_reads()
    assert reads.flashcard_ok is False
    assert reads.card_rows == []
    assert reads.profiles == _PROFILES, "the other two scales stay fully computable"


@pytest.mark.asyncio
async def test_a_degraded_flashcard_read_is_still_cached():
    # A MISSING flashcard_attempts table is the documented normal state, not an incident.
    # Refusing to cache that bundle would defeat the cache on the common path — every
    # request would re-attempt and re-fail the same read.
    fc_read = AsyncMock(side_effect=RuntimeError("relation does not exist"))
    with patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(return_value=(_PROFILES, 0))), \
         patch("tools.shared.db.get_all_case_scores",
               new=AsyncMock(return_value=(_CASES, True))), \
         patch("tools.shared.db.get_all_flashcard_attempts", new=fc_read), \
         patch.object(mod, "_READ_TTL_S", 45.0):
        await mod.get_cohort_reads()
        second = await mod.get_cohort_reads()
    assert fc_read.await_count == 1
    assert second.flashcard_ok is False


@pytest.mark.asyncio
async def test_each_caller_gets_its_own_list_objects():
    # One consumer sorting or popping a returned list would otherwise poison every hit
    # for the rest of the TTL — the reason at_risk._fresh() already hands out a copy.
    p1, p2, p3, p4 = _reads()
    with p1, p2, p3, p4:
        first = await mod.get_cohort_reads()
        first.case_rows.clear()
        first.profiles.append({"student_id": "injected"})
        second = await mod.get_cohort_reads()
    assert second.case_rows == _CASES
    assert second.profiles == _PROFILES
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
python -m pytest tests/supervisor/test_cohort_reads.py -q
```

Expected: collection error — `ModuleNotFoundError: No module named 'tools.supervisor.cohort_reads'`.

- [ ] **Step 4: Write the module**

Create `tools/supervisor/cohort_reads.py`:

```python
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
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
python -m pytest tests/supervisor/test_cohort_reads.py -q
```

Expected: `11 passed`.

- [ ] **Step 6: Mutation-test the three assertions that matter most**

Break the fix, confirm the test catches it, then restore. Do these one at a time:

1. Change `if _READ_TTL_S > 0` on the write to `if True` →
   `test_ttl_zero_disables_the_cache_entirely` must FAIL.
2. Move the `_cache["all"] = …` write above the `try` that degrades flashcards, so a
   population failure is cached → `test_a_population_failure_propagates_and_is_not_cached`
   must FAIL.
3. Return `bundle` instead of `_handout(bundle)` from both return sites →
   `test_each_caller_gets_its_own_list_objects` must FAIL.

Restore the file after each. If any mutation leaves the suite green, that test is not
pinning what it claims and must be strengthened before moving on.

- [ ] **Step 7: Commit**

```bash
git add tools/supervisor/cohort_reads.py tests/supervisor/test_cohort_reads.py
git commit -m "feat(admin): one shared 45s cache of the three cohort-wide table reads"
```

---

## Task 2: Register the cache with the test harness

**Files:**
- Modify: `tests/conftest.py:98-114` (inside `_reset_shared_api_state`)
- Create: `tests/test_cache_registration.py`

This task exists because an unregistered process-global cache serves one test's stubbed
rows to every later test in the process. That has bitten this suite before — it is why
`_cohort_cache` and `at_risk._cache` are already reset there.

- [ ] **Step 1: Write the failing test**

Create `tests/test_cache_registration.py`:

```python
"""Every process-global TTL cache must be reset between tests.

pytest runs the whole suite in ONE process, so a cache that `_reset_shared_api_state`
does not know about survives across tests and serves one test's stubbed rows to every
later test — silently, as a plausible-looking pass. The failure is order-dependent and
only shows up in a full-suite run, which makes it expensive to find and easy to
misdiagnose.

This asserts the registration DIRECTLY rather than relying on a later test noticing, so
adding a cache without wiring it up fails here immediately and by name.
"""
from tests.conftest import _reset_shared_api_state


def test_reset_clears_the_shared_cohort_read_cache():
    from tools.supervisor import cohort_reads

    cohort_reads._cache["all"] = (0.0, "seeded")
    _reset_shared_api_state()
    assert cohort_reads._cache == {}


def test_reset_clears_the_caches_that_were_already_registered():
    # Pins the three that already existed, so a refactor of _reset_shared_api_state
    # cannot quietly drop one on its way to adding another.
    from tools.api.routers import admin
    from tools.supervisor import at_risk

    admin._cohort_cache[("all", "90")] = (0.0, {"seeded": True})
    at_risk._cache["all"] = (0.0, [])
    _reset_shared_api_state()
    assert admin._cohort_cache == {}
    assert at_risk._cache == {}
```

- [ ] **Step 2: Run it to verify the first test fails**

```bash
python -m pytest tests/test_cache_registration.py -q
```

Expected: `test_reset_clears_the_shared_cohort_read_cache` FAILS with
`assert {'all': (0.0, 'seeded')} == {}`. The second test passes already.

- [ ] **Step 3: Register the cache**

In `tests/conftest.py`, after the existing `at_risk` block that ends at line 114, add:

```python
    # And the shared cohort READ cache underneath all three of the above. It holds the raw
    # rows every admin roll-up reads, under a single key with no per-request dimension, so
    # one test that reaches it without patching _READ_TTL_S would serve its own stubbed
    # tables to every later test in the process.
    try:
        from tools.supervisor.cohort_reads import _cache as _cohort_reads_cache
        _cohort_reads_cache.clear()
    except Exception:
        pass
```

- [ ] **Step 4: Run to verify both pass**

```bash
python -m pytest tests/test_cache_registration.py -q
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add tests/conftest.py tests/test_cache_registration.py
git commit -m "test: reset the shared cohort-read cache between tests"
```

---

## Task 3: Wire `at_risk` to the shared reads

**Files:**
- Modify: `tools/supervisor/at_risk.py` (imports, the `_refresh_lock` comment, lines 126–141)
- Modify: `tests/supervisor/test_at_risk.py` (add one autouse fixture)

- [ ] **Step 1: Read both files**

Read `tools/supervisor/at_risk.py` and `tests/supervisor/test_at_risk.py` in full. The
existing tests patch `tools.shared.db.*` — those patches keep working because
`cohort_reads` imports the `db` *module* and resolves the attribute at call time.

- [ ] **Step 2: Pin the existing tests to at_risk's OWN cache**

Add this autouse fixture to `tests/supervisor/test_at_risk.py`, immediately after the
imports (before `_profile`):

```python
@pytest.fixture(autouse=True)
def _no_shared_read_cache():
    """Disable the cohort READ cache for this file.

    These tests pin at_risk's own derived cache (`_CACHE_TTL_S`), and several make two
    calls under different stubs. With the read cache live underneath, `await_count`
    assertions would measure the wrong layer and the second call would be served the
    first's rows — a test passing for a reason it does not claim.
    """
    from tools.supervisor import cohort_reads

    with patch.object(cohort_reads, "_READ_TTL_S", 0):
        yield
```

- [ ] **Step 3: Run the existing at_risk tests, unchanged, to confirm they still pass**

```bash
python -m pytest tests/supervisor/test_at_risk.py -q
```

Expected: `14 passed`. This is the baseline the wiring must not disturb.

- [ ] **Step 4: Write the failing test**

Append to `tests/supervisor/test_at_risk.py`:

```python
@pytest.mark.asyncio
async def test_reads_go_through_the_shared_cohort_read_module():
    """at_risk must not read the three tables directly any more.

    /at-risk, /cohort-analytics and every student-detail page read the same three whole
    tables; sharing one read is the only thing that stops a trainer's review session
    costing dozens of scans on Render's single worker. Asserted at the seam rather than
    by counting reads, because at_risk's own derived cache would hide a duplicate scan
    from a call-count test.
    """
    from datetime import date as _date

    from tools.supervisor import cohort_reads

    profiles = [_profile("s1", ["a", "b", "c", "d", "e"], "2026-04-20", streak=0)]
    shared = AsyncMock(return_value=cohort_reads.CohortReads(
        profiles=profiles, staff_excluded=0, case_rows=[], card_rows=[], flashcard_ok=True,
    ))
    with patch.object(mod, "get_cohort_reads", new=shared), \
         patch.object(mod, "_CACHE_TTL_S", 0), \
         patch.object(mod, "app_today", return_value=_date(2026, 5, 10)):
        result = await mod.get_at_risk()
    assert shared.await_count == 1
    assert [r["student_id"] for r in result] == ["s1"]
```

- [ ] **Step 5: Run it to verify it fails**

```bash
python -m pytest tests/supervisor/test_at_risk.py::test_reads_go_through_the_shared_cohort_read_module -q
```

Expected: FAIL with `AttributeError: <module 'tools.supervisor.at_risk'> does not have the attribute 'get_cohort_reads'`.

- [ ] **Step 6: Wire the module**

In `tools/supervisor/at_risk.py`, add to the imports after the
`from tools.supervisor.cohort_analytics import …` line:

```python
from tools.supervisor.cohort_reads import get_cohort_reads
```

Replace the `_refresh_lock` comment block (lines 64–70) with:

```python
# Single-flight over the DERIVED recompute. The reads below are already single-flighted by
# cohort_reads, so this no longer prevents duplicate scans — it stops two concurrent
# callers that both miss this cache from bucketing the same rows twice, and makes the
# second one wait for the first's list instead. Per-worker, like the cache it guards.
_refresh_lock = asyncio.Lock()
```

Replace lines 124–138 (from `now = time.monotonic()` through the two aggregator calls) with:

```python
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
```

Then update the module docstring's flashcard paragraph (lines 23–28) — replace its first
sentence with:

```
The flashcard read is the one exception to "failures propagate", and that split now lives
in `cohort_reads`: `get_all_flashcard_attempts` documents that the CALLER must catch
(`db.py:565-568`), and the sibling cohort endpoint degrades it the same way, because a thin
or absent `flashcard_attempts` table is the NORMAL case.
```

- [ ] **Step 7: Run the whole at_risk file**

```bash
python -m pytest tests/supervisor/test_at_risk.py -q
```

Expected: `15 passed` — the 14 from Step 3 plus the new seam test.

- [ ] **Step 8: Verify no direct reads remain**

```bash
grep -n "db.get_active_student_profiles\|db.get_all_case_scores\|db.get_all_flashcard_attempts" tools/supervisor/at_risk.py
```

Expected: no output from the code body (docstring mentions are fine and expected).

- [ ] **Step 9: Commit**

```bash
git add tools/supervisor/at_risk.py tests/supervisor/test_at_risk.py
git commit -m "refactor(admin): at-risk reads the shared cohort bundle"
```

---

## Task 4: Wire `admin_cohort_analytics` to the shared reads

**Files:**
- Modify: `tools/api/routers/admin.py:397-425`
- Modify: `tests/api/test_admin_cohort_analytics.py:113-121` (the autouse fixture)

- [ ] **Step 1: Read both files**

Read `tools/api/routers/admin.py` lines 358–440 and
`tests/api/test_admin_cohort_analytics.py` lines 1–160 plus 470–545.

- [ ] **Step 2: Extend the autouse fixture to disable the read cache**

Two things in this file break under a live read cache, and both are the read cache working
correctly rather than a bug: `reader.await_count` is used as a proxy for "the derived cache
was missed" (lines 495 and 516), and nine tests issue several requests each — some with
*different* stubbed rows per request, which the read cache would flatten to the first.

Replace `_no_cohort_cache` (lines 113–121) with:

```python
@pytest.fixture(autouse=True)
def _no_cohort_cache():
    """Disable BOTH caches in this file's path.

    The endpoint keeps a per-worker TTL cache keyed on (discipline, days) — without
    clearing it every test after the first would assert against the FIRST test's payload,
    patched DB mocks and all. TTL=0 disables its read and its write.

    The shared cohort READ cache underneath is disabled for the same reason and one more:
    several tests here issue multiple requests under DIFFERENT stubbed rows, and a live
    read cache would serve the first request's tables to all of them. It also decouples
    `await_count` from "the derived cache was missed", which is exactly what two tests
    below use it to measure. Read-sharing across endpoints is pinned in
    tests/api/test_admin_read_sharing.py, where it is the subject rather than a confound.
    """
    from tools.supervisor import cohort_reads

    admin_router._cohort_cache.clear()
    with patch("tools.api.routers.admin._COHORT_TTL_SECONDS", 0.0), \
         patch.object(cohort_reads, "_READ_TTL_S", 0):
        yield
    admin_router._cohort_cache.clear()
```

- [ ] **Step 3: Run the file to confirm the baseline is green before touching the handler**

```bash
python -m pytest tests/api/test_admin_cohort_analytics.py -q
```

Expected: all pass (the fixture change is inert until the handler is wired).

- [ ] **Step 4: Wire the handler**

In `tools/api/routers/admin.py`, add to the imports beside the other supervisor imports:

```python
from tools.supervisor.cohort_reads import get_cohort_reads
```

Replace lines 397–424 — the whole `try:` block through
`fc_rows, flashcard_source = [], "unavailable"`, stopping before the blank line 425 — with:

```python
    try:
        # D10: students only, by MEMBERSHIP. get_active_profiles() is NOT staff-free — a
        # promoted student keeps their approved_students row (admin_promote below) and the
        # super-admin's address is routinely on the roster — and
        # get_active_leaderboard_profiles() adds trainers/admins on purpose. A lecturer's
        # demo run inside a cohort mean is a lie that never expires.
        #
        # One shared read across /at-risk, this endpoint and every student-detail page
        # (cohort_reads). It RAISES if the population or OSCE read fails: a 500 below is
        # the intended outcome, because failing open would restore an inflated denominator
        # that LOOKS correct. Never fall through to a plausible empty cohort — "the DB is
        # down" and "nobody has attempted anything" must not render identically. This is
        # the defect class P1 exists to kill.
        reads = await get_cohort_reads()
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")

    profiles, staff_excluded = reads.profiles, reads.staff_excluded
    case_rows = reads.case_rows
    # Flashcards degrade instead of failing. flashcard_attempts only started receiving rows
    # in P2, so a thin or unavailable table is the NORMAL case — it renders as "no data",
    # never as {accuracy: 0.0}, which would send trainers to remediate an unstudied topic.
    fc_rows = reads.card_rows
    flashcard_source = "ok" if reads.flashcard_ok else "unavailable"
```

Everything below (`case_index`, the window filter, the aggregation, the payload, the
eviction sweep) is unchanged.

- [ ] **Step 5: Run the file**

```bash
python -m pytest tests/api/test_admin_cohort_analytics.py -q
```

Expected: all pass, same count as Step 3.

- [ ] **Step 6: Mutation-test the failure split**

Change `flashcard_source = "ok" if reads.flashcard_ok else "unavailable"` to a bare
`flashcard_source = "ok"`. Run the file. The flashcard-outage test (around line 362) must
FAIL — it asserts `sources.flashcard == "unavailable"` and that the panel renders "no
data" rather than 0%. Restore.

- [ ] **Step 7: Commit**

```bash
git add tools/api/routers/admin.py tests/api/test_admin_cohort_analytics.py
git commit -m "refactor(admin): cohort-analytics reads the shared cohort bundle"
```

---

## Task 5: Wire `admin_student_detail`'s cohort reads, and pin the sharing

This is the last task of commit 1. `mastery_block` keeps its current
`(student_id, per_student)` signature here — only the *source* of the three reads changes,
so the response is byte-identical. Task 8 changes the semantics.

**Files:**
- Modify: `tools/api/routers/admin.py:750-763`
- Modify: `tests/api/test_admin_student_detail.py` (add one autouse fixture)
- Create: `tests/api/test_admin_read_sharing.py`

- [ ] **Step 1: Read the files**

Read `tools/api/routers/admin.py` lines 720–800 and
`tests/api/test_admin_student_detail.py` in full.

- [ ] **Step 2: Pin the existing detail tests to their own stubs**

Add this autouse fixture to `tests/api/test_admin_student_detail.py`, immediately after
`client = TestClient(app)`:

```python
@pytest.fixture(autouse=True)
def _no_shared_read_cache():
    """Disable the cohort READ cache for this file, so each test's stubs are what the
    handler actually sees. Read-sharing is pinned in tests/api/test_admin_read_sharing.py,
    where it is the subject rather than a confound — here it would only mask a stub."""
    from tools.supervisor import cohort_reads

    with patch.object(cohort_reads, "_READ_TTL_S", 0):
        yield
```

Add `import pytest` to that file's imports.

- [ ] **Step 3: Run the file to confirm the baseline**

```bash
python -m pytest tests/api/test_admin_student_detail.py -q
```

Expected: `8 passed`.

- [ ] **Step 4: Write the failing cross-endpoint test**

Create `tests/api/test_admin_read_sharing.py`:

```python
"""One read of each cohort-wide table serves every admin consumer inside the TTL.

/api/admin/cohort-analytics and /api/admin/student/{id}/detail each read
get_active_student_profiles + get_all_case_scores + get_all_flashcard_attempts, and the
detail endpoint had no cache at all while its query background-refetches
(frontend/src/hooks/useAdmin.ts:9). A trainer reviewing ten students cost ~60 whole-table
scans on Render's SINGLE worker, against flashcard_attempts — the highest-volume table.

This is the only file that exercises the read cache THROUGH the endpoints, so it is the
only one that does not disable it.
"""
import contextlib
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

_PROFILES = [{"student_id": "s1", "role": "OA", "retention_scores": {"red_eye": 0.8}}]
_CASES = [{"student_id": "s1", "case_id": "c1", "score_100": 90, "passed": True, "safe": True}]
_CARDS = [{"student_id": "s1", "topic_tag": "red_eye", "correct": True}]


def _cookies():
    # Unique sub per test FILE: slowapi keys the per-minute buckets on the JWT sub, so a
    # shared sub would let another file's requests rate-limit these.
    return {"eyebot_token": create_access_token("stu_read_sharing", "admin", "OA")}


def _shared_read_stubs(profiles_read, cases_read, cards_read):
    """Every db call BOTH endpoints make. Leaving one unstubbed reaches live production
    Supabase (tests/conftest.py::_forbid_real_supabase)."""
    return [
        patch("tools.shared.db.get_active_student_profiles", new=profiles_read),
        patch("tools.shared.db.get_all_case_scores", new=cases_read),
        patch("tools.shared.db.get_all_flashcard_attempts", new=cards_read),
        # Per-student reads for the detail endpoint — deliberately NOT cached.
        patch("tools.api.routers.admin.get_profile",
              new=AsyncMock(return_value={"student_id": "s1", "role": "OA",
                                          "retention_scores": {"red_eye": 0.8}})),
        patch("tools.shared.db.get_consent_by_student_id",
              new=AsyncMock(return_value={"student_name": "A B", "email": "a@b.c"})),
        patch("tools.shared.db.get_sessions", new=AsyncMock(return_value=[])),
        patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=list(_CASES))),
        patch("tools.shared.db.get_topic_accuracy", new=AsyncMock(return_value={})),
    ]


def test_one_scan_serves_both_endpoints_inside_the_ttl():
    profiles_read = AsyncMock(return_value=(_PROFILES, 0))
    cases_read = AsyncMock(return_value=(_CASES, True))
    cards_read = AsyncMock(return_value=(_CARDS, True))
    with contextlib.ExitStack() as es:
        for p in _shared_read_stubs(profiles_read, cases_read, cards_read):
            es.enter_context(p)
        a = client.get("/api/admin/cohort-analytics?discipline=all&days=90", cookies=_cookies())
        b = client.get("/api/admin/student/s1/detail", cookies=_cookies())
    assert a.status_code == 200 and b.status_code == 200
    assert profiles_read.await_count == 1
    assert cases_read.await_count == 1
    assert cards_read.await_count == 1, "flashcard_attempts is the highest-volume table"


def test_walking_students_does_not_rescan_per_student():
    # The reported shape: a trainer opening ten students in a row. The rows are identical
    # for every student, so they must be read once, not once per click.
    profiles_read = AsyncMock(return_value=(_PROFILES, 0))
    cases_read = AsyncMock(return_value=(_CASES, True))
    cards_read = AsyncMock(return_value=(_CARDS, True))
    with contextlib.ExitStack() as es:
        for p in _shared_read_stubs(profiles_read, cases_read, cards_read):
            es.enter_context(p)
        for i in range(10):
            assert client.get(f"/api/admin/student/s{i}/detail",
                              cookies=_cookies()).status_code == 200
    assert cards_read.await_count == 1, "ten students cost ten scans of the biggest table"
```

- [ ] **Step 5: Run it to verify it fails**

```bash
python -m pytest tests/api/test_admin_read_sharing.py -q
```

Expected: both FAIL — `assert 2 == 1` (first test) and `assert 10 == 1` (second), because
the detail endpoint still reads directly.

- [ ] **Step 6: Wire the handler**

In `tools/api/routers/admin.py`, replace lines 752–767 — from the
`# \`complete\` is dropped on both:` comment down to and including `for p in cohort_profiles:`,
leaving `mastery = None` and `try:` above it in place — with:

```python
        # One shared read across /at-risk, /cohort-analytics and every student a trainer
        # opens (cohort_reads). This endpoint was the uncached one, and its query
        # background-refetches, so a review session cost a full scan of the three tables
        # per student per poll. The flashcard degrade that used to be inlined here lives
        # in that module now, for the same reason: get_all_flashcard_attempts RAISES by
        # design on a missing table (db.py:566), the NORMAL pre-migration-010 state, and a
        # shared try would let that expected failure null the OSCE and retention scales
        # too, both of which are fully computable without it.
        reads = await get_cohort_reads()
        osce_per_student = osce_by_student(reads.case_rows)
        cards_per_student = flashcard_by_student(reads.card_rows)
        per_student = {}
        for p in reads.profiles:
```

The replacement ends with `for p in reads.profiles:`, so the loop body below it and the
`if student_id in per_student:` gate stay exactly as they are. After the edit, confirm
nothing was duplicated:

```bash
grep -n "cohort_profiles\|cohort_cases\|cohort_cards" tools/api/routers/admin.py
```

Expected: no output.

- [ ] **Step 7: Run the new file and the detail file**

```bash
python -m pytest tests/api/test_admin_read_sharing.py tests/api/test_admin_student_detail.py -q
```

Expected: `10 passed`.

- [ ] **Step 8: Verify the response is unchanged — the point of commit 1**

```bash
python -m pytest tests/api tests/supervisor -q
```

Expected: all pass. Commit 1 changes no output; any failure here is a real regression.

- [ ] **Step 9: Commit**

```bash
git add tools/api/routers/admin.py tests/api/test_admin_student_detail.py tests/api/test_admin_read_sharing.py
git commit -m "perf(admin): student detail reads the shared cohort bundle instead of rescanning"
```

---

## Task 6: `flashcard_accuracy` — a student's own whole-bank figure

Commit 2 starts here.

**Files:**
- Modify: `tools/supervisor/cohort_analytics.py` (add after `flashcard_by_student`, ~line 488)
- Test: `tests/supervisor/test_cohort_analytics_by_student.py`

- [ ] **Step 1: Read both files**

Read `tools/supervisor/cohort_analytics.py` lines 460–489 and
`tests/supervisor/test_cohort_analytics_by_student.py` lines 75–115.

- [ ] **Step 2: Write the failing tests**

Append to `tests/supervisor/test_cohort_analytics_by_student.py`:

```python
def test_flashcard_accuracy_is_the_whole_bank_figure():
    from tools.supervisor.cohort_analytics import flashcard_accuracy

    # db.get_topic_accuracy's shape: {topic_tag: {"correct", "total", "pct"}}.
    topics = {"red_eye": {"correct": 3, "total": 4, "pct": 75.0},
              "glaucoma": {"correct": 1, "total": 6, "pct": 16.7}}
    # 4 of 10 attempts, NOT the mean of 75.0 and 16.7 (45.9) — averaging the per-topic
    # percentages would weight a 4-card topic the same as a 40-card one.
    assert flashcard_accuracy(topics) == 40.0


def test_flashcard_accuracy_agrees_with_the_cohort_definition():
    from tools.supervisor.cohort_analytics import flashcard_accuracy, flashcard_by_student

    # The student's own value and their peers' MUST be one definition, or the delta on
    # the detail page compares two different measurements.
    rows = [{"student_id": "s1", "topic_tag": "red_eye", "correct": True},
            {"student_id": "s1", "topic_tag": "red_eye", "correct": False},
            {"student_id": "s1", "topic_tag": "glaucoma", "correct": True}]
    from_cohort = flashcard_by_student(rows)["s1"]["accuracy"]
    from_topics = flashcard_accuracy({"red_eye": {"correct": 1, "total": 2},
                                      "glaucoma": {"correct": 1, "total": 1}})
    assert from_topics == from_cohort == 66.7


def test_flashcard_accuracy_is_none_not_zero_without_attempts():
    from tools.supervisor.cohort_analytics import flashcard_accuracy

    # A thin flashcard_attempts table is the norm. 0.0 reads as total recall failure and
    # would drag the cohort average down as if the student had answered everything wrong.
    assert flashcard_accuracy({}) is None
    assert flashcard_accuracy({"red_eye": {"correct": 0, "total": 0}}) is None


def test_flashcard_accuracy_keeps_a_genuine_zero():
    from tools.supervisor.cohort_analytics import flashcard_accuracy

    # The opposite error: a student who really did get every card wrong scores 0.0, and
    # that is a real reading, not missing data.
    assert flashcard_accuracy({"red_eye": {"correct": 0, "total": 5}}) == 0.0
```

- [ ] **Step 3: Run to verify they fail**

```bash
python -m pytest tests/supervisor/test_cohort_analytics_by_student.py -q -k flashcard_accuracy
```

Expected: FAIL with `ImportError: cannot import name 'flashcard_accuracy'`.

- [ ] **Step 4: Implement it**

Append to `tools/supervisor/cohort_analytics.py`, directly after `flashcard_by_student`:

```python
def flashcard_accuracy(topic_accuracy: dict) -> float | None:
    """One student's whole-bank flashcard accuracy (0-100, 1dp) from
    `db.get_topic_accuracy`'s `{topic_tag: {"correct", "total", "pct"}}`.

    The per-student twin of `flashcard_by_student` above, and deliberately adjacent to it:
    both are `100 * correct / attempts` at 1dp over EVERY attempt with no topic bucketing,
    so a student's own figure and the peers they are compared against are ONE definition.
    Split across two files they would drift, and the delta between them is exactly what a
    trainer reads.

    Re-aggregated from the per-topic counts rather than averaging the stored `pct`, which
    would weight a 2-card topic like a 200-card one.

    Exists so the detail page can source a student's own value from the per-student read it
    already performs, instead of from a cached cohort scan — the scan is up to 45s stale
    while `db.get_topic_accuracy` is not, and the same page renders both.

    None — never 0.0 — at a zero denominator. An empty dict is "no attempts logged", the
    normal state on a thin flashcard_attempts table; a 0.0 reads as total recall failure.
    """
    total = sum(int(b.get("total") or 0) for b in topic_accuracy.values())
    if total <= 0:
        return None
    correct = sum(int(b.get("correct") or 0) for b in topic_accuracy.values())
    return round(100 * correct / total, 1)
```

- [ ] **Step 5: Run to verify they pass**

```bash
python -m pytest tests/supervisor/test_cohort_analytics_by_student.py -q
```

Expected: all pass.

- [ ] **Step 6: Mutation-test the None-vs-zero rule**

Change `if total <= 0: return None` to `if total <= 0: return 0.0`.
`test_flashcard_accuracy_is_none_not_zero_without_attempts` must FAIL. Restore.

- [ ] **Step 7: Commit**

```bash
git add tools/supervisor/cohort_analytics.py tests/supervisor/test_cohort_analytics_by_student.py
git commit -m "feat(admin): whole-bank flashcard accuracy from a student's own topic counts"
```

---

## Task 7: `mastery_block(own, peers)`

**Files:**
- Modify: `tools/supervisor/mastery.py:29-52` (delete) and `:103-150` (rewrite)
- Modify: `tests/supervisor/test_mastery.py:1-115`

- [ ] **Step 1: Read both files**

Read `tools/supervisor/mastery.py` and `tests/supervisor/test_mastery.py` in full.

- [ ] **Step 2: Rewrite the tests**

In `tests/supervisor/test_mastery.py`, change the import line to:

```python
from tools.supervisor.mastery import mastery_block, retention_mastery
```

Delete the four `leave_one_out` tests (`test_leave_one_out_excludes_the_student` and the
three after it, through the `total=50.0, n=2, value=0.0` case) and replace the whole block
from that import down to — but not including — the `retention_mastery` tests, with:

```python
def _own(osce=90.0, flashcard=80.0, retention=70.0):
    return {"osce": osce, "flashcard": flashcard, "retention": retention}


def _peers():
    """Two peers with every scale, one with only retention. The viewed student is NEVER
    in here — the caller drops them before calling."""
    return {
        "s2": {"osce": 60.0, "flashcard": 40.0, "retention": 50.0},
        "s3": {"osce": 30.0, "flashcard": 60.0, "retention": 70.0},
        "s4": {"retention": 60.0},
    }


def test_returns_three_separately_named_scales():
    # Never one blended number: OSCE attainment, flashcard recall and retention measure
    # different things, and averaging them would hide which one to act on.
    out = mastery_block(_own(), _peers())
    assert set(out) == {"osce_mastery", "flashcard_mastery", "retention_mastery"}


def test_the_cohort_average_is_the_mean_of_the_peers_only():
    out = mastery_block(_own(), _peers())
    assert out["osce_mastery"]["cohort_avg"] == 45.0     # (60 + 30) / 2
    assert out["osce_mastery"]["peers_n"] == 2
    assert out["retention_mastery"]["cohort_avg"] == 60.0  # (50 + 70 + 60) / 3
    assert out["retention_mastery"]["peers_n"] == 3


def test_delta_is_against_the_peer_mean():
    out = mastery_block(_own(), _peers())
    assert out["osce_mastery"]["value"] == 90.0
    assert out["osce_mastery"]["delta"] == 45.0          # 90 - 45


def test_the_student_is_never_in_their_own_peer_average():
    # The reason this takes `peers` instead of the whole cohort. Including the student
    # makes a solo student's delta exactly 0.0 — "exactly at the cohort average" when the
    # truth is "there is no cohort" — and it is the caller who knows which id to drop.
    peers = _peers()
    solo = mastery_block(_own(), {})
    assert solo["osce_mastery"]["cohort_avg"] is None
    assert solo["osce_mastery"]["delta"] is None
    assert solo["osce_mastery"]["peers_n"] == 0
    # ...and a peer set that is missing this student gives a mean untouched by their score.
    assert mastery_block(_own(osce=0.0), peers)["osce_mastery"]["cohort_avg"] == 45.0


def test_a_fresh_own_value_does_not_move_the_peer_mean():
    # The whole point of dropping leave_one_out. The own value is read fresh while the
    # peer rows come from a cache up to 45s old, so a peer mean derived by SUBTRACTING the
    # own value from a total that includes them is computed from two different moments:
    # a student cached at 60 who has since scored 80 yielded (180-80)/2 = 50 instead of 60.
    peers = {"s2": {"osce": 60.0}, "s3": {"osce": 60.0}}
    assert mastery_block({"osce": 60.0}, peers)["osce_mastery"]["cohort_avg"] == 60.0
    assert mastery_block({"osce": 80.0}, peers)["osce_mastery"]["cohort_avg"] == 60.0
    assert mastery_block({"osce": None}, peers)["osce_mastery"]["cohort_avg"] == 60.0


def test_cohort_n_counts_the_student_in_only_when_they_have_the_scale():
    # cohort_n is a data-density figure ("how much evidence backs this comparison"),
    # peers_n is the divisor. A UI rendering cohort_n as the peer count reads "vs 3 peers"
    # beside an average of 2.
    out = mastery_block(_own(flashcard=None), _peers())
    assert (out["osce_mastery"]["cohort_n"], out["osce_mastery"]["peers_n"]) == (3, 2)
    assert (out["flashcard_mastery"]["cohort_n"], out["flashcard_mastery"]["peers_n"]) == (2, 2)


def test_a_scale_the_student_lacks_is_null_with_the_cohort_still_shown():
    out = mastery_block(_own(retention=None), _peers())
    assert out["retention_mastery"]["value"] is None
    assert out["retention_mastery"]["delta"] is None, "a delta against nothing is not a zero"
    assert out["retention_mastery"]["cohort_avg"] == 60.0


def test_a_genuine_zero_is_a_value_not_missing_data():
    out = mastery_block({"osce": 0.0}, {"s2": {"osce": 50.0}})
    assert out["osce_mastery"]["value"] == 0.0
    assert out["osce_mastery"]["delta"] == -50.0
    assert out["osce_mastery"]["cohort_n"] == 2, "a real 0.0 counts toward the density"


def test_a_peer_missing_a_scale_is_excluded_not_zero_filled():
    # A zero would join the denominator and drag the average down, flattering everyone
    # measured against it.
    out = mastery_block({"osce": 90.0}, {"s2": {"osce": 60.0}, "s3": {"osce": None}})
    assert out["osce_mastery"]["cohort_avg"] == 60.0
    assert out["osce_mastery"]["peers_n"] == 1


def test_no_peers_and_no_own_value_is_all_nulls():
    out = mastery_block({}, {})
    for scale in ("osce_mastery", "flashcard_mastery", "retention_mastery"):
        assert out[scale] == {"value": None, "cohort_avg": None, "delta": None,
                              "cohort_n": 0, "peers_n": 0}
```

- [ ] **Step 3: Run to verify they fail**

```bash
python -m pytest tests/supervisor/test_mastery.py -q
```

Expected: FAIL — `mastery_block` still takes `(student_id, per_student)`, so passing a
dict as the first argument raises `AttributeError` / produces wrong results.

- [ ] **Step 4: Rewrite `mastery_block` and delete the orphans**

In `tools/supervisor/mastery.py`, delete `_peers_n` (lines 29–36) and `leave_one_out`
(lines 39–52) entirely — nothing outside this module imported either.

Replace `mastery_block` (lines 103–150) with:

```python
def mastery_block(own: dict, peers: dict[str, dict]) -> dict:
    """The three scales for one student, each against the peers they are NOT in.

    Args:
        own: this student's own figures, `{"osce", "flashcard", "retention"}`, all on
            0-100 with None for a scale they have no data on. Sourced from the student's
            OWN reads, not from the cohort scan — see below.
        peers: student_id -> the same three keys, with THIS STUDENT ALREADY REMOVED. A
            student missing a scale must carry None for it, NOT 0.0 — a zero would join
            that scale's denominator and drag the average down, flattering everyone
            measured against it.

    Returns `{"<scale>_mastery": {"value", "cohort_avg", "delta", "cohort_n",
    "peers_n"}}`. Every figure is `float | None` except the two counts.

    **The cohort mean excludes this student by construction.** Including them makes a solo
    student's delta exactly 0.0, which renders as "exactly at the cohort average" when the
    truth is "there is no cohort" — the common case at ~10 students, and the most
    misleading possible answer. `cohort_avg` and `delta` are null when `peers` has nobody
    with the scale.

    It is done by leaving the student OUT of `peers` rather than by subtracting their
    value from a cohort total that includes them, and that is not a stylistic choice. The
    two are equal only while both numbers come from one read. `own` is now read fresh on
    every request while the peer rows come from a cohort scan cached for up to 45s, so
    subtraction would mix two moments: a student cached at 60 who has since scored 80, in
    a total of 180 over 3, yields (180-80)/2 = 50 peers instead of the true 60 — and can
    go negative in a thin cohort. Excluding by id cannot express that bug.

    The two counts answer different questions and a caller must not swap them:

    - `cohort_n` — how many students HAVE the scale, **including this student**. A
      data-density figure: "how much evidence backs this comparison at all".
    - `peers_n` — how many OTHERS `cohort_avg` is the mean of. This is the divisor, and it
      is the one to put in front of a trainer. Rendering `cohort_n` as the peer count
      reads "vs 3 peers" beside an average of 2.

    `peers_n` is also the thinness signal. It is 1 far more often than the design suggests
    at ~10 students, and a `cohort_avg` of 95 drawn from a single classmate who happened to
    take one easy case is not a benchmark. The number is still reported — suppressing real
    data is its own distortion — but only because `peers_n` travels with it.
    """
    out: dict[str, dict] = {}
    for scale in SCALES:
        raw = own.get(scale)
        value = float(raw) if raw is not None else None
        # `.get`, not `[scale]`: a row carries only the scales it has.
        present = [
            float(row[scale])
            for row in peers.values()
            if row.get(scale) is not None
        ]
        cohort_avg = round(sum(present) / len(present), 1) if present else None
        out[f"{scale}_mastery"] = {
            "value": value,
            "cohort_avg": cohort_avg,
            # Null unless BOTH sides exist. A delta against nothing is not a zero.
            "delta": round(value - cohort_avg, 1)
            if value is not None and cohort_avg is not None else None,
            # `is not None`, not truthiness: a student who genuinely scored 0.0 is evidence
            # and counts toward the density.
            "cohort_n": len(present) + (1 if value is not None else 0),
            "peers_n": len(present),
        }
    return out
```

Also update the module docstring's second paragraph (the one beginning "**The cohort mean
is leave-one-out.**") to:

```
**The cohort mean excludes this student.** Including them makes a solo student's delta
exactly 0.0, which renders as "exactly at the cohort average" when the truth is "there is
no cohort" — the common case at ~10 students, and the most misleading possible answer.
`cohort_avg` and `delta` are null when no OTHER student has the scale. The exclusion is
done by construction, not by subtraction; `mastery_block` explains why.
```

- [ ] **Step 5: Run to verify they pass**

```bash
python -m pytest tests/supervisor/test_mastery.py -q
```

Expected: all pass.

- [ ] **Step 6: Mutation-test the peer-exclusion rule**

Change `cohort_n` to `len(present)` (dropping the student). `test_cohort_n_counts_the_student_in_only_when_they_have_the_scale` must FAIL. Restore.

Then change `present` to also append `value` when it is not None (i.e. put the student
back into their own average). `test_a_fresh_own_value_does_not_move_the_peer_mean` must
FAIL. Restore.

- [ ] **Step 7: Confirm the orphans are gone**

```bash
grep -rn "leave_one_out\|_peers_n" --include=*.py .
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add tools/supervisor/mastery.py tests/supervisor/test_mastery.py
git commit -m "refactor(admin): mastery compares own figures against an explicit peer set"
```

---

## Task 8: Source the student's own values from their own reads

**Files:**
- Modify: `tools/api/routers/admin.py:750-791`
- Modify: `tests/api/test_admin_student_detail.py`

- [ ] **Step 1: Read both files**

Read `tools/api/routers/admin.py` lines 720–800 and
`tests/api/test_admin_student_detail.py` in full (it changed in Task 5).

- [ ] **Step 2: Update the default fixtures, then add the freshness tests**

In `tests/api/test_admin_student_detail.py`, change the `get_case_results` stub inside
`_detail_patches()` from `AsyncMock(return_value=[])` to:

```python
        # s1's OWN attempt. The handler now sources their own OSCE figure from this read
        # — the same list that renders `cases` — rather than from the cohort scan, so the
        # fixture has to carry it. Deliberately the same 90 that _CASES gives s1, so every
        # assertion below is unchanged by the re-sourcing.
        patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=[
            {"student_id": "s1", "case_id": "c1", "score_100": 90,
             "passed": True, "safe": True},
        ])),
```

Then append these tests to the file:

```python
def test_a_new_attempt_moves_the_cases_list_and_the_mastery_value_together():
    """The contradiction that made the obvious fix wrong.

    The cohort scan is cached for 45s; db.get_case_results is not. Sourcing the student's
    OWN figure from the scan meant a just-finished station appeared in `cases` while
    `osce_mastery.value` still showed the pre-attempt number — one page disagreeing with
    itself, which is worse than a page that is uniformly stale.

    Here the cohort scan still has only s1's original 90 (_CASES), while their own read has
    since gained a 40. Both panels must reflect the 40.
    """
    extra = [patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=[
        {"student_id": "s1", "case_id": "c1", "score_100": 90, "passed": True, "safe": True},
        {"student_id": "s1", "case_id": "c2", "score_100": 40, "passed": False, "safe": True},
    ]))]
    body = _get(extra=extra).json()
    assert [c["case_id"] for c in body["cases"]] == ["c1", "c2"]
    # (90 + 40) / 2. Sourced from the cohort scan this would still read 90.0.
    assert body["mastery"]["osce_mastery"]["value"] == 65.0
    # ...and the peer mean is untouched by the student's own movement.
    assert body["mastery"]["osce_mastery"]["cohort_avg"] == 45.0


def test_the_flashcard_value_matches_the_accuracy_panel_on_the_same_page():
    # Same contract for the second scale: flashcard_accuracy renders from
    # db.get_topic_accuracy, so the mastery value must come from that read too.
    extra = [patch("tools.shared.db.get_topic_accuracy", new=AsyncMock(return_value={
        "red_eye": {"correct": 3, "total": 4, "pct": 75.0},
        "glaucoma": {"correct": 1, "total": 6, "pct": 16.7},
    }))]
    body = _get(extra=extra).json()
    assert body["flashcard_accuracy"]["red_eye"]["correct"] == 3
    # 4 of 10 attempts — the whole bank behind the panel above, not the cohort scan, which
    # has no flashcard rows for s1 at all.
    assert body["mastery"]["flashcard_mastery"]["value"] == 40.0


def test_the_retention_value_matches_the_retention_panel_on_the_same_page():
    # And the third: retention_scores renders from get_profile, so the value follows it.
    extra = [patch("tools.api.routers.admin.get_profile", new=AsyncMock(return_value={
        "student_id": "s1", "role": "OA", "retention_scores": {"red_eye": 0.2},
    }))]
    body = _get(extra=extra).json()
    assert body["retention_scores"] == {"red_eye": 0.2}
    # 20.0 from the profile on this page, not 80.0 from s1's row in the cohort scan.
    assert body["mastery"]["retention_mastery"]["value"] == 20.0


def test_the_student_is_not_counted_among_their_own_peers():
    # s1 is in the cohort profiles, so they must gate IN — but their cached row must not
    # reach the peer average. Peers are s2 (60) and s3 (30); s1's own 90 must not appear.
    body = _get().json()
    assert body["mastery"]["osce_mastery"]["cohort_avg"] == 45.0
    assert body["mastery"]["osce_mastery"]["peers_n"] == 2
```

- [ ] **Step 3: Run to verify the new tests fail**

```bash
python -m pytest tests/api/test_admin_student_detail.py -q
```

Expected: the four new tests FAIL (values still come from the cohort scan), and the
pre-existing tests still pass — the fixture change was chosen so they do not move.

- [ ] **Step 4: Wire the handler**

In `tools/api/routers/admin.py`, add `flashcard_accuracy` to the existing
`from tools.supervisor.cohort_analytics import (…)` block, keeping it alphabetical:

```python
from tools.supervisor.cohort_analytics import (
    WEIGHT_RUBRIC,
    flashcard_accuracy,
    flashcard_by_group,
    flashcard_by_student,
    osce_by_group,
    osce_by_student,
    weakness_scores,
)
```

Replace the body of the `try:` inside the mastery block (from `reads = await
get_cohort_reads()` through `mastery = mastery_block(student_id, per_student)`) with:

```python
        reads = await get_cohort_reads()

        # This student's own three figures come from the per-student reads ALREADY on this
        # page — the same `case_rows` that renders `cases`, the same `flashcard_acc` that
        # renders `flashcard_accuracy`, the same `profile` that renders `retention_scores`.
        # None of them is cached, so the number that moves when a student acts moves
        # together with the panel beside it. Sourcing them from the cohort scan instead
        # made the scan's 45s TTL visible as a page disagreeing with itself: a
        # just-finished station listed under `cases` with the pre-attempt mastery figure
        # above it. Only the peer baseline lags now, which is what a baseline is for.
        own = {
            "osce": (osce_by_student(case_rows).get(student_id) or {}).get("avg_score"),
            "flashcard": flashcard_accuracy(flashcard_acc),
            "retention": retention_mastery(profile.get("retention_scores"),
                                           role=str(profile.get("role") or "")),
        }

        # The cohort scan is now used for two things only: the peer aggregate, and the
        # membership gate below.
        osce_per_student = osce_by_student(reads.case_rows)
        cards_per_student = flashcard_by_student(reads.card_rows)
        peers: dict[str, dict] = {}
        in_cohort = False
        for p in reads.profiles:
            sid = str(p.get("student_id") or "")
            if not sid:
                continue
            if sid == student_id:
                # Their own row is the GATE, never an input. Feeding it in would put a
                # cached copy of this student's own numbers into the average they are
                # measured against — and a stale one, now that `own` is read fresh.
                in_cohort = True
                continue
            peers[sid] = {
                "osce": (osce_per_student.get(sid) or {}).get("avg_score"),
                "flashcard": (cards_per_student.get(sid) or {}).get("accuracy"),
                "retention": retention_mastery(p.get("retention_scores"),
                                               role=str(p.get("role") or "")),
            }
        # Only compare a student against a cohort they are IN. /api/admin/students is not
        # staff-free (db.py:293), so a promoted trainer is on the roster and clickable
        # while get_active_student_profiles correctly excludes them here. Scoring them
        # anyway renders "— vs cohort 60 (3 peers)" two panels above their own OSCE score:
        # "no data" is not what is true, "not in this population" is.
        #
        # The population read is cached for up to 45s, so a student approved seconds ago
        # is briefly absent and gets `mastery: null` until the entry rolls. Self-healing,
        # and they have no data to compare yet.
        if in_cohort:
            mastery = mastery_block(own, peers)
```

- [ ] **Step 5: Run the file**

```bash
python -m pytest tests/api/test_admin_student_detail.py -q
```

Expected: `12 passed`.

- [ ] **Step 6: Mutation-test the freshness contract**

Change `own["osce"]` back to the cohort source:
`(osce_per_student.get(student_id) or {}).get("avg_score")` — moving that line below the
`osce_per_student` assignment. `test_a_new_attempt_moves_the_cases_list_and_the_mastery_value_together` must FAIL with `assert 90.0 == 65.0`. Restore.

Then delete the `if sid == student_id: … continue` branch so the student rejoins their own
peers. `test_the_student_is_not_counted_among_their_own_peers` must FAIL. Restore.

- [ ] **Step 7: Commit**

```bash
git add tools/api/routers/admin.py tests/api/test_admin_student_detail.py
git commit -m "fix(admin): a student's mastery values come from their own page's reads"
```

---

## Task 9: Full verification and push

- [ ] **Step 1: Run the whole backend suite**

```bash
python -m pytest -q
```

Expected: all pass. Do not proceed on a single failure — `main` auto-deploys to Render
production.

- [ ] **Step 2: Confirm no consumer still reads the three tables directly**

```bash
grep -rn "db.get_active_student_profiles()\|db.get_all_case_scores()\|db.get_all_flashcard_attempts()" --include=*.py tools/
```

Expected: matches only inside `tools/supervisor/cohort_reads.py`. Any hit in `at_risk.py`
or `admin.py` is an un-migrated consumer.

- [ ] **Step 3: Confirm the frontend is genuinely untouched**

```bash
git diff --stat origin/main -- frontend/
```

Expected: no output. The `mastery` block is not rendered anywhere
(`frontend/src/hooks/useAdmin.ts` does not declare the field), so neither commit needs a
frontend change or a `PERSIST_SCHEMA_VERSION` bump.

- [ ] **Step 4: Fetch and verify a fast-forward before pushing**

Multiple sessions edit this repo and `main` gets force-pushed.

```bash
git fetch origin && git log --oneline origin/main -3 && git status -sb
```

Confirm the local branch is ahead of `origin/main` with no divergence. If it has diverged,
rebase and re-run Step 1 before pushing.

- [ ] **Step 5: Push**

```bash
git push origin HEAD
```

---

## Verification checklist

Against the design doc's success criteria:

- [ ] `/cohort-analytics` + `/student/{id}/detail` in one TTL window perform **one** set of
      three table reads — `tests/api/test_admin_read_sharing.py::test_one_scan_serves_both_endpoints_inside_the_ttl`
- [ ] Ten students opened in a row cost one scan, not ten —
      `…::test_walking_students_does_not_rescan_per_student`
- [ ] Every consumer's failure and degrade behaviour is unchanged — the pre-existing
      `test_admin_cohort_analytics.py`, `test_at_risk.py` and `test_admin_student_detail.py`
      assertions pass untouched
- [ ] A student's three mastery values agree with the raw panels on the same page —
      the three `test_the_*_matches_the_*_panel_on_the_same_page` / `…moves_the_cases_list…` tests
- [ ] The peer mean is never computed by subtracting the student's own value —
      `test_a_fresh_own_value_does_not_move_the_peer_mean`, plus `grep` finding no
      `leave_one_out`
- [ ] The new cache is reset between tests — `tests/test_cache_registration.py`
- [ ] `python -m pytest -q` green before push
