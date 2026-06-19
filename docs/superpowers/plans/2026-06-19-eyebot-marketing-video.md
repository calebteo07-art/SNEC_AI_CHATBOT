# EyeBot marketing video — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a finished ~85s, 16:9 1080p mp4 marketing video for EyeBot (IELA 2026) that intercuts real app footage, animated screenshots, and Veo 3.1 AI b-roll, with on-screen captions and a cinematic music bed.

**Architecture:** A deterministic media pipeline built as WAT `tools/`. A single `timeline.py` data module is the source of truth for scenes (timing, captions, source files). Playwright records live app footage (reusing the existing mock/seed harness); ffmpeg animates screenshots and assembles everything; a new `generate_veo_clip.py` calls Veo 3.1 for b-roll. Three human checkpoints gate spend and creative.

**Tech Stack:** Python 3 (`google-genai` 2.0, Pillow, python-dotenv), Node + Playwright (Chromium video capture), ffmpeg 8.1, Veo 3.1 (`veo-3.1-generate-preview`) via the existing `GEMINI_API_KEY`.

**Spec:** `docs/superpowers/specs/2026-06-19-eyebot-marketing-video-design.md`

---

## File structure

| File | Responsibility |
| --- | --- |
| `tools/video/__init__.py` | Package marker |
| `tools/video/timeline.py` | Single source of truth: the 8 scenes (id, time, dur, source, caption, label, file paths) |
| `tools/video/kenburns.py` | Pure function: build an ffmpeg `zoompan` command to animate one screenshot into a clip |
| `tools/video/captions.py` | Render a caption/label to a transparent 1920×1080 PNG (Pillow) |
| `tools/video/cards.py` | Render the brand title card (sc 02) and end card (sc 08) PNGs from logo + text |
| `tools/video/source_music.py` | Acquire a royalty-free track (+ attribution) or synthesize an ffmpeg bed (fallback) |
| `tools/video/assemble.py` | Normalize every segment, overlay captions, xfade-concat, mix music, export master |
| `tools/media/generate_veo_clip.py` | Generate one Veo 3.1 b-roll clip (text- or image-to-video), poll, save mp4 |
| `frontend/tests/_mocks.mjs` | Extracted shared mock/seed helpers (DRY: used by visual_sweep + capture) |
| `frontend/tests/video_capture.mjs` | Playwright harness: record the 4 live feature clips |
| `tests/video/test_timeline.py` | Timeline invariants (duration sum, required fields) |
| `tests/video/test_kenburns.py` | zoompan command builder |
| `tests/video/test_captions.py` | Caption PNG dimensions/output |
| `tests/media/test_generate_veo_clip.py` | Veo config + image-seed arg building (client mocked) |
| `marketing/eyebot_iela_2026.mp4` | **Deliverable** master |
| `.tmp/video/` | Intermediates: `live/`, `broll/`, `stills/`, `captions/`, `segments/`, `music/` (disposable) |

**Working dirs (created in Task 1):** `.tmp/video/{live,broll,stills,captions,segments,music}`, `marketing/`, `tools/video/`, `tests/video/`, `tests/media/`.

---

## Phase 0 — Scaffolding & timeline

### Task 1: Create directories and the video tools package

**Files:**
- Create: `tools/video/__init__.py`, `tests/video/__init__.py`, `tests/media/__init__.py`

- [ ] **Step 1: Make directories**

```bash
mkdir -p tools/video tests/video tests/media marketing \
  .tmp/video/live .tmp/video/broll .tmp/video/stills \
  .tmp/video/captions .tmp/video/segments .tmp/video/music
touch tools/video/__init__.py tests/video/__init__.py tests/media/__init__.py
```

- [ ] **Step 2: Ensure Python deps present**

```bash
python -c "import google.genai, dotenv; print('genai+dotenv ok')"
python -c "import PIL; print('pillow', PIL.__version__)" || pip install pillow
```
Expected: prints versions; installs Pillow only if missing.

- [ ] **Step 3: Commit**

```bash
git add tools/video tests/video tests/media .gitignore
git commit -m "chore(video): scaffold video tools package + working dirs"
```
(If `.tmp/` is not already gitignored, add `.tmp/` to `.gitignore` in this commit.)

---

### Task 2: Timeline data module

The one source of truth. Every other tool reads scenes from here.

**Files:**
- Create: `tools/video/timeline.py`
- Test: `tests/video/test_timeline.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/video/test_timeline.py
from tools.video.timeline import SCENES, total_duration

def test_eight_scenes_in_order():
    assert [s.id for s in SCENES] == ["01","02","03","04","05","06","07","08"]

def test_total_duration_within_window():
    assert 60.0 <= total_duration() <= 90.0

def test_every_scene_has_required_fields():
    for s in SCENES:
        assert s.caption and s.source and s.duration > 0
        assert s.source in {"broll","live","stills","brand"}
```

- [ ] **Step 2: Run it — expect failure**

