"""Generate "Iris" — the friendly eye mascot for the EyeBot homepage (Nano Banana).

Iris is a soft, characterful anthropomorphic eye: the playful face of EyeBot that
lives in the dashboard greeting and reacts to the learner's streak. Believable
ocular anatomy (per the Generated Imagery Standard) rendered as an adorable premium
app mascot, on a transparent background so it composites cleanly into the warm card.

PAID API — run deliberately. Generates N candidates so we can pick the best render.

    python tools/media/generate_mascot.py --count 3 --out <dir>

Without GEMINI_API_KEY this exits without calling anything.
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

DEFAULT_OUT = PROJECT_ROOT / "frontend" / "public" / "brand"

# The hero pose: warm, encouraging, subtle wink + thumbs-up. Believable eye,
# SingHealth-blue iris, soft Ghibli-meets-modern-3D mascot, transparent bg. ASCII-only.
IRIS_PROMPT = (
    "A charming mascot character for a premium eye-care learning app called EyeBot. "
    "The character is a single friendly anthropomorphic human EYE with a soft rounded "
    "pillowy body. It has a large believable eye: clear healthy white sclera, a bright "
    "expressive iris in warm SingHealth blue (hex 0057B8) with delicate fine radial "
    "fibres and a soft darker limbal ring, a round deep-black pupil with one crisp "
    "pinpoint catchlight. A gentle rounded upper eyelid curves into a warm, encouraging "
    "smile with a subtle happy wink. Two small simple stubby arms, one giving a cheerful "
    "thumbs-up. Cute, wholesome, expressive, full of personality and warmth. Soft "
    "hand-painted Studio Ghibli inspired charm combined with clean modern 3D mascot "
    "design: smooth gradients, warm soft ambient lighting with a gentle rim light, a "
    "soft contact shadow, rounded forms, no harsh edges. Warm pastel palette of peach, "
    "rose, cream and soft blue. Centred, full body, with generous empty margin around "
    "the character. Fully TRANSPARENT background with alpha, no scenery, no floor, no "
    "text, no logos, no watermark. Adorable premium app mascot, high detail, crisp "
    "clean edges."
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=3, help="candidates to generate")
    parser.add_argument("--aspect", default="1:1", help="aspect ratio (default 1:1)")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="output directory")
    parser.add_argument("--stem", default="iris", help="output filename stem")
    args = parser.parse_args()

    if not os.getenv("GEMINI_API_KEY"):
        print("GEMINI_API_KEY not set - refusing to run.")
        return 1

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    model = os.getenv("NB_MODEL", "gemini-3-pro-image")
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"generating {args.count} x {args.stem} @ {args.aspect} ({model}) -> {out_dir}")

    written = 0
    for n in range(args.count):
        try:
            res = client.models.generate_content(
                model=model,
                contents=IRIS_PROMPT,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio=args.aspect),
                ),
            )
            saved = False
            for part in res.candidates[0].content.parts:
                if getattr(part, "inline_data", None):
                    out = out_dir / f"{args.stem}-{n:02d}.png"
                    out.write_bytes(part.inline_data.data)
                    print(f"  ok {out.name} ({len(part.inline_data.data) // 1024} KB)")
                    written += 1
                    saved = True
                    break
            if not saved:
                print(f"  WARN candidate {n}: no image part returned")
        except Exception as exc:  # noqa: BLE001 - one bad call shouldn't kill the run
            print(f"  ERROR candidate {n}: {type(exc).__name__}: {str(exc)[:160]}")

    print(f"done: {written}/{args.count} candidates -> {out_dir}")
    return 0 if written else 1


if __name__ == "__main__":
    raise SystemExit(main())
