# Homepage "Come Alive" — design spec

**Date:** 2026-07-10
**Status:** approved (design), pending implementation plan
**Surface:** student Home / Dashboard (`.aurora-home`)
**Scope:** frontend-only, plus two small paid-gen tools (Nano-Banana flash + Veo)

## Goal

The homepage cards read as premium but a few feel plain and static. Bring the
Home to life: an alive, enlarged streak flame; larger, clearer type on every
card; the three feature cards restyled into mesmerizing themed **Selena** scenes;
the plain streak/badge/progress cards lifted; and the greeting-card Selena made
**always the default mascot** and truly animated (CSS now, a **Veo** looping
video as a gated follow-on).

User directive (2026-07-10, verbatim intent): "enlarge and make alive the fire
icon in the streak card, enlarge all words in all homepage cards, customise and
make mesmerizing the feature cards with default Selena via Nano-Banana flash, fix
the plainness of streak/badge/progress (nano/veo or not, my judgment), and the
greeting-card Selena is **default from now on** with a **Veo** looping animated
video." Paid Nano-Banana + Veo use is explicitly authorized for design work.

## Decisions (from the clarifying round)

1. **Greeting motion** — *Both*: ship a lush CSS-alive default mascot now; add a
   Veo loop on top as a progressive enhancement once generated + reviewed.
2. **Greeting avatar** — *Always default*: the greeting card shows the default
   Selena for every student. The custom render still lives in Selena Studio and
   the leaderboard. **This re-opens the "Custom Selena surfaces" lock.**
3. **Feature cards** — *Full-bleed themed scene*: each coverflow card becomes a
   Selena scene with feature text over a legibility scrim. Coverflow *mechanics*
   stay locked; only the card skin changes.
4. **Plain cards** — *Per-card judgment*: cheapest treatment that removes the
   plainness. Resolved below as CSS-only for all three (no new art).

## Current state (verified)

- `frontend/src/aurora/components/home/GreetingHero.tsx` — renders `portraitUrl`
  (custom render) when present, else `<SelenaLogo motion="hello">`. Fed by
  `Dashboard.tsx:34-35` (`portraitUrl = avatar.customized && ready ? url : null`)
  → passed at `Dashboard.tsx:129`.
- `frontend/src/aurora/components/home/StreakTile.tsx` — flame is
  `<Icon name="flame" className="hm-flame ico" />`; styled `.aurora-home .hm-flame`
  (66px, two-tone via `.core`) in `home.css:91-92`.
- `FeatureCarousel.tsx` — locked 3D coverflow; cards are `.hm-fcard {tutor|vp|flash}`
  with gradient backgrounds (`home.css:112-131`). Mechanics (base drift,
  tap-resolves-to-nearest, arrows, quadratic fade) must not change.
- `MilestoneLadder.tsx` (badge shelf) + `WeekStats.tsx` (progress stats) — the two
  `.hm-panel` cards.
- `home.css` — single scoped stylesheet (`hm-` namespace). Existing reduced-motion
  guards at lines 202-215 (both `@media prefers-reduced-motion` and
  `html[data-motion="reduce"]`).
- **`HiggsfieldLoop.tsx` depends on `MotionProvider` (`useFx`), which is NOT
  mounted in the student app** — using it on Home would crash. The greeting Veo
  player must be self-contained: detect reduced motion via
  `matchMedia("(prefers-reduced-motion: reduce)")` + `data-motion="reduce"`,
  exactly as `FeatureCarousel.tsx` already does.
- Paid image primitive: `tools/avatar/generate_sprites.py::generate_image_bytes(prompt, model, reference)`;
  `MODELS["flash"] = "gemini-3.1-flash-image"`. Established estimate→generate(.tmp)→review→install
  discipline in `tools/brand/generate_poses.py`.

## Work items

### A · Living, enlarged fire (Streak card) — free, CSS

- Enlarge `.hm-flame` from 66px to ~84px (mobile-clamped).
- "Alive": a CSS-only flame — asymmetric flicker (small `scale`/`skewX` wobble on
  a short irregular cycle), a warm hue-shimmer / opacity pulse on the two-tone
  `.core`, and a pulsing ember `drop-shadow`. One or two `::before`/`::after`
  ember sparks drift upward and fade.
