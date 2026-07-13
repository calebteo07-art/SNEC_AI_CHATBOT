# Leaderboard redesign — "vibrant & seamless" (supersedes "The Climb" D7)

Date: 2026-07-13 · Frontend-only · Zero backend/DB change · Supersedes the 2026-07-10
"The Climb" lock (`docs/design-locks.md`).

## Why

The current board reads "messy": five disconnected, individually-styled floating panels
stacked vertically — header card · podium · rivalry-spotlight card · tier-band section
headers · rows · settings card. Each has its own background and rhythm, so the page has
no through-line. The user asked to strip it and rebuild it **seamless, sleek, gamified,
addicting, colorful, vibrant, happy**, inspired by a glossy candy-crush mobile leaderboard,
but executed cohesively with EyeBot's warm Aurora family (not a literal cartoon). Direction
approved via an interactive mockup; user note: **"make the entire page more vibrant and
addicting, do not hold back."**

## What we build

**One continuous board**, not five panels. Top→bottom: compact header → podium (top 3) →
one clean color-graded ranked list → one quiet settings strip. Podium and list share the
same warm canvas and row rhythm so the page reads as a single object ("seamless").

### Layers
1. **Header** — one bold `Leaderboard` h1 (exactly one `<h1>`), a `Season 1 · Your cohort`
   eyebrow chip, and the role-filter pills. Keeps `.lb-filter .lb-chip` (harness drives them).
2. **Podium (top 3)** — the vibrant centerpiece. Glossy gold/silver/bronze pedestals, 2·1·3
   order (champion center + tallest), champion crown + float/shine on #1, tier-ringed
   `<Selena>` headshot, Lumens with the real `<Lumen>` gold coin, tier crest. **New:** each
   podium person also shows a compact streak flame. `data-testid="podium-slot"` ×3 preserved.
3. **Ranked list (rank 4+)** — one seamless stack of chunky, glossy, rounded pill rows,
   **color-graded by XP tier** going down the list (the candy-fade from the reference). This
   keeps the Bronze→Diamond tier meaning as a subtle per-row accent (ring color + faint row
   tint) instead of the heavy separate tier-band headers. Each row:
   `[rank] [tier-ringed Selena] [name + role chip] [right badge cluster]`.
   - **Right badge cluster (per the user's explicit ask): BOTH badges, always fitting** — a
     gold **Lumens** badge (coin + count-up number) and a 🔥 **streak** badge (`Nd`), stacked
     vertically so they never collide, even at 390px. `Lv` demotes to a small inline chip.
   - `data-testid="lb-row"` preserved; the viewer's row keeps `data-you` + a violet glow +
     `YOU` tag — this is the "find yourself / chase the next rank" hook, folded into the list
     (no separate spotlight card).
4. **Settings** — one slim, visually subordinate strip: show/hide toggle
   (`data-testid="lb-hide-switch"`), optional display name, `Edit Selena`
   (`data-testid="edit-selena"`). Restyled via CSS; component logic unchanged.

### Aesthetic ("vibrant, don't hold back", still cohesive)
Warm peach/cream canvas (rhymes with the reference AND today's board). Cranked past the
mockup: deeper, more saturated podium gradients; glossy top-sheen + layered depth shadows on
every row; livelier tier tints; a header with more life; bolder Lumens/streak badges. Motion:
podium float + shine, row entrance stagger, count-up Lumens, pulsing you-row glow, one-time
podium confetti. **All CSS-only, fully frozen under reduced motion** (OS pref + app
`data-motion="reduce"`). WCAG-legible. Committed single warm-light world (deliberate — matches
production; no dark variant, like today's board).

## Preserved behavior (unchanged)
Everyone-by-default XP ranking, opt-out hide, optional display name, role filter, real
`<Selena>` headshots (default-mascot fallback), Lumens currency + `<Lumen>` coin, `Edit
Selena` entry, count-up, one-time reduced-motion/session-gated podium confetti.

## Dropped
`RivalrySpotlight.tsx` and `TierBand.tsx` components (deleted — the two biggest clutter
sources; neither is asserted structurally by the harness). `tiers.ts` stays intact (still uses
`tierForXp`/`splitPodium`; `computeRivals`/`bandRows` retained as tested pure utilities).

## Files
- Rewrite: `frontend/src/aurora/leaderboard.css`, `.../screens/Leaderboard.tsx`,
  `.../components/leaderboard/LeaderboardRow.tsx`.
- Restyle: `.../components/leaderboard/Podium.tsx` (add streak chip),
  `.../components/leaderboard/LeaderboardHeader.tsx` (title → "Leaderboard").
- Keep: `BoardSettings.tsx` (CSS-only restyle), `crests.tsx`, `tiers.ts`, `Lumen`, `Selena`,
  `useCountUp`, `confetti`.
- Delete: `RivalrySpotlight.tsx`, `TierBand.tsx`.
- Update: `docs/design-locks.md` (rewrite the leaderboard lock), `frontend/tests/aurora_assert.mjs`
  (update descriptive comments/log strings; behavioral assertions unchanged).

## Acceptance criteria
- One seamless board (header → podium → single list → settings); no five-panel stack.
- Reads unmistakably more vibrant/gamified than "The Climb", still in the warm Aurora family.
- Every ranked row shows BOTH a Lumens badge and a streak badge, fitting cleanly at 390px.
- Podium (3 slots) + glowing you-row + real Selena portrait + role filter + hide toggle +
  Edit Selena all present and functional.
- Zero backend/DB change.
- Motion fully frozen under reduced motion; WCAG-legible; **no horizontal overflow at 390px**.
- Green: `frontend/tests/leaderboard_logic.mjs`, the aurora assert harness (leaderboard block),
  `npm run typecheck`, `npm run build`.

## Out of scope
Real weekly leagues (promotion/relegation/reset — needs backend); rank-movement arrows
(needs history); changing the currency or avatar system.
