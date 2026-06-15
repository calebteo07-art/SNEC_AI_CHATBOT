"""Generate the Virtual Patients "Eye Atlas" plate (Nano Banana Pro).

ONE combined clinical graphic: a medically-correct SAGITTAL cross-section of the
human eye fused with a circular OPHTHALMOSCOPIC fundus view of the back of the
eye, on a near-black specimen field lit by the Gemini gradient. It deliberately
mirrors the layout of the hand-built SVG in AtlasMap.tsx -- anterior pole
(cornea / iris / lens) on the LEFT, vitreous centre, optic disc + macula on the
RIGHT -- so a single overlay of clickable pins fits both this raster and the SVG
fallback.

The image carries NO text or labels: the app overlays its own interactive,
clickable anatomy labels on top, so the raster must stay clean.

PAID API -- run deliberately. Generates N candidates so we can pick the most
clinically correct, most beautiful one, then copy the winner to
frontend/public/media/accents/eye-atlas-plate-00.png.

    python tools/media/generate_eye_atlas.py --count 4
    python tools/media/generate_eye_atlas.py --count 3 --fundus   # standalone fundus

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

# The hero plate: a museum-grade clinical specimen. Composition is LOCKED so the
# pin overlay calibrates predictably -- anterior LEFT, posterior RIGHT, fundus
# circle inset upper-right. Near-black field, Gemini-gradient rim light. The
# image must contain NO text/letters/labels (the app draws its own). ASCII-only
# for the Windows console.
PLATE_PROMPT = (
    "A premium medical illustration on a deep near-black background (hex 07080c): "
    "a single anatomically accurate SAGITTAL CROSS-SECTION of the human right eye, "
    "shown in profile and cut in half so the internal structures are visible. "
    "Orient it so the FRONT of the eye is on the LEFT and the BACK of the eye is on "
    "the RIGHT. From left to right the cross-section clearly shows: the clear domed "
    "CORNEA at the far left, then the anterior chamber, the coloured IRIS with a "
    "central pupil, the transparent biconvex LENS just behind it, the large central "
    "VITREOUS cavity, and at the back the curved RETINA lining the inside, with the "
    "OPTIC DISC and the bright reddish MACULA on the right side where the OPTIC "
    "NERVE exits as a thick cable to the upper right. Layered sclera, choroid and "
    "retina walls, ciliary body and suspensory zonules around the lens, all "
    "clinically correct. Inset in the UPPER-RIGHT, a clean circular OPHTHALMOSCOPIC "
    "FUNDUS view of the back of the eye -- a warm orange-red retina with a pale "
    "optic disc, a darker macula, and branching retinal blood vessel arcades, as "
    "seen through an ophthalmoscope. Soft volumetric RIM LIGHT in the Google Gemini "
    "gradient (blue 4285F4 to purple 9B72CB to rose D96570) grazing the edges of "
    "the eye and the fundus circle. Elegant, ultra-clean, medical-grade, scientific "
    "atlas aesthetic, subtle depth, glossy translucent humours. Absolutely NO text, "
    "NO letters, NO numbers, NO labels, NO arrows, NO captions, NO watermark, NO "
    "ruler, no people, no UI. Photorealistic 3D medical render, premium and calm."
)

# Standalone ophthalmoscopic fundus -- kept for the SVG-fallback porthole / future
# use. Clean circular fundus only. ASCII-only.
FUNDUS_PROMPT = (
    "A clinically accurate circular OPHTHALMOSCOPIC FUNDUS photograph of the back "
    "of a healthy human eye, as seen through an ophthalmoscope: a warm orange-red "
    "retina, a pale round OPTIC DISC slightly off-centre, a darker central MACULA "
    "with a tiny foveal reflex, and branching superior and inferior retinal blood "
    "vessel arcades radiating from the disc. Perfectly round, filling the frame on "
    "a deep near-black background (hex 07080c), with a soft Gemini-gradient rim "
    "(blue 4285F4 to purple 9B72CB to rose D96570) around the circle. Ultra-clean, "
    "medical-grade, photorealistic, calm. Absolutely NO text, NO letters, NO "
    "labels, NO arrows, no UI, no watermark."
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=4, help="candidates to generate")
    parser.add_argument("--aspect", default=None, help="aspect ratio (e.g. 3:2, 16:9, 1:1)")
    parser.add_argument("--fundus", action="store_true", help="standalone fundus instead of the combined plate")
    args = parser.parse_args()

    if not os.getenv("GEMINI_API_KEY"):
        print("GEMINI_API_KEY not set - refusing to run.")
        return 1

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    model = os.getenv("NB_MODEL", "gemini-3-pro-image")
    ACCENTS_DIR.mkdir(parents=True, exist_ok=True)

    prompt = FUNDUS_PROMPT if args.fundus else PLATE_PROMPT
    aspect = args.aspect or ("1:1" if args.fundus else "3:2")
    stem = "eye-atlas-fundus" if args.fundus else "eye-atlas-plate"
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
    print("Pick the most clinically correct candidate and copy it to "
          f"{stem}-00.png, then calibrate the pin coordinates in AtlasMap.tsx.")
    return 0 if written else 1


if __name__ == "__main__":
    raise SystemExit(main())
