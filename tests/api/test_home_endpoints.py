"""The Home payload and the two claims.

The pure mechanics are tested in tests/gamification/. What is only testable here is the
WIRING — and above all the repeat case. Idempotent-claim and show-once-per-day invariants
are a class of bug this project has shipped before, so claiming twice has a test on both
endpoints and both assert the SECOND call awards nothing.
"""
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)
TODAY = date(2026, 8, 4)


@pytest.fixture(autouse=True)
def _no_board_reads():
    """Home reads the league board. Those reads are not what this file tests, and an
    unpatched one would fail against the suite's real-Supabase guard — an empty board
    makes the strip None."""
    with patch("tools.api.routers.home.db.get_active_leaderboard_profiles",
               AsyncMock(return_value=[])), \
         patch("tools.api.routers.home.db.get_all_consent", AsyncMock(return_value=[])):
        yield


def _cookies(sub: str = "ann") -> dict:
    return {"eyebot_token": create_access_token(sub, "student", "OA")}


def _profile(**extra) -> dict:
    return {"student_id": "ann", "xp": 250, "division": 1, "weak_topics": ["gonioscopy"],
            "xp_today": 40, "xp_today_date": TODAY.isoformat(), **extra}


def test_home_requires_auth():
    assert client.get("/api/home").status_code == 401


def test_home_returns_three_quests_with_progress():
    with patch("tools.api.routers.home.get_profile", AsyncMock(return_value=_profile())), \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        r = client.get("/api/home", cookies=_cookies())
    assert r.status_code == 200
    body = r.json()
    assert len(body["quests"]) == 3
    assert sorted(q["kind"] for q in body["quests"]) == ["adaptive", "breadth", "stretch"]
    stretch = next(q for q in body["quests"] if q["kind"] == "stretch")
    assert stretch["progress"] == 40          # from xp_today, merged into the activity dict


def test_home_reports_a_failed_read_as_null_never_zero():
    # The one screen a student opens to see their work must not paint 0 XP as fact.
    with patch("tools.api.routers.home.get_profile", AsyncMock(side_effect=RuntimeError("down"))):
        r = client.get("/api/home", cookies=_cookies())
    assert r.status_code == 200
    assert r.json()["quests"] is None
    assert r.json()["chest"] is None


def test_home_shows_the_chest_unclaimed_then_claimed():
    claimed = {"activity": {"flashcards": 0, "osce": 0, "tutor": 0, "topics": {}},
               "quests_claimed": [], "chest_claimed": True}
    with patch("tools.api.routers.home.get_profile", AsyncMock(return_value=_profile())), \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        assert client.get("/api/home", cookies=_cookies()).json()["chest"]["claimed"] is False
    with patch("tools.api.routers.home.get_profile",
               AsyncMock(return_value=_profile(daily_state=claimed,
                                               daily_state_date=TODAY.isoformat()))), \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        assert client.get("/api/home", cookies=_cookies()).json()["chest"]["claimed"] is True


def test_claiming_the_chest_twice_pays_once_and_pays_the_same_drop():
    profile = _profile()
    with patch("tools.api.routers.home.get_profile", AsyncMock(return_value=profile)), \
         patch("tools.api.routers.home.db.update_profile", AsyncMock()) as upd, \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        first = client.post("/api/home/chest/claim", cookies=_cookies()).json()
    assert first["ok"] is True
    writes_after_first = upd.call_count

    already = {"activity": {"flashcards": 0, "osce": 0, "tutor": 0, "topics": {}},
               "quests_claimed": [], "chest_claimed": True}
    with patch("tools.api.routers.home.get_profile",
               AsyncMock(return_value=_profile(daily_state=already,
                                               daily_state_date=TODAY.isoformat()))), \
         patch("tools.api.routers.home.db.update_profile", AsyncMock()) as upd2, \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        second = client.post("/api/home/chest/claim", cookies=_cookies()).json()

    assert second["already_claimed"] is True
    assert second["drop"]["key"] == first["drop"]["key"]   # same prize, always
    assert upd2.call_count == 0                            # and nothing was awarded again
    assert writes_after_first > 0


