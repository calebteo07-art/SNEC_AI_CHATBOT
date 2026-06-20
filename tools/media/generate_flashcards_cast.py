"""Generate the Flashcards hero SCENE — a single, premium Studio-Ghibli-style
illustration of FOUR SNEC eye-clinic staff who are close FRIENDS relaxing together in a
warm, informal staff lounge. One finished landscape illustration (NO chroma key, NO
slicing): the frontend renders it directly as the flashcards hero.

Two modes (the eye generator tools/media/generate_flashcards_hero.py is untouched):

  # 1) PAID -- generate N candidate scenes so we can pick the most beautiful one
  python tools/media/generate_flashcards_cast.py generate --count 3

  # 2) FREE -- copy the chosen candidate to the final hero filename the frontend loads
  python tools/media/generate_flashcards_cast.py choose --src flashcards-scene-cand-00.png

Uniform ground truth (user-confirmed): SingHealth royal-blue scrubs whose V-neck collar
is a SOLID PURE-ORANGE band right at the neckline edge (no blue gap); the short sleeves
are PLAIN blue with NO orange trim. See memory reference_snec_staff_uniform.

ASCII-only for the Windows console. Generation needs GEMINI_API_KEY in .env.
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(PROJECT_ROOT / ".env")

ACCENTS_DIR = PROJECT_ROOT / "frontend" / "public" / "media" / "accents"
FINAL_NAME = "flashcards-scene.png"  # the file the frontend hero loads

SCENE_PROMPT = (
    "A breathtaking, premium, hand-painted illustration in authentic STUDIO GHIBLI style "
    "(Hayao Miyazaki / Studio Ghibli anime: lush soft watercolour-like backgrounds, warm "
    "painterly cel shading, gentle clean line art, soft volumetric natural light and warm "
    "sun glow, cosy nostalgic atmosphere, expressive gentle friendly faces, naturally and "
    "properly proportioned bodies -- NOT chibi, NOT big-headed, NOT generic anime) of FOUR "
    "Singaporean eye-clinic healthcare workers who are CLOSE FRIENDS relaxing and having FUN "
    "together on a break in a cosy, informal hospital staff lounge / pantry. The mood is "
    "light-hearted, joyful, warm and playful -- they laugh, chat and enjoy each other's "
    "company, NOT a stiff formal portrait. Natural candid group: one perched on the arm of a "
    "soft couch mid-laugh, one leaning in mid-conversation holding a warm coffee mug, one "
    "giving a cheerful peace / V sign, one with a relaxed friendly gesture -- they stand close "
    "together like real friends. The cosy lounge has warm wood and cream tones, a big sunny "
    "window with soft golden daylight pouring in, a few leafy potted plants and coffee mugs, "
    "inviting and informal. "
    "ALL FOUR wear IDENTICAL matching medical scrub uniforms: a medium royal-blue short-sleeve "
    "V-neck scrub top whose V-neck collar is bound with a SOLID PURE-ORANGE band sitting right "
    "at the neckline edge -- the collar itself is entirely orange, a single continuous unbroken "
    "orange V-neck binding with absolutely NO blue gap between the neck opening and the orange. "
    "The orange appears ONLY on the V-neck collar: the short sleeves are PLAIN royal blue with "
    "NO orange cuffs, NO orange trim and NO orange piping on the sleeves or shoulders; the rest "
    "of the top is plain royal blue, with matching plain royal-blue scrub trousers. "
    "The four people: (1) an East-Asian Chinese MAN with short neat black hair; (2) a Malay "
    "WOMAN wearing a headscarf (tudung) in the EXACT SAME royal-blue colour as the scrubs, with "
    "a plain BLACK long-sleeve fitted compression top worn under the scrub top so her arms are "
    "FULLY covered to the wrists; (3) a South-Asian Indian WOMAN with dark hair tied back "
    "neatly; (4) a Caucasian White MAN with short light-brown hair. Faces fully visible (NO "
    "face masks). Warm, diverse, inclusive, respectful and fun-loving. "
    "A warm, cosy palette that harmonises gently with a soft cream background. Exquisite, "
    "polished, gallery-grade Studio Ghibli illustration, masterpiece quality. "
    "Absolutely NO text, NO letters, NO numbers, NO words, NO logos, NO brand marks, NO badges, "
    "NO name tags, NO lanyards, NO watermark, NO speech bubbles, NO border and NO frame."
)


# --------------------------------------------------------------------------- generate
def generate(count: int, aspect: str) -> int:
    if not os.getenv("GEMINI_API_KEY"):
        print("GEMINI_API_KEY not set - refusing to run.")
        return 1

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    model = os.getenv("NB_MODEL", "gemini-3-pro-image")
    ACCENTS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"generating {count} x flashcards-scene-cand @ {aspect} ({model})")
    written = 0
    for n in range(count):
        try:
            res = client.models.generate_content(
                model=model,
                contents=SCENE_PROMPT,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio=aspect),
                ),
            )
            saved = False
            for part in res.candidates[0].content.parts:
                if getattr(part, "inline_data", None):
                    out = ACCENTS_DIR / f"flashcards-scene-cand-{n:02d}.png"
                    out.write_bytes(part.inline_data.data)
                    print(f"  ok {out.name} ({len(part.inline_data.data) // 1024} KB)")
                    written += 1
                    saved = True
                    break
            if not saved:
                print(f"  WARN candidate {n}: no image part returned")
        except Exception as exc:  # noqa: BLE001 - one bad call shouldn't kill the run
            print(f"  ERROR candidate {n}: {type(exc).__name__}: {str(exc)[:160]}")

    print(f"done: {written}/{count} candidates -> {ACCENTS_DIR}")
    print("Inspect, then: python tools/media/generate_flashcards_cast.py choose --src <file>")
    return 0 if written else 1


# ----------------------------------------------------------------------------- choose
def choose(src_name: str) -> int:
    src = ACCENTS_DIR / src_name
    if not src.exists():
        print(f"source not found: {src}")
        return 1
    dst = ACCENTS_DIR / FINAL_NAME
    shutil.copyfile(src, dst)
    print(f"ok {src.name} -> {dst.name} ({dst.stat().st_size // 1024} KB)")
    print("done. The frontend hero now loads /media/accents/flashcards-scene.png")
    return 0


# ------------------------------------------------------------------------------- main
def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="mode", required=True)

    g = sub.add_parser("generate", help="PAID: generate candidate scene illustrations")
    g.add_argument("--count", type=int, default=3, help="candidates to generate")
    g.add_argument("--aspect", default="16:9", help="aspect ratio for the scene")

    c = sub.add_parser("choose", help="FREE: copy a chosen candidate to the final hero file")
    c.add_argument("--src", required=True, help="candidate filename in the accents dir")

    args = parser.parse_args()
    if args.mode == "generate":
        return generate(args.count, args.aspect)
    return choose(args.src)


if __name__ == "__main__":
    raise SystemExit(main())
