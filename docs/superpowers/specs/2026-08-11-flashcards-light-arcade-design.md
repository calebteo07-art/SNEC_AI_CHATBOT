# Flashcards — "Light Arcade" re-theme (2026-08-11)

**Status**: design approved (user, 2026-08-11) · implementation pending

## Why this exists

`docs/design-locks.md` locks Flashcards as **"Dark Arcade"** (re-themed 2026-07-12,
user-directed): *"Selection, intro, study and results all share ONE dark graphite
ground (`#1b2636→#0a0d12`) … so pick → play is one seamless scene (no bright-sky→dark
jump)."*

The user has asked for a **light** colour scheme across the whole flashcards world.
That reverses the 2026-07-12 decision, so this is a **conscious lock break**, recorded
here and in the lock ledger — not a silent rebuild. (Flashcards was rebuilt from
scratch 4+ times in 18 days before that ledger existed; this document is what keeps
this change a *re-theme*.)

**Scope, as chosen by the user**: direction = **Light Arcade** (keep the game feel,
not the app's neutral AURORA light system); surfaces = **all four** (selection →
intro → study → results).

## What the change actually touches

Established by inventory, not assumption:

- **`frontend/src/aurora/aurora.css:2466–3400`** — 935 lines, ~190 hardcoded colour
  literals (~120 white-ish ink, ~69 dark grounds).
- **Components carry no colour.** All 15 files in
  `frontend/src/aurora/components/flashcards/` are colour-free except two that
  generate colour in JS:
  - `BrownianField.tsx:29` — spot gradient built in JS.
  - `EngravingField.tsx` — SVG strokes use `currentColor`, so its colour comes from
    CSS and needs no JS edit.

So this is a **CSS-only re-theme plus one JS line**.

## Design

### 1. Reuse the locked arcade-on-light language

Home (`frontend/src/aurora/home.css:45`) is already a **light** surface running the
**STRUCK** recipe, and it is already gated by `home_hud_assert.mjs`:

```
--mat-ink: #2A1F3D;   /* warm near-black violet — never grey, never #000 */
--mat-out: 2.5px;     /* NEVER 1px and never 1.5px — Chrome snaps to a hairline */
--mat-lip: 5px;       /* zero-blur colour lip */
```

Flashcards adopts this rather than growing a fifth dialect of "arcade". The
`--mat-out` constraint above is load-bearing and carries over verbatim.

### 2. Glow → strike

The dark theme ranks objects by **glow**: neon masked rims, blurred drop-shadows,
`mix-blend-mode: screen`. None of these read on a light ground. Depth is re-carried by
**ink outline + hard zero-blur lip**.

The chunky toy buttons barely change — `.flash-pause` and `.flash-advance` already use
hard lips (`box-shadow: 0 5px 0 var(--fc-red-d)`). It is the **rims and halos** that
convert.

### 3. Palette use-rule (not a palette replacement)

Hue identity is preserved; **role** decides lightness:

- **Bright neon = fill only**, always with dark ink on top.
- **Ink or border = the `-d` (dark) variant.**

This matters most for `--fc-coin` `#ffd21e`, currently both the giant
`.flash-setup-title` colour and the `.flash-stat-score` colour, at ~1.4:1 on white.
Same problem for `--fc-green` `#2ee85a` (~1.7:1). Hue-lightness `--f-hue-l` drops
`72% → ~42%`.

### 4. One seamless ground, inverted

`@keyframes flash-drift` stays — same animation, same topic-hue drive, same
reduced-motion freeze — but the bloom is re-derived deeper and lower-lightness (a
`.26`-alpha neon bloom is invisible on white). **The lock's core invariant survives
verbatim: all four surfaces share one ground, so pick → play has no jump.** Only its
value flips.

### 5. A semantic token layer is the real deliverable

New tokens on `.flash-root`:

```
--fc-ground   the page ground
--fc-plate    raised card/panel surface
--fc-ink      primary text
--fc-ink2     secondary text
--fc-line     borders/dividers
--fc-mat      the struck outline ink (from --mat-ink)
```

The ~190 literals convert to these. This is what makes the change a **re-theme rather
than a 5th rebuild**, and makes the next theme change a token edit instead of another
935-line sweep.

