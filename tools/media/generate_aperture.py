"""Generate the Flashcards "Aperture" iris plate (Nano Banana Pro).

ONE medically-correct, beautiful photoreal close-up of a human iris and pupil,
emerald-green pigmentation on a deep near-black emerald field, lit by an
emerald-to-jade-to-gold rim at the limbus (matches the flashcards "Emerald
Aurora" theme). Used as the stepper centerpiece and the "Open" dilation launch
-- NEVER on the study card.

The image carries NO text/labels. STANDING RULE: anatomically correct AND
beautiful -- reject any candidate that is not both.

PAID API -- run deliberately, only with the user's go-ahead. Generates N
candidates so the most clinically correct + beautiful one can be chosen, then
copy the winner to frontend/public/media/accents/aperture-iris-00.png.

    python tools/media/generate_aperture.py --count 4

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

ACCENTS_DIR = PROJECT_ROOT / "frontend" / "public" / "media" / "accents"

# Anatomically accurate iris. Composition LOCKED: perfectly centered, round dark
# pupil, radial stroma, visible collarette + crypts, clean limbus rim lit by the
# Gemini gradient. Square. NO text. ASCII-only for the Windows console.
IRIS_PROMPT = (
    "An extreme close-up macro photograph of a single anatomically accurate human "
    "IRIS and PUPIL, perfectly centered and circular, filling the frame on a deep "
    "near-black emerald background (hex 07221a). The round black PUPIL sits dead "
    "center. Around it the IRIS shows clinically correct anatomy: fine radial STROMA "
    "fibres running from the pupil to the edge, a slightly raised COLLARETTE ring "
    "about a third of the way out, subtle crypts and contraction furrows, and a clean "
    "LIMBUS rim at the outer edge. Realistic emerald-green to teal iris pigmentation. "
    "A soft volumetric RIM LIGHT in an emerald-to-jade-to-soft-gold gradient (emerald "
    "1f9d6a to jade 2bbd8a to warm gold d6b860) grazes the limbus like a glowing "
    "ring. Ultra-clean, medical-grade, photorealistic ophthalmic macro, calm and "
    "premium, sharp focus, shallow depth glow. Absolutely NO text, NO letters, NO "
    "numbers, NO labels, NO arrows, NO reticle, no eyelashes, no eyelid, no skin, no "
    "UI, no watermark. Just the iris and pupil as a clean circular specimen."
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=4, help="candidates to generate")
    parser.add_argument("--aspect", default="1:1", help="aspect ratio")
    args = parser.parse_args()

    if not os.getenv("GEMINI_API_KEY"):
        print("GEMINI_API_KEY not set - refusing to run.")
        return 1

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    model = os.getenv("NB_MODEL", "gemini-3-pro-image")
    ACCENTS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"generating {args.count} x aperture-iris @ {args.aspect} ({model})")

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
                    out = ACCENTS_DIR / f"aperture-iris-{n:02d}.png"
                    out.write_bytes(part.inline_data.data)
                    print(f"  ok {out.name} ({len(part.inline_data.data) // 1024} KB)")
                    written += 1
                    saved = True
                    break
            if not saved:
                print(f"  WARN candidate {n}: no image part returned")
        except Exception as exc:  # noqa: BLE001
            print(f"  ERROR candidate {n}: {type(exc).__name__}: {str(exc)[:160]}")

    print(f"done: {written}/{args.count} -> {ACCENTS_DIR}")
    print("Pick the most clinically correct + beautiful candidate and copy it to "
          "aperture-iris-00.png.")
    return 0 if written else 1


if __name__ == "__main__":
    raise SystemExit(main())
