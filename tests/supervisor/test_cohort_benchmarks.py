"""Cohort retention benchmarks — the population it averages and how it fails.

Two defects this pins, both of which make a broken read look like a measurement:

**The swallow.** `/api/supervisor/benchmarks` already wraps this call in a 500 guard
(`tools/api/routers/supervisor.py:181-184`), but the module caught every exception and
returned `[]` — so the guard was DEAD CODE and a database outage rendered as "no topics
benchmarked yet", indistinguishable from a cohort that simply has not studied. That is
the P1 defect class (a failure must not render as a measurement of zero) surviving one
layer below the endpoint that thought it had handled it.

**The population.** `get_active_profiles()` includes STAFF. A trainer's own
retention_scores were averaged into the student cohort mean that the same trainer then
reads, and at SNEC intake sizes one staff profile moves a topic's average visibly (D10).
The staff-free reader is `get_active_student_profiles()`.
"""
from unittest.mock import AsyncMock, patch

import pytest

from tools.supervisor.cohort_benchmarks import get_cohort_benchmarks


def _students(profiles):
    """Stub the staff-free population read. Every db call must be stubbed — an unstubbed
    one reaches live production Supabase (tests/conftest.py::_forbid_real_supabase)."""
    return patch("tools.shared.db.get_active_student_profiles",
                 new=AsyncMock(return_value=(list(profiles), 0)))


@pytest.mark.asyncio
async def test_a_read_failure_raises_instead_of_reporting_an_empty_cohort():
    # The endpoint's 500 guard can only fire if the exception actually reaches it.
    with patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(side_effect=RuntimeError("supabase unreachable"))):
        with pytest.raises(RuntimeError):
            await get_cohort_benchmarks()


@pytest.mark.asyncio
async def test_the_population_is_staff_free():
    profiles = [
        {"student_id": "s1", "retention_scores": {"tonometry": 0.5}},
        {"student_id": "s2", "retention_scores": {"tonometry": 0.7}},
    ]
    # If the staff-inclusive reader is used at all, a trainer's perfect score lands in the
    # student mean — 0.6 would become 0.733 and the topic would stop looking weak.
    staff_inclusive = AsyncMock(return_value=[
        {"student_id": "trainer", "retention_scores": {"tonometry": 1.0}},
    ])
    with _students(profiles), patch("tools.shared.db.get_active_profiles", new=staff_inclusive):
        out = await get_cohort_benchmarks()

    staff_inclusive.assert_not_awaited()
    assert out == [{"topic": "tonometry", "avg_score": 0.6, "student_count": 2}]


@pytest.mark.asyncio
async def test_a_topic_seen_by_one_student_is_not_a_cohort_benchmark():
    profiles = [
        {"student_id": "s1", "retention_scores": {"shared": 0.4, "solo": 0.9}},
        {"student_id": "s2", "retention_scores": {"shared": 0.6}},
    ]
    with _students(profiles):
        out = await get_cohort_benchmarks()

    assert [t["topic"] for t in out] == ["shared"], "one student is an anecdote, not a benchmark"


@pytest.mark.asyncio
async def test_weakest_topic_sorts_first_and_junk_scores_are_skipped():
    # Weakest-first is the whole point: the table is read top-down for where to teach next.
    profiles = [
        {"student_id": "s1", "retention_scores": {"strong": 0.9, "weak": 0.2, "junk": "n/a"}},
        {"student_id": "s2", "retention_scores": {"strong": 0.8, "weak": 0.3, "junk": None}},
    ]
    with _students(profiles):
        out = await get_cohort_benchmarks()

    assert [t["topic"] for t in out] == ["weak", "strong"]
    assert all(t["topic"] != "junk" for t in out), "an unparseable score is dropped, not zeroed"


@pytest.mark.asyncio
async def test_an_empty_cohort_is_still_an_empty_list():
    # The honest empty case must survive the fix — only a FAILED read raises.
    with _students([]):
        assert await get_cohort_benchmarks() == []
