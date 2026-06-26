# Flashcards v2 — MCQ bank, 3 tiers, instant scoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn flashcards into an MCQ / multi-select bank with 3 difficulty tiers, a deeper question pool, per-question model-answer reveal, instant deterministic deck scoring, and a few compulsory background-graded typed-reasoning cards per deck.

**Architecture:** The static pool (`tools/flashcards/static_cards.py`) is the single source of truth for question content; cards become self-contained MCQs. The browser grades MCQ correctness instantly (no AI in the loop) and shows the model answer per card. A handful of cards per deck (~1 per 5, any difficulty) carry a compulsory typed box graded by one fast background call to the existing `/api/flashcards/check`. The deck ends on a client-computed results screen ("X / N correct" + weak topics). No DB migration: progress stays keyed on the question stem; review-mode rehydrates options from the pool by stem.

**Tech Stack:** Python 3.12 / FastAPI (backend), pytest (`MOCK_MODE`), Next.js 16 / React 19 / TanStack Query (frontend), Playwright Node harness (`frontend/tests/aurora_assert.mjs`).

**Spec:** `docs/superpowers/specs/2026-06-26-flashcards-mcq-v2-design.md`

**Scope note — tutor-seeded cards:** The flashcards screen has a second entry path: free-text `{front, back}` cards handed in from a Tutor chat via `sessionStorage` (`loadSessionCards`). Those have no options, so they render in a **flip-to-reveal + self-mark ("Got it" / "Missed it")** fallback — deterministic, no AI, no MCQ. Only the static pool is true MCQ. This keeps that path working without the slow grader.

---

## Data shapes (single source of truth for every task)

**Authored static card** (in `static_cards.py`):
```python
{
  "stem": str,                       # the question
  "options": list[str],              # >= 2 option strings
  "correct": list[int],              # indices into options; single -> len 1, multi -> len >= 2
  "qtype": "single" | "multi",
  "kind": "theory" | "practical",
  "explanation": str,                # model answer shown on reveal
  "reasoning_eligible": bool,        # default False; a good "explain why" question?
}
```

**Served card** (API response + frontend internal), adds runtime fields:
```python
card_id, stem, options, correct, qtype, kind, explanation,
requires_explanation: bool,          # set by generate on ~round(n/5) eligible cards
topic_tag, difficulty,
repetitions, easiness, interval_days  # SM-2 passthrough
```

**Frontend internal `Flashcard`** (camelCase `requiresExplanation`; otherwise same field names).

---

# Phase A — Backend data model & taxonomy

### Task 1: Add the "hard" difficulty tier

**Files:**
- Modify: `tools/flashcards/flashcard_sets.py:16`
- Test: `tests/flashcards/test_flashcard_sets.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# tests/flashcards/test_flashcard_sets.py
from tools.flashcards.flashcard_sets import DIFFICULTIES, sets_for, make_set_key


def test_three_difficulty_tiers():
    assert DIFFICULTIES == ["easy", "medium", "hard"]


def test_sets_for_has_three_tiers_per_topic():
    sets = sets_for("OA")  # CLINICAL pool, 15 topics
    assert len(sets) == 15 * 3
    keys = {s["set_key"] for s in sets}
    assert make_set_key("triage", "hard") in keys


def test_ot_pool_separate_from_clinical():
    ot = {s["topic_key"] for s in sets_for("OT")}
    clinical = {s["topic_key"] for s in sets_for("OA")}
    assert ot.isdisjoint(clinical)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/flashcards/test_flashcard_sets.py -q`
Expected: FAIL on `test_three_difficulty_tiers` (DIFFICULTIES is `["easy", "medium"]`).

- [ ] **Step 3: Implement**

In `tools/flashcards/flashcard_sets.py` change line 16:
```python
DIFFICULTIES: list[str] = ["easy", "medium", "hard"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/flashcards/test_flashcard_sets.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/flashcards/flashcard_sets.py tests/flashcards/test_flashcard_sets.py
git commit -m "feat(flashcards): add hard difficulty tier (3 tiers per topic)"
```

---

### Task 2: New MCQ card schema + serving helpers + integrity guard

Rewrites the card shape and the serving helpers in `static_cards.py` so they pass MCQ
fields through. The big authored content lands in Task 3; here we change the structure
and add the structural integrity test, seeding **one** small set so the helpers have data.

**Files:**
- Modify: `tools/flashcards/static_cards.py` (the `FLASHCARDS` dict + `_tag`/`get_set_cards`/`get_all_cards`/`set_card_counts`)
- Test: `tests/flashcards/test_static_cards_integrity.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# tests/flashcards/test_static_cards_integrity.py
import pytest
from tools.flashcards.flashcard_sets import FLASHCARD_TOPICS, DIFFICULTIES
from tools.flashcards.static_cards import FLASHCARDS, get_set_cards, get_all_cards


def _all_authored():
    for pool, topics in FLASHCARDS.items():
        for topic_key, by_diff in topics.items():
            for difficulty, cards in by_diff.items():
                for c in cards:
                    yield pool, topic_key, difficulty, c


def test_every_card_is_a_valid_mcq():
    seen_any = False
    for pool, topic_key, difficulty, c in _all_authored():
        seen_any = True
        assert isinstance(c["stem"], str) and c["stem"].strip(), (topic_key, difficulty)
        assert isinstance(c["options"], list) and len(c["options"]) >= 2, c["stem"]
        assert c["qtype"] in ("single", "multi"), c["stem"]
        assert c["kind"] in ("theory", "practical"), c["stem"]
        assert isinstance(c["explanation"], str) and c["explanation"].strip(), c["stem"]
        assert all(0 <= i < len(c["options"]) for i in c["correct"]), c["stem"]
        if c["qtype"] == "single":
            assert len(c["correct"]) == 1, c["stem"]
        else:
            assert len(c["correct"]) >= 2, c["stem"]
        assert isinstance(c.get("reasoning_eligible", False), bool), c["stem"]
    assert seen_any, "no authored cards found"


def test_no_duplicate_stems_within_a_set():
    for pool, topics in FLASHCARDS.items():
        for topic_key, by_diff in topics.items():
            for difficulty, cards in by_diff.items():
                stems = [c["stem"] for c in cards]
                assert len(stems) == len(set(stems)), (topic_key, difficulty)


def test_get_set_cards_tags_topic_and_difficulty():
    cards = get_all_cards("OA")
    if cards:
        c = cards[0]
        assert "topic_tag" in c and "difficulty" in c
        assert "options" in c and "correct" in c
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/flashcards/test_static_cards_integrity.py -q`
Expected: FAIL — current cards are `{front, back}`, no `options`/`qtype`.

- [ ] **Step 3: Implement — replace the `FLASHCARDS` structure and serving helpers**

Replace the entire `FLASHCARDS` dict in `tools/flashcards/static_cards.py` with the new
MCQ shape. For this task seed just **one** set so the helpers have data (the rest is
Task 3). Keep the module docstring but update it to describe MCQ. Example seed:

```python
FLASHCARDS: dict[str, dict[str, dict[str, list[dict]]]] = {
    "CLINICAL": {
        "triage": {
            "easy": [
                {
                    "stem": "Within how long must a Triage Category 1 case be seen?",
                    "options": ["Within 10 minutes", "Within 30 minutes",
                                "Within 60 minutes", "Within 2 hours"],
                    "correct": [0],
                    "qtype": "single",
                    "kind": "theory",
                    "explanation": "Category 1 is the most urgent — it must be seen "
                                   "within 10 minutes (e.g. chemical burn, CRAO).",
                    "reasoning_eligible": False,
                },
            ],
            "medium": [],
            "hard": [],
        },
    },
    "OT": {},
}
```

Then rewrite the serving helpers at the bottom of the file so they pass MCQ fields
through (replace `_tag`, `get_set_cards`, `get_all_cards`, `set_card_counts`):

