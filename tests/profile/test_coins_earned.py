import pytest


@pytest.mark.asyncio
async def test_coins_earned_increments_on_positive_delta(monkeypatch):
    from tools.profile import update_profile as mod
    writes = []

    async def _get(_sid):
        return {"xp": 100, "coins_earned": 100, "hearts": 5}
    async def _upd(_sid, **k):
        writes.append(k)

    monkeypatch.setattr(mod, "get_profile", _get)
    monkeypatch.setattr(mod.db, "update_profile", _upd)

    await mod.update_profile("s1", xp_delta=30)
    assert any(w.get("coins_earned") == 130 for w in writes)


@pytest.mark.asyncio
async def test_coins_earned_untouched_on_penalty(monkeypatch):
    from tools.profile import update_profile as mod
    writes = []

    async def _get(_sid):
        return {"xp": 100, "coins_earned": 100, "hearts": 5}
    async def _upd(_sid, **k):
        writes.append(k)

    monkeypatch.setattr(mod, "get_profile", _get)
    monkeypatch.setattr(mod.db, "update_profile", _upd)

    await mod.update_profile("s1", xp_delta=-20)
    assert all("coins_earned" not in w for w in writes)
    assert any(w.get("xp") == 80 for w in writes)  # balance decremented + floored
