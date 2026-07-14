import pytest
from unittest.mock import AsyncMock, patch
from datetime import date as real_date


def _profile(sid, weak_topics, last_active, retention_scores=None):
    return {
        "student_id": sid,
        "weak_topics": weak_topics,
        "missed_findings": [],
        "retention_scores": retention_scores or {},
        "session_count": 5,
        "streak": 2,
        "last_active": last_active,
        "learning_velocity": "stable",
        "checkin_done_today": False,
    }


@pytest.mark.asyncio
async def test_cohort_summary_active_count():
    profiles = [
        _profile("s1", ["glaucoma"], "2026-05-09"),
        _profile("s2", ["retina"], "2026-05-03"),
        _profile("s3", [], "2026-05-10"),
    ]
    with patch("tools.shared.db.get_active_profiles", new=AsyncMock(return_value=profiles)), \
         patch("tools.supervisor.cohort_summary.date") as mock_date:
        mock_date.today.return_value = real_date(2026, 5, 10)
        mock_date.fromisoformat = real_date.fromisoformat
        from tools.supervisor.cohort_summary import cohort_summary
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
         patch("tools.supervisor.cohort_summary.date") as mock_date:
        mock_date.today.return_value = real_date(2026, 5, 10)
        mock_date.fromisoformat = real_date.fromisoformat
        from tools.supervisor.cohort_summary import cohort_summary
        result = await cohort_summary()
    assert result["weakest_topics"][0] == "glaucoma"  # appears in 2 profiles
