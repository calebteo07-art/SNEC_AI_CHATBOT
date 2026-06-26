# Flashcards v2 — MCQ bank, 3 tiers, instant deterministic scoring

**Date:** 2026-06-26
**Status:** Approved design (pre-implementation)
**Owner:** EyeBot / SNEC allied-health training

## Problem

The current flashcards feature has three pain points the user wants fixed:

1. **Shallow bank, repeats too soon.** Each `(topic, difficulty)` set holds only ~5
   open-ended cards. Students see repeats quickly.
2. **Slow grading.** Every card fires a per-card Gemini grading call
   (`POST /api/flashcards/check`) plus an artificial 850 ms "focus" delay before
   the reveal. Students wait on every single card.
3. **Free-text recall is hard to grade fast and fairly.** Open answers need an LLM
   to score, which is exactly what makes it slow and costs prod quota.

The user also wants: both **practical and theory** questions, **3 difficulty tiers**
(easy/medium/hard), **per-question model-answer reveal** (not a per-question score),
**deck-level scoring only** at the end with weak-topic advice and encouragement, and
**simple, encouraging language**.

## Goals

- Every card is **MCQ (single-answer) or multi-select**. Harder cards may add an
  optional typed-explanation prompt (self-check, not graded).
- **3 difficulty tiers**: easy, medium, hard.
- **Deeper bank**: target ~12 questions per topic per tier (≈1,080 total across
  15 topics × 3 tiers × 2 role pools) to make repeats rare.
- **Instant, deterministic grading** — no AI call in the study loop. Speed is the
  #1 priority.
- **Per-question reveal** shows the model answer (correct options + explanation),
  not a score.
- **Deck-level results screen**: "X / N correct", weakest topics to drill,
  encouraging coaching, all computed client-side in sub-second time.
- **Role gating preserved**: OT studies the OT pool; OA + PSA share the CLINICAL
  pool (already enforced by `pool_for_role`).

## Non-Goals

- No AI-generated, unreviewed clinical MCQs. Clinical accuracy is a hard wall;
  every question is hand-authored and grounded in the existing KB / Module-1 content.
- No re-skin of the flashcards UI. This is a mechanics change; the warm-cream
  "living eye" visual language is preserved.
- No anti-cheat hardening. The client receives the `correct` indices for instant
  grading — acceptable because the model answer is revealed after every card anyway.
  (If server-side grading were required it would re-add a per-card round-trip,
  defeating the speed goal.)
- No DB schema migration (see Data Persistence).

## Decisions (locked with the user)

| Decision | Choice |
|----------|--------|
| Bank depth | ~12 questions per topic per tier (≈1,080 total) |
| End-of-deck scoring | Instant deterministic (no AI) |
| Rollout | Build full engine now + 2-3 fully-authored template topics, then expand |
| Typed explanation (hard cards) | Self-check vs model explanation; **not** graded, does not affect score |
| Multi-select grading | **All-or-nothing** (exact correct set; no partial credit) |
| DB | **No migration**; static pool is source of truth, progress keyed on stem |
| Client grading | Client receives `correct`; grades locally for instant reveal |

---

## Architecture

### 1. Data model (`tools/flashcards/static_cards.py`, `flashcard_sets.py`)

Card shape changes from `{front, back}` to a self-contained MCQ:

```python
{
  "stem": "A welder presents 6h after grinding without goggles — severe pain, "
          "tearing, photophobia. Most likely?",
  "options": ["Acute angle-closure glaucoma", "Flash burn (photokeratitis)",
              "Bacterial conjunctivitis", "Subconjunctival haemorrhage"],
  "correct": [1],                 # indices into options; single = 1 index, multi = >=2
  "qtype": "single",              # "single" | "multi"
  "kind": "practical",            # "theory" | "practical"
  "explanation": "UV exposure causes a delayed-onset corneal epithelial burn ...",
  "requires_explanation": False,  # hard cards may set True (typed self-check reflection)
}
```

