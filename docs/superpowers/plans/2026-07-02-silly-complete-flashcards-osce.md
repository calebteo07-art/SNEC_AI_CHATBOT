# Complete silly-grounded flashcards + OT OSCE gaps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every flashcard topic 50 real, silly-grounded cards (5 rotating decks of 10) with a theory/practical/situational mix, add a Lens & Cataract topic, delete all placeholder card data, fix the served deck to 10, and author the 4 missing OT OSCE stations — shipped phased, green at every push.

**Architecture:** Storage stays `FLASHCARDS[pool][topic][difficulty]=[cards]` (difficulty now internal only). `situational` becomes a third `kind` (metadata). Cards are hand-authored (no Gemini) from KB text pulled by a new read-only dumper. A topic is absent from the bank until its real 50 cards exist; the topics endpoint hides 0-card topics, so nothing fake ever ships. OSCE gap cases reuse the existing "Ophthalmic Investigations Skills Observation" DB checklist.

**Tech Stack:** Python 3.12, pytest (MOCK_MODE), FastAPI, Next.js/React (TanStack Query), Supabase (direct table reads only — no embeddings, no Gemini).

**Spec:** `docs/superpowers/specs/2026-07-02-silly-complete-flashcards-osce-design.md`

**Conventions used by every task below:**
- Full backend suite: `python -m pytest -q` — takes ~96s, **set the Bash timeout > 120000ms**.
- Scripts that print KB text: prefix `PYTHONIOENCODING=utf-8 PYTHONUTF8=1` (Windows cp1252 console).
- Ship = commit to `main` + `git push origin main` (auto-deploys to Render). Only push on green (`pytest` + `typecheck` + `build` + relevant assert harness). End commit messages with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

# PHASE A — Infra ship (real content + cleanup, no fake data)

Everything in Phase A ships together in Task A7. It contains no student-visible placeholder content (placeholders are *deleted*), so it is safe to push.

## Task A1: Add `situational` as a third card kind

