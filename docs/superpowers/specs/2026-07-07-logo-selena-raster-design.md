# Animated Selena hero logo — design spec

**Date:** 2026-07-07
**Status:** Approved (brainstorm), pending implementation plan
**Owner brief:** the deferred "logo → Selena raster variation" (ricoe §8, branding lock's
named out-of-scope item). This spec is the standalone brief that lock required.

---

## Goal

Give EyeBot a **living Selena mascot logo** on three hero surfaces — the Home greeting, a
new Splash/loading screen, and the CoBrand lockups — driven by CSS motion choreography over
a small set of **paid Nano-Banana-flash pose frames** anchored to the homepage `iris.png`.

The **mono Spark-Eye** mark (`Logo.tsx` / `icon.svg`) stays **exactly as-is** in the Atlas/
Console rails and the browser-tab favicon / PWA icon. This brief adds a warm hero mark on
big surfaces; it does **not** touch the small-mark or favicon lock.

## Non-goals (out of scope)

- **Login** — LOCKED verbatim, no brand change (holds).
- **Rails + favicon / PWA icon** — mono Spark-Eye stays; no unification this pass.
- Any new API, DB table, migration, or runtime AI. Assets are static and pre-generated.
- Flipbook / many-frame sequences (rejected: independently generated flash frames won't
  register pixel-to-pixel → "boiling").
