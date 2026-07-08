# Seamless Custom Selena Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rejected sticker-composite custom Selena with ONE transparent AI-rendered portrait per look, shown (and animated) on every surface, plus a much bigger/funnier catalog and real AI option tiles in a "loadout" Studio.

**Architecture:** The live D12 portrait pipeline switches from baked backgrounds to green-screen renders keyed to transparent 512² RGBA webp via the proven brand PIL keying (promoted to `tools/shared/`). The client-side compositor (`renderSelena.ts`) is deleted; `<Selena>` becomes a raster-only component (portrait cutout or `iris.png`) over CSS backdrops. Ordering constraint: the compositor's typed `Record<IdUnion,…>` maps mean **the compositor must die (Task 3) before the registry can grow (Task 6)** or `npm run typecheck` breaks.

**Tech Stack:** FastAPI + Supabase (bucket `selena-avatars`, table `avatar_images`), Gemini `gemini-3.1-flash-image` via `tools/avatar/generate_sprites.py` (MOCK_MODE-refusing), PIL keying, Next.js 16 + TanStack Query, CSS-only motion. Spec: `docs/superpowers/specs/2026-07-07-selena-seamless-custom-design.md`.

**Ground rules (repo policy):**
- Run backend tests as `python -m pytest -q` (MOCK_MODE auto-on, keyless).
- Frontend gates: `cd frontend && npm run typecheck && npm run build`.
- Harness: `bash scripts/start-harness.sh aurora` (or, against a warm server, `node frontend/tests/aurora_assert.mjs http://127.0.0.1:3000`). Known flake: first cold nav after a build can miss `waitForURL /cases` — re-run the assert against the warm server before calling it red.
- Commit + push to `main` after every green task. Never push red.
- Tasks 10–11 are PAID (live Gemini) — **do not run without explicit user go-ahead**.

---

### Task 1: Promote keying to `tools/shared/keying.py`

