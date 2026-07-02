# Flashcards Foundations Coverage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every role a shared "Foundations" flashcard layer so every knowledge/procedure chapter in *silly* (the ~93-doc KB) is covered — closing the pharmacology/anatomy/disease/ethics gaps and the OT procedure gaps — with a regression test that guarantees nothing is missed.

**Architecture:** Add a third `FOUNDATIONS` pool to the flashcards taxonomy. A new `pools_for(role)` returns `["FOUNDATIONS", <role pool>]`; `topics_for` and the `static_cards.py` lookup helpers search across those pools. Cards are drafted by a new reusable KB-grounded generator tool (Gemini, strict JSON schema, grounded only in RAG-retrieved chunks) then verified and pasted as static data. Frontend fan groups Foundations vs the role's procedures.

**Tech Stack:** Python 3.12, FastAPI, pytest (MOCK_MODE), Next.js/React fan carousel, Supabase RAG (`tools/kb/search.py`), Gemini via `tools/shared/gemini_client.py`.

---

## File Structure

- `tools/flashcards/flashcard_sets.py` — MODIFY: add `FOUNDATIONS` pool to `FLASHCARD_TOPICS`, add `pools_for()`, rewrite `topics_for()` to concat Foundations + role pool, move `ocular_emergencies` into Foundations.
- `tools/flashcards/static_cards.py` — MODIFY: rewrite the 5 lookup helpers to search `pools_for(role)`; ADD the `FOUNDATIONS` card data block + OT gap-fill topics.
- `tools/flashcards/generate_cards.py` — CREATE: reusable KB-grounded MCQ generator.
- `tests/flashcards/test_foundations_taxonomy.py` — CREATE: taxonomy/lookup behavior.
- `tests/content/test_coverage.py` — CREATE: silly→flashcards coverage guard.
- `tests/flashcards/test_flashcard_sets.py` — MODIFY: update topic-count expectations.
- `docs/notes/silly-coverage-matrix.md` — CREATE: human-readable coverage matrix (built from DB).
- `frontend/src/aurora/components/flashcards/StepTopic.tsx` — MODIFY: group Foundations vs procedures.
- `frontend/tests/aurora_assert.mjs` — MODIFY only if a Foundations assertion is added.

---

## Task 1: Build the silly coverage matrix (data, read-only)

**Files:**
- Create: `tools/kb/dump_coverage_matrix.py`
- Create (output): `docs/notes/silly-coverage-matrix.md`

- [ ] **Step 1: Write a one-shot dumper** that reads the DB and emits the matrix.

```python
# tools/kb/dump_coverage_matrix.py
"""One-shot: dump every silly document + its checklist role tag to a markdown
matrix stub for docs/notes/silly-coverage-matrix.md. Not imported anywhere."""
import sys; sys.path.insert(0, ".")
from tools.kb.supabase_client import get_client

def main() -> None:
    c = get_client()
    docs = c.table("documents").select("category,module,title").order("category").execute().data
    cl = {x["procedure_name"]: x["checklist_type"]
          for x in c.table("checklists").select("procedure_name,checklist_type").execute().data}
    print("| category | module | document | checklist role |")
    print("|---|---|---|---|")
    for d in docs:
        role = cl.get(d["title"], "")
        print(f"| {d['category']} | M{d['module']} | {d['title']} | {role} |")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it and capture output**

Run: `python tools/kb/dump_coverage_matrix.py > docs/notes/_matrix_stub.md`
Expected: a markdown table of all ~93 docs, no traceback.

- [ ] **Step 3: Hand-author `docs/notes/silly-coverage-matrix.md`** from the stub — one row per document/chapter with columns: `silly source | chapter/sub-topic | flashcard topic_key | OSCE case(s)/rationale | role(s)`. Use the taxonomy table in `docs/superpowers/specs/2026-07-02-silly-content-coverage-design.md` §3 as the target mapping. Every Foundations topic and every CLINICAL/OT topic must have every silly doc mapped to it. Delete `_matrix_stub.md`.

- [ ] **Step 4: Commit**

```bash
git add tools/kb/dump_coverage_matrix.py docs/notes/silly-coverage-matrix.md
git commit -m "docs(coverage): silly->flashcards/OSCE coverage matrix + dumper"
```

---

## Task 2: Add the FOUNDATIONS pool + pools_for + topics_for

**Files:**
- Modify: `tools/flashcards/flashcard_sets.py`
- Test: `tests/flashcards/test_foundations_taxonomy.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/flashcards/test_foundations_taxonomy.py
from tools.flashcards.flashcard_sets import (
    FLASHCARD_TOPICS, pools_for, topics_for, pool_for_role,
)

