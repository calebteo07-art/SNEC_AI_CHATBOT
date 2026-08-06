#!/usr/bin/env python3
"""Veo greeting loop — PAID, go-ahead-gated. The Eyecon picnic crew.

Two stages, cheap one first: `--frame` draws the conditioning still with the image
model anchored on the real iris.png (iterate here — it costs cents and it decides
the whole look), then `--generate` animates the still you approved with Veo, which
bills per second of video. `--probe` (lists Veo models on the key) and `--estimate`
(no calls) come first; `--install` copies the reviewed clip into the web app.
Refuses in MOCK_MODE.

Usage:
    python tools/media/generate_greeting_loop.py --probe             # Veo models on this key
    python tools/media/generate_greeting_loop.py --estimate          # prompts + plan, NO calls
    python tools/media/generate_greeting_loop.py --frame [--count 3] # cheap: candidate stills
    python tools/media/generate_greeting_loop.py --pick 1            # promote a candidate
    python tools/media/generate_greeting_loop.py --generate --model <id>
    python tools/media/generate_greeting_loop.py --install           # .tmp -> public/media/loops/
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tools.media.greeting_loop import (
    CANDIDATE_MODELS, FRAME_PROMPT, IMAGE_MODEL, IMAGE_REFS, NEGATIVE_PROMPT, PROMPT,
)
from tools.shared.gemini_client import MOCK_MODE, _API_KEYS

ROOT = Path(__file__).resolve().parents[2]
TMP = ROOT / ".tmp" / "greeting-loop"
DEST = ROOT / "frontend" / "public" / "media" / "loops"
FRAME = TMP / "greeting-frame.png"          # the approved conditioning still
STEM = "greeting-crew"                      # installed clip + poster share this stem


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


def run_frame(count: int) -> int:
    """Draw candidate conditioning stills (cheap). Review, then --pick one."""
    if MOCK_MODE:
        print("ERROR: MOCK_MODE — no key.", file=sys.stderr)
        return 2
    from google.genai import types

    c = _client()
    refs = []
    for p in IMAGE_REFS:
        if not p.exists():
            print(f"  WARN missing reference {p.name} — skipping")
            continue
        mime = "image/webp" if p.suffix == ".webp" else "image/png"
        refs.append(types.Part.from_bytes(data=p.read_bytes(), mime_type=mime))
    if not refs:
        print("ERROR: no identity references on disk", file=sys.stderr)
        return 1

    TMP.mkdir(parents=True, exist_ok=True)
    print(f"drawing {count} candidate frame(s) with {IMAGE_MODEL} ({len(refs)} refs, 16:9)")
    written = 0
    for n in range(count):
        try:
            res = c.models.generate_content(
                model=IMAGE_MODEL,
                contents=[*refs, FRAME_PROMPT],
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio="16:9"),
                ),
            )
        except Exception as exc:  # noqa: BLE001 — one bad call shouldn't kill the run
            print(f"  candidate {n}: {type(exc).__name__}: {str(exc)[:160]}")
            continue
        for part in res.candidates[0].content.parts:
            if getattr(part, "inline_data", None):
                out = TMP / f"greeting-frame-cand-{n:02d}.png"
                out.write_bytes(part.inline_data.data)
                print(f"  ok {out.name} ({len(part.inline_data.data) // 1024} KB)")
                written += 1
                break
        else:
            print(f"  WARN candidate {n}: no image part returned")
    if not written:
        return 1
    print(f"review {TMP}/greeting-frame-cand-*.png then: --pick <n>")
    return 0


def run_pick(n: int) -> int:
    """Promote a reviewed candidate to THE conditioning frame (+ the poster)."""
    src = TMP / f"greeting-frame-cand-{n:02d}.png"
    if not src.exists():
        print(f"missing {src} (run --frame)", file=sys.stderr)
        return 1
    from PIL import Image

    FRAME.write_bytes(src.read_bytes())
    im = Image.open(FRAME).convert("RGB")
    im.save(TMP / f"{STEM}.jpg", "JPEG", quality=88)  # poster == the loop's first frame
    print(f"picked {src.name} -> {FRAME.name} ({im.width}x{im.height}) + {STEM}.jpg poster")
    return 0


def run_generate(model: str) -> int:
    if MOCK_MODE:
        print("ERROR: MOCK_MODE — no key.", file=sys.stderr)
        return 2
    if not FRAME.exists():
        print(f"missing {FRAME} (run --frame then --pick)", file=sys.stderr)
        return 1
    from google.genai import types

    c = _client()
    first = types.Image.from_file(location=str(FRAME))
    base = dict(number_of_videos=1, aspect_ratio="16:9", negative_prompt=NEGATIVE_PROMPT)
    # richest config first; a rejection is a submission failure, so it is NOT billed.
    ladder = (
        ("seamless + silent", dict(base, last_frame=first, generate_audio=False)),
        ("seamless", dict(base, last_frame=first)),
        ("plain", dict(base)),
    )
    op = None
    for label, cfg in ladder:
        print(f"submitting {model} (image-to-video, {label})…")
        try:
            op = c.models.generate_videos(
                model=model, prompt=PROMPT, image=first,
                config=types.GenerateVideosConfig(**cfg),
            )
            break
        except Exception as e:  # noqa: BLE001 — fall down the ladder
            print(f"  rejected ({type(e).__name__}: {str(e)[:140]})")
    if op is None:
        print("  every config rejected — nothing submitted, nothing billed", file=sys.stderr)
        return 1

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
        print(f"  no video returned (filtered? {getattr(resp, 'rai_media_filtered_reasons', None)})",
              file=sys.stderr)
        return 1
    c.files.download(file=vids[0].video)
    out = TMP / f"{STEM}.mp4"
    vids[0].video.save(str(out))
    print(f"saved {out} ({out.stat().st_size:,} bytes) + poster {STEM}.jpg — review before --install")
    return 0


def run_install() -> int:
    src = TMP / f"{STEM}.mp4"
    if not src.exists():
        print(f"missing {src} (run --generate)", file=sys.stderr)
        return 1
    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / f"{STEM}.mp4").write_bytes(src.read_bytes())
    poster = TMP / f"{STEM}.jpg"
    if poster.exists():
        (DEST / f"{STEM}.jpg").write_bytes(poster.read_bytes())
    else:
        print("WARN no poster — --pick writes one; without it the card falls back to its fill")
    print(f"installed {STEM}.mp4 (+ poster) to frontend/public/media/loops/")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--estimate", action="store_true")
    ap.add_argument("--frame", action="store_true")
    ap.add_argument("--pick", type=int, default=None)
    ap.add_argument("--count", type=int, default=3)
    ap.add_argument("--generate", action="store_true")
    ap.add_argument("--install", action="store_true")
    ap.add_argument("--model", default=CANDIDATE_MODELS[0])
    a = ap.parse_args()
    if a.probe:
        return run_probe()
    if a.frame:
        return run_frame(a.count)
    if a.pick is not None:
        return run_pick(a.pick)
    if a.install:
        return run_install()
    if a.generate:
        return run_generate(a.model)
    print(f"ESTIMATE — stage 1: {a.count} x {IMAGE_MODEL} still(s), {len(IMAGE_REFS)} refs")
    print(f"           stage 2: 1 Veo clip from the picked still, model (default): {a.model}")
    print("Veo bills per second of video — CONFIRM current pricing before --generate.\n")
    print("--- FRAME PROMPT ---\n" + FRAME_PROMPT)
    print("\n--- MOTION PROMPT ---\n" + PROMPT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
