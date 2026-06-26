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
  optional typed-explanation prompt that **is graded** — by a fast AI call kept off
  the blocking path (see §3).
- **3 difficulty tiers**: easy, medium, hard.
- **Deeper bank**: target ~12 questions per topic per tier (≈1,080 total across
  15 topics × 3 tiers × 2 role pools) to make repeats rare.
- **Speed is the #1 priority.** MCQ grading is instant and deterministic
  (client-side, no AI). Typed-reasoning grades run **in the background**, never
  blocking the reveal or the headline score.
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
| Typed explanation (hard cards) | **Graded** by a fast AI call fired in the background (off the blocking path). Headline deck score stays MCQ-only and instant; the reasoning grade is shown as its own dimension |
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

### 3. Typed explanation on hard cards (`requires_explanation: True`) — graded, but never blocking

A subset of hard cards add a typed-reasoning box. The student picks the option(s)
and may also type a short explanation. The typed answer **is graded** — but the AI
call is kept entirely off the blocking path so it never re-introduces the current
"wait on every card" latency:

- **The reveal is instant.** As soon as the student submits, the MCQ correctness is
  graded client-side and the model answer + `explanation` are shown immediately.
  Nothing waits on the AI.
- **The typed grade runs in the background.** On submit/advance, a single fast call
  to `POST /api/flashcards/check` (one short typed answer; `MODEL_SMALL`, MINIMAL
  thinking, ~256-token cap, `asyncio.to_thread` — the becky-optimized grader path)
  is fired without blocking the reveal. The student can read the model answer and
  move on while it resolves.
- **It overlaps with continued studying.** Because grading starts on advance and the
  student keeps working through the deck, the grades have almost always returned by
  the time they reach the results screen. The card reveal shows a small,
  non-blocking "Reviewing your written answer…" note that updates to the grade +
  one-line tip when it lands.
- **It does not gate the headline score.** The deck's "X / N correct" is pure MCQ
  correctness and appears instantly. The reasoning grades are summarized as their
  own dimension on the results screen (e.g. "Written reasoning: 2 strong, 1 to
  review"), filling in if any are still in flight — never blocking the headline.

Because typed cards are only a fraction of hard cards (and easy/medium have none),
the total number of AI calls per deck is small, each is the cheap minimal-config
grader, and none sit on the critical path — so the loop is far faster than today's
"AI call + 850 ms delay on every card".

The exact grade→XP / grade→display mapping for reasoning answers is pinned in the
implementation plan; a sensible default is a 0–100 score bucketed to a short
qualitative label (strong / okay / review) plus a one-sentence tip.

### 4. End-of-deck results screen (new, client-computed)

Replaces today's bounce-to-dashboard toast. The headline appears instantly (MCQ
correctness is computed client-side):
- Big **"X / N correct"** numeral — instant, never gated on AI.
- **Per-topic breakdown** and the **1-2 weakest topics** (most misses) named:
  e.g. "Focus your next drill on Triage and Red Eye."
- **Encouraging, plain-language coaching** from score-tiered templates. Jargon only
  when it is the clearest word.
- **Written reasoning summary** (only if the deck had typed cards): a small line
  such as "Written reasoning: 2 strong, 1 to review", drawn from the background
  typed-answer grades. Fills in if a grade is still in flight — never blocks the
  headline.
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
- `POST /api/flashcards/check` — **kept, but repurposed.** It no longer grades every
  card. It is called **only for typed-explanation answers**, fired in the background
  off the blocking path (§3). It already uses the fast minimal-config grader
  (`MODEL_SMALL`, MINIMAL thinking, ~256-token cap, `asyncio.to_thread`, quota
  handling), so no change to its internals is required — only its call site and
  cadence change (background, typed-only, no longer per-card).

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
- **Hooks (`useFlashcards.ts`)**: keep `useFlashcardCheck` but call it only for
  typed-explanation answers, fired in the background (not awaited on the reveal);
  add `useFlashcardComplete` (batched end-of-deck SM-2 + XP). `useFlashcards` /
  `useFlashcardTopics` adapt to the new shape.

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
  `complete` updates SM-2 deterministically and syncs XP; `topics` lists 3 tiers;
  `check` still grades a single typed answer in `MOCK_MODE` (typed-only path).
- **Frontend harness**: walk select → reveal → results; assert the reveal is **not**
  gated on the typed grade (MCQ reveal happens before/independently of the
  background `check`). Update the aurora_assert flashcard hooks/selectors. Run
  keyless in `MOCK_MODE` — no live AI.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Typed-answer grade latency at deck end | Grade fires in the background on advance, overlapping continued study; headline score is MCQ-only and never waits; results screen fills the reasoning summary in if a grade is still in flight |
| Authoring volume (≈1,080 accurate MCQs) | Phased rollout; per-set counts gate the picker; KB-grounded hand-authoring |
| Client sees `correct` (peeking) | Accepted — low-stakes self-study; answer is revealed each card anyway |
| Review-mode stem mismatch after edits | Graceful fallback to fresh pool cards; stems are stable static text |
| Legacy free-text rows in `flashcards` table | Unmatched on review → skipped; new sessions are pure MCQ |

## Success Criteria

- The reveal is **instant** on every card — no 850 ms artificial delay and no
  blocking grader round-trip. MCQ correctness is graded client-side; the only AI
  calls are background typed-reasoning grades on the subset of hard cards, off the
  critical path.
- Every served card is MCQ/multi-select with a revealed model answer.
- 3 selectable tiers; OT vs OA/PSA pools stay separate.
- Deck ends with an "X / N correct" results screen naming weak topics, in simple
  encouraging language.
- Template topics pass the pytest integrity guard and the frontend harness, both
  keyless in `MOCK_MODE`.
