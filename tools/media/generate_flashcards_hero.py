"""Generate the redesigned Flashcards hero — a slit-lamp optical section reborn on
TWILIGHT INDIGO so it melts into the dark-immersive flashcards surface (#1b2348)
instead of sitting in a pure-black box.

The brief (from the 2026-06-20 dark-immersive redesign): the eye must MATCH the
twilight-indigo background, be mesmerizing and noticeable, and read as a luminous
focal point whose glow fades to the surface at the edges (so a soft CSS mask /
screen blend makes it composite seamlessly). Jewel-like teal+amber iris for
contrast; bright vertical slit beam as the brightest element. Square so the same
raster serves the large centred hero AND the shrunken top badge.

PAID API -- run deliberately. Generates N candidates so we can pick the most
beautiful, clinically plausible one, then copy the winner to
frontend/public/media/accents/flashcards-photo-00.png.

    python tools/media/generate_flashcards_hero.py --count 4

Without GEMINI_API_KEY this exits without calling anything. ASCII-only for the
Windows console.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(PROJECT_ROOT / ".env")

ACCENTS_DIR = PROJECT_ROOT / "frontend" / "public" / "media" / "accents"

HERO_PROMPT = (
    "An ultra-realistic, mesmerizing macro photograph of a single human eye with a "
    "richly detailed BROWN iris, frontal optical-section view as seen through a "
    "slit lamp. The brown iris is breathtakingly intricate: warm amber, honey, "
    "copper and dark-chocolate tones with fine radial stromal fibres, crypts of "
    "Fuchs, delicate contraction furrows, and a subtle glowing golden inner ring "
    "around a deep black round pupil, with a crisp pin-sharp specular catchlight. A "
    "bright, crisp, luminous vertical slit beam of light forms a glowing optical "
    "section across the clear domed cornea, revealing faint fine corneal striae "
    "within the beam. Hyper-detailed, tack-sharp focus on the iris with a shallow "
    "depth of field, true-to-life limbal detail and fine natural vessels at the "
    "limbus. The eye sits on and melts softly into a soft, warm, slightly "
    "out-of-focus OFF-WHITE CREAM background (hex f4ede0), high-key and luminous, "
    "NOT pure white and NOT dark, the iris edges fading gently into the cream so "
    "the eye reads as a beautiful, mesmerizing focal point. Photorealistic "
    "professional macro photography, exquisite detail, premium, calm, "
    "gallery-quality. Square composition, the iris centred with generous cream "
    "margin all around. Absolutely NO text, NO letters, NO numbers, NO labels, NO "
    "arrows, NO measurement overlays, NO UI, no skin or face beyond the eye, no "
    "fluorescein stain, no cobalt-blue light, no watermark."
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=4, help="candidates to generate")
    parser.add_argument("--aspect", default="1:1", help="aspect ratio (e.g. 1:1, 4:3)")
    args = parser.parse_args()

    if not os.getenv("GEMINI_API_KEY"):
        print("GEMINI_API_KEY not set - refusing to run.")
        return 1

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    model = os.getenv("NB_MODEL", "gemini-3-pro-image")
    ACCENTS_DIR.mkdir(parents=True, exist_ok=True)

    stem = "flashcards-hero"
    print(f"generating {args.count} x {stem} @ {args.aspect} ({model})")

    written = 0
    for n in range(args.count):
        try:
            res = client.models.generate_content(
                model=model,
                contents=HERO_PROMPT,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio=args.aspect),
                ),
            )
            saved = False
            for part in res.candidates[0].content.parts:
                if getattr(part, "inline_data", None):
                    out = ACCENTS_DIR / f"{stem}-{n:02d}.png"
                    out.write_bytes(part.inline_data.data)
                    print(f"  ok {out.name} ({len(part.inline_data.data) // 1024} KB)")
                    written += 1
                    saved = True
                    break
            if not saved:
                print(f"  WARN candidate {n}: no image part returned")
        except Exception as exc:  # noqa: BLE001 - one bad call shouldn't kill the run
            print(f"  ERROR candidate {n}: {type(exc).__name__}: {str(exc)[:160]}")

    print(f"done: {written}/{args.count} candidates -> {ACCENTS_DIR}")
    print("Pick the most beautiful candidate and copy it to flashcards-photo-00.png")
    return 0 if written else 1


if __name__ == "__main__":
    raise SystemExit(main())
