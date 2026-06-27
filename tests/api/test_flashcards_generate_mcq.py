import os
os.environ.setdefault("MOCK_MODE", "1")
import pytest
from httpx import AsyncClient, ASGITransport
from tools.api.server import app
from tests.api.conftest import auth_headers


@pytest.mark.asyncio
async def test_generate_returns_mcq_shape(monkeypatch):
    # Avoid Supabase: stub the served-stems + insert path to echo cards back.
    from tools.api.routers import student as mod

    async def _served(_sid): return set()
    async def _insert(_sid, cards): return [{**c, "card_id": f"id{i}"} for i, c in enumerate(cards)]
    monkeypatch.setattr(mod, "get_served_static_fronts", _served)
    monkeypatch.setattr(mod, "insert_cards", _insert)

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