- Freezes to a static flame under `prefers-reduced-motion` / `data-motion="reduce"`.

### B · Enlarge all words — free, CSS

A deliberate type-scale bump across every Home card, with legibility as a
co-goal (bigger *and* clearer):

- Greeting: `h1` 46 → ~50px; `.hm-sub` 17 → ~19px and darken (`#65546F` → deeper).
- Streak: `.hm-t`, `.hm-slbl`, `.hm-nexttier` text up ~1–2px; keep `.hm-snum` big.
- Feature cards: `.hm-kicker`, `h3`, `p`, `.hm-open` up (also see C legibility).
- Badge: `.hm-ph`, `.hm-badge-name`, `.hm-badge-meta` up ~1px.
- Progress: `.hm-ph`, `.hm-sl` (stat labels) up + darken; `.hm-sv` stays large.
- All values clamped so 390px stays safe; no horizontal overflow.

### C · Feature coverflow → Selena scenes — paid (3× flash, ~cents)

- New tool `tools/brand/generate_feature_art.py` mirroring `generate_poses.py`:
  `--estimate` (no calls) → `--generate` (to `.tmp/feature-art/`, PAID, refuses in
  MOCK_MODE) → human review → `--install` (to `frontend/public/brand/features/{tutor,vp,flash}.webp`).
