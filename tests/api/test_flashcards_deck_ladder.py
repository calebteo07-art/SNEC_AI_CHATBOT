"""The per-topic 5-deck difficulty ladder.

Each topic is 5 decks of 10, easiest first. A student walks the ladder one deck
at a time; once all 5 are done the topic still plays but stops paying Lumens.

Every test here stubs the DB. `_forbid_real_supabase` is the backstop: an
unstubbed db call on a box with a populated .env would read/write PRODUCTION
Supabase on every pytest run.
"""
import sys
from unittest.mock import patch

import pytest
from httpx import AsyncClient, ASGITransport

from tests.api.conftest import auth_headers
from tools.api.server import app
from tools.flashcards.card_levels import DECK_COUNT, DECK_SIZE, get_deck_cards

TOPIC = "triage"


@pytest.fixture(autouse=True)
def _forbid_real_supabase():
    """No test in this file may reach production Supabase. Every db function
    funnels through db._get_client, so blocking that one seam catches all of
    them. Assert after the request: the endpoints swallow exceptions, so
    raising alone would go unnoticed."""
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


def _stub(monkeypatch, *, completed_levels=None, profile_calls=None):
    """Stub every DB seam the flashcard endpoints touch."""
    from tools.api.routers import student as mod
    from tools.shared import db

    async def _served(_sid): return set()
    async def _ids(_sid): return {}
    async def _insert(_sid, cards): return [{**c, "card_id": f"id{i}"} for i, c in enumerate(cards)]
    async def _profile(_sid): return {"role": "OA", "xp": 0}
    async def _levels(_sid): return dict(completed_levels or {})
    async def _mark(_sid, _topic, _level): return None
    async def _due(_sid, limit=10): return []
    async def _sm2(*_a, **_k): return None
    async def _attempt(**_k): return None

    async def _update(student_id, **kwargs):
        if profile_calls is not None:
            profile_calls.append(kwargs)
        return None

    monkeypatch.setattr(mod, "get_served_static_fronts", _served)
    monkeypatch.setattr(mod, "get_served_static_card_ids", _ids)
    monkeypatch.setattr(mod, "insert_cards", _insert)
    monkeypatch.setattr(mod, "get_profile", _profile)
    monkeypatch.setattr(mod, "update_profile", _update)
    monkeypatch.setattr(mod, "get_due_cards", _due)
    monkeypatch.setattr(mod, "update_card_sm2", _sm2)
    monkeypatch.setattr(db, "get_completed_deck_levels", _levels)
    monkeypatch.setattr(db, "mark_deck_complete", _mark)
    monkeypatch.setattr(db, "insert_flashcard_attempt", _attempt)


async def _get(path, **params):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        return await ac.get(path, params=params, headers=auth_headers(role="OA"))


async def _post(path, payload):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        return await ac.post(path, json=payload, headers=auth_headers(role="OA"))


def _stems(level):
    return [c["stem"] for c in get_deck_cards("OA", TOPIC, level)]


def _results(topic=TOPIC, n=DECK_SIZE):
    """A realistic deck submission — every card carries its topic_tag, which is
    what routes the XP through the per-topic retention write."""
    return [{"card_id": f"id{i}", "correct": True, "topic_tag": topic} for i in range(n)]


# ── Serving the ladder ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_a_new_student_gets_the_easiest_deck(monkeypatch):
    _stub(monkeypatch)
    r = await _get("/api/flashcards/generate", set_key=TOPIC)
    assert r.status_code == 200
    assert sorted(c["stem"] for c in r.json()) == sorted(_stems(1))


@pytest.mark.asyncio
async def test_generate_serves_the_next_uncompleted_deck(monkeypatch):
    _stub(monkeypatch, completed_levels={TOPIC: [1, 2]})
    r = await _get("/api/flashcards/generate", set_key=TOPIC)
    assert sorted(c["stem"] for c in r.json()) == sorted(_stems(3))


@pytest.mark.asyncio
async def test_progress_on_one_topic_does_not_advance_another(monkeypatch):
    _stub(monkeypatch, completed_levels={"glaucoma": [1, 2, 3]})
    r = await _get("/api/flashcards/generate", set_key=TOPIC)
    assert sorted(c["stem"] for c in r.json()) == sorted(_stems(1))


