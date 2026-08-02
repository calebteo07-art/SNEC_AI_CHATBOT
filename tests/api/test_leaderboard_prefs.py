"""The leaderboard privacy opt-out — the server-side consent contract.

These pin the API, per the league spec §6.4/§7:

  1. the toggle round-trips through POST /api/leaderboard/prefs,
  2. a hidden student is absent from *every other viewer's* board,
  3. the hidden student still sees where they would stand (`you_would_be_rank`),
  4. and holds no promotion slot.

(2) is the regression test proper: the board is supervisor-visible, so a leak here is
a consent failure, not a cosmetic bug.

STATUS 2026-08-02: the UI for all of this was removed from /leaderboard by request, so
nothing in the app currently POSTs to /prefs or renders `you_would_be_rank`. The endpoint
and the hidden-row filter are deliberately left working — a student flagged
`leaderboard_hidden` in the database must keep being hidden whether or not a control
exists to unset it, and restoring the control should not mean rewriting the server. Keep
these tests green; they are the contract, not the feature.

Note these were never the tests that could catch the original 214ab7f regression: the API
was never broken, only unreachable, so (1), (2) and (4) passed the moment they were
written. Only a browser harness can prove reachability, and with the panel gone there is
nothing left to prove — `league_assert.mjs` now asserts its absence instead.
"""
from datetime import date
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

WEEK = date(2026, 5, 4)  # a Monday — the SGT weekly boundary


def _cookies(sub: str) -> dict:
    return {"eyebot_token": create_access_token(sub, "student", "OA")}


# Cy (user_003) is hidden and sits mid-ladder on weekly XP: 300 > 200 > 100.
# Mid-ladder matters — a hidden student at the top or bottom could pass a leak test
# by luck, because the visible order would be unchanged either way.
PROFILES = [
    {"student_id": "user_001", "xp": 900, "xp_week": 300, "xp_week_start": "2026-05-04", "role": "OA"},
    {"student_id": "user_002", "xp": 400, "xp_week": 100, "xp_week_start": "2026-05-04", "role": "OT"},
    {"student_id": "user_003", "xp": 700, "xp_week": 200, "xp_week_start": "2026-05-04", "role": "OA",
     "leaderboard_hidden": True},
]
CONSENT = [
    {"student_id": "user_001", "student_name": "Ann Aa"},
    {"student_id": "user_002", "student_name": "Bob Bb"},
    {"student_id": "user_003", "student_name": "Cy Cc"},
]


def _board(sub: str, qs: str = ""):
    with patch("tools.shared.clock.app_week_start", return_value=WEEK), \
         patch("tools.shared.db.get_all_consent", new_callable=AsyncMock, return_value=CONSENT), \
         patch("tools.shared.db.get_active_leaderboard_profiles", new_callable=AsyncMock,
               return_value=PROFILES):
        r = client.get(f"/api/leaderboard{qs}", cookies=_cookies(sub))
    assert r.status_code == 200
    return r.json()


# ── 1. the toggle round-trips ────────────────────────────────────────────────

@patch("tools.shared.db.update_profile", new_callable=AsyncMock)
def test_hide_toggle_round_trips(mock_upd):
    """Hiding writes the column for the JWT's own identity; the board then reports it
    back as `you_hidden` so the restored switch renders in the right position."""
    r = client.post("/api/leaderboard/prefs", json={"hidden": True}, cookies=_cookies("user_003"))
    assert r.status_code == 200
    args, kwargs = mock_upd.call_args
    assert args[0] == "user_003"
    assert kwargs["leaderboard_hidden"] is True
    assert _board("user_003")["you_hidden"] is True         # and it comes back on read


@patch("tools.shared.db.update_profile", new_callable=AsyncMock)
def test_unhiding_round_trips_back(mock_upd):
    """The opt-out is reversible — the switch must be able to put a student back on."""
    r = client.post("/api/leaderboard/prefs", json={"hidden": False}, cookies=_cookies("user_001"))
    assert r.status_code == 200
    assert mock_upd.call_args.kwargs["leaderboard_hidden"] is False
    assert _board("user_001")["you_hidden"] is False


# ── 2. THE REGRESSION: hidden from every other viewer ────────────────────────

def test_hidden_student_is_absent_from_every_other_viewers_board():
    """The consent guarantee. Cy is hidden, so no other viewer — peer or staff — sees
    Cy in any form: not as a row, not in the ranks, not by name anywhere in the payload.
    Asserted for EVERY other viewer, not just one, and the ranks must close up over the
    gap (1,2) rather than leaving a tell-tale hole where Cy was."""
    for viewer in ("user_001", "user_002"):
        body = _board(viewer)
        names = [e["name"] for e in body["entries"]]
        assert names == ["Ann Aa", "Bob Bb"], f"{viewer} saw {names}"
        assert [e["rank"] for e in body["entries"]] == [1, 2]   # no gap at the hidden slot
        # Nothing anywhere in the payload leaks the hidden identity.
        assert "Cy Cc" not in repr(body)
        assert "user_003" not in repr(body)


def test_hidden_student_is_absent_under_a_role_filter_too():
    """The role filter is a *view*. Filtering to Cy's own role must not surface Cy —
    a filtered query is the obvious way a leak would slip past the unfiltered test."""
    body = _board("user_001", "?role=OA")
    assert [e["name"] for e in body["entries"]] == ["Ann Aa"]
    assert "Cy Cc" not in repr(body)


# ── 3. the hidden student still sees themselves ──────────────────────────────

def test_hidden_viewer_is_told_where_they_would_stand():
    """A hidden student sees their own board (spec §6.4): they are still off the ladder,
    but the payload tells them the rank they would hold — Cy's 200 weekly XP sits between
    Ann (300) and Bob (100), so 2nd."""
    body = _board("user_003")
    assert body["you_hidden"] is True
    assert body["you_would_be_rank"] == 2
    assert [e["name"] for e in body["entries"]] == ["Ann Aa", "Bob Bb"]  # still not ON it
    assert not any(e["is_you"] for e in body["entries"])


def test_visible_viewer_gets_no_would_be_rank():
    """The field is strictly for the hidden case — a visible student has a real rank,
    so a number here would be a second, conflicting source of truth."""
    assert _board("user_001")["you_would_be_rank"] is None


def test_would_be_rank_is_null_when_the_filter_excludes_the_viewer():
    """Cy is OA. Viewing the OT board, Cy would not appear there at all even if visible,
    so claiming a position on it would be a lie."""
    assert _board("user_003", "?role=OT")["you_would_be_rank"] is None


# ── 4. hidden holds no promotion slot ────────────────────────────────────────

def test_hidden_student_holds_no_promotion_slot():
    """Already enforced in the router's pool derivation — pinned here so the restored
    opt-out can never become a way to quietly occupy a promotion slot while invisible."""
    body = _board("user_001")
    assert body["pool_size"] == 2          # Ann + Bob; Cy excluded despite being active