The existing `.flash-face` token set (`--f-ink`, `--f-ink2`, `--f-mono`, `--f-line`,
`--f-paper`) is folded into this layer rather than left as a parallel vocabulary.

### 6. The two field layers

- **`BrownianField`** — `mix-blend-mode: screen` → `multiply`, with a darker spot.
  Screen blends toward white, so the spots are invisible on light. This is the one
  JS-side edit (`BrownianField.tsx:29`) plus its CSS rule.
- **`EngravingField`** — `.flash-engraving { color: #e7ebf1 }` → the struck ink at the
  same 7–12% alpha. CSS-only; the component already uses `currentColor`.

### 7. Topic art needs no regeneration

The ~103 topic images are bright stock photos designed to pop on dark. On light they
are held off the ground by the existing fully-opaque 4px hue frame plus the new ink
outline. **No image regeneration** — no Gemini spend.

## Decisions taken (flagged to the user, approved)

- The ground is a **warm** near-white, harmonising with `--mat-ink`'s warm violet —
  not a cold grey-white.
- `.flash-setup-title` stays gold but takes the struck ink outline **instead of** its
  glow. Glow is what made it dominate on dark; on light only an outline can do that job.

## Explicitly out of scope — do not touch

These are separate locked invariants that this re-theme must leave working:

- Coverflow depth / windowing and the `WINDOW` opacity math in `CardFanCarousel`.
- Hover-pause geometry (`aurora/lib/hoverPause.ts`, `inFrontCardZone`).
- Sticker coplanarity (**no `translateZ`** on `.fan-sticker`).
- Deck ladder (`deckLadder.ts::deckSticker`), forfeit
  (`forfeitGuard.ts::createRoundForfeit`).
- The multiselect **lamp/hover separation**: no `:hover` rule may reach a picked
  option, and "picked" must stay legible without the border.
- Reduced-motion freezes; the phone-landscape (`max-height: 480px and pointer: coarse`)
  size tiers.
- The 3-tier MCQ scoring, Lumens amounts, and all copy.

## Acceptance criteria

1. All four surfaces (selection, intro, study, results) render on **one light ground**
   with no dark→light jump at any transition.
2. Every text/background pair in the flashcards world meets **WCAG AA** (4.5:1 body,
   3:1 large/UI). Specifically: the gold title, `.flash-stat-score`, the ✓/✗ verdict
   colours, and the picked-option lamp chip.
3. The picked option remains distinguishable from unpicked by **more than
   border-colour** — `flashcards_multiselect_assert.mjs` compares the lamp's
   `backgroundColor|color|text`, and that distinction must survive.
4. No `:hover` rule reaches a picked option (cascade gate:
   `flashcards_option_state_logic.mjs`).
5. Every `--mat-out`-style outline is **≥ 2px** — never 1px or 1.5px (Chrome snaps to
   a banned hairline and `getComputedStyle` misreports it).
6. Reduced motion still freezes the bloom, the drift, and the flip.
7. The picker still holds at the **real ~26-topic scale**, not a toy mock.
8. Phone-landscape tiers still fit; no horizontal overflow at any viewport.

## Verification plan

Gates that must be green before push:

- `frontend/tests/aurora_assert.mjs` (flashcards intro-on-screen, MCQ options paint,
  wrong-locked answer paints, deck-ladder wiring)
- `frontend/tests/flashcards_multiselect_assert.mjs`
- `frontend/tests/flashcards_option_state_logic.mjs`
- `frontend/tests/flashcards_deckladder_logic.mjs`
- `frontend/tests/flashcards_landscape_assert.mjs`
- `frontend/tests/flashcards_forfeit_assert.mjs` + `_logic.mjs`
- `frontend/tests/flashcards_scoring_logic.mjs`
- `npm run typecheck && npm run build`

Plus a **new contrast gate** asserting criterion 2 — the palette re-derivation is the
part most likely to regress silently, and the existing harness checks colour
*difference*, never contrast.

⚠ A zero exit code only means "nothing that ran failed" — **count the harnesses**.

## Follow-up

On completion, amend the Flashcards entry in `docs/design-locks.md`: record the
2026-08-11 lock break, the Light Arcade direction, the STRUCK adoption, the
bright-neon-is-fill-only rule, and the preserved one-ground invariant.
