# Composited Eyecon — hybrid raster paper-doll

**Date:** 2026-07-14
**Status:** Approved (brainstorm) — pending spec review → implementation plan
**Owner:** Eyecon Studio / avatar system

## Problem

The Eyecon customization page (`/studio`) has a misleading preview. Two user-reported symptoms:

1. **"Not every selection tab reflects a change in the preview."** The colour axes
   (Body, Eye, Blush) never change the hero *image* — Body/Blush only nudge two small
   dots, Eye adds a faint inner ring ([studio.css:122,144-146](../../../frontend/src/aurora/studio.css)).
2. **"Some elements conflict and the preview shows something completely different."**
   Selecting one feature *replaces* the whole avatar with a different picture.

### Root cause

The `<Eyecon>` hero renders exactly **one flat raster** —
`portraitUrl || representativeTileSrc(config) || iris.png`
([Eyecon.tsx:27](../../../frontend/src/aurora/avatar/Eyecon.tsx)) — plus a CSS backdrop.
It cannot stack features or recolor baked art. In the Studio the single image is the
*last-touched* tile axis ([EyeconStudio.tsx:155](../../../frontend/src/aurora/screens/EyeconStudio.tsx)),
so choosing a hat then an outfit shows only the outfit, and tapping a colour step snaps
the hero to `representativeTileSrc` — the highest-*priority* feature, often a different
one than you were editing. The tile assets are **whole mascots wearing one feature**,
keyed to transparent ([generate_tiles.py:45-49](../../../tools/avatar/generate_tiles.py)) —
not isolated layers — so they physically cannot be composited.

## Decisions (locked in brainstorm)

1. **True composited avatar** — every pick visible together; colours recolor live.
2. **Hybrid raster paper-doll** — isolated on-brand raster overlays + a tintable base;
   CSS luminance-tint gives live recolor. (Vector was rejected on the photoreal-branding
   lock; preset-only colours were rejected as too limited.)
3. **Retire the server AI-portrait pipeline** — the composited client avatar becomes the
   single source of truth everywhere (Studio, home, leaderboard). Preview == saved look,
   zero paid per-user renders, simpler state.
4. **Trim the axis set** — remove `blush`, `lashes`, `mouth`, `glasses`. Final 7 axes:
   `bodyColor`, `irisColor` (tint), `eyeShape`, `topper`, `accessory`, `outfit` (overlay),
   `background` (CSS).

## Architecture

### Rendering model — layered stack

`<Eyecon>` becomes a compositor over a fixed 512² space. Layers back → front, each
deterministic from `config`; `none`/default omits its layer:

| z | Layer | Source | Recolor |
|---|-------|--------|---------|
| 0 | Background | `backdropCss(bg)` (exists) | — |
| 1 | Body base | neutral-shaded body raster + silhouette mask | ✅ bodyColor |
| 2 | Outfit | isolated overlay | — |
| 3 | Eye + iris | eyeShape overlay (neutral iris) + iris-tint disc | ✅ irisColor |
| 4 | Accessory | isolated overlay | — |
| 5 | Topper | isolated overlay (frontmost) | — |

Every non-colour option is one transparent PNG registered to the shared anchors, so
stacking = a correct composite. This **structurally fixes both bugs**: all features show
together, and every axis maps to its own layer or tint — no last-touched, no priority
jump.

### Live recolor — CSS luminance tint

Body and iris recolor with **no render**: the region ships as a neutral grayscale-shaded
base + an alpha **mask**; the chosen hex is a coloured layer with
`mix-blend-mode: multiply` clipped by that mask (`mask-image`/`-webkit-mask`). Multiply
over a light base preserves the base shading and reads as the picked colour — instant,
free, on-brand. SVG `feColorMatrix` duotone is the fallback if multiply reads flat. The
exact blend is validated in the Phase 0 spike.

### Asset pipeline — the alignment spike (the one real risk)

Isolated overlays must be **pixel-registered** to the base:

1. Generate the base Eyecon once (fixed pose/anchors), key to transparent 512².
2. Per feature: **image-to-image edit** with `reference = base`, prompt "the SAME mascot,
   add ONLY `<feature>`, nothing else moves" → key transparent → aligned "base+feature".
3. **Isolate** = diff vs base, keep changed pixels → the feature overlay at correct
   registration. Eye overlays are generated with a neutral-gray iris; the iris region is
   exported as the tint mask.

