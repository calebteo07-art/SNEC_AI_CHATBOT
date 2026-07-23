"""D7 leaderboard endpoint — everyone by default, opt-out hide, XP-ranked, role filter.

Replaces the v1 opt-in/supervisor-gated model. The endpoint composes DB reads with the
pure `rank_entries` core; these tests patch the DB layer and assert the wiring + the
viewer-visibility reporting + the prefs (hide toggle / display name) endpoint.
"""
import os
from datetime import date
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
@patch("tools.shared.db.get_active_leaderboard_profiles", new_callable=AsyncMock, return_value=PROFILES)
def test_leaderboard_ranks_everyone_excludes_hidden(mock_p, mock_c):
    r = client.get("/api/leaderboard", cookies=_cookies("user_001"))
    assert r.status_code == 200
    body = r.json()
    assert [e["name"] for e in body["entries"]] == ["Bob Bb", "Ann Aa"]  # hidden user_003 dropped
    assert body["entries"][1]["is_you"] is True                          # Ann == viewer
    assert body["entries"][1]["avatar_config"] == {"bodyColor": "aqua"}
    assert body["entries"][0]["avatar_config"] is None                   # Bob has none
    assert body["you_hidden"] is False


@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock, return_value=CONSENT)
@patch("tools.shared.db.get_active_leaderboard_profiles", new_callable=AsyncMock, return_value=PROFILES)
def test_leaderboard_role_filter(mock_p, mock_c):
    r = client.get("/api/leaderboard?role=OA", cookies=_cookies("user_001"))
    body = r.json()
    assert [e["name"] for e in body["entries"]] == ["Ann Aa"]  # only visible OA
    assert all(e["role"] == "OA" for e in body["entries"])


@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock, return_value=CONSENT)
@patch("tools.shared.db.get_active_leaderboard_profiles", new_callable=AsyncMock, return_value=PROFILES)
def test_leaderboard_reports_viewer_hidden_and_roles(mock_p, mock_c):
    r = client.get("/api/leaderboard", cookies=_cookies("user_003"))
    body = r.json()
    assert body["you_hidden"] is True
    assert set(body["roles"]) == {"OA", "OT"}


@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock)
@patch("tools.shared.db.get_all_approved", new_callable=AsyncMock)
@patch("tools.shared.db.get_all_profiles", new_callable=AsyncMock)
def test_leaderboard_hides_accounts_whose_access_was_revoked(mock_p, mock_appr, mock_cons):
    """End-to-end regression: a student whose approved_students row was deleted no longer
    appears on the board, even with a higher XP — the real get_active_profiles filter runs."""
    mock_p.return_value = [
        {"student_id": "user_001", "xp": 300, "role": "OA"},
        {"student_id": "user_002", "xp": 900, "role": "OT"},   # access removed → must be gone
    ]
    mock_appr.return_value = [{"email": "ann@test.com"}]        # only user_001 still approved
    mock_cons.return_value = [
        {"student_id": "user_001", "student_name": "Ann Aa", "email": "ann@test.com"},
        {"student_id": "user_002", "student_name": "Bob Bb", "email": "bob@test.com"},
    ]
    r = client.get("/api/leaderboard", cookies=_cookies("user_001"))
    assert r.status_code == 200
    assert [e["name"] for e in r.json()["entries"]] == ["Ann Aa"]  # Bob dropped despite 900 XP


