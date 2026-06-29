import pytest
from httpx import AsyncClient, ASGITransport
from tools.api.server import app
from tests.api.conftest import auth_headers
from tools.flashcards.flashcard_sets import topics_for


@pytest.mark.asyncio
async def test_topics_one_deck_per_topic_no_difficulty(monkeypatch):
    """Selection collapses difficulty: /topics returns exactly one deck per topic
    (set_key == topic_key, difficulty == "mixed"), each mixing all tiers."""
    from tools.api.routers import student as mod
    async def _served(_sid): return set()
    monkeypatch.setattr(mod, "get_served_static_fronts", _served)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.get("/api/flashcards/topics", headers=auth_headers(role="OA"))
    assert r.status_code == 200
    sets = r.json()["sets"]
    topic_keys = [k for k, _ in topics_for("OA")]
    assert [s["set_key"] for s in sets] == topic_keys
    assert all(s["topic_key"] == s["set_key"] for s in sets)
    assert all(s["difficulty"] == "mixed" for s in sets)
    assert all(s["total"] > 0 for s in sets), "each topic deck sums cards across tiers"
