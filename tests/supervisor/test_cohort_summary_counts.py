# tests/supervisor/test_cohort_summary_counts.py
"""weakest_topics must carry real counts.

It previously returned bare strings from most_common(3), so the cohort chart had no
magnitude to plot and fabricated bar lengths from the list index
(`0.9 - i * 0.12`) — a chart whose lengths meant nothing to a clinical educator.
"""
from unittest.mock import AsyncMock, patch

import pytest

from tools.supervisor.cohort_summary import cohort_summary

# at_risk_count now comes from get_at_risk(), which does two whole-table reads of its
# own. These tests assert only weakest_topics, so stub the call out rather than its
# reads — an unstubbed one scans and WRITES live production Supabase. The count itself
# is pinned in test_cohort_summary.py.
_NO_AT_RISK = "tools.supervisor.cohort_summary.get_at_risk"


def _profile(sid: str, weak: list[str]) -> dict:
    return {"student_id": sid, "last_active": "2026-07-24", "weak_topics": weak}


@pytest.mark.asyncio
async def test_weakest_topics_carry_counts_sorted_desc():
    profiles = [
        _profile("s1", ["tonometry", "refraction"]),
        _profile("s2", ["tonometry"]),
        _profile("s3", ["tonometry", "refraction"]),
    ]
    with patch("tools.shared.db.get_active_student_profiles", new=AsyncMock(return_value=(profiles, 0))), \
         patch(_NO_AT_RISK, new=AsyncMock(return_value=[])):
        out = await cohort_summary()
    assert out["weakest_topics"][0] == {"topic": "tonometry", "count": 3}
    assert out["weakest_topics"][1] == {"topic": "refraction", "count": 2}


@pytest.mark.asyncio
async def test_weakest_topics_capped_at_eight():
    """The UI slices 6; return 8 so the cap is the UI's choice, not an invisible 3."""
    profiles = [_profile("s1", [f"topic_{i}" for i in range(12)])]
    with patch("tools.shared.db.get_active_student_profiles", new=AsyncMock(return_value=(profiles, 0))), \
         patch(_NO_AT_RISK, new=AsyncMock(return_value=[])):
        out = await cohort_summary()
    assert len(out["weakest_topics"]) == 8


@pytest.mark.asyncio
async def test_weakest_topics_empty_when_no_weak_topics():
    profiles = [_profile("s1", [])]
    with patch("tools.shared.db.get_active_student_profiles", new=AsyncMock(return_value=(profiles, 0))), \
         patch(_NO_AT_RISK, new=AsyncMock(return_value=[])):
        out = await cohort_summary()
    assert out["weakest_topics"] == []
