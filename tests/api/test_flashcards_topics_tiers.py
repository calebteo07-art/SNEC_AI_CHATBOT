import sys
from unittest.mock import patch

import pytest
from httpx import AsyncClient, ASGITransport
from tools.api.server import app
from tests.api.conftest import auth_headers
from tools.flashcards.flashcard_sets import topics_for
from tools.flashcards.static_cards import topic_card_counts


@pytest.fixture(autouse=True)
def _forbid_real_supabase():
    """No test in this file may reach production Supabase — every db function
    funnels through db._get_client, so blocking that one seam catches all of them.
    The endpoint swallows read failures, so the assertion has to happen after the
    request or a leak would pass silently."""
    attempted = []

    async def _blocked(*_args, **_kwargs):
        attempted.append(sys._getframe(1).f_code.co_name)
        raise AssertionError("real Supabase client requested")

    with patch("tools.shared.db._get_client", new=_blocked):
        yield

    assert not attempted, (
        "these db calls reached production Supabase: "
        + ", ".join(sorted(set(attempted))) + " - stub them"
    )


@pytest.mark.asyncio
async def test_topics_one_deck_per_topic_no_difficulty(monkeypatch):
    """Selection collapses difficulty: /topics returns exactly one deck per topic
    THAT HAS CARDS (set_key == topic_key, difficulty == "mixed"). Topics with no
    authored cards yet are hidden so students never see an empty deck."""
    from tools.api.routers import student as mod
    from tools.shared import db

    async def _profile(_sid): return {"role": "OA"}
    async def _levels(_sid): return {}
    monkeypatch.setattr(mod, "get_profile", _profile)
    monkeypatch.setattr(db, "get_completed_deck_levels", _levels)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.get("/api/flashcards/topics", headers=auth_headers(role="OA"))
    assert r.status_code == 200
    sets = r.json()["sets"]
    counts = topic_card_counts("OA")
    expected = [k for k, _ in topics_for("OA") if counts.get(k, 0) > 0]
    assert expected, "at least one topic should have cards"
    assert [s["set_key"] for s in sets] == expected
    assert all(s["topic_key"] == s["set_key"] for s in sets)
    assert all(s["difficulty"] == "mixed" for s in sets)
    assert all(s["total"] > 0 for s in sets), "each visible topic deck has cards"