Run: `python -m pytest tests/video/test_timeline.py -v`
Expected: FAIL (`ModuleNotFoundError: tools.video.timeline`)

- [ ] **Step 3: Implement**

```python
# tools/video/timeline.py
"""Single source of truth for the EyeBot marketing video scenes."""
from dataclasses import dataclass

@dataclass(frozen=True)
class Scene:
    id: str
    duration: float          # seconds on the final timeline
    source: str              # broll | live | stills | brand
    label: str               # small corner feature label ("" = none)
    caption: str             # on-screen caption line(s)
    asset: str               # primary source file (relative to repo root)

SCENES = [
    Scene("01", 8,  "broll", "",            "In ophthalmology, every detail matters.",        ".tmp/video/broll/01_hook.mp4"),
    Scene("02", 4,  "brand", "",            "Meet EyeBot.",                                    ".tmp/video/stills/02_title.png"),
    Scene("03", 14, "live",  "AI Tutor",    "Ask anything — grounded, cited answers.",         ".tmp/video/live/03_chat.mp4"),
    Scene("04", 14, "live",  "Living Eye",  "Explore real anatomy — click any structure.",     ".tmp/video/live/04_livingeye.mp4"),
    Scene("05", 15, "stills","OSCE Station","Run a full OSCE — examine, decide, get marked.",   ".tmp/video/live/05_osce.mp4"),
    Scene("06", 13, "live",  "Flashcards",  "Lock it in with active recall.",                  ".tmp/video/live/06_flashcards.mp4"),
    Scene("07", 6,  "broll", "Oversight",   "Safe by design — faculty stay in the loop.",      ".tmp/video/broll/07_oversight.mp4"),
    Scene("08", 11, "broll", "",            "EyeBot — your AI partner in ophthalmology training.\nA Singapore National Eye Centre initiative.", ".tmp/video/broll/08_close.mp4"),
]

def total_duration() -> float:
    return float(sum(s.duration for s in SCENES))
```

- [ ] **Step 4: Run it — expect pass**

Run: `python -m pytest tests/video/test_timeline.py -v`
Expected: PASS (3 tests). Total duration = 85.0s.

- [ ] **Step 5: Commit**

```bash
git add tools/video/timeline.py tests/video/test_timeline.py
git commit -m "feat(video): scene timeline data module"
```

---

## Phase 1 — Veo b-roll tool

### Task 3: `generate_veo_clip.py` (Veo 3.1, text- and image-to-video)

**Files:**
- Create: `tools/media/generate_veo_clip.py`
- Test: `tests/media/test_generate_veo_clip.py`

- [ ] **Step 1: Write the failing test** (pure helpers; real API never called)

```python
# tests/media/test_generate_veo_clip.py
from tools.media.generate_veo_clip import build_config, build_kwargs, MODEL

def test_config_defaults_landscape_1080p_8s():
    cfg = build_config(seconds="8", resolution="1080p")
    assert cfg.aspect_ratio == "16:9"
    assert cfg.resolution == "1080p"
    assert cfg.duration_seconds == "8"

def test_kwargs_text_to_video_has_no_image():
    kw = build_kwargs("a calm iris", image_path=None, seconds="8", resolution="1080p")
    assert kw["model"] == MODEL
    assert kw["prompt"] == "a calm iris"
    assert "image" not in kw

def test_kwargs_image_to_video_attaches_image(tmp_path):
    p = tmp_path / "seed.png"; p.write_bytes(b"\x89PNG\r\n\x1a\n012345")
    kw = build_kwargs("animate this", image_path=str(p), seconds="8", resolution="1080p")
    assert "image" in kw and kw["image"].mime_type == "image/png"
```

- [ ] **Step 2: Run it — expect failure**

Run: `python -m pytest tests/media/test_generate_veo_clip.py -v`
Expected: FAIL (`ModuleNotFoundError`)

- [ ] **Step 3: Implement**

