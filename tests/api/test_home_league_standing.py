"""The league strip on Home — read-only, and never a blocker.

Home must not run the league's background jobs: /api/leaderboard owns the Monday rollover
and the daily rank snapshot, both seal-guarded, and a second trigger point would move when
a week closes. It also must not 500 or hang the whole payload when the board is unavailable
— a student's quests do not depend on knowing their rank.
"""
from datetime import date
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)
TODAY = date(2026, 8, 4)
WEEK = date(2026, 8, 3)   # the Monday of TODAY's week


def _cookies(sub: str = "ann") -> dict:
    return {"eyebot_token": create_access_token(sub, "student", "OA")}


def _p(sid: str, xp_week: int) -> dict:
    return {"student_id": sid, "role": "OA", "division": 1, "xp": xp_week * 10,
            "xp_week": xp_week, "xp_week_start": WEEK.isoformat()}


BOARD = [_p("top", 500), _p("second", 400), _p("third", 300), _p("ann", 100), _p("last", 50)]
CONSENT = [{"student_id": p["student_id"], "student_name": p["student_id"].title()} for p in BOARD]


def _patched(**over):
    profile = {"student_id": "ann", "division": 1, "xp_week": 100,
               "xp_week_start": WEEK.isoformat(), "weak_topics": [], **over}
    return (
        patch("tools.api.routers.home.get_profile", AsyncMock(return_value=profile)),
        patch("tools.api.routers.home.db.get_active_leaderboard_profiles",
              AsyncMock(return_value=BOARD)),
        patch("tools.api.routers.home.db.get_all_consent", AsyncMock(return_value=CONSENT)),
        patch("tools.api.routers.home.app_today", return_value=TODAY),
        patch("tools.api.routers.home.app_week_start", return_value=WEEK),
    )


def test_the_strip_reports_rank_and_the_promotion_cut():
    a, b, c, d, e = _patched()
    with a, b, c, d, e:
        league = client.get("/api/home", cookies=_cookies()).json()["league"]
    assert league["rank"] == 4               # 500, 400, 300, then ann on 100
    assert league["pool_size"] == 5
    assert league["promote_count"] == 3      # the podium IS the cut


def test_the_strip_says_what_it_costs_to_reach_the_cut():
    a, b, c, d, e = _patched()
    with a, b, c, d, e:
        league = client.get("/api/home", cookies=_cookies()).json()["league"]
    # ann has 100; the last promoting rung (3rd) has 300.
    assert league["xp_to_promotion"] == 200


def test_a_student_already_inside_the_cut_needs_nothing():
    a, b, c, d, e = _patched(xp_week=450)
    with a, b, c, d, e:
        league = client.get("/api/home", cookies=_cookies("top")).json()["league"]
    assert league["xp_to_promotion"] == 0


def test_an_unavailable_board_is_null_and_never_breaks_the_payload():
    with patch("tools.api.routers.home.get_profile",
               AsyncMock(return_value={"student_id": "ann", "weak_topics": []})), \
         patch("tools.api.routers.home.db.get_active_leaderboard_profiles",
               AsyncMock(side_effect=RuntimeError("board down"))), \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        body = client.get("/api/home", cookies=_cookies()).json()
    assert body["league"] is None
    assert len(body["quests"]) == 3      # the rest of the payload is unaffected


def test_home_never_runs_the_league_background_jobs():
    # take_seal is the gate both jobs pass through. If Home ever calls it, Home has become
    # a second place the league's week can close, which is exactly what must not happen.
    a, b, c, d, e = _patched()
    with a, b, c, d, e, \
         patch("tools.api.routers.home.db.take_seal", AsyncMock(return_value=True)) as seal:
        client.get("/api/home", cookies=_cookies())
    assert seal.call_count == 0
