import re
from pathlib import Path

import pytest
from httpx import AsyncClient, ASGITransport
from tools.api.server import app
from tests.api.conftest import auth_headers

# tests/api/ -> tests/ -> repo root
_REPO = Path(__file__).resolve().parents[2]


def _complete_card_result_fields() -> tuple[str, ...]:
    """Field names declared on the frontend's CompleteCardResult interface."""
    src = (_REPO / "frontend/src/hooks/useFlashcards.ts").read_text(encoding="utf-8")
    m = re.search(r"export interface CompleteCardResult\s*\{(.*?)\n\}", src, re.S)
    assert m, "CompleteCardResult interface not found in frontend/src/hooks/useFlashcards.ts"
    return tuple(sorted(set(re.findall(r"([A-Za-z_][A-Za-z0-9_]*)\??\s*:", m.group(1)))))


def _push_object_literal() -> str:
    """The object literal pushed into resultsRef by Flashcards.tsx's onCheck.

    Brace-balanced rather than line-based so reformatting the .tsx cannot false-fail this.
    """
    src = (_REPO / "frontend/src/aurora/screens/Flashcards.tsx").read_text(encoding="utf-8")
    i = src.find("resultsRef.current.push(")
    assert i != -1, "resultsRef.current.push( not found in Flashcards.tsx"
    start = src.index("{", i)
    depth = 0
    for j in range(start, len(src)):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                return src[start + 1:j]
    raise AssertionError("unbalanced braces in the resultsRef.current.push( literal")


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
    assert xp_applied == [1000]  # tampered payload clamped to the per-request ceiling


@pytest.mark.asyncio
async def test_complete_persists_attempts_and_feeds_retention(monkeypatch):
    from tools.api.routers import student as mod
    attempts = []
    profile_updates = []

    async def _sm2(cid, interval, ease, reps, due): pass
    async def _profile(_sid): return {"xp": 50}
    async def _update_profile(_sid, **k): profile_updates.append(k)
    async def _attempt(**k): attempts.append(k)

    monkeypatch.setattr(mod, "update_card_sm2", _sm2)
    monkeypatch.setattr(mod, "get_profile", _profile)
    monkeypatch.setattr(mod, "update_profile", _update_profile)
    monkeypatch.setattr(mod.db, "insert_flashcard_attempt", _attempt)

    body = {"xp_delta": 40, "results": [
        {"card_id": "c1", "correct": True,  "topic_tag": "glaucoma", "score": 20},
        {"card_id": "c2", "correct": False, "topic_tag": "glaucoma", "score": 0},
    ]}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.post("/api/flashcards/complete", json=body, headers=auth_headers(role="OA"))
    assert r.status_code == 200
    # Both graded cards persisted as attempts with topic + correctness.
    assert len(attempts) == 2
    assert attempts[0] == {"student_id": "stud-test", "card_id": "c1",
                           "topic_tag": "glaucoma", "correct": True, "score": 20}
    # One retention write for the single-topic deck: accuracy 1/2 = 0.5, xp rides along.
    assert len(profile_updates) == 1
    assert profile_updates[0]["topic"] == "glaucoma"
    assert profile_updates[0]["score"] == 0.5
    assert profile_updates[0]["xp_delta"] == 40


def test_frontend_complete_payload_carries_topic_tag_and_score():
    """The deck writer must SEND the topic, or none of this is recorded anywhere.

    /api/flashcards/complete keeps only results with a truthy topic_tag -- both the
    flashcard_attempts insert (student.py:468) and the per-topic retention write
    (student.py:479). The frontend omitted it, so production accumulated 0 attempt rows
    while every request returned 200. This is a cross-language contract, so it is pinned
    at the source: the interface (which makes omission a typecheck error) and the one
    push site that builds the payload.
    """
    fields = _complete_card_result_fields()
    assert "topic_tag" in fields, (
        "CompleteCardResult must declare topic_tag: POST /api/flashcards/complete "
        "drops every result without one (tools/api/routers/student.py:468)")
    assert "score" in fields, (
        "CompleteCardResult must declare score: it is the per-card points column on "
        "flashcard_attempts (tools/shared/db.py:196)")

    obj = _push_object_literal()
    assert re.search(r"\btopic_tag\b", obj), (
        "Flashcards.tsx onCheck must push topic_tag -- the card carries it as card.tag")
    assert re.search(r"\bscore\b", obj), (
        "Flashcards.tsx onCheck must push score -- the per-card points banked for this card")


