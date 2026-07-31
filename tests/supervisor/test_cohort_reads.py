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


@pytest.fixture(autouse=True)
def _clean_cache():
    """Own this file's baseline rather than leaning on tests/conftest.py.

    Several tests here run under a LIVE TTL and assert on await counts, so an entry left
    by the test above would serve them and read as "the cache worked" — the exact
    order-dependent pass this module's cache is otherwise designed to avoid. conftest
    clears it too; a file that asserts on cache internals should not depend on that.
    """
    mod._cache.clear()
    yield
    mod._cache.clear()


def _reads(profiles=None, cases=None, cards=None, ttl=45.0):
    """Patch all three db reads. Every one must be stubbed: an unstubbed db call in this
    suite reaches live production Supabase (tests/conftest.py::_forbid_real_supabase).

    Each stub returns a fresh `list(...)`, never the module constant itself. db hands back
    a newly-built list per read, so aliasing one here would be unfaithful — and worse, a
    test that mutates a returned list would empty the constant every later test asserts
    against, which reads as a pass rather than as corruption.
    """
    return (
        patch("tools.shared.db.get_active_student_profiles",
              new=AsyncMock(return_value=(list(_PROFILES if profiles is None else profiles), 0))),
        patch("tools.shared.db.get_all_case_scores",
              new=AsyncMock(return_value=(list(_CASES if cases is None else cases), True))),
        patch("tools.shared.db.get_all_flashcard_attempts",
              new=AsyncMock(return_value=(list(_CARDS if cards is None else cards), True))),
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
    #
    # BOTH return paths are exercised, because they fail independently. Mutating only the
    # miss-path result cannot reach the cached bundle if the miss path copies, so a
    # `_fresh()` that hands out `hit[1]` directly — every HIT sharing one set of lists,
    # which is the likelier "optimisation" — passes a test that stops at `second`.
    # Local literals, NOT the module constants: the assertions have to survive a test that
    # mutates what it was handed, and comparing a corrupted list against a constant the
    # same mutation emptied would be self-fulfilling.
    expect_cases = [{"student_id": "s1", "case_id": "c1", "score_100": 90}]
    expect_profiles = [{"student_id": "s1", "role": "OA"}]

    p1, p2, p3, p4 = _reads()
    with p1, p2, p3, p4:
        first = await mod.get_cohort_reads()          # miss
        first.case_rows.clear()
        first.profiles.append({"student_id": "injected"})

        second = await mod.get_cohort_reads()          # hit
        assert second.case_rows == expect_cases, "the miss path handed out the cached lists"
        assert second.profiles == expect_profiles
        second.case_rows.clear()

        third = await mod.get_cohort_reads()           # hit, after a hit was mutated
    assert third.case_rows == expect_cases, "the hit path handed out the cached lists"
    assert third.profiles == expect_profiles
