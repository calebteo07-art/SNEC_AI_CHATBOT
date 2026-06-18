"""Generate the Flashcards hero — a photoreal, medically-accurate retinal fundus
reimagined as a glowing cosmos (Nano Banana Pro), used as the deep atmospheric
backdrop of the "FUNDUS — The Living Retina" study experience.

Anatomy baked into the prompt so it is clinically correct AND beautiful: a glowing
optic disc, the central retinal artery/vein branching into four vascular arcades,
the macula with a foveal reflex, choroidal texture, and a dark vignette so UI text
sits cleanly over it.

PAID API - run deliberately. Generates N candidates so we can pick the best one,
then copy the winner to brand/flashcards-fundus.png.

    python tools/media/generate_flashcards_fundus.py --count 3

Without GEMINI_API_KEY this exits without calling anything.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(PROJECT_ROOT / ".env")

BRAND_DIR = PROJECT_ROOT / "frontend" / "public" / "brand"

# Medically accurate retinal fundus + ethereal cosmic treatment, dark at the edges
# so UI reads over it. ASCII-only.
PROMPT = (
    "Hyper-real ultra-wide retinal fundus photograph - the back of a living human eye "
    "seen through a fundus camera - true medically accurate ophthalmic imaging. A bright "
    "glowing pale-gold optic disc sits in the right third of the frame; from it the central "
    "retinal artery and vein emerge and branch into four graceful vascular arcades of fine "
    "crimson blood vessels that arch and taper across the retina. A slightly darker reddish "
    "macula with a single pinpoint foveal light reflex sits centre-left. The retinal surface "
    "is a deep oxblood-to-warm-amber gradient with subtle mottled choroidal vascular texture "
    "showing through. The whole image glows softly from within, ethereal and bioluminescent, "
    "as if the retina were a warm cosmos seen in deep space, falling away into a rich dark "
    "vignette at every edge of the frame. Cinematic, hyper-detailed, photorealistic clinical "
    "ophthalmology, shallow glow, true-to-life colour. Dark deep background at the frame "
    "corners. No text, no logos, no graphics, no illustration, no reticle, no measurement "
    "overlay, no crosshair."
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=3, help="candidates to generate")
    parser.add_argument("--aspect", default="16:9", help="aspect ratio (e.g. 16:9, 3:2)")
    parser.add_argument("--retries", type=int, default=4, help="retries per candidate on 503/transient")
    args = parser.parse_args()

    if not os.getenv("GEMINI_API_KEY"):
        print("GEMINI_API_KEY not set - refusing to run.")
        return 1

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    model = os.getenv("NB_MODEL", "gemini-3-pro-image")
    BRAND_DIR.mkdir(parents=True, exist_ok=True)
    print(f"generating {args.count} x flashcards-fundus @ {args.aspect} ({model})")

    written = 0
    for n in range(args.count):
        for attempt in range(args.retries + 1):
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
                        out = BRAND_DIR / f"flashcards-fundus-{n:02d}.png"
                        out.write_bytes(part.inline_data.data)
                        print(f"  ok {out.name} ({len(part.inline_data.data) // 1024} KB)")
                        written += 1
                        saved = True
                        break
                if saved:
                    break
                print(f"  WARN candidate {n}: no image part returned")
                break
            except Exception as exc:  # noqa: BLE001 - one bad call shouldn't kill the run
                msg = f"{type(exc).__name__}: {str(exc)[:120]}"
                transient = "503" in str(exc) or "UNAVAILABLE" in str(exc) or "429" in str(exc)
                if transient and attempt < args.retries:
                    wait = 8 * (attempt + 1)
                    print(f"  retry candidate {n} (attempt {attempt + 1}) after {wait}s - {msg}")
                    time.sleep(wait)
                    continue
                print(f"  ERROR candidate {n}: {msg}")
                break

    print(f"done: {written}/{args.count} candidates -> {BRAND_DIR}")
    return 0 if written else 1


if __name__ == "__main__":
    raise SystemExit(main())
