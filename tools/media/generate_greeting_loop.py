#!/usr/bin/env python3
"""Veo greeting loop — PAID, go-ahead-gated. Image-to-video from iris.png.

Veo bills per second of video, so this is heavily gated: --probe (cheap, lists
Veo models on the key) and --estimate (no calls) come first; --generate spends;
--install copies the reviewed clip into the web app. Refuses in MOCK_MODE.

Usage:
    python tools/media/generate_greeting_loop.py --probe            # list Veo models on this key
    python tools/media/generate_greeting_loop.py --estimate         # prompt + plan, NO calls
    python tools/media/generate_greeting_loop.py --generate --model <id>
    python tools/media/generate_greeting_loop.py --install          # .tmp -> public/media/loops/
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tools.media.greeting_loop import CANDIDATE_MODELS, IMAGE_REF, PROMPT
from tools.shared.gemini_client import MOCK_MODE, _API_KEYS

ROOT = Path(__file__).resolve().parents[2]
TMP = ROOT / ".tmp" / "greeting-loop"
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
    """Composite the transparent iris.png mascot onto a warm card-matching gradient,
    LANDSCAPE 16:9 with the mascot on the RIGHT and calm open space on the LEFT for the
    greeting copy — the conditioning first/last frame (also the poster). Veo can't emit
    alpha, so baking the background here controls the look and (as last_frame) makes the
    loop seamless. Returns the saved frame path."""
    from PIL import Image, ImageFilter

    W, H = 1280, 720
    # radial warm gradient matching .hm-greet:
    #   radial-gradient(135% 155% at 6% 0%, #FFE3C2 0%, #FFD2E0 46%, #E7D9FF 100%)
    # computed at low res then upscaled (smooth + dependency-free, no numpy).
    peach, pink, lav = (0xFF, 0xE3, 0xC2), (0xFF, 0xD2, 0xE0), (0xE7, 0xD9, 0xFF)

    def _mix(a, b, t):
        return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

    GW, GH = 192, 108
    cx, cy = 0.06 * GW, 0.0
    rx, ry = 1.35 * GW, 1.55 * GH
    small = Image.new("RGB", (GW, GH))
    sp = small.load()
    for y in range(GH):
        for x in range(GW):
            d = (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2) ** 0.5
            if d <= 0.46:
                sp[x, y] = _mix(peach, pink, d / 0.46)
            elif d >= 1.0:
                sp[x, y] = lav
            else:
                sp[x, y] = _mix(pink, lav, (d - 0.46) / 0.54)
    bg = small.resize((W, H), Image.LANCZOS).convert("RGBA")

    mascot = Image.open(IMAGE_REF).convert("RGBA")
    target_h = int(H * 0.70)
    scale = target_h / mascot.height
    m = mascot.resize((round(mascot.width * scale), target_h), Image.LANCZOS)
    mx = int(W * 0.75) - m.width // 2   # centred on the right third
    my = int(H * 0.55) - m.height // 2  # grounded a touch below centre
    # soft contact shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = Image.new("RGBA", (int(m.width * 0.8), 54), (70, 35, 18, 95))
    shadow.paste(sd, (mx + (m.width - sd.width) // 2, my + m.height - 26), sd)
    shadow = shadow.filter(ImageFilter.GaussianBlur(16))
    bg.alpha_composite(shadow)
    bg.alpha_composite(m, (mx, my))

    TMP.mkdir(parents=True, exist_ok=True)
    frame = TMP / "greeting-frame.jpg"
    bg.convert("RGB").save(frame, "JPEG", quality=92)
    bg.convert("RGB").save(TMP / "greeting-selena.jpg", "JPEG", quality=88)  # poster
    print(f"  built conditioning frame {frame} ({W}x{H}, mascot right)")
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
        aspect_ratio="16:9",
        negative_prompt="text, letters, watermark, logo, extra characters, camera movement, "
        "zoom, pan, morphing, distortion, flicker",
    )
    print(f"submitting {model} (image-to-video, seamless first==last)…")
    try:  # pin last_frame = first for a seamless loop; retry without if unsupported
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
    out = TMP / "greeting-selena.mp4"
    vids[0].video.save(str(out))
    print(f"saved {out} ({out.stat().st_size:,} bytes) + poster greeting-selena.jpg — review before --install")
    return 0


def run_install() -> int:
    src = TMP / "greeting-selena.mp4"
    if not src.exists():
        print(f"missing {src} (run --generate)", file=sys.stderr)
        return 1
    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / "greeting-selena.mp4").write_bytes(src.read_bytes())
    poster = TMP / "greeting-selena.jpg"
    if poster.exists():
        (DEST / "greeting-selena.jpg").write_bytes(poster.read_bytes())
    else:
        print("WARN no poster — extract one (ffmpeg) or the player falls back to iris.png")
    print("installed greeting-selena.mp4 — set GREETING_LOOP = true in GreetingHero.tsx")
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
    print("ESTIMATE — 1 Veo clip, image=iris.png, model (default):", a.model)
    print("Veo bills per second of video — CONFIRM current pricing before --generate.\n")
    print(PROMPT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
