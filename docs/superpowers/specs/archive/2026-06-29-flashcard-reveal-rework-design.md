# Flashcard study — lights to background, engravings to the rim, gated animated reveal

**Date:** 2026-06-29
**Scope:** Study-activity visual + interaction polish only. No backend, no DB, no
bank changes. Files: `BrownianField.tsx`, `EngravingField.tsx`, `FlashShell.tsx`,
`McqCard.tsx`, `StudyStage.tsx`, `aurora.css`, `tests/aurora_assert.mjs`.

## Why
The drifting colour field sat *inside* the card, the engravings hid *behind* the
card, the model answer popped instantly, and cards could be skipped tap-tap-tap.
Goal: push the motion behind the card, frame the card with the line-art, make the
reveal a deliberate beat, and make the question dominate.

## Changes

1. **Moving lights → background.** Lift `BrownianField` out of `McqCard` into
   `FlashShell` as a full-canvas layer behind `.flash-content`. Blobs drift across
   the whole lavender canvas and read in the margins around the (opaque dark) card.
   Retune blend/alpha for the light backdrop (was `screen` on the dark slab).

2. **Engravings → perimeter only.** `EngravingField` computes a central exclusion
   rect (the card footprint, centered ≈ `min(720px, 96vw)` × `~74vh`) and places
   every glyph in one of the four perimeter bands (top/bottom/left/right) outside
   it, so the eye/chart/glasses line-art frames the card and stays visible. Static.

3. **Model explanation animates in, after the user's, the same way everywhere.**
   - Every card: the model block gets one consistent entrance (slide-up + fade +
     single sheen sweep).
   - Non-reasoning cards: tap option → verdict locks → model block animates in.
   - Reasoning cards (~1 in 5): tap option → verdict + reasoning box first, with a
     "Reveal model answer →" button; model stays hidden until revealed (typing
     stays optional, still background-graded). On reveal it animates in identically.

4. **Locked-in dwell.** After the model block animates in, the Next control is
   held disabled ~2.2s behind a filling conic ring, then unlocks to "Next →".
   Keyboard advance (Enter / →) moves into `McqCard` so it respects the dwell.
   Reduced-motion: drop the ring animation, keep the brief dwell.

5. **Words in your face.** `.flash-q` → weight 600, `clamp(30px, 5vw, 42px)`,
   leading 1.18, brighter ink + stronger shadow. `.flash-otext` → ~18px, heavier.

## Test contract change
`aurora_assert.mjs` card-2 (reasoning) flow updates to: tap → fill reason → click
`flash-reveal-model` → assert model present → wait `flash-advance` enabled (dwell)
→ advance. Card-1 (non-reasoning) instant-model-on-tap assertion unchanged. Target
green: `aurora_assert`, `npm run typecheck`, `npm run build`.
