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


def run_generate(model: str) -> int:
    if MOCK_MODE:
        print("ERROR: MOCK_MODE — no key.", file=sys.stderr)
        return 2
    from google.genai import types

    c = _client()
    img = types.Image.from_file(location=str(IMAGE_REF))
    op = c.models.generate_videos(model=model, prompt=PROMPT, image=img)
    print(f"submitted {model}; polling …")
    while not op.done:
        time.sleep(10)
        op = c.operations.get(op)
    vid = op.result.generated_videos[0]
    TMP.mkdir(parents=True, exist_ok=True)
    c.files.download(file=vid.video)
    out = TMP / "greeting-selena.mp4"
    vid.video.save(str(out))
    print(f"saved {out} — review before --install")
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