FOUNDATION_KEYS = {
    "anatomy_physiology", "microbiology_infection", "pharmacology",
    "ocular_emergencies", "professional_ethics",
    "disorders_eyelid_lacrimal_orbit", "disorders_cornea_conjunctiva",
    "disorders_uvea_retina", "glaucoma", "neuro_strabismus", "systemic_disease",
}

def test_foundations_pool_exists_with_11_topics():
    keys = {k for k, _ in FLASHCARD_TOPICS["FOUNDATIONS"]}
    assert keys == FOUNDATION_KEYS

def test_pools_for_returns_foundations_first():
    assert pools_for("OA") == ["FOUNDATIONS", "CLINICAL"]
    assert pools_for("PSA") == ["FOUNDATIONS", "CLINICAL"]
    assert pools_for("OT") == ["FOUNDATIONS", "OT"]

def test_every_role_sees_foundations_plus_its_procedures():
    for role in ("OA", "PSA", "OT"):
        keys = {k for k, _ in topics_for(role)}
        assert FOUNDATION_KEYS <= keys
        pool_keys = {k for k, _ in FLASHCARD_TOPICS[pool_for_role(role)]}
        assert pool_keys <= keys

def test_ocular_emergencies_moved_out_of_clinical():
    assert "ocular_emergencies" not in {k for k, _ in FLASHCARD_TOPICS["CLINICAL"]}
    assert "ocular_emergencies" in FOUNDATION_KEYS
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/flashcards/test_foundations_taxonomy.py -q`
Expected: FAIL (KeyError "FOUNDATIONS" / `pools_for` undefined).

- [ ] **Step 3: Implement in `flashcard_sets.py`** — add the FOUNDATIONS pool, remove `ocular_emergencies` from CLINICAL, add `pools_for`, rewrite `topics_for`.

```python
FLASHCARD_TOPICS: dict[str, list[tuple[str, str]]] = {
    "FOUNDATIONS": [
        ("anatomy_physiology", "Ocular Anatomy & Physiology"),
        ("microbiology_infection", "Microbiology & Infection Control"),
        ("pharmacology", "Ocular Pharmacology"),
        ("ocular_emergencies", "Ocular Emergencies"),
        ("professional_ethics", "Professional Practice & Ethics"),
        ("disorders_eyelid_lacrimal_orbit", "Eyelid, Lacrimal & Orbit Disorders"),
        ("disorders_cornea_conjunctiva", "Cornea, Sclera & Conjunctiva Disorders"),
        ("disorders_uvea_retina", "Uvea & Retina Disorders"),
        ("glaucoma", "Glaucoma"),
        ("neuro_strabismus", "Neuro-ophthalmology & Strabismus"),
        ("systemic_disease", "Systemic Disease & the Eye"),
    ],
    "CLINICAL": [
        # ("ocular_emergencies", ...) REMOVED — now in FOUNDATIONS
        ("red_eye", "Red Eye Differential"),
        ("triage", "Triage Categories"),
        ("history_taking", "History Taking"),
        ("distance_va", "Distance Visual Acuity"),
        ("near_vision", "Near Vision"),
        ("pinhole", "Pinhole Testing"),
        ("iop_nct", "IOP & Non-Contact Tonometry"),
        ("eye_drops", "Eye Drop Instillation"),
        ("pupil_dilation", "Pupil Dilation"),
        ("colour_vision", "Colour Vision (Ishihara)"),
        ("amsler_macula", "Amsler & Macula"),
        ("fall_risk", "Fall Risk"),
        ("perioperative", "Pre & Post-Operative Care"),
        ("abbreviations", "Ophthalmic Abbreviations"),
    ],
    "OT": [ ... unchanged ... ],  # keep existing 15; OT gap-fill added in Task 7
}

def pool_for_role(role: str) -> str:
    return "OT" if (role or "").upper() == "OT" else "CLINICAL"

def pools_for(role: str) -> list[str]:
    """Pools a role studies, Foundations first, then its procedural pool."""
    return ["FOUNDATIONS", pool_for_role(role)]

