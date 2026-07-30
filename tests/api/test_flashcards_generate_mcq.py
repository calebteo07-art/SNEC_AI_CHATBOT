import pytest
from httpx import AsyncClient, ASGITransport
from tools.api.server import app
from tests.api.conftest import auth_headers


def _stub(monkeypatch):
    """Stub the served-stems, insert, profile and deck-progress paths."""
    from tools.api.routers import student as mod
    from tools.shared import db

    async def _served(_sid): return set()
    async def _ids(_sid): return {}
    async def _insert(_sid, cards): return [{**c, "card_id": f"id{i}"} for i, c in enumerate(cards)]
    async def _profile(_sid): return {"role": "OA"}
    async def _levels(_sid): return {}
    monkeypatch.setattr(mod, "get_served_static_fronts", _served)
    monkeypatch.setattr(mod, "get_served_static_card_ids", _ids)
    monkeypatch.setattr(mod, "insert_cards", _insert)
    monkeypatch.setattr(mod, "get_profile", _profile)
    monkeypatch.setattr(db, "get_completed_deck_levels", _levels)


@pytest.mark.asyncio
async def test_generate_returns_mcq_shape(monkeypatch):
    _stub(monkeypatch)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.get("/api/flashcards/generate",
                         params={"set_key": "triage__easy", "n": 10},
                         headers=auth_headers(role="OA"))
    assert r.status_code == 200
    cards = r.json()
    assert cards, "expected cards"
    c = cards[0]
    for key in ("stem", "options", "correct", "qtype", "kind",
                "explanation", "requires_explanation", "topic_tag", "difficulty"):
        assert key in c, key
    # ~1 per 5 typed; a 10-card single-set deck caps at the set size
    typed = [x for x in cards if x["requires_explanation"]]
    assert len(typed) <= 2


@pytest.mark.asyncio
async def test_generate_topic_level_serves_one_curated_rung(monkeypatch):
    """A topic-level set_key (no __difficulty) serves one rung of that topic's
    difficulty ladder — 10 cards of a single curated step, all tagged to the topic."""
    _stub(monkeypatch)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.get("/api/flashcards/generate",
                         params={"set_key": "triage", "n": 10},
                         headers=auth_headers(role="OA"))
    assert r.status_code == 200
    cards = r.json()
    assert cards, "expected cards for the topic-level deck"
    assert all(c["topic_tag"] == "triage" for c in cards)
    assert len(cards) == 10