```python
# tools/media/generate_veo_clip.py
"""Generate one Veo 3.1 b-roll clip via the Gemini API (full premium model).

Text-to-video:
  python -m tools.media.generate_veo_clip --prompt "macro push into an iris" \
      --out .tmp/video/broll/01_hook.mp4
Image-to-video (seed from EyeBot's own imagery):
  python -m tools.media.generate_veo_clip --prompt "slow drift, light flares" \
      --image frontend/public/<eye>.png --out .tmp/video/broll/01_hook.mp4
"""
import argparse, mimetypes, os, sys, time
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types

MODEL = "veo-3.1-generate-preview"   # full premium tier

def build_config(seconds="8", resolution="1080p", aspect="16:9"):
    return types.GenerateVideosConfig(
        aspect_ratio=aspect, resolution=resolution, duration_seconds=str(seconds),
    )

def build_kwargs(prompt, image_path=None, seconds="8", resolution="1080p"):
    kwargs = {"model": MODEL, "prompt": prompt,
              "config": build_config(seconds, resolution)}
    if image_path:
        data = Path(image_path).read_bytes()
        mime = mimetypes.guess_type(image_path)[0] or "image/png"
        kwargs["image"] = types.Image(image_bytes=data, mime_type=mime)
    return kwargs

def generate(prompt, out, image=None, seconds="8", resolution="1080p",
             poll_s=10, timeout_s=900):
    load_dotenv()
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    op = client.models.generate_videos(**build_kwargs(prompt, image, seconds, resolution))
    waited = 0
    while not op.done:
        if waited > timeout_s:
            raise TimeoutError(f"Veo job exceeded {timeout_s}s")
        time.sleep(poll_s); waited += poll_s
        op = client.operations.get(op)
        print(f"  ...{waited}s", file=sys.stderr)
    vid = op.response.generated_videos[0]
    client.files.download(file=vid.video)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    vid.video.save(out)
    print(f"saved {out}")
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--image", default=None)
    ap.add_argument("--seconds", default="8")
    ap.add_argument("--resolution", default="1080p")
    a = ap.parse_args()
    generate(a.prompt, a.out, a.image, a.seconds, a.resolution)

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run it — expect pass**

Run: `python -m pytest tests/media/test_generate_veo_clip.py -v`
Expected: PASS (3 tests). **No network call occurs** — only `build_*` helpers are tested.

- [ ] **Step 5: Commit**

```bash
git add tools/media/generate_veo_clip.py tests/media/test_generate_veo_clip.py
git commit -m "feat(media): Veo 3.1 b-roll generation tool (text + image-to-video)"
```

---

## Phase 2 — Live app capture

### Task 4: Extract shared Playwright mocks (DRY)

Reuse the proven mock/seed logic from `visual_sweep.mjs` instead of duplicating it.

**Files:**
- Create: `frontend/tests/_mocks.mjs`
- Modify: `frontend/tests/visual_sweep.mjs` (import from `_mocks.mjs`)

- [ ] **Step 1:** Move the `J`, `student`, `admin`, `progress`, `mkCase`, `cases`, `mockApis`, and `seededContext` definitions from `visual_sweep.mjs` into `frontend/tests/_mocks.mjs`, exporting each:

```js
// frontend/tests/_mocks.mjs
export const J = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
// ...(student, admin, progress, mkCase, cases verbatim from visual_sweep.mjs)...
export async function mockApis(ctx, user) { /* verbatim body */ }
export async function seededContext(browser, base, user, viewport) { /* verbatim, base now a param */ }
```

- [ ] **Step 2:** In `visual_sweep.mjs`, replace the moved blocks with:

```js
import { J, student, admin, mockApis, seededContext } from "./_mocks.mjs";
```
and update its `seededContext(browser, user)` calls to `seededContext(browser, base, user)`.

- [ ] **Step 3: Verify the existing harness still runs** (needs the app already serving — see Task 5; if not yet built, defer this verification to after Task 5):

Run (from `frontend/`): `node tests/visual_sweep.mjs smoke http://127.0.0.1:3000 /chat`
Expected: prints `custom  /chat ... CLEAN` and writes `smoke-chat.png`.

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/_mocks.mjs frontend/tests/visual_sweep.mjs
git commit -m "refactor(tests): extract shared Playwright mocks for reuse"
```

---

### Task 5: Build + serve the app for capture

**Files:** none (build artifacts only)

- [ ] **Step 1: Build the standalone Next app**

Run (from `frontend/`): `npm run build`
Expected: `.next/standalone/server.js` exists.

- [ ] **Step 2: Stage static assets into standalone** (the known gotcha — standalone omits these)

```bash
cp -r frontend/.next/static frontend/.next/standalone/.next/static
cp -r frontend/public frontend/.next/standalone/public
```

- [ ] **Step 3: Serve (background) and confirm**

```bash
PORT=3000 HOSTNAME=127.0.0.1 node frontend/.next/standalone/server.js &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/chat
```
Expected: `200`. Leave it running for Task 6. (Playwright supplies all `/api` data via mocks, so FastAPI is NOT needed.)

---

### Task 6: Capture the four live feature clips

**Files:**
- Create: `frontend/tests/video_capture.mjs`

Records 1920×1080 Chromium video per feature, performing a real interaction, then closes the context (Playwright finalizes the `.webm`). We transcode/trim to mp4 in Task 7's normalization, but here we also export a same-name `.webm` → `.mp4` for convenience.

- [ ] **Step 1: Write the capture harness**

```js
// frontend/tests/video_capture.mjs
// Usage (app must be serving on :3000):  node tests/video_capture.mjs
import { chromium } from "playwright";
import { mockApis, student } from "./_mocks.mjs";
import { mkdirSync, renameSync, readdirSync } from "fs";
import { join } from "path";

const BASE = "http://127.0.0.1:3000";
const OUT = "../.tmp/video/live";           // relative to frontend/
const VP = { width: 1920, height: 1080 };

