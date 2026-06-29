# Flashcard reveal — Charge → Flip → Payoff

**Date:** 2026-06-29
**Supersedes the reveal interaction** from `2026-06-29-flashcard-reveal-rework-design.md`
(lights-to-background + engraving rim stay; the *reveal* changes from a slide-up
panel + dwell-ring into a two-faced card with a suspense charge and a 3D flip).
**Scope:** Study-activity interaction + visuals + a frontend-only XP/combo bump.
**No backend, no DB, no card-bank changes.** `/api/flashcards/complete` already
accepts `xp_delta`; we only make the number it sends larger.

## Why
The explanation currently slides up *below* the question as a footnote and the
Next button is held behind a 2.2s dwell ring. The learner wants the explanation to
**own the whole card, in your face**, arriving after a deliberate suspense beat and
a stunning flip, with gamification (combo, points, particles, sound) on the
landing. Goal: turn the reveal into the emotional peak of each card.

## The interaction — plain MCQ card

State machine inside `McqCard` (one card): `answering → locked → charging → flipped`.

1. **answering** — front face: question + options (unchanged layout).
2. **locked** — learner taps an option → instant ✓/✗ lamp verdict (immediate
   correctness feedback is KEPT). Options disable. Verdict (`correct: boolean`) and
   `selected` are computed now and reported via the existing `onCheck`.
3. **charging** — a `ChargeRing` overlay blooms centered on the card. A conic
   stroke fills clockwise (`stroke-dashoffset` animation) with rising glow + 4–6
   orbiting spark particles; the locked card dims to ~0.7 and tilts ~2° toward the
   viewer. Default fill `CHARGE_MS ≈ 1500ms`. **Hold-to-fast-charge:**
   `pointerdown` on the card (or the ring) multiplies fill speed ~3× while held;
   release returns to base. A `pointerup`/`click` with the ring ≥ ~85% snaps to
   complete. This gives impatient learners agency and stops 10×1.5s from feeling
   like dead time. When the ring completes → `flipped`.
4. **flipped** — `.flash-flip` rotates 180° on Y (`rotateY`), ~700ms springy
   easing, a light sweep racing the seam. The **back face** is now the card:
   - Verdict headline (`CORRECT` / `REVIEW THIS`) in the score-tier color.
   - The explanation set LARGE and dominant (it IS the card, not a footnote).
   - The `Payoff` band: combo flare + points tick-up + particle burst.
   - `Next →`, enabled after a short `SETTLE_MS ≈ 700ms` so the payoff plays
     before the learner can leave (this replaces the old dwell-on-Next).

## Reasoning cards (~1 in 5) and free-text cards

The "your reasoning before the model" gate is preserved, just relocated to the
front face so the flip still reveals a finished explanation.

- **Reasoning card:** tap → ✓/✗ → the reflection `textarea` (`flash-reason`) slides
  in ON THE FRONT FACE with `Charge reveal →` (`flash-reveal-model`). The model
  stays hidden. Pressing it commits the reason (background grade via `onReason`),
  starts **charging**, then **flips** to the back (explanation + the learner's
  reason echoed + `reasonNote` when it returns).
- **Free-text tutor card** (`card.freeText`): `Show answer` → charging → flip →
  back face with the model answer + `Got it / Missed it` self-mark. Self-mark
  buttons enable after `SETTLE_MS`.

## Gamification

### Combo streak (deck-level, in `Flashcards.tsx`)
- `comboRef` / state: consecutive-correct counter across the deck. A correct card
  increments it; a miss resets to 0. Multi-select all-or-nothing already defines
  "correct" via `gradeSelection`.
- Multiplier tiers: `x1` (combo 0–1), `x2` (2–3), `x3` (4–5), `x4` (6+), capped at
  `x4`. Exposed to `McqCard` as `combo` (count) + `multiplier`.
- FX escalation: higher multiplier → hotter ring hue, more spark particles, a
  `combo x3!` flare on the back face. Combo 0/1 shows no flare.

### Points + real XP
- Back face: a points number counts up (`useCountUp`) = `base × multiplier`, where
  `base = XP_CORRECT (10)` on a hit. A miss shows the consolation `XP_ATTEMPT (3)`,
  no multiplier.
- **XP is real, not cosmetic.** The combo bonus = `base × multiplier − base` is
  added into the existing `xpRef` in `Flashcards.tsx::onCheck`, so it flows through
  `xp_delta` to `/api/flashcards/complete` and `addXP(...)` exactly like base XP.
  No new endpoint, no schema change. Misses are unchanged (flat `XP_ATTEMPT`).
- **`onCheck` signature is unchanged.** The parent owns combo state (`comboRef`)
  and, inside `onCheck(correct, selected, reasoning)`, computes the award itself:
  `awardedXp = correct ? XP_CORRECT * comboMultiplier(prevCombo + 1) : XP_ATTEMPT`,
  then updates `comboRef` (`correct ? prevCombo + 1 : 0`). The bonus
  (`awardedXp − XP_CORRECT` on a hit) is folded into `xpRef`.
- The card needs only the **incoming streak** to drive its display count-up: the
  parent passes `combo` (the streak *before* this card) as a prop. On a correct
  answer the card animates to `XP_CORRECT * comboMultiplier(combo + 1)`; on a miss
  it shows `XP_ATTEMPT`. Parent and card therefore agree because both call the one
  tier function — `comboMultiplier(n: number)` in `types.ts`. The multiplier
  applies to the card that *achieves* the streak (your 2nd-in-a-row correct earns
  x2 on itself).

### Particles
- Correct: confetti/spark shockwave from the verdict, intensity scaled by
  multiplier. Wrong: a muted supportive shimmer (no confetti) — never punishing.
