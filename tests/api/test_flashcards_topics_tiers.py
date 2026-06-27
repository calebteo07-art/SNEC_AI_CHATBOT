import os
os.environ.setdefault("MOCK_MODE", "1")
import pytest
from httpx import AsyncClient, ASGITransport
from tools.api.server import app
from tests.api.conftest import auth_headers


@pytest.mark.asyncio
async def test_topics_lists_hard_tier(monkeypatch):
    from tools.api.routers import student as mod
    async def _served(_sid): return set()
    monkeypatch.setattr(mod, "get_served_static_fronts", _served)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.get("/api/flashcards/topics", headers=auth_headers(role="OA"))
    assert r.status_code == 200
    diffs = {s["difficulty"] for s in r.json()["sets"]}
    assert {"easy", "medium", "hard"} <= diffs
