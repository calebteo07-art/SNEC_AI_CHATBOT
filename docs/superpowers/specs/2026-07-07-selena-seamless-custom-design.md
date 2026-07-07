# Seamless Custom Selena — "one render, everywhere"

**Date:** 2026-07-07 · **Status:** approved (design dialogue, this session)
**Supersedes:** the raster-composite `<Selena>` preview (`6e9ba61`) and the sticker
renderer `frontend/src/aurora/avatar/renderSelena.ts`; amends the D12 opaque-portrait
revision and the Selena Studio lock (see §10).

## 1. Problem

The customized Selena is assembled client-side: hand-drawn flat vector stickers
(crowns, glasses, hoodies…) layered over the painterly soft-3D `iris.png` raster.
The two art styles clash — the user's verdict: "each component added makes it so
ugly … unacceptable." Meanwhile two proven pipelines already exist in this repo:

- **D12 portrait** (`tools/avatar/portrait.py` + `avatar_images`, migration 007):
  a paid flash-image render that bakes the *whole look* into one coherent Iris,
  anchored to `iris.png`, cached by config-hash in the public `selena-avatars`
  bucket. Live and validated.
- **Brand keying** (`tools/brand/keying.py`): flash can't emit alpha, so the logo
  poses render on flat `#00B140` and are restored to transparent 512² RGBA webp via
  corner-flood `key_out` + `despill_green` + `normalize_512`. Shipped (`8934a4c`).

This design combines them: **the AI render IS the custom Selena, everywhere**, cut
out transparent so it sits on any surface — and the sticker layer is deleted.

## 2. Locked decisions (user, 2026-07-07)

1. **Greeting-card animation:** living CSS motion on ONE render per look (breathe,
   bob, glow, entrance) — no second pose frame, no extra per-save cost.
2. **Studio option tiles:** real AI tile art — one render of default Selena wearing
   just that option, per option — shipped as static repo assets (one-time paid pass).
3. **Catalog:** "way more real AI tiles for a wider choice, and way more ridiculous
   and funny variety of every component" — every non-colour axis roughly doubles+.
4. **Studio hero:** the "loadout" model — the hero always shows the last *rendered*
   look (or pristine default); picks dock as real tiles; Save fuses the new render.

## 3. Identity invariants (unchanged)

- Default / never-customized Selena = the literal `/brand/iris.png`, pixel-identical,
  everywhere ([[feedback_selena_branding_mascot]]).
- Every custom render is anchored to `iris.png` (`reference=True`) so it stays
  recognizably her: ONE big eye, no hair, blob body, tiny arms.
- Every fallback path lands on `iris.png`. There is no state that can show
  hand-composited parts — the compositor no longer exists.
- Brand surfaces (CoBrand, BrandSplash, rails, favicon, login, `<SelenaLogo>`
  itself) always show the DEFAULT Selena and are untouched by this work. The
  greeting-card mascot slot is the one surface that becomes personal.

## 4. Architecture

```
Studio pick ──▶ PUT /api/avatar (validate fail-closed, JWT identity)
                    │  save → POST /api/avatar/portrait (cache-gated)
                    ▼
        render on #00B140 green ──▶ key_out + despill + normalize_512
                    ▼                          (PIL, in the existing
        512² transparent RGBA webp              background task thread)
                    ▼
        selena-avatars bucket, keyed by config_hash (v2 salt)
                    ▼
   GET /api/avatar {portrait_status, portrait_url}  ── polled (existing)
                    ▼
   <Selena> v3 (raster-only) on: Studio hero · Home greeting (animated)
   · Leaderboard headshots · Profile — over a CSS backdrop layer
```

The `background` axis leaves the prompt and the hash: backdrops become CSS layers
behind the cutout — instant, free to switch, and a look re-render is never forced
by a backdrop change.

## 5. Backend

### 5.1 Portrait v2 (`tools/avatar/portrait.py`)

- Prompt: replace the baked-background instruction with the flat chroma backdrop
  (reuse the exact green-screen wording proven in `tools/brand/generate_poses.py`).
  `_BG` map and the background line are removed from `config_to_prompt`.
- `PORTRAIT_AXES` drops `background`. `config_hash` mixes a version salt
  (`"portrait:v2"`) into the hashed blob so every pre-existing opaque portrait
  cache-misses; old bucket objects are orphaned (harmless).
- After `generate_image_bytes`: `key_out(img, "#00B140")` → `despill_green` →
  `normalize_512` → encode **RGBA webp**. `store_portrait` already sniffs webp.
- Keying moves to `tools/shared/keying.py` (it is now prod-path code, not just an
  asset-build helper); `tools/brand/*` imports update; the stale "dev/asset-build
  only" docstring is rewritten. Pillow is already in `requirements.txt`.
- Sanity check before storing: if the keyed image is < 5 % transparent pixels the
  model ignored the green screen — retry once, then mark `failed`.

### 5.2 Catalog expansion (`tools/avatar/parts.py`)