@pytest.mark.asyncio
async def test_complete_persists_attempts_from_frontend_shaped_payload(monkeypatch):
    """The wire contract in the EXACT key set Flashcards.tsx pushes into resultsRef.

    Distinct from test_complete_persists_attempts_and_feeds_retention above, which sends a
    hand-crafted minimal body: this one carries the SM-2 fields too, so it fails if the
    real payload shape ever stops round-tripping.
    """
    from tools.api.routers import student as mod
    attempts = []

    async def _sm2(cid, interval, ease, reps, due): pass
    async def _profile(_sid): return {"xp": 90}
    async def _update_profile(_sid, **k): pass
    async def _attempt(**k): attempts.append(k)

    monkeypatch.setattr(mod, "update_card_sm2", _sm2)
    monkeypatch.setattr(mod, "get_profile", _profile)
    monkeypatch.setattr(mod, "update_profile", _update_profile)
    monkeypatch.setattr(mod.db, "insert_flashcard_attempt", _attempt)

    body = {"xp_delta": 58, "results": [
        {"card_id": "f1", "correct": True, "repetitions": 0, "easiness": 2.5,
         "interval_days": 1, "topic_tag": "iop_nct", "score": 12},
        {"card_id": "f2", "correct": False, "repetitions": 2, "easiness": 2.4,
         "interval_days": 6, "topic_tag": "iop_nct", "score": 2},
    ]}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.post("/api/flashcards/complete", json=body, headers=auth_headers(role="OA"))
    assert r.status_code == 200
    assert len(attempts) >= 1
    assert attempts[0] == {"student_id": "stud-test", "card_id": "f1",
                           "topic_tag": "iop_nct", "correct": True, "score": 12}


@pytest.mark.asyncio
async def test_complete_without_topic_tag_writes_no_attempts(monkeypatch):
    """The failure mode this task fixes, pinned so nobody re-introduces it by accident.

    A payload with no topic_tag succeeds (200, never 422) and persists nothing but XP --
    no attempt row, no per-topic retention write. That silence is exactly how
    flashcard_attempts reached 0 rows in production. The server-side filter is KEPT: an
    attempt with no topic cannot be bucketed by any P2 aggregation, so writing it would
    only add junk. The frontend is the side that must send it, and CompleteCardResult now
    makes omitting it a typecheck error rather than a silent data loss.
    """
    from tools.api.routers import student as mod
    attempts, profile_updates = [], []

    async def _sm2(cid, interval, ease, reps, due): pass
    async def _profile(_sid): return {"xp": 10}
    async def _update_profile(_sid, **k): profile_updates.append(k)
    async def _attempt(**k): attempts.append(k)

    monkeypatch.setattr(mod, "update_card_sm2", _sm2)
    monkeypatch.setattr(mod, "get_profile", _profile)
    monkeypatch.setattr(mod, "update_profile", _update_profile)
    monkeypatch.setattr(mod.db, "insert_flashcard_attempt", _attempt)

    body = {"xp_delta": 30, "results": [
        {"card_id": "f1", "correct": True, "repetitions": 0, "easiness": 2.5, "interval_days": 1},
    ]}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.post("/api/flashcards/complete", json=body, headers=auth_headers(role="OA"))
    assert r.status_code == 200
    assert attempts == []
    assert profile_updates == [{"xp_delta": 30}]