- `reference=True` (anchored to `iris.png` so she's unmistakably the mascot).
  Opaque render is fine (full-bleed background — no alpha needed).
- `home.css` `.hm-fcard.{tutor|vp|flash}` gains the scene image as a background
  layer under the existing tone gradient, **plus a bottom-up gradient scrim**
  (`::after` or layered background) so kicker/title/sub/CTA stay WCAG-AA legible.
  The tone gradient becomes the graceful fallback if an asset is missing (nothing
  depends on the image existing).
- **Approved prompt contract** — flash (`gemini-3.1-flash-image`), `reference=True`,
  landscape 3:2 (recorded per the generated-imagery standing rule):
  > "The same one-eyed EyeBot mascot as the reference image — a soft, rounded,
  > hairless teal-and-cream character with a single large friendly eye and a calm
  > gentle smile, identical proportions, colours and rendering to the reference.
  > `<scene>`. Warm premium studio lighting, soft depth of field, a `<tone>`
  > gradient atmosphere. The lower third of the frame is calmer and less busy to
  > leave room for text. Landscape 3:2, mascot to one side. No text, no border, no
  > watermark, no extra characters, no human faces."
  - **tutor** (`<tone>` = violet): "She is a friendly Socratic eye-coach beside a
    softly glowing lesson board with floating knowledge motes, gesturing warmly as
    if explaining a concept."
  - **vp** (`<tone>` = teal): "She plays a caring clinician at an ophthalmic
    slit-lamp examination station, a soft glowing eye-diagram floating beside her,
    clinical yet warm and approachable."
  - **flash** (`<tone>` = amber-to-coral): "She holds up a fan of glowing recall
    flashcards spread like a playful hand of cards, each card emitting a soft
    gemini-gradient glow."

### D · Plain cards, per-card — free, CSS

- **Streak** — the alive flame (A) plus a warm ember-gradient wash on the panel
  surface so it stops being a flat white card; subtle ember motion behind the
  number (reduced-motion safe).
- **Badge shelf** (`MilestoneLadder`) — already carries generated badge art +
  float/shine; lift the *panel*: a soft gradient header rule and a subtle shelf
  ground line for depth. No new art.
- **Progress** (`WeekStats`) — the four flat `#FAF4EA` stat tiles gain per-tone
  gradient tints and a hairline top-accent in each stat's colour, plus the B type
  bump. No new art.

### E · Greeting Selena — always default + alive, Veo follow-on

- **Always default:** `GreetingHero` no longer branches on `portraitUrl` — it
  always renders the living default mascot. `Dashboard.tsx` stops passing
  `portraitUrl`/`background` to `GreetingHero` (both were only used there). The
  custom render is untouched in Studio + leaderboard.
- **CSS-alive now:** build on `<SelenaLogo>` so the default mascot breathes, bobs,
  blinks its eye on a cadence, gives an occasional small wave, and carries a
  breathing halo. Freezes to static `iris.png` under reduced motion.
- **Veo loop (gated follow-on, paid):**
  - New tool `tools/media/generate_greeting_loop.py` — image-to-video from
    `iris.png` via Veo on `GEMINI_API_KEY` (`google-genai` `generate_videos`,
    long-running op poll). Renders to `.tmp/greeting-loop/` for review;
    `--install` copies to `frontend/public/media/loops/greeting-selena.mp4` + a
    poster `.jpg`. Refuses in MOCK_MODE.
  - **Veo can't emit alpha** → bake a warm background (peach→pink→lavender
    matching `.hm-greet` #FFE3C2→#FFD2E0→#E7D9FF), feathered so the rounded video
    tile blends into the card.
  - **Approved prompt contract** — Veo (exact model id confirmed by the capability
    probe), image = `iris.png`:
    > "Seamless looping animation of this one-eyed teal-and-cream EyeBot mascot:
    > she gently breathes and bobs, blinks her single eye once, gives a small
    > friendly wave, then settles — the final frame identical to the first for a
    > perfect loop. Warm soft studio lighting on a warm peach-to-lavender gradient
    > background. Calm, premium, subtle motion only, no camera movement. No text,
    > no extra characters."
  - New self-contained `<SelenaGreetingLoop>` (no `useFx`): poster paints
    immediately, video plays muted/loop/inline when in view, reduced-motion or
    save-data ⇒ poster/static `iris.png` only, `onError` ⇒ static mascot.
  - **Gating:** a capability probe first (confirm Veo access + model + est. cost),
    reported to the user; generate to `.tmp` for review; install only on explicit
    go-ahead. The homepage is fully complete on CSS **without** the video — the
    loop is pure enhancement.

## Lock changes (record in `docs/design-locks.md`)

- **Home / Dashboard (LOCKED 2026-07-01)** — refine: enlarged type scale; alive
  enlarged streak flame; feature coverflow cards reskinned to full-bleed Selena
  scenes (mechanics unchanged); plain-card lift. Acceptance criteria below.
- **Custom Selena surfaces (LOCKED 2026-07-08)** — amend: the **greeting card now
  hosts the default living mascot for every student** (CSS-alive, optional Veo
  loop), *not* the custom render. Custom render remains on Studio + leaderboard;
  all other brand surfaces stay default (unchanged). Rationale: user directive
  2026-07-10.

## Acceptance criteria

- Streak flame is visibly larger and animated; frozen under reduced motion.
- Every Home card's text is larger and remains WCAG-AA legible; no low-contrast
  regressions; 390px-safe, no horizontal overflow.
- Each feature card shows its Selena scene with legible overlaid text (scrim);
  missing asset degrades to the tone gradient; coverflow drift/tap/arrows/keyboard
  navigation unchanged.
- Streak/badge/progress no longer read as flat plain panels; all added motion is
  reduced-motion safe.
- Greeting card shows the default mascot for a customized student too; the mascot
  is alive via CSS and freezes under reduced motion; the Veo loop (when installed)
  plays, loops, and falls back to poster/static under reduced motion / save-data /
  error.
- `frontend` typecheck + build green; aurora assert harness green (run against an
  already-warm server; navCtx needs `eyebot_selena_onboarded=1`).
- No paid generation runs without an explicit user go-ahead; prompts recorded here.

## Out of scope

- Coverflow interaction mechanics (locked); Selena Studio; leaderboard; the custom
  render pipeline; any backend/API/DB change; brand surfaces other than the Home
  greeting (SelenaLogo/CoBrand/splash/rails/favicon/Login stay default + unchanged).
- No new invented progress stats (WeekStats stays real-data-only).

## Verification

- Unit/build: `cd frontend && npm run typecheck && npm run build`.
- Visual: aurora harness (`bash scripts/start-harness.sh aurora`, or assert vs a
  warm server), + screenshots at desktop and 390px for legibility / reduced-motion.
- Paid gen: `--estimate` reviewed before any spend; outputs reviewed in `.tmp`
  before `--install`; Veo behind the capability-probe + go-ahead gate.
