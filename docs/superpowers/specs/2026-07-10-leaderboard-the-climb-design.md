# Leaderboard redesign — "The Climb" (RICOE, D7 refresh)

**Date:** 2026-07-10
**Status:** Design approved (mockup `climb-v1`), pending spec review → plan.
**Supersedes:** the plain D7 leaderboard visual treatment (generic photopic
tokens). Keeps every D7 *behavior* (everyone-by-default, XP-only rank, opt-out
hide, optional display name, role filter, `<Selena>` headshots, "Edit Selena"
entry) and the two locks that touch the screen (custom `<Selena>` raster; the
onboarding "Edit Selena" surface).

---

## Objective

Turn the leaderboard from a flat generic list into a **premium, gamified,
addicting** board that reads as a first-class member of the warm-premium
homepage family. The addiction comes from three psychological levers, all
derivable from data we already return — **no backend or DB change**:

1. **Aspiration** — a dramatized top-3 **podium**.
2. **Attainable next goal + loss aversion** — a **rivalry spotlight** that shows
   exactly how far you are from the person above and how close the person below
   is to you.
3. **Progression / collection** — **XP tiers** (Bronze → Diamond) with generated
   crest emblems, banding the board like a league ladder.

## Aesthetic (honor the home design system)

Reuse the `.aurora-home` visual language verbatim; do not invent new colors:

- **Palette** (scoped to the leaderboard root so nothing leaks): `--cream
  #F1E3CF`, `--card #FFFCF6`, `--hink #2B2431 / --hink2 / --hink3`, `--line
  #EBDFCB`, `--violet #7C5CF6 / --violet-d #6D28D9`, `--teal #12B5A0`, `--flame1
  #FB8C28 / --flame2 #F0431F`, coral `#F4557A`; soft warm `--sh` / `--sh-lg`;
  `--hr:24px` radius.
- **Type**: Bricolage Grotesque display (`--font-bricolage-src`) for ranks,
  names, XP, titles; system/sans for body — same as home.
- **Warm canvas**: add a `.aurora-main:has(.lb-climb)` rule mirroring the
  home canvas (peach/rose/lilac bleed over cream; hide the drifting mesh).
- **Tier colors**: Bronze `#C97B4A/#E8A06A`, Silver `#94A3B8/#CBD5E1`, Gold
  `#F59E0B/#FCD34D`, Platinum `#38BDC9/#7FD6E6`, Diamond `#7C5CF6/#A78BFA`
  (top tier ties to the home violet).

## Layout & components

Board width ~900px, centered, single column of stacked sections. Each unit is a
small focused component with one job.

1. **`LeaderboardHeader`** — gradient banner (home greeting radial wash),
   Bricolage title "The Climb" + eyebrow ("Cohort leaderboard · Season 1"), a
   subtitle that surfaces the viewer's live hook ("You're N XP from the podium"),
   glassy **role-filter pills** (All / OA / OT / PSA — only when `roles.length > 1`),
   and a cohort count.
2. **`Podium`** — top 3. Center (#1) raised + crowned + champion glow (gold
   pedestal); #2 silver, #3 bronze. Each: `<Selena>` headshot, name, role, XP,
   **tier crest** chip. Degrades gracefully to 1–2 pedestals if the cohort is tiny.
