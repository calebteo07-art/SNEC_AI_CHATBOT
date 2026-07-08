# Seamless Custom Selena — one transparent render, everywhere

**Date:** 2026-07-07 (rewritten 2026-07-08) · **Status:** approved
**Supersedes:** the raster-composite `<Selena>` sticker renderer
(`frontend/src/aurora/avatar/renderSelena.ts`, `6e9ba61`) and the D12
opaque-portrait revision. Amends the Selena Studio and Custom-Selena entries in
`docs/design-locks.md` (§10).

## 1. Summary

Custom Selenas are currently assembled in the browser: flat hand-drawn vector
stickers (crowns, glasses, hoodies…) pasted over the painterly soft-3D
`iris.png` raster. The styles clash and the result was rejected outright
("each component added makes it so ugly … unacceptable").

The fix: **a student's custom Selena is ONE AI-rendered image of the whole
look** — the model bakes hats, glasses and outfits into a single coherent
character (the live D12 portrait pipeline already proves this) — rendered on a
flat green screen and **chroma-keyed to a transparent 512² cutout** with the
same PIL keying that produced the animated logo poses. A transparent cutout
sits on any surface, so the same render serves the Studio hero, the leaderboard
headshots, and the homepage greeting card, where it animates with a living
CSS motion set. The client-side sticker compositor is deleted; nothing
hand-composited can render anywhere.

## 2. Decisions locked with the user (2026-07-07)

| # | Decision |
|---|----------|
| D-a | Greeting card animates ONE render per look with CSS living motion (breathe, bob, glow, entrance). No second pose frame — per-save cost stays ~1–2¢. |
| D-b | Studio option tiles are **real AI renders** (default Selena wearing just that option), shipped as static repo assets via a one-time paid pass. |
| D-c | Catalog grows "way more, way funnier": every non-colour axis roughly doubles with ridiculous options. |
| D-d | Studio hero is a **loadout**: it always shows the last *rendered* look (or the pristine default); picks dock as tiles; Save fuses the new render. No live client-side compositing, no live colour tints. |

## 3. Invariants

1. Default / never-customized Selena = the literal `/brand/iris.png`,
   pixel-identical, everywhere (standing mascot rule; flat vector Selenas were
   rejected three times).
2. Every custom render is anchored to `iris.png` (`reference=True`): ONE big
   eye, no hair, blob body, tiny arms — always recognizably her.
3. Every fallback path lands on `iris.png`. After this work the compositor no
   longer exists, so no state can show pasted-on parts.
4. Brand surfaces — `<SelenaLogo>`, CoBrand, BrandSplash, rails, favicon,
   login — always show the DEFAULT Selena and are untouched. The greeting-card
   mascot slot is the only surface that becomes personal.
5. No live Gemini call without explicit user go-ahead; everything ships
   keyless-green on clearly-marked placeholders first.

## 4. System design

```
Studio pick ──▶ PUT /api/avatar (fail-closed registry validation, JWT identity)
                     │ on save success → POST /api/avatar/portrait (cache-gated)
                     ▼
      flash render on flat #00B140 ──▶ key_out → despill_green → normalize_512
                     ▼                        (PIL, inside the existing
      512² transparent RGBA webp               background-task thread)
                     ▼
      selena-avatars bucket, keyed by config_hash (v2 salt)
                     ▼
      GET /api/avatar {portrait_status, portrait_url} — 4 s poll while pending
                     ▼
      <Selena> v3 (raster-only) over a CSS backdrop layer, on:
      Studio hero · Home greeting (animated) · Leaderboard · Profile
```

**Save flow.** Save writes the config, then requests the portrait; the hero
shows a "Fusing your look…" shimmer until the poll swaps in the fresh render.

**Self-heal flow.** The v2 hash salt makes every pre-existing opaque portrait
cache-miss, so a customized student reads `portrait_status: "none"`. The
frontend then auto-fires the (cache-gated, rate-limited) portrait POST — at
most once per browser session, guarded via `sessionStorage` — and shows the
pristine default until the transparent render lands. Old bucket objects are
orphaned; harmless.

**Backdrop flow.** The `background` axis leaves the prompt and the hash.
Backdrops are CSS layers behind the cutout: switching one is instant, free,
and never forces a re-render.

## 5. Backend requirements

### R1 — Portrait v2 (`tools/avatar/portrait.py`)
- Prompt: replace the baked-background instruction with the flat `#00B140`
  chroma-backdrop wording proven in `tools/brand/generate_poses.py`; delete the
  `_BG` map and background line from `config_to_prompt`.
- `PORTRAIT_AXES` drops `background`; `config_hash` mixes a `"portrait:v2"`
  salt into the hashed blob.
- Post-render: `key_out(img, "#00B140")` → `despill_green` → `normalize_512`
  → encode RGBA webp (`store_portrait` already sniffs webp).
- Alpha sanity: if < 5 % of pixels are transparent after keying, the model
  ignored the green screen — retry once, then mark `failed`.