async function ctxFor(browser, dir) {
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: VP, recordVideo: { dir, size: VP } });
  await ctx.addInitScript((u) => {
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
    try { indexedDB.deleteDatabase("eyebot"); } catch {}
    localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
    sessionStorage.setItem("eyebot_checkin_session", "1");
    localStorage.setItem("eyebot_tour_seen", "true");
  }, student);
  await ctx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: "127.0.0.1", path: "/" }]);
  await mockApis(ctx, student);
  return ctx;
}

// Each scene: navigate, perform a real interaction, hold a beat, then save the video.
async function record(browser, name, route, interact) {
  const dir = join(OUT, name);
  const ctx = await ctxFor(browser, dir);
  const page = await ctx.newPage();
  await page.goto(BASE + route, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1200);
  await interact(page);
  await page.waitForTimeout(1500);
  await ctx.close();                         // finalizes the webm
  const f = readdirSync(dir).find((x) => x.endsWith(".webm"));
  renameSync(join(dir, f), join(OUT, name + ".webm"));
  console.log("captured", name);
}

const browser = await chromium.launch();

// 03 — AI Tutor: type a simple human question, watch the grounded answer stream in.
await record(browser, "03_chat", "/chat", async (page) => {
  const box = page.locator('textarea, input[type="text"]').first();
  await box.click();
  await box.type("What is a cataract?", { delay: 55 });
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3500);           // answer streams (mock SSE)
});

// 04 — Living Eye: the cases atlas; hover/click a pin.
await record(browser, "04_livingeye", "/cases", async (page) => {
  await page.waitForTimeout(1500);
  const pin = page.locator('[class*="pin"], button, a[href*="/cases/"]').first();
  await pin.hover().catch(() => {});
  await page.waitForTimeout(900);
  await pin.click().catch(() => {});
  await page.waitForTimeout(1200);
});

// 06 — Flashcards: enter a set, flip a card, reveal score.
await record(browser, "06_flashcards", "/flashcards", async (page) => {
  await page.waitForTimeout(1200);
  const start = page.getByRole("button").first();
  await start.click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.keyboard.press("Space").catch(() => {});   // flip
  await page.waitForTimeout(1800);
});

await browser.close();
console.log("live capture complete");
```

- [ ] **Step 2: Run capture** (app serving from Task 5)

Run (from `frontend/`): `node tests/video_capture.mjs`
Expected: prints `captured 03_chat / 04_livingeye / 06_flashcards`; three `.webm` files in `.tmp/video/live/`.

- [ ] **Step 3: Capture the OSCE station (sc 05) live where possible**

Add a fourth `record(...)` call for `/cases/C001` that ticks a checklist item via the exam tray, then re-run. If the station route or interaction selectors don't resolve cleanly, **fall back to stills** (sc 05 `source` is already `stills`): skip the live clip and let Task 8 animate `frontend/final-cases.png` + `frontend/sweep-cases-C001.png`.

```js
// append before browser.close():
await record(browser, "05_osce", "/cases/C001", async (page) => {
  await page.waitForTimeout(1500);
  const action = page.getByText(/Measure IOP/i).first();
  await action.click().catch(() => {});
  await page.waitForTimeout(1600);
});
```

- [ ] **Step 4: Eyeball the clips**

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 .tmp/video/live/03_chat.webm
```
Expected: a few seconds of duration printed for each. Open one to confirm the interaction reads well. (No commit — these are `.tmp/` intermediates.)

- [ ] **Step 5: Stop the server** when captures look good:

```bash
kill %1 2>/dev/null || true
```

---

## Phase 3 — Screenshot motion

### Task 7: Ken Burns clip builder

Animate static screenshots (and any fallback beats) into gently moving 1080p clips.

**Files:**
- Create: `tools/video/kenburns.py`
- Test: `tests/video/test_kenburns.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/video/test_kenburns.py
from tools.video.kenburns import kenburns_cmd

def test_cmd_targets_resolution_and_duration():
    cmd = kenburns_cmd("in.png", "out.mp4", seconds=5, fps=30, zoom_to=1.12)
    s = " ".join(cmd)
    assert "in.png" in s and "out.mp4" in s
    assert "zoompan" in s and "1920x1080" in s
    assert cmd[0] == "ffmpeg"
    assert "150" in s   # 5s * 30fps frames
```

- [ ] **Step 2: Run — expect failure**

Run: `python -m pytest tests/video/test_kenburns.py -v`
Expected: FAIL (`ModuleNotFoundError`)

- [ ] **Step 3: Implement**