The keying helpers become prod-path code (they'll run inside the portrait background task), so they move out of `tools/brand/` and `BG_KEY` becomes canonical there.

**Files:**
- Create: `tools/shared/keying.py` (moved from `tools/brand/keying.py`)
- Delete: `tools/brand/keying.py`
- Modify: `tools/brand/generate_poses.py:23-24,45`
- Modify: `tools/brand/logo_poses.py:14`
- Modify: `tests/brand/test_keying.py:3`
- Test: `tests/shared/test_keying_location.py`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/test_keying_location.py`:

```python
"""Keying now lives in tools/shared — it runs in the prod portrait path, not just
asset builds. BG_KEY is canonical here so portrait + brand prompts can't drift."""
from tools.shared.keying import BG_KEY, despill_green, key_out, normalize_512


def test_bg_key_is_the_chroma_green():
    assert BG_KEY == "#00B140"


def test_functions_are_importable():
    assert callable(key_out) and callable(despill_green) and callable(normalize_512)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m pytest tests/shared/test_keying_location.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.shared.keying'`

- [ ] **Step 3: Move the module**

```bash
git mv tools/brand/keying.py tools/shared/keying.py
```

Then in `tools/shared/keying.py`, replace the module docstring (lines 1-7) and add `BG_KEY`:

```python
"""Chroma-key helpers — restore transparency to opaque flash renders.

flash-image can't emit alpha: renders come back opaque on a flat chroma
backdrop. `key_out` floods that backdrop to transparent from the corners;
`despill_green` neutralises the green rim; `normalize_512` trims to the
subject and letterboxes onto a 512² canvas so frames register with iris.png.
Pure PIL. PROD-PATH code: the Selena portrait pipeline keys every student
render server-side (as well as the offline brand/tile asset builds)."""
from __future__ import annotations

from collections import deque

from PIL import Image

BG_KEY = "#00B140"  # canonical flat chroma-green backdrop (absent from the mascot's palette)
```

(The three functions stay byte-identical.)

- [ ] **Step 4: Update the importers**

`tools/brand/generate_poses.py` line 23: `from tools.brand import keying` → `from tools.shared import keying`.
`tools/brand/logo_poses.py` line 14: replace `BG_KEY = "#00B140"  # flat chroma-green backdrop for keying (absent from the teal/cream mascot)` with:

```python
from tools.shared.keying import BG_KEY  # canonical chroma green (shared with the portrait pipeline)
```

`tests/brand/test_keying.py` line 3: `from tools.brand.keying import …` → `from tools.shared.keying import …`.

- [ ] **Step 5: Run the full suite**

Run: `python -m pytest -q`
Expected: PASS (existing brand keying/pose tests still green through the new path)

- [ ] **Step 6: Commit**

```bash
git add tools/shared/keying.py tools/brand/keying.py tools/brand/generate_poses.py tools/brand/logo_poses.py tests/brand/test_keying.py tests/shared/test_keying_location.py
git commit -m "refactor(keying): promote chroma-key helpers to tools/shared (prod-path)"
git push origin main
```

---

### Task 2: Portrait v2 — green-screen render → transparent webp

**Files:**
- Modify: `tools/avatar/portrait.py`
- Modify: `tests/avatar/test_portrait.py`
- Modify: `tests/avatar/test_portrait_store.py`

- [ ] **Step 1: Rewrite the hash/prompt tests for v2**

In `tests/avatar/test_portrait.py`, update the module docstring (the portrait is now transparent; `background` is a CSS backdrop) and **replace** `test_hash_changes_with_background`, `test_background_in_portrait_axes`, and `test_prompt_includes_background` with:

```python
def test_hash_is_background_invariant():
    # v2 portraits are transparent cutouts — the backdrop is CSS, not pixels.
    base = {"bodyColor": "aqua", "irisColor": "green"}
    assert config_hash({**base, "background": "mist"}) == config_hash({**base, "background": "galaxy"})


def test_background_not_in_portrait_axes():
    assert "background" not in PORTRAIT_AXES
    assert "bodyColor" in PORTRAIT_AXES and "topper" in PORTRAIT_AXES


def test_hash_is_salted_v2():
    # The v2 salt must cache-bust every pre-existing opaque portrait.
    import hashlib, json
    from tools.avatar.parts import DEFAULT_AVATAR
    norm = {k: DEFAULT_AVATAR[k] for k in PORTRAIT_AXES}
    unsalted = hashlib.sha256(
        json.dumps(norm, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()[:16]
    assert config_hash({}) != unsalted


def test_prompt_demands_flat_chroma_green_background():
    p = config_to_prompt({"background": "galaxy"}).lower()
    assert "#00b140" in p
    assert "galaxy" not in p          # background axis no longer reaches the prompt
```

- [ ] **Step 2: Run them to verify they fail**

Run: `python -m pytest tests/avatar/test_portrait.py -q`
Expected: FAIL (background still in axes/prompt, no salt)

- [ ] **Step 3: Implement the pure-core changes in `tools/avatar/portrait.py`**

Top of file — new imports and axes:

```python
import hashlib
import io
import json

from PIL import Image

from tools.avatar import generate_sprites
from tools.avatar.parts import AVATAR_AXES, DEFAULT_AVATAR
from tools.shared.gemini_client import MOCK_MODE
from tools.shared.keying import BG_KEY, despill_green, key_out, normalize_512

# The character axes only — v2 portraits are transparent cutouts, so `background`
# is a CSS layer behind the image and never reaches the prompt or the cache key.
PORTRAIT_AXES: list[str] = [a for a in AVATAR_AXES if a != "background"]

# Bumped whenever the render contract changes: salting the hash cache-busts every
# portrait minted under the old contract (v1 = opaque, baked background).
_HASH_SALT = "portrait:v2"
```

Replace the last two sentences of `_CONTRACT` (the "with the cohesive background…" + "IMPORTANT…" part) with:

```python
    "Front view, centered, full body, generous margin, polished square. "
    f"IMPORTANT: the ENTIRE background must be one flat, uniform, solid chroma-green ({BG_KEY}) — "
    "no gradient, no scene, no backdrop shadows, no text, no border, and NEVER a checkerboard "
    "or transparency pattern. Only the character casts subtle self-shading."
```

Delete the `_BG` dict. In `config_to_prompt`, delete the final `lines.append(f"Background: …")` line. Update both module + function docstrings to say the render is keyed to a transparent cutout. In `config_hash`:

```python
    blob = json.dumps({"salt": _HASH_SALT, **norm}, sort_keys=True, separators=(",", ":"))
```

- [ ] **Step 4: Run the pure-core tests**

Run: `python -m pytest tests/avatar/test_portrait.py -q`
Expected: PASS

- [ ] **Step 5: Write the failing render/keying tests**

In `tests/avatar/test_portrait_store.py` add (keep the existing tests; they still hold — `store_portrait` is unchanged):

```python
import io

from PIL import Image


def _green_png_with_subject() -> bytes:
    """What a well-behaved flash render looks like: a subject on flat chroma green."""
    img = Image.new("RGB", (64, 64), (0, 177, 64))
    for x in range(20, 44):
        for y in range(20, 44):
            img.putpixel((x, y), (240, 200, 170))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _solid_blue_png() -> bytes:
    """A render that ignored the green-screen instruction entirely."""
    img = Image.new("RGB", (64, 64), (30, 60, 200))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def test_render_portrait_keys_to_transparent_webp(monkeypatch):
    monkeypatch.setattr(portrait, "MOCK_MODE", False)
    monkeypatch.setattr(portrait.generate_sprites, "generate_image_bytes",
                        lambda *a, **k: _green_png_with_subject())

    out = portrait.render_portrait({"topper": "crown"})

    assert out[:4] == b"RIFF" and out[8:12] == b"WEBP"   # webp container
    img = Image.open(io.BytesIO(out))
    assert img.mode == "RGBA"
    assert img.size == (512, 512)
    assert img.getpixel((0, 0))[3] == 0                   # corner keyed to alpha


def test_render_portrait_retries_then_fails_when_green_screen_ignored(monkeypatch):
    calls = {"n": 0}

    def opaque(*a, **k):
        calls["n"] += 1
        return _solid_blue_png()

    monkeypatch.setattr(portrait, "MOCK_MODE", False)
    monkeypatch.setattr(portrait.generate_sprites, "generate_image_bytes", opaque)

    with pytest.raises(RuntimeError, match="chroma"):
        portrait.render_portrait({"bodyColor": "aqua"})
    assert calls["n"] == 2                                # exactly one retry
```

Also update `test_render_portrait_builds_prompt_and_returns_bytes`: its fake returns `b"PNGDATA"` which PIL can't open — change the fake to return `_green_png_with_subject()` and change `assert out == b"PNGDATA"` to `assert out[:4] == b"RIFF"`.

- [ ] **Step 6: Run to verify the new tests fail**

Run: `python -m pytest tests/avatar/test_portrait_store.py -q`
Expected: FAIL (render_portrait returns raw bytes, no keying)

- [ ] **Step 7: Implement `render_portrait` v2**

Replace `render_portrait` in `tools/avatar/portrait.py`:

```python
# Below this fraction of fully-transparent pixels, the model ignored the chroma
# backdrop (a real keyed cutout is mostly transparent margin).
_MIN_ALPHA_RATIO = 0.05


def _alpha_ratio(img: Image.Image) -> float:
    return img.getchannel("A").histogram()[0] / float(img.width * img.height)


def render_portrait(config: dict, model: str = generate_sprites.MODELS["flash"]) -> bytes:
    """Render + key one transparent Selena cutout. LIVE + PAID (~1–2¢/image).

    Refuses in MOCK_MODE — we never fabricate art in tests/CI. The flash render
    comes back opaque on flat chroma green (flash has no true alpha); we key it
    out, despill, and normalise onto the 512² iris.png canvas. If the model
    ignored the green screen (almost no transparent pixels after keying) we
    retry once, then fail so the caller marks the look `failed` (the UI falls
    back to the default mascot — never broken art). Returns RGBA webp bytes.
    """
    if MOCK_MODE:
        raise RuntimeError(
            "render_portrait needs a live GEMINI_API_KEY; refusing to fabricate art in MOCK_MODE"
        )
    prompt = config_to_prompt(config)
    last = "generation returned no image bytes"
    for _ in range(2):
        data = generate_sprites.generate_image_bytes(prompt, model=model)
        if not data:
            continue
        img = normalize_512(despill_green(key_out(Image.open(io.BytesIO(data)), BG_KEY)))
        if _alpha_ratio(img) < _MIN_ALPHA_RATIO:
            last = "model ignored the chroma backdrop (<5% transparent after keying)"
            continue
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=90)
        return buf.getvalue()
    raise RuntimeError(f"portrait generation failed: {last}")
```

- [ ] **Step 8: Run the full suite**

Run: `python -m pytest -q`
Expected: PASS. (`tools/api/routers/avatar.py` needs no change — `store_portrait` already sniffs webp and the router is content-agnostic.)

- [ ] **Step 9: Commit**

```bash
git add tools/avatar/portrait.py tests/avatar/test_portrait.py tests/avatar/test_portrait_store.py
git commit -m "feat(avatar): portrait v2 — green-screen render keyed to transparent 512^2 webp, v2 hash salt, background out of the look"
git push origin main
```

---

### Task 3: `<Selena>` v3 (raster-only) — delete the compositor, migrate every consumer

The user-rejected sticker compositor dies here. `<Selena>` becomes: transparent portrait when available, else the literal `iris.png`, over an optional CSS backdrop.

**Files:**
- Create: `frontend/src/aurora/avatar/backdrops.ts`
- Rewrite: `frontend/src/aurora/avatar/Selena.tsx`
- Delete: `frontend/src/aurora/avatar/renderSelena.ts`, `frontend/src/aurora/avatar/SelenaPortrait.tsx`
- Modify: `frontend/src/aurora/avatar/manifest.ts` (drop shape types + LAYER_ORDER)
- Modify: `frontend/src/aurora/components/AtlasRail.tsx:103`, `frontend/src/aurora/screens/Profile.tsx:47-49`, `frontend/src/aurora/screens/Leaderboard.tsx:122-124`, `frontend/src/aurora/screens/SelenaStudio.tsx`
- Modify: `frontend/src/aurora/aurora.css` (append `.selena-wrap` block), `frontend/src/aurora/studio.css` (replace `.selena-portrait` block)
- Modify: `frontend/src/lib/queryClient.ts:27` (persist bump)
- Modify: `frontend/tests/aurora_assert.mjs` (selector updates)

- [ ] **Step 1: Create `frontend/src/aurora/avatar/backdrops.ts`**

```ts
/* Canonical background-axis → CSS map. v2 portraits are transparent cutouts, so
   the `background` choice renders as a CSS layer BEHIND the image — instant to
   switch, free, and never forces a re-render. Typed Record<Background, …> so
   `npm run typecheck` fails if the registry gains an id without a backdrop. */
import { BG_COLORS, type Background } from "./manifest";

const GRADIENTS: Partial<Record<Background, string>> = {
  gemini: "linear-gradient(135deg,#c9c2f5,#eae6fb 55%,#f6d9c4)",
  galaxy: "radial-gradient(circle at 32% 26%,#3a2b63,#241b3c 72%)",
  sunset: "linear-gradient(160deg,#fbdcc4,#f4ad86)",
  ocean: "linear-gradient(160deg,#d8eef6,#bfe0ef)",
  confetti: "radial-gradient(circle at 30% 20%,#fbe3eb,#fbf0f4)",
  sun: "linear-gradient(160deg,#fef2d4,#fbe6b0)",
  forest: "linear-gradient(160deg,#dceed8,#b9d9af)",
};

/** Full backdrop CSS for a background id ("transparent" when unset/unknown). */
export function backdropCss(id?: string): string {
  if (id && id in GRADIENTS) return GRADIENTS[id as Background]!;
  if (id && id in BG_COLORS) return BG_COLORS[id as Background];
  return "transparent";
}

/** A soft tint for glow/halo effects derived from the same choice. */
export function backdropGlow(id?: string): string {
  return id && id in BG_COLORS ? BG_COLORS[id as Background] : "#f2e2d0";
}
```

- [ ] **Step 2: Rewrite `frontend/src/aurora/avatar/Selena.tsx`**

```tsx
/* <Selena> — a student's Selena, raster-only (seamless-custom spec, 2026-07-07).
   The custom look is ONE transparent AI render of the whole configuration
   (accessories baked in by the model — never client-side compositing, which was
   rejected). No portrait yet / failed / never customized → the literal homepage
   iris.png. Optional CSS backdrop from the `background` axis sits behind the
   cutout. Presentational + hook-free, renders on server or client. */
import { backdropCss } from "./backdrops";

const IRIS_SRC = "/brand/iris.png";

export function Selena({
  portraitUrl,
  background,
  size = 240,
  className,
}: {
  portraitUrl?: string | null;
  background?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="Selena, your avatar"
      className={`selena-wrap${className ? " " + className : ""}`}
      style={{ width: size, height: size, background: backdropCss(background) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- generated raster; no next/image on standalone */}
      <img
        className="selena-img"
        src={portraitUrl || IRIS_SRC}
        alt=""
        width={size}
        height={size}
        onError={(e) => {
          // A dead portrait URL degrades to the default mascot — never broken art.
          if (e.currentTarget.getAttribute("src") !== IRIS_SRC) e.currentTarget.src = IRIS_SRC;
        }}
      />
    </span>
  );
}
```

- [ ] **Step 3: Delete the compositor + portrait wrapper; slim the manifest**

```bash
git rm frontend/src/aurora/avatar/renderSelena.ts frontend/src/aurora/avatar/SelenaPortrait.tsx
```

In `frontend/src/aurora/avatar/manifest.ts`: delete `LAYER_ORDER` and the type exports `EyeShape, Lashes, Mouth, Glasses, Topper, Accessory, Outfit` (only the colour maps + their types remain). Replace the header comment with:

```ts
// Selena colour manifest — the swatch maps for the colour axes (body/iris/blush)
// plus the background base tints consumed by backdrops.ts. Typed Record<IdUnion,
// string> derived from the generated registry, so `npm run typecheck` fails if an
// id is unmapped. Shape/prop axes have NO client-side art: they render only inside
// the one AI portrait (seamless-custom spec) and as static tiles in the Studio.
```

- [ ] **Step 4: Migrate the simple consumers**

`AtlasRail.tsx` line 103 (`selenaConfig` comes from `useAvatar` in that file — keep the variable for the `data-selena` gate):

```tsx
{selenaConfig ? (
  <Selena portraitUrl={avatar?.portrait_status === "ready" ? avatar?.portrait_url : null} size={30} />
) : initials}
```

`Profile.tsx` lines 47-49 — same shape, `size={62}`:

```tsx
{selenaConfig ? (
  <Selena portraitUrl={avatar?.portrait_status === "ready" ? avatar?.portrait_url : null} size={62} />
) : initials}
```

`Leaderboard.tsx` lines 122-124 (rows get real per-student URLs in Task 8; until then every face is the default mascot):

```tsx
<span className="lb-face" aria-hidden>
  <Selena size={44} />
</span>
```

Remove the now-unused `avatar_config` import/usages there (`e.avatar_config` stays in the row type until Task 8).

- [ ] **Step 5: Minimal Studio migration (compiles + behaves; loadout polish is Task 5)**

In `SelenaStudio.tsx`:
- Replace the `SelenaPortrait` import with `import { tileSrc } from "@/aurora/avatar/tiles";` (created next step) and keep `Selena`.
- Hero (line 167):

```tsx
<Selena
  portraitUrl={heroStatus === "ready" ? heroUrl : null}
  background={draft.background}
  size={220}
/>
{heroStatus === "pending" && (
  <span className="studio-fusing" role="status">✨ Fusing your look…</span>
)}
```

- Option tiles (line 239) — file-convention art with a graceful missing-file fallback:

```tsx
{/* eslint-disable-next-line @next/next/no-img-element */}
<img
  className="studio-tile-art"
  src={tileSrc(step.axis, id)}
  alt=""
  width={80}
  height={80}
  loading="lazy"
  onError={(e) => { e.currentTarget.style.display = "none"; }}
/>
```

- Celebrate card (line 271): `<Selena portraitUrl={data?.portrait_status === "ready" ? data?.portrait_url : null} size={140} />`
- Update the file header comment (lines 2-7): the hero/tiles are real rendered art; the sticker compositor is gone.

Create `frontend/src/aurora/avatar/tiles.ts`:

```ts
/* Studio option-tile art paths. One static webp per non-colour option id, generated
   offline by tools/avatar/generate_tiles.py (placeholders first, paid art on
   go-ahead) and committed under frontend/public/avatar/tiles/<axis>/<id>.webp.
   "none" options show the pristine default mascot. */
const IRIS_SRC = "/brand/iris.png";

export function tileSrc(axis: string, id: string): string {
  if (id === "none") return IRIS_SRC;
  return `/avatar/tiles/${axis}/${id}.webp`;
}
```

- [ ] **Step 6: CSS**

Append to `frontend/src/aurora/aurora.css`:

```css
/* <Selena> v3 — raster cutout (or the default iris.png) over an optional CSS backdrop. */
.selena-wrap { display: inline-grid; place-items: center; overflow: hidden; border-radius: 18%; line-height: 0; }
.selena-wrap .selena-img { width: 100%; height: 100%; object-fit: contain; display: block; }
```

In `frontend/src/aurora/studio.css`: delete the whole `.selena-portrait` block (lines 77-108) and add:

```css
/* "Fusing your look…" — the render-in-flight beat over the hero. */
.studio-fusing {
  position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
  white-space: nowrap; font-size: 0.7rem; font-weight: 700; color: var(--ink);
  background: color-mix(in srgb, var(--surface) 85%, transparent);
  border-radius: 999px; padding: 0.25rem 0.7rem; box-shadow: var(--shadow-1);
  animation: studio-pulse 1.4s ease-in-out infinite;
}
.studio-hero { position: relative; }
.studio-tile-art { display: block; width: 80px; height: 80px; object-fit: contain; }
```

- [ ] **Step 7: Bump the persisted-cache buster**

`frontend/src/lib/queryClient.ts` line 27:

```ts
const PERSIST_SCHEMA_VERSION = "4";  // bumped: <Selena> raster-only — persisted avatar/leaderboard caches change meaning
```

- [ ] **Step 8: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS (all compositor imports gone)

- [ ] **Step 9: Update the harness asserts**

In `frontend/tests/aurora_assert.mjs`:
- Line 486: `".studio-hero svg"` → `".studio-hero img.selena-img"`.
- Lines 490-497 (the tint-repaint assert — v3 doesn't tint): replace the block with:

```js
await np.locator('.studio-swatch:has-text("Aqua")').click();
await np.waitForSelector(".studio-chip", { timeout: 8000 });
console.log("PASS: Selena Studio — selecting an option marks unsaved changes (no client compositing)");
```

- Line 502: `".studio-tiles .studio-tile svg"` → `".studio-tiles .studio-tile"`.
- Lines 516-521: `".studio-hero .selena-portrait-img"` → `'.studio-hero img.selena-img'`, and the src check becomes `startsWith("data:")` (the mock's 1×1 PNG data URL).
- Line 534: `'.aurora-profile-avatar-lg[data-selena] svg'` → `'.aurora-profile-avatar-lg[data-selena] img.selena-img'`.
- Line 535: `'.aurora-rail .aurora-avatar[data-selena] svg'` → `'.aurora-rail .aurora-avatar[data-selena] img.selena-img'`.
- Line 565: `".lb-face svg"` → `".lb-face img.selena-img"`.

- [ ] **Step 10: Run the harness**

Run: `bash scripts/start-harness.sh aurora`
Expected: exit 0, all PASS lines (re-run the assert against the warm server if the known first-nav flake hits).

- [ ] **Step 11: Commit**

```bash
git add -A frontend/src/aurora/avatar frontend/src/aurora/components/AtlasRail.tsx frontend/src/aurora/screens/Profile.tsx frontend/src/aurora/screens/Leaderboard.tsx frontend/src/aurora/screens/SelenaStudio.tsx frontend/src/aurora/aurora.css frontend/src/aurora/studio.css frontend/src/lib/queryClient.ts frontend/tests/aurora_assert.mjs
git commit -m "feat(selena): raster-only <Selena> v3 — delete the sticker compositor, portrait cutout + iris.png fallback everywhere"
git push origin main
```

---

### Task 4: Tile tooling — placeholders + the tile-file mandate

**Files:**
- Create: `tools/avatar/tiles.py`, `tools/avatar/generate_tiles.py`, `tools/avatar/make_tile_placeholders.py`
- Create: `frontend/public/avatar/tiles/<axis>/<id>.webp` (generated placeholders)
- Modify: `tools/avatar/portrait.py` (expose `phrase_for`)
- Test: `tests/avatar/test_tiles.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/avatar/test_tiles.py`:

```python
"""Tile registry + mandate: every non-colour, non-none option id ships a static
tile art file (placeholder first, paid art later) — same style of gate as the
50-cards-per-topic mandate. Colour axes render as swatches, not tiles."""
from pathlib import Path

from tools.avatar.parts import AVATAR_AXES
from tools.avatar.portrait import phrase_for
from tools.avatar.tiles import TILE_AXES, tile_ids, tile_path

TILES_ROOT = Path("frontend/public/avatar/tiles")


def test_tile_axes_are_the_prop_axes():
    assert TILE_AXES == ["eyeShape", "lashes", "mouth", "glasses", "topper", "accessory", "outfit"]


def test_tile_ids_skip_none():
    assert "none" not in tile_ids("topper")
    assert "crown" in tile_ids("topper")


def test_every_tile_id_has_a_committed_file():
    missing = [
        f"{axis}/{oid}" for axis in TILE_AXES for oid in tile_ids(axis)
        if not (TILES_ROOT / axis / f"{oid}.webp").exists()
    ]
    assert not missing, f"tile art missing (run tools/avatar/make_tile_placeholders.py): {missing}"


def test_tile_path_convention_matches_frontend():
    assert tile_path("topper", "crown") == TILES_ROOT / "topper" / "crown.webp"


def test_phrase_for_covers_every_tile_id():
    missing = [f"{a}/{o}" for a in TILE_AXES for o in tile_ids(a) if not phrase_for(a, o)]
    assert not missing
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest tests/avatar/test_tiles.py -q`
Expected: FAIL — `No module named 'tools.avatar.tiles'`

- [ ] **Step 3: Create `tools/avatar/tiles.py`**

```python
"""Studio tile registry — which option ids get static tile art, and where it lives.

A tile is ONE render of the default Selena wearing JUST that option (the axis's
other choices at their defaults), keyed to a transparent cutout like the portrait.
Colour axes render as swatches in the Studio and need no art; `none` options show
the pristine default mascot (frontend convention in aurora/avatar/tiles.ts)."""
from __future__ import annotations

from pathlib import Path

from tools.avatar.parts import AVATAR_AXES

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
TILES_ROOT = PROJECT_ROOT / "frontend" / "public" / "avatar" / "tiles"

# The prop/shape axes — everything that isn't a colour swatch or the CSS backdrop.
TILE_AXES: list[str] = ["eyeShape", "lashes", "mouth", "glasses", "topper", "accessory", "outfit"]


def tile_ids(axis: str) -> list[str]:
    """Option ids on a tile axis that need art (everything but `none`)."""
    return [o for o in AVATAR_AXES[axis] if o != "none"]


def tile_path(axis: str, option_id: str) -> Path:
    return TILES_ROOT / axis / f"{option_id}.webp"
```

- [ ] **Step 4: Expose `phrase_for` in `tools/avatar/portrait.py`**

Add after the `_OUTFIT` map:

```python
# axis → bespoke phrase map. Single lookup point for the portrait prompt, the tile
# prompts, and the phrase-coverage gate (no shipped id may fall back to _humanize).
PROMPT_MAPS: dict[str, dict[str, str]] = {
    "bodyColor": _BODY, "irisColor": _IRIS, "eyeShape": _EYE, "mouth": _MOUTH,
    "lashes": _LASHES, "blush": _BLUSH, "glasses": _GLASSES, "topper": _TOPPER,
    "accessory": _ACCESSORY, "outfit": _OUTFIT,
}


def phrase_for(axis: str, option_id: str) -> str | None:
    """The bespoke prompt phrase for an option id, or None if unmapped."""
    return PROMPT_MAPS.get(axis, {}).get(option_id)
```

Note: `test_phrase_for_covers_every_tile_id` will list currently-unmapped ids (e.g. `eyeShape/round`, `mouth/smile` are mapped; check the run output). Add any missing entries to the existing maps now — every *current* tile id must be covered before this task lands (the big expansion happens in Task 6).

- [ ] **Step 5: Create `tools/avatar/make_tile_placeholders.py` (keyless)**

```python
#!/usr/bin/env python3
"""Clearly-marked placeholder tiles so the Studio ships green keyless
(placeholders-first rule). Each is the real iris.png with a distinct per-axis
hue tint + the option id + 'PLACEHOLDER' watermarked on, so it reads as Selena
but is never mistaken for final art. Replaced per-id by
`generate_tiles.py --install` on explicit go-ahead. Idempotent; skips files
already replaced by real art (real tiles carry no watermark, but we can't tell —
so --force rewrites everything, default only fills gaps)."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from PIL import Image, ImageDraw

from tools.avatar.tiles import TILE_AXES, tile_ids, tile_path

ROOT = Path(__file__).resolve().parents[2]
IRIS = ROOT / "frontend" / "public" / "brand" / "iris.png"
# a distinct tint per axis so placeholder grids don't read as identical
AXIS_TINT = {
    "eyeShape": (1.04, 1.00, 0.96), "lashes": (1.00, 0.98, 1.05), "mouth": (1.05, 1.02, 0.97),
    "glasses": (0.97, 1.02, 1.05), "topper": (1.06, 1.00, 1.00), "accessory": (0.98, 1.05, 1.00),
    "outfit": (1.00, 1.03, 1.04),
}


def _tint(img: Image.Image, f: tuple[float, float, float]) -> Image.Image:
    r, g, b, a = img.split()
    r = r.point(lambda v: min(255, int(v * f[0])))
    g = g.point(lambda v: min(255, int(v * f[1])))
    b = b.point(lambda v: min(255, int(v * f[2])))
    return Image.merge("RGBA", (r, g, b, a))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="rewrite existing files too")
    args = ap.parse_args()
    base = Image.open(IRIS).convert("RGBA")
    wrote = 0
    for axis in TILE_AXES:
        for oid in tile_ids(axis):
            out = tile_path(axis, oid)
            if out.exists() and not args.force:
                continue
            out.parent.mkdir(parents=True, exist_ok=True)
            im = _tint(base, AXIS_TINT[axis])
            d = ImageDraw.Draw(im)
            d.text((14, 12), oid, fill=(25, 25, 30, 200))
            d.text((14, im.height - 30), "PLACEHOLDER", fill=(20, 20, 25, 130))
            im.save(out, "WEBP", quality=80)
            wrote += 1
    print(f"placeholder tiles written: {wrote}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 6: Create `tools/avatar/generate_tiles.py` (PAID, gated — mirrors generate_poses.py)**

```python
#!/usr/bin/env python3
"""Studio option-tile art via Nano-Banana flash — PAID, go-ahead-gated.

One render per non-colour option id: the DEFAULT Selena wearing just that option,
on flat chroma green, keyed to a transparent 512² cutout (tools/shared/keying).
Output lands in .tmp/selena-tiles/<axis>/ for human review; --install converts
approved art to frontend/public/avatar/tiles/<axis>/<id>.webp, replacing the
placeholders.

Usage:
    python tools/avatar/generate_tiles.py --estimate                 # prompts + count, NO calls
    python tools/avatar/generate_tiles.py --generate [--only topper] # PAID
    python tools/avatar/generate_tiles.py --install
"""
import argparse
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from PIL import Image

from tools.avatar import generate_sprites
from tools.avatar.portrait import phrase_for
from tools.avatar.tiles import TILE_AXES, tile_ids, tile_path
from tools.shared import keying
from tools.shared.gemini_client import MOCK_MODE

MODEL = generate_sprites.MODELS["flash"]
ROOT = Path(__file__).resolve().parents[2]
TMP_DIR = ROOT / ".tmp" / "selena-tiles"

_ANCHOR = (
    "The same one-eyed EyeBot mascot as the reference image — a soft, rounded, "
    "hairless character with a single large friendly eye, peachy body, calm gentle "
    "smile, identical proportions, colours, and rendering to the reference."
)
_FRAME = (
    f"Full body centered, plain flat solid chroma-green ({keying.BG_KEY}) background, "
    "soft even lighting. No text, no border, no watermark, no extra characters."
)


def tile_prompt(axis: str, oid: str) -> str:
    phrase = phrase_for(axis, oid)
    if not phrase:
        raise KeyError(f"no bespoke phrase for {axis}/{oid} — add it to portrait.PROMPT_MAPS")
    return f"{_ANCHOR} She is styled with exactly ONE addition: {phrase}. Nothing else changes. {_FRAME}"


def pairs(only: set[str]) -> list[tuple[str, str]]:
    return [(a, o) for a in TILE_AXES if not only or a in only for o in tile_ids(a)]


def generate_one(axis: str, oid: str) -> Path | None:
    if MOCK_MODE:
        raise RuntimeError("generate_tiles needs a live GEMINI_API_KEY; refusing in MOCK_MODE")
    data = generate_sprites.generate_image_bytes(tile_prompt(axis, oid), model=MODEL, reference=True)
    if not data:
        print(f"  [{axis}/{oid}] no image generated")
        return None
    keyed = keying.normalize_512(keying.despill_green(keying.key_out(Image.open(io.BytesIO(data)), keying.BG_KEY)))
    out = TMP_DIR / axis / f"{oid}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    keyed.save(out)
    print(f"  [{axis}/{oid}] saved {out} ({out.stat().st_size:,} bytes)")
    return out


def run_install() -> int:
    srcs = sorted(TMP_DIR.glob("*/*.png"))
    if not srcs:
        print(f"nothing to install — {TMP_DIR} is empty (run --generate first)", file=sys.stderr)
        return 1
    for src in srcs:
        axis, oid = src.parent.name, src.stem
        if axis not in TILE_AXES or oid not in tile_ids(axis):
            print(f"  skip {axis}/{oid} — not a known tile id")
            continue
        dest = tile_path(axis, oid)
        dest.parent.mkdir(parents=True, exist_ok=True)
        Image.open(src).convert("RGBA").save(dest, "WEBP", quality=88)
        print(f"  installed /avatar/tiles/{axis}/{oid}.webp")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate Studio tile art (paid; go-ahead only).")
    ap.add_argument("--estimate", action="store_true")
    ap.add_argument("--generate", action="store_true")
    ap.add_argument("--install", action="store_true")
    ap.add_argument("--only", default="", help="comma-separated axes (default: all)")
    args = ap.parse_args()
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    todo = pairs(only)

    if args.install:
        return run_install()
    if not args.generate:
        print(f"ESTIMATE — {len(todo)} tile(s) via {MODEL} (reference=True, keyed to alpha)")
        for axis, oid in todo:
            print(f"— {axis}/{oid}:\n    {tile_prompt(axis, oid)}\n")
        return 0
    if MOCK_MODE:
        print("ERROR: no GEMINI_API_KEY (MOCK_MODE) — cannot generate real art.", file=sys.stderr)
        return 2
    ok = 0
    for axis, oid in todo:
        try:
            if generate_one(axis, oid):
                ok += 1
        except Exception as e:
            print(f"  [{axis}/{oid}] FAILED: {type(e).__name__}: {str(e)[:300]}")
    print(f"\nDone: {ok}/{len(todo)} generated. Review {TMP_DIR} before --install.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 7: Generate the placeholders and run the tests**

```bash
python tools/avatar/make_tile_placeholders.py
python -m pytest tests/avatar/test_tiles.py -q
```

Expected: PASS (fill any `phrase_for` gaps the test lists). Then run the whole suite: `python -m pytest -q` → PASS.

- [ ] **Step 8: Verify tiles render in the Studio**

Run: `bash scripts/start-harness.sh aurora`
Expected: exit 0 (Studio tile `<img>`s now resolve to the placeholder files).

- [ ] **Step 9: Commit**

```bash
git add tools/avatar/tiles.py tools/avatar/generate_tiles.py tools/avatar/make_tile_placeholders.py tools/avatar/portrait.py tests/avatar/test_tiles.py frontend/public/avatar/tiles
git commit -m "feat(avatar): tile registry + keyless placeholder art + tile-file mandate (paid generator gated)"
git push origin main
```

---

### Task 5: Studio "loadout" builder

**Files:**
- Modify: `frontend/src/aurora/screens/SelenaStudio.tsx`
- Modify: `frontend/src/aurora/studio.css`
- Modify: `frontend/tests/aurora_assert.mjs`

- [ ] **Step 1: Add the loadout tray + helper copy**

In `SelenaStudio.tsx`, after the `dirty` memo add:

```tsx
// The loadout: picks that differ from the SAVED look. Each docks under the hero
// as a tile chip — the honest pending-changes state (the hero itself only ever
// shows real rendered art; picks fuse into a new render on Save).
const pending = useMemo(() => {
  if (!draft || !data?.config) return [];
  return STEPS.filter((s) => draft[s.axis] !== data.config[s.axis]);
}, [draft, data]);
```

Inside `.studio-stage`, after `.studio-stage-meta`, add:

```tsx
{pending.length > 0 && (
  <ul className="studio-tray" aria-label="Your unsaved picks">
    {pending.map((s) => (
      <li key={s.axis} className="studio-tray-chip">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tileSrc(s.axis, draft[s.axis])} alt="" width={30} height={30}
             onError={(e) => { e.currentTarget.style.display = "none"; }} />
        <span>{s.emoji} {humanize(draft[s.axis])}</span>
      </li>
    ))}
  </ul>
)}
<p className="studio-explain">Your picks bake into one hand-crafted render when you save.</p>
```

- [ ] **Step 2: Hero backdrop + living idle**

The hero from Task 3 already renders `<Selena background={draft.background}>` — backdrop switching is instant. Give the hero the living idle: on the `.studio-hero` div add `data-alive` and in `studio.css`:

```css
.studio-hero[data-alive] .selena-img { animation: studio-breathe 4.6s ease-in-out infinite; transform-origin: 50% 88%; }
@keyframes studio-breathe { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2px) scale(1.015); } }

/* loadout tray */
.studio-tray { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.4rem; list-style: none; margin: 0; padding: 0; }
.studio-tray-chip {
  display: inline-flex; align-items: center; gap: 0.35rem;
  border: 1px solid var(--border); border-radius: 999px; background: var(--surface);
  padding: 0.2rem 0.65rem 0.2rem 0.3rem; font-size: 0.74rem; font-weight: 600; color: var(--ink);
  box-shadow: var(--shadow-1); animation: studio-pop 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.3);
}
.studio-tray-chip img { border-radius: 999px; }
.studio-explain { font-size: 0.74rem; color: var(--ink-faint); margin: 0; text-align: center; }

html[data-motion="reduce"] .studio-hero[data-alive] .selena-img,
html[data-motion="reduce"] .studio-tray-chip { animation: none; }
@media (prefers-reduced-motion: reduce) {
  .studio-hero[data-alive] .selena-img, .studio-tray-chip { animation: none; }
}
```

- [ ] **Step 3: Gates**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 4: Harness assert for the tray**

In `aurora_assert.mjs`, extend the Studio section right after the unsaved-chip assert (Task 3 Step 9 version):

```js
if ((await np.locator(".studio-tray-chip").count()) < 1) { console.error("FAIL: loadout tray did not dock the pending pick"); process.exit(1); }
console.log("PASS: Selena Studio — loadout tray docks pending picks as tile chips");
```

Run: `bash scripts/start-harness.sh aurora` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/screens/SelenaStudio.tsx frontend/src/aurora/studio.css frontend/tests/aurora_assert.mjs
git commit -m "feat(studio): loadout builder — pending picks dock as tile chips, living hero, fusing beat"
git push origin main
```

---

### Task 6: Catalog expansion — way more, way funnier + phrase coverage gate

**Files:**
- Modify: `tools/avatar/parts.py` (AVATAR_AXES)
- Modify: `tools/avatar/portrait.py` (phrase maps)
- Modify: `frontend/src/aurora/avatar/axes.generated.ts` (regenerated)
- Modify: `frontend/src/aurora/avatar/manifest.ts`, `frontend/src/aurora/avatar/backdrops.ts` (new colour/backdrop entries)
- Create: `frontend/public/avatar/tiles/**` placeholders for the new ids
- Test: `tests/avatar/test_prompt_coverage.py`, extend `tests/avatar/test_parts.py`-style checks in `tests/avatar/test_tiles.py` (already gates files)

- [ ] **Step 1: Write the failing coverage-gate test**

Create `tests/avatar/test_prompt_coverage.py`:

```python
"""Every shipped option id gets a bespoke over-the-top prompt phrase — no id may
fall through to the generic _humanize fallback (flat phrasing = flat art)."""
from tools.avatar.parts import AVATAR_AXES
from tools.avatar.portrait import PROMPT_MAPS


def test_every_prompt_axis_id_has_a_bespoke_phrase():
    missing = [
        f"{axis}/{oid}"
        for axis, mapping in PROMPT_MAPS.items()
        for oid in AVATAR_AXES[axis]
        if oid != "none" and oid not in mapping
    ]
    assert not missing, f"add bespoke phrases in portrait.py for: {missing}"


def test_expansion_landed():
    assert "trafficCone" in AVATAR_AXES["topper"]
    assert "dinoOnesie" in AVATAR_AXES["outfit"]
    assert "bobaTea" in AVATAR_AXES["accessory"]
    assert "dealWithIt" in AVATAR_AXES["glasses"]
    assert "aurora" in AVATAR_AXES["background"]
```

Run: `python -m pytest tests/avatar/test_prompt_coverage.py -q` → FAIL.

- [ ] **Step 2: Expand `tools/avatar/parts.py`**

Replace the seven grown axes in `AVATAR_AXES` (existing ids keep their order; new ids append). `DEFAULT_AVATAR` and `CONFIG_VERSION` are untouched:

```python
    "bodyColor":  ["porcelain", "light", "warm", "tan", "brown", "deep", "rich", "ebony",
                   "peach", "coral", "rose", "butter", "mint", "sage", "sky", "periwinkle",
                   "lavender", "slate", "bubblegum", "aqua", "gold", "silver", "midnight", "watermelon"],
    "irisColor":  ["darkBrown", "brown", "hazel", "amber", "green", "blue", "gray", "violet",
                   "teal", "rose", "gold", "galaxy", "lava", "ice", "rainbow"],
    "eyeShape":   ["round", "wide", "almond", "sleepy", "upturned", "sparkle", "starry",
                   "heart", "dizzy", "laser", "pixel", "rainbow"],
    "lashes":     ["none", "natural", "glam", "cyber", "feathery", "butterfly"],
    "mouth":      ["smile", "grin", "soft", "open", "smirk", "ooh", "tongue",
                   "laugh", "catSmile", "chomp", "whistle", "pout", "shocked", "evilGrin"],
    "blush":      ["none", "rose", "coral", "peach", "plum", "berry", "sky", "mint",
                   "gold", "grape", "teal", "stars", "freckles"],
    "glasses":    ["none", "round", "square", "catEye", "monocle", "reading", "goggles",
                   "heart", "visor", "dealWithIt", "cinema3d", "ski", "star", "magnifier",
                   "steampunk", "broken"],
    "topper":     ["none", "sprout", "bow", "cap", "beanie", "halo", "clip", "flower",
                   "antenna", "crown", "horns", "flame", "wizardHat", "propeller",
                   "trafficCone", "rubberDuck", "croissant", "vikingHelm", "pirateHat",
                   "cowboyHat", "chefToque", "discoBall", "catEars", "mushroom"],
    "accessory":  ["none", "headphones", "earmuffs", "bandage", "sticker", "sparkles",
                   "snorkel", "bobaTea", "magicWand", "balloon", "goldChain", "mustache",
                   "fannyPack", "petSnail", "jetpack", "umbrella"],
    "outfit":     ["none", "scarf", "bowtie", "collar", "lanyard", "hoodie", "labcoat",
                   "turtleneck", "overalls", "cape", "dinoOnesie", "astronaut", "tuxedo",
                   "bananaSuit", "bubbleWrap", "hawaiian", "knightArmor", "chefApron",
                   "pufferJacket", "superSuit"],
    "background": ["mist", "blush", "sky", "mint", "lilac", "sun", "graphite", "gemini",
                   "galaxy", "confetti", "sunset", "ocean", "forest", "aurora", "lavaLamp",
                   "arcade", "rainyWindow", "candy", "sakura"],
```

Also rewrite the module docstring: the ids now map to the ONE-render portrait pipeline + static Studio tiles (the D10/D11 sprite-compositor story is superseded).

- [ ] **Step 3: Write every bespoke phrase in `tools/avatar/portrait.py`**

Extend the maps — every non-`none` id must be present (the gate enforces it). Complete additions:

```python
_BODY.update({
    "peach": "the classic warm peachy", "coral": "a juicy coral-pink", "rose": "a soft rosy-pink",
    "butter": "a creamy butter-yellow", "mint": "a fresh minty-green", "sage": "a gentle sage-green",
    "sky": "a dreamy sky-blue", "periwinkle": "a soft periwinkle-blue", "lavender": "a magical lavender",
    "slate": "a cool slate-blue", "bubblegum": "a poppy bubblegum-pink", "aqua": "a splashy aqua",
    "gold": "a gleaming molten-gold, like a trophy", "silver": "a polished chrome-silver, mirror-shiny",
    "midnight": "a deep midnight-navy with a starry shimmer", "watermelon": "a juicy watermelon-pink with a hint of green",
})
_IRIS.update({
    "brown": "a warm glossy brown iris", "hazel": "a sparkling hazel iris flecked with gold",
    "amber": "a glowing amber iris like warm honey", "green": "a vivid emerald-green iris",
    "blue": "a brilliant crystal-blue iris", "gray": "a cool silvery-gray iris",
    "violet": "a dazzling violet iris", "teal": "a luminous teal iris",
    "lava": "a molten lava iris, glowing orange-red with ember cracks",
    "ice": "a glacial ice iris, pale crystal blue with frosty sparkle",
    "rainbow": "an impossible rainbow iris, a full spectrum swirl",
})
_EYE.update({
    "heart": "shaped like a huge lovestruck heart",
    "dizzy": "a hilarious dizzy swirl, totally starstruck",
    "laser": "narrowed into an intense laser-focus glare with a glowing scanline",
    "pixel": "rendered as a chunky retro 8-bit pixel eye",
    "rainbow": "beaming a soft rainbow arc across the iris",
})
_MOUTH.update({
    "laugh": "an uncontrollable head-back belly laugh",
    "catSmile": "a smug little :3 cat smile", "chomp": "a giant goofy chomp with one tooth showing",
    "whistle": "casually whistling with a tiny musical note",
    "pout": "a dramatic theatrical pout", "shocked": "a totally shocked jaw-drop",
    "evilGrin": "a cartoonishly evil scheming grin",
})
_LASHES.update({
    "feathery": "huge feathery false lashes, full drama",
    "butterfly": "lashes that curl into tiny butterfly wings",
})
_GLASSES.update({
    "dealWithIt": "pixelated 8-bit 'deal with it' sunglasses",
    "cinema3d": "retro red-and-cyan 3D cinema glasses",
    "ski": "mirrored ski goggles with a rainbow sheen",
    "star": "oversized star-shaped party glasses",
    "magnifier": "a comically huge detective's magnifying glass held up to the eye",
    "steampunk": "brass steampunk goggles with tiny gears",
    "broken": "cracked, taped-together nerd glasses worn proudly",
})
_TOPPER.update({
    "wizardHat": "a giant starry wizard hat, slightly too big",
    "propeller": "a classic propeller beanie, propeller mid-spin",
    "trafficCone": "a tiny orange traffic cone worn proudly as a hat",
    "rubberDuck": "a small yellow rubber duck sitting calmly on top",
    "croissant": "a golden buttery croissant balanced like a beret",
    "vikingHelm": "a horned viking helmet, fearsome yet adorable",
    "pirateHat": "a swashbuckling pirate tricorn with a tiny skull",
    "cowboyHat": "a ten-gallon cowboy hat, yee-haw energy",
    "chefToque": "a tall white chef's toque",
    "discoBall": "a glittering mini disco ball hovering above, scattering sparkles",
    "catEars": "a soft pink cat-ear headband",
    "mushroom": "a cute red-and-white spotted mushroom cap",
})
_ACCESSORY.update({
    "snorkel": "a snorkel and mask pushed up ready for adventure",
    "bobaTea": "clutching a giant boba milk tea with both tiny arms",
    "magicWand": "holding a sparkling magic wand mid-spell",
    "balloon": "holding a bright red balloon on a string",
    "goldChain": "an oversized chunky gold chain, maximum swagger",
    "mustache": "a magnificent curly gentleman's mustache",
    "fannyPack": "a neon 90s fanny pack worn with total confidence",
    "petSnail": "a tiny happy pet snail sitting beside her",
    "jetpack": "a mini rocket jetpack with a gentle flame",
    "umbrella": "a tiny striped umbrella held aloft",
})
_OUTFIT.update({
    "dinoOnesie": "a full green dinosaur onesie with a hood of little teeth",
    "astronaut": "a puffy white astronaut suit with a mission patch",
    "tuxedo": "a dapper black tuxedo with a crisp bow tie",
    "bananaSuit": "a ridiculous full banana costume",
    "bubbleWrap": "armor made entirely of bubble wrap",
    "hawaiian": "a loud hibiscus-print hawaiian shirt",
    "knightArmor": "shining knight armor with a tiny plume",
    "chefApron": "a flour-dusted chef's apron",
    "pufferJacket": "an oversized cloud-like puffer jacket",
    "superSuit": "a heroic super-suit with a lightning emblem",
})
```

(Write these as literal entries inside each dict rather than `.update()` calls if that matches the file style better — the maps are plain dict literals today, so extend the literals.)

- [ ] **Step 4: Regenerate the TS mirror + colour maps + placeholders**

```bash
python tools/avatar/export_axes.py
python tools/avatar/make_tile_placeholders.py
```

In `frontend/src/aurora/avatar/manifest.ts` add the new colour hexes:

```ts
// appended to BODY_COLORS:
gold: "#EFC75E", silver: "#CDD3DC", midnight: "#3A3F55", watermelon: "#F58A7E",
// appended to IRIS_COLORS:
lava: "#E0522E", ice: "#BFE4F2", rainbow: "#B76BD9",
// appended to BG_COLORS:
aurora: "#DFF3EE", lavaLamp: "#F8E0EE", arcade: "#1E2340", rainyWindow: "#DCE7EE",
candy: "#FDEBF3", sakura: "#FBE7EC",
```

In `frontend/src/aurora/avatar/backdrops.ts` add gradients for the showpiece new backdrops:

```ts
aurora: "linear-gradient(160deg,#d8f3ec,#bfe7dc 45%,#cfd8f2)",
lavaLamp: "linear-gradient(180deg,#fbe0ef,#f6c9e2 40%,#e9d1f5)",
arcade: "radial-gradient(circle at 50% 20%,#2c3466,#1e2340 70%)",
sakura: "linear-gradient(160deg,#fdeef2,#f9d9e2)",
```

- [ ] **Step 5: Run everything**

```bash
python -m pytest -q
cd frontend && npm run typecheck && npm run build
```

Expected: PASS — the axes-parity test, the tile mandate (placeholders now cover the new ids), the phrase gate, and the typed colour Records all hold. The Studio picks the new options up automatically (steps iterate the generated registry; `AVATAR_COMBOS` recomputes itself).

- [ ] **Step 6: Harness, then commit**

Run: `bash scripts/start-harness.sh aurora` → exit 0.

```bash
git add tools/avatar/parts.py tools/avatar/portrait.py frontend/src/aurora/avatar/axes.generated.ts frontend/src/aurora/avatar/manifest.ts frontend/src/aurora/avatar/backdrops.ts frontend/public/avatar/tiles tests/avatar/test_prompt_coverage.py
git commit -m "feat(avatar): catalog doubles+ — 46 ridiculous new options with bespoke prompt phrases + coverage gate"
git push origin main
```

---

### Task 7: Home greeting card — the living custom Selena + self-heal

**Files:**
- Modify: `frontend/src/hooks/useAvatar.ts` (self-heal hook)
- Modify: `frontend/src/aurora/components/home/GreetingHero.tsx`
- Modify: `frontend/src/aurora/screens/Dashboard.tsx`
- Modify: `frontend/src/aurora/screens/SelenaStudio.tsx` (mount self-heal)
- Modify: `frontend/src/aurora/home.css`
- Modify: `frontend/tests/aurora_assert.mjs`

- [ ] **Step 1: Self-heal hook in `useAvatar.ts`**

```ts
const SELF_HEAL_KEY = "eyebot_portrait_heal";

/** v2 portraits are salted, so a customized student's pre-v2 look reads
 *  `portrait_status: "none"` — fire the (cache-gated, rate-limited) render request
 *  once per browser session so every existing student self-heals without visiting
 *  the Studio. Server-side gating makes an accidental double-fire harmless. */
export function useSelfHealPortrait(data?: AvatarResponse) {
  const requestPortrait = useRequestPortrait();
  const mutate = requestPortrait.mutate;
  useEffect(() => {
    if (!data?.customized) return;
    const s = data.portrait_status;
    if (s !== "none" && s !== "failed") return;
    try {
      if (sessionStorage.getItem(SELF_HEAL_KEY)) return;
      sessionStorage.setItem(SELF_HEAL_KEY, "1");
    } catch {
      return; // no storage → skip rather than risk firing every render
    }
    mutate();
  }, [data?.customized, data?.portrait_status, mutate]);
}
```

Add `import { useEffect } from "react";` at the top.

- [ ] **Step 2: `GreetingHero` shows YOUR Selena once it exists**

New props + render branch:

```tsx
export function GreetingHero({
  greeting, level, rank, xpInLevel, xpToNext, onSurprise, resumeHref,
  portraitUrl, background,
}: {
  greeting: Greeting; level: number; rank: string; xpInLevel: number; xpToNext: number;
  onSurprise: () => void; resumeHref: string;
  /** the student's transparent custom render — null/undefined → default brand mascot */
  portraitUrl?: string | null;
  background?: string;
}) {
```

Replace the mascot block (lines 62-65):

```tsx
<div className="hm-iriswrap" aria-hidden>
  <span className="hm-irisfloor" />
  {portraitUrl ? (
    <span className="hm-selena" style={{ ["--halo" as string]: backdropGlow(background) }}>
      <span className="hm-selena-halo" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="hm-selena-img"
        src={portraitUrl}
        alt=""
        onError={(e) => { e.currentTarget.src = "/brand/iris.png"; }}
      />
    </span>
  ) : (
    <SelenaLogo motion="hello" className="hm-iris" />
  )}
</div>
```

Add `import { backdropGlow } from "@/aurora/avatar/backdrops";`.

- [ ] **Step 3: Wire the Dashboard**

In `Dashboard.tsx` add near the other hooks:

```tsx
const { data: avatar } = useAvatar();
useSelfHealPortrait(avatar);
const portraitUrl =
  avatar?.customized && avatar.portrait_status === "ready" ? avatar.portrait_url : null;
```

and pass to the hero (line 116): `portraitUrl={portraitUrl} background={avatar?.config?.background}`.
Imports: `import { useAvatar, useSelfHealPortrait } from "@/hooks/useAvatar";`

In `SelenaStudio.tsx` add `useSelfHealPortrait(data);` right after the `useAvatar()` call (import it alongside the existing hooks).

- [ ] **Step 4: Living motion in `home.css`**

Append after the `.hm-iris` rules (line ~68):

```css
/* ── the student's OWN Selena on the greeting card (seamless-custom spec) ──
   One transparent render, animated CSS-only: entrance rise, continuous
   breathe/bob, and a soft halo glow tinted by their chosen backdrop. */
.hm-selena { position:relative; width:216px; height:216px; margin-bottom:6px; display:block;
  animation: hm-selena-enter 0.9s cubic-bezier(0.2,0.9,0.3,1.15); }
.hm-selena-img { position:relative; width:100%; height:100%; object-fit:contain; display:block;
  animation: hm-iris-bob 4.8s ease-in-out infinite; transform-origin:50% 90%; }
.hm-selena-halo { position:absolute; inset:8%; border-radius:50%; z-index:-1;
  background: radial-gradient(circle, var(--halo, #f2e2d0) 0%, transparent 68%);
  opacity:0.55; filter: blur(10px); animation: hm-halo-breathe 4.8s ease-in-out infinite; }
@keyframes hm-selena-enter { from { opacity:0; transform: translateY(18px) scale(0.94); } to { opacity:1; transform: translateY(0) scale(1); } }
@keyframes hm-halo-breathe { 0%,100% { opacity:0.42; } 50% { opacity:0.68; } }
```

And extend the two reduced-motion rules (lines 197-198):

```css
@media (prefers-reduced-motion: reduce) { .aurora-home .hm-iris, .aurora-home .hm-selena, .aurora-home .hm-selena-img, .aurora-home .hm-selena-halo { animation:none; } }
html[data-motion="reduce"] .aurora-home .hm-iris,
html[data-motion="reduce"] .aurora-home .hm-selena,
html[data-motion="reduce"] .aurora-home .hm-selena-img,
html[data-motion="reduce"] .aurora-home .hm-selena-halo { animation:none; }
```

Also extend the responsive rules: inside `@media (max-width:…)` where `.hm-iris` is resized to 158px, add `.hm-selena { width:158px; height:158px; }`.

- [ ] **Step 5: Gates + harness**

Run: `cd frontend && npm run typecheck && npm run build` → PASS.

In `aurora_assert.mjs`, the "Selena everywhere" section (~line 530) runs with `/api/avatar` mocked to a saved config + instantly-ready portrait. Navigate home there and add:

```js
// The greeting card now hosts YOUR Selena (one transparent render, living motion)
// once customized + rendered; never-customized students keep the brand SelenaLogo.
await np.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await np.waitForSelector(".hm-selena img.hm-selena-img", { timeout: 15000 });
const heroSrc = (await np.locator(".hm-selena-img").getAttribute("src")) ?? "";
if (!heroSrc.startsWith("data:")) { console.error(`FAIL: greeting hero is not the custom portrait (src=${heroSrc})`); process.exit(1); }
console.log("PASS: Home greeting — the student's OWN rendered Selena, animated (custom replaces brand mascot)");
```

Note: the earlier reduced-motion + onboarding sections mock `customized:false` / no portrait → they still see `SelenaLogo` (their existing asserts hold unchanged). Update the studio-section `/api/avatar` mock so its GET response includes `customized: true` (it already returns a portrait once "saved").

Run: `bash scripts/start-harness.sh aurora` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useAvatar.ts frontend/src/aurora/components/home/GreetingHero.tsx frontend/src/aurora/screens/Dashboard.tsx frontend/src/aurora/screens/SelenaStudio.tsx frontend/src/aurora/home.css frontend/tests/aurora_assert.mjs
git commit -m "feat(home): the student's OWN Selena lives on the greeting card — entrance, breathe, tinted halo + once-per-session portrait self-heal"
git push origin main
```

---

### Task 8: Leaderboard portraits (bulk, no N+1)

**Files:**
- Modify: `tools/shared/db.py` (bulk getter)
- Modify: `tools/gamification/leaderboard.py` (portrait passthrough)
- Modify: `tools/api/routers/student.py` (wire bulk lookup, `LbEntry.portrait_url`)
- Modify: `frontend/src/hooks/useLeaderboard.ts`, `frontend/src/aurora/screens/Leaderboard.tsx`
- Modify: `frontend/tests/aurora_assert.mjs` (mock rows)
- Test: `tests/gamification/test_leaderboard.py`, `tests/api/test_leaderboard_endpoint.py`

- [ ] **Step 1: Failing pure-core test**

Add to `tests/gamification/test_leaderboard.py`:

```python
def test_rank_entries_carries_portrait_urls():
    profiles = [
        {"student_id": "a", "xp": 10, "avatar_config": {"topper": "crown"}},
        {"student_id": "b", "xp": 5, "avatar_config": None},
    ]
    urls = {"a": "https://cdn/x.webp"}
    entries = rank_entries(profiles, {}, viewer_id="a", portraits=urls)
    assert entries[0]["portrait_url"] == "https://cdn/x.webp"
    assert entries[1]["portrait_url"] is None
```

Run: `python -m pytest tests/gamification/test_leaderboard.py -q` → FAIL.

- [ ] **Step 2: Implement passthrough in `tools/gamification/leaderboard.py`**

`rank_entries` gains `portraits: dict[str, str] | None = None`; in the entry dict add:

```python
            "portrait_url": (portraits or {}).get(sid),
```

Run the test → PASS.

- [ ] **Step 3: Bulk getter in `tools/shared/db.py`** (after `get_avatar_image`)

```python
async def get_avatar_images_bulk(config_hashes: list[str]) -> dict[str, str]:
    """hash → public image URL for every READY portrait among the given hashes.
    One query (no N+1). Raises if the table is missing — callers degrade to {}."""
    if not config_hashes:
        return {}
    client = await _get_client()
    result = (
        await client.table("avatar_images")
        .select("config_hash,status,image_url")
        .in_("config_hash", list(set(config_hashes)))
        .execute()
    )
    return {
        r["config_hash"]: r["image_url"]
        for r in (result.data or [])
        if r.get("status") == "ready" and r.get("image_url")
    }
```

- [ ] **Step 4: Wire the router**

In `tools/api/routers/student.py`: add `portrait_url: str | None = None` to `LbEntry`; import `from tools.avatar.portrait import config_hash`. In `leaderboard()` before `rank_entries`:

```python
    # One bulk portrait lookup for the whole board (transparent v2 renders); the
    # portrait cache being missing/stale just means default-mascot headshots.
    portraits: dict[str, str] = {}
    try:
        hashes = {p.get("student_id"): config_hash(p.get("avatar_config") or {}) for p in profiles}
        by_hash = await db.get_avatar_images_bulk(list(hashes.values()))
        portraits = {sid: by_hash[h] for sid, h in hashes.items() if h in by_hash}
    except Exception:
        portraits = {}
    entries = rank_entries(profiles, names, viewer_id=student_id, role=role or None, portraits=portraits)
```

Add an endpoint test in `tests/api/test_leaderboard_endpoint.py` following that file's existing monkeypatch style: patch `db.get_avatar_images_bulk` to return `{<hash-of-profile-config>: "https://cdn/p.webp"}` and assert the matching entry's `portrait_url` comes back while others are `None`.

- [ ] **Step 5: Frontend**

`useLeaderboard.ts`: add `portrait_url: string | null;` to `LeaderboardEntry` (keep `avatar_config` — additive, no persist bump needed beyond Task 3's).
`Leaderboard.tsx` face: `<Selena portraitUrl={e.portrait_url} size={44} />`.
`aurora_assert.mjs`: give the mock rows `portrait_url: null` except one with `portrait_url: TRANSPARENT_PNG` (the data-URL constant already in the file), then assert at the old line-565 spot that at least one `.lb-face img.selena-img[src^="data:"]` exists.

- [ ] **Step 6: All gates + commit**

```bash
python -m pytest -q
cd frontend && npm run typecheck && npm run build
bash scripts/start-harness.sh aurora
git add tools/shared/db.py tools/gamification/leaderboard.py tools/api/routers/student.py tests/gamification/test_leaderboard.py tests/api/test_leaderboard_endpoint.py frontend/src/hooks/useLeaderboard.ts frontend/src/aurora/screens/Leaderboard.tsx frontend/tests/aurora_assert.mjs
git commit -m "feat(leaderboard): real rendered Selena headshots — bulk portrait lookup, default-mascot fallback"
git push origin main
```

---

### Task 9: Design locks, docs, final verification

**Files:**
- Modify: `docs/design-locks.md`
- Verify: everything

- [ ] **Step 1: Amend the locks**

In `docs/design-locks.md`, amend the **Selena Studio** lock's acceptance criteria (name the change: hero/tiles/tray per the seamless-custom spec) and add:

```markdown
## Custom Selena surfaces (LOCKED 2026-07-08)
A student's Selena is ONE AI render of the whole look — transparent, anchored to
iris.png — shown by the raster-only `<Selena>` component. No client-side part
compositing anywhere (vector stickers over the raster were rejected as ugly,
2026-07-08). Every fallback path is the default `/brand/iris.png`. The greeting
card hosts the custom render with CSS living motion once customized; brand
surfaces (SelenaLogo, CoBrand, splash, rails, favicon, login) stay the DEFAULT
mascot. Spec: docs/superpowers/specs/2026-07-07-selena-seamless-custom-design.md.
```

- [ ] **Step 2: Full verification sweep (ship-check discipline)**

```bash
python -m pytest -q                                   # expect: all green
cd frontend && npm run typecheck && npm run build     # expect: green
bash scripts/start-harness.sh aurora                  # expect: exit 0, all PASS
```

Behavioral spot-checks against the warm harness server (repeat-state invariants):
- Studio: pick → tray chip → Save → "Fusing…" → hero swaps to the (mock) render; reload `/studio` — no duplicate render request fires (sessionStorage guard).
- Home: custom mock → `.hm-selena` present; reduced-motion page → animations frozen; never-customized mock → `SelenaLogo` untouched.

- [ ] **Step 3: Commit**

```bash
git add docs/design-locks.md
git commit -m "docs(design-locks): custom-Selena surfaces lock + Studio loadout amendment"
git push origin main
```

---

### Task 10: PAID pass A — the 103-tile art batch (EXPLICIT USER GO-AHEAD REQUIRED)

Do not start this task without the user saying go. Uses `.env` `GEMINI_API_KEY`; flash model; ~103 renders ≈ $1–2.50.

- [ ] **Step 1:** `python tools/avatar/generate_tiles.py --estimate` — show the user the count + a few prompts; get the explicit go.
- [ ] **Step 2:** `python tools/avatar/generate_tiles.py --generate` (or axis-by-axis with `--only topper` etc. to review in slices).
- [ ] **Step 3:** Human review of `.tmp/selena-tiles/**` — reject off-model art, re-run failures with `--only`.
- [ ] **Step 4:** `python tools/avatar/generate_tiles.py --install`, then `python -m pytest tests/avatar/test_tiles.py -q` (mandate still green) and `bash scripts/start-harness.sh aurora`.
- [ ] **Step 5:** Commit + push the installed webps: `git add frontend/public/avatar/tiles && git commit -m "feat(studio): install real AI tile art (paid pass A)" && git push origin main`.

### Task 11: PAID pass B — end-to-end look smoke (EXPLICIT USER GO-AHEAD REQUIRED)

- [ ] **Step 1:** With the user's go, save 2–3 real looks (one maximalist: e.g. `trafficCone` + `dealWithIt` + `dinoOnesie` + `lava` iris) via the live app or authed curl `PUT /api/avatar` + `POST /api/avatar/portrait`.
- [ ] **Step 2:** Verify each stored object is RGBA webp with transparent corners (download from the bucket URL, check with PIL), the greeting card animates the cutout, and the leaderboard face shows it.
- [ ] **Step 3:** Report results + costs to the user; fix + re-render any look that failed keying.

---

## Self-review notes (against the spec)

- R1→Task 2, R2→Task 1, R3+R4→Task 6, R5→Task 4, R6→Task 8, R7→no-op (verified in Task 2 Step 8), F1→Task 3, F2→Tasks 3+5, F3+F4→Task 7, §8 tests→embedded per task, §9 paid gates→Tasks 10-11, §10 locks→Task 9. No gaps.
- Type consistency: `Selena({ portraitUrl, background, size, className })` used identically in Tasks 3/5/7/8; `tileSrc(axis, id)` defined Task 3, consumed Tasks 3/5; `phrase_for` defined Task 4, consumed Tasks 4/6; `portraits` param defined Task 8 Step 2, used Step 4.
- The compositor-before-expansion ordering constraint is honored (Task 3 < Task 6).
