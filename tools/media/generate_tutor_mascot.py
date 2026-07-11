#!/usr/bin/env python3
"""Veo tutor-mascot loop — PAID, go-ahead-gated. Image-to-video from iris.png.

Heavily gated like the greeting loop: --probe (cheap) and --estimate (no calls)
first; --generate spends; --install copies the reviewed clip into the web app.
Refuses in MOCK_MODE.

Usage:
    python tools/media/generate_tutor_mascot.py --probe
    python tools/media/generate_tutor_mascot.py --estimate
    python tools/media/generate_tutor_mascot.py --generate --model <id>
    python tools/media/generate_tutor_mascot.py --install
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tools.media.tutor_mascot import ASPECT, CANDIDATE_MODELS, IMAGE_REF, PROMPT
from tools.shared.gemini_client import MOCK_MODE, _API_KEYS

ROOT = Path(__file__).resolve().parents[2]
TMP = ROOT / ".tmp" / "tutor-mascot"
DEST = ROOT / "frontend" / "public" / "media" / "loops"


def _client():
    from google import genai
    return genai.Client(api_key=_API_KEYS[0])


def run_probe() -> int:
    if MOCK_MODE:
        print("MOCK_MODE — cannot probe; candidates:", ", ".join(CANDIDATE_MODELS))
        return 2
    c = _client()
    hits = [m.name for m in c.models.list() if "veo" in (m.name or "").lower()]
    print("Veo models on this key:", hits or "(none found)")
    return 0 if hits else 1


def _build_frame() -> Path:
    """Center the transparent iris.png on a soft ivory spotlight (matches .aurora-chat),
    16:9 with the mascot CENTERED and generous margin so a square center-crop always
    contains the dance. This is the conditioning first/last frame (and the poster)."""
    from PIL import Image, ImageFilter

    W, H = 1280, 720
    canvas = (0xF2, 0xF0, 0xE8)   # tutor ivory (.aurora-chat gradient top)
    edge = (0xEB, 0xE9, 0xE0)     # tutor ivory (gradient bottom)

    def _mix(a, b, t):
        return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

    GW, GH = 192, 108
    cx, cy = 0.5 * GW, 0.42 * GH      # spotlight centred, a touch high
    rx, ry = 0.62 * GW, 0.72 * GH
    small = Image.new("RGB", (GW, GH))
    sp = small.load()
    for y in range(GH):
        for x in range(GW):
            d = (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2) ** 0.5
            sp[x, y] = _mix(canvas, edge, min(1.0, d))
    bg = small.resize((W, H), Image.LANCZOS).convert("RGBA")

    mascot = Image.open(IMAGE_REF).convert("RGBA")
    target_h = int(H * 0.62)
    scale = target_h / mascot.height
    m = mascot.resize((round(mascot.width * scale), target_h), Image.LANCZOS)
    mx = W // 2 - m.width // 2
    my = int(H * 0.52) - m.height // 2
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = Image.new("RGBA", (int(m.width * 0.8), 48), (70, 40, 22, 80))
    shadow.paste(sd, (mx + (m.width - sd.width) // 2, my + m.height - 22), sd)
    shadow = shadow.filter(ImageFilter.GaussianBlur(15))
    bg.alpha_composite(shadow)
    bg.alpha_composite(m, (mx, my))

    TMP.mkdir(parents=True, exist_ok=True)
    frame = TMP / "tutor-frame.jpg"
    bg.convert("RGB").save(frame, "JPEG", quality=92)
    bg.convert("RGB").save(TMP / "tutor-mascot.jpg", "JPEG", quality=88)  # poster
    print(f"  built conditioning frame {frame} ({W}x{H}, mascot centred)")
    return frame


def run_generate(model: str) -> int:
    if MOCK_MODE:
        print("ERROR: MOCK_MODE — no key.", file=sys.stderr)
        return 2
    from google.genai import types

    c = _client()
    frame_path = _build_frame()
    first = types.Image.from_file(location=str(frame_path))
    cfg = dict(
        number_of_videos=1,
        aspect_ratio=ASPECT,
        negative_prompt="text, letters, watermark, logo, extra characters, camera movement, "
        "zoom, pan, morphing, distortion, flicker, mascot leaving frame",
    )
    print(f"submitting {model} (image-to-video, seamless first==last)…")
    try:
        op = c.models.generate_videos(
            model=model, prompt=PROMPT, image=first,
            config=types.GenerateVideosConfig(last_frame=first, **cfg),
        )
    except Exception as e:  # noqa: BLE001 — submission failed = not billed; fall back
        print(f"  last_frame rejected ({type(e).__name__}: {str(e)[:120]}); retrying without it…")
        op = c.models.generate_videos(
            model=model, prompt=PROMPT, image=first, config=types.GenerateVideosConfig(**cfg),
        )
    print("  submitted; polling …")
    while not op.done:
        time.sleep(10)
        op = c.operations.get(op)
    if op.error:
        print(f"  generation FAILED: {op.error}", file=sys.stderr)
        return 1
    resp = op.response or op.result
    vids = getattr(resp, "generated_videos", None) or []
    if not vids:
        print(f"  no video returned (filtered? {getattr(resp, 'rai_media_filtered_reasons', None)})", file=sys.stderr)
        return 1
    c.files.download(file=vids[0].video)
    out = TMP / "tutor-mascot.mp4"
    vids[0].video.save(str(out))
    print(f"saved {out} ({out.stat().st_size:,} bytes) + poster tutor-mascot.jpg — review before --install")
    return 0


def run_install() -> int:
    src = TMP / "tutor-mascot.mp4"
    if not src.exists():
        print(f"missing {src} (run --generate)", file=sys.stderr)
        return 1
    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / "tutor-mascot.mp4").write_bytes(src.read_bytes())
    # The frontend uses /brand/iris.png as the <video> poster, so we don't ship the baked
    # tutor-mascot.jpg (it stays in .tmp for review only).
    print("installed tutor-mascot.mp4 to frontend/public/media/loops/")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--estimate", action="store_true")
    ap.add_argument("--generate", action="store_true")
    ap.add_argument("--install", action="store_true")
    ap.add_argument("--model", default=CANDIDATE_MODELS[0])
    a = ap.parse_args()
    if a.probe:
        return run_probe()
    if a.install:
        return run_install()
    if a.generate:
        return run_generate(a.model)
    print("ESTIMATE — 1 Veo clip, image=iris.png, aspect", ASPECT, ", model (default):", a.model)
    print("Veo bills per second of video — CONFIRM current pricing before --generate.\n")
    print(PROMPT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