```python
# ── Serving helpers ──────────────────────────────────────────────────────────

_PASSTHROUGH = ("stem", "options", "correct", "qtype", "kind",
                "explanation", "reasoning_eligible")


def _tag(topic_key: str, difficulty: str, card: dict) -> dict:
    out = {k: card[k] for k in _PASSTHROUGH if k in card}
    out["reasoning_eligible"] = bool(card.get("reasoning_eligible", False))
    out["topic_tag"] = topic_key
    out["difficulty"] = difficulty
    return out


def get_set_cards(role: str, topic_key: str, difficulty: str) -> list[dict]:
    """Cards for one (topic, difficulty) set, tagged for serving."""
    pool = FLASHCARDS.get(pool_for_role(role), {})
    cards = pool.get(topic_key, {}).get(difficulty, [])
    return [_tag(topic_key, difficulty, c) for c in cards]


def get_all_cards(role: str) -> list[dict]:
    """Every authored card for a role's pool (used by the no-arg rotation)."""
    pool = FLASHCARDS.get(pool_for_role(role), {})
    out: list[dict] = []
    for topic_key, _ in topics_for(role):
        by_diff = pool.get(topic_key, {})
        for difficulty in DIFFICULTIES:
            for c in by_diff.get(difficulty, []):
                out.append(_tag(topic_key, difficulty, c))
    return out


def set_card_counts(role: str) -> dict[str, int]:
    """{set_key: number of authored cards} for every set in the role's pool."""
    pool = FLASHCARDS.get(pool_for_role(role), {})
    counts: dict[str, int] = {}
    for topic_key, _ in topics_for(role):
        by_diff = pool.get(topic_key, {})
        for difficulty in DIFFICULTIES:
            counts[make_set_key(topic_key, difficulty)] = len(by_diff.get(difficulty, []))
    return counts


def card_by_stem(role: str) -> dict[str, dict]:
    """{stem: tagged card} index for the role pool — used to rehydrate MCQ fields
    onto SM-2 due cards (which the DB stores only as front/back)."""
    return {c["stem"]: c for c in get_all_cards(role)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/flashcards/test_static_cards_integrity.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/flashcards/static_cards.py tests/flashcards/test_static_cards_integrity.py
git commit -m "feat(flashcards): MCQ card schema + serving helpers + integrity guard"
```

---

### Task 3: Author the template topics (~12 per tier, MCQ)

Convert the existing KB-grounded content into MCQ form for the two required template
topics, **`triage` (CLINICAL)** and **`oct_macula` (OT)**, at ~12 questions per tier
across easy/medium/hard. Reuse the clinical facts already in the current (pre-change)
`static_cards.py` content and the spec's authoring guidance. Mix `kind` theory/practical;
tag a healthy share `reasoning_eligible: True` (aim ~3-4 per tier) so deck assembly always
has eligible cards.

**Files:**
- Modify: `tools/flashcards/static_cards.py` (`FLASHCARDS["CLINICAL"]["triage"]`, `FLASHCARDS["OT"]["oct_macula"]`)
- Test: `tests/flashcards/test_template_topics.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# tests/flashcards/test_template_topics.py
from tools.flashcards.static_cards import get_set_cards


TEMPLATE = [("OA", "triage"), ("OT", "oct_macula")]


def test_template_topics_are_deep():
    for role, topic in TEMPLATE:
        for difficulty in ("easy", "medium", "hard"):
            cards = get_set_cards(role, topic, difficulty)
            assert len(cards) >= 10, (role, topic, difficulty, len(cards))


def test_template_topics_have_eligible_reasoning_cards():
    for role, topic in TEMPLATE:
        for difficulty in ("easy", "medium", "hard"):
            cards = get_set_cards(role, topic, difficulty)
            assert any(c["reasoning_eligible"] for c in cards), (role, topic, difficulty)


def test_template_topics_have_a_multi_select():
    # at least one multi-select somewhere in each template topic
    for role, topic in TEMPLATE:
        all_cards = []
        for difficulty in ("easy", "medium", "hard"):
            all_cards += get_set_cards(role, topic, difficulty)
        assert any(c["qtype"] == "multi" for c in all_cards), (role, topic)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/flashcards/test_template_topics.py -q`
Expected: FAIL — only one stub card exists from Task 2.

- [ ] **Step 3: Implement — author the cards**