Additive only; `DEFAULT_AVATAR` and `CONFIG_VERSION` unchanged; saved configs stay
valid. New ids (camelCase, display order = list order):

- `eyeShape` (7→12): + `heart`, `dizzy`, `laser`, `pixel`, `rainbow`
- `lashes` (4→6): + `feathery`, `butterfly`
- `mouth` (7→14): + `laugh`, `catSmile`, `chomp`, `whistle`, `pout`, `shocked`,
  `evilGrin`
- `glasses` (9→16): + `dealWithIt`, `cinema3d`, `ski`, `star`, `magnifier`,
  `steampunk`, `broken`
- `topper` (12→24): + `wizardHat`, `propeller`, `trafficCone`, `rubberDuck`,
  `croissant`, `vikingHelm`, `pirateHat`, `cowboyHat`, `chefToque`, `discoBall`,
  `catEars`, `mushroom`
- `accessory` (6→16): + `snorkel`, `bobaTea`, `magicWand`, `balloon`, `goldChain`,
  `mustache`, `fannyPack`, `petSnail`, `jetpack`, `umbrella`
- `outfit` (10→20): + `dinoOnesie`, `astronaut`, `tuxedo`, `bananaSuit`,
  `bubbleWrap`, `hawaiian`, `knightArmor`, `chefApron`, `pufferJacket`, `superSuit`
- `bodyColor` (20→24): + `gold`, `silver`, `midnight`, `watermelon` (swatches)
- `irisColor` (12→15): + `lava`, `ice`, `rainbow` (swatches)
- `background` (13→19): + `aurora`, `lavaLamp`, `arcade`, `rainyWindow`, `candy`,
  `sakura` (pure CSS backdrops — free, no art)

The stale D10/D11 "sprite compositor" module docstring is rewritten to describe
the render pipeline. `tools/avatar/export_axes.py` regenerates
`frontend/src/aurora/avatar/axes.generated.ts`.

Every option id on a prompt-bearing axis gets a bespoke, over-the-top phrase in
the `portrait.py` maps (e.g. `trafficCone`: "a tiny orange traffic cone worn
proudly as a hat"). **A pytest gate fails if any shipped id would fall through to
the generic `_humanize` fallback.**

### 5.3 Tile art (`tools/avatar/generate_tiles.py` + placeholders)

- For each non-colour, non-`none` option id: prompt = identity contract + default
  Selena + that single option + green screen → keyed → 512² transparent webp at
  `frontend/public/avatar/tiles/<axis>/<id>.webp`, committed to the repo (static,
  exactly like `/brand/poses`). Count: eyeShape 12 + lashes 5 + mouth 14 +
  glasses 15 + topper 23 + accessory 15 + outfit 19 = **103 tiles ≈ $1–2.50,
  one-time**, flash model ([[feedback_nano_banana_model_choice]]).
- A keyless placeholder generator writes clearly-marked placeholder webp files
  first ([[feedback_gemini_placeholders_first]]); the paid pass runs only on
  explicit go-ahead. A pytest mandate (style of the 50-cards gate) fails if any
  registry id lacks a tile file.
- "None" tiles show the default cutout — derived from `iris.png`, free.

### 5.4 API + leaderboard

- `GET /api/avatar`, `PUT /api/avatar`, `POST /api/avatar/portrait`: shapes
  unchanged. With the v2 salt, a customized student's saved look now reads
  `portrait_status: "none"` until re-rendered; the frontend auto-fires the
  existing cache-gated POST once per session when `customized && status ∈
  {none, failed}` — every existing student self-heals for ~1–2¢ without visiting
  Studio, and sees the pristine default meanwhile.
- Leaderboard rows gain `portrait_url` (nullable): one bulk `avatar_images`
  lookup for the page's config-hashes (a new `get_avatar_images_bulk`, single
  query — no N+1). Headshot fallback = default `iris.png`.

## 6. Frontend

### 6.1 `<Selena>` v3 — raster-only (`frontend/src/aurora/avatar/`)