@pytest.mark.asyncio
@pytest.mark.parametrize("level", range(1, DECK_COUNT + 1))
async def test_an_explicit_level_is_served_verbatim(monkeypatch, level):
    """The replay picker a student sees once the topic is complete."""
    _stub(monkeypatch, completed_levels={TOPIC: list(range(1, DECK_COUNT + 1))})
    r = await _get("/api/flashcards/generate", set_key=TOPIC, level=level)
    assert sorted(c["stem"] for c in r.json()) == sorted(_stems(level))


@pytest.mark.asyncio
async def test_a_finished_topic_defaults_to_the_hardest_deck(monkeypatch):
    _stub(monkeypatch, completed_levels={TOPIC: list(range(1, DECK_COUNT + 1))})
    r = await _get("/api/flashcards/generate", set_key=TOPIC)
    assert sorted(c["stem"] for c in r.json()) == sorted(_stems(DECK_COUNT))


@pytest.mark.asyncio
async def test_every_ladder_deck_is_exactly_ten_cards(monkeypatch):
    _stub(monkeypatch)
    r = await _get("/api/flashcards/generate", set_key=TOPIC, n=20)
    assert len(r.json()) == DECK_SIZE, "n must not widen a curated deck"


@pytest.mark.asyncio
async def test_missing_progress_table_degrades_to_the_first_deck(monkeypatch):
    """Pre-migration 015 the table 404s. Fail toward deck 1 + full earning,
    never toward locking a student out."""
    _stub(monkeypatch)
    from tools.shared import db

    async def _boom(_sid): raise RuntimeError("relation does not exist")
    monkeypatch.setattr(db, "get_completed_deck_levels", _boom)

    r = await _get("/api/flashcards/generate", set_key=TOPIC)
    assert r.status_code == 200
    assert sorted(c["stem"] for c in r.json()) == sorted(_stems(1))


# ── One row per card, for life ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_replaying_a_deck_reuses_its_existing_card_rows(monkeypatch):
    """Replay is a first-class flow on the ladder, so a card must map to ONE
    flashcards row for its whole life. Inserting a fresh row per replay would fork
    the card's SM-2 history and let the review deck serve the same stem twice."""
    _stub(monkeypatch)
    from tools.api.routers import student as mod
    inserted = []

    async def _insert(_sid, cards):
        inserted.extend(c["front"] for c in cards)
        return [{**c, "card_id": f"new{i}"} for i, c in enumerate(cards)]

    known = {stem: f"old{i}" for i, stem in enumerate(_stems(1))}

    async def _ids(_sid): return dict(known)
    monkeypatch.setattr(mod, "insert_cards", _insert)
    monkeypatch.setattr(mod, "get_served_static_card_ids", _ids)

    r = await _get("/api/flashcards/generate", set_key=TOPIC, level=1)
    assert r.status_code == 200
    assert inserted == [], "an already-seen deck must insert nothing on replay"
    assert {c["card_id"] for c in r.json()} == set(known.values()), \
        "replayed cards must keep their original card_id (and its SM-2 schedule)"


@pytest.mark.asyncio
async def test_a_partly_seen_deck_only_inserts_the_new_cards(monkeypatch):
    _stub(monkeypatch)
    from tools.api.routers import student as mod
    inserted = []

    async def _insert(_sid, cards):
        inserted.extend(c["front"] for c in cards)
        return [{**c, "card_id": f"new{i}"} for i, c in enumerate(cards)]

    seen = _stems(1)[:4]
    known = {stem: f"old{i}" for i, stem in enumerate(seen)}

    async def _ids(_sid): return dict(known)
    monkeypatch.setattr(mod, "insert_cards", _insert)
    monkeypatch.setattr(mod, "get_served_static_card_ids", _ids)

    r = await _get("/api/flashcards/generate", set_key=TOPIC, level=1)
    assert sorted(inserted) == sorted(_stems(1)[4:]), "only the unseen cards are inserted"
    assert len(r.json()) == DECK_SIZE, "the deck is still whole"