Author ~12 MCQs per tier for `triage` and `oct_macula`. Ground every fact in the existing
content (see the pre-change `triage` / `oct_macula` front/back pairs) and the KB. Follow
the Task 2 schema exactly. Include per topic: a spread of `kind` values, ~3-4
`reasoning_eligible: True` per tier, and at least one `qtype: "multi"` (e.g. "Select ALL
Category 1 emergencies"). Worked example (one hard, reasoning-eligible, multi):

```python
{
    "stem": "Select ALL conditions that are Triage Category 1 (seen within 10 minutes).",
    "options": ["Chemical eye burn", "Central retinal artery occlusion (CRAO)",
                "Conjunctivitis", "Stable chronic glaucoma review"],
    "correct": [0, 1],
    "qtype": "multi",
    "kind": "practical",
    "explanation": "Chemical burns and CRAO are sight-threatening emergencies needing "
                   "treatment within minutes. Conjunctivitis and a stable glaucoma review "
                   "are routine (Category 4).",
    "reasoning_eligible": True,
},
```

The integrity guard from Task 2 already enforces structural validity; run it alongside.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/flashcards/test_template_topics.py tests/flashcards/test_static_cards_integrity.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/flashcards/static_cards.py tests/flashcards/test_template_topics.py
git commit -m "feat(flashcards): author triage + macular OCT template topics (MCQ, 3 tiers)"
```

---

### Task 4: Typed-card selection helper (`typed_count` + marker)

**Files:**
- Modify: `tools/flashcards/flashcard_sets.py` (append `typed_count`)
- Modify: `tools/flashcards/static_cards.py` (append `mark_typed_cards`)
- Test: `tests/flashcards/test_typed_selection.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# tests/flashcards/test_typed_selection.py
from tools.flashcards.flashcard_sets import typed_count
from tools.flashcards.static_cards import mark_typed_cards


def test_typed_count_is_about_one_per_five():
    assert typed_count(5) == 1
    assert typed_count(10) == 2
    assert typed_count(20) == 4
    assert typed_count(0) == 0


def test_mark_typed_only_marks_eligible_and_caps_count():
    deck = [
        {"stem": "a", "reasoning_eligible": True},
        {"stem": "b", "reasoning_eligible": False},
        {"stem": "c", "reasoning_eligible": True},
        {"stem": "d", "reasoning_eligible": True},
    ]
    out = mark_typed_cards(deck, n=10)  # typed_count(10) == 2
    typed = [c for c in out if c.get("requires_explanation")]
    assert len(typed) == 2
    assert all(c["reasoning_eligible"] for c in typed)
    # non-eligible card never marked
    assert not next(c for c in out if c["stem"] == "b").get("requires_explanation")


def test_mark_typed_handles_too_few_eligible():
    deck = [{"stem": "a", "reasoning_eligible": True},
            {"stem": "b", "reasoning_eligible": False}]
    out = mark_typed_cards(deck, n=20)  # wants 4, only 1 eligible
    typed = [c for c in out if c.get("requires_explanation")]
    assert len(typed) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/flashcards/test_typed_selection.py -q`
Expected: FAIL — `typed_count` / `mark_typed_cards` undefined.

- [ ] **Step 3: Implement**

Append to `tools/flashcards/flashcard_sets.py`:
```python
def typed_count(n: int) -> int:
    """How many typed-reasoning cards a deck of `n` should have (~1 per 5)."""
    return round(n / 5)
```

Append to `tools/flashcards/static_cards.py`:
```python
def mark_typed_cards(deck: list[dict], n: int) -> list[dict]:
    """Set requires_explanation=True on ~round(n/5) of the eligible cards in `deck`,
    spread across the deck. Mutates in place and returns the deck."""
    from tools.flashcards.flashcard_sets import typed_count
    want = typed_count(n)
    for c in deck:
        c["requires_explanation"] = False
    eligible = [i for i, c in enumerate(deck) if c.get("reasoning_eligible")]
    if not eligible or want <= 0:
        return deck
    take = min(want, len(eligible))
    # spread the picks evenly across the eligible indices
    step = len(eligible) / take
    chosen = {eligible[int(k * step)] for k in range(take)}
    for i in chosen:
        deck[i]["requires_explanation"] = True
    return deck
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/flashcards/test_typed_selection.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/flashcards/flashcard_sets.py tools/flashcards/static_cards.py tests/flashcards/test_typed_selection.py
git commit -m "feat(flashcards): typed-card selection (~1 per 5, eligible-only)"
```

---

# Phase B — Backend endpoints (`tools/api/routers/student.py`)

### Task 5: `generate` returns MCQ shape + marks typed cards

**Files:**
- Modify: `tools/api/routers/student.py` (the `Flashcard` model → `FlashcardOut`; the `flashcards_generate` handler at `:262`)
- Test: `tests/api/test_flashcards_generate_mcq.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_flashcards_generate_mcq.py
import os
os.environ.setdefault("MOCK_MODE", "1")
import pytest
from httpx import AsyncClient, ASGITransport
from tools.api.server import app
from tests.api.conftest import auth_headers  # reuse existing helper; see note below


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
```

> **Note:** if `tests/api/conftest.py` lacks an `auth_headers` helper, add one that mints a
> JWT via `tools.shared.jwt_utils` with `{"sub": "stud-test", "role": role}` and returns
> `{"Cookie": f"eyebot_token={token}"}` (match how other API tests authenticate — grep
> `tests/api` for the existing pattern first and reuse it).

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/api/test_flashcards_generate_mcq.py -q`
Expected: FAIL — response items still have `front`/`back`, not `stem`/`options`.

- [ ] **Step 3: Implement**

In `tools/api/routers/student.py`:

1. Replace the `Flashcard` response model (`:60`) with `FlashcardOut`:
```python
class FlashcardOut(BaseModel):
    card_id: str
    stem: str
    options: list[str]
    correct: list[int]
    qtype: str
    kind: str
    explanation: str
    requires_explanation: bool = False
    topic_tag: str
    difficulty: str = ""
    repetitions: int = 0
    easiness: float = 2.5
    interval_days: int = 0
```

2. Add imports at the top of the file:
```python
from tools.flashcards.static_cards import (
    get_set_cards, get_all_cards, set_card_counts, mark_typed_cards, card_by_stem,
)
```
(remove the old `get_set_cards, get_all_cards, set_card_counts` import line and replace it
with this expanded one).

3. Rewrite `flashcards_generate` (`:262`). Key changes: insert maps stem→front /
explanation→back for no-repeat + SM-2; the response is built from the pool card merged
with the inserted `card_id`; `mark_typed_cards` runs on the final deck. Replace the body:

```python
@router.get("/api/flashcards/generate", response_model=list[FlashcardOut])
@limiter.limit("10/minute")
async def flashcards_generate(
    request: Request,
    topic: str | None = None,
    difficulty: str | None = None,
    set_key: str | None = None,
    n: int = 6,
    current_user: CurrentUser = Depends(get_current_user),
):
    student_id = current_user["sub"]
    n = max(1, min(20, n))
    role = ""
    try:
        role = (await get_profile(student_id)).get("role", "")
    except Exception:
        pass

    if set_key and not (topic and difficulty):
        topic, difficulty = split_set_key(set_key)

    def _to_out(pool_card: dict, card_id: str) -> dict:
        return {
            "card_id": card_id,
            "stem": pool_card["stem"],
            "options": pool_card["options"],
            "correct": pool_card["correct"],
            "qtype": pool_card["qtype"],
            "kind": pool_card["kind"],
            "explanation": pool_card["explanation"],
            "requires_explanation": pool_card.get("requires_explanation", False),
            "topic_tag": pool_card.get("topic_tag", topic or "general"),
            "difficulty": pool_card.get("difficulty", difficulty or ""),
            "repetitions": pool_card.get("repetitions", 0),
            "easiness": pool_card.get("easiness", 2.5),
            "interval_days": pool_card.get("interval_days", 0),
        }

    async def _persist(pool_cards: list[dict]) -> list[dict]:
        # DB stores stem->front, explanation->back for no-repeat + SM-2 only.
        rows = [{"front": c["stem"], "back": c["explanation"],
                 "topic_tag": c.get("topic_tag", "general"), "source": "static"}
                for c in pool_cards]
        saved = await insert_cards(student_id, rows)
        return [_to_out(pc, sv["card_id"]) for pc, sv in zip(pool_cards, saved)]

    # A specific set → serve that set with no-repeat rotation.
    if topic and difficulty:
        pool = get_set_cards(role, topic, difficulty)
        if not pool:
            return []
        served = await get_served_static_fronts(student_id)
        served_idx = {i for i, c in enumerate(pool) if c["stem"] in served}
        picks = pick_next_unseen(student_id, len(pool), f"flash_{topic}_{difficulty}",
                                 served_idx, n=min(n, len(pool)))
        out = await _persist([pool[i] for i in picks])
        return mark_typed_cards(out, n)

    # Mixed / review → SM-2 due first (rehydrated from pool by stem), then top up.
    out: list[dict] = []
    try:
        due = await get_due_cards(student_id, limit=n)
    except Exception:
        due = []
    index = card_by_stem(role)
    for d in due:
        pc = index.get(d.get("front", ""))
        if pc:
            merged = {**pc, "repetitions": d.get("repetitions", 0),
                      "easiness": d.get("easiness", 2.5),
                      "interval_days": d.get("interval_days", 0)}
            out.append(_to_out(merged, d["card_id"]))
    if len(out) < n:
        pool = get_all_cards(role)
        if pool:
            served = await get_served_static_fronts(student_id)
            served_idx = {i for i, c in enumerate(pool) if c["stem"] in served}
            picks = pick_next_unseen(student_id, len(pool), "flashcards",
                                     served_idx, n=(n - len(out)))
            out += await _persist([pool[i] for i in picks])
    return mark_typed_cards(out, n)
```

> Note: `insert_cards` already accepts `front`/`back`/`topic_tag`/`source` and returns
> `card_id` (see `tools/flashcards/flashcard_store.py:15`). No store change needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/api/test_flashcards_generate_mcq.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/student.py tests/api/test_flashcards_generate_mcq.py
git commit -m "feat(flashcards): generate serves MCQ shape + marks typed cards"
```

---

### Task 6: `complete` endpoint (batched SM-2 + XP)

**Files:**
- Modify: `tools/api/routers/student.py` (add models + handler; keep `/check` untouched)
- Test: `tests/api/test_flashcards_complete.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_flashcards_complete.py
import os
os.environ.setdefault("MOCK_MODE", "1")
import pytest
from httpx import AsyncClient, ASGITransport
from tools.api.server import app
from tests.api.conftest import auth_headers


@pytest.mark.asyncio
async def test_complete_updates_sm2_and_returns_xp(monkeypatch):
    from tools.api.routers import student as mod
    calls = []

    async def _update(cid, interval, ease, reps, due):
        calls.append((cid, reps))
    async def _profile(_sid):
        return {"xp": 120, "hearts": 5}
    async def _update_profile(*a, **k):
        return None
    monkeypatch.setattr(mod, "update_card_sm2", _update)
    monkeypatch.setattr(mod, "get_profile", _profile)
    monkeypatch.setattr(mod, "update_profile", _update_profile)
    # force the synchronous SM-2 path (no Celery in tests)
    monkeypatch.setattr(mod, "_dispatch_sm2", None, raising=False)

    body = {"xp_delta": 23, "results": [
        {"card_id": "c1", "correct": True, "repetitions": 0, "easiness": 2.5, "interval_days": 0},
        {"card_id": "c2", "correct": False, "repetitions": 2, "easiness": 2.4, "interval_days": 6},
    ]}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.post("/api/flashcards/complete", json=body, headers=auth_headers(role="OA"))
    assert r.status_code == 200
    assert r.json()["xp"] == 120
    assert len(calls) == 2  # both cards scheduled
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/api/test_flashcards_complete.py -q`
Expected: FAIL — 404, endpoint not defined.

- [ ] **Step 3: Implement**

Add to `tools/api/routers/student.py` (near the other flashcard handlers). Reuse the
existing `next_review` / `due_date` / `update_card_sm2` imports already at the top of the file:

```python
class CompleteCardResult(BaseModel):
    card_id: str | None = None
    correct: bool
    repetitions: int = 0
    easiness: float = 2.5
    interval_days: int = 0

class FlashcardCompleteRequest(BaseModel):
    results: list[CompleteCardResult] = []
    xp_delta: int = 0

class FlashcardCompleteResponse(BaseModel):
    xp: int
    level: int


@router.post("/api/flashcards/complete", response_model=FlashcardCompleteResponse)
@limiter.limit("30/minute")
async def flashcards_complete(
    request: Request,
    body: FlashcardCompleteRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    student_id = current_user["sub"]
    # Deterministic SM-2 quality: correct -> 5, missed -> 2 (<3 triggers relearn).
    for res in body.results:
        if not res.card_id:
            continue
        quality = 5 if res.correct else 2
        try:
            new_interval, new_ease, new_reps = next_review(
                quality, res.repetitions, res.easiness, res.interval_days)
            await update_card_sm2(res.card_id, new_interval, new_ease,
                                  new_reps, due_date(new_interval))
        except Exception:
            pass  # scheduling is non-critical; never fail the response
    if body.xp_delta:
        try:
            await update_profile(student_id, xp_delta=body.xp_delta)
        except Exception:
            pass
    try:
        profile = await get_profile(student_id)
        xp = int(profile.get("xp") or 0)
    except Exception:
        xp = 0
    return FlashcardCompleteResponse(xp=xp, level=(xp // 500) + 1)
```

> The test monkeypatches `update_card_sm2` / `get_profile` / `update_profile`, so this runs
> without Supabase. (The `_dispatch_sm2` line in the test is a harmless no-op guard.)

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/api/test_flashcards_complete.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/student.py tests/api/test_flashcards_complete.py
git commit -m "feat(flashcards): batched complete endpoint (SM-2 + XP at deck end)"
```

---

### Task 7: `topics` lists 3 tiers (verify) + backend regression sweep

`flashcards_topics` already iterates `sets_for(role)`, so 3 tiers come for free once Task 1
lands. This task only adds a guard and runs the full suite.

**Files:**
- Test: `tests/api/test_flashcards_topics_tiers.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_flashcards_topics_tiers.py
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
```

- [ ] **Step 2: Run test to verify it fails (or passes early)**

Run: `python -m pytest tests/api/test_flashcards_topics_tiers.py -q`
Expected: PASS if Tasks 1-2 landed (hard tier present). If it FAILS, the topics handler
isn't iterating `DIFFICULTIES` — confirm `sets_for` includes hard.

- [ ] **Step 3: Run the full backend suite (CI parity)**

Run: `python -m pytest -q`
Expected: PASS. Fix any test that referenced the old `Flashcard` model / `front`/`back`
flashcard fields (search `tests/` for `flashcards` and update to the MCQ shape).

- [ ] **Step 4: Commit**

```bash
git add tests/api/test_flashcards_topics_tiers.py
git commit -m "test(flashcards): topics lists 3 tiers; backend suite green on MCQ shape"
```

---

# Phase C — Frontend (`frontend/`)

### Task 8: `types.ts` — 3 tiers, MCQ model, fixed XP, grader

**Files:**
- Modify: `frontend/src/aurora/components/flashcards/types.ts`

- [ ] **Step 1: Rewrite the card model + helpers**

Replace the top of `types.ts` (the `Difficulty`, `MAX_ANSWER_CHARS`, `Flashcard`,
`AiFeedback`, `xpForScore`, `loadSessionCards` block) with:

```typescript
export type Difficulty = "easy" | "medium" | "hard";
export type QType = "single" | "multi";

/** Hard cap on a typed reasoning answer — keeps it concise and bounds grader tokens. */
export const MAX_REASON_CHARS = 300;

/** Session-length presets (Quick / Standard / Deep). */
export const LENGTHS: { n: number; label: string }[] = [
  { n: 5, label: "Quick" },
  { n: 10, label: "Standard" },
  { n: 20, label: "Deep" },
];

/** Fixed, encouraging XP: full marks for a correct card, a consolation for an honest miss. */
export const XP_CORRECT = 10;
export const XP_ATTEMPT = 3;

export interface Flashcard {
  id: number;
  stem: string;
  options: string[];
  correct: number[];
  qtype: QType;
  kind: "theory" | "practical";
  explanation: string;
  requiresExplanation: boolean;
  tag: string;
  difficulty: Difficulty | "";
  /** Present only for free-text tutor-seeded cards (no options) → flip-to-reveal path. */
  freeText?: boolean;
  card_id?: string; repetitions?: number; easiness?: number; interval_days?: number;
}

/** Deterministic, instant MCQ grading. All-or-nothing for multi-select. */
export function gradeSelection(card: Flashcard, selected: number[]): boolean {
  const a = [...selected].sort((x, y) => x - y);
  const b = [...card.correct].sort((x, y) => x - y);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Cards handed in from a Tutor session via sessionStorage → free-text reveal cards. */
export function loadSessionCards(): Flashcard[] {
  try {
    const s = JSON.parse(sessionStorage.getItem("eyebot_session") || "{}");
    if (Array.isArray(s.cards) && s.cards.length > 0) {
      return s.cards.map((c: { front: string; back: string; topic_tag: string }, i: number) => ({
        id: i + 1, stem: c.front, options: [], correct: [], qtype: "single" as QType,
        kind: "theory" as const, explanation: c.back, requiresExplanation: false,
        tag: c.topic_tag, difficulty: "" as const, freeText: true,
      }));
    }
  } catch { /* fall through */ }
  return [];
}
```

Keep the existing `ScoreTier`, `scoreTier`, `scoreHue`, `TOPIC_HUES`, `hashKey`,
`topicHue`, `GALLERY_HUES`, `galleryHue` exports **unchanged** (the results screen reuses
`scoreTier`/`scoreHue`; the setup reuses `topicHue`/`galleryHue`).

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: errors only in files that still import the removed `AiFeedback`/`xpForScore`/
`MAX_ANSWER_CHARS` (fixed in Tasks 9-13). Note them; proceed.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/flashcards/types.ts
git commit -m "feat(flashcards): MCQ card model, 3 tiers, fixed XP, instant grader"
```

---

### Task 9: Hooks — MCQ generate, background check, batched complete

**Files:**
- Modify: `frontend/src/hooks/useFlashcards.ts`

- [ ] **Step 1: Rewrite the hook types + add `useFlashcardComplete`**

Replace `FlashcardItem` and `CheckResponse`/`CheckPayload` usage:

```typescript
export interface FlashcardItem {
  card_id: string;
  stem: string;
  options: string[];
  correct: number[];
  qtype: "single" | "multi";
  kind: "theory" | "practical";
  explanation: string;
  requires_explanation: boolean;
  topic_tag: string;
  difficulty: string;
  repetitions: number;
  easiness: number;
  interval_days: number;
}

export interface ReasonCheckPayload {
  question: string;        // the stem
  student_answer: string;  // typed reasoning
  correct_answer: string;  // the explanation (model answer)
}
export interface ReasonCheckResponse { score: number; feedback: string; mock_mode: boolean; }

export interface CompleteCardResult {
  card_id?: string; correct: boolean;
  repetitions?: number; easiness?: number; interval_days?: number;
}
export interface CompletePayload { results: CompleteCardResult[]; xp_delta: number; }
export interface CompleteResponse { xp: number; level: number; }
```

Keep `useFlashcardTopics` and `useFlashcards` (they fetch `/api/flashcards/topics` and
`/api/flashcards/generate` — unchanged URLs; only the returned item shape grew). Replace
`useFlashcardCheck` with a thin background grader and add `useFlashcardComplete`:

```typescript
/** Grade ONE typed reasoning answer. Called in the background (not awaited on reveal). */
export function useReasonCheck() {
  return useMutation<ReasonCheckResponse, Error, ReasonCheckPayload>({
    mutationFn: async (payload) => {
      const res = await fetch("/api/flashcards/check", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Check failed");
      return res.json();
    },
  });
}

/** Batched end-of-deck persistence: SM-2 schedule + XP, one call. */
export function useFlashcardComplete() {
  const qc = useQueryClient();
  return useMutation<CompleteResponse, Error, CompletePayload>({
    mutationFn: async (payload) => {
      const res = await fetch("/api/flashcards/complete", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Complete failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flashcards"] });
      qc.invalidateQueries({ queryKey: ["flashcard-due-count"] });
    },
  });
}
```

The `/api/flashcards/check` request body matches the existing `FlashcardCheckRequest`
(`question`, `student_answer`, `correct_answer`) — no backend change.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: remaining errors only in `Flashcards.tsx` / `StudyStage.tsx` (fixed next).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useFlashcards.ts
git commit -m "feat(flashcards): MCQ generate item shape, background reason-check, batched complete hooks"
```

---

### Task 10: `McqCard` component (options, mandatory typed box, reveal)

Replaces `RecallCard`. Single = radio (one pick), multi = checkboxes (toggle). On
`requiresExplanation`, a typed box appears and **Check stays disabled until an option is
selected AND the box has text**. Free-text tutor cards render a flip-to-reveal self-mark.

**Files:**
- Create: `frontend/src/aurora/components/flashcards/McqCard.tsx`
- Delete (later, Task 14): `RecallCard.tsx`, `RevealBack.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
/* McqCard — the centered question card. Pick option(s) → Check → instant reveal of the
   model answer (correct/incorrect highlight + explanation). A few cards per deck carry a
   COMPULSORY typed-reasoning box (Check disabled until filled); its grade resolves in the
   background and never blocks the reveal. Free-text tutor cards (no options) flip to a
   reveal + self-mark. No AI on the MCQ path. */
import { useEffect, useRef, useState } from "react";
import { type Flashcard, MAX_REASON_CHARS } from "./types";

interface Props {
  card: Flashcard;
  deckTitle: string;
  /** Called when the student checks the card. `correct` is the instant MCQ verdict;
   *  `reasoning` is the typed text (empty unless requiresExplanation). */
  onCheck: (correct: boolean, selected: number[], reasoning: string) => void;
  onAdvance: () => void;
  advanceLabel: string;
  /** Background typed-reasoning grade for THIS card, once it returns (else null). */
  reasonNote: string | null;
}

export function McqCard(p: Props) {
  const { card } = p;
  const [selected, setSelected] = useState<number[]>([]);
  const [reasoning, setReasoning] = useState("");
  const [checked, setChecked] = useState(false);
  const [verdict, setVerdict] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  // Reset per card.
  useEffect(() => { setSelected([]); setReasoning(""); setChecked(false); setVerdict(false); }, [card.id]);

  const toggle = (i: number) => {
    if (checked) return;
    setSelected((prev) =>
      card.qtype === "single" ? [i] : prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]);
  };

  const needsReason = card.requiresExplanation && !card.freeText;
  const canCheck = card.freeText
    ? true
    : selected.length > 0 && (!needsReason || reasoning.trim().length > 0);

  const doCheck = () => {
    if (!canCheck || checked) return;
    const correct = card.freeText ? false : sameSet(selected, card.correct);
    setVerdict(correct);
    setChecked(true);
    p.onCheck(correct, selected, needsReason ? reasoning.trim() : "");
  };

  // Free-text tutor card → flip-to-reveal self-mark.
  if (card.freeText) {
    return (
      <div className="flash-cardwrap">
        <div className={`flash-card${checked ? " is-flipped" : ""}`}>
          <section className="flash-face is-front">
            <span className="flash-topictag"><span>{card.tag} · {p.deckTitle}</span></span>
            <p className="flash-q">{card.stem}</p>
            {!checked && (
              <button type="button" className="flash-submit flash-press" data-testid="flash-reveal"
                onClick={() => setChecked(true)}>Show answer</button>
            )}
          </section>
          <section className="flash-face is-back">
            {checked && (
              <div className="flash-reveal" data-testid="flash-reveal-back">
                <p className="flash-compare-label">Model answer</p>
                <p className="flash-model">{card.explanation}</p>
                <div className="flash-selfmark">
                  <button type="button" className="flash-press flash-mark-miss"
                    onClick={() => { p.onCheck(false, [], ""); p.onAdvance(); }}>Missed it</button>
                  <button type="button" className="flash-press flash-mark-got"
                    onClick={() => { p.onCheck(true, [], ""); p.onAdvance(); }}>Got it</button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="flash-cardwrap">
      <div className={`flash-card${checked ? " is-flipped" : ""}${checked && verdict ? " is-high" : ""}`}>
        {/* FRONT — options */}
        <section className="flash-face is-front">
          <span className="flash-topictag">
            <span>{card.tag} · {p.deckTitle}{card.qtype === "multi" ? " · select all" : ""}</span>
          </span>
          <p className="flash-q">{card.stem}</p>
          <ul className="flash-options" role={card.qtype === "single" ? "radiogroup" : "group"}>
            {card.options.map((opt, i) => (
              <li key={i}>
                <button type="button" data-testid="flash-option"
                  role={card.qtype === "single" ? "radio" : "checkbox"}
                  aria-checked={selected.includes(i)}
                  className={`flash-option flash-press${selected.includes(i) ? " is-picked" : ""}`}
                  onClick={() => toggle(i)} disabled={checked}>
                  <span className="flash-option-mark" aria-hidden />
                  <span className="flash-option-text">{opt}</span>
                </button>
              </li>
            ))}
          </ul>
          {needsReason && (
            <div className="flash-reason">
              <label className="flash-reason-label" htmlFor="flash-reason-box">
                Explain your reasoning <span className="flash-reason-req">(required)</span>
              </label>
              <textarea id="flash-reason-box" ref={reasonRef} className="flash-reason-box"
                data-testid="flash-reason" value={reasoning} rows={2} maxLength={MAX_REASON_CHARS}
                onChange={(e) => setReasoning(e.target.value.slice(0, MAX_REASON_CHARS))}
                placeholder="In a sentence, why is that your answer?" />
            </div>
          )}
          {!checked && (
            <button type="button" className="flash-submit flash-press" data-testid="flash-check"
              onClick={doCheck} disabled={!canCheck}>Check</button>
          )}
        </section>

        {/* BACK — reveal */}
        <section className="flash-face is-back">
          {checked && (
            <div className="flash-reveal" data-testid="flash-reveal-back">
              <p className={`flash-verdict ${verdict ? "is-right" : "is-wrong"}`}>
                {verdict ? "Correct" : "Not quite"}
              </p>
              <ul className="flash-options is-revealed">
                {card.options.map((opt, i) => {
                  const isCorrect = card.correct.includes(i);
                  const isPicked = selected.includes(i);
                  const cls = isCorrect ? "is-correct" : isPicked ? "is-wrongpick" : "";
                  return (
                    <li key={i} className={`flash-option-result ${cls}`}>
                      <span className="flash-option-text">{opt}</span>
                      {isCorrect && <span className="flash-tick" aria-hidden>✓</span>}
                      {!isCorrect && isPicked && <span className="flash-cross" aria-hidden>✗</span>}
                    </li>
                  );
                })}
              </ul>
              <p className="flash-compare-label">Why</p>
              <p className="flash-model">{card.explanation}</p>
              {needsReason && (
                <p className="flash-reason-note" data-testid="flash-reason-note">
                  {p.reasonNote ?? "Reviewing your written answer…"}
                </p>
              )}
              <button type="button" className="flash-advance flash-press" data-testid="flash-advance"
                onClick={p.onAdvance}>{p.advanceLabel}</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function sameSet(a: number[], b: number[]): boolean {
  const x = [...a].sort((m, n) => m - n);
  const y = [...b].sort((m, n) => m - n);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no new errors from `McqCard.tsx` (errors remain only in not-yet-updated
`StudyStage.tsx`/`Flashcards.tsx`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/flashcards/McqCard.tsx
git commit -m "feat(flashcards): McqCard — options, mandatory typed box, instant reveal"
```

---

### Task 11: `StudyStage` — drive McqCard, no running score

**Files:**
- Modify: `frontend/src/aurora/components/flashcards/StudyStage.tsx`

- [ ] **Step 1: Rewrite StudyStage**

Replace the file with a slimmer version: progress dots + a coach line, the `McqCard`, and
a readout WITHOUT any cumulative score (score is end-only). It no longer manages AI
checking/avg/XP-countup.

```tsx
"use client";
/* StudyStage — active-study layout: a slim top bar (deck title, progress dots), a short
   coach line, the centered McqCard, and a slim readout (no running score — that's end-only).
   Owns keyboard-advance (Enter / → once the card is checked). */
import { useEffect } from "react";
import { type Flashcard } from "./types";
import { McqCard } from "./McqCard";

interface Props {
  card: Flashcard;
  idx: number;
  total: number;
  deckTitle: string;
  checked: boolean;
  reasonNote: string | null;
  onCheck: (correct: boolean, selected: number[], reasoning: string) => void;
  onAdvance: () => void;
  advanceLabel: string;
}

export function StudyStage(p: Props) {
  useEffect(() => {
    if (!p.checked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); p.onAdvance(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.checked, p.onAdvance]);

  const remaining = Math.max(0, p.total - p.idx - 1);
  const coach = p.checked
    ? (remaining > 0 ? `${remaining} to go.` : "Last one — nice work.")
    : (p.card.qtype === "multi" ? "Select every option that applies." : "Pick the best answer.");

  return (
    <div className="flash-stage" data-testid="study-stage">
      <div className="flash-topbar">
        <span className="flash-deck-title">{p.deckTitle}</span>
        <span className="flash-dots" aria-label={`Card ${p.idx + 1} of ${p.total}`}>
          {Array.from({ length: p.total }).map((_, i) => (
            <i key={i} className={i < p.idx ? "is-done" : i === p.idx ? "is-active" : ""} />
          ))}
        </span>
        <span className="flash-readout-n">{p.idx + 1}/{p.total}</span>
      </div>

      <p className="flash-coach" key={coach}>{coach}</p>

      <McqCard
        card={p.card}
        deckTitle={p.deckTitle}
        onCheck={p.onCheck}
        onAdvance={p.onAdvance}
        advanceLabel={p.advanceLabel}
        reasonNote={p.reasonNote}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: errors only in `Flashcards.tsx` (fixed next).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/flashcards/StudyStage.tsx
git commit -m "feat(flashcards): StudyStage drives McqCard, no running score"
```

---

### Task 12: `ResultsScreen` — "X / N correct" + weak topics + encouragement

**Files:**
- Create: `frontend/src/aurora/components/flashcards/ResultsScreen.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
/* ResultsScreen — the end-of-deck summary. Headline "X / N correct" (instant, MCQ-only),
   the 1-2 weakest topics from the misses, encouraging plain-language coaching, an optional
   written-reasoning line, and actions (drill missed / new deck / done). */
import { scoreTier, type ScoreTier } from "./types";

export interface DeckResult {
  total: number;
  correct: number;
  /** topic_tag → { seen, missed } */
  byTopic: Record<string, { seen: number; missed: number }>;
  /** background reasoning grades collected this deck (0-100), if any. */
  reasonScores: number[];
  missedCount: number;
}

interface Props {
  result: DeckResult;
  onDrillMissed: () => void;
  onNewDeck: () => void;
  onDone: () => void;
}

const COACH: Record<ScoreTier, string> = {
  high: "Outstanding — you really know this. Keep that momentum going!",
  good: "Solid work — you've got most of this down. A little drilling and it's yours.",
  fair: "Good effort — you're getting there. Focus your next round on the weak spots below.",
  low: "Every rep counts — you showed up and that's how it sticks. Let's drill these together.",
};

function weakest(byTopic: Props["result"]["byTopic"]): string[] {
  return Object.entries(byTopic)
    .filter(([, v]) => v.missed > 0)
    .sort((a, b) => b[1].missed - a[1].missed)
    .slice(0, 2)
    .map(([t]) => prettyTopic(t));
}

function prettyTopic(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ResultsScreen({ result, onDrillMissed, onNewDeck, onDone }: Props) {
  const pct = result.total ? Math.round((result.correct / result.total) * 100) : 0;
  const tier = scoreTier(pct);
  const weak = weakest(result.byTopic);
  const reasonAvg = result.reasonScores.length
    ? Math.round(result.reasonScores.reduce((a, b) => a + b, 0) / result.reasonScores.length)
    : null;

  return (
    <div className="flash-results" data-testid="flash-results" data-tier={tier}
      style={{ ["--flash-score-hue" as string]: String(scoreHueFor(tier)) }}>
      <p className="flash-results-kicker">Deck complete</p>
      <p className="flash-results-score" data-testid="flash-results-score">
        <strong>{result.correct}</strong> / {result.total} correct
      </p>
      <p className="flash-results-coach">{COACH[tier]}</p>

      {weak.length > 0 && (
        <p className="flash-results-weak">
          Focus your next drill on <strong>{weak.join(" and ")}</strong>.
        </p>
      )}

      {reasonAvg != null && (
        <p className="flash-results-reason" data-testid="flash-results-reason">
          Written reasoning: {reasonLabel(reasonAvg)}.
        </p>
      )}

      <div className="flash-results-actions">
        {result.missedCount > 0 && (
          <button type="button" className="flash-press flash-start" onClick={onDrillMissed}>
            Drill the {result.missedCount} you missed
          </button>
        )}
        <button type="button" className="flash-press flash-results-secondary" onClick={onNewDeck}>New deck</button>
        <button type="button" className="flash-press flash-results-secondary" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

function reasonLabel(avg: number): string {
  if (avg >= 80) return "strong";
  if (avg >= 55) return "on the right track";
  return "worth another look";
}

/** Mirror of types.scoreHue but keyed by tier (avoids re-deriving). */
function scoreHueFor(tier: ScoreTier): number {
  return { high: 145, good: 212, fair: 38, low: 255 }[tier];
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no new errors from `ResultsScreen.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/flashcards/ResultsScreen.tsx
git commit -m "feat(flashcards): ResultsScreen — X/N correct, weak topics, encouragement"
```

---

### Task 13: `StepSession` — add the Hard difficulty pill

**Files:**
- Modify: `frontend/src/aurora/components/flashcards/StepSession.tsx:9-12` and `:22-25`

- [ ] **Step 1: Add Hard + update minutes estimate**

Change the `DIFFS` array and `estMinutes`:
```typescript
const DIFFS: { key: Difficulty; name: string; sub: string; level: 1 | 2 | 3 }[] = [
  { key: "easy", name: "Easy", sub: "Recall the essentials", level: 1 },
  { key: "medium", name: "Medium", sub: "Apply & reason", level: 2 },
  { key: "hard", name: "Hard", sub: "Clinical judgement", level: 3 },
];
```
```typescript
function estMinutes(cards: number, difficulty: Difficulty): number {
  const perCard = difficulty === "hard" ? 0.9 : difficulty === "medium" ? 0.8 : 0.55;
  return Math.max(2, Math.round(cards * perCard));
}
```
And change the difficulty options wrapper from `flash-opts-2` to `flash-opts-3`
(`:50` — `<div className="flash-opts flash-opts-2" ...>` → `flash-opts-3`) so three pills
lay out like the length row.

Also confirm the `flash-meter` glyph renders `data-level={3}` (it already maps `<i><i><i>`;
add a `[data-level="3"]` rule in CSS Task 14 to light all three bars).

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS for this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/flashcards/StepSession.tsx
git commit -m "feat(flashcards): add Hard difficulty pill to setup"
```

---

### Task 14: `Flashcards.tsx` orchestrator — select → reveal → results

The heart of the rewrite. Owns deck state, instant grading, background reason-checks,
result accumulation, the ResultsScreen, the batched complete sync, and the missed-card drill.

**Files:**
- Modify: `frontend/src/aurora/screens/Flashcards.tsx`
- Delete: `frontend/src/aurora/components/flashcards/RecallCard.tsx`, `RevealBack.tsx`

- [ ] **Step 1: Rewrite the orchestrator**

```tsx
"use client";
/* AURORA Flashcards — orchestrator. Deck state + instant MCQ grading (deterministic,
   client-side), background typed-reasoning grades (off the blocking path), result
   accumulation, the ResultsScreen, batched complete sync, and a missed-card drill.
   Presentation lives in components/flashcards/*. */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { rankForLevel } from "@/lib/rank";
import { addXP, checkAndUnlockAchievements, incrementTotalCards, XP_REWARDS } from "@/lib/legacy/gamification";
import {
  useFlashcards, useFlashcardTopics, useReasonCheck, useFlashcardComplete,
  type FlashcardItem, type CompleteCardResult,
} from "@/hooks/useFlashcards";
import {
  type Flashcard, type Difficulty, XP_CORRECT, XP_ATTEMPT, loadSessionCards, topicHue,
} from "@/aurora/components/flashcards/types";
import { SessionSetup } from "@/aurora/components/flashcards/SessionSetup";
import { StudyStage } from "@/aurora/components/flashcards/StudyStage";
import { ResultsScreen, type DeckResult } from "@/aurora/components/flashcards/ResultsScreen";
import { FlashShell } from "@/aurora/components/flashcards/FlashShell";

function toCard(c: FlashcardItem, i: number): Flashcard {
  return {
    id: i + 1, stem: c.stem, options: c.options, correct: c.correct, qtype: c.qtype,
    kind: c.kind, explanation: c.explanation, requiresExplanation: c.requires_explanation,
    tag: c.topic_tag, difficulty: (c.difficulty || "") as Difficulty | "",
    card_id: c.card_id, repetitions: c.repetitions, easiness: c.easiness, interval_days: c.interval_days,
  };
}

export function Flashcards() {
  const router = useRouter();
  const sessionCards = useMemo(() => loadSessionCards(), []);
  const reviewMode = useMemo(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "review", []);
  const fromSession = sessionCards.length > 0;

  const { data: topicSets } = useFlashcardTopics();
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [setKey, setSetKey] = useState<string | null>(null);
  const [sessionLength, setSessionLength] = useState(10);
  const [pickerDone, setPickerDone] = useState(reviewMode);

  const { data: apiCardsRaw, isLoading: apiLoading } = useFlashcards(setKey, !fromSession && pickerDone, sessionLength);
  const reasonCheck = useReasonCheck();
  const { mutate: complete } = useFlashcardComplete();

  const baseCards: Flashcard[] = useMemo(() => {
    if (sessionCards.length > 0) return sessionCards;
    if (!Array.isArray(apiCardsRaw)) return [];
    return apiCardsRaw.map(toCard);
  }, [sessionCards, apiCardsRaw]);

  const [drill, setDrill] = useState<Flashcard[]>([]);
  const deck = drill.length > 0 ? drill : baseCards;

  const [idx, setIdx] = useState(0);
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState(false);
  const reasonNotesRef = useRef<Record<number, string>>({});
  const [, force] = useState(0);

  // Accumulators
  const resultsRef = useRef<CompleteCardResult[]>([]);
  const byTopicRef = useRef<Record<string, { seen: number; missed: number }>>({});
  const reasonScoresRef = useRef<number[]>([]);
  const missedRef = useRef<Flashcard[]>([]);
  const xpRef = useRef(0);

  const deckTitle = useMemo(() => {
    if (deck.length === 0) return "Flashcards";
    const freq: Record<string, number> = {};
    for (const c of deck) freq[c.tag] = (freq[c.tag] ?? 0) + 1;
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  }, [deck]);

  const card = deck[idx];
  const total = deck.length;
  const stageHue = topicHue(card?.tag ?? "__mixed");
  const generating = sessionCards.length === 0 && apiLoading;

  const onCheck = (correct: boolean, _selected: number[], reasoning: string) => {
    if (checked || !card) return;
    setChecked(true);

    // Tally (skip double-counting on the free-text self-mark which calls onCheck once).
    resultsRef.current.push({
      card_id: card.card_id, correct,
      repetitions: card.repetitions, easiness: card.easiness, interval_days: card.interval_days,
    });
    const t = byTopicRef.current[card.tag] ?? { seen: 0, missed: 0 };
    t.seen += 1; if (!correct) t.missed += 1;
    byTopicRef.current[card.tag] = t;
    if (!correct) missedRef.current.push(card);

    const xp = correct ? XP_CORRECT : XP_ATTEMPT;
    xpRef.current += xp; addXP(xp); incrementTotalCards();
    const unlocked = checkAndUnlockAchievements();
    if (unlocked.length) toast.success("Achievement unlocked! 🏅");

    // Background typed-reasoning grade — never awaited, never blocks the reveal.
    if (card.requiresExplanation && reasoning) {
      const cardId = card.id;
      reasonCheck.mutate(
        { question: card.stem, student_answer: reasoning, correct_answer: card.explanation },
        {
          onSuccess: (d) => {
            reasonScoresRef.current.push(Math.max(0, Math.min(100, d.score)));
            reasonNotesRef.current[cardId] = d.feedback;
            force((x) => x + 1);
          },
          onError: () => { reasonNotesRef.current[cardId] = "Couldn't grade that one — keep going."; force((x) => x + 1); },
        },
      );
    }
  };

  const advance = () => {
    setChecked(false);
    if (idx < total - 1) { setIdx((i) => i + 1); return; }
    finish();
  };

  const finish = () => {
    setDone(true);
    const earned = xpRef.current + XP_REWARDS.sessionComplete;
    const res = addXP(XP_REWARDS.sessionComplete);
    if (res.leveledUp) {
      const rank = rankForLevel(res.newLevel);
      toast.success(`Level up! You're now Level ${res.newLevel} · ${rank.title} 🎉`);
    }
    complete({ results: resultsRef.current, xp_delta: earned });
  };

  const startDrill = () => {
    const missed = missedRef.current;
    if (missed.length === 0) return;
    // reset accumulators for the drill round
    resultsRef.current = []; byTopicRef.current = {}; reasonScoresRef.current = [];
    const next = missed.slice(); missedRef.current = [];
    setDrill(next.map((c, i) => ({ ...c, id: i + 1 })));
    setIdx(0); setChecked(false); setDone(false);
  };

  const newDeck = () => router.push("/dashboard");  // re-enter setup from dashboard launchpad
  const exit = () => router.push("/dashboard");

  // ── Selection ──
  if (!fromSession && !pickerDone) {
    return (
      <FlashShell onExit={exit}>
        <SessionSetup
          topicSets={topicSets} difficulty={difficulty} setDifficulty={setDifficulty}
          sessionLength={sessionLength} setSessionLength={setSessionLength}
          onStart={(key) => { setSetKey(key); setPickerDone(true); }}
        />
      </FlashShell>
    );
  }

  if (generating || deck.length === 0 || !card) {
    return (
      <FlashShell onExit={exit} topicHue={stageHue}>
        <div className="flash-stage flash-stage-msg">
          {generating
            ? <p className="flash-msg">Bringing your cards into focus…</p>
            : <p className="flash-msg">{reviewMode ? "Nothing due to review — great job staying sharp!" : "No cards in this set yet — more are on the way."}</p>}
        </div>
      </FlashShell>
    );
  }

  if (done) {
    const result: DeckResult = {
      total: resultsRef.current.length,
      correct: resultsRef.current.filter((r) => r.correct).length,
      byTopic: byTopicRef.current,
      reasonScores: reasonScoresRef.current,
      missedCount: missedRef.current.length,
    };
    return (
      <FlashShell onExit={exit} topicHue={stageHue}>
        <ResultsScreen result={result} onDrillMissed={startDrill} onNewDeck={newDeck} onDone={exit} />
      </FlashShell>
    );
  }

  const advanceLabel = idx < total - 1 ? "Next card →" : "See results →";

  return (
    <FlashShell onExit={exit} topicHue={stageHue}>
      <StudyStage
        card={card} idx={idx} total={total} deckTitle={deckTitle}
        checked={checked} reasonNote={reasonNotesRef.current[card.id] ?? null}
        onCheck={onCheck} onAdvance={advance} advanceLabel={advanceLabel}
      />
    </FlashShell>
  );
}
```

> **Note on FlashShell props:** the old screen passed `newAchievements` / `onDismissAchievement`
> to `FlashShell`. If `FlashShell`'s prop types require them, either keep passing `[]` /
> a no-op, or make them optional in `FlashShell.tsx`. Read `FlashShell.tsx` first and match
> its current signature (don't change behavior beyond making achievement props optional).

- [ ] **Step 2: Delete the dead components**

```bash
git rm frontend/src/aurora/components/flashcards/RecallCard.tsx frontend/src/aurora/components/flashcards/RevealBack.tsx
```

- [ ] **Step 3: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS. Fix any remaining import of `RecallCard`/`RevealBack`/`AiFeedback`/
`xpForScore`/`MAX_ANSWER_CHARS`.

- [ ] **Step 4: Commit**

```bash
git add -A frontend/src/aurora
git commit -m "feat(flashcards): orchestrator — instant MCQ grading, background reasoning, results + drill"
```

---

### Task 15: CSS for MCQ options, reveal, results, Hard pill

**Files:**
- Modify: `frontend/src/aurora/aurora.css` (the `flash-*` block)

- [ ] **Step 1: Add the styles**

Append a focused block to the existing `flash-*` styles in `aurora.css`. Match the warm-cream
tokens already in use (`--flash-ink`, `--flash-line`, `--flash-topic-hue`, etc. — grep the
file for `--flash-` to reuse). Minimum required rules:

```css
/* MCQ options */
.flash-options { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; width: 100%; }
.flash-option { display: flex; gap: .6rem; align-items: center; width: 100%; text-align: left;
  padding: .8rem 1rem; border: 1px solid var(--flash-line); border-radius: 14px;
  background: var(--flash-paper, #fff); color: var(--flash-ink); cursor: pointer; }
.flash-option.is-picked { border-color: hsl(var(--flash-topic-hue) 64% 45%);
  box-shadow: inset 0 0 0 1px hsl(var(--flash-topic-hue) 64% 45%); }
.flash-option-mark { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--flash-line); flex: 0 0 auto; }
.flash-option.is-picked .flash-option-mark { background: hsl(var(--flash-topic-hue) 64% 45%); border-color: transparent; }
.flash-option:disabled { cursor: default; opacity: .9; }

/* Reveal */
.flash-options.is-revealed .flash-option-result { display: flex; justify-content: space-between;
  padding: .7rem 1rem; border-radius: 12px; border: 1px solid var(--flash-line); margin-bottom: .4rem; }
.flash-option-result.is-correct { background: hsl(145 60% 95%); border-color: hsl(145 50% 60%); }
.flash-option-result.is-wrongpick { background: hsl(2 70% 96%); border-color: hsl(2 70% 70%); }
.flash-verdict { font-weight: 700; margin: 0 0 .4rem; }
.flash-verdict.is-right { color: hsl(145 55% 32%); }
.flash-verdict.is-wrong { color: hsl(2 65% 45%); }
.flash-model { color: var(--flash-ink); opacity: .9; }
.flash-tick { color: hsl(145 55% 32%); } .flash-cross { color: hsl(2 65% 45%); }

/* Compulsory typed box */
.flash-reason { width: 100%; margin: .6rem 0; }
.flash-reason-label { font-size: .85rem; font-weight: 600; }
.flash-reason-req { color: hsl(2 65% 45%); font-weight: 700; }
.flash-reason-box { width: 100%; margin-top: .3rem; padding: .6rem .8rem;
  border: 1px solid var(--flash-line); border-radius: 12px; resize: vertical; font: inherit; }
.flash-reason-note { font-size: .85rem; opacity: .8; font-style: italic; }

/* Self-mark (tutor free-text) */
.flash-selfmark { display: flex; gap: .6rem; margin-top: .8rem; }
.flash-mark-got { color: hsl(145 55% 30%); } .flash-mark-miss { opacity: .8; }

/* Results */
.flash-results { display: grid; gap: .8rem; place-items: center; text-align: center; padding: 2rem 1rem; }
.flash-results-score { font-size: clamp(2.2rem, 7vw, 3.4rem); }
.flash-results-score strong { color: hsl(var(--flash-score-hue, 212) 60% 42%); }
.flash-results-coach { max-width: 40ch; }
.flash-results-weak strong { color: hsl(38 70% 40%); }
.flash-results-actions { display: flex; flex-wrap: wrap; gap: .6rem; justify-content: center; margin-top: .6rem; }
.flash-results-secondary { background: transparent; border: 1px solid var(--flash-line); padding: .6rem 1rem; border-radius: 12px; }

/* Hard difficulty meter (third bar) */
.flash-meter[data-level="3"] i { background: currentColor; }
```

> Adjust to match the surrounding cream palette; verify against the live page in Step 2.

- [ ] **Step 2: Verify visually (build + harness server)**

Per `project_harness_local_server`: build, copy `.next/static` + `public` into
`.next/standalone`, run `node .next/standalone/server.js`, then screenshot `/flashcards`
(setup → study → results). Confirm options, reveal highlight, mandatory box, and results
render on cream.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/aurora.css
git commit -m "style(flashcards): MCQ options, reveal, results, Hard pill"
```

---

### Task 16: Update the frontend harness + mocks for the MCQ flow

**Files:**
- Modify: `frontend/tests/_mocks.mjs:87-94` (flashcard routes)
- Modify: `frontend/tests/aurora_assert.mjs:150-205` (the flashcards walk)

- [ ] **Step 1: Update the mocks**

Replace the flashcard routes in `_mocks.mjs` with MCQ shape (one of them
`requires_explanation: true`), and keep `check`/`topics`:

```javascript
await ctx.route("**/api/flashcards/generate*", (r) => r.fulfill(J([
  { card_id: "f1", stem: "Normal IOP range?",
    options: ["10-21 mmHg", "0-9 mmHg", "22-30 mmHg", "31-40 mmHg"], correct: [0],
    qtype: "single", kind: "theory", explanation: "Normal IOP is 10-21 mmHg.",
    requires_explanation: false, topic_tag: "iop_nct", difficulty: "easy",
    repetitions: 0, easiness: 2.5, interval_days: 1 },
  { card_id: "f2", stem: "Why irrigate a chemical burn immediately?",
    options: ["To wash out the chemical", "To dilate the pupil", "To measure IOP", "To numb the eye"],
    correct: [0], qtype: "single", kind: "practical",
    explanation: "Immediate irrigation limits ongoing tissue damage (Category 1).",
    requires_explanation: true, topic_tag: "triage", difficulty: "medium",
    repetitions: 0, easiness: 2.5, interval_days: 1 },
])));
await ctx.route("**/api/flashcards/check", (r) => r.fulfill(J({ score: 88, feedback: "Good reasoning — immediate irrigation limits damage.", mock_mode: true })));
await ctx.route("**/api/flashcards/complete", (r) => r.fulfill(J({ xp: 140, level: 1 })));
await ctx.route("**/api/flashcards/topics", (r) => r.fulfill(J({ sets: [
  { set_key: "triage__easy", topic_key: "triage", label: "Triage", difficulty: "easy", total: 12, completed: 2 },
  { set_key: "triage__hard", topic_key: "triage", label: "Triage", difficulty: "hard", total: 12, completed: 0 },
] })));
```

Mirror the same generate/complete mocks in `aurora_assert.mjs` (it defines its own routes
at `:58` and `:153`).

- [ ] **Step 2: Rewrite the flashcards walk in `aurora_assert.mjs`**

Replace the block from the `/flashcards` recall assertions (`:179-205`) with the MCQ walk:

```javascript
await np.locator('[data-testid="flash-start"]').click();
await np.waitForSelector('[data-testid="study-stage"]', { timeout: 15000 });

// Card 1: single-answer MCQ → pick correct option, Check, reveal shows model answer (no score).
await np.locator('[data-testid="flash-option"]').first().click();
await np.locator('[data-testid="flash-check"]').click();
await np.waitForSelector('[data-testid="flash-reveal-back"]', { timeout: 8000 });
if ((await np.locator('.flash-compare-label:has-text("Why")').count()) < 1) {
  console.error("FAIL: flashcards model answer not revealed"); process.exit(1);
}
console.log("PASS: flashcards — MCQ select → instant reveal of the model answer");
await np.locator('[data-testid="flash-advance"]').click();

// Card 2: requires_explanation → Check is DISABLED until BOTH an option and the typed box are filled.
await np.waitForSelector('[data-testid="flash-reason"]', { timeout: 8000 });
await np.locator('[data-testid="flash-option"]').first().click();
if (await np.locator('[data-testid="flash-check"]').isEnabled()) {
  console.error("FAIL: Check enabled before typed reasoning filled"); process.exit(1);
}
await np.locator('[data-testid="flash-reason"]').fill("Immediate irrigation limits ongoing damage.");
if (!(await np.locator('[data-testid="flash-check"]').isEnabled())) {
  console.error("FAIL: Check still disabled after option + reasoning"); process.exit(1);
}
await np.locator('[data-testid="flash-check"]').click();
await np.waitForSelector('[data-testid="flash-reveal-back"]', { timeout: 8000 });
console.log("PASS: flashcards — typed reasoning is compulsory (Check gated until filled)");
await np.locator('[data-testid="flash-advance"]').click();

// Results: instant "X / N correct".
await np.waitForSelector('[data-testid="flash-results-score"]', { timeout: 8000 });
const score = await np.locator('[data-testid="flash-results-score"]').innerText();
if (!/\d+\s*\/\s*\d+/.test(score)) { console.error(`FAIL: results score missing (got '${score}')`); process.exit(1); }
console.log("PASS: flashcards — deck ends on an X/N results screen");

// per-topic hue still exposed on .flash-root (unchanged assertion)
const topicHueVal = await np.evaluate(() => {
  const root = document.querySelector(".flash-root");
  return root ? getComputedStyle(root).getPropertyValue("--flash-topic-hue").trim() : "";
});
if (!topicHueVal || Number.isNaN(Number(topicHueVal))) {
  console.error(`FAIL: flashcards --flash-topic-hue missing/NaN (got '${topicHueVal}')`); process.exit(1);
}
console.log("PASS: flashcards exposes per-topic --flash-topic-hue =", topicHueVal);
```

Also update the comment at `:150-152` and the early generate mock at `:58` to the MCQ shape.

- [ ] **Step 3: Run the harness**

Per `project_harness_local_server` + the OSCE memory note: warm the dynamic route with an
authed request first (cold compile > 15s), then:
Run: `node frontend/tests/aurora_assert.mjs`
Expected: all PASS lines, including the three new flashcards PASS lines. Exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/_mocks.mjs frontend/tests/aurora_assert.mjs
git commit -m "test(flashcards): harness walks MCQ select → reveal → compulsory reasoning → results"
```

---

### Task 17: Full verification + branch wrap

**Files:** none (verification only)

- [ ] **Step 1: Backend suite (CI parity)**

Run: `python -m pytest -q`
Expected: PASS (all flashcard tests + the pre-existing suite).

- [ ] **Step 2: Frontend gates**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Harness**

Run: `node frontend/tests/aurora_assert.mjs`
Expected: all PASS, exit 0.

- [ ] **Step 4: Finish the branch**

Use `superpowers:finishing-a-development-branch` to decide merge/PR. **Do not fast-push to
`main`** — this is risky (prod auto-deploys). Branch, verify all three gates green, then
merge per that skill.

---

## Self-Review

**Spec coverage:**
- MCQ/multi-select every card → Tasks 2, 3, 10. ✔
- All-or-nothing multi grading → `gradeSelection` / `sameSet` (Tasks 8, 10). ✔
- 3 tiers → Tasks 1, 13. ✔
- ~12/tier deeper bank (template topics) → Task 3. ✔
- Instant client grading, no blocking AI → Tasks 10, 14 (no per-card await). ✔
- Per-question model-answer reveal → Task 10. ✔
- Compulsory typed reasoning, any difficulty, ~1 per 5 → Tasks 4 (`mark_typed_cards`/`typed_count`), 5 (generate marks it), 10 (Check gating). ✔
- Typed graded in background, off blocking path, own dimension → Tasks 9 (`useReasonCheck`), 14 (`reasonCheck.mutate` not awaited), 12 (reason summary). ✔
- End results: X/N + weak topics + encouragement → Task 12. ✔
- `complete` batched SM-2 + XP → Task 6. ✔
- `check` repurposed (typed-only) → Tasks 9, 14 (no internal change). ✔
- No DB migration; rehydrate by stem → Task 2 (`card_by_stem`), Task 5 (review path). ✔
- Role gating preserved → unchanged `pool_for_role`; Task 1 disjoint test. ✔
- Tests: integrity guard, endpoints, harness → Tasks 2, 5, 6, 7, 16. ✔
- Tutor-seed path kept working (scope note) → Tasks 8, 10, 14 free-text path. ✔

**Placeholder scan:** No TBD/TODO; every code step has full code. The only judgement-left-to-engineer items are the bulk authored questions (Task 3, bounded by tests) and CSS palette matching (Task 15, bounded by the visual check) — both intentional and test/visual-gated.

**Type consistency:** `Flashcard` fields (`stem`, `options`, `correct`, `qtype`, `kind`, `explanation`, `requiresExplanation`, `tag`, `difficulty`, `freeText`) are identical across types.ts (Task 8), McqCard (Task 10), StudyStage (Task 11), Flashcards (Task 14). API item `FlashcardItem` (snake_case `requires_explanation`/`topic_tag`) is mapped to camelCase only in `toCard` (Task 14). `DeckResult` shape matches between ResultsScreen (Task 12) and the orchestrator (Task 14). `CompleteCardResult` matches between the hook (Task 9), orchestrator (Task 14), and backend model (Task 6). `gradeSelection`/`sameSet` both implement all-or-nothing identically.