```python
# tools/video/kenburns.py
"""Build an ffmpeg command that animates a still image into a 1080p clip."""

def kenburns_cmd(img, out, seconds=5, fps=30, zoom_to=1.12):
    frames = int(round(seconds * fps))
    # Upscale first so zoompan has pixels to work with; slow linear zoom-in, centered.
    vf = (
        "scale=3840:-1,"
        f"zoompan=z='min(zoom+0.0006,{zoom_to})':"
        f"d={frames}:fps={fps}:"
        "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080,"
        "format=yuv420p"
    )
    return ["ffmpeg", "-y", "-loop", "1", "-i", img, "-vf", vf,
            "-t", str(seconds), "-r", str(fps), "-c:v", "libx264",
            "-pix_fmt", "yuv420p", out]
```

- [ ] **Step 4: Run — expect pass**

Run: `python -m pytest tests/video/test_kenburns.py -v`
Expected: PASS.

- [ ] **Step 5: Smoke-render one real clip**

```bash
python - <<'PY'
import subprocess
from tools.video.kenburns import kenburns_cmd
subprocess.run(kenburns_cmd("frontend/final-cases.png", ".tmp/video/stills/05_osce_kb.mp4", seconds=15), check=True)
PY
ffprobe -v error -show_entries stream=width,height -of csv=p=0:s=x .tmp/video/stills/05_osce_kb.mp4
```
Expected: `1920x1080`.

- [ ] **Step 6: Commit**

```bash
git add tools/video/kenburns.py tests/video/test_kenburns.py
git commit -m "feat(video): ken burns clip builder for screenshot beats"
```

---

## Phase 4 — Captions & brand cards

### Task 8: Caption / label PNG renderer

**Files:**
- Create: `tools/video/captions.py`
- Test: `tests/video/test_captions.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/video/test_captions.py
from PIL import Image
from tools.video.captions import render_caption

def test_caption_png_is_1080p_rgba(tmp_path):
    out = tmp_path / "cap.png"
    render_caption("Ask anything — grounded, cited answers.", str(out), label="AI Tutor")
    im = Image.open(out)
    assert im.size == (1920, 1080)
    assert im.mode == "RGBA"
```

- [ ] **Step 2: Run — expect failure**

Run: `python -m pytest tests/video/test_captions.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement** (lower-third caption + optional top-left feature label; transparent elsewhere)

```python
# tools/video/captions.py
"""Render an on-screen caption (+ optional feature label) to a 1920x1080 RGBA PNG."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
INK = (12, 18, 28, 255)
SCRIM = (255, 255, 255, 210)
ACCENT = (37, 99, 235, 255)

def _font(size, bold=False):
    for name in (("arialbd.ttf" if bold else "arial.ttf"),
                 "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()

def render_caption(text, out, label="", font_path=None):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    big = ImageFont.truetype(font_path, 58) if font_path else _font(58, bold=True)
    small = _font(30, bold=True)
    lines = text.split("\n")

    # Lower-third scrim
    pad, lh = 64, 74
    block_h = lh * len(lines) + pad
    y0 = H - block_h - 96
    d.rounded_rectangle([96, y0, W - 96, y0 + block_h], radius=24, fill=SCRIM)
    ty = y0 + pad // 2
    for ln in lines:
        d.text((140, ty), ln, font=big, fill=INK)
        ty += lh

    # Feature label pill (top-left)
    if label:
        tw = d.textlength(label, font=small)
        d.rounded_rectangle([96, 84, 96 + tw + 56, 84 + 56], radius=28, fill=ACCENT)
        d.text((124, 98), label, font=small, fill=(255, 255, 255, 255))

    im.save(out)
    return out
```

- [ ] **Step 4: Run — expect pass**

Run: `python -m pytest tests/video/test_captions.py -v`
Expected: PASS.

- [ ] **Step 5: Render all caption PNGs from the timeline**

```bash
python - <<'PY'
from tools.video.timeline import SCENES
from tools.video.captions import render_caption
for s in SCENES:
    render_caption(s.caption, f".tmp/video/captions/{s.id}.png", label=s.label)
print("captions rendered")
PY
```
Expected: eight PNGs in `.tmp/video/captions/`.

- [ ] **Step 6: Commit**

```bash
git add tools/video/captions.py tests/video/test_captions.py
git commit -m "feat(video): caption + feature-label PNG renderer"
```

---

### Task 9: Brand title card (sc 02) and end card (sc 08)

**Files:**
- Create: `tools/video/cards.py`

- [ ] **Step 1: Locate the logo asset**

```bash
ls frontend/public | grep -iE "logo|eye|spark|mark" || ls frontend/public
```
Use the EyeBot spark-eye logo PNG found here as `LOGO`. If none, render the wordmark as text (fallback path in the code below handles a missing logo).

- [ ] **Step 2: Implement** (renders two 1920×1080 PNGs on the light aurora surface)

```python
# tools/video/cards.py
"""Render the brand title card and end card as 1920x1080 PNGs."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
BG = (247, 249, 252, 255)
INK = (12, 18, 28, 255)
MUTE = (90, 102, 120, 255)

