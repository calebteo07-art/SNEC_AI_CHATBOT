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

# Wide full-bleed login background: the eye sits in the RIGHT THIRD, smooth skin
# (nose bridge, brow, cheek) fills the frame to the LEFT so the whole screen is
# skin + eye. Used full-bleed behind the login card. ASCII-only.
WIDE_PROMPT = (
    "Wide cinematic macro photograph of the eye region of a human face. A single "
    "real human eye with a natural medium-brown iris - fine radial stromal fibres, a "
    "darker limbal ring, a warm golden zone around a deep black pupil with one crisp "
    "pinpoint catchlight - positioned in the RIGHT THIRD of the frame, gazing toward "
    "the camera, framed by upper and lower eyelids with natural dark lashes and a moist "
    "sclera. The entire LEFT and centre of the frame is filled edge to edge with smooth "
    "real human skin - the bridge of the nose, the brow and the cheek - warm medium skin "
    "tone with natural pores, fine vellus hair and lifelike texture. No second eye, no "
    "mouth, no nostrils, no hairline. Soft diffused natural daylight from the upper left, "
    "shallow depth of field with the iris in razor-sharp focus and the surrounding skin "
    "gently soft. Editorial clinical-beauty photography, hyper-detailed, photorealistic, "
    "true-to-life warm colour. No text, no logos, no graphics, no illustration."
)

# High-key login eye: a hyper-real eye whose surrounding skin fades fast into a
# pure WHITE seamless background, so it drops onto a white login screen (eye placed
# on the right, white everywhere else). ASCII-only.
HIGHKEY_PROMPT = (
    "Extreme close-up macro photograph of a single real human eye gazing directly into "
    "the camera. A natural medium-brown iris with true anatomical detail - fine radial "
    "stromal fibres, Fuchs crypts, a darker limbal ring, a warm golden zone around a deep "
    "black pupil with one crisp pinpoint catchlight - framed by upper and lower eyelids "
    "with natural dark lashes and a healthy moist sclera with a faint tear-film sheen. The "
    "surrounding eyelid skin is softly lit and fades quickly outward into a clean, pure, "
    "seamless bright WHITE background that fills the rest of the frame. High-key studio "
    "lighting, shallow depth of field with the iris in razor-sharp focus, shot on a 100mm "
    "macro lens. Hyper-detailed, photorealistic, true-to-life colour, editorial "
    "clinical-beauty photography. Pure white seamless background, no text, no logos, no "
    "graphics, no illustration."
)

# Iris-only login hero: just the round iris + pupil on pure white, no eyelids / lashes /
# sclera / skin. Placed big on the right; gaze-follows the cursor. ASCII-only.
IRIS_PROMPT = (
    "Extreme macro photograph of a single human iris and pupil ONLY, perfectly round and "
    "centred, filling most of the frame. A natural medium-brown iris with hyper-detailed "
    "anatomy: dense fine radial stromal fibres, Fuchs crypts, contraction furrows, a warm "
    "golden inner ring blending into deeper brown, a distinct darker limbal ring at the "
    "outer edge, and a perfectly round deep-black central pupil with one small crisp "
    "pinpoint catchlight. Wet, glossy, lifelike surface with true-to-life colour and "
    "micro-detail. Pure clean bright WHITE background completely surrounding the iris. "
    "Absolutely NO eyelid, NO eyelashes, NO sclera, NO skin, NO face - only the round iris "
    "and pupil on white. Hyper-detailed, photorealistic, studio macro photography. No text, "
    "no logos, no graphics, no illustration."
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=3, help="candidates to generate")
    parser.add_argument("--aspect", default=None, help="aspect ratio (e.g. 3:4, 16:9, 1:1)")
    parser.add_argument("--wide", action="store_true", help="wide full-bleed bg: eye right, skin left")
    parser.add_argument("--white", action="store_true", help="high-key eye on a pure white background")
    parser.add_argument("--iris", action="store_true", help="iris + pupil only on pure white")
    args = parser.parse_args()

    if not os.getenv("GEMINI_API_KEY"):
        print("GEMINI_API_KEY not set - refusing to run.")
        return 1

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    model = os.getenv("NB_MODEL", "gemini-3-pro-image")
    BRAND_DIR.mkdir(parents=True, exist_ok=True)

    prompt = IRIS_PROMPT if args.iris else HIGHKEY_PROMPT if args.white else WIDE_PROMPT if args.wide else PROMPT
    aspect = args.aspect or ("1:1" if args.iris else "3:4" if args.white else "16:9" if args.wide else "3:4")
    stem = "login-iris" if args.iris else "login-white" if args.white else "login-bg" if args.wide else "login-eye"
    print(f"generating {args.count} x {stem} @ {aspect} ({model})")

    written = 0
    for n in range(args.count):
        try:
            res = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio=aspect),
                ),
            )
            saved = False
            for part in res.candidates[0].content.parts:
                if getattr(part, "inline_data", None):
                    out = BRAND_DIR / f"{stem}-{n:02d}.png"
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
