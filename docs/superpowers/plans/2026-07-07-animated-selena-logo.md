# Animated Selena Hero Logo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give EyeBot a living Selena mascot logo on three hero surfaces (Home greeting, a new Splash/loading screen, CoBrand lockups) driven by CSS choreography over paid Nano-Banana-flash pose frames anchored to `iris.png`, leaving the mono Spark-Eye rails + favicon untouched.

**Architecture:** A pure-Python asset layer (pose registry → flash generation → chroma-key to alpha → 512² normalize) produces static `.webp` pose frames. A presentational `<SelenaLogo>` React component stacks the rest frame (`iris.png`) + one paid pose and cross-fades on a CSS beat; `<BrandSplash>` wraps it for the app-shell loading boundary. All motion is CSS-only and freezes to the static rest frame under reduced motion. Placeholders ship first (green keyless); the 3 paid calls fire only on explicit go-ahead.

**Tech Stack:** Python 3.12 + Pillow (dev-only asset build), `tools/avatar/generate_sprites.py` (flash image client), pytest; Next.js 16 / React 19 / TypeScript, plain CSS, the `aurora_assert.mjs` Playwright harness.

**Spec:** `docs/superpowers/specs/2026-07-07-logo-selena-raster-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `tools/brand/__init__.py` | package marker |
| `tools/brand/logo_poses.py` | pure registry: the 3 paid poses + prompt builder (single source of truth) |
| `tools/brand/keying.py` | pure PIL: chroma-key flood-fill → alpha, and 512² normalize |
| `tools/brand/generate_poses.py` | paid flash generator (estimate/generate/install), MOCK-refuses |
| `tools/brand/make_pose_placeholders.py` | clearly-marked placeholder poses from `iris.png` |
| `frontend/public/brand/poses/{wave,cheer,groove}.webp` | committed pose assets (placeholder → real) |
| `frontend/src/aurora/components/SelenaLogo.tsx` | the animated mascot mark |
| `frontend/src/aurora/components/BrandSplash.tsx` | full-screen branded loader |
| `frontend/src/aurora/brand-mascot.css` | keyframes + layout for `<SelenaLogo>`/`<BrandSplash>` |
| `tests/brand/test_logo_poses.py` · `test_keying.py` · `test_generate_poses.py` | Python coverage |

**Modified:** `frontend/src/aurora/components/home/GreetingHero.tsx` (Home mount), `frontend/src/aurora/components/CoBrand.tsx` (mark swap), `frontend/src/app/(shell)/layout.tsx` (splash boundary), `frontend/src/styles/index.css` (import CSS), `frontend/tests/aurora_assert.mjs` (assertions), `docs/design-locks.md` (new lock).

---

### Task 1: Pose registry (pure)

**Files:**
- Create: `tools/brand/__init__.py`
- Create: `tools/brand/logo_poses.py`
- Create: `tests/brand/__init__.py`
- Test: `tests/brand/test_logo_poses.py`

- [ ] **Step 1: Create package markers**

Create `tools/brand/__init__.py` with a one-line docstring:

```python
"""EyeBot brand-asset tools (animated Selena logo — logo→raster brief)."""
```

Create `tests/brand/__init__.py` empty (0 bytes).

- [ ] **Step 2: Write the failing test**

Create `tests/brand/test_logo_poses.py`:

```python
from tools.brand.logo_poses import BG_KEY, POSES, Pose, prompt


def test_registry_is_exactly_the_three_paid_poses():
    assert set(POSES) == {"wave", "cheer", "groove"}
    assert "rest" not in POSES  # rest = reused iris.png, never generated
    for pid, pose in POSES.items():
        assert isinstance(pose, Pose)
        assert pose.id == pid
        assert pose.pose_line


def test_prompt_carries_anchor_pose_and_guards():
    p = prompt(POSES["wave"])
    assert "same one-eyed EyeBot mascot" in p       # identity anchor
    assert POSES["wave"].pose_line in p              # the pose line
    assert BG_KEY in p                               # keyable background
    low = p.lower()
    assert "no text" in low and "no watermark" in low
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m pytest tests/brand/test_logo_poses.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.brand.logo_poses'`

- [ ] **Step 4: Write the registry**

Create `tools/brand/logo_poses.py`:

```python
"""EyeBot animated-logo pose registry — the single source of truth for the paid
Selena pose frames (logo→raster brief, 2026-07-07). Pure data + a prompt builder;
no I/O, no network.

`rest` is deliberately NOT here: the rest frame is the existing /brand/iris.png,
reused free. Each pose is a whole-image expression/tilt variant of the one-eyed
Iris mascot (D9: Selena IS Iris — no limbs, no hair), anchored to iris.png at
generation time (reference=True). Prompts render on a flat chroma background that
the keying step (tools/brand/keying.py) removes to restore transparency."""
from __future__ import annotations

from dataclasses import dataclass

BG_KEY = "#00B140"  # flat chroma-green backdrop for keying (absent from the teal/cream mascot)

_ANCHOR = (
    "The same one-eyed EyeBot mascot as the reference image — a soft, rounded, "
    "hairless teal-and-cream character with a single large friendly eye and a calm "
    "gentle smile, identical proportions, colours, and rendering to the reference."
)
_FRAME = (
    f"Full body centered, plain flat solid chroma-green ({BG_KEY}) background, soft "
    "even lighting. No text, no border, no watermark, no extra characters."
)


@dataclass(frozen=True)
class Pose:
    id: str
    pose_line: str


POSES: dict[str, Pose] = {
    "wave": Pose("wave", "Leaning to one side in a warm friendly 'hello' tilt, the eye bright and welcoming."),
    "cheer": Pose("cheer", "Delighted, the eye happily crinkled into a cheerful upward curve, beaming."),
    "groove": Pose("groove", "Leaning with a playful dynamic bounce, mid-groove, lively and buoyant."),
}


def prompt(pose: Pose) -> str:
    """The full approved flash prompt for one pose (anchor + pose line + frame)."""
    return f"{_ANCHOR} {pose.pose_line} {_FRAME}"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/brand/test_logo_poses.py -q`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add tools/brand/__init__.py tools/brand/logo_poses.py tests/brand/__init__.py tests/brand/test_logo_poses.py