Taxonomy changes in `flashcard_sets.py`:
- `DIFFICULTIES = ["easy", "medium", "hard"]` (was `["easy", "medium"]`).
- `pool_for_role`, `topics_for`, `make_set_key`, `sets_for` unchanged in shape —
  they just now produce 3 tiers per topic (45 sets per pool, 90 total).

Authoring guidance (loose, not rigid quotas):
- **easy** leans theory/recall; **hard** leans practical clinical-reasoning and is
  where most `requires_explanation: True` cards live.
- Each tier mixes `kind: "theory"` and `kind: "practical"`.
- Distractors must be plausible and KB-grounded — no throwaway wrong options.

Serving helpers (`get_set_cards`, `get_all_cards`, `set_card_counts`) adapt to the
new shape. `_tag` still attaches `topic_tag` + `difficulty`. The static pool remains
the single source of truth for question content.

### 2. Grading — deterministic, client-side, instant

No Gemini call in the study loop. The browser grades by comparing the student's
selected option indices against `correct`:

- **Single (`qtype: "single"`)**: correct iff the one `correct` index is selected.
- **Multi (`qtype: "multi"`)**: **all-or-nothing** — correct iff the selected set
  equals `correct` exactly (no extra, none missing).

On submit, the card **immediately reveals the model answer**: correct option(s)
highlighted, any wrong pick marked, plus the `explanation` text. A ✓/✗ shows for
that card. **No running score is displayed** — the aggregate tally is end-only.

### 3. Typed explanation on hard cards (`requires_explanation: True`)

After selecting options, the student may type their reasoning. On reveal they see
the model `explanation` to **self-compare**. This is a reflection aid:
- It is **not AI-graded** (keeps the loop instant).
- It does **not** affect the deck score (which is pure MCQ correctness).

### 4. End-of-deck results screen (new, client-computed)

Replaces today's bounce-to-dashboard toast. Sub-second, fully deterministic:
- Big **"X / N correct"** numeral.
- **Per-topic breakdown** and the **1-2 weakest topics** (most misses) named:
  e.g. "Focus your next drill on Triage and Red Eye."
- **Encouraging, plain-language coaching** from score-tiered templates. Jargon only
  when it is the clearest word.
- Actions: **"Drill the N you missed"** (mini-deck of just the missed cards),
  **"New deck"**, **"Done"** (→ dashboard, still fires the existing completion
  toast/XP path).

### 5. Endpoints (`tools/api/routers/student.py`)

- `GET /api/flashcards/topics` — now returns 3 tiers per topic (otherwise unchanged:
  per-set total + completed counts for the picker).
- `GET /api/flashcards/generate` — returns the MCQ card shape (`stem`, `options`,
  `correct`, `qtype`, `kind`, `explanation`, `requires_explanation`, `topic_tag`,
  `difficulty`, `card_id`, SM-2 fields). Per-user no-repeat rotation unchanged
  (keyed on stem via the existing `pick_next_unseen` + served-stems mechanism).
- `POST /api/flashcards/complete` — **new, single batched call at deck end.** Body
  is the per-card results `[{card_id, correct: bool, ...}]`. It:
  - updates SM-2 schedule per card (deterministic quality: correct → good grade,
    missed → relearn), reusing the existing `next_review` / `update_card_sm2` /
    Celery `process_review` path;
  - syncs XP via the existing profile path.
  Returns the persisted XP/level for the results screen if needed.
- `POST /api/flashcards/check` — **removed.** The per-card AI grader is gone. Only
  the flashcards hook calls it today, so removal is contained.

XP model (encouraging, never punishing): **+10 per correct, +3 for an honest
attempt on a missed card, + session-complete bonus.** Replaces the AI-score→XP map.

### 6. Data persistence (no migration)

The Supabase `flashcards` table is unchanged. It stores per-student progress only:
- `front` = the question **stem** (identity / no-repeat key), `back` = the model
  `explanation` (for display/legacy), `source = "static"`, plus SM-2 columns.