def topics_for(role: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for pool in pools_for(role):
        out.extend(FLASHCARD_TOPICS[pool])
    return out
```

- [ ] **Step 4: Run to verify it passes**

Run: `python -m pytest tests/flashcards/test_foundations_taxonomy.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/flashcards/flashcard_sets.py tests/flashcards/test_foundations_taxonomy.py
git commit -m "feat(flashcards): add shared FOUNDATIONS pool + pools_for taxonomy"
```

---

## Task 3: Make static_cards lookups search across pools_for

**Files:**
- Modify: `tools/flashcards/static_cards.py:9859-9910`
- Test: `tests/flashcards/test_foundations_taxonomy.py` (append)

The 5 helpers (`get_set_cards`, `get_all_cards`, `set_card_counts`, `get_topic_cards`, `topic_card_counts`) currently read `FLASHCARDS.get(pool_for_role(role), {})` — a single pool. They must search every pool in `pools_for(role)` so Foundations topics resolve.

- [ ] **Step 1: Append the failing test**

```python
def test_get_topic_cards_resolves_foundations_topic():
    # Requires at least one authored card under FOUNDATIONS/pharmacology (Task 6).
    from tools.flashcards.static_cards import FLASHCARDS, get_topic_cards, topic_card_counts
    if "pharmacology" not in FLASHCARDS.get("FOUNDATIONS", {}):
        import pytest; pytest.skip("Foundations cards not generated yet")
    assert len(get_topic_cards("OT", "pharmacology")) > 0
    assert topic_card_counts("OT").get("pharmacology", 0) > 0
```

- [ ] **Step 2: Run to verify it fails or skips**

Run: `python -m pytest tests/flashcards/test_foundations_taxonomy.py -q`
Expected: the new test SKIPS (no Foundations cards yet) — that's fine; it becomes active after Task 6.

- [ ] **Step 3: Rewrite the 5 helpers** to iterate pools. Replace each `pool = FLASHCARDS.get(pool_for_role(role), {})` and its topic loop with a merge across `pools_for(role)`. Import `pools_for` at the top of `static_cards.py`. Example for `get_topic_cards`:

```python
from tools.flashcards.flashcard_sets import (
    DIFFICULTIES, pool_for_role, pools_for, topics_for, make_set_key,
)

def get_topic_cards(role: str, topic_key: str) -> list[dict]:
    """Mixed deck for a topic — searches Foundations then the role's pool."""
    for pool_name in pools_for(role):
        by_diff = FLASHCARDS.get(pool_name, {}).get(topic_key)
        if by_diff:
            out: list[dict] = []
            for difficulty in DIFFICULTIES:
                for c in by_diff.get(difficulty, []):
                    out.append(_tag(topic_key, difficulty, c))
            return out
    return []
```

Apply the same "iterate `pools_for(role)`, merge matches" pattern to `get_set_cards`, `get_all_cards`, `set_card_counts`, `topic_card_counts`. For the `*_counts` and `get_all_cards` helpers that loop `topics_for(role)`, look each topic up across `pools_for(role)`.

- [ ] **Step 4: Run the full flashcards + api suite to verify no regression**

Run: `python -m pytest tests/flashcards tests/api/test_flashcards_topics_tiers.py -q`
Expected: PASS (Foundations test still skips).

- [ ] **Step 5: Commit**

```bash
git add tools/flashcards/static_cards.py tests/flashcards/test_foundations_taxonomy.py
git commit -m "feat(flashcards): resolve card lookups across Foundations + role pool"
```

---

## Task 4: Build the KB-grounded MCQ generator tool

**Files:**
- Create: `tools/flashcards/generate_cards.py`
- Test: `tests/flashcards/test_generate_cards.py`

- [ ] **Step 1: Write the failing test (MOCK_MODE — no live calls)**

```python
# tests/flashcards/test_generate_cards.py
import os; os.environ.setdefault("MOCK_MODE", "1")
from tools.flashcards.generate_cards import build_prompt, validate_cards

SOURCE = "Timolol is a beta-blocker that lowers IOP by reducing aqueous production."

def test_build_prompt_includes_source_and_schema_rules():
    p = build_prompt("pharmacology", "Ocular Pharmacology", SOURCE, "easy", 6)
    assert "Ocular Pharmacology" in p and SOURCE in p
    assert "grounded" in p.lower() and "6" in p

def test_validate_cards_rejects_ungrounded_or_malformed():
    good = [{"stem": "How does timolol lower IOP?",
             "options": ["Reduces aqueous production", "Dilates pupil",
                         "Numbs cornea", "Stains epithelium"],
             "correct": [0], "qtype": "single", "kind": "theory",
             "explanation": "Timolol is a beta-blocker reducing aqueous production.",
             "reasoning_eligible": False}]
    assert validate_cards(good) == good
    bad = [{"stem": "", "options": ["a"], "correct": [5], "qtype": "single",
            "kind": "theory", "explanation": "", "reasoning_eligible": False}]
    assert validate_cards(bad) == []

def test_placeholder_cards_are_valid_and_flagged():
    from tools.flashcards.generate_cards import placeholder_cards, validate_cards
    pc = placeholder_cards("pharmacology", "Ocular Pharmacology", per_tier=4)
    assert set(pc) == {"easy", "medium", "hard"}
    for tier, cards in pc.items():
        assert len(cards) == 4
        assert validate_cards(cards) == [{k: c[k] for k in
            ("stem","options","correct","qtype","kind","explanation","reasoning_eligible")}
            for c in cards]
        assert all(c["placeholder"] for c in cards)
    # stems unique across the whole topic (no-duplicate-stem guard)
    stems = [c["stem"] for cards in pc.values() for c in cards]
    assert len(stems) == len(set(stems))
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/flashcards/test_generate_cards.py -q`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the generator**

```python
# tools/flashcards/generate_cards.py
"""KB-grounded flashcard MCQ generator (WAT tool).

For a topic: retrieve silly source chunks (tools.kb.search), ask Gemini for
tiered MCQs grounded ONLY in that text (strict JSON schema), validate, and emit
Python-dict blocks ready to paste into static_cards.py. Live Gemini calls cost
real money/quota — run only with explicit user go-ahead. Tests run in MOCK_MODE.
"""
from __future__ import annotations
import json

CARD_KEYS = {"stem", "options", "correct", "qtype", "kind", "explanation", "reasoning_eligible"}

def build_prompt(topic_key: str, label: str, source_text: str, tier: str, n: int) -> str:
    return (
        f"You are writing {n} '{tier}'-difficulty exam MCQs for the topic "
        f"'{label}' for SNEC allied-health students. Use ONLY facts grounded in "
        f"the SOURCE below — never invent. Each MCQ: 4 options, 'single' or "
        f"'multi' qtype, kind 'theory' or 'practical', a one-sentence model-answer "
        f"explanation. Return a JSON array of {n} objects with keys "
        f"{sorted(CARD_KEYS)}.\n\nSOURCE:\n{source_text}"
    )

def validate_cards(cards: list[dict]) -> list[dict]:
    """Drop any card that is not a well-formed MCQ (mirrors test_static_cards_integrity)."""
    out = []
    for c in cards:
        try:
            if not (isinstance(c.get("stem"), str) and c["stem"].strip()): continue
            opts = c.get("options"); 
            if not (isinstance(opts, list) and len(opts) >= 2): continue
            if c.get("qtype") not in ("single", "multi"): continue
            if c.get("kind") not in ("theory", "practical"): continue
            if not (isinstance(c.get("explanation"), str) and c["explanation"].strip()): continue
            corr = c.get("correct")
            if not (isinstance(corr, list) and corr and all(0 <= i < len(opts) for i in corr)): continue
            if c["qtype"] == "single" and len(corr) != 1: continue
            if c["qtype"] == "multi" and len(corr) < 2: continue
            out.append({k: c[k] for k in CARD_KEYS if k in c})
        except Exception:
            continue
    return out

def generate_topic(topic_key: str, label: str, per_tier: int = 7) -> dict[str, list[dict]]:
    """Retrieve chunks + call Gemini per tier. Returns {tier: [cards]}. Live call."""
    from tools.kb.search import search, format_context
    from tools.shared.gemini_client import generate_json  # existing helper
    chunks = search(label, top_k=8)
    source = format_context(chunks)
    result: dict[str, list[dict]] = {}
    for tier in ("easy", "medium", "hard"):
        raw = generate_json(build_prompt(topic_key, label, source, tier, per_tier))
        cards = raw if isinstance(raw, list) else raw.get("cards", [])
        result[tier] = validate_cards(cards)
    return result

def placeholder_cards(topic_key: str, label: str, per_tier: int = 4) -> dict[str, list[dict]]:
    """Structurally-valid, clearly-marked stub cards so the pipeline is testable
    WITHOUT any Gemini call. Real cards replace these later (generate_topic).
    Stems are unique (topic+tier+index) to satisfy the no-duplicate-stem guards."""
    out: dict[str, list[dict]] = {}
    for tier in ("easy", "medium", "hard"):
        cards = []
        for i in range(1, per_tier + 1):
            cards.append({
                "stem": f"[PLACEHOLDER] {label} — {tier} question {i} (pending KB-grounded generation)",
                "options": ["Placeholder option A", "Placeholder option B",
                            "Placeholder option C", "Placeholder option D"],
                "correct": [0], "qtype": "single", "kind": "theory",
                "explanation": "[PLACEHOLDER — to be generated from silly.]",
                "reasoning_eligible": False, "placeholder": True,
            })
        out[tier] = cards
    return out

def emit_python_block(topic_key: str, by_tier: dict[str, list[dict]]) -> str:
    """Pretty-print a `"topic_key": {tier: [...]}` block for static_cards.py."""
    return f'        "{topic_key}": ' + json.dumps(by_tier, indent=12, ensure_ascii=False) + ","

if __name__ == "__main__":  # manual, gated run
    import sys
    tk, lbl = sys.argv[1], sys.argv[2]
    print(emit_python_block(tk, generate_topic(tk, lbl)))
```

> If `tools.shared.gemini_client` has no `generate_json`, use the module's existing text+JSON helper and `json.loads` the response; confirm the exact name before Step 3 by reading `tools/shared/gemini_client.py`.

- [ ] **Step 4: Run to verify it passes**

Run: `python -m pytest tests/flashcards/test_generate_cards.py -q`
Expected: PASS (uses only `build_prompt` + `validate_cards`; no live call).

- [ ] **Step 5: Commit**

```bash
git add tools/flashcards/generate_cards.py tests/flashcards/test_generate_cards.py
git commit -m "feat(flashcards): reusable KB-grounded MCQ generator (mock-tested)"
```

---

## Task 5: Insert PLACEHOLDER Foundations cards (no Gemini)

**Files:**
- Create: `tools/flashcards/seed_placeholder_cards.py`
- Modify: `tools/flashcards/static_cards.py` (add `"FOUNDATIONS": {...}` block)

Per the standing rule (`feedback_gemini_placeholders_first`), we wire the full
pipeline with placeholders now and defer the live paid generation to Task 5b.

- [ ] **Step 1: Write a one-shot seeder** that prints the FOUNDATIONS block.

```python
# tools/flashcards/seed_placeholder_cards.py
"""One-shot: print a placeholder FOUNDATIONS block for static_cards.py.
No Gemini. Real cards replace these via generate_cards.py (Task 5b)."""
import sys; sys.path.insert(0, ".")
from tools.flashcards.flashcard_sets import FLASHCARD_TOPICS
from tools.flashcards.generate_cards import placeholder_cards

def main() -> None:
    print('    "FOUNDATIONS": {')
    for tk, label in FLASHCARD_TOPICS["FOUNDATIONS"]:
        by_tier = placeholder_cards(tk, label)
        print(f'        "{tk}": ' + repr(by_tier).replace("True", "True") + ",")
    print("    },")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Generate the block and paste it** into `FLASHCARDS` as a new top-level `"FOUNDATIONS": {...}` key in `static_cards.py`.

Run: `python tools/flashcards/seed_placeholder_cards.py`
Then paste (reformatted to match file style) as the FOUNDATIONS pool.

- [ ] **Step 3: Run the integrity + taxonomy suite**

Run: `python -m pytest tests/flashcards -q`
Expected: PASS — `test_static_cards_integrity` validates the placeholder MCQs (they are structurally valid, unique stems); the Task 3 Foundations test now runs (not skips) and passes.

- [ ] **Step 4: Commit**

```bash
git add tools/flashcards/seed_placeholder_cards.py tools/flashcards/static_cards.py
git commit -m "feat(flashcards): placeholder Foundations card bank (pending KB generation)"
```

---

## Task 5b (DEFERRED — GATED paid run): replace placeholders with real cards

Do NOT run until the user gives an explicit go-ahead in the conversation.

- [ ] **Step 1: Confirm the paid run.** State the estimated call count (11 Foundations + OT gap-fill topics × 3 tiers) and wait for "yes".
- [ ] **Step 2: Generate** each topic: `python tools/flashcards/generate_cards.py <topic_key> "<Label>"`.
- [ ] **Step 3: Verify** every card against its source chunk (fact in SOURCE, correct index right, no hallucinated drug/dose/anatomy). Reject wrong-but-plausible cards.
- [ ] **Step 4: Replace** the corresponding placeholder blocks in `static_cards.py` with the verified cards (removing the `"placeholder": True` flag).
- [ ] **Step 5:** `python -m pytest tests/flashcards tests/content -q` → PASS, and the placeholder-tracking test (Task 7) now reports 0 remaining. Commit.

---

## Task 6: OT procedural gap-fill

**Files:**
- Modify: `tools/flashcards/flashcard_sets.py` (OT pool)
- Modify: `tools/flashcards/static_cards.py` (OT cards)

- [ ] **Step 1: Confirm the OT-manual gaps.** Read the SNEC "Procedure Manual of Ophthalmic Investigations" Chapter 5 TOC (via `tools/kb/search.py "Investigation Diagnostic Procedures"`). Add any OT procedure not already a topic. Known gaps to add: `aberrometry` ("Aberrometry"), `lens_meter` ("Lens Meter / Focimetry"), `retinal_imaging` ("Retinal Imaging & Photography"), `dr_grading` ("Diabetic Retinopathy Grading (SORC)").

- [ ] **Step 2: Add the OT topics** to `FLASHCARD_TOPICS["OT"]` in `flashcard_sets.py`.

- [ ] **Step 3: Insert placeholder cards** for the new OT topics via `placeholder_cards()` (same as Task 5 — no Gemini), pasted under the `"OT"` pool in `static_cards.py`. Real cards come in Task 5b.

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/flashcards -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/flashcards/flashcard_sets.py tools/flashcards/static_cards.py
git commit -m "feat(flashcards): OT gap-fill topics (aberrometry, lens meter, retinal imaging, DR grading)"
```

---

## Task 7: Coverage regression test

**Files:**
- Create: `tests/content/__init__.py`
- Create: `tests/content/test_coverage.py`

- [ ] **Step 1: Write the coverage test**

```python
# tests/content/test_coverage.py
"""Guards the silly->flashcards coverage mandate: every knowledge domain and
every role-tagged procedure has a flashcard topic with cards in all tiers."""
from tools.flashcards.flashcard_sets import FLASHCARD_TOPICS, DIFFICULTIES, topics_for
from tools.flashcards.static_cards import FLASHCARDS, topic_card_counts

REQUIRED_FOUNDATION_KEYS = {
    "anatomy_physiology", "microbiology_infection", "pharmacology",
    "ocular_emergencies", "professional_ethics",
    "disorders_eyelid_lacrimal_orbit", "disorders_cornea_conjunctiva",
    "disorders_uvea_retina", "glaucoma", "neuro_strabismus", "systemic_disease",
}
MIN_CARDS_PER_TOPIC = 12  # ~4 per tier

def test_all_foundation_domains_are_topics():
    keys = {k for k, _ in FLASHCARD_TOPICS["FOUNDATIONS"]}
    missing = REQUIRED_FOUNDATION_KEYS - keys
    assert not missing, f"knowledge domains missing from taxonomy: {missing}"

def test_every_topic_has_cards_in_all_tiers_for_every_role():
    for role in ("OA", "PSA", "OT"):
        for topic_key, label in topics_for(role):
            for pool in FLASHCARDS:
                by_diff = FLASHCARDS[pool].get(topic_key)
                if by_diff:
                    for tier in DIFFICULTIES:
                        assert by_diff.get(tier), f"{role}/{topic_key} empty tier {tier}"
                    break
            else:
                raise AssertionError(f"{role}/{topic_key} has NO cards in any pool")
            assert topic_card_counts(role).get(topic_key, 0) >= MIN_CARDS_PER_TOPIC, (
                f"{role}/{topic_key} under {MIN_CARDS_PER_TOPIC} cards")

def _placeholder_topics() -> set[str]:
    out = set()
    for pool, topics in FLASHCARDS.items():
        for tk, by_diff in topics.items():
            if any(c.get("placeholder") for cards in by_diff.values() for c in cards):
                out.add(tk)
    return out

import pytest

@pytest.mark.xfail(reason="Foundations/OT cards are placeholders until Task 5b live generation")
def test_no_placeholder_cards_remain():
    assert _placeholder_topics() == set(), f"still placeholder: {sorted(_placeholder_topics())}"
```

The `xfail` marker means this test does not block CI while placeholders exist; after Task 5b generates real cards it flips to XPASS, and we remove the marker to lock in the mandate (zero placeholders = full real coverage).

- [ ] **Step 2: Run it**

Run: `python -m pytest tests/content/test_coverage.py -q`
Expected: PASS (all topics populated after Tasks 5–6). If a topic fails, generate its cards before proceeding — that IS the mandate enforcing itself.

- [ ] **Step 3: Commit**

```bash
git add tests/content/__init__.py tests/content/test_coverage.py
git commit -m "test(content): coverage guard — every silly domain has flashcards for every role"
```

---

## Task 8: Group Foundations vs procedures in the fan

**Files:**
- Modify: `frontend/src/aurora/components/flashcards/StepTopic.tsx`

- [ ] **Step 1: Tag each fan card with its group.** In `StepTopic.tsx`, the sets come from `/api/flashcards/topics` in `topics_for` order (Foundations first). Split into a "Foundations" group and a "<role> Skills" group by matching the 11 Foundation keys, and pass a `group` label into `FanCard` so the carousel can show a section chip. Keep "Mixed" first.

```tsx
const FOUNDATION_KEYS = new Set([
  "anatomy_physiology","microbiology_infection","pharmacology","ocular_emergencies",
  "professional_ethics","disorders_eyelid_lacrimal_orbit","disorders_cornea_conjunctiva",
  "disorders_uvea_retina","glaucoma","neuro_strabismus","systemic_disease",
]);
// when mapping sets -> FanCard:
group: FOUNDATION_KEYS.has(s.topic_key) ? "Foundations" : "Skills",
```

Add an optional `group?: string` to the `FanCard` type and render it as a small caption on the focused card (reuse existing caption styling; no new colors).

- [ ] **Step 2: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS, no type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/flashcards/StepTopic.tsx frontend/src/aurora/components/flashcards/CardFanCarousel.tsx
git commit -m "feat(flashcards): group Foundations vs role Skills in the topic fan"
```

---

## Task 9: Update existing tests + full verification + ship

**Files:**
- Modify: `tests/flashcards/test_flashcard_sets.py`

- [ ] **Step 1: Update topic-count expectations.** Any assertion expecting 15 topics per role now expects `11 + 14 = 25` (OA/PSA) or `11 + 15 + gapfill` (OT). Update to assert `FOUNDATION_KEYS <= topics` and pool membership rather than a magic count where possible.

Run: `python -m pytest tests/flashcards/test_flashcard_sets.py -q`
Expected: PASS.

- [ ] **Step 2: Full backend suite (CI parity)**

Run: `python -m pytest -q`
Expected: PASS (target: prior green count + new tests).

- [ ] **Step 3: Frontend gates**

Run: `cd frontend && npm run typecheck && npm run build`
Then warm the standalone server and run: `node frontend/tests/aurora_assert.mjs`
Expected: typecheck/build clean; aurora_assert all green (fan renders Foundations cards via hue fallback).

- [ ] **Step 4: DO NOT push placeholder content to main.** `main` auto-deploys to prod; placeholder cards must not reach students. Keep all work as local commits (or a branch) until Task 5b replaces placeholders with real KB-grounded cards. Only after Task 5b + green `pytest`/`typecheck`/`build`/`aurora_assert` do we push:

```bash
git add -A
git commit -m "feat(flashcards): complete Foundations coverage across all roles"
git push origin main   # ONLY after Task 5b — never with placeholders live
```

Confirm Render auto-deploy is healthy after push.

---

## Notes for the executor
- Per-topic Nano-Banana images for new Foundations topics are **out of scope** — the fan's hue-placeholder fallback covers them. A later polish task can add them via `tools/media/generate_flashcards_topics.py`.
- OSCE OA/PSA merge is a **separate plan** (`2026-07-02-osce-oa-psa-merge.md`), to be written after this ships.
- **Placeholders-first (standing rule `feedback_gemini_placeholders_first`):** Tasks 5 and 6 insert placeholder cards with zero Gemini calls; the only live/paid step is the deferred, explicitly-gated **Task 5b**. Do not push placeholder content to `main` (prod) — hold the push until Task 5b lands real cards.
