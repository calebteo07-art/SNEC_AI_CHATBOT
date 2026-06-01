import pytest
from unittest.mock import AsyncMock, patch
from datetime import date


def _profile(sid, weak_topics, last_active):
    return {
        "student_id": sid,
        "weak_topics": weak_topics,
        "last_active": last_active,
    }


@pytest.mark.asyncio
async def test_at_risk_flags_inactive_with_weak_topics():
    profiles = [
        _profile("s1", ["glaucoma", "retina"], "2026-05-04"),  # 6 days ago, 2 weak
        _profile("s2", ["glaucoma"], "2026-05-04"),              # 6 days ago, 1 weak
        _profile("s3", ["glaucoma", "retina"], "2026-05-09"),   # 1 day ago, 2 weak
    ]
    with patch("tools.shared.db.get_all_profiles", new=AsyncMock(return_value=profiles)), \
         patch("tools.supervisor.at_risk.date") as mock_date:
        mock_date.today.return_value = date(2026, 5, 10)
        mock_date.fromisoformat = date.fromisoformat
        from tools.supervisor.at_risk import get_at_risk
        result = await get_at_risk()
    assert len(result) == 1
    assert result[0]["student_id"] == "s1"


@pytest.mark.asyncio
async def test_at_risk_empty_when_all_active():
    profiles = [
        _profile("s1", ["glaucoma", "retina"], "2026-05-09"),
        _profile("s2", ["glaucoma", "retina"], "2026-05-10"),
    ]
    with patch("tools.shared.db.get_all_profiles", new=AsyncMock(return_value=profiles)), \
         patch("tools.supervisor.at_risk.date") as mock_date:
        mock_date.today.return_value = date(2026, 5, 10)
        mock_date.fromisoformat = date.fromisoformat
        from tools.supervisor.at_risk import get_at_risk
        result = await get_at_risk()
    assert result == []