- The student-customisation `<Selena>` preview renderer (`renderSelena.ts`) — unchanged;
  that stays the per-config preview, this is the branding mascot (matches ricoe A3: the
  brand mark is always the **default** Selena, never a student's custom avatar).
- SNEC clinical uniforms (excluded until specified).

## Decisions locked in brainstorming

| # | Decision |
|---|----------|
| Scope | "New standalone logo image" — hero surfaces only, mono rails/favicon untouched. |
| Surfaces | Home greeting · new Splash/loading screen · CoBrand lockups. **Not** login. |
| Art source | **Paid** new pose frames via Nano-Banana **flash** (`gemini-3.1-flash-image`), `reference=True` anchored to `iris.png`. |
| Animation | **Approach A** — hybrid pose-swap + CSS choreography (not flipbook, not single-pose). |
| Identity | Every frame must read like homepage `iris.png` (standing rule: non-iris looks rejected 3×). |
| Wordmark | "EyeBot" stays **live CSS text**, never baked into a raster. |

## The hard constraint — flash cannot emit alpha

Flash-image returns **opaque** output (D12 finding: it bakes a background, no transparency).
But the homepage look **is** a transparent floating mascot (`iris.png` is 512² RGBA). So the
asset pipeline must restore transparency:

1. Prompt each pose on a **plain flat, uniform background** of a known keying colour
   (a colour absent from the mascot — e.g. flat chroma green `#00B140`).
2. **Dev-only Python post-process** removes that background: PIL **corner flood-fill** with a
   tolerance (seed from all four corners, 4-connected fill, feather the alpha edge 1px) →
   transparent RGBA.
3. Normalise to the `iris.png` canvas: trim to the subject bbox, re-centre, and letterbox to
   **512×512** so scale/position match the rest frame; save `.webp` (quality 88).

This post-process runs **locally at asset-build time only** — it adds **no prod dependency**
(pure PIL, already used by `tools/patients/make_placeholders.py`).

**Fallback if keying leaves halos on review:** place the opaque pose on a soft circular brand
chip (the pattern the OSCE patient faces already use), sized to match the surface. Decided per
pose at review time; recorded in the design-lock.

## Frame set

Three **paid** frames + the existing `iris.png` reused as the rest frame (so only **3** paid
flash calls):

| id | paid? | pose | used by |
|----|-------|------|---------|
| `rest` | no — reuse `/brand/iris.png` | neutral idle (the canonical homepage look) | all surfaces (base) |
| `wave` | yes | a friendly whole-image tilt/lean "hello" | Home (wave beat) |
| `cheer` | yes | bright, eye-crinkled happy expression | CoBrand (rare blink) |
| `groove` | yes | dynamic lean for a dance/groove read | Splash |

Selena has **no limbs** (D9: she *is* Iris, the one-eyed mascot — no arms, no hair), so poses
are **whole-image** expression/tilt variants, never gestural limbs. Prompts describe the same
mascot with a changed tilt/expression, anchored to the reference.

### Approved prompt contract (recorded per the generated-imagery standing rule)

Nano-Banana **flash** (`gemini-3.1-flash-image`), `reference=True` (the iris mascot IS the
anchor), plain flat chroma background for keying:

> "The same one-eyed EyeBot mascot as the reference image — a soft, rounded, hairless
> teal-and-cream character with a single large friendly eye and a calm gentle smile,
> identical proportions, colours, and rendering to the reference. `<pose line>`. Full body
> centered, plain flat solid chroma-green (`#00B140`) background, soft even lighting. No text,
> no border, no watermark, no extra characters."

Per-pose `<pose line>`:
- `wave` — "leaning to one side in a warm friendly 'hello' tilt, eye bright and welcoming"
- `cheer` — "delighted, eye happily crinkled into a cheerful upward curve, beaming"
- `groove` — "leaning with a playful dynamic bounce, mid-groove, lively and buoyant"

## Motion mapping (delegated to the engineer, approved)

All CSS-only; **frozen to a static `rest`** under `prefers-reduced-motion` / `[data-motion=reduce]`.

| Surface | Character | Choreography |
|---------|-----------|--------------|
| **Home greeting** | warm & calm — "hello" | idle breathe + gentle bob on `rest`; every ~9s a **wave** (cross-fade to `wave` at a tilt-burst peak, `transform-origin: 50% 92%`, then settle back). |
| **Splash / loading** | energetic **groove** | rhythmic sway + bob + subtle squash-stretch cycling on `groove` while loading; resolves to `rest` on handoff. |
| **CoBrand lockups** | restrained & professional | existing breathe + Gemini-gradient halo on `rest`; a rare **cheer blink** (cross-fade to `cheer` ~200ms) every ~12s. Persistent brand marks stay subtle (respects the CoBrand lock). |

The "EyeBot" wordmark is always live CSS text beside the mascot.

## Architecture & components (isolated units)

Static assets + presentational React + CSS. No data flow beyond a typed pose→`src` map.

### Asset layer (Python, WAT tool — dev-only)

- **`tools/brand/logo_poses.py`** — pure registry (no I/O). `POSES: dict[str, Pose]` where a
  `Pose` is a frozen dataclass `(id, pose_line)`; `BG_KEY = "#00B140"`; `prompt(pose) -> str`
  composes the approved contract. `rest` is **not** in `POSES` (it's the reused `iris.png`).
  Single source of truth for ids + prompts. Mirrors `tools/patients/archetypes.py` in spirit.
- **`tools/brand/keying.py`** — pure image post-process: `key_out(png_bytes, bg_hex, tol) ->
  RGBA Image` (corner flood-fill + 1px alpha feather) and `normalize_512(img) -> Image`
  (trim bbox → centre → letterbox 512²). Testable on synthetic images, no network.
- **`tools/brand/generate_poses.py`** — CLI generator mirroring `tools/patients/
  generate_faces.py`: `--estimate` / `--generate` / `--install` / `--only <ids>`. **Refuses in
  MOCK_MODE.** Uses `generate_sprites.generate_image_bytes(prompt, model=flash,
  reference=True)`, then `keying.key_out` + `keying.normalize_512`. `sys.path` bootstrap
  (`parents[2]`) as in the patients tools. Writes `.png` to `.tmp/logo-poses/` on
  `--generate`; `--install` converts to `.webp` into `frontend/public/brand/poses/`.

### Assets

- **`frontend/public/brand/poses/{wave,cheer,groove}.webp`** — committed. **Placeholders
  first** (clearly-marked; a tinted/tilted transform of `iris.png` via a PIL scaffold script
  `tools/brand/make_pose_placeholders.py`), swapped for real art on explicit go-ahead.

### Frontend layer

- **`frontend/src/aurora/components/SelenaLogo.tsx`** — the animated mark. Props:
  `motion: "hello" | "groove" | "idle"`, `size?: number`, `withWordmark?: boolean`,
  `wordTone?: "ink" | "white"`. Renders two stacked `<img>` (base pose + the swap pose for
  that motion) inside a `.selena-logo` wrapper + optional live "EyeBot" wordmark text. A typed
  `POSE_SRC: Record<"rest"|"wave"|"cheer"|"groove", string>` map (parity-guarded so every id
  is handled). Motion class picked from the `motion` prop.
- **`frontend/src/aurora/components/BrandSplash.tsx`** — full-screen branded loader:
  `<SelenaLogo motion="groove" withWordmark />` centred on a Gemini-gradient field, with an
  accessible `role="status"` + visually-hidden "Loading EyeBot…". Reusable.
- **`frontend/src/aurora/brand-mascot.css`** — keyframes `sel-bob`, `sel-wave`, `sel-groove`,
  `sel-cheer-blink`, and the halo; the `.selena-logo` layout; cross-fade opacity rules; the
  reduced-motion block that pins to `rest` and stills the halo. Imported once (via the aurora
  CSS entry).

### Integration points (exact)

1. **Home** — `GreetingHero.tsx:64` replace `<img className="hm-iris" src="/brand/iris.png" …/>`
   with `<SelenaLogo motion="hello" />` (keeps `.hm-iris` sizing/grounding shadow).
2. **Splash** — mount `<BrandSplash />` at the authenticated app-shell's top-level loading
   boundary (the first-load/route-transition fallback). Exact mount identified in the plan;
   it replaces the current bare loading state, not a locked surface.
3. **CoBrand** — `CoBrand.tsx` swap the `<img className="aurora-cobrand-mark" src="/brand/
   iris.png">` for `<SelenaLogo motion="idle" />` (the existing `.aurora-cobrand-mark-wrap`
   halo host stays; halo now lives in `brand-mascot.css`). `dark` still inverts the SNEC mark.

## Data flow

None beyond static assets. The component reads a compile-time typed map to pick a pose `src`;
CSS drives all motion. No fetch, no state machine, no AI at runtime.

## Error handling / resilience

- **Missing pose asset** → `<SelenaLogo>` always renders the `rest` layer (`iris.png`, which
  always exists); the swap layer is decorative and `aria-hidden`, so an absent `wave`/`cheer`/
  `groove` degrades to the calm rest mascot, never a broken image. `onError` on a swap `<img>`
  hides that layer.
- **Reduced motion** → single static `rest`, halo stilled to a faint static ring; no layout
  shift, no cross-fade.
- **Keying halo** (build-time) → caught at review; fallback to the soft brand chip per pose.

## Placeholders-first & the paid gate

1. Ship the placeholder poses + all component/CSS/integration/tests → **green keyless**
   (`pytest` + typecheck + build + harness), committed and pushed.
2. Only on the user's **explicit go-ahead** fire the **3 paid flash calls**
   (`generate_poses.py --generate`), review the keyed frames at full size, then `--install`.
3. Record the outcome (and any chip fallback) in the design-lock.

## Testing

**Python (`tests/brand/`):**
- `test_logo_poses.py` — registry shape (exactly `wave`/`cheer`/`groove`), `prompt()` contains
  the anchor phrase + the pose line + `#00B140` + "no text"; `rest` absent from `POSES`.
- `test_keying.py` — `key_out` on a synthetic subject-on-chroma makes corners transparent and
  keeps the subject opaque; `normalize_512` returns a 512² RGBA centred image.
- `test_generate_poses.py` — `--estimate` covers all 3 (mirrors `test_generate_faces.py`);
  generator uses the flash model and `reference=True`; **refuses in MOCK_MODE**.

**Frontend (aurora harness, `frontend/tests/`):**
- Mascot renders on Home (`.selena-logo` with a `rest` `<img>` + live "EyeBot" text) and in
  the CoBrand lockup; `<BrandSplash>` renders with its `role="status"`.
- Reduced-motion (`data-motion=reduce`) → only the `rest` layer visible, no cross-fade class
  active; assert no `wave`/`groove` swap layer is opacity-1.
- Wordmark is real selectable text (not baked into an image).

## Design-lock

Add a new lock **"Animated Selena hero logo — LOCKED 2026-07-07"** capturing: the three
surfaces, Approach A, the frame set + approved prompt contract, the alpha-keying pipeline (+
chip fallback), the motion mapping, and reduced-motion freeze. Update the **Branding /
Selena surfacing** lock's out-of-scope line (which currently defers "the logo → a different
Selena raster variation") to point at this delivered lock, and explicitly note the **mono
Spark-Eye rail + favicon lock is preserved**.

## File manifest

```
Create:
  tools/brand/__init__.py
  tools/brand/logo_poses.py
  tools/brand/keying.py
  tools/brand/generate_poses.py
  tools/brand/make_pose_placeholders.py
  tests/brand/__init__.py
  tests/brand/test_logo_poses.py
  tests/brand/test_keying.py
  tests/brand/test_generate_poses.py
  frontend/src/aurora/components/SelenaLogo.tsx
  frontend/src/aurora/components/BrandSplash.tsx
  frontend/src/aurora/brand-mascot.css
  frontend/public/brand/poses/{wave,cheer,groove}.webp   (placeholders → real)
Modify:
  frontend/src/aurora/components/home/GreetingHero.tsx    (swap hm-iris → SelenaLogo)
  frontend/src/aurora/components/CoBrand.tsx              (swap mark img → SelenaLogo)
  <app-shell loading boundary>                            (mount BrandSplash)
  frontend/src/aurora/<css entry>                         (import brand-mascot.css)
  frontend/tests/<aurora assert>                          (mascot/splash/reduced-motion)
  docs/design-locks.md                                    (new lock + branding update)
```

## Acceptance criteria

- Home, Splash, and CoBrand each render a Selena mascot that **reads identical to homepage
  `iris.png`** (rest frame is literally `iris.png`); paid poses keyed to transparency and
  normalised to the same 512² framing so swaps don't jump.
- Per-surface motion matches the mapping; **all motion freezes to static `rest`** under
  reduced motion; no layout shift; WCAG-legible; 390px-safe.
- Wordmark is live text; mono Spark-Eye rails + favicon **unchanged**; login **unchanged**.
- Missing/failed pose asset degrades to the calm `rest` mascot, never a broken image.
- Green keyless first (pytest + typecheck + build + harness); the 3 paid calls fire only on
  explicit go-ahead; every pose id handled by the typed frontend map (parity guard compiles).