git commit -m "feat(brand): logo pose registry + prompt builder (logo→raster brief)"
```

---

### Task 2: Chroma-key + normalize (pure PIL)

**Files:**
- Create: `tools/brand/keying.py`
- Test: `tests/brand/test_keying.py`

- [ ] **Step 1: Write the failing test**

Create `tests/brand/test_keying.py`:

```python
from PIL import Image

from tools.brand.keying import _hex_rgb, key_out, normalize_512


def _subject_on_chroma(size: int = 64, bg: str = "#00B140") -> Image.Image:
    img = Image.new("RGBA", (size, size), (*_hex_rgb(bg), 255))
    for x in range(size // 4, size * 3 // 4):      # opaque red square = the "subject"
        for y in range(size // 4, size * 3 // 4):
            img.putpixel((x, y), (220, 30, 30, 255))
    return img


def test_key_out_clears_corners_keeps_subject():
    keyed = key_out(_subject_on_chroma(), "#00B140")
    assert keyed.getpixel((0, 0))[3] == 0        # corner background → transparent
    assert keyed.getpixel((32, 32))[3] == 255    # subject centre stays opaque


def test_normalize_returns_centered_square():
    out = normalize_512(key_out(_subject_on_chroma(), "#00B140"))
    assert out.size == (512, 512)
    assert out.mode == "RGBA"
    assert out.getpixel((256, 256))[3] == 255    # subject centred, opaque
    assert out.getpixel((2, 2))[3] == 0          # margin stays transparent
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/brand/test_keying.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.brand.keying'`

- [ ] **Step 3: Write the implementation**

Create `tools/brand/keying.py`:

```python
"""Restore transparency to opaque flash renders (logo→raster brief).

Flash-image can't emit alpha (D12): poses come back opaque on a flat chroma
backdrop. `key_out` floods that backdrop to transparent from the corners;
`normalize_512` trims to the subject and letterboxes onto the iris.png 512²
canvas so pose frames register with the rest frame. Pure PIL — dev/asset-build
only, no new prod dependency."""
from __future__ import annotations

from collections import deque

from PIL import Image


def _hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def key_out(img: Image.Image, bg_hex: str, tol: int = 48) -> Image.Image:
    """Flood-fill the flat background to alpha=0 from all four corners.

    4-connected BFS over pixels within `tol` (max per-channel distance) of the
    background colour, seeded from the corners. Only the contiguous background is
    removed — same-coloured pixels enclosed by the subject are kept."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    br, bg, bb = _hex_rgb(bg_hex)
    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def close(r: int, g: int, b: int) -> bool:
        return abs(r - br) <= tol and abs(g - bg) <= tol and abs(b - bb) <= tol

    for cx, cy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        idx = cy * w + cx
        if not seen[idx]:
            r, g, b, _ = px[cx, cy]
            if close(r, g, b):
                seen[idx] = 1
                q.append((cx, cy))
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                r, g, b, a = px[nx, ny]
                if a != 0 and close(r, g, b):
                    seen[ny * w + nx] = 1
                    q.append((nx, ny))
    return img


def normalize_512(img: Image.Image, canvas: int = 512, margin: float = 0.06) -> Image.Image:
    """Trim to the opaque subject, centre it, and letterbox onto a transparent
    square canvas so every pose shares the iris.png framing/scale."""
    img = img.convert("RGBA")
    bbox = img.getbbox()          # bbox of the non-transparent region
    if bbox:
        img = img.crop(bbox)
    sw, sh = img.size
    inner = int(canvas * (1 - 2 * margin))
    scale = min(inner / sw, inner / sh)
    img = img.resize((max(1, round(sw * scale)), max(1, round(sh * scale))), Image.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(img, ((canvas - img.width) // 2, (canvas - img.height) // 2), img)
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/brand/test_keying.py -q`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/brand/keying.py tests/brand/test_keying.py
git commit -m "feat(brand): chroma-key to alpha + 512 normalize for logo poses"
```

---

### Task 3: Paid generator + placeholders + placeholder assets

**Files:**
- Create: `tools/brand/generate_poses.py`
- Create: `tools/brand/make_pose_placeholders.py`
- Create: `frontend/public/brand/poses/{wave,cheer,groove}.webp` (generated by the placeholder script)
- Test: `tests/brand/test_generate_poses.py`

- [ ] **Step 1: Write the failing test**

Create `tests/brand/test_generate_poses.py`:

```python
from tools.brand import generate_poses as G


def test_estimate_covers_every_pose():
    rows = G.build_estimate()
    assert len(rows) == 3
    for pid, prompt in rows:
        assert pid and prompt
        assert "no text" in prompt.lower()


def test_uses_flash_model():
    assert G.MODEL.endswith("flash-image")


def test_generate_refuses_in_mock_mode(monkeypatch):
    import pytest
    monkeypatch.setattr(G, "MOCK_MODE", True)
    with pytest.raises(RuntimeError):
        G.generate_one("wave")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/brand/test_generate_poses.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.brand.generate_poses'`

- [ ] **Step 3: Write the generator**

Create `tools/brand/generate_poses.py`:

```python
#!/usr/bin/env python3
"""EyeBot animated-logo poses via Nano-Banana flash — PAID, go-ahead-gated
(logo→raster brief). reference=True (anchored to the Iris mascot), then keyed to
transparency + normalised to 512² so poses register with iris.png. Output lands
in .tmp/logo-poses/ for review; --install copies approved poses into
frontend/public/brand/poses/, overwriting the placeholders.

Usage:
    python tools/brand/generate_poses.py --estimate             # prints prompts, NO calls
    python tools/brand/generate_poses.py --generate [--only wave,cheer]
    python tools/brand/generate_poses.py --install
"""
import argparse
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # repo root, so `tools.*` resolves by path

from PIL import Image

from tools.avatar import generate_sprites
from tools.brand import keying
from tools.brand.logo_poses import BG_KEY, POSES, prompt
from tools.shared.gemini_client import MOCK_MODE

MODEL = generate_sprites.MODELS["flash"]  # nano-banana flash only
PROJECT_ROOT = Path(__file__).resolve().parents[2]
TMP_DIR = PROJECT_ROOT / ".tmp" / "logo-poses"
PUBLIC_DIR = PROJECT_ROOT / "frontend" / "public" / "brand" / "poses"


def build_estimate() -> list[tuple[str, str]]:
    return [(pid, prompt(pose)) for pid, pose in POSES.items()]


def generate_one(pose_id: str) -> Path | None:
    """Render + key + normalise one pose (LIVE + PAID). Refuses in MOCK_MODE."""
    if MOCK_MODE:
        raise RuntimeError("generate_one needs a live GEMINI_API_KEY; refusing to fabricate art in MOCK_MODE")
    data = generate_sprites.generate_image_bytes(prompt(POSES[pose_id]), model=MODEL, reference=True)
    if not data:
        print(f"  [{pose_id}] no image generated")
        return None
    keyed = keying.normalize_512(keying.key_out(Image.open(io.BytesIO(data)), BG_KEY))
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    out = TMP_DIR / f"{pose_id}.png"
    keyed.save(out)
    print(f"  [{pose_id}] saved {out} ({out.stat().st_size:,} bytes, keyed+normalised)")
    return out


def run_estimate() -> None:
    rows = build_estimate()
    print(f"ESTIMATE — {len(rows)} logo pose(s) via {MODEL} (reference=True, keyed to alpha)")
    print("Rough cost: flash image output bills a few cents each; confirm current pricing before the batch.\n")
    for pid, p in rows:
        print(f"— {pid}:\n    {p}\n")


def run_install() -> int:
    """Convert reviewed .tmp/logo-poses/*.png → frontend/public/brand/poses/*.webp (alpha kept)."""
    srcs = sorted(TMP_DIR.glob("*.png"))
    if not srcs:
        print(f"nothing to install — {TMP_DIR} is empty (run --generate first)", file=sys.stderr)
        return 1
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    for src in srcs:
        pid = src.stem
        if pid not in POSES:
            print(f"  skip {src.name} — not a known pose")
            continue
        Image.open(src).convert("RGBA").save(PUBLIC_DIR / f"{pid}.webp", "WEBP", quality=88)
        print(f"  installed /brand/poses/{pid}.webp")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate EyeBot logo poses (paid; go-ahead only).")
    ap.add_argument("--estimate", action="store_true", help="Print prompts + count. No API calls.")
    ap.add_argument("--generate", action="store_true", help="Generate poses into .tmp/logo-poses/ (PAID).")
    ap.add_argument("--install", action="store_true", help="Copy reviewed poses into frontend/public/brand/poses/.")
    ap.add_argument("--only", default="", help="Comma-separated pose ids (default: all).")
    args = ap.parse_args()

    if args.install:
        return run_install()
    if not args.generate:
        run_estimate()
        return 0
    if MOCK_MODE:
        print("ERROR: no GEMINI_API_KEY (MOCK_MODE) — cannot generate real art.", file=sys.stderr)
        return 2
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    ids = [p for p in POSES if not only or p in only]
    print(f"\nGENERATING {len(ids)} pose(s) via {MODEL} into {TMP_DIR} …")
    ok = 0
    for pid in ids:
        try:
            if generate_one(pid):
                ok += 1
        except Exception as e:
            print(f"  [{pid}] FAILED: {type(e).__name__}: {str(e)[:300]}")
    print(f"\nDone: {ok}/{len(ids)} generated. Review {TMP_DIR} before --install.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/brand/test_generate_poses.py -q`
Expected: PASS (3 passed)

- [ ] **Step 5: Write the placeholder script**

Create `tools/brand/make_pose_placeholders.py`:

```python
#!/usr/bin/env python3
"""Clearly-marked placeholder logo poses so the frontend ships green keyless
(logo→raster brief; placeholders-first). Each placeholder is the real iris.png
given a distinct hue-shift + tilt + a faint 'PLACEHOLDER' watermark, so it reads
as Selena-ish but is never mistaken for final art. Replaced by
`generate_poses.py --install` on go-ahead. Keeps alpha (webp RGBA)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from PIL import Image, ImageDraw

from tools.brand.logo_poses import POSES

ROOT = Path(__file__).resolve().parents[2]
IRIS = ROOT / "frontend" / "public" / "brand" / "iris.png"
OUT = ROOT / "frontend" / "public" / "brand" / "poses"
TILT = {"wave": -10.0, "cheer": 0.0, "groove": 9.0}
HUE = {"wave": (1.00, 1.02, 1.00), "cheer": (1.05, 1.05, 0.98), "groove": (0.97, 1.00, 1.06)}


def _tint(img: Image.Image, f: tuple[float, float, float]) -> Image.Image:
    r, g, b, a = img.split()
    r = r.point(lambda v: min(255, int(v * f[0])))
    g = g.point(lambda v: min(255, int(v * f[1])))
    b = b.point(lambda v: min(255, int(v * f[2])))
    return Image.merge("RGBA", (r, g, b, a))


def main() -> int:
    base = Image.open(IRIS).convert("RGBA")
    OUT.mkdir(parents=True, exist_ok=True)
    for pid in POSES:
        im = _tint(base, HUE[pid]).rotate(TILT[pid], resample=Image.BICUBIC, expand=False)
        ImageDraw.Draw(im).text((14, im.height - 30), "PLACEHOLDER", fill=(20, 20, 25, 130))
        im.save(OUT / f"{pid}.webp", "WEBP", quality=88)
        print(f"  placeholder /brand/poses/{pid}.webp")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 6: Generate the placeholder assets and verify they are valid RGBA webp**

Run: `python tools/brand/make_pose_placeholders.py`
Expected output: three `placeholder /brand/poses/<id>.webp` lines.

Run: `python -c "from PIL import Image; import glob; [print(p, Image.open(p).size, Image.open(p).mode) for p in glob.glob('frontend/public/brand/poses/*.webp')]"`
Expected: three files, each `(512, 512) RGBA` (or the iris.png native size in RGBA).

- [ ] **Step 7: Commit**

```bash
git add tools/brand/generate_poses.py tools/brand/make_pose_placeholders.py tests/brand/test_generate_poses.py frontend/public/brand/poses
git commit -m "feat(brand): paid logo-pose generator + placeholder assets (green keyless)"
```

---

### Task 4: `<SelenaLogo>` + CSS + Home integration

**Files:**
- Create: `frontend/src/aurora/components/SelenaLogo.tsx`
- Create: `frontend/src/aurora/brand-mascot.css`
- Modify: `frontend/src/styles/index.css` (add the CSS import after line 7 `@import "../aurora/motion.css";`)
- Modify: `frontend/src/aurora/components/home/GreetingHero.tsx:61-65`
- Modify: `frontend/tests/aurora_assert.mjs` (add a Home mascot assertion)

- [ ] **Step 1: Write the component**

Create `frontend/src/aurora/components/SelenaLogo.tsx`:

```tsx
/* SelenaLogo — the living EyeBot mascot mark (logo→raster brief). Two stacked
   rasters: the rest frame (the homepage iris.png) + one paid pose that cross-fades
   in on a CSS beat, plus an optional live "EyeBot" wordmark. Motion is CSS-only
   (brand-mascot.css) and freezes to the static rest frame under reduced motion.
   Callers size the mark via `size` (inline) or a sizing className (e.g. hm-iris).
   The brand mark is always the DEFAULT Selena, never a student's custom avatar. */
import { useState } from "react";

type Motion = "hello" | "groove" | "idle";
type PoseId = "rest" | "wave" | "cheer" | "groove";

const POSE_SRC: Record<PoseId, string> = {
  rest: "/brand/iris.png",
  wave: "/brand/poses/wave.webp",
  cheer: "/brand/poses/cheer.webp",
  groove: "/brand/poses/groove.webp",
};
// which paid pose each motion cross-fades to on its beat
const SWAP_FOR: Record<Motion, PoseId> = { hello: "wave", groove: "groove", idle: "cheer" };

export function SelenaLogo({
  motion = "idle",
  size,
  circle = false,
  withWordmark = false,
  wordTone = "ink",
  className = "",
}: {
  motion?: Motion;
  size?: number;
  circle?: boolean;
  withWordmark?: boolean;
  wordTone?: "ink" | "white";
  className?: string;
}) {
  const [swapOk, setSwapOk] = useState(true);
  const swap = SWAP_FOR[motion];
  const dim = size ? { width: size, height: size } : undefined;
  return (
    <span
      className={`selena-logo${circle ? " is-circle" : ""} ${className}`.trim()}
      style={dim}
      data-motion={motion}
      data-swap={swapOk ? "on" : "off"}
      data-testid="selena-logo"
    >
      <span className="selena-logo-stage" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="selena-logo-img selena-logo-rest" src={POSE_SRC.rest} alt="" />
        {swapOk && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="selena-logo-img selena-logo-swap"
            src={POSE_SRC[swap]}
            alt=""
            onError={() => setSwapOk(false)}
          />
        )}
      </span>
      {withWordmark && (
        <span className={`selena-logo-wm${wordTone === "white" ? " is-white" : ""}`}>EyeBot</span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Write the CSS**

Create `frontend/src/aurora/brand-mascot.css`:

```css
/* brand-mascot.css — motion for the living EyeBot mascot logo (<SelenaLogo>) and
   the <BrandSplash> loader. CSS-only; every animation freezes to the static rest
   frame under reduced motion. The base sets NO width so it never fights a caller's
   `size` (inline) or sizing className (e.g. .hm-iris). rest holds the box; swap
   overlays it and cross-fades in on the beat (rest fades out inversely, but only
   when a swap frame actually loaded — data-swap="on"). */

.selena-logo { position: relative; display: inline-flex; align-items: center; gap: 9px; line-height: 0; }
.selena-logo-stage { position: relative; width: 100%; height: 100%; display: block; }
.selena-logo.is-circle .selena-logo-stage { border-radius: 50%; overflow: hidden; }
.selena-logo-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
.selena-logo-rest { position: relative; }               /* rest gives the box its height */
.selena-logo.is-circle .selena-logo-img { object-fit: cover; object-position: 50% 42%; }
.selena-logo-swap { opacity: 0; }
.selena-logo-wm { font-weight: 600; letter-spacing: -0.01em; color: var(--ink); line-height: 1; font-size: 1rem; }
.selena-logo-wm.is-white { color: #fff; }

/* HELLO (home): calm; a warm wave beat every ~9s — stage tilt + rest→wave cross-fade. */
.selena-logo[data-motion="hello"] .selena-logo-stage { transform-origin: 50% 92%; animation: sel-wave 9s ease-in-out infinite; }
.selena-logo[data-swap="on"][data-motion="hello"] .selena-logo-swap { animation: sel-swap-beat 9s ease-in-out infinite; }
.selena-logo[data-swap="on"][data-motion="hello"] .selena-logo-rest { animation: sel-rest-beat 9s ease-in-out infinite; }
@keyframes sel-wave { 0%, 78%, 100% { transform: rotate(0deg); } 84% { transform: rotate(-7deg); } 90% { transform: rotate(5deg); } 95% { transform: rotate(-2deg); } }
@keyframes sel-swap-beat { 0%, 80%, 100% { opacity: 0; } 86%, 92% { opacity: 1; } }
@keyframes sel-rest-beat { 0%, 82%, 100% { opacity: 1; } 87%, 91% { opacity: 0; } }

/* GROOVE (splash): energetic, continuous sway + bob + squash; groove pose is the star. */
.selena-logo[data-motion="groove"] .selena-logo-stage { animation: sel-groove 1.5s ease-in-out infinite; }
.selena-logo[data-swap="on"][data-motion="groove"] .selena-logo-swap { opacity: 1; }
.selena-logo[data-swap="on"][data-motion="groove"] .selena-logo-rest { opacity: 0; }
@keyframes sel-groove {
  0%, 100% { transform: translateY(0) rotate(-4deg) scale(1, 1); }
  25% { transform: translateY(-6px) rotate(0deg) scale(0.98, 1.02); }
  50% { transform: translateY(0) rotate(4deg) scale(1, 1); }
  75% { transform: translateY(-4px) rotate(0deg) scale(1.02, 0.98); }
}

/* IDLE (cobrand): restrained breathe + a rare cheer blink (~12s). */
.selena-logo[data-motion="idle"] .selena-logo-stage { animation: sel-breathe 4.6s ease-in-out infinite; }
.selena-logo[data-swap="on"][data-motion="idle"] .selena-logo-swap { animation: sel-cheer-blink 12s ease-in-out infinite; }
.selena-logo[data-swap="on"][data-motion="idle"] .selena-logo-rest { animation: sel-rest-blink 12s ease-in-out infinite; }
@keyframes sel-breathe { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-1px) scale(1.04); } }
@keyframes sel-cheer-blink { 0%, 94%, 100% { opacity: 0; } 96%, 98% { opacity: 1; } }
@keyframes sel-rest-blink { 0%, 95%, 100% { opacity: 1; } 96%, 98% { opacity: 0; } }

/* Reduced motion → only the static rest frame. */
html[data-motion="reduce"] .selena-logo .selena-logo-stage,
html[data-motion="reduce"] .selena-logo .selena-logo-rest,
html[data-motion="reduce"] .selena-logo .selena-logo-swap { animation: none !important; transform: none !important; }
html[data-motion="reduce"] .selena-logo .selena-logo-rest { opacity: 1 !important; }
html[data-motion="reduce"] .selena-logo .selena-logo-swap { opacity: 0 !important; }
@media (prefers-reduced-motion: reduce) {
  .selena-logo .selena-logo-stage, .selena-logo .selena-logo-rest, .selena-logo .selena-logo-swap { animation: none !important; transform: none !important; }
  .selena-logo .selena-logo-rest { opacity: 1 !important; }
  .selena-logo .selena-logo-swap { opacity: 0 !important; }
}

/* BrandSplash — full-screen branded loader (grooving Selena + wordmark). */
.brand-splash { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center;
  background: radial-gradient(120% 120% at 50% 30%, #fff, #eef1fb 70%, #e7ecfb); }
.brand-splash .selena-logo { flex-direction: column; gap: 14px; }
.brand-splash-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
```

- [ ] **Step 3: Import the CSS**

In `frontend/src/styles/index.css`, add after the `@import "../aurora/motion.css";` line:

```css
@import "../aurora/brand-mascot.css";
```

- [ ] **Step 4: Mount on the Home greeting**

In `frontend/src/aurora/components/home/GreetingHero.tsx`, add the import after line 7 (`import { Icon } from "./HomeIcons";`):

```tsx
import { SelenaLogo } from "@/aurora/components/SelenaLogo";
```

Then replace the iris block at lines 61-65:

```tsx
      <div className="hm-iriswrap" aria-hidden>
        <span className="hm-irisfloor" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="hm-iris" src="/brand/iris.png" alt="" width={232} height={232} />
      </div>
```

with:

```tsx
      <div className="hm-iriswrap" aria-hidden>
        <span className="hm-irisfloor" />
        <SelenaLogo motion="hello" className="hm-iris" />
      </div>
```

(The `.hm-iris` class now sizes + bobs the `<SelenaLogo>` root; the wave beat layers on via `brand-mascot.css`. No `home.css` change is needed — `.hm-iris` already carries `width/height/animation`, and `brand-mascot.css` sets no width to conflict.)

- [ ] **Step 5: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build` (from the PowerShell tool, or `npm --prefix frontend run typecheck && npm --prefix frontend run build` from Bash so the guard's CWD stays repo-root)
Expected: typecheck clean, build succeeds.

- [ ] **Step 6: Add the Home harness assertion**

In `frontend/tests/aurora_assert.mjs`, find the first `/dashboard` block. After the existing dashboard assertions near line 136 (the third `await np.goto(base + "/dashboard", …)`), add:

```js
// Animated Selena logo greets on Home (logo→raster brief): the rest frame IS the
// homepage iris.png, running the calm "hello" motion.
const homeLogo = np.locator('[data-testid="selena-logo"]').first();
if ((await homeLogo.count()) < 1) { console.error("FAIL: SelenaLogo missing on the Home greeting"); process.exit(1); }
const homeMotion = await homeLogo.getAttribute("data-motion");
if (homeMotion !== "hello") { console.error(`FAIL: Home SelenaLogo motion is '${homeMotion}', expected 'hello'`); process.exit(1); }
const homeRestSrc = (await homeLogo.locator(".selena-logo-rest").getAttribute("src")) ?? "";
if (!/\/brand\/iris\.png/.test(homeRestSrc)) { console.error(`FAIL: Home SelenaLogo rest frame is not iris.png (src=${homeRestSrc})`); process.exit(1); }
console.log("PASS: Home — animated SelenaLogo (hello) on the iris.png rest frame");
```

- [ ] **Step 7: Run the harness**

Run: `bash scripts/start-harness.sh aurora`
Expected: all assertions PASS, including the new "Home — animated SelenaLogo" line. (Kill any orphaned :3000 node process first if the run reports a stale bundle.)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/aurora/components/SelenaLogo.tsx frontend/src/aurora/brand-mascot.css frontend/src/styles/index.css frontend/src/aurora/components/home/GreetingHero.tsx frontend/tests/aurora_assert.mjs
git commit -m "feat(brand): animated SelenaLogo + brand-mascot.css, mount on Home greeting"
```

---

### Task 5: CoBrand swap + BrandSplash + shell loading boundary

**Files:**
- Create: `frontend/src/aurora/components/BrandSplash.tsx`
- Modify: `frontend/src/aurora/components/CoBrand.tsx:14-17`
- Modify: `frontend/src/app/(shell)/layout.tsx`
- Modify: `frontend/tests/aurora_assert.mjs` (CoBrand assertion at ~line 178, + reduced-motion + splash)

- [ ] **Step 1: Write BrandSplash**

Create `frontend/src/aurora/components/BrandSplash.tsx`:

```tsx
/* BrandSplash — a full-screen branded loader: a grooving Selena + "EyeBot"
   wordmark on a soft Gemini field. Used as the app-shell loading boundary. Motion
   is CSS-only and freezes under reduced motion (via SelenaLogo). */
import { SelenaLogo } from "./SelenaLogo";

export function BrandSplash() {
  return (
    <div className="brand-splash" data-testid="brand-splash" role="status" aria-live="polite">
      <SelenaLogo motion="groove" size={168} withWordmark />
      <span className="brand-splash-sr">Loading EyeBot…</span>
    </div>
  );
}
```

- [ ] **Step 2: Swap the CoBrand mark**

In `frontend/src/aurora/components/CoBrand.tsx`, add after the file's opening (top of the component module, with the other imports — this file currently has no imports, so add it as the first line before the comment or right after it):

```tsx
import { SelenaLogo } from "./SelenaLogo";
```

Then replace the mark image block (lines 14-17):

```tsx
        <span className="aurora-cobrand-mark-wrap" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="aurora-cobrand-mark" src="/brand/iris.png" alt="" />
        </span>
```

with:

```tsx
        <span className="aurora-cobrand-mark-wrap" aria-hidden>
          <SelenaLogo motion="idle" size={26} circle />
        </span>
```

(The wrapper's `::before` Gemini halo stays; the idle breathe + rare cheer-blink now come from `brand-mascot.css`. The old `.aurora-cobrand-mark` CSS rules at `aurora.css:203` and `:1698` are now unused but left in place — do not touch the locked Branding CSS beyond this.)

- [ ] **Step 3: Wire BrandSplash into the app-shell loading boundary**

Replace the entire contents of `frontend/src/app/(shell)/layout.tsx` with:

```tsx
"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { BrandSplash } from "@/aurora/components/BrandSplash";

/* The AURORA shell (Atlas Rail + command palette + drifting mesh) persists
 * across all authenticated routes — App Router layouts don't remount on child
 * navigations. While the shell chunk loads on first paint, show the branded
 * Selena splash (logo→raster brief). */
const AppShell = dynamic(
  () => import("@/aurora/AppShell").then((m) => m.AppShell),
  { ssr: false, loading: () => <BrandSplash /> },
);

export default function ShellLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
```

- [ ] **Step 4: Update the CoBrand harness assertion**

In `frontend/tests/aurora_assert.mjs`, the Tutor-landing CoBrand check currently reads (near line 178):

```js
const ldEb = await np.locator('[data-testid="tutor-landing"] .aurora-cobrand-mark').count();
```

Replace that line with a check for the SelenaLogo mark now inside the lockup:

```js
const ldEb = await np.locator('[data-testid="tutor-landing"] .aurora-cobrand-mark-wrap [data-testid="selena-logo"]').count();
const ldEbSrc = (await np.locator('[data-testid="tutor-landing"] .aurora-cobrand-mark-wrap .selena-logo-rest').getAttribute("src")) ?? "";
if (ldEb >= 1 && !/\/brand\/iris\.png/.test(ldEbSrc)) { console.error(`FAIL: CoBrand mark is not the iris.png Selena (src=${ldEbSrc})`); process.exit(1); }
```

(Leave the existing `ldEb`/`ldSnec` "full lockup" assertion that follows — it now counts the SelenaLogo as the EyeBot mark.)

- [ ] **Step 5: Add a reduced-motion mascot assertion**

In `frontend/tests/aurora_assert.mjs`, in the `/profile` reduced-motion block (after the toggle sets `html[data-motion="reduce"]`, around line 416 where `dm === "reduce"` is confirmed), add before the toggle-off step:

```js
// Under reduced motion the mascot swap frame is fully hidden (static rest only).
await np.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
const swapOpacity = await np.locator('[data-testid="selena-logo"] .selena-logo-swap').first()
  .evaluate((el) => getComputedStyle(el).opacity).catch(() => "0");
if (swapOpacity !== "0") { console.error(`FAIL: SelenaLogo swap not hidden under reduced motion (opacity=${swapOpacity})`); process.exit(1); }
console.log("PASS: reduced motion — SelenaLogo swap frozen (static rest)");
await np.goto(base + "/profile", { waitUntil: "domcontentloaded" });
```

(Note: the `/profile` reduced-motion toggle set `html[data-motion="reduce"]`; navigating within the same page context preserves it. Re-navigate to `/profile` so the subsequent toggle-off assertion still targets the profile toggle.)

- [ ] **Step 6: Add the BrandSplash assertion**

In `frontend/tests/aurora_assert.mjs`, near the top after the first navigation is set up (before the first `/dashboard` goto at line 75), add a fresh-load splash check:

```js
// The branded Selena splash shows while the app-shell chunk loads on first paint.
await np.goto(base + "/dashboard", { waitUntil: "commit" });
const splash = np.locator('[data-testid="brand-splash"]');
try {
  await splash.waitFor({ state: "attached", timeout: 5000 });
  const role = await splash.getAttribute("role");
  if (role !== "status") { console.error(`FAIL: BrandSplash missing role=status (got ${role})`); process.exit(1); }
  if ((await splash.locator('[data-testid="selena-logo"]').count()) < 1) { console.error("FAIL: BrandSplash has no SelenaLogo"); process.exit(1); }
  console.log("PASS: BrandSplash — branded loading boundary with a grooving SelenaLogo");
} catch {
  console.error("FAIL: BrandSplash loading boundary never appeared on first paint");
  process.exit(1);
}
```

- [ ] **Step 7: Typecheck + build + harness**

Run: `npm --prefix frontend run typecheck && npm --prefix frontend run build`
Expected: clean.

Run: `bash scripts/start-harness.sh aurora`
Expected: all assertions PASS, including the new CoBrand, reduced-motion, and BrandSplash lines. If the BrandSplash window proves flaky under the standalone server, debug per superpowers:systematic-debugging (e.g. delay the AppShell chunk via `np.route`) — do not weaken the assertion to always-pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/aurora/components/BrandSplash.tsx frontend/src/aurora/components/CoBrand.tsx "frontend/src/app/(shell)/layout.tsx" frontend/tests/aurora_assert.mjs
git commit -m "feat(brand): SelenaLogo on CoBrand + branded app-shell splash boundary"
```

---

### Task 6: Design-lock entry

**Files:**
- Modify: `docs/design-locks.md`

- [ ] **Step 1: Add the new lock and update the Branding out-of-scope line**

In `docs/design-locks.md`, add a new section (place it after the "Selena preview renderer" lock, before "OSCE patient faces"):

```markdown
## Animated Selena hero logo — LOCKED 2026-07-07 (logo→raster brief)
**Direction**: a **living Selena mascot logo** on three hero surfaces — the Home
greeting, a new full-screen **Splash/loading** screen, and the **CoBrand** lockups —
driven by CSS choreography over **3 paid Nano-Banana-flash pose frames** (`wave`,
`cheer`, `groove`) anchored to `iris.png` (`reference=True`), plus the existing
`iris.png` reused free as the `rest` frame. The component is `<SelenaLogo>` (two
stacked rasters: rest + one pose that cross-fades on a beat) with a live CSS
"EyeBot" wordmark — never baked into a raster. The **mono Spark-Eye** mark
(`Logo.tsx` / `icon.svg`) stays **unchanged** in the rails + favicon / PWA icon;
**Login** stays untouched.
- **Flash can't emit alpha** (D12): poses render opaque on flat chroma-green
  (`#00B140`) and are keyed to transparency + normalised to 512² by a **dev-only**
  PIL pipeline (`tools/brand/keying.py`) so they register with `iris.png`. Fallback
  if a pose halos: place it on a soft circular chip (as the OSCE faces do).
- **Motion** (CSS-only, frozen to static `rest` under reduced motion): Home = calm
  bob + a ~9s wave beat; Splash = continuous groove; CoBrand = restrained breathe +
  a rare ~12s cheer-blink. A missing/failed pose degrades to the calm rest mascot.
- **Approved prompt contract** — flash (`gemini-3.1-flash-image`), `reference=True`:
  > "The same one-eyed EyeBot mascot as the reference image — a soft, rounded,
  > hairless teal-and-cream character with a single large friendly eye and a calm
  > gentle smile, identical proportions, colours, and rendering to the reference.
  > `<pose line>`. Full body centered, plain flat solid chroma-green (#00B140)
  > background, soft even lighting. No text, no border, no watermark, no extra
  > characters."
- **Acceptance criteria when refining**: every surface reads identical to homepage
  `iris.png` (rest IS iris.png); poses keyed + 512²-normalised so swaps don't jump;
  all motion freezes to static rest under `prefers-reduced-motion` / `data-motion=reduce`;
  wordmark is live text; mono Spark-Eye rails + favicon and Login unchanged;
  WCAG-legible, 390px-safe, no layout shift. Regenerate a pose with
  `python tools/brand/generate_poses.py --generate --only <id>` then `--install`.
- **Out of scope**: rails / favicon / PWA icon (mono stays); Login; flipbook
  sequences; any new API/DB/runtime AI; the student-customisation `<Selena>` preview
  renderer (unchanged).
```

Then update the **"Branding / Selena surfacing"** lock's out-of-scope bullet. Find:

```markdown
- **Out of scope**: Login (LOCKED verbatim — no brand added). The **logo → a different
  Selena raster variation** is paid + deferred (ricoe §8) and would break the mono
  Spark-Eye global lock — needs its own brief + paid gen. Uniforms excluded (ricoe §2).
```

Replace the middle sentence so it points at the delivered lock:

```markdown
- **Out of scope**: Login (LOCKED verbatim — no brand added). The **logo → animated
  Selena hero raster** was delivered as its own brief (see the "Animated Selena hero
  logo" lock, 2026-07-07); the mono Spark-Eye rail + favicon lock is preserved.
  Uniforms excluded (ricoe §2).
```

- [ ] **Step 2: Commit**

```bash
git add docs/design-locks.md
git commit -m "docs(design-locks): animated Selena hero logo lock (logo→raster brief)"
```

---

### Task 7: Paid generation → review → install (MANUAL, go-ahead-gated)

**This task fires real paid Gemini image generations. Do NOT run `--generate`/`--install` without the user's explicit go-ahead in the moment** (per CLAUDE.md + `feedback_gemini_placeholders_first`). Everything before this task is green keyless with placeholders.

**Files:**
- Modify: `frontend/public/brand/poses/{wave,cheer,groove}.webp` (placeholder → real)

- [ ] **Step 1: Estimate (no API calls)**

Run: `python tools/brand/generate_poses.py --estimate`
Expected: prints the 3 pose prompts and the count. Confirm the prompts match the approved contract in the design-lock.

- [ ] **Step 2: Get explicit go-ahead**

Ask the user to confirm firing the 3 paid flash generations. Do not proceed without a clear "yes".

- [ ] **Step 3: Generate (PAID)**

Run: `python tools/brand/generate_poses.py --generate`
Expected: `Done: 3/3 generated.` in `.tmp/logo-poses/`. Re-run `--generate --only <id>` for any that dropped on a transient network error.

- [ ] **Step 4: Review the keyed frames**

Open each `.tmp/logo-poses/<id>.png` (they are keyed + 512²-normalised RGBA). Verify: reads unmistakably like `iris.png`; the chroma background is fully removed with clean edges (no green halo); the pose is legible; centred/scaled to match iris.png. If a frame halos, apply the soft-chip fallback (per the design-lock) or regenerate.

- [ ] **Step 5: Install**

Run: `python tools/brand/generate_poses.py --install`
Expected: three `installed /brand/poses/<id>.webp` lines. Confirm they are valid RGBA webp:
`python -c "from PIL import Image; import glob; [print(p, Image.open(p).size, Image.open(p).mode) for p in glob.glob('frontend/public/brand/poses/*.webp')]"`

- [ ] **Step 6: Re-run the full gates on the real art**

Run: `python -m pytest -q`
Expected: all pass (unchanged — assets aren't tested by pytest, but confirm nothing regressed).

Run: `npm --prefix frontend run typecheck && npm --prefix frontend run build && bash scripts/start-harness.sh aurora`
Expected: build clean; harness all-PASS with the real poses. Behaviorally confirm (per `/ship-check`) on the running harness that Home waves, the CoBrand mark reads as Selena, and reduced motion freezes to the static rest.

- [ ] **Step 7: Commit**

```bash
git add frontend/public/brand/poses
git commit -m "feat(brand): install real Nano-Banana Selena logo poses (paid art)"
```

---

## Post-implementation

- Update memory: append the shipped state to `memory/project_ricoe_v2.md` and the `MEMORY.md` index line (the logo→Selena raster brief is now delivered, not deferred).
- Push to `main` only when every gate above is green (pytest + typecheck + build + `aurora` harness). Never ship red.
