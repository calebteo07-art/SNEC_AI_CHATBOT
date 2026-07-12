import pytest
from httpx import AsyncClient, ASGITransport
from tools.api.server import app
from tests.api.conftest import auth_headers


@pytest.mark.asyncio
async def test_forfeit_deducts_flat_penalty(monkeypatch):
    from tools.api.routers import student as mod
    applied = []

    async def _update_profile(_sid, **k):
        applied.append(k.get("xp_delta"))
    async def _profile(_sid):
        return {"xp": 80}

    monkeypatch.setattr(mod, "update_profile", _update_profile)
    monkeypatch.setattr(mod, "get_profile", _profile)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.post("/api/flashcards/forfeit", headers=auth_headers(role="OA"))
    assert r.status_code == 200
    assert applied == [-20]           # server owns the penalty amount
    assert r.json()["xp"] == 80       # new balance echoed back
