"""The at-risk KPI must equal the list beneath it (spec §6.1)."""
import contextlib
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest

from tools.supervisor import at_risk as at_risk_mod
from tools.supervisor import cohort_summary as cohort_summary_mod
from tools.supervisor.cohort_summary import cohort_summary


def _profile(sid, weak_topics, last_active, streak=5, role="OA"):
    return {"student_id": sid, "weak_topics": weak_topics, "last_active": last_active,
            "streak": streak, "role": role}


# Chosen so the OLD binary rule and the NEW model DISAGREE — otherwise this suite
# passes before the fix and pins nothing. Against today=2026-05-10:
#   high1  39d inactive, 5 weak, streak 0 -> old: flagged  · new: high (100)
#   mid1    7d inactive, 2 weak, streak 0 -> old: flagged  · new: high (58)
#   osce1  active today, 20 failed unsafe -> old: MISSED   · new: high (55)
#   fine   active today, no weak topics   -> old: clear    · new: low (0)
#   nodata never started                  -> old: skipped  · new: no_data
# Old count: 2. New count and list length: 3.
_POPULATION = [
    _profile("high1", ["a", "b", "c", "d", "e"], "2026-04-01", streak=0),
    _profile("mid1", ["a", "b"], "2026-05-03", streak=0),
    _profile("osce1", [], "2026-05-10", streak=9),
    _profile("fine", [], "2026-05-10", streak=9),
    _profile("nodata", [], None, streak=0),
]
_CASES = [{"student_id": "osce1", "case_id": f"c{i}", "score_100": 10,
           "passed": False, "safe": False, "missed_critical": []} for i in range(20)]


@contextlib.contextmanager
def _patched():
    """Every read BOTH functions make. cohort_summary reads get_active_profiles for its
    own total/active_this_week KPIs while get_at_risk reads the staff-free population —
    leaving either unstubbed scans and WRITES live production Supabase."""
    with patch("tools.shared.db.get_active_profiles",
               new=AsyncMock(return_value=_POPULATION)), \
         patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(return_value=(_POPULATION, 0))), \
         patch("tools.shared.db.get_all_case_scores",
               new=AsyncMock(return_value=(_CASES, True))), \
         patch("tools.shared.db.get_all_flashcard_attempts",
               new=AsyncMock(return_value=([], True))), \
         patch.object(at_risk_mod, "_CACHE_TTL_S", 0), \
         patch.object(at_risk_mod, "app_today", return_value=date(2026, 5, 10)), \
         patch.object(cohort_summary_mod, "app_today", return_value=date(2026, 5, 10)):
        yield


@pytest.mark.asyncio
async def test_kpi_equals_the_length_of_the_list():
    # AdminCohort.tsx:41 PREFERS at_risk_count over the list length, and
    # supervisor_insights feeds both into one AI prompt (supervisor.py:233,235).
    # A count that includes no_data would exceed the list it sits above.
    with _patched():
        summary = await cohort_summary()
        rows = await at_risk_mod.get_at_risk()
    assert summary["at_risk_count"] == len(rows) == 3


@pytest.mark.asyncio
async def test_no_data_students_are_not_counted_as_at_risk():
    # "We know nothing about this student" is not "this student is at risk".
    with _patched():
        summary = await cohort_summary()
    assert summary["at_risk_count"] == 3, "the never-started student must not be counted"


@pytest.mark.asyncio
async def test_the_old_binary_rule_would_have_missed_the_failing_student():
    # osce1 is active daily with a 9-day streak and failed 20 of 20 attempts unsafely.
    # The rule this task deletes (days_inactive >= 5 AND len(weak) >= 2) never saw them.
    with _patched():
        rows = await at_risk_mod.get_at_risk()
    assert "osce1" in [r["student_id"] for r in rows]


@pytest.mark.asyncio
async def test_db_failure_propagates_instead_of_an_all_zero_cohort():
    # The old `except Exception` returned total=0/at_risk_count=0, i.e. a perfectly
    # healthy empty cohort, and made supervisor.py:74-75's 500 guard unreachable.
    with patch("tools.shared.db.get_active_profiles",
               new=AsyncMock(side_effect=RuntimeError("supabase down"))), \
         patch("tools.shared.db.get_active_student_profiles",
               new=AsyncMock(side_effect=RuntimeError("supabase down"))):
        with pytest.raises(RuntimeError):
            await cohort_summary()


def test_digest_risk_row_survives_a_null_days_inactive():
    # The new model can flag a student on OSCE failure alone, so days_inactive is
    # None and the old renderer produced "Noned inactive" in a production email.
    from tools.supervisor.weekly_digest import _risk_section
    html = _risk_section([{
        "student_id": "stu_abcdef123456", "risk_score": 72, "band": "high",
        "reasons": [{"factor": "osce_failure", "weight": 40.0,
                     "detail": "Failed 9 of 12 graded OSCE attempts"}],
        "last_active": "", "days_inactive": None, "weak_topics": [], "weak_count": 0,
    }])
    assert "None" not in html
    assert "Failed 9 of 12 graded OSCE attempts" in html


def test_digest_risk_row_shows_the_band_and_score():
    from tools.supervisor.weekly_digest import _risk_section
    html = _risk_section([{
        "student_id": "stu_abcdef123456", "risk_score": 72, "band": "high",
        "reasons": [{"factor": "inactivity", "weight": 25.0, "detail": "No activity for 20 days"}],
        "last_active": "2026-04-20", "days_inactive": 20, "weak_topics": ["a"], "weak_count": 1,
    }])
    assert "72" in html and "high" in html.lower()


# ── The KPIs cohort_summary owns itself (pre-existing coverage, kept) ──────────
# These two predate the rubric and assert `total`/`active_this_week`/`weakest_topics`,
# which nothing else pins. Both are UPDATED, not deleted: the module now reads the SGT
# clock instead of date.today(), and `at_risk_count` reaches into get_at_risk() — so
# without the stub below each one would scan live production Supabase for rows it does
# not even assert on. Stubbing get_at_risk itself (rather than its three reads) keeps
# these tests about the KPIs they were written for; the count is pinned above.


@pytest.mark.asyncio
async def test_cohort_summary_active_count():
    profiles = [
        _profile("s1", ["glaucoma"], "2026-05-09"),
        _profile("s2", ["retina"], "2026-05-03"),
        _profile("s3", [], "2026-05-10"),
    ]
    with patch("tools.shared.db.get_active_profiles", new=AsyncMock(return_value=profiles)), \
         patch.object(cohort_summary_mod, "get_at_risk", new=AsyncMock(return_value=[])), \
         patch.object(cohort_summary_mod, "app_today", return_value=date(2026, 5, 10)):
        result = await cohort_summary()
    assert result["total"] == 3
    assert result["active_this_week"] == 2  # s1 (1 day ago) and s3 (today)


@pytest.mark.asyncio
async def test_cohort_summary_weakest_topics():
    profiles = [
        _profile("s1", ["glaucoma", "retina"], "2026-05-10"),
        _profile("s2", ["glaucoma"], "2026-05-10"),
        _profile("s3", ["cornea"], "2026-05-10"),
    ]
    with patch("tools.shared.db.get_active_profiles", new=AsyncMock(return_value=profiles)), \
         patch.object(cohort_summary_mod, "get_at_risk", new=AsyncMock(return_value=[])), \
         patch.object(cohort_summary_mod, "app_today", return_value=date(2026, 5, 10)):
        result = await cohort_summary()
    assert result["weakest_topics"][0] == {"topic": "glaucoma", "count": 2}  # in 2 profiles