**Phase 0 proves this on 3 features spanning the hard cases — a topper (small,
head-anchored), an outfit (large, occludes the body), and one non-round eyeShape (the eye
region + iris mask) — before any bulk spend.** If edit-mode
drifts, fallback: fixed guide-mark template + auto-crop, or manual registration. Reworks
`tools/avatar/generate_tiles.py`.

## Changes by surface

- **`frontend/src/aurora/avatar/Eyecon.tsx`** — rewritten as the compositor; still
  presentational, hook-free, SSR-safe. `onError` hides a missing layer (keeps today's
  graceful degradation). Propagates to home + leaderboard automatically (single chokepoint).
- **`frontend/src/aurora/screens/EyeconStudio.tsx`** — drop
  `heroPortrait`/`heroTile`/`lastAxis`/`heroFusing`/`representativeTile` logic; hero is
  just `<Eyecon config={draft} background={draft.background}>`. Remove the 4 deleted steps
  from `STEPS`, `COLOR_MAP`, `TILE_AXES`. Colour steps now visibly recolor the hero.
- **Axis registry** — remove the 4 axes from `tools/avatar/parts.py`; regenerate
  `frontend/src/aurora/avatar/axes.generated.ts` via `tools/avatar/export_axes.py`.
  Remove `BLUSH_COLORS` from `manifest.ts`. Existing DB configs degrade gracefully
  (extra keys dropped by `validate_config`) — **no migration**.
- **Retire portrait** — remove `POST /api/avatar/portrait`, `_portrait_state`,
  `_generate_portrait`, and the `portrait_status`/`portrait_url` fields from
  `GET /api/avatar` ([avatar.py](../../../tools/api/routers/avatar.py)). Delete
  `useRequestPortrait`/`useSelfHealPortrait` and the poll from `useAvatar.ts`. The
  `avatar_images` table (migration 007) is left dormant; a `render_portrait` fallback may
  be kept but is no longer wired. `representativeTile.ts` deleted once unused.

## Data / migration

None required. Axis removal is graceful (extra keys dropped; stale ids fall back to
default). Portrait columns/table left dormant, droppable in a later cleanup migration.
No `PERSIST_SCHEMA_VERSION` bump needed (removed portrait fields read as undefined in old
caches; the config shape only *loses* keys).

## Phasing (respects placeholders-first + paid-gen gate)

- **Phase 0 — alignment spike.** Prove isolated-overlay registration on 2–3 features.
  Go/no-go before any bulk spend. (Needs a live key; a handful of paid renders — explicit
  go-ahead.)
- **Phase 1 — renderer + system on placeholder art (keyless).** Build the compositor,
  tint system, masks, z-order; generate **clearly-marked placeholder overlays** (green,
  keyless); rewire Studio; retire portrait reads. Fully TDD'd + harness-verified. Ships the
  UX fix structurally even before final art.
- **Phase 2 — paid art (explicit go-ahead).** Generate the real base + ~70 overlays + iris
  masks, review in `.tmp/`, install, swap placeholders.

## Testing

- **Node harness** (extend `frontend/tests/eyecon_assert.mjs`): assert the layer set +
  z-order for representative configs; `none`/default axes omit their layer; tint CSS vars
  applied for body/iris.
- **Regression test for this bug** (the invariant per `/ship-check`): body and iris each
  change a tint layer, and two feature axes (topper + outfit) coexist in one composite —
  covering the exact "one tab doesn't reflect / features conflict" failure.
- **Visual**: Studio screen via `aurora_assert`; behavioral verify on the running app.
- Backend: `validate_config` drops the 4 removed axes; `GET /api/avatar` no longer returns
  portrait fields.

## Risks & open questions

- **Alignment (highest).** Edit-mode registration is unproven → Phase 0 gates it.
- **Tint fidelity.** Multiply-tint on the photoreal body must look good, not muddy →
  validated in the spike; `feColorMatrix` fallback.
- **Eye region.** eyeShape + iris tint is the fiddliest composite (shared anchor, per-shape
  iris mask). Spike includes one non-round eyeShape.

## Out of scope

- Re-adding removed axes. Dropping the dormant portrait columns/table (later cleanup).
- Any change to gamification, leaderboard ranking, or the first-login gate (the gate keys
  off `customized`, which is unchanged).
