"""D7 leaderboard endpoint — everyone by default, opt-out hide, XP-ranked, role filter.

Replaces the v1 opt-in/supervisor-gated model. The endpoint composes DB reads with the
pure `rank_entries` core; these tests patch the DB layer and assert the wiring + the
viewer-visibility reporting + the prefs (hide toggle / display name) endpoint.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _cookies(sub: str = "user_001") -> dict:
    return {"eyebot_token": create_access_token(sub, "student", "OA")}


PROFILES = [
    {"student_id": "user_001", "xp": 300, "level": 1, "role": "OA",
     "avatar_config": {"bodyColor": "aqua"}, "streak": 4},
    {"student_id": "user_002", "xp": 500, "level": 2, "role": "OT", "streak": 2},
    {"student_id": "user_003", "xp": 100, "level": 1, "role": "OA", "leaderboard_hidden": True},
]
CONSENT = [
    {"student_id": "user_001", "student_name": "Ann Aa"},
    {"student_id": "user_002", "student_name": "Bob Bb"},
    {"student_id": "user_003", "student_name": "Cy Cc"},
]


def test_leaderboard_requires_auth():
    assert client.get("/api/leaderboard").status_code in (401, 403)


@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock, return_value=CONSENT)
@patch("tools.shared.db.get_all_profiles", new_callable=AsyncMock, return_value=PROFILES)
def test_leaderboard_ranks_everyone_excludes_hidden(mock_p, mock_c):
    r = client.get("/api/leaderboard", cookies=_cookies("user_001"))
    assert r.status_code == 200
    body = r.json()
    assert [e["name"] for e in body["entries"]] == ["Bob B.", "Ann A."]  # hidden user_003 dropped
    assert body["entries"][1]["is_you"] is True                          # Ann == viewer
    assert body["entries"][1]["avatar_config"] == {"bodyColor": "aqua"}
    assert body["entries"][0]["avatar_config"] is None                   # Bob has none
    assert body["you_hidden"] is False


@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock, return_value=CONSENT)
@patch("tools.shared.db.get_all_profiles", new_callable=AsyncMock, return_value=PROFILES)
def test_leaderboard_role_filter(mock_p, mock_c):
    r = client.get("/api/leaderboard?role=OA", cookies=_cookies("user_001"))
    body = r.json()
    assert [e["name"] for e in body["entries"]] == ["Ann A."]  # only visible OA
    assert all(e["role"] == "OA" for e in body["entries"])


@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock, return_value=CONSENT)
@patch("tools.shared.db.get_all_profiles", new_callable=AsyncMock, return_value=PROFILES)
def test_leaderboard_reports_viewer_hidden_and_roles(mock_p, mock_c):
    r = client.get("/api/leaderboard", cookies=_cookies("user_003"))
    body = r.json()
    assert body["you_hidden"] is True
    assert set(body["roles"]) == {"OA", "OT"}


@patch("tools.shared.db.get_all_profiles", new_callable=AsyncMock, side_effect=Exception("no table"))
def test_leaderboard_degrades_when_unavailable(mock_p):
    r = client.get("/api/leaderboard", cookies=_cookies())
    assert r.status_code == 200                 # never 500 before the migration lands
    assert r.json()["entries"] == []


def test_prefs_requires_auth():
    assert client.post("/api/leaderboard/prefs", json={"hidden": True}).status_code in (401, 403)


@patch("tools.shared.db.update_profile", new_callable=AsyncMock)
def test_prefs_sets_hidden_and_display_name_from_jwt(mock_upd):
    r = client.post("/api/leaderboard/prefs",
                    json={"hidden": True, "display_name": "Iris Champ"},
                    cookies=_cookies("user_042"))
    assert r.status_code == 200
    mock_upd.assert_awaited_once()
    args, kwargs = mock_upd.call_args
    assert args[0] == "user_042"                          # identity from JWT, not body
    assert kwargs["leaderboard_hidden"] is True
    assert kwargs["display_name"] == "Iris Champ"


@patch("tools.shared.db.update_profile", new_callable=AsyncMock)
def test_prefs_blank_display_name_clears_it(mock_upd):
    r = client.post("/api/leaderboard/prefs", json={"display_name": "   "}, cookies=_cookies())
    assert r.status_code == 200
    _, kwargs = mock_upd.call_args
    assert kwargs["display_name"] is None                 # blank -> cleared
    assert "leaderboard_hidden" not in kwargs             # untouched when omitted


@patch("tools.shared.db.update_profile", new_callable=AsyncMock, side_effect=Exception("no column"))
def test_prefs_503_when_columns_missing(mock_upd):
    r = client.post("/api/leaderboard/prefs", json={"hidden": True}, cookies=_cookies())
    assert r.status_code == 503
