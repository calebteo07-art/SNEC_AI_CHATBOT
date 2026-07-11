# Mono EyeBot logo — unify every logo mark to one black/white eye glyph

**Date:** 2026-07-11
**Status:** Approved (brainstorm), ready for implementation
**Scope owner:** Caleb (user-requested: "replace all logos in the entire app with this
[eye-glyph + EyeBot wordmark] but in black or white depending on scenario")

## Goal

Replace the EyeBot **brand logo mark** everywhere it appears with a single new eye glyph —
a rounded eye outline containing an **iris ring + pupil** (superseding the 4-point
"Spark-Eye" sparkle) — rendered strictly **monochrome**: solid black on light surfaces,
solid white on dark surfaces ("depending on scenario"). Paired with the "EyeBot" wordmark
as live mono text.

This is a **logo-mark** change only. It is NOT a change to the Iris/Selena **mascot**
character or the SNEC institutional logo (both confirmed out of scope by the user).

## Non-goals (explicitly stays as-is)

- The **Iris/Selena mascot character**: homepage greeting mascot (`GreetingHero`/`SelenaLogo`
  `hello`), the dancing-Iris Veo video (`TutorLanding` `<video>`), reply-bubble mascot
  (`MessageBubble`), avatar **Selena Studio**, leaderboard headshots. All keep their colorful
  `iris.png`-based look.
- The **photoreal "Living Eye" login hero** (`EyeHero`/`login-eye.png`) — a decorative hero
  experience, not a logo.
- The **SNEC** institutional logo (`/brand/snec-logo.jpg`) — keeps its official form.
- The reference art's **gradient + rounded-bold font** — the ask is "black or white", i.e.
  mono. Wordmark stays live text in the app font (offer to match the reference font later).

## The mark

One glyph, drawn once, painted with `currentColor` so "black vs white" is just the color a
caller sets (via the existing `tone` prop or inherited `color`).

- **Eye outline**: rounded eye (smooth cubic curves, not the current sharp almond), `fill:none`,
  `stroke: currentColor`, round joins/caps.
- **Iris**: concentric ring (`fill:none`, `stroke: currentColor`).
- **Pupil**: filled dot (`fill: currentColor`).
- **Small-size fallback (≤20px, e.g. favicon/rail)**: render a **solid iris disc** (no ring)
  so the concentric detail doesn't muddy at tiny sizes. Matches the current component's
  existing small/large branch in `Logo.tsx`.
- Reference geometry (48×48 viewBox), tuned in the approved widget:
  - eye: `M6 24 C6 24 13 13 24 13 C35 13 42 24 42 24 C42 24 35 35 24 35 C13 35 6 24 6 24 Z`
  - iris ring: `circle cx24 cy24 r7.4 stroke-width~3`
  - pupil: `circle cx24 cy24 r~2.6`

## Colour mechanism ("depending on scenario")

- Component glyph paints with `currentColor`; `<Logo tone="ink|white">` maps to
  `var(--logo-ink)` (already `#15161B` light / near-white in dark theme) vs `#fff`.
- **Favicon** (`public/icon.svg`) is standalone (no CSS context): bake black as default with an
  inline `<style>@media (prefers-color-scheme: dark){ … fill/stroke:#fff }</style>` so the
  browser tab flips black↔white with the OS theme.
- Each call site passes the correct tone for its background (see edit list).

## Edit list (logo mark only)

| # | File | Change | Surface bg → tone |
|---|------|--------|-------------------|
| 1 | `frontend/src/aurora/Logo.tsx` | Replace sparkle path with iris-ring + pupil; keep `currentColor`, `tone`, small-size solid-iris branch. `data-testid="aurora-logo"` preserved. | n/a (per caller) |
| 2 | `frontend/public/icon.svg` | New glyph; add `prefers-color-scheme: dark` → white. | tab: black / white |
| 3 | `frontend/src/screens/OnboardingScreen.tsx` (`EyeLogo`) | Reuse `<Logo>` (or its glyph) instead of the private inline SVG. | light → ink |
| 4 | `frontend/src/aurora/components/CoBrand.tsx` | EyeBot **mark** = `<Logo>` (honors `is-dark` → white); remove `SelenaLogo`; drop colored Gemini halo (mono, may keep gentle breathe). SNEC untouched. | light → ink / dark → white |
| 5 | `frontend/src/aurora/components/BrandSplash.tsx` | Mark = `<Logo>` + mono `Wordmark`; remove grooving `SelenaLogo`. | light splash → ink |
| 6 | `frontend/src/aurora/components/AtlasRail.tsx` / `ConsoleRail.tsx` | No code change — they already render `<Wordmark>` (`white` / ink). Verify tone reads correctly with the new glyph. | dark rail → white / light → ink |
| 7 | CSS (`brand-mascot.css`, `aurora.css` cobrand block) | Remove/neutralize mascot-specific styling now unused in CoBrand/splash (halo pseudo-element); keep `.selena-logo` intact for the mascot surfaces that still use it. | — |

## Tests / harness (must update — they encode the OLD lock)

- `frontend/tests/aurora_assert.mjs:83` — BrandSplash currently *requires* `selena-logo`.
  Change to require the mono mark: `[data-testid="brand-splash"] [data-testid="aurora-logo"]`.
- `frontend/tests/aurora_assert.mjs:200-202` — CoBrand mark currently asserts the iris.png
  Selena. Change to assert `.aurora-cobrand-mark-wrap [data-testid="aurora-logo"]` present.
- Keep all mascot assertions (home greeting `hello`, reduced-motion swap, SNEC-in-rail) green
  and unchanged.
- Add a focused structural check (Node or existing harness) that `<Logo>` uses `currentColor`
  and renders iris+pupil (not the sparkle) — the TDD anchor.

## Design-lock amendments (`docs/design-locks.md`) — name the criteria changed

- **Mono Spark-Eye lock**: glyph refined from 4-point sparkle → iris-ring + pupil; still mono,
  still `currentColor`, still the rail/favicon/login mark. Criterion changed: *glyph interior*.
- **Branding / CoBrand lock (ricoe §6.6)**: the EyeBot **mark** in the CoBrand lockup changes
  from the **living mascot** to the **mono `<Logo>` glyph** (black/white per surface). Criterion
  changed: *what serves as the mark* (mascot → corporate mono mark). SNEC + wordmark + divider
  layout unchanged. The mascot remains the character everywhere else.
- **BrandSplash lock**: mark changes from grooving mascot → mono `<Logo>` + wordmark.
- **Login note**: the login's existing `EyeLogo` glyph is refreshed to the new mono mark
  (still no color, no new brand chrome added — spirit of "login verbatim" preserved).

## Acceptance criteria

1. The new iris+pupil glyph renders identically (one source) in: rails, favicon, login logo,
   CoBrand mark, BrandSplash — no remaining copy of the old sparkle path anywhere.
2. Every surface is solid **black on light / white on dark** — no gradient, no color on the mark.
3. Favicon flips black↔white with OS `prefers-color-scheme`.
4. Mascot, Living-Eye hero, and SNEC logo are byte-for-byte unchanged in behavior.
5. `aurora` harness green (updated assertions), `npm run typecheck` + `npm run build` clean,
   `python -m pytest -q` unaffected.
6. Behavioral verify in a running app, **light and dark**: rails, login, splash, CoBrand
   (CheckIn / Tutor landing / Flashcards) all show the mono mark legibly.
7. `docs/design-locks.md` amended per above.

## Approach alternatives considered

- **A (chosen)**: one `currentColor` glyph in `<Logo>`, every surface reuses it. Consolidates
  today's 3 hand-drawn copies → 1; "scenario" = the color at the call site.
- **B**: repaint each inline SVG separately — keeps duplication/drift (today's problem). Rejected.
- **C**: CSS-filter the raster reference PNG to mono — fuzzy at sizes, unreliable on favicon.
  Rejected.