def test_claiming_an_incomplete_quest_pays_nothing():
    with patch("tools.api.routers.home.get_profile", AsyncMock(return_value=_profile())), \
         patch("tools.api.routers.home.update_profile", AsyncMock()) as award, \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        r = client.post("/api/home/quest/claim", json={"kind": "breadth"}, cookies=_cookies())
    assert r.json()["ok"] is False
    assert award.call_count == 0


def test_claiming_a_completed_quest_twice_pays_once():
    # xp_today=999 clears the stretch quest, whose metric is xp — no activity needed.
    done = {"activity": {"flashcards": 0, "osce": 0, "tutor": 0, "topics": {}},
            "quests_claimed": [], "chest_claimed": False}
    profile = _profile(xp_today=999, daily_state=done, daily_state_date=TODAY.isoformat())
    with patch("tools.api.routers.home.get_profile", AsyncMock(return_value=profile)), \
         patch("tools.api.routers.home.db.update_profile", AsyncMock()), \
         patch("tools.api.routers.home.update_profile", AsyncMock()) as award, \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        first = client.post("/api/home/quest/claim", json={"kind": "stretch"}, cookies=_cookies())
    assert first.json()["ok"] is True
    assert award.call_count == 1

    already = dict(done, quests_claimed=["stretch"])
    with patch("tools.api.routers.home.get_profile",
               AsyncMock(return_value=_profile(xp_today=999, daily_state=already,
                                               daily_state_date=TODAY.isoformat()))), \
         patch("tools.api.routers.home.db.update_profile", AsyncMock()), \
         patch("tools.api.routers.home.update_profile", AsyncMock()) as award2, \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        second = client.post("/api/home/quest/claim", json={"kind": "stretch"}, cookies=_cookies())
    assert second.json()["already_claimed"] is True
    assert award2.call_count == 0


def test_a_claim_never_trusts_the_body_for_identity():
    # Identity is the JWT sub. A body field naming another student must not be honoured.
    with patch("tools.api.routers.home.get_profile", AsyncMock(return_value=_profile())) as gp, \
         patch("tools.api.routers.home.db.update_profile", AsyncMock()), \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        client.post("/api/home/chest/claim", json={"student_id": "victim"}, cookies=_cookies("ann"))
    assert gp.call_args.args[0] == "ann"


# ── the adaptive quest stays inside the student's own discipline ──────────────────────
# The unit rules live in tests/gamification/test_quests.py. What is only testable here is
# that the ROLE actually reaches them: the router reads student_profiles.role (the
# discipline — OA/PSA/OT — not the account role), and a router that forgot to pass it
# would leave every unit test green while shipping the original defect.

def _titles(profile: dict) -> list[str]:
    with patch("tools.api.routers.home.get_profile", AsyncMock(return_value=profile)), \
         patch("tools.api.routers.home.app_today", return_value=TODAY):
        r = client.get("/api/home", cookies=_cookies())
    return [q["title"] for q in r.json()["quests"]]


def test_an_oa_is_never_handed_an_ot_topic_through_the_endpoint():
    # Exactly what shipped: an OA/PSA whose retention_scores picked up OT/OSCE entries.
    titles = _titles(_profile(role="OA", weak_topics=["oct_macula", "Cirrus_Oct_Macular_Scan"]))
    assert not any("OCT" in t or "Cirrus" in t for t in titles), titles


def test_an_ot_is_handed_an_ot_topic_through_the_endpoint():
    titles = _titles(_profile(role="OT", weak_topics=["oct_macula"]))
    assert any("Macular OCT" in t for t in titles), titles


def test_a_quest_title_is_never_a_raw_slug():
    # "Clear 2 decks in Cirrus_Oct_Macular_Scan" — the underscore is the tell that a raw
    # key reached the student instead of its display label.
    for title in _titles(_profile(role="OA", weak_topics=["distance_va__hard"])):
        assert "_" not in title, title
