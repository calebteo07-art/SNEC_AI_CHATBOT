"""The daily check-in draws from the student's own flashcard bank.

One easy, single-answer card per day, rotated over EVERY topic in the role's
scope (Foundations + its procedural pool) rather than a separate hand-authored
pool — so the check-in can never drift out of sync with what the student studies.

Two invariants carry the feature:
- **Scope.** An OT student is never asked a CLINICAL-only question and vice
  versa; both share Foundations. Scope is enforced when the question is SERVED.
- **Grading.** The answer POST resolves the card from its `question_id` alone —
  no per-worker cache, no trust in the client — and grades by option TEXT, so
  every id must map to exactly one correct answer.

Every test stubs the DB. `_forbid_real_supabase` is the backstop: an unstubbed
db call on a box with a populated .env would read/write PRODUCTION Supabase.
"""
import sys
from collections import Counter
from datetime import date, timedelta
from unittest.mock import patch

import pytest
from httpx import AsyncClient, ASGITransport

from tests.api.conftest import auth_headers
from tools.api.server import app
from tools.checkin.question_pool import CHECKIN_DIFFICULTY, checkin_pool, find_card, question_id
from tools.flashcards.flashcard_sets import FLASHCARD_TOPICS, label_for, pools_for
from tools.flashcards.static_cards import FLASHCARDS
from tools.shared.static_pools import pick_by_day_count

ROLES = ("OA", "PSA", "OT")

# Every endpoint test pins the clock: which card today's rotation lands on is a
# function of the date, so an unpinned test asserts something different every day.
# On THIS day each role lands on a topic only that role studies (OA/PSA on
# fall_risk, OT on pam) — so serving the wrong role's pool cannot slip through on a
# shared Foundations card. test_the_pinned_day_can_detect_a_scope_leak guards it.
DAY = date(2026, 3, 10)


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


def _stub(monkeypatch, role="OA"):
    """Stub the two DB seams the check-in endpoints touch."""
    from tools.api.routers import checkin as mod

    async def _profile(_sid): return {"role": role}
    async def _update(_sid, **_kw): return None

    monkeypatch.setattr(mod, "get_profile", _profile)
    monkeypatch.setattr(mod, "update_profile", _update)


async def _question(role="OA", sub="stud-test", day=DAY):
    with patch("tools.api.routers.checkin.app_today", return_value=day):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
            return await ac.get("/api/checkin/question", headers=auth_headers(role=role, sub=sub))


async def _answer(question_id_, answer, role="OA", sub="stud-test"):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        return await ac.post("/api/checkin/answer",
                             json={"question_id": question_id_, "answer": answer},
                             headers=auth_headers(role=role, sub=sub))


def _expected_pool(role):
    """The role's easy single-answer cards, walked straight off the bank — an
    independent path to the same set, so a scoping or filter regression in
    checkin_pool cannot hide behind its own helper."""
    return [
        c
        for pool in pools_for(role)
        for topic_key, _ in FLASHCARD_TOPICS[pool]
        for c in FLASHCARDS[pool][topic_key].get(CHECKIN_DIFFICULTY, [])
        if c["qtype"] == "single" and len(c["correct"]) == 1
    ]


def _correct_text(card):
    return card["options"][card["correct"][0]]


def _expected_card(role, sub="stud-test", day=DAY):
    """The card the role's pool + daily rotation must produce for this student."""
    pool = checkin_pool(role)
    return pool[pick_by_day_count(sub, len(pool), "checkin", today=day)]


# ── The pool: every topic in scope, nothing out of it ───────────────────────

@pytest.mark.parametrize("role", ROLES)
def test_the_pool_is_the_easy_tier_of_every_topic_in_scope(role):
    assert [c["stem"] for c in checkin_pool(role)] == [c["stem"] for c in _expected_pool(role)]


@pytest.mark.parametrize("role", ROLES)
def test_the_pool_spans_every_topic_the_role_studies(role):
    served = {c["topic_tag"] for c in checkin_pool(role)}
    expected = {key for pool in pools_for(role) for key, _ in FLASHCARD_TOPICS[pool]}
    assert served == expected, "the check-in must rotate over ALL of the role's topics"


def test_an_ot_student_is_never_asked_a_clinical_only_question():
    clinical_only = {key for key, _ in FLASHCARD_TOPICS["CLINICAL"]}
    assert not {c["topic_tag"] for c in checkin_pool("OT")} & clinical_only


def test_an_oa_student_is_never_asked_an_ot_only_question():
    ot_only = {key for key, _ in FLASHCARD_TOPICS["OT"]}
    assert not {c["topic_tag"] for c in checkin_pool("OA")} & ot_only


