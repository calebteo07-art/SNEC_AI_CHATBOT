"""Gamification read-path regressions (bug hunt ranks 18, 19)."""
from datetime import date
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _cookie(sid="stu_g", role="student", srole="OA"):
    return {"eyebot_token": create_access_token(sid, role, srole)}


def test_checkin_question_keys_on_sgt_date_not_utc():
    """rank 19: the daily question cache/rotation must key on the Singapore date
    (app_today), like the rest of the check-in path — not the server's UTC date."""
    from tools.api.routers import checkin as ck
    fixed = date(2000, 1, 1)  # sentinel: never equal to the real UTC date
    ck._question_cache.clear()
    with patch("tools.api.routers.checkin.app_today", return_value=fixed), \
         patch("tools.api.routers.checkin.get_profile", new=AsyncMock(return_value={"role": "OA"})), \
         patch("tools.api.routers.checkin.pick_by_day_count", return_value=0) as mock_pick:
        r = client.get("/api/checkin/question", cookies=_cookie())
    assert r.status_code == 200
    # cache key = the SGT date, and pick_by_day_count is seeded with the SGT date too
    assert ck._question_cache["stu_g"][0] == fixed.isoformat()
    assert mock_pick.call_args.kwargs.get("today") == fixed


def test_sync_gamification_zeroes_a_lapsed_streak():
    """rank 18: /api/gamification/sync must return the resolved (healed + lapse-zeroed)
    streak, matching checkin_status/get_progress/leaderboard — not the raw stored column
    (which briefly flips the AtlasRail counter to a stale value)."""
    profile = {
        "xp": 1000, "hearts": 5, "streak": 10, "streak_freezes": 0,
        "checkin_history": ["2020-01-01"],  # last check-in long lapsed → resolves to 0
        "xp_today": 0, "xp_today_date": None,
    }
    with patch("tools.api.routers.student.update_profile", new=AsyncMock()), \
         patch("tools.api.routers.student.get_profile", new=AsyncMock(return_value=profile)):
        r = client.post(
            "/api/gamification/sync",
            # A real flashcard topic and an in-range score: the body has to survive
            # validation for the handler to run at all (see
            # tests/api/test_gamification_sync_validation.py).
            json={"xp_delta": 0, "hearts_used": 0, "topic": "glaucoma", "score": 0},
            cookies=_cookie(),
        )
    assert r.status_code == 200
    assert r.json()["streak"] == 0
