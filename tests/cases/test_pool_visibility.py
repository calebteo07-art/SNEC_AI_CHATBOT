from tools.cases.topic_sets import case_pool, case_visible, sets_for, resolve_set


def test_case_pool_maps_oa_psa_together():
    assert case_pool("OA") == "CLINICAL"
    assert case_pool("PSA") == "CLINICAL"
    assert case_pool("OT") == "OT"


def test_oa_and_psa_share_one_taxonomy():
    assert sets_for("OA") == sets_for("PSA")
    keys = {k for k, _ in sets_for("OA")}
    assert {"perioperative", "triage_referral"} <= keys  # union of both old sets


def test_case_visible_by_pool():
    assert case_visible("PSA", "OA") is True    # OA-authored case shown to PSA
    assert case_visible("OA", "PSA") is True
    assert case_visible("OT", "OA") is False
    assert case_visible("OA", "any") is True


def test_resolve_set_is_pool_consistent():
    # OA and PSA bucket the same topic into the same set
    assert resolve_set("OA", "triage_floaters_flashes") == resolve_set("PSA", "triage_floaters_flashes")
    assert resolve_set("OA", "triage_floaters_flashes") == "triage_referral"


import pytest
from httpx import AsyncClient, ASGITransport
from tools.api.server import app
from tests.api.conftest import auth_headers


@pytest.mark.asyncio
async def test_oa_and_psa_see_identical_case_ids(monkeypatch):
    """OA ≡ PSA: both roles are served exactly the same clinical case set."""
    from tools.api.routers import cases as mod

    async def _prog(_sid):
        return {}
    monkeypatch.setattr(mod, "get_case_progress", _prog)

    async def _ids_for(role: str) -> set[str]:
        async def _profile(_sid):
            return {"role": role}
        monkeypatch.setattr(mod, "get_profile", _profile)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
            r = await ac.get("/api/cases", headers=auth_headers(role=role))
        assert r.status_code == 200
        return {c["case_id"] for c in r.json()["cases"]}

    oa_ids = await _ids_for("OA")
    psa_ids = await _ids_for("PSA")
    assert oa_ids == psa_ids
    assert oa_ids, "expected a non-empty shared clinical case set"
    # and it must exclude OT-only cases
    assert not any(cid.startswith("case_ot_") for cid in oa_ids)