- Props: `{ portraitUrl?, background?, size, className }`. Renders the transparent
  portrait `<img>` when given, else `/brand/iris.png`, over an optional CSS
  backdrop (`backdrops.ts`, the canonical background-id → CSS map, grown from
  `SelenaPortrait`'s `BG_GRADIENTS` to cover all 19 ids).
- **Deleted:** `renderSelena.ts` (~300 lines: tint filters, lid shapes, sticker
  registries) and its tests. `<SelenaPortrait>` folds into `<Selena>`; consumers
  (Studio, Profile, Leaderboard, SelenaBadge, MilestoneLadder, CheckInGuard…)
  update to pass `portrait_url` from `useAvatar`/leaderboard data.
- `PERSIST_SCHEMA_VERSION` bumps 3→4 (`queryClient.ts`) — persisted
  avatar/leaderboard caches change meaning ([[project_persist_cache_buster]]).

### 6.2 Selena Studio — the "loadout" builder (refines the Studio lock)

Kept: one-customization-per-page flow, welcome/edit modes, Surprise me, XP/celebrate
beats, `/studio` route + Profile/Home entries. Changed:

- **Hero:** the last rendered look (else default `iris.png`) as a living cutout on
  the chosen CSS backdrop — subtle breathe idle (brand-mascot.css family).
- **Option grids:** real AI tiles (transparent webp on a soft card) for non-colour
  axes; swatches for colour axes; a tile `onError` degrades to a clean typographic
  chip (same trick as `SelenaLogo`'s pose fallback) so a missing file never shows
  a broken image.
- **Loadout tray:** picks that differ from the saved look dock as small tile chips
  under the hero — the visible "pending changes" state.
- **Save:** "Fusing your look…" shimmer over the hero; the existing 4 s poll swaps
  in the fresh render; celebrate fires on swap. Helper copy (standing in-UI
  explanation rule): "Your picks bake into one hand-crafted render when you save."

### 6.3 Home greeting card (`GreetingHero`)

- `customized && portrait ready` → the `hm-iriswrap` slot renders the student's
  cutout with a living CSS motion set: one-time entrance rise + settle, continuous
  breathe/bob, soft halo glow tinted by their backdrop choice. CSS-only
  (no GSAP — [[project_student_motion_system]]); `prefers-reduced-motion` freezes
  to the static cutout. The `hm-irisfloor` shadow stays.
- Otherwise (never customized, render pending/failed) → today's default
  `<SelenaLogo motion="hello">`, byte-for-byte unchanged.

## 7. Failure handling

| Failure | Behaviour |
|---|---|
| Render fails / green screen ignored (< 5 % alpha after key) | retry once → `failed` → default Selena everywhere |
| Tile file missing (new id before art pass) | `onError` → typographic chip |
| `avatar_images` table / bucket absent | existing `unavailable` path → default Selena |
| Stale pending render | existing `_PENDING_TTL_S` re-enqueue |
| `MOCK_MODE` | render refuses (unchanged); all tests keyless |

## 8. Testing & verification

- **pytest (TDD per piece):** prompt-phrase coverage gate (no `_humanize`
  fallback for shipped ids); `config_hash` v2 salt changes hashes and is
  background-invariant; keying on a synthetic green-backdrop image yields
  transparent corners + despilled edges; alpha-coverage retry logic; tile-file
  mandate per registry id; stored portrait content-type is webp; leaderboard bulk
  portrait lookup.
- **Frontend:** `npm run typecheck` (generated axes + tile manifest keep
  compile-time parity) and `npm run build`; aurora harness asserts update —
  Studio hero is an `<img>` (no inline sticker SVG remains), greeting shows the
  custom cutout when the mocked `/api/avatar` returns `ready`, leaderboard
  headshots fall back to default cleanly; reduced-motion freeze assert.
- **/ship-check** before any push: repeat-state invariants (auto-heal fires once
  per session, not per poll) + behavioral verify on the running harness.

## 9. Sequencing & cost

1. Registry expansion + prompt maps + coverage gate (keyless green)
2. Portrait v2: green-screen prompt, keying move + reuse, v2 hash salt, webp,
   alpha sanity (keyless green — render itself still refuses in MOCK)
3. Tile generator + keyless placeholders committed; tile mandate gate
4. `<Selena>` v3 + `backdrops.ts`; delete `renderSelena.ts`; migrate consumers
5. Studio loadout rebuild (studio.css + SelenaStudio.tsx)
6. Greeting-card living custom Selena (home.css/brand-mascot.css + GreetingHero)
7. Leaderboard `portrait_url` (backend bulk + headshots)
8. Harness updates + /ship-check + design-locks amendments → push
9. **Paid pass A (go-ahead):** ~103 tiles (~$1–2.50), review, install, re-verify
10. **Paid pass B (go-ahead):** re-render 2–3 real looks end-to-end (transparent
    webp in bucket, greeting animation live) — the D12-style smoke

Per-save cost unchanged: one flash render ≈ 1–2¢ per genuinely new look
(cache-gated). Existing customized students self-heal once each.

## 10. Design-locks amendments (`docs/design-locks.md`)

- **Selena Studio lock:** hero + tiles + tray per §6.2; acceptance criteria
  amended: "option tiles are real rendered art of the option on Selena; the hero
  never shows composited parts."
- **New lock — Custom Selena surfaces:** "A student's Selena is ONE AI render of
  the whole look, transparent, anchored to iris.png. No client-side part
  compositing anywhere. Fallback is always the default iris.png raster."
- Branding lock untouched (brand mark stays default Selena).

## 11. Out of scope

- Per-config pose frames (rejected: 2× cost) — the greeting animates one render.
- Uniform depictions (excluded until the user supplies real per-role uniforms).
- The D10/D11 curated sprite library (superseded; stale references cleaned up).
- Patient-face pipeline, brand poses, and all non-Selena imagery.