- Rendered on a small `<canvas>` on the back face driven by `requestAnimationFrame`
  (self-terminating after ~1.2s); no library, no GSAP.

## Sound + haptics
- A tiny WebAudio synth (no asset files), created lazily on first tap (a user
  gesture, so `AudioContext` is allowed to start):
  - charging: a rising tone tracking the ring.
  - correct flip: a bright 2–3 note arpeggio.
  - wrong flip: a soft low "thunk".
- `navigator.vibrate` on the flip for mobile (short for correct, double-blip for
  wrong); silently no-ops where unsupported.
- **Subtle mute toggle:** a small, low-contrast speaker glyph
  (`ti`-style / `Icon`) tucked next to the Exit affordance in `FlashShell` — NOT a
  prominent control. State persists in `localStorage` (`eyebot_flash_sound`).
  Default: **sound ON**, muted state remembered across sessions. When muted,
  haptics also stay off.
- Lives in a `useFlashFx()` hook so `McqCard` calls `fx.charge()`, `fx.win()`,
  `fx.miss()` without touching audio internals.

## Reduced motion (`html[data-motion="reduce"]`)
- No 3D flip → instant crossfade between faces.
- No charge ring spin / no hold-to-charge → a brief `~250ms` beat then the back
  face. No particles. No sound autoplay (mute toggle still works manually).
- Count-up may still tick (it's not vestibular motion) but can snap if simpler.
- The aurora_assert harness runs with reduced motion so the flow is fast +
  deterministic.

## Visual / DOM structure
- `.flash-card` becomes the perspective container (`perspective: 1600px`).
- `.flash-flip` — `transform-style: preserve-3d`, transitions `rotateY` 0deg→180deg
  on the `flipped` state.
- `.flash-face` — absolutely stacked, `backface-visibility: hidden`; `.is-front`
  at `rotateY(0)`, `.is-back` pre-rotated `rotateY(180deg)`.
- The existing aurora rim + dark-slab (`.flash-card::before/::after`) and the
  `is-right` green move onto each face (`.flash-face::before/::after`) so both
  faces stay on-brand dark cards with the rotating-spectrum rim. Topic-hue theming
  (`--flash-topic-hue`) and score-hue theming (`--flash-score-hue`) unchanged.
- `ChargeRing` overlay sits above the front face during `charging`, removed on
  flip.

## Files
- `frontend/src/aurora/components/flashcards/McqCard.tsx` — rework into
  front/back faces + the `answering→locked→charging→flipped` machine; host the
  charge/flip/payoff pieces. The free-text + reasoning branches move onto the faces.
- `frontend/src/aurora/components/flashcards/ChargeRing.tsx` — NEW: the conic
  fill + spark particles + hold-to-fast-charge, calls back on complete.
- `frontend/src/aurora/components/flashcards/Payoff.tsx` — NEW: back-face verdict
  headline + combo flare + points count-up + particle canvas.
- `frontend/src/aurora/components/flashcards/useFlashFx.ts` — NEW: WebAudio synth
  + haptics + mute state (reads `localStorage`).
- `frontend/src/aurora/components/flashcards/FlashShell.tsx` — add the subtle mute
  glyph next to Exit; thread mute state (or let the hook own it via localStorage +
  a `storage`/custom event).
- `frontend/src/aurora/components/flashcards/types.ts` — add
  `comboMultiplier(combo)` (single source for parent + card).
- `frontend/src/aurora/screens/Flashcards.tsx` — combo state; `onCheck` computes
  `awardedXp` from combo and folds the bonus into `xpRef`; pass `combo`/projected
  `multiplier` to `StudyStage`/`McqCard`.
- `frontend/src/aurora/components/flashcards/StudyStage.tsx` — pass the new props
  through.
- `frontend/src/aurora/aurora.css` — flip scene, faces, charge ring, payoff,
  combo flare, reduced-motion fallbacks; retire the dwell-ring-on-Next rules.
- `frontend/tests/aurora_assert.mjs` — update the two-card flow for charge+flip;
  keep existing testids; add a payoff/combo assertion.

## Test contract
- Harness runs under reduced motion. Card 1 (plain): tap option → (brief beat) →
  `flash-reveal-back` present on the BACK face → `flash-compare-label` "Findings"
  present → assert the payoff renders (combo/points element, new testid e.g.
  `flash-payoff`) → `flash-advance` disabled until `SETTLE_MS`, then advance.
  Card 2 (reasoning): tap → `flash-reason` present on the FRONT face, NO "Findings"
  yet, NO `flash-advance` → fill reason → click `flash-reveal-model` → (beat) →
  back face shows "Findings" → advance. Results screen X/N unchanged.
- Green gates before shipping: `node frontend/tests/aurora_assert.mjs`,
  `cd frontend && npm run typecheck && npm run build`, and `python -m pytest -q`
  (should be untouched — no backend change — but run it to prove it).

## Decisions locked
1. Charge ≈ 1.5s with hold-to-fast-charge; reduced-motion collapses it to ~250ms.
2. Combo bonus feeds REAL XP through the existing `xp_delta` path (no new
   endpoint, no DB migration). Base XP for correct/miss unchanged.
3. Sound defaults ON; subtle, low-contrast mute glyph by Exit; remembered in
   `localStorage`. Muted ⇒ haptics off too.

## Out of scope (YAGNI)
- No backend scoring changes, no new endpoints, no DB migration.
- No card-bank edits, no setup/fan-screen changes.
- No cross-deck/persistent combo (combo is per-deck, resets each session).
- No audio asset files (synth only).