# ── Recording completion ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_finishing_a_deck_records_that_level(monkeypatch):
    _stub(monkeypatch)
    from tools.shared import db
    marked = []

    async def _mark(sid, topic, level): marked.append((topic, level))
    monkeypatch.setattr(db, "mark_deck_complete", _mark)

    r = await _post("/api/flashcards/complete", {
        "results": [], "xp_delta": 40, "topic_key": TOPIC, "level": 2,
    })
    assert r.status_code == 200
    assert marked == [(TOPIC, 2)]


@pytest.mark.asyncio
async def test_a_deck_without_a_level_records_nothing(monkeypatch):
    """The Mixed deck spans topics — it has no rung on any ladder."""
    _stub(monkeypatch)
    from tools.shared import db
    marked = []

    async def _mark(sid, topic, level): marked.append((topic, level))
    monkeypatch.setattr(db, "mark_deck_complete", _mark)

    r = await _post("/api/flashcards/complete", {"results": [], "xp_delta": 40})
    assert r.status_code == 200
    assert marked == []


# ── The Lumens cap (the state invariant) ────────────────────────────────────

@pytest.mark.asyncio
async def test_an_unfinished_topic_still_pays_lumens(monkeypatch):
    calls = []
    _stub(monkeypatch, completed_levels={TOPIC: [1, 2]}, profile_calls=calls)
    await _post("/api/flashcards/complete",
                {"results": _results(), "xp_delta": 120, "topic_key": TOPIC, "level": 3})
    assert [c.get("xp_delta") for c in calls] == [120]


@pytest.mark.asyncio
async def test_the_fifth_deck_still_pays_lumens(monkeypatch):
    """The cap is evaluated on the state BEFORE this submission, so completing
    the final deck is itself paid — only the 6th play onward is free."""
    calls = []
    _stub(monkeypatch, completed_levels={TOPIC: [1, 2, 3, 4]}, profile_calls=calls)
    await _post("/api/flashcards/complete",
                {"results": _results(), "xp_delta": 120, "topic_key": TOPIC, "level": 5})
    assert [c.get("xp_delta") for c in calls] == [120]


@pytest.mark.asyncio
async def test_replaying_a_completed_topic_earns_no_lumens(monkeypatch):
    calls = []
    _stub(monkeypatch, completed_levels={TOPIC: [1, 2, 3, 4, 5]}, profile_calls=calls)
    r = await _post("/api/flashcards/complete",
                    {"results": _results(), "xp_delta": 120, "topic_key": TOPIC, "level": 3})
    assert r.status_code == 200, "a completed topic must still be playable"
    assert [c.get("xp_delta") for c in calls] == [0]


@pytest.mark.asyncio
async def test_the_cap_survives_a_tampered_payload(monkeypatch):
    """The client is never trusted for the amount — the server owns the cap."""
    calls = []
    _stub(monkeypatch, completed_levels={TOPIC: [1, 2, 3, 4, 5]}, profile_calls=calls)
    await _post("/api/flashcards/complete", {
        "results": [{"card_id": "id0", "correct": True, "topic_tag": TOPIC, "score": 24}],
        "xp_delta": 999999, "topic_key": TOPIC, "level": 1,
    })
    assert all(c.get("xp_delta", 0) == 0 for c in calls)


@pytest.mark.asyncio
async def test_a_completed_topic_does_not_mute_another_topics_lumens(monkeypatch):
    calls = []
    _stub(monkeypatch, completed_levels={"glaucoma": [1, 2, 3, 4, 5]}, profile_calls=calls)
    await _post("/api/flashcards/complete",
                {"results": _results(), "xp_delta": 120, "topic_key": TOPIC, "level": 1})
    assert [c.get("xp_delta") for c in calls] == [120]


# ── The topic picker ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_topics_report_deck_progress(monkeypatch):
    _stub(monkeypatch, completed_levels={TOPIC: [1, 2, 3]})
    r = await _get("/api/flashcards/topics")
    assert r.status_code == 200
    by_key = {s["topic_key"]: s for s in r.json()["sets"]}
    assert by_key[TOPIC]["decks_completed"] == 3
    assert by_key[TOPIC]["deck_count"] == DECK_COUNT
    assert by_key["glaucoma"]["decks_completed"] == 0