def test_both_roles_share_the_foundations_topics():
    foundations = {key for key, _ in FLASHCARD_TOPICS["FOUNDATIONS"]}
    for role in ("OA", "OT"):
        assert foundations <= {c["topic_tag"] for c in checkin_pool(role)}


def test_psa_studies_the_same_pool_as_oa():
    assert [c["stem"] for c in checkin_pool("PSA")] == [c["stem"] for c in checkin_pool("OA")]


# ── Every served card must be gradeable ─────────────────────────────────────

@pytest.mark.parametrize("role", ROLES)
def test_every_card_is_a_single_answer_mcq_with_distinct_options(role):
    """The UI submits on tap and reveals ONE correct option, and grading compares
    option TEXT — a multi-answer card or a repeated option text would mis-mark."""
    for card in checkin_pool(role):
        assert card["qtype"] == "single" and len(card["correct"]) == 1
        assert card["difficulty"] == CHECKIN_DIFFICULTY
        opts = card["options"]
        assert len(opts) >= 2 and len(set(opts)) == len(opts), card["stem"]


def test_a_question_id_never_maps_to_two_different_answers():
    """Ids are derived from the stem, so a duplicate stem is only safe while both
    copies agree on the answer. If that ever breaks, grading silently mis-marks."""
    answers: dict[str, set[str]] = {}
    for role in ("OA", "OT"):
        for card in checkin_pool(role):
            answers.setdefault(question_id(card["stem"]), set()).add(_correct_text(card))
    ambiguous = {qid: texts for qid, texts in answers.items() if len(texts) > 1}
    assert not ambiguous, f"colliding question ids: {ambiguous}"


@pytest.mark.parametrize("role", ROLES)
def test_every_card_in_the_pool_is_resolvable_by_its_id(role):
    for card in checkin_pool(role):
        found = find_card(question_id(card["stem"]))
        assert found is not None and _correct_text(found) == _correct_text(card)


def test_an_unknown_id_resolves_to_nothing():
    assert find_card("deadbeef") is None


# ── Rotation: shuffled across the whole pool ────────────────────────────────

@pytest.mark.parametrize("role", ROLES)
def test_a_student_cycles_the_whole_pool_before_any_repeat(role):
    pool = checkin_pool(role)
    picks = [pick_by_day_count("stud-1", len(pool), "checkin", today=date(2026, 1, 1) + timedelta(days=d))
             for d in range(len(pool))]
    assert len(set(picks)) == len(pool), "a card must not repeat within one full cycle"


def test_consecutive_days_ask_different_questions():
    pool = checkin_pool("OA")
    picks = [pick_by_day_count("stud-1", len(pool), "checkin", today=date(2026, 1, 1) + timedelta(days=d))
             for d in range(14)]
    assert len(set(picks)) == 14


def test_two_students_get_different_questions_on_the_same_day():
    pool = checkin_pool("OA")
    day = date(2026, 3, 9)
    picks = {pick_by_day_count(f"stud-{i}", len(pool), "checkin", today=day) for i in range(12)}
    assert len(picks) > 1, "the rotation must be per-student, not one global question"


# ── Serving and grading through the endpoints ───────────────────────────────

def test_the_pinned_day_can_detect_a_scope_leak():
    """The endpoint tests below are only meaningful while each role's card for DAY
    belongs to a topic ONLY that role studies. Re-authoring the bank shifts the
    rotation, so this asserts the fixture still has teeth instead of letting the
    scope tests quietly start passing on a shared Foundations card."""
    ot_only = {key for key, _ in FLASHCARD_TOPICS["OT"]}
    clinical_only = {key for key, _ in FLASHCARD_TOPICS["CLINICAL"]}
    assert _expected_card("OT")["topic_tag"] in ot_only
    assert _expected_card("OA")["topic_tag"] in clinical_only


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ROLES)
async def test_the_daily_question_is_the_role_pools_card_for_that_day(monkeypatch, role):
    """Pins the whole serve path: the right pool, the shared rotation, the id."""
    _stub(monkeypatch, role=role)
    r = await _question(role=role)
    assert r.status_code == 200
    body = r.json()
    expected = _expected_card(role)
    assert body["question"] == expected["stem"]
    assert body["question_id"] == question_id(expected["stem"])
    assert sorted(body["options"]) == sorted(expected["options"]), "same options, any order"