@patch("tools.shared.db.get_all_supervisors", new_callable=AsyncMock)
@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock)
@patch("tools.shared.db.get_all_approved", new_callable=AsyncMock)
@patch("tools.shared.db.get_all_profiles", new_callable=AsyncMock)
def test_leaderboard_includes_trainers_and_admins(mock_p, mock_appr, mock_cons, mock_sup):
    """Trainers and admins (supervisors rows, NOT approved_students) now rank on the
    board alongside active students; a revoked student still drops off. Runs the real
    get_active_leaderboard_profiles end-to-end over mocked base reads."""
    mock_p.return_value = [
        {"student_id": "stu_1", "xp": 300, "role": "OA"},
        {"student_id": "trn_1", "xp": 800, "role": ""},      # trainer
        {"student_id": "adm_1", "xp": 600, "role": ""},      # admin
        {"student_id": "gone_1", "xp": 999, "role": "OT"},   # revoked student
    ]
    mock_appr.return_value = [{"email": "stu@test.com"}]      # only stu_1 still approved
    mock_sup.return_value = [
        {"email": "trainer@test.com", "role": "trainer"},
        {"email": "admin@test.com", "role": "admin"},
    ]
    mock_cons.return_value = [
        {"student_id": "stu_1", "student_name": "Sam Student", "email": "stu@test.com"},
        {"student_id": "trn_1", "student_name": "Terry Trainer", "email": "trainer@test.com"},
        {"student_id": "adm_1", "student_name": "Adam Admin", "email": "admin@test.com"},
        {"student_id": "gone_1", "student_name": "Rick Revoked", "email": "gone@test.com"},
    ]
    r = client.get("/api/leaderboard", cookies=_cookies("stu_1"))
    assert r.status_code == 200
    names = [e["name"] for e in r.json()["entries"]]
    assert names == ["Terry Trainer", "Adam Admin", "Sam Student"]  # XP desc; revoked gone_1 excluded


@patch.dict(os.environ, {"SUPER_ADMIN_EMAIL": "boss@snec.com"})
@patch("tools.shared.db.get_all_supervisors", new_callable=AsyncMock, return_value=[])
@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock)
@patch("tools.shared.db.get_all_approved", new_callable=AsyncMock)
@patch("tools.shared.db.get_all_profiles", new_callable=AsyncMock)
def test_leaderboard_includes_super_admin_without_supervisor_row(mock_p, mock_appr, mock_cons, mock_sup):
    """The super admin is staff-by-email (SUPER_ADMIN_EMAIL), not a supervisors row, so it
    is matched separately — else the top account (usually the highest XP) is missing."""
    mock_p.return_value = [
        {"student_id": "stu_1", "xp": 300, "role": "OA"},
        {"student_id": "boss_1", "xp": 1699, "role": "OA"},  # super admin, no supervisors row
    ]
    mock_appr.return_value = [{"email": "stu@test.com"}]      # only stu_1 approved
    mock_cons.return_value = [
        {"student_id": "stu_1", "student_name": "Sam Student", "email": "stu@test.com"},
        {"student_id": "boss_1", "student_name": "Boss Admin", "email": "boss@snec.com"},
    ]
    r = client.get("/api/leaderboard", cookies=_cookies("stu_1"))
    assert r.status_code == 200
    names = [e["name"] for e in r.json()["entries"]]
    assert names == ["Boss Admin", "Sam Student"]  # super admin ranks #1 despite no supervisors row


WEEK = date(2026, 5, 4)  # a Monday
WEEKLY_PROFILES = [
    # Lifetime: user_001 (1000) > user_002 (500). THIS WEEK user_002 earned more.
    {"student_id": "user_001", "xp": 1000, "xp_week": 20, "xp_week_start": "2026-05-04", "role": "OA"},
    {"student_id": "user_002", "xp": 500, "xp_week": 300, "xp_week_start": "2026-05-04", "role": "OT"},
]
WEEKLY_CONSENT = [
    {"student_id": "user_001", "student_name": "Ann Aa"},
    {"student_id": "user_002", "student_name": "Bob Bb"},
]


@patch("tools.shared.clock.app_week_start", return_value=WEEK)
@patch("tools.shared.db.get_all_consent", new_callable=AsyncMock, return_value=WEEKLY_CONSENT)
@patch("tools.shared.db.get_active_leaderboard_profiles", new_callable=AsyncMock, return_value=WEEKLY_PROFILES)
def test_leaderboard_ranks_by_weekly_xp_when_columns_present(mock_p, mock_c, mock_wk):
    """Once the xp_week columns exist, the board ranks by XP earned THIS week (not
    lifetime): the displayed score is weekly, but lifetime xp_total rides along for the
    tier ring, and level stays lifetime-derived."""
    r = client.get("/api/leaderboard", cookies=_cookies("user_001"))
    assert r.status_code == 200
    entries = r.json()["entries"]
    assert [e["name"] for e in entries] == ["Bob Bb", "Ann Aa"]  # weekly order flips lifetime
    assert [e["xp"] for e in entries] == [300, 20]               # score = weekly
    ann = next(e for e in entries if e["name"] == "Ann Aa")
    assert ann["xp_total"] == 1000 and ann["level"] == 3         # lifetime rides along


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