- Options / correct / qtype / kind are **not** persisted; they come from the static
  pool via `generate`, and **review-mode rehydrates** them by matching the stored
  stem against an in-memory `{stem -> question}` pool index (built once, cheap).
- Graceful degradation: an unmatched stem (edited text, or a legacy free-text row
  from before v2) simply isn't shown on review and falls back to fresh pool cards.

### 7. Frontend (`frontend/src/aurora/components/flashcards/`)

Preserves the warm-cream "living eye" look; mechanics-only change.
- **`types.ts`**: `Difficulty` → 3 tiers; new `McqCard`/question interface
  (`options`, `correct`, `qtype`, `kind`, `explanation`, `requiresExplanation`);
  drop the AI-score→XP map; keep `topicHue` / `galleryHue` / `scoreTier` (the
  results screen reuses `scoreTier` for color + copy).
- **New `McqCard`** replaces typed `RecallCard`: option chips (single = radio
  behavior, multi = checkboxes), a **Check** button, then the reveal
  (correct/incorrect highlight + explanation, optional typed-reasoning box for
  `requires_explanation`).
- **`SessionSetup` / `StepSession`**: difficulty pills gain **Hard**.
- **`StudyStage`**: removes AI-checking spinner + avg-score readout; shows progress
  + per-card ✓/✗ on reveal, no running score.
- **New `ResultsScreen`**: the §4 end-of-deck view.
- **`Flashcards.tsx` orchestrator**: swap the AI-grade flow for
  select → reveal → accumulate results → ResultsScreen → batched `complete` sync.
  Missed-card "drill" replaces the old `<40` weak-card mid-deck retry.
- **Hooks (`useFlashcards.ts`)**: drop `useFlashcardCheck`; add `useFlashcardComplete`
  (batched). `useFlashcards`/`useFlashcardTopics` adapt to the new shape.

### 8. Rollout (engine + template topics first)

1. Build the full engine above (data schema, 3 tiers, MCQ grading, results screen,
   endpoints, frontend).
2. Author **2-3 topics fully** at ~12/tier across easy/medium/hard as the proven,
   tested template — at least one CLINICAL topic and one OT topic.
3. Expand topic-by-topic in follow-ups until the ~1,080-question bank is filled.
   The `topics` endpoint already reports per-set counts, so partially-authored sets
   degrade gracefully (the picker can disable empty ones).

---

## Testing

- **pytest integrity guard** (modeled on `tests/cases/test_checklist_provenance.py`):
  for every authored question — `options` length ≥ 2; `correct` indices all in range;
  `qtype == "single"` ⇒ exactly 1 correct; `qtype == "multi"` ⇒ ≥ 2 correct;
  `kind ∈ {"theory", "practical"}`; no duplicate stems within a set; role→pool
  gating holds (OT pool disjoint from CLINICAL).
- **Endpoint tests**: `generate` returns the MCQ shape and respects no-repeat;
  `complete` updates SM-2 deterministically and syncs XP; `topics` lists 3 tiers.
- **Frontend harness**: walk select → reveal → results; update the aurora_assert
  flashcard hooks/selectors. Run keyless in `MOCK_MODE` — no live AI.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Authoring volume (≈1,080 accurate MCQs) | Phased rollout; per-set counts gate the picker; KB-grounded hand-authoring |
| Client sees `correct` (peeking) | Accepted — low-stakes self-study; answer is revealed each card anyway |
| Review-mode stem mismatch after edits | Graceful fallback to fresh pool cards; stems are stable static text |
| Legacy free-text rows in `flashcards` table | Unmatched on review → skipped; new sessions are pure MCQ |

## Success Criteria

- Study loop has **zero AI calls**; reveal is instant (no 850 ms artificial delay,
  no grader round-trip).
- Every served card is MCQ/multi-select with a revealed model answer.
- 3 selectable tiers; OT vs OA/PSA pools stay separate.
- Deck ends with an "X / N correct" results screen naming weak topics, in simple
  encouraging language.
- Template topics pass the pytest integrity guard and the frontend harness, both
  keyless in `MOCK_MODE`.