3. **`RivalrySpotlight`** — the viewer's standing. Big rank, `<Selena>` (tier
   ring), name, tier chip, streak, level; plus two gap rows with bars:
   - *above*: "▲ {gap} XP to overtake {name} (#{rank})" — if that pass reaches the
     podium (#3), append "— and reach the podium".
   - *below*: "{name} (#{rank}) is {gap} XP behind — keep climbing".
   - CTA: "Earn XP" → `/flashcards` (fastest instant-XP loop); "Edit Selena" → `/studio`.
   - Edge cases: **#1** → "👑 You're on top — {gap} XP clear of #2" (no above row);
     **last** → no below row; **hidden** → a gentle "You're hidden — show yourself
     to join the climb" card with the show toggle.
4. **`TierBand`** — a slim divider (gem + tier name + XP threshold + count) that
   groups the ranked rows by tier.
5. **`LeaderboardRow`** (rank 4+) — rank chip, `<Selena>` with a **tier-colored
   ring** (backdrop tint from `avatar_config.background`), name + role chip +
   streak + level, XP with **`useCountUp`** and an **XP bar relative to the
   leader** (`xp / topXp`). The viewer's own row glows violet + pulses + "You" tag.
6. **`BoardSettings`** (demoted) — one slim bar at the bottom: show/hide switch,
   display-name field + Save, "Edit Selena". All current functionality retained,
   visually subordinate so the board is the hero.

## Data & derived logic (pure, unit-tested)

All from the existing `/api/leaderboard` payload (`entries[]` with rank, name,
role, xp, level, streak_days, avatar_config, portrait_url, is_you; plus
you_hidden, display_name, roles). New pure module `frontend/src/aurora/leaderboard/tiers.ts`:

- `tierForXp(xp): Tier` — thresholds **Bronze <2,000 · Silver 2,000 · Gold
  4,500 · Platinum 7,000 · Diamond 10,000** (inclusive lower bounds). Returns
  `{ id, name, min, crestSrc, ring, c1, c2 }`. Boundary-tested.
- `computeRivals(entries, you)` — returns `{ above?, below? }` each `{ name,
  rank, gap }`, or `null`s at the ends; `null` when the viewer is hidden/absent.
- `splitPodium(entries)` — `{ podium: entries[0..2], rest: entries[3..] }`,
  safe for <3.
- `bandRows(rest)` — groups the rest by `tierForXp(xp).id`, preserving rank order,
  emitting `{ tier, rows }[]` with per-tier counts.

No backend, no migration, no persisted-shape change (so **no PERSIST_SCHEMA_VERSION
bump** — the payload is unchanged).

## Generated art (paid Nano-Banana-flash pass — placeholders first)

- **Assets**: 5 tier crests (bronze/silver/gold/platinum/diamond) + 1 champion
  crown = **6 transparent 512² webp**, stored in `frontend/public/brand/tiers/`.
- **Pipeline** modeled on `tools/brand/`: a registry + a dev-only generator
  (`tools/leaderboard/generate_crests.py`) using flash (`gemini-3.1-flash-image`)
  on flat chroma-green, keyed to alpha via the existing `tools/brand/keying.py`
  (`despill_green` + normalise 512²). Per [[feedback_nano_banana_model_choice]]
  (flash, not pro) and [[feedback_gemini_placeholders_first]].
- **Scaffold-first**: ship with the clean CSS/SVG gem crests + crown from the
  mockup as the committed fallback so the screen is green keyless; the component
  reads `crestSrc` and falls back to the inline SVG if the webp is missing. Run
  the paid gen **only on explicit go-ahead, with prompts + count confirmed first**
  (per [[feedback_generated_imagery_medical]]).
- **Prompt contract** (to be confirmed before spend): homepage-consistent, soft
  premium enamel/gem medallions, one per tier in the tier's two-tone color, plus a
  warm gold champion crown; flat `#00B140` background, no text/border/watermark.

## Motion & accessibility (CSS-only, reduced-motion aware — project policy)

- Podium: staggered entrance rise, gentle float, shine-sweep on #1.
- Spotlight gap bar: grow-in; you-row: soft violet glow pulse; rows: hover lift.
- XP: `useCountUp` (already IO- + reduced-motion-aware).
- **All** motion freezes under `prefers-reduced-motion` / `html[data-motion=reduce]`.
- 390px-safe (no horizontal overflow); WCAG-legible text on every tier/gradient
  surface; role tabs are real `role=tab`; the switch is `role=switch`.

## Testing (TDD — matched to the real toolchain)

This repo has **no JS unit runner** (no vitest/jest); the frontend is validated
by `.mjs` integration harnesses that mock `/api/*` and assert the rendered DOM.
So:

- **Pure logic** (`tiers.ts` — `tierForXp` boundaries, `computeRivals` for #1 /
  middle / last / hidden, `splitPodium`/`bandRows` for tiny + normal cohorts):
  keep the helpers dependency-free and cover them with a small standalone Node
  harness — `frontend/tests/leaderboard_logic.mjs` — that imports the logic as a
  sibling **`.mjs`** module (mirror of `tiers.ts`, or a shared plain-JS core the
  TS re-exports) and asserts each case. Write these assertions first (TDD), watch
  them fail, then implement.
- **aurora harness**: extend the mock payload (`frontend/tests/_mocks.mjs`) with a
  representative cohort incl. the viewer, warm `/leaderboard` against an
  already-warm server (gotcha per [[project_harness_local_server]]), and assert the
  podium, rivalry spotlight, tier bands, and the glowing you-row render with no
  console errors; capture a screenshot for the WCAG eyeball pass.
- **pytest**: backend is unchanged. Only if the crest generator lands a pure
  helper, add a registry-completeness test (all 5 tiers + crown present).

## Acceptance criteria (becomes the new design-lock entry)

- Board reads as the same family as `.aurora-home` (warm palette, Bricolage,
  soft shadows, gradient banner) — never the old generic photopic list.
- Podium (top 3), rivalry spotlight (attainable-gap + loss-aversion), XP tiers
  with crests, and the glowing you-row are all present.
- Every D7 behavior preserved: everyone-by-default, XP-only rank, opt-out hide,
  optional display name, role filter, real `<Selena>` headshots (default-mascot
  fallback), "Edit Selena" entry.
- Zero backend/DB change; all gamification derived client-side from the current
  payload.
- CSS-only motion, fully frozen under reduced motion; 390px-safe; WCAG-legible.
- Generated crests/crown degrade to committed SVG fallbacks if an asset is missing.

## Out of scope (future briefs)

- Real Duolingo-style **weekly leagues** (cohort buckets, promotion/relegation,
  weekly reset, persistence) — needs backend + migration; explicitly deferred.
- **Rank-movement arrows** (▲/▼ vs last week) — needs historical snapshots.
- Confetti / rank-up celebration, sound — not requested ("build this", not "go
  bigger"); can be a later refinement within the lock.
