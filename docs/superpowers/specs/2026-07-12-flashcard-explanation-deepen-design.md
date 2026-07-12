# Deepen brief flashcard explanations — design

- **Date:** 2026-07-12
- **Status:** Approved (design), pending implementation plan
- **Owner:** EyeBot / flashcards
- **Surface:** `tools/flashcards/static_cards.py` (the served MCQ bank)

## Problem

Flashcard reveal shows a "model answer" (the card's `explanation` field). Many are
a single terse sentence that restates the fact without the *why*. The user finds
some too brief and wants deeper explanations — **1–3 sentences**, still grounded in
the correct answer.

The bank runs short across the board: 2,300 cards, median explanation **16 words**,
p90 21 words, **91% single-sentence**. "Brief" therefore needs an explicit cutoff.

## Goals

- Rewrite the genuinely terse explanations so each reads as an in-depth 1–3
  sentence answer that keeps the existing vetted clinical fact and adds the
  mechanism / why-it-matters.
- Change **only** the `explanation` text of the targeted cards. Every other field,
  and every non-targeted card, stays byte-for-byte identical.
- Ship green: no regression in the flashcard test gates; the reveal UI still renders
  cleanly.

## Non-goals

- No schema, API, or UI change. `explanation` stays a `str`; the reveal card already
  uses `min-height` and grows to fit.
- Not rewriting explanations that are already reasonably detailed (user chose "only
  the brief ones", not "all 2,300").
- Not touching `tools/flashcards/generate_cards.py` (the live-AI DR-grading path; its
  explanation is a mock fixture, not part of the served static bank).
- No new cards, no changes to stems / options / correct / qtype / kind /
  reasoning_eligible.

## Scope — which cards

Target = cards whose `explanation` has **fewer than 15 words** (`len(explanation.split()) < 15`).

- Count at this threshold: **859 cards (37% of 2,300)**.
- Distribution context: `< 14` → 574, `< 15` → 859, `< 16` → 1,132.
- Threshold is a single constant so it can be tuned before the run if desired.

Each target card is identified by the stable key `(pool, topic_key, difficulty, index)`
— its position in `FLASHCARDS[pool][topic_key][difficulty]`. Index is positional and
stable because the splice does not reorder or add/remove cards.

## Transform — "deepen the fact + why"

For each target explanation, produce a replacement that:

1. **Preserves the original clinical fact** — the existing statement is already
   vetted; we anchor to it, we do not free-rewrite or introduce unrelated new claims.
2. **Adds the mechanism / why-it-matters** — the physiological/clinical reason, or the
   patient-safety consequence, so the student learns *why* the answer is correct.
3. **Length:** 1–3 sentences, target ≤ ~55 words. Never a single restating clause.
4. **Voice:** matches the bank — SNEC allied-health (OA/OT/PSA), plain clinical prose,
   patient-safety / handover framing, **no diagnose/prescribe language**, no device
   brand names, directly answers the card's stem and its correct option.

Example (from the approved design):

> Before: "Proptosis is forward protrusion of the globe, a hallmark of thyroid eye disease."
>
> After: "Proptosis (exophthalmos) is forward protrusion of the globe, the classic
> hallmark of thyroid eye disease. It occurs because inflamed, enlarged extraocular
> muscles and orbital fat push the eye forward, and when severe it prevents full lid
> closure, risking corneal exposure."

## Architecture — four stages

### 1. Select (deterministic Python)

A script walks `FLASHCARDS`, computes each explanation's word count, and emits a
`candidates.json`: a list of `{key: [pool, topic_key, difficulty, index], stem,
options, correct, correct_text, kind, reasoning_eligible, current_explanation,
word_count}` for every card under the threshold. Grouped by `(pool, topic_key)` for
batching. This is pure read-only enumeration; no card is modified here.

### 2. Generate (Opus subagents via `Workflow`)

- One subagent **per topic that has brief cards** (~45 max). Each receives that
  topic's brief candidates and the transform rules above.
- **Engine: Claude/Opus subagents, not live Gemini** — no API cost, no prod quota,
  stronger clinical prose. This satisfies the "no live Gemini without go-ahead"
  invariant.
- Structured output per agent: `[{key, new_explanation}]`, validated against a JSON
  schema (key must be one it was given; `new_explanation` a non-empty string).
- Batching by topic keeps each agent's clinical context tight (one topic = one area).

### 3. Verify (adversarial subagent per topic — ultracode verify pass)

For each topic's rewrites, a second subagent re-checks each `new_explanation` against
its stem + correct option and asserts: preserves the original fact; introduces no
false or unsupported claim; actually answers the stem; 1–3 sentences within length;
allied-health framing (no diagnose/prescribe). Each is marked `ok` or `revise` with a
corrected version; anything still failing is **reverted to the original explanation**
(safe default — worst case a card is simply unchanged). The workflow runs
`generate → verify` as a pipeline per topic and writes the final
`{key: new_explanation}` map to `rewrites.json`.

### 4. Splice (deterministic + guarded)

A patch script edits `static_cards.py` **surgically via AST source offsets**:

- Parse the module with `ast`; locate the `FLASHCARDS` assignment; walk pool → topic →
  difficulty → card in structure order (matches the runtime dict/list order).
- For each **target** card, find the `Constant` string node that is the value of its
  `'explanation'` key and record its exact source span
  (`lineno, col_offset, end_lineno, end_col_offset`).
- Replace **only** those spans (last→first, to keep offsets valid) with the new value
  literal (`repr(new_explanation)`, which round-trips exactly). Every other byte —
  including all 1,441 untouched cards and their formatting/comments — is preserved, so
  the diff is minimal and touches only targeted explanation values.

## Guard (regression, runs after splice)

Re-import a fresh `FLASHCARDS` and assert against a pre-change snapshot:

- Card counts per `(pool, topic_key, difficulty)` unchanged.
- For **every** card, all fields except `explanation` are deep-equal to the snapshot
  (stem, options, correct, qtype, kind, reasoning_eligible).
- Every **non-target** explanation is byte-identical to the snapshot.
- Every **changed** explanation is non-empty, 1–3 sentences, within the length cap,
  and differs from the original.

Any assertion failure aborts before commit.

## Acceptance criteria

1. `python -m pytest tests/flashcards tests/api/test_flashcards_generate_mcq.py tests/api/test_flashcards_complete.py tests/api/test_flashcards_topics_tiers.py tests/test_flashcards_topic_prompts.py -q` passes (integrity, dedup, topic-prompt gate, MCQ shape).
2. The guard script passes (only targeted explanations changed; all else identical).
3. Behavioral verify: harness screenshot of a reveal card shows a deepened
   explanation rendering fully without clipping.
4. Spot-check: a sample of rewrites reads as accurate, on-voice, 1–3 sentences.

## Risks & mitigations

- **Medical inaccuracy in a rewrite** → anchored-to-existing-fact prompt + adversarial
  verify stage + revert-on-fail; final human spot-check before push.
- **Corrupting the 1.1 MB literal file** → AST-offset splice touches only string spans;
  guard proves non-target bytes unchanged; work on a copy, swap in only after guard +
  tests pass.
- **Scope creep (touching already-good cards)** → deterministic word-count selector;
  guard confirms non-target explanations are byte-identical.
- **Reasoning-eligible cards** use `explanation` as the grading reference — deeper text
  only improves grading; verify stage ensures it still directly answers the stem.

## Out of scope / future

- Widening the threshold or a second pass over 15–17 word cards (easy to re-run with a
  changed constant).
- `generate_cards.py` live-AI path.