### R2 — Keying promotion (`tools/shared/keying.py`)
Move `tools/brand/keying.py` to `tools/shared/keying.py` unchanged in
behaviour; update brand imports; rewrite the stale "dev/asset-build only"
docstring (this is prod-path code now). Pillow is already in
`requirements.txt`.

### R3 — Catalog expansion (`tools/avatar/parts.py`)
Additive only — `DEFAULT_AVATAR` and `CONFIG_VERSION` unchanged, saved configs
stay valid. New ids (camelCase; list order = display order):

- `eyeShape` (7→12): + `heart`, `dizzy`, `laser`, `pixel`, `rainbow`
- `lashes` (4→6): + `feathery`, `butterfly`
- `mouth` (7→14): + `laugh`, `catSmile`, `chomp`, `whistle`, `pout`,
  `shocked`, `evilGrin`
- `glasses` (9→16): + `dealWithIt`, `cinema3d`, `ski`, `star`, `magnifier`,
  `steampunk`, `broken`
- `topper` (12→24): + `wizardHat`, `propeller`, `trafficCone`, `rubberDuck`,
  `croissant`, `vikingHelm`, `pirateHat`, `cowboyHat`, `chefToque`,
  `discoBall`, `catEars`, `mushroom`
- `accessory` (6→16): + `snorkel`, `bobaTea`, `magicWand`, `balloon`,
  `goldChain`, `mustache`, `fannyPack`, `petSnail`, `jetpack`, `umbrella`
- `outfit` (10→20): + `dinoOnesie`, `astronaut`, `tuxedo`, `bananaSuit`,
  `bubbleWrap`, `hawaiian`, `knightArmor`, `chefApron`, `pufferJacket`,
  `superSuit`
- `bodyColor` (20→24): + `gold`, `silver`, `midnight`, `watermelon` (swatches)
- `irisColor` (12→15): + `lava`, `ice`, `rainbow` (swatches)
- `background` (13→19): + `aurora`, `lavaLamp`, `arcade`, `rainyWindow`,
  `candy`, `sakura` (pure CSS backdrops — no art needed)

Rewrite the module docstring (the D10/D11 "sprite compositor" story is
superseded). Regenerate `frontend/src/aurora/avatar/axes.generated.ts` via
`tools/avatar/export_axes.py`.

