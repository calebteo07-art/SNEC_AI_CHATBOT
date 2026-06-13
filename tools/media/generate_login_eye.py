"""Generate the login hero — a photoreal partial-face human eye (Nano Banana Pro).

The procedural WebGL iris read as synthetic. This produces a real macro
photograph of a human eye set in a partial face (brow, lashes, lid, skin,
sclera) with a natural medium-brown iris, on a pale neutral background so it
melts into the #FDFDFC login field. Portrait (3:4) so a tall right-hand column
shows the eye plus surrounding face.

PAID API — run deliberately. Generates N candidates so we can pick the most
real-looking one, then copy the winner to brand/login-eye.png.

    python tools/media/generate_login_eye.py --count 3

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

BRAND_DIR = PROJECT_ROOT / "frontend" / "public" / "brand"

# Engineered for photographic realism + real ocular anatomy + a partial face,
# on a pale background that blends into the light login. ASCII-only.
PROMPT = (
    "Extreme close-up macro photograph of a single real human eye gazing directly "
    "into the camera. A natural medium-brown iris with true anatomical detail: fine "
    "radial stromal fibres, Fuchs crypts, contraction furrows, a subtly darker limbal "
    "ring, a warmer golden zone around the pupil, and a deep black round pupil with a "
    "single crisp pinpoint catchlight. Framed by a partial human face: real eyelid "
    "skin with visible pores and natural texture, dark upper and lower eyelashes, a "
    "soft eyebrow at the top of frame, a hint of cheek below, healthy moist sclera "
    "with faint fine blood vessels and a natural tear-film sheen. Warm medium skin "
    "tone, relaxed neutral expression, no makeup. Soft diffused natural daylight from "
    "the upper left, shallow depth of field with the iris in razor-sharp focus, shot "
    "on a 100mm macro lens. Lifelike colour, editorial clinical-beauty photography, "
    "hyper-detailed, photorealistic. Clean, softly out-of-focus pale neutral "
    "off-white background. No text, no logos, no graphics, no illustration."
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=3, help="candidates to generate")
    parser.add_argument("--aspect", default="3:4", help="aspect ratio (e.g. 3:4, 1:1, 4:3)")
    args = parser.parse_args()

    if not os.getenv("GEMINI_API_KEY"):
        print("GEMINI_API_KEY not set - refusing to run.")
        return 1

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    model = os.getenv("NB_MODEL", "gemini-3-pro-image")
    BRAND_DIR.mkdir(parents=True, exist_ok=True)

    written = 0
    for n in range(args.count):
        try:
            res = client.models.generate_content(
                model=model,
                contents=PROMPT,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio=args.aspect),
                ),
            )
            saved = False
            for part in res.candidates[0].content.parts:
                if getattr(part, "inline_data", None):
                    out = BRAND_DIR / f"login-eye-{n:02d}.png"
                    out.write_bytes(part.inline_data.data)
                    print(f"  ok {out.name} ({len(part.inline_data.data) // 1024} KB)")
                    written += 1
                    saved = True
                    break
            if not saved:
                print(f"  WARN candidate {n}: no image part returned")
        except Exception as exc:  # noqa: BLE001 - one bad call shouldn't kill the run
            print(f"  ERROR candidate {n}: {type(exc).__name__}: {str(exc)[:160]}")

    print(f"done: {written}/{args.count} candidates -> {BRAND_DIR}")
    return 0 if written else 1


if __name__ == "__main__":
    raise SystemExit(main())
