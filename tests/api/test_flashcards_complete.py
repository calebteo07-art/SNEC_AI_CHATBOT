import pytest
from httpx import AsyncClient, ASGITransport
from tools.api.server import app
from tests.api.conftest import auth_headers


@pytest.mark.asyncio
async def test_complete_updates_sm2_and_returns_xp(monkeypatch):
    from tools.api.routers import student as mod
    calls = []

    xp_applied = []

    async def _update(cid, interval, ease, reps, due):
        calls.append((cid, reps))
    async def _profile(_sid):
        return {"xp": 120, "hearts": 5}
    async def _update_profile(_sid, **k):
        xp_applied.append(k.get("xp_delta"))
    monkeypatch.setattr(mod, "update_card_sm2", _update)
    monkeypatch.setattr(mod, "get_profile", _profile)
    monkeypatch.setattr(mod, "update_profile", _update_profile)

    body = {"xp_delta": 23, "results": [
        {"card_id": "c1", "correct": True, "repetitions": 0, "easiness": 2.5, "interval_days": 0},
        {"card_id": "c2", "correct": False, "repetitions": 2, "easiness": 2.4, "interval_days": 6},
    ]}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.post("/api/flashcards/complete", json=body, headers=auth_headers(role="OA"))
    assert r.status_code == 200
    assert r.json()["xp"] == 120
    assert len(calls) == 2  # both cards scheduled
    assert xp_applied == [23]  # passed through unchanged when within bounds


@pytest.mark.asyncio
async def test_complete_clamps_oversized_xp(monkeypatch):
    from tools.api.routers import student as mod
    xp_applied = []

    async def _profile(_sid): return {"xp": 0}
    async def _update_profile(_sid, **k): xp_applied.append(k.get("xp_delta"))
    monkeypatch.setattr(mod, "get_profile", _profile)
    monkeypatch.setattr(mod, "update_profile", _update_profile)

    body = {"xp_delta": 999999, "results": []}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.post("/api/flashcards/complete", json=body, headers=auth_headers(role="OA"))
    assert r.status_code == 200
    assert xp_applied == [500]  # tampered payload clamped to the ceiling