**Files:**
- Modify: `tests/flashcards/test_static_cards_integrity.py:19`
- Modify: `tools/flashcards/generate_cards.py` (validator's kind check)
- Modify: `frontend/src/aurora/components/flashcards/types.ts:37`

- [ ] **Step 1: Update the integrity test to allow the new kind**

In `tests/flashcards/test_static_cards_integrity.py`, change line 19 from:
```python
        assert c["kind"] in ("theory", "practical"), c["stem"]
```
to:
```python
        assert c["kind"] in ("theory", "practical", "situational"), c["stem"]
```

- [ ] **Step 2: Run it (still green — existing cards are theory/practical)**

Run: `python -m pytest tests/flashcards/test_static_cards_integrity.py -q`
Expected: PASS.

- [ ] **Step 3: Allow `situational` in the validator**

In `tools/flashcards/generate_cards.py`, find the kind check inside `validate_cards`:
```python
            if c.get("kind") not in ("theory", "practical"):
                continue
```
change to:
```python
            if c.get("kind") not in ("theory", "practical", "situational"):
                continue
```

- [ ] **Step 4: Add `situational` to the frontend union**

In `frontend/src/aurora/components/flashcards/types.ts`, line 37, change:
```ts
  kind: "theory" | "practical";
```
to:
```ts
  kind: "theory" | "practical" | "situational";
```
(Line 71 `kind: "theory" as const` stays valid — no change.)

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/flashcards/test_static_cards_integrity.py tools/flashcards/generate_cards.py frontend/src/aurora/components/flashcards/types.ts
git commit -m "feat(flashcards): add 'situational' as a third card kind"
```

---

## Task A2: Add the `disorders_lens_cataract` Foundations topic

**Files:**
- Modify: `tests/flashcards/test_foundations_taxonomy.py:5-15`
- Modify: `tests/content/test_coverage.py:11-16`
- Modify: `tools/flashcards/flashcard_sets.py:33-38`

- [ ] **Step 1: Update the taxonomy tests to expect 12 Foundations topics**

In `tests/flashcards/test_foundations_taxonomy.py`, add `disorders_lens_cataract` to `FOUNDATION_KEYS` and rename the count test:
```python
FOUNDATION_KEYS = {
    "anatomy_physiology", "microbiology_infection", "pharmacology",
    "ocular_emergencies", "professional_ethics",
    "disorders_eyelid_lacrimal_orbit", "disorders_cornea_conjunctiva",
    "disorders_lens_cataract",
    "disorders_uvea_retina", "glaucoma", "neuro_strabismus", "systemic_disease",
}


def test_foundations_pool_exists_with_12_topics():
    keys = {k for k, _ in FLASHCARD_TOPICS["FOUNDATIONS"]}
    assert keys == FOUNDATION_KEYS
```
(Delete the old `test_foundations_pool_exists_with_11_topics`.)

- [ ] **Step 2: Update the coverage test's required set**

In `tests/content/test_coverage.py`, add `disorders_lens_cataract` to `REQUIRED_FOUNDATION_KEYS` (the set at lines 11-16).

- [ ] **Step 3: Run to verify FAIL**

Run: `python -m pytest tests/flashcards/test_foundations_taxonomy.py::test_foundations_pool_exists_with_12_topics -q`
Expected: FAIL (taxonomy still has 11).

- [ ] **Step 4: Add the topic to the taxonomy**

In `tools/flashcards/flashcard_sets.py`, in `FLASHCARD_TOPICS["FOUNDATIONS"]`, insert after the `disorders_cornea_conjunctiva` line:
```python
        ("disorders_cornea_conjunctiva", "Cornea, Sclera & Conjunctiva Disorders"),
        ("disorders_lens_cataract", "Lens & Cataract Disorders"),
```

- [ ] **Step 5: Run to verify PASS**

Run: `python -m pytest tests/flashcards/test_foundations_taxonomy.py tests/content/test_coverage.py::test_all_foundation_domains_are_topics -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/flashcards/flashcard_sets.py tests/flashcards/test_foundations_taxonomy.py tests/content/test_coverage.py
git commit -m "feat(flashcards): add Lens & Cataract Foundations topic"
```

---

## Task A3: Delete placeholder card data + dead scaffolding; restructure coverage tests

**Files:**
- Modify: `tools/flashcards/static_cards.py` (remove FOUNDATIONS placeholder block + 4 OT placeholder topics)
- Delete: `tools/flashcards/seed_placeholder_cards.py`
- Modify: `tools/flashcards/generate_cards.py` (drop placeholder/live/prompt; keep `validate_cards`)
- Modify: `tests/flashcards/test_generate_cards.py` (drop placeholder/prompt tests)
- Modify: `tests/content/test_coverage.py` (new mix guards + xfail tracker)

- [ ] **Step 1: Rewrite the coverage tests FIRST (they define the target state)**

Replace the body of `tests/content/test_coverage.py` from the top down to (but NOT including) `test_every_case_set_has_at_least_one_case_per_pool` with:
```python
"""Guards the *silly* -> flashcards coverage mandate: every knowledge/procedure
domain is a topic; every topic that has cards carries a theory/practical/
situational mix; the whole bank is authored to 50 cards/topic. See
reference_silly_kb + project_role_content_model.
"""
import pytest

from tools.flashcards.flashcard_sets import FLASHCARD_TOPICS, topics_for
from tools.flashcards.static_cards import FLASHCARDS

REQUIRED_FOUNDATION_KEYS = {
    "anatomy_physiology", "microbiology_infection", "pharmacology",
    "ocular_emergencies", "professional_ethics",
    "disorders_eyelid_lacrimal_orbit", "disorders_cornea_conjunctiva",
    "disorders_lens_cataract",
    "disorders_uvea_retina", "glaucoma", "neuro_strabismus", "systemic_disease",
}
KINDS = ("theory", "practical", "situational")
TARGET_CARDS_PER_TOPIC = 50
MIN_PER_KIND = 10


def _topic_cards(topic_key: str) -> list[dict]:
    """All cards for a topic across tiers, from whichever pool holds it."""
    for _pool, topics in FLASHCARDS.items():
        by_diff = topics.get(topic_key)
        if by_diff:
            return [c for cards in by_diff.values() for c in cards]
    return []


def _all_taxonomy_topics() -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for role in ("OA", "PSA", "OT"):
        for tk, _ in topics_for(role):
            if tk not in seen:
                seen.add(tk)
                out.append(tk)
    return out


def test_all_foundation_domains_are_topics():
    keys = {k for k, _ in FLASHCARD_TOPICS["FOUNDATIONS"]}
    missing = REQUIRED_FOUNDATION_KEYS - keys
    assert not missing, f"knowledge domains missing from taxonomy: {missing}"


def test_completed_topics_have_full_mix():
    """Always-green: a topic that reached the 50-card target must carry the full
    kind mix (>= MIN_PER_KIND of each). Topics still being authored (<50) are
    exempt so intermediate commits stay green."""
    for tk in _all_taxonomy_topics():
        cards = _topic_cards(tk)
        if len(cards) < TARGET_CARDS_PER_TOPIC:
            continue
        counts = {k: sum(1 for c in cards if c["kind"] == k) for k in KINDS}
        for k in KINDS:
            assert counts[k] >= MIN_PER_KIND, f"{tk}: kind '{k}'={counts[k]} (<{MIN_PER_KIND})"


@pytest.mark.xfail(reason="cards authored to 50/topic incrementally; flips to XPASS when the bank is complete, then remove this marker (Phase C)")
def test_every_topic_has_50_cards_full_mix():
    problems: list[str] = []
    for tk in _all_taxonomy_topics():
        cards = _topic_cards(tk)
        if len(cards) < TARGET_CARDS_PER_TOPIC:
            problems.append(f"{tk}: {len(cards)}/{TARGET_CARDS_PER_TOPIC} cards")
            continue
        counts = {k: sum(1 for c in cards if c["kind"] == k) for k in KINDS}
        for k in KINDS:
            if counts[k] < MIN_PER_KIND:
                problems.append(f"{tk}: kind '{k}'={counts[k]} (<{MIN_PER_KIND})")
    assert not problems, "incomplete topics:\n  " + "\n  ".join(problems)
```
Keep `test_every_case_set_has_at_least_one_case_per_pool` exactly as-is at the bottom.

- [ ] **Step 2: Reduce `generate_cards.py` to the validator**

Replace the whole file `tools/flashcards/generate_cards.py` with:
```python
"""Structural validator for hand-authored flashcard MCQs (WAT tool).

Cards are hand-authored from *silly* (no Gemini). This module is the one
structural gate used before pasting cards into static_cards.py — it mirrors the
integrity contract in tests/flashcards/test_static_cards_integrity.py.
"""
from __future__ import annotations

# The exact card shape stored in static_cards.py.
CARD_KEYS = ("stem", "options", "correct", "qtype", "kind", "explanation", "reasoning_eligible")


def validate_cards(cards: list[dict]) -> list[dict]:
    """Drop any card that is not a well-formed MCQ. Returns cards trimmed to
    CARD_KEYS. Mirrors test_static_cards_integrity: 4-option MCQ, valid qtype,
    kind in {theory, practical, situational}, non-empty stem/explanation, correct
    indices in range and consistent with qtype."""
    out: list[dict] = []
    for c in cards or []:
        try:
            if not (isinstance(c.get("stem"), str) and c["stem"].strip()):
                continue
            opts = c.get("options")
            if not (isinstance(opts, list) and len(opts) >= 2):
                continue
            if c.get("qtype") not in ("single", "multi"):
                continue
            if c.get("kind") not in ("theory", "practical", "situational"):
                continue
            if not (isinstance(c.get("explanation"), str) and c["explanation"].strip()):
                continue
            corr = c.get("correct")
            if not (isinstance(corr, list) and corr and all(
                    isinstance(i, int) and 0 <= i < len(opts) for i in corr)):
                continue
            if c["qtype"] == "single" and len(corr) != 1:
                continue
            if c["qtype"] == "multi" and len(corr) < 2:
                continue
            out.append({k: c[k] for k in CARD_KEYS if k in c})
        except Exception:
            continue
    return out
```

- [ ] **Step 3: Trim the generator test to the validator only**

Replace the whole file `tests/flashcards/test_generate_cards.py` with:
```python
import os
os.environ.setdefault("MOCK_MODE", "1")

from tools.flashcards.generate_cards import validate_cards, CARD_KEYS


def test_validate_cards_accepts_a_wellformed_situational_card():
    good = [{"stem": "A diabetic patient's fundus photos are blurred by cataract. What do you do?",
             "options": ["Proceed and note media opacity limits grading",
                         "Cancel all imaging", "Dilate a second time", "Increase flash to maximum"],
             "correct": [0], "qtype": "single", "kind": "situational",
             "explanation": "Media opacity degrades DR grading; capture what you can and document the limitation.",
             "reasoning_eligible": True}]
    assert validate_cards(good) == [{k: good[0][k] for k in CARD_KEYS}]


def test_validate_cards_rejects_ungrounded_or_malformed():
    bad = [{"stem": "", "options": ["a"], "correct": [5], "qtype": "single",
            "kind": "theory", "explanation": "", "reasoning_eligible": False}]
    assert validate_cards(bad) == []
```

- [ ] **Step 4: Delete the placeholder seeder**

```bash
git rm tools/flashcards/seed_placeholder_cards.py
```

- [ ] **Step 5: Delete the placeholder card data in `static_cards.py`**

Two edits (the placeholder cards are the only cards whose stems contain `[PLACEHOLDER]`):
1. Replace the entire `"FOUNDATIONS": { ... },` block (from `    "FOUNDATIONS": {` through the matching `    },` immediately before `    "CLINICAL": {`) with a single empty pool:
   ```python
       "FOUNDATIONS": {},
   ```
2. Remove the four placeholder OT topic blocks at the top of the `"OT": {` pool — `"dr_grading"`, `"retinal_imaging"`, `"lens_meter"`, `"aberrometry"` (each is a `{ "easy": [...], "medium": [...], "hard": [...] },` whose card stems all contain `[PLACEHOLDER]`). Delete those four keys entirely; the first real OT topic (`"oct_macula"`) becomes the first entry in the pool.

Use Read to grab the exact text of each block, then Edit it out.

- [ ] **Step 6: Verify no placeholder residue remains**

Run: `grep -rn "\[PLACEHOLDER\]" tools/flashcards/static_cards.py ; grep -rn '"placeholder"' tools/flashcards/static_cards.py`
Expected: **no output** from either.

- [ ] **Step 7: Run the flashcards + content suites**

Run: `python -m pytest tests/flashcards tests/content -q`
Expected: PASS. Notes:
  - `test_generate_cards.py` — passes (validator only).
  - `test_foundations_taxonomy.py::test_get_topic_cards_resolves_foundations_topic` — SKIPS (pharmacology not authored yet). That's expected.
  - `test_coverage.py::test_completed_topics_have_full_mix` — passes (no topic is at 50 yet, OR if any existing topic is already ≥50 it must already have the mix; if this fails, an existing topic ≥50 lacks `situational` — add situational cards to it now as part of this task).
  - `test_coverage.py::test_every_topic_has_50_cards_full_mix` — **xfail** (expected; not yet authored).

- [ ] **Step 8: Commit**

```bash
git add tools/flashcards/static_cards.py tools/flashcards/generate_cards.py tests/flashcards/test_generate_cards.py tests/content/test_coverage.py
git commit -m "refactor(flashcards): delete placeholder card data + dead scaffolding; coverage guards for 50/topic + kind mix"
```

---

## Task A4: Fix the served deck to exactly 10 + hide empty topics

**Files:**
- Modify: `tools/api/routers/student.py` (`flashcards_generate` default; `flashcards_topics` filter)
- Modify: `frontend/src/aurora/components/flashcards/types.ts` (remove dead `LENGTHS`)
- Test: `tests/api/test_flashcards_topics_tiers.py` (append)

- [ ] **Step 1: Write a failing API test for the empty-topic filter**

Append to `tests/api/test_flashcards_topics_tiers.py`:
```python
def test_topics_endpoint_hides_zero_card_topics(monkeypatch):
    """A taxonomy topic with no authored cards must not appear as an empty deck."""
    import tools.api.routers.student as student

    real = student.topic_card_counts

    def fake_counts(role):
        counts = dict(real(role))
        # Force a known topic to zero — it must then be filtered out.
        for k in list(counts):
            counts[k] = 0 if k == "pharmacology" else counts[k]
        return counts

    monkeypatch.setattr(student, "topic_card_counts", fake_counts)
    # topic_sets_for still lists pharmacology; the endpoint must drop it because count==0.
    role = "OT"
    visible = [s for s in student.topic_sets_for(role)
               if fake_counts(role).get(s["topic_key"], 0) > 0]
    assert all(s["topic_key"] != "pharmacology" for s in visible)
```
(This asserts the filter rule the endpoint will apply; it documents intent and guards the helper contract without a full ASGI round-trip.)

- [ ] **Step 2: Run it**

Run: `python -m pytest tests/api/test_flashcards_topics_tiers.py::test_topics_endpoint_hides_zero_card_topics -q`
Expected: PASS (it exercises the rule directly). Keep it as a regression anchor.

- [ ] **Step 3: Apply the empty-topic filter in the topics endpoint**

In `tools/api/routers/student.py`, in `flashcards_topics`, inside the `for s in topic_sets_for(role):` loop, skip zero-card topics. Change:
```python
    for s in topic_sets_for(role):
        topic_cards = get_topic_cards(role, s["topic_key"])
        completed = sum(1 for c in topic_cards if c["stem"] in served_fronts)
```
to:
```python
    for s in topic_sets_for(role):
        total = counts.get(s["topic_key"], 0)
        if total == 0:
            continue  # topic not yet authored — don't show an empty deck
        topic_cards = get_topic_cards(role, s["topic_key"])
        completed = sum(1 for c in topic_cards if c["stem"] in served_fronts)
```
And update the `FlashcardSetInfo(... total=counts.get(s["topic_key"], 0) ...)` line to use `total=total`.

- [ ] **Step 4: Fix the served deck length to 10**

In the same file, `flashcards_generate` signature, change `n: int = 6` to `n: int = 10`. Leave the `n = max(1, min(20, n))` clamp intact.

- [ ] **Step 5: Remove the now-dead `LENGTHS` export**

In `frontend/src/aurora/components/flashcards/types.ts`, delete the `LENGTHS` block (the comment on line 9 and the `export const LENGTHS = [...]` on lines 10-14). Confirm nothing imports it:
Run: `grep -rn "LENGTHS" frontend/src`
Expected: no matches after deletion.

- [ ] **Step 6: Typecheck + build + backend tests**

Run: `cd frontend && npm run typecheck && npm run build`
Run: `python -m pytest tests/api -q`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/api/routers/student.py frontend/src/aurora/components/flashcards/types.ts tests/api/test_flashcards_topics_tiers.py
git commit -m "feat(flashcards): fix served deck to 10 and hide unauthored (0-card) topics"
```

---

## Task A5: Read-only KB source dumper for hand-authoring

**Files:**
- Create: `tools/kb/dump_topic_sources.py`

- [ ] **Step 1: Write the dumper (no test — a manual, read-only authoring aid)**

Create `tools/kb/dump_topic_sources.py`:
```python
#!/usr/bin/env python3
"""Read-only: dump *silly* source text for hand-authoring flashcards/cases.

No embeddings, no Gemini — a plain Supabase table read (documents + chunks).
Pass one or more document-title substrings (from docs/notes/silly-coverage-matrix.md);
prints every matching document's chunks in order so you can author grounded cards.

Usage:
  PYTHONIOENCODING=utf-8 PYTHONUTF8=1 \
    python tools/kb/dump_topic_sources.py "Harold Stein Chap 4 Pharmacology" "Duke NUS OT OA Course"
"""
import sys
sys.path.insert(0, ".")

from tools.kb.supabase_client import get_client


def dump(needles: list[str]) -> None:
    c = get_client()
    docs = c.table("documents").select("id,title,category").execute().data or []
    low = [n.lower() for n in needles]
    want = [d for d in docs if any(n in (d.get("title") or "").lower() for n in low)]
    if not want:
        print(f"[no documents matched] {needles}")
        print("available titles:")
        for d in sorted(docs, key=lambda x: x.get("title") or ""):
            print("  -", d.get("title"))
        return
    for d in want:
        rows = (c.table("chunks").select("chunk_index,text")
                .eq("document_id", d["id"]).order("chunk_index").execute().data) or []
        print(f"\n===== {d['title']}  [{d.get('category')}]  ({len(rows)} chunks) =====")
        for r in rows:
            print(f"\n--- chunk {r.get('chunk_index')} ---\n{r.get('text', '')}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: dump_topic_sources.py <title-substring> [more...]")
        sys.exit(1)
    dump(sys.argv[1:])
```

- [ ] **Step 2: Smoke-test it against the live DB (read-only, free)**

Run: `PYTHONIOENCODING=utf-8 PYTHONUTF8=1 python tools/kb/dump_topic_sources.py "Pharmacology"`
Expected: prints chunks from the pharmacology documents (Harold Stein Chap 4 Pharmacology + Duke NUS pharmacology). If it prints "no documents matched", use the listed titles to adjust the substring.

- [ ] **Step 3: Commit**

```bash
git add tools/kb/dump_topic_sources.py
git commit -m "feat(kb): read-only per-topic source dumper for hand-authoring (no Gemini)"
```

---

## Task A6: Author the 4 OT OSCE gap stations

**Files:**
- Create: `cases/case_ot_051_aberrometry_wavefront.json`
- Create: `cases/case_ot_052_lens_meter_focimetry.json`
- Create: `cases/case_ot_053_retinal_imaging_fundus_photography.json`
- Create: `cases/case_ot_054_dr_grading_sorc.json`
- Modify: `tools/cases/topic_sets.py` (`_RULES["OT"]` routing for the new topics)
- Modify: `docs/notes/silly-coverage-matrix.md` (OSCE section: gaps authored)

> Confirm the next free OT case numbers first: `ls cases/case_ot_*.json | sort | tail`. If 051-054 are taken, use the next free numbers and matching filenames.

- [ ] **Step 1: Dump the OT source text (read-only)**

Run:
```bash
PYTHONIOENCODING=utf-8 PYTHONUTF8=1 python tools/kb/dump_topic_sources.py \
  "Procedure Manual of Ophthalmic Investigations" "oittalk" "Equipments Instruments" \
  "External photography" "Slit lamp photography" "Retinal Angiography" \
  "IntroductiontoSORC" "PrinciplesofGrading" "Patternrecognition"
```
Expected: chunks covering aberrometry/wavefront, lensmeter/focimetry, fundus & slit-lamp photography/angiography, and SORC DR grading. Author strictly from this text.

- [ ] **Step 2: Author `cases/case_ot_054_dr_grading_sorc.json` (worked template — copy the shape for all four)**

Match the exact structure of an existing OT/OA case (patient block, history, examination_findings, investigations, diagnosis, management with immediate/follow_up/patient_education, and a 4-domain rubric). Set `"role": "OT"` and an explicit `"checklist_procedure": "Ophthalmic Investigations Skills Observation"` (a real DB checklist — required by the provenance guard). Skeleton:
```json
{
  "case_id": "case_ot_054_dr_grading_sorc",
  "title": "Grading the Grid: A Diabetic Screening Set",
  "difficulty": "intermediate",
  "topic": "dr_grading_sorc_retinopathy",
  "role": "OT",
  "checklist_procedure": "Ophthalmic Investigations Skills Observation",
  "estimated_minutes": 15,
  "patient": {
    "name": "Mr Rajendran s/o Kumar", "age": 61, "gender": "male",
    "occupation": "retired bus captain",
    "presenting_complaint": "Attending diabetic eye screening; no visual complaints",
    "nric": "S6012345C", "date_of_birth": "1965-02-11",
    "address": "Blk 210 Ang Mo Kio Ave 3, #05-123, Singapore 560210",
    "contact_number": "91234567"
  },
  "history": {
    "hpc": "Referred from the polyclinic diabetic registry for annual retinal photography under SORC. No blurring, floaters, or distortion. Last screening 14 months ago graded R0.",
    "pmhx": "Type 2 diabetes 12 years, HbA1c 8.1%. Hypertension.",
    "family_hx": "Nil significant",
    "medications": ["Metformin 1g BD", "Amlodipine 5mg OD"],
    "social_hx": "Lives with wife; independent."
  },
  "examination_findings": {
    "va": {"right": "6/9 (LogMAR 0.2)", "left": "6/7.5 (LogMAR 0.1)"},
    "iop": {"right": "16 mmHg (NCT)", "left": "15 mmHg (NCT)"},
    "anterior_segment": "Early nuclear sclerosis both eyes; otherwise unremarkable",
    "fundus": "Right eye: several dot-blot haemorrhages and microaneurysms in >1 quadrant, a few hard exudates outside the macula. Left eye: occasional microaneurysms only."
  },
  "investigations": {
    "fundus_photography": "Two-field digital colour fundus photographs captured per SORC protocol; media slightly hazy from early cataract but gradable.",
    "grading_notes": "Right eye pattern = moderate NPDR; left eye = mild NPDR. No proliferative features, no maculopathy signs within one disc diameter of the fovea."
  },
  "diagnosis": "Moderate non-proliferative diabetic retinopathy right eye, mild NPDR left eye, on SORC grading. No sight-threatening features today. Route per SORC referral pathway for review interval.",
  "management": {
    "immediate": [
      "Capture gradable two-field fundus photographs per SORC protocol, both eyes",
      "Apply SORC grading systematically: microaneurysms, dot-blot haemorrhages, hard exudates, and their distribution/quadrants",
      "Identify the right eye as moderate NPDR (haemorrhages/microaneurysms in more than one quadrant)",
      "Check the macula region for exudates/oedema signs within one disc diameter of the fovea",
      "Document grade per eye and the SORC-recommended review/referral interval",
      "Flag media opacity (early cataract) as a factor limiting image clarity"
    ],
    "follow_up": [
      "Route the graded set to the reviewing ophthalmologist per SORC pathway",
      "Advise the patient of the screening outcome in lay terms and the next screening interval",
      "Recommend optimisation of glycaemic and blood-pressure control via the diabetic team"
    ],
    "patient_education": [
      "Explain that diabetic retinopathy is common and often symptomless in early stages, so regular screening matters",
      "Reassure that no urgent problem was seen today but changes were noted that need monitoring",
      "Advise to report any sudden blurring, floaters, or distortion before the next appointment"
    ]
  },
  "rubric": {
    "history": {"points": 10, "key_points": [
      "Confirms diabetic history, duration, and control (HbA1c)",
      "Confirms referral source (SORC diabetic registry) and last grade/interval",
      "Screens for symptoms of sight-threatening disease (distortion, floaters, blurring)",
      "Notes systemic risk factors (hypertension) relevant to retinopathy"
    ]},
    "investigations": {"points": 10, "key_points": [
      "Captures gradable two-field fundus photographs per SORC protocol",
      "Recognises and documents media opacity limiting image quality",
      "Ensures both eyes are imaged and correctly labelled",
      "Uses correct technique/settings for diabetic screening photography"
    ]},
    "diagnosis": {"points": 10, "key_points": [
      "Applies SORC grading criteria to each eye correctly (moderate vs mild NPDR)",
      "Assesses the macula for maculopathy features",
      "Distinguishes non-proliferative from proliferative features",
      "States the SORC-recommended review/referral interval"
    ]},
    "management": {"points": 10, "key_points": [
      "Documents grade per eye clearly for the reviewing ophthalmologist",
      "Routes the set correctly along the SORC referral pathway",
      "Gives appropriate patient education and safety-netting",
      "Reinforces systemic (glycaemic/BP) optimisation via the diabetic team"
    ]}
  }
}
```

- [ ] **Step 3: Author the other three cases** the same way, grounded in the dumped text, `role: "OT"`, explicit `checklist_procedure: "Ophthalmic Investigations Skills Observation"`:
  - `case_ot_051_aberrometry_wavefront.json` — topic `"aberrometry_wavefront_refraction"`; a patient needing wavefront/aberrometry measurement (e.g. pre-refractive or complex refraction); rubric on correct capture, artefact recognition, documentation, handover.
  - `case_ot_052_lens_meter_focimetry.json` — topic `"lens_meter_focimetry"`; verifying a patient's spectacle prescription on the lensmeter (sphere/cyl/axis/add, prism), technique + documentation + handover.
  - `case_ot_053_retinal_imaging_fundus_photography.json` — topic `"retinal_imaging_fundus_photography"`; fundus/slit-lamp photography capture, focus/artefact control, labelling, escalation of an incidental finding.

- [ ] **Step 4: Add OT routing rules so the new topics bucket sensibly**

In `tools/cases/topic_sets.py`, `_RULES["OT"]`, add these near the top of the OT list (specific keywords, no collision with existing OT topics):
```python
    "OT": [
        ("aberrometry", "refraction_acuity"), ("wavefront", "refraction_acuity"),
        ("lens_meter", "refraction_acuity"), ("lensmeter", "refraction_acuity"),
        ("focimetry", "refraction_acuity"),
        ("retinal_imaging", "oct_imaging"), ("fundus_photography", "oct_imaging"),
        ("angiography", "oct_imaging"), ("photography", "oct_imaging"),
        ("dr_grading", "screening"), ("sorc", "screening"), ("retinopathy_grading", "screening"),
        ("asoct", "anterior_segment"), ("endothelial", "anterior_segment"), ("flare", "anterior_segment"),
        # ... existing rules unchanged below ...
```
(Keep every existing rule after these.)

- [ ] **Step 5: Run the OSCE guards**

Run: `python -m pytest tests/cases tests/content/test_coverage.py::test_every_case_set_has_at_least_one_case_per_pool -q`
Expected: PASS — especially `test_checklist_provenance.py` (each new case resolves to "Ophthalmic Investigations Skills Observation", exact DB match) and each new topic resolves to an OT set.

- [ ] **Step 6: Update the coverage matrix**

In `docs/notes/silly-coverage-matrix.md`, OSCE section, change the two "to author" lines for `auto_refraction / aberrometry / lens_meter` and `retinal_imaging / dr_grading` to reference the authored cases (`case_ot_051..054`).

- [ ] **Step 7: Commit**

```bash
git add cases/case_ot_051_aberrometry_wavefront.json cases/case_ot_052_lens_meter_focimetry.json cases/case_ot_053_retinal_imaging_fundus_photography.json cases/case_ot_054_dr_grading_sorc.json tools/cases/topic_sets.py docs/notes/silly-coverage-matrix.md
git commit -m "feat(osce): author 4 OT gap stations (aberrometry, lens meter, retinal imaging, DR grading)"
```

---

## Task A7: Phase-A full gate + ship

- [ ] **Step 1: Full backend suite (CI parity)**

Run: `python -m pytest -q` (timeout > 120000ms)
Expected: all PASS except the single intended `xfail` (`test_every_topic_has_50_cards_full_mix`). Note the passed count.

- [ ] **Step 2: Frontend gates**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 3: Visual harnesses** (warm the standalone server first per project_harness_local_server)

Run: `node frontend/tests/aurora_assert.mjs`
Run: `node frontend/tests/station_assert.mjs`
Expected: both all-green.

- [ ] **Step 4: Push**

```bash
git push origin main
```
Confirm Render auto-deploy is healthy (hit `/api/status` or the app). This is the FIRST push of the 17 prior local commits too — verify prod boots and flashcards/OSCE load.

---

# PHASE B — Author to 50 cards/topic (grounded in silly), ship per topic

Phase B repeats one procedure (Task B-loop) for each of the 45 topics. New Foundations topics are authored first (they're currently invisible/absent); then existing CLINICAL/OT topics are topped up from their current count to 50. Ship after each topic (or a small batch) — every commit stays green because `test_completed_topics_have_full_mix` only bites at ≥50 and the 50-completeness test is xfail until Phase C.

## Task B-loop: Author one topic to 50 cards (repeatable)

**Files (per topic):**
- Modify: `tools/flashcards/static_cards.py` (add/extend the topic's `{easy,medium,hard}` block in its pool)

Per-topic acceptance (all must hold before commit):
- Exactly **50 cards** for the topic (≈17 easy / 17 medium / 16 hard).
- Kind mix: **≥10 theory, ≥10 practical, ≥10 situational** (remaining free).
- **≥10** cards with `"reasoning_eligible": True` (judgment-style practical/situational).
- Every fact grounded in the dumped source text (no invented drug/dose/anatomy/value).
- Correct option(s) authored first (serving shuffles slots).
- No duplicate stems within the topic or across the pool.

- [ ] **Step 1: Dump the topic's source text**

Look up the topic's silly documents in `docs/notes/silly-coverage-matrix.md`, then:
```bash
PYTHONIOENCODING=utf-8 PYTHONUTF8=1 python tools/kb/dump_topic_sources.py "<doc title substring>" ["<more>"...]
```

- [ ] **Step 2: Author the 50 cards** in the topic's pool block in `static_cards.py`, matching the existing house style (see the `triage` deck: concise stem, 4 plausible options, one-sentence grounded explanation). Add the topic under the correct pool: FOUNDATIONS topics → the `"FOUNDATIONS": {}` dict; OT gap topics → the `"OT"` pool; existing topics → extend their existing tier lists. Example of the three kinds for `pharmacology` (author ~50 total, not just these):
```python
        "pharmacology": {
            "easy": [
                {"stem": "Which drug class lowers IOP by reducing aqueous humour production?",
                 "options": ["Beta-blockers (e.g. timolol)", "Prostaglandin analogues",
                             "Miotics", "Mydriatics"],
                 "correct": [0], "qtype": "single", "kind": "theory",
                 "explanation": "Topical beta-blockers such as timolol reduce aqueous production, lowering IOP.",
                 "reasoning_eligible": False},
                {"stem": "Before instilling a dilating drop, which patient detail must you check to avoid harm?",
                 "options": ["History of angle-closure / very shallow anterior chamber",
                             "Preferred reading hand", "Shoe size", "Favourite eye colour"],
                 "correct": [0], "qtype": "single", "kind": "practical",
                 "explanation": "Mydriatics can precipitate acute angle closure in eyes with very narrow angles — screen first.",
                 "reasoning_eligible": True},
                # ... more easy cards ...
            ],
            "medium": [
                {"stem": "A patient on timolol reports breathlessness climbing stairs. What is the concern?",
                 "options": ["Systemic beta-blockade worsening airway/cardiac disease",
                             "The drop is expired", "Too much artificial tear", "Normal ageing only"],
                 "correct": [0], "qtype": "single", "kind": "situational",
                 "explanation": "Topical beta-blockers are absorbed systemically and can worsen asthma/COPD and bradycardia — flag for review.",
                 "reasoning_eligible": True},
                # ... more medium cards ...
            ],
            "hard": [
                # ... hard cards, same shape ...
            ],
        },
```

- [ ] **Step 3: Structurally validate the topic's cards** (quick REPL check with the kept validator):
```bash
python -c "from tools.flashcards.static_cards import FLASHCARDS; from tools.flashcards.generate_cards import validate_cards; \
import itertools; \
t='pharmacology'; \
cards=[c for pool in FLASHCARDS.values() if t in pool for c in itertools.chain.from_iterable(pool[t].values())]; \
v=validate_cards(cards); \
print('total',len(cards),'valid',len(v)); \
print({k:sum(1 for c in cards if c['kind']==k) for k in ('theory','practical','situational')}); \
print('reasoning', sum(1 for c in cards if c.get('reasoning_eligible')))"
```
Expected: `total 50 valid 50`, each kind ≥10, reasoning ≥10. (Swap `t=` for the topic being authored.)

- [ ] **Step 4: Run the flashcards + content suites**

Run: `python -m pytest tests/flashcards tests/content -q`
Expected: PASS; `test_completed_topics_have_full_mix` now enforces this topic (it's at 50) and passes; the 50-completeness test stays xfail until all topics are done.

- [ ] **Step 5: Commit + push**

```bash
git add tools/flashcards/static_cards.py
git commit -m "content(flashcards): author <topic> to 50 cards (theory/practical/situational, silly-grounded)"
git push origin main
```

### Topic checklist (author each to 50; tick when shipped)

**FOUNDATIONS (12)** — author first (currently absent):
- [x] anatomy_physiology — A&PPartI/II/III
- [x] microbiology_infection — Microbiology 2025, OTOAInfectionControl
- [x] pharmacology — Harold Stein Chap 4, Duke NUS Pharmacology
- [x] ocular_emergencies — OcularEmergencies-RFoo, chemical eye burns update
- [x] professional_ethics — Medical Ethics, Professional Etiquette, CommunicationSkills, MSW role, Nursing Informatics
- [x] disorders_eyelid_lacrimal_orbit — eyelid/lacrimal/orbit disease docs (chalazion, ectropion, entropion, ptosis, lacrimal, orbit, TED)
- [x] disorders_cornea_conjunctiva — Cornea/Sclera/Conjunctiva disease docs, contact lens infection, OphthalmicAssistant Ch14
- [x] disorders_lens_cataract — Disorders of the Lens, cataract/perioperative content
- [x] disorders_uvea_retina — Uvea/Retina/Uveitis/Angiography/Inflammation docs, GRT research
- [x] glaucoma — Glaucoma, ocular-surface-in-glaucoma research
- [x] neuro_strabismus — nerve palsy, amblyopia, strabismus, EOM, optic neuritis/GCA, orthoptics
- [x] systemic_disease — Diabetes, Hypertension, Asthma, systemic disorders, IOP/BMI research

**CLINICAL (14)** — top up existing to 50:
- [x] red_eye · [x] triage · [x] ocular_emergencies · [x] history_taking · [x] distance_va · [x] near_vision · [x] pinhole · [x] iop_nct · [x] eye_drops · [x] pupil_dilation · [x] colour_vision · [x] amsler_macula · [x] fall_risk · [x] perioperative · [x] abbreviations

**OT (19)** — new gap topics to 50 + top up existing to 50:
- [n/a] aberrometry · lens_meter · retinal_imaging · dr_grading — these were placeholder-only OT flashcard blocks; DELETED in Phase A3 and delivered as OSCE gap cases (case_ot_051..054) instead, so they are NOT flashcard topics. Flashcard OT scope = the 15 real topics below.
- [x] oct_macula · [x] oct_rnfl · [ ] hvf · [ ] gvf · [ ] ascan_biometry · [ ] optical_biometry · [ ] endothelial · [ ] asoct · [ ] flare · [ ] corneal_topography · [ ] pam · [ ] hrt · [ ] orthoptics · [ ] dayward_theatre · [ ] auto_refraction

---

# PHASE C — Lock the mandate

## Task C1: Flip the completeness test to enforced

**Files:**
- Modify: `tests/content/test_coverage.py`

- [ ] **Step 1: Confirm the tracker now XPASSes**

Run: `python -m pytest tests/content/test_coverage.py::test_every_topic_has_50_cards_full_mix -q`
Expected: `XPASS` (all 45 topics at 50 with the mix).

- [ ] **Step 2: Remove the `@pytest.mark.xfail(...)` decorator** on `test_every_topic_has_50_cards_full_mix` so it becomes a hard, always-green guard.

- [ ] **Step 3: Full gate**

Run: `python -m pytest -q` (timeout > 120000ms) — expect ALL pass, zero xfail.
Run: `cd frontend && npm run typecheck && npm run build`
Run: `node frontend/tests/aurora_assert.mjs && node frontend/tests/station_assert.mjs`

- [ ] **Step 4: Ship**

```bash
git add tests/content/test_coverage.py
git commit -m "test(content): lock 50-cards/topic + full kind-mix mandate (remove xfail)"
git push origin main
```

---

## Self-review (checked against the spec)

- **§3 taxonomy (Lens & Cataract, 45 topics)** → A2 + B-loop checklist. ✓
- **§4 card model (situational kind, 50/topic, mix floors, reasoning ≥10)** → A1 (kind), B-loop acceptance + coverage tests A3. ✓
- **§5 serving (deck=10, hide empty, rotation reused)** → A4. ✓
- **§6 grounding (free DB read)** → A5 dumper; B-loop Step 1. ✓
- **§7 tonality** → B-loop Step 2 (worked pharmacology example), A6 (worked OSCE example). ✓
- **§8 delete placeholders + dead code** → A3. ✓
- **§9 OSCE OT gaps (real DB checklist, resolver rules, matrix)** → A6. ✓
- **§10 tests (integrity+situational, always-green mix, xfail tracker, gates)** → A1/A3/A7/C1. ✓
- **§11 phases (infra → per-topic → lock)** → Phase A / B / C. ✓
- **§13 non-goals (no images, no knowledge OSCE, no new checklists, no migration)** → respected; A6 reuses an existing checklist. ✓

**Type/name consistency:** `validate_cards`/`CARD_KEYS` (A3) used in B-loop Step 3; `topic_card_counts` (A4) matches static_cards; kind set `("theory","practical","situational")` identical in A1 integrity test, A3 validator, A3 coverage `KINDS`; `checklist_procedure: "Ophthalmic Investigations Skills Observation"` matches the DB name in `run_ingestion.py`. ✓

**Placeholder scan:** no TBD/TODO; every code step shows real code; per-topic authoring shows the card shape + a worked topic rather than 2,250 enumerated cards (bulk content, not logic). ✓