### R4 — Prompt phrases
Every id on a prompt-bearing axis gets a bespoke over-the-top phrase in the
`portrait.py` maps (e.g. `trafficCone`: "a tiny orange traffic cone worn
proudly as a hat"). A pytest gate fails if any registry id would fall through
to the generic `_humanize` fallback.

### R5 — Tile art (`tools/avatar/generate_tiles.py`)
- One tile per non-colour, non-`none` option id: identity contract + default
  Selena + that single option, green-screened, keyed, saved to
  `frontend/public/avatar/tiles/<axis>/<id>.webp` (committed, like
  `/brand/poses`). Path convention only — no manifest file.
- Counts: eyeShape 12 + lashes 5 + mouth 14 + glasses 15 + topper 23 +
  accessory 15 + outfit 19 = **103 tiles ≈ $1–2.50 one-time** on the flash
  image model. Default ids (`round`, `smile`…) just copy the default cutout —
  free.
- A keyless placeholder generator writes clearly-marked placeholder webps
  first; the paid pass runs only on explicit go-ahead.
- A pytest mandate (same style as the 50-cards-per-topic gate) fails if any
  registry id lacks its tile file.

### R6 — Leaderboard portraits
`GET /api/leaderboard` rows gain nullable `portrait_url`: compute config-hashes
for the page's rows, fetch them with a new single-query
`get_avatar_images_bulk` (no N+1). Fallback headshot = default `iris.png`.

### R7 — API stability
`GET/PUT /api/avatar` and `POST /api/avatar/portrait` keep their shapes. The
self-heal behaviour (§4) is purely a frontend policy on top of the existing
cache-gated POST.

## 6. Frontend requirements

### F1 — `<Selena>` v3, raster-only
- Props `{ portraitUrl?, background?, size, className }`: renders the
  transparent portrait `<img>` when given, else `/brand/iris.png`, over an
  optional CSS backdrop from a new `backdrops.ts` (canonical background-id →
  CSS map covering all 19 ids; grown from `SelenaPortrait`'s `BG_GRADIENTS`).
- Delete `renderSelena.ts` and its tests; fold `<SelenaPortrait>` into
  `<Selena>`; migrate all consumers (Studio, Profile, Leaderboard,
  SelenaBadge, MilestoneLadder, CheckInGuard, …).
- Bump `PERSIST_SCHEMA_VERSION` 3→4 in `queryClient.ts` (persisted
  avatar/leaderboard caches change meaning).

### F2 — Selena Studio, the loadout builder
Kept: one-customization-per-page flow, welcome/edit modes, Surprise me,
XP/celebrate beats, `/studio` route and its entries. Changed:
- **Hero:** last rendered look (else default) as a living cutout on the chosen
  CSS backdrop, subtle breathe idle (brand-mascot.css motion family).
- **Grids:** real AI tiles on soft cards for non-colour axes; swatches for
  colour axes. A tile `onError` degrades to a clean typographic chip (the
  `SelenaLogo` pose-fallback trick) — a missing file never shows broken art.
- **Loadout tray:** picks that differ from the saved look dock as small tile
  chips under the hero — the visible pending-changes state.
- **Save:** "Fusing your look…" shimmer on the hero; the existing 4 s poll
  swaps in the render; celebrate fires on the swap.
- Helper copy (standing in-UI explanation rule): "Your picks bake into one
  hand-crafted render when you save."

### F3 — Home greeting card (`GreetingHero`)
- `customized && portrait ready` → the `hm-iriswrap` slot shows the student's
  cutout with living CSS motion: one-time entrance rise + settle, continuous
  breathe/bob, soft halo glow tinted by their backdrop choice. CSS-only (the
  student app mounts no GSAP provider); `prefers-reduced-motion` freezes to
  the static cutout; the `hm-irisfloor` shadow stays.
- Any other state (never customized, pending, failed) → today's
  `<SelenaLogo motion="hello">`, byte-for-byte unchanged.

### F4 — Self-heal trigger
Where `useAvatar` data resolves with `customized && portrait_status ∈
{none, failed}`, fire the existing portrait-request mutation once per browser
session (`sessionStorage` guard). Server-side cache-gating and rate limits
make double-fires harmless.

## 7. Failure handling

| Failure | Behaviour |
|---|---|
| Render fails, or green screen ignored (< 5 % alpha after key) | retry once → `failed` → default Selena everywhere |
| Tile file missing (new id before the art pass) | `onError` → typographic chip |
| `avatar_images` table or bucket absent | existing `unavailable` path → default Selena |
| Stale pending render | existing `_PENDING_TTL_S` re-enqueue |
| `MOCK_MODE` | `render_portrait` refuses (unchanged); all tests keyless |

## 8. Test plan

- **pytest (TDD per requirement):** prompt-phrase coverage gate (R4); v2 salt
  changes hashes and hashing is background-invariant (R1); keying a synthetic
  green-backdrop image yields transparent corners and despilled edges (R2);
  alpha-sanity retry logic (R1); tile-file mandate per registry id (R5);
  stored portrait content-type is webp (R1); bulk portrait lookup (R6).
- **Frontend:** `npm run typecheck` + `npm run build`; aurora harness asserts:
  Studio hero is an `<img>` with no inline sticker SVG remaining; greeting
  shows the custom cutout when the mocked `/api/avatar` returns `ready`, and
  the default `SelenaLogo` otherwise; leaderboard headshots fall back cleanly;
  reduced-motion freeze holds.
- **/ship-check** before any push: the self-heal fires once per session (not
  per poll) — a repeat-state invariant — plus a behavioral verify on the
  running harness.

## 9. Delivery sequence

| Step | Work | Gate |
|---|---|---|
| 1 | R3 registry + R4 prompts + coverage gate | pytest green (keyless) |
| 2 | R1 portrait v2 + R2 keying move + alpha sanity | pytest green (keyless) |
| 3 | R5 tile generator + placeholders + mandate gate | pytest green (keyless) |
| 4 | F1 `<Selena>` v3 + delete compositor + consumers | typecheck + build |
| 5 | F2 Studio loadout | harness |
| 6 | F3 greeting card + F4 self-heal | harness |
| 7 | R6 leaderboard portraits | pytest + harness |
| 8 | design-locks amendments + /ship-check | full gates → push |
| 9 | **Paid pass A (go-ahead):** 103 tiles, review, install | harness re-verify |
| 10 | **Paid pass B (go-ahead):** re-render 2–3 real looks end-to-end | live smoke |

Commit and push after each completed step (repo policy). Per-save cost stays
one flash render ≈ 1–2¢ per genuinely new look; existing customized students
self-heal once each.

## 10. Design-lock amendments (`docs/design-locks.md`)

- **Selena Studio lock:** hero/tiles/tray per F2. Amended acceptance criteria:
  option tiles are real rendered art of the option on Selena; the hero never
  shows composited parts.
- **New lock — Custom Selena surfaces:** a student's Selena is ONE AI render
  of the whole look, transparent, anchored to `iris.png`; no client-side part
  compositing anywhere; every fallback is the default `iris.png` raster.
- **Branding lock:** untouched — the brand mark stays the default Selena.

## 11. Out of scope

- Per-config pose frames (rejected — 2× cost); the greeting animates one render.
- Uniform depictions (excluded until the user supplies real per-role uniforms).
- The D10/D11 curated sprite library (superseded; stale references cleaned up).
- Patient faces, brand poses, and all non-Selena imagery.