@pytest.mark.asyncio
async def test_an_ot_student_is_never_served_a_clinical_question(monkeypatch):
    """Scope holds day after day, not just on the pinned one."""
    _stub(monkeypatch, role="OT")
    clinical_only = {key for key, _ in FLASHCARD_TOPICS["CLINICAL"]}
    for d in range(10):
        body = (await _question(role="OT", sub=f"ot-{d}", day=DAY + timedelta(days=d))).json()
        assert find_card(body["question_id"])["topic_tag"] not in clinical_only


@pytest.mark.asyncio
async def test_an_oa_student_is_never_served_an_investigations_question(monkeypatch):
    _stub(monkeypatch, role="OA")
    ot_only = {key for key, _ in FLASHCARD_TOPICS["OT"]}
    for d in range(10):
        body = (await _question(role="OA", sub=f"oa-{d}", day=DAY + timedelta(days=d))).json()
        assert find_card(body["question_id"])["topic_tag"] not in ot_only


@pytest.mark.asyncio
async def test_the_topic_chip_shows_the_human_readable_label(monkeypatch):
    _stub(monkeypatch, role="OT")
    body = (await _question(role="OT")).json()
    card = find_card(body["question_id"])
    assert body["topic"] == label_for("OT", card["topic_tag"])
    assert "_" not in body["topic"], "the raw topic_key must never reach the UI"


@pytest.mark.asyncio
async def test_the_correct_option_grades_correct(monkeypatch):
    _stub(monkeypatch)
    body = (await _question()).json()
    correct = _correct_text(find_card(body["question_id"]))
    r = await _answer(body["question_id"], correct)
    assert r.status_code == 200
    data = r.json()
    assert data["correct"] is True
    assert data["correct_answer"] == correct
    assert data["feedback"], "the card's explanation is the feedback"


@pytest.mark.asyncio
async def test_a_wrong_option_grades_wrong_and_still_reveals_the_answer(monkeypatch):
    _stub(monkeypatch)
    body = (await _question()).json()
    card = find_card(body["question_id"])
    correct = _correct_text(card)
    wrong = next(o for o in card["options"] if o != correct)
    data = (await _answer(body["question_id"], wrong)).json()
    assert data["correct"] is False
    assert data["correct_answer"] == correct


@pytest.mark.asyncio
async def test_grading_reads_the_correct_index_not_the_first_option(monkeypatch):
    """Most cards author the answer first, but a handful do not — grading must read
    `correct`, not assume slot 0, or those cards mark exactly backwards."""
    _stub(monkeypatch)
    card = next(c for c in checkin_pool("OA") if c["correct"][0] != 0)
    qid = question_id(card["stem"])
    assert (await _answer(qid, _correct_text(card))).json()["correct"] is True
    assert (await _answer(qid, card["options"][0])).json()["correct"] is False


@pytest.mark.asyncio
async def test_grading_survives_a_cold_worker(monkeypatch):
    """The answer POST can land on a worker that never served the question, so the
    id must resolve from the bank alone — not from the per-worker daily cache."""
    _stub(monkeypatch)
    body = (await _question()).json()

    from tools.api.routers.checkin import _question_cache
    _question_cache.clear()

    correct = _correct_text(find_card(body["question_id"]))
    assert (await _answer(body["question_id"], correct)).json()["correct"] is True


@pytest.mark.asyncio
async def test_an_unknown_question_id_is_rejected(monkeypatch):
    _stub(monkeypatch)
    r = await _answer("not-a-card", "Acute glaucoma")
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_the_served_options_are_not_the_authored_order(monkeypatch):
    """The bank authors the correct option FIRST. Serving that order verbatim would
    park the answer in slot A nearly every day — guessable without reading the stem.
    (A shuffle is its own identity 1 in 24 times; if re-authoring the bank ever lands
    this pinned student/day on one, it fails loudly rather than hiding a regression.)"""
    _stub(monkeypatch)
    body = (await _question()).json()
    assert body["options"] != _expected_card("OA")["options"]


@pytest.mark.asyncio
async def test_the_correct_answer_moves_through_every_slot(monkeypatch):
    """Across students the answer must reach all four slots. The seed is
    (student, question, day), so these counts are fixed, not sampled: shuffled
    spreads 20 students over 4 slots (max 7); the authored order puts 19 of the
    20 in slot A and never reaches slot B or D."""
    _stub(monkeypatch)
    slots: list[int] = []
    for i in range(20):
        body = (await _question(sub=f"stud-{i}")).json()
        correct = _correct_text(find_card(body["question_id"]))
        slots.append(body["options"].index(correct))
    assert set(slots) == {0, 1, 2, 3}, f"the answer never reached every slot: {sorted(set(slots))}"
    assert max(Counter(slots).values()) <= 10, f"the answer clusters in one slot: {Counter(slots)}"
