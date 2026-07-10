# Flashcards — Vivid-yet-Calm Redesign

**Date:** 2026-06-19
**Area:** `frontend/src/aurora` — Flashcards screen + components
**Status:** Spec, pending user review

## Problem

The flashcards were rebuilt on 2026-06-18 into a deliberately *light, no-metaphor*
system. The light direction is right, but it overshot into **plain**: white card
faces, near-invisible background washes (0.05–0.06 opacity), a single blue accent,
and color appearing **only** on the score reveal. At the same time the screens are
**cluttered and wordy** — progress is shown three ways, the setup screen stacks an
eyebrow + title + help line above two control groups and up to 16 topic tiles
(each with a sub-line), and there is a fair amount of microcopy.

So the feature reads as simultaneously **boring** (no color/life in the resting
state) **and overstimulating** (too many words and competing elements).

## Goal

Make it feel **alive through color, calm through restraint**: a vivid, distinct
color per topic carries the visual interest, while words and competing elements are
cut back so each screen has a single clear focal point. Stay on-brand AURORA light.

This is a **visual/feel change only**. Out of scope: study mechanics, the API, the
grading flow, SM-2, XP math, the harness contract.

## Decisions (from brainstorming)

- **Direction:** enrich the existing light design — do *not* go dark or bold-vivid.
- **Signature:** vivid **per-topic accent color**, auto-derived per `topic_key`.
- **Mixed mode:** color **shifts per card** (each card adopts its topic's hue), so
  the default session is the liveliest.
- **Reveal:** the existing **score** hue (blue→green) still owns the reveal/back
  face; topic color steps aside there. Two colors, two jobs.
- **Background:** a subtle, slow **topic-tinted aurora drift**.
- **Motion:** **tasteful polish** only — richer flip, count-up XP, restrained
  confetti, smooth hue interpolation between Mixed cards.
- **Balance:** **color replaces clutter** — calm, one focal point per screen.
- **Definite structural cuts:** the setup header text, and trim the setup topic
  grid to fewer choices upfront.
- **Kept (per user):** the coach line, the triple progress readout, and in-card
  microcopy stay — but are visually quieted so they frame the card, not compete.
- **Dropped from earlier pitch:** the faint glyph watermark behind the question
  (it would compete with the question text).

## Architecture

### Two color signals

| Signal | CSS var | Where it lives | Source |
|---|---|---|---|
| **Topic hue** (identity) | `--flash-topic-hue` | setup tiles, glyph chip, card accent + glow, active progress dot, Submit button, background drift | `topicHue(topic_key)` |
| **Score hue** (feedback) | `--flash-score-hue` (exists, unchanged) | reveal/back face only | `scoreHue(score)` (exists) |

The plumbing mirrors the already-working `--flash-score-hue` pattern exactly: a
pure TS function returns a hue, set as an inline CSS custom property on the relevant
root; **all** visual treatment is pure CSS reading that variable. No extra renders.

### `topicHue` (new, in `components/flashcards/types.ts`)

```
/** topic_key → HSL hue (unitless degrees) on a curated, on-brand arc.
 *  Deterministic so a topic always reads the same color; tuned so the 15
 *  topics per pool are visually distinct and none land in muddy ranges. */
export function topicHue(topicKey: string): number
```

- Deterministic from the `topic_key` **string** (works everywhere we only have a
  card's `tag`, including Mixed where index is unknown).
- Maps onto a **curated hue arc** (brand-adjacent: blues, indigo, violet, magenta,
  teal, coral, amber, green) rather than the raw 0–360 wheel, so every result is
  tasteful. Implementation tunes the arc + hash for distinctness across the 15
  known topics; muddy yellow-greens are avoided.
- `__mixed` returns a neutral/brand hue used only when no card is active (the setup
  "Mixed" tile and pre-card states); once cards run, each card sets its own hue.

### Two derived tokens (contrast safety)

Set on the stage/card scope from `--flash-topic-hue`:

- `--flash-topic-c` — **vivid, fixed lightness** (e.g. `hsl(H 70% 46%)`) for solid
  fills where white text sits on top (Submit button, active dot). Fixed lightness
  guarantees white-text contrast regardless of hue.
- `--flash-topic-soft` — a `color-mix` **tint** (topic color into `--surface`/
  `--paper`) for chip backgrounds, accents, and the background drift.

### `@property` registration

Register `--flash-topic-hue` as `<number>` (initial `212`, not inherited per-use as
needed) so the hue **interpolates** when a Mixed session advances to a new topic —
a smooth color transition instead of a hard cut. Reduced-motion: no transition.

## Component-level changes

All changes are CSS + light JSX wiring. **No mechanics change.** Every existing
`flash-*` class and `data-testid` hook is preserved (see Harness contract).

### `Flashcards.tsx` (orchestrator)
- No logic changes. Continues to own state and the grading flow verbatim.

### `FlashShell.tsx`
- Background drift markup/treatment lives here or on `.flash-root` (CSS). Sets a
  sensible default `--flash-topic-hue` so setup/loading states are tinted.

### `SessionSetup.tsx`
- **Header:** remove the eyebrow (`Active recall`) and the help sentence. The
  header carries a **slit-lamp optical-section hero** — a contained dark `PlateWell`
  "instrument viewport" (`PLATE.flashcards`, `ratio 16/9`, caption "Slit-Lamp
  Optical Section", width-capped via `.flash-hero`) above a single clean
  `Flashcards` title. The dark well is an intentional, contained accent on the
  light surface; the colorful topic grid below stays the focal point. `PlateWell`'s
  built-in `<img>` `onError` fallback means a missing asset never breaks the screen.
  Source art is a Nano Banana Pro raster from `RASTER_PROMPTS["flashcards"]` — a
  realistic clinical slit-lamp exam photo (frontal eye, bright vertical white slit
  beam across the cornea/pupil with faint Vogt's striae in the beam, natural amber
  iris, dark pupil, fine red limbal/conjunctival vessels, near-black field; pure
  clinical, no brand tint, no text/overlays/fluorescein).
- **Topic grid:** show **Mixed + a small handful** of topics, then a quiet
  **"Show all topics"** expander revealing the rest. First view is calm, not a
  16-tile wall.
- **Tiles:** color-led — each tile carries its own `topicHue` (tinted glyph well,
  colored selected-ring, hover glow); **drop the `x/y seen` sub-line**. Glyph +
  label only. Mixed reads as the calm default primary.
- Difficulty / length controls stay, compact.

### `StudyStage.tsx`
- Sets `--flash-topic-hue` (from the current card's `tag`) on the stage root.
- Topbar dots, coach line, and readout **stay** but are visually quieted (smaller,
  lower contrast) so the **card is the single focal point**. Active dot uses
  `--flash-topic-c`; done dots stay green.
- Live XP in the topbar gains a **count-up**.

### `RecallCard.tsx`
- Topic glyph chip becomes **filled** with `--flash-topic-soft` (colored glyph +
  text) instead of the neutral grey chip.
- Card gains a soft topic-tinted **accent edge + glow** in its shadow stack;
  surface stays light with generous whitespace.
- Submit button uses `--flash-topic-c` (topic-hued) instead of flat blue.
- In-card copy unchanged (per user) — just more breathing room.
- Flip: add a subtle lift+scale during rotation and a gentle glow-pulse on landing.
- Confetti: richer but **restrained** — more pieces, varied shapes, hues seeded
  from score + topic; **high-score (≥85) trigger unchanged**.

### `RevealBack.tsx`
- **Structure and score-hue behavior unchanged.** Score still counts up; the
  blue→green `--flash-score-hue` still drives the reveal. Topic color is absent
  here by design.

### `TopicGlyph.tsx`
- Unchanged (glyphs already inherit `currentColor`; color now flows from the
  topic-tinted chip around them).

### `aurora.css` (the `flash-*` block, ~lines 1830–1988)
- Add `@property --flash-topic-hue` + the two derived tokens.
- Replace the flat 0.05 washes with the topic-tinted aurora drift (slow keyframes).
- Apply topic color to: glyph chip, card accent/glow, active dot, Submit button,
  setup tiles, the "Start session" affordance.
- Quiet the topbar/coach/readout treatments.
- Extend reduced-motion + `prefers-reduced-motion` rules to cover the drift and any
  new transitions.

## Motion & accessibility

- Background drift, hue interpolation, flip enhancement, and confetti are **all**
  gated by `html[data-motion="reduce"]` and `@media (prefers-reduced-motion)` —
  matching the existing block.
- Topic hues are constrained to a curated arc; `--flash-topic-c` uses fixed
  lightness so white text on the Submit button / active dot always has contrast.
- Topic color is decorative/wayfinding, never the only carrier of meaning (labels,
  glyphs, and score numbers remain).

## Harness contract (must stay green)

Preserve every hook the assertions use. Confirmed `data-testid`s in the current
components: `flash-exit`, `flash-setup`, `flash-start`, `study-stage`,
`flash-submit`, `flash-advance`, `flash-score`. Preserve the core `flash-*`
classNames the harness keys on. The redesign is CSS + additive JSX (an expander in
setup); no test hook is renamed or removed. Run the flashcards harness after.

## Success criteria

1. Each topic shows a **distinct, tasteful color**; the same topic is always the
   same color; Mixed shifts hue smoothly card-to-card.
2. Resting state (setup + card front) is **colorful** — color no longer appears
   only on the reveal.
3. Each screen reads **calmer**: setup header reduced to a title, topic grid no
   longer a 16-tile wall, the card is the clear focal point.
4. Study **mechanics are byte-for-byte unchanged**; XP/SM-2/retry/grading identical.
5. The flashcards **harness passes** and the build is clean.
6. Reduced-motion fully disables drift/interpolation/confetti.