def _font(size, bold=True):
    for n in (("arialbd.ttf" if bold else "arial.ttf"), "DejaVuSans-Bold.ttf"):
        try: return ImageFont.truetype(n, size)
        except OSError: continue
    return ImageFont.load_default()

def _center(d, text, font, y, fill):
    tw = d.textlength(text, font=font)
    d.text(((W - tw) / 2, y), text, font=font, fill=fill)

def _logo(im, logo_path, cy, box=300):
    if logo_path and Path(logo_path).exists():
        lg = Image.open(logo_path).convert("RGBA")
        lg.thumbnail((box, box))
        im.alpha_composite(lg, ((W - lg.width) // 2, cy - lg.height // 2))

def title_card(out, logo_path=None):
    im = Image.new("RGBA", (W, H), BG); d = ImageDraw.Draw(im)
    _logo(im, logo_path, 430)
    _center(d, "Meet EyeBot.", _font(76), 640, INK)
    im.save(out); return out

def end_card(out, logo_path=None):
    im = Image.new("RGBA", (W, H), BG); d = ImageDraw.Draw(im)
    _logo(im, logo_path, 380, box=260)
    _center(d, "EyeBot", _font(92), 540, INK)
    _center(d, "Your AI partner in ophthalmology training.", _font(44, bold=False), 660, INK)
    _center(d, "A Singapore National Eye Centre initiative.", _font(32, bold=False), 740, MUTE)
    im.save(out); return out
```

- [ ] **Step 3: Render the cards**

```bash
python - <<'PY'
from tools.video.cards import title_card, end_card
LOGO = "frontend/public/REPLACE_WITH_LOGO.png"   # from Step 1; or None
title_card(".tmp/video/stills/02_title.png", LOGO)
end_card(".tmp/video/stills/08_end.png", LOGO)
print("cards rendered")
PY
```
Expected: two PNGs. Open both; confirm logo + text are centered and legible. (If the SNEC logo is supplied later, drop it into the end card via an added `_logo` call.)

- [ ] **Step 4: Commit**

```bash
git add tools/video/cards.py
git commit -m "feat(video): brand title + end card renderer"
```

---

## Phase 5 — Music

### Task 10: Source the music bed — **CHECKPOINT 2**

**Files:**
- Create: `tools/video/source_music.py`
- Modify: `frontend/ATTRIBUTIONS.md` (append the track credit)

- [ ] **Step 1: Implement a synthesized-bed fallback + a download slot**

```python
# tools/video/source_music.py
"""Provide an ~85s cinematic music bed at .tmp/video/music/bed.mp3.

Primary path: a royalty-free track is placed at .tmp/video/music/bed.mp3 (downloaded
or supplied) and credited in frontend/ATTRIBUTIONS.md.
Fallback: synthesize a soft ambient pad with ffmpeg (no licensing required).
"""
import subprocess, sys

def synth_bed(out=".tmp/video/music/bed.mp3", seconds=86):
    # Two detuned sine pads + slow tremolo, gentle low-pass, long fades.
    f = (f"sine=frequency=220:duration={seconds},"
         "aformat=channel_layouts=stereo,"
         "tremolo=f=0.15:d=0.5,lowpass=f=1200,volume=0.25,"
         f"afade=t=in:st=0:d=3,afade=t=out:st={seconds-4}:d=4")
    subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", f, "-c:a", "libmp3lame", out], check=True)
    return out

if __name__ == "__main__":
    synth_bed()
    print("synth bed written")
```

- [ ] **Step 2: Attempt to source a real royalty-free cinematic track**

Try to download one ~85s cinematic/inspiring track licensed for reuse (e.g. a Pixabay/Mixkit free-license URL) to `.tmp/video/music/bed.mp3`. If the network blocks it or licensing is unclear, run the fallback:

```bash
python -m tools.video.source_music   # writes the synthesized bed
ffprobe -v error -show_entries format=duration -of csv=p=0 .tmp/video/music/bed.mp3
```
Expected: ~86s duration.

- [ ] **Step 3 — CHECKPOINT 2 (human):** Play `.tmp/video/music/bed.mp3`. Confirm the track (or synth bed) before it is baked into the cut. If a real track is used, append its title/author/license/URL to `frontend/ATTRIBUTIONS.md`.

- [ ] **Step 4: Commit** (attribution only; the audio file is a `.tmp/` intermediate)

```bash
git add tools/video/source_music.py frontend/ATTRIBUTIONS.md
git commit -m "feat(video): music bed sourcing tool + attribution"
```

---

## Phase 6 — Generate b-roll

### Task 11: Veo b-roll prompts — **CHECKPOINT 1** then generate

**Files:** none (produces `.tmp/video/broll/*.mp4`)

- [ ] **Step 1: Pick seed images for image-to-video** (hook + close stay on-brand)

```bash
ls frontend/public | grep -iE "eye|login|atlas|fundus|iris" || true
```
Choose an existing eye image as the seed for scene 01 (hook) and scene 08 (close).

- [ ] **Step 2 — CHECKPOINT 1 (human):** Review these four prompts (full premium `veo-3.1-generate-preview`, 1080p, 8s each) **before spending**. Estimated ≈ $13 for 4 clips. Adjust wording, then approve.

  - **01 hook** (image-to-video, eye seed): "Extreme macro of a human iris, cinematic, shallow depth of field, slow gentle push-in, soft volumetric light flares, photoreal, clinical yet beautiful, no text."
  - **07 oversight** (text-to-video): "A focused ophthalmology educator at a modern clinic workstation reviewing data on screen, warm soft window light, shallow focus, documentary realism, no readable text on screen."
  - **08 close** (image-to-video, eye seed): "Abstract aurora light and an iris motif slowly resolving into calm negative space, soft teal-and-blue gradient bokeh, serene, cinematic, leaving clean room for a logo, no text."
  - **(optional) accent** (text-to-video): "Soft abstract aurora light texture drifting slowly, teal and blue, out of focus, seamless, no subjects, no text." → `.tmp/video/broll/accent.mp4` (only if a transition needs it).

- [ ] **Step 3: Generate the approved clips**

```bash
python -m tools.media.generate_veo_clip --image frontend/public/<EYE_SEED>.png \
  --prompt "Extreme macro of a human iris, cinematic, shallow depth of field, slow gentle push-in, soft volumetric light flares, photoreal, no text." \
  --out .tmp/video/broll/01_hook.mp4

python -m tools.media.generate_veo_clip \
  --prompt "A focused ophthalmology educator at a modern clinic workstation reviewing data, warm soft light, shallow focus, documentary realism, no readable text." \
  --out .tmp/video/broll/07_oversight.mp4

python -m tools.media.generate_veo_clip --image frontend/public/<EYE_SEED>.png \
  --prompt "Abstract aurora light and an iris motif resolving into calm negative space, soft teal-and-blue bokeh, serene, cinematic, room for a logo, no text." \
  --out .tmp/video/broll/08_close.mp4
```
Expected: three mp4s in `.tmp/video/broll/`, each ~8s, 1920×1080.

- [ ] **Step 4: Anatomy/brand gate** (per project imagery standard): view each clip. Reject "wrong-but-pretty" anatomy. If a clip is off, tighten the prompt or change the seed and regenerate that one clip only. (No commit — `.tmp/` intermediates.)

---

## Phase 7 — Assemble

### Task 12: Assembly tool (normalize → caption → xfade-concat → music → export)

**Files:**
- Create: `tools/video/assemble.py`

This is the integrator. It builds each scene's normalized, captioned 8/14/15s segment, then crossfades them in order and mixes the music bed.

- [ ] **Step 1: Implement the segment normalizer**

```python
# tools/video/assemble.py
"""Assemble the EyeBot marketing master from per-scene assets."""
import subprocess, os
from pathlib import Path
from tools.video.timeline import SCENES, total_duration
from tools.video.kenburns import kenburns_cmd

FPS, W, H = 30, 1920, 1080
SEG = ".tmp/video/segments"
CAP = ".tmp/video/captions"
XFADE = 0.6   # seconds of dissolve between scenes

def _run(cmd):
    subprocess.run(cmd, check=True)

def _source_clip(s):
    """Return a path to a raw (uncaptioned) clip of exactly s.duration at 1080p/30."""
    raw = f"{SEG}/{s.id}_raw.mp4"
    if s.source in ("broll", "live"):
        # Trim/scale the captured/generated clip to duration; loop if too short.
        _run(["ffmpeg","-y","-stream_loop","-1","-i",s.asset,"-t",str(s.duration),
              "-vf",f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},format=yuv420p",
              "-an","-c:v","libx264","-pix_fmt","yuv420p",raw])
    else:  # stills / brand → ken burns from a PNG
        png = s.asset if s.asset.endswith(".png") else s.asset
        _run(kenburns_cmd(png, raw, seconds=s.duration, fps=FPS))
    return raw

def _caption_segment(s, raw):
    """Overlay caption PNG (fade in/out) onto the raw clip → final segment."""
    seg = f"{SEG}/{s.id}.mp4"
    cap = f"{CAP}/{s.id}.png"
    d = s.duration
    fc = (f"[0:v]format=yuv420p[v];"
          f"[1:v]format=rgba,fade=t=in:st=0.3:d=0.5:alpha=1,"
          f"fade=t=out:st={d-0.8}:d=0.6:alpha=1[c];"
          f"[v][c]overlay=0:0:format=auto,"
          f"fade=t=in:st=0:d=0.4,fade=t=out:st={d-0.5}:d=0.5[o]")
    _run(["ffmpeg","-y","-i",raw,"-i",cap,"-filter_complex",fc,"-map","[o]",
          "-t",str(d),"-r",str(FPS),"-c:v","libx264","-pix_fmt","yuv420p",seg])
    return seg
```

- [ ] **Step 2: Implement the xfade concat + music mux + `main()`**

```python
# (append to tools/video/assemble.py)

def _xfade_concat(segments, out):
    """Crossfade-chain N segments into one silent video."""
    inputs = []
    for seg in segments:
        inputs += ["-i", seg]
    # Build a chain: v0 x v1 -> x1; x1 x v2 -> x2; ...
    durs = [s.duration for s in SCENES]
    filt, prev, offset = [], "[0:v]", 0.0
    for i in range(1, len(segments)):
        offset += durs[i-1] - XFADE
        label = f"[x{i}]"
        filt.append(f"{prev}[{i}:v]xfade=transition=fade:duration={XFADE}:offset={offset:.2f}{label}")
        prev = label
    fc = ";".join(filt)
    _run(["ffmpeg","-y",*inputs,"-filter_complex",fc,"-map",prev,
          "-r",str(FPS),"-c:v","libx264","-pix_fmt","yuv420p",out])
    return out

def _add_music(silent, music, out):
    total = total_duration() - XFADE*(len(SCENES)-1)
    _run(["ffmpeg","-y","-i",silent,"-i",music,
          "-filter_complex",f"[1:a]atrim=0:{total:.2f},afade=t=out:st={total-4:.2f}:d=4[a]",
          "-map","0:v","-map","[a]","-c:v","copy","-c:a","aac","-b:a","192k",
          "-movflags","+faststart","-shortest",out])
    return out

def main(out="marketing/eyebot_iela_2026.mp4", music=".tmp/video/music/bed.mp3"):
    Path(SEG).mkdir(parents=True, exist_ok=True)
    segs = []
    for s in SCENES:
        raw = _source_clip(s)
        segs.append(_caption_segment(s, raw))
    silent = f"{SEG}/_silent.mp4"
    _xfade_concat(segs, silent)
    Path("marketing").mkdir(exist_ok=True)
    _add_music(silent, music, out)
    print("master:", out)

if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Render the ROUGH CUT**

Run: `python -m tools.video.assemble`
Expected: `marketing/eyebot_iela_2026.mp4` is created.

```bash
ffprobe -v error -show_entries format=duration:stream=width,height -of default=noprint_wrappers=1 marketing/eyebot_iela_2026.mp4
```
Expected: width=1920, height=1080, duration ≈ 81s (85 − 0.6×7 xfade overlaps).

- [ ] **Step 4 — CHECKPOINT 3 (human):** Watch the full master. Check: each feature is legible, captions readable and timed, transitions smooth, music synced and ducked, end card holds. Note any per-scene fixes (timing, which clip, caption wording).

- [ ] **Step 5: Apply fixes and re-render.** Adjust `timeline.py` durations/captions or swap an asset, then re-run `python -m tools.video.assemble`. Repeat until approved.

- [ ] **Step 6: Commit the tool**

```bash
git add tools/video/assemble.py
git commit -m "feat(video): ffmpeg assembly pipeline (normalize, caption, xfade, music)"
```

---

## Phase 8 — Deliver

### Task 13: Final verification & delivery

- [ ] **Step 1: Validate the master**

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,codec_name \
  -of default=noprint_wrappers=1 marketing/eyebot_iela_2026.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 marketing/eyebot_iela_2026.mp4
```
Expected: `codec_name=h264`, `1920x1080`, `30/1`, duration in the 60–90s window.

- [ ] **Step 2: Confirm the deliverable plays** start-to-finish with audio (spot-check first/last 3s).

- [ ] **Step 3: Commit the master + a short README**

```bash
git add marketing/eyebot_iela_2026.mp4
git commit -m "feat(marketing): EyeBot IELA 2026 marketing video master (1080p)"
```
(If the mp4 is large, note it for the user — they may prefer Drive upload over committing the binary. Decide at delivery.)

- [ ] **Step 4: Hand off** — surface the file path and offer to upload to Drive alongside the IELA pitch PDF in `proposal/`.

---

## Self-review notes (author)

- **Spec coverage:** hook→4 features→oversight→close (Task 12 + timeline) ✓; live capture mix (Tasks 5–6) ✓; screenshot animation (Task 7) ✓; Veo full-premium b-roll w/ image-to-video (Tasks 3, 11) ✓; captions+music, no VO (Tasks 8, 10, 12) ✓; SNEC end card (Task 9) ✓; 16:9 1080p master (Tasks 12–13) ✓; three checkpoints (Tasks 10, 11, 12) ✓; cataract question (Task 6) ✓; output to `marketing/` + `.tmp/` intermediates (Task 1) ✓.
- **Fallbacks wired:** OSCE live→stills (Task 6 Step 3); music download→synth (Task 10); off-brand Veo clip→regenerate/stills (Task 11 Step 4).
- **Risk:** exact in-app selectors (chat textarea, flashcard start/flip, pin) may differ; capture steps use tolerant locators and a stills fallback so a selector miss never blocks the deliverable.
