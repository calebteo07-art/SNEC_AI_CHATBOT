"""Generate per-topic flashcard images for the step-2 topic fan.

One portrait image per flashcard topic (both pools) plus a mixed cover, written
to frontend/public/media/flashcards/topics/<topic_key>.png (mixed.png for the
mixed deck). Photoreal, medically/anatomically accurate; clinical-scene topics
use authentic Singapore eye-clinic settings with plain solid-blue scrubs (no
trim/piping/logo). The per-topic subject prompts live in the sibling data file
flashcard_topic_subjects.json (crafted + adversarially clinically verified,
one-glance-recognizable, Singapore-context). Mirrors generate_flashcards_hero.py.

Each image is auto-compressed at write time (optimize_topic_images) from the
~600 KB raw Gemini PNG to a compact ~40-90 KB progressive JPEG (dimensions kept,
served as .png via browser sniffing) so the topic fan loads fast -- no manual
re-optimize step to forget. To re-shrink files already on disk, run
`python tools/media/optimize_topic_images.py`.

Model tiering (user rule: default flash; reserve pro for clinical/medical detail):
fine anatomical/pathology macros, fundus and diagnostic plates/scans run on pro
(PRO_TOPICS); clinic scenes / people / instrument-in-context run on flash. Set
NB_MODEL to force one model for the whole run (handy for re-running failures).

PAID API -- run deliberately, only on explicit go-ahead.

    python tools/media/generate_flashcards_topics.py                 # all 46 (mixed tiers)
    python tools/media/generate_flashcards_topics.py --pool OT        # one pool
    python tools/media/generate_flashcards_topics.py --keys hrt,pam   # a subset (re-runs)
    NB_MODEL=gemini-3.1-flash-image python tools/media/generate_flashcards_topics.py --keys hrt

Without GEMINI_API_KEY it exits without calling anything. ASCII-only output.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(PROJECT_ROOT / ".env")

from tools.flashcards.flashcard_sets import FLASHCARD_TOPICS  # noqa: E402
from tools.media.optimize_topic_images import optimize_image_bytes  # noqa: E402

OUT_DIR = PROJECT_ROOT / "frontend" / "public" / "media" / "flashcards" / "topics"

STYLE = (
    "Bright, appealing professional stock photograph. Clean natural lighting, "
    "shallow depth of field, tack-sharp focus on the subject, vivid but "
    "true-to-life colour, polished modern editorial stock-photography look, "
    "portrait orientation."
)
# A clinical scan/medical image on an instrument display is allowed (it is often
# the one-glance anchor) -- what is banned is readable text/numbers, software UI
# chrome, watermarks, branding, badges and any non-plain-blue scrubs.
NEG = (
    "Absolutely no text of any kind: no readable letters, numbers, labels, arrows "
    "or measurement numbers anywhere, including on any instrument or screen. A "
    "clinical scan or "
    "medical image may appear on an instrument display, but with no numeric "
    "readouts, no menus, buttons, toolbars or other software UI chrome, and no "
    "watermark. No logos or brand marks of any kind. No hospital, clinic or "
    "company branding. No name badges, no ID cards, no logo lanyards. Any scrubs "
    "must be plain solid blue with no coloured trim, no piping and no contrast "
    "collar."
)

# Per-topic subject prompts (crafted + adversarially clinically verified), loaded
# from the sibling data file so the expensive prompts stay reviewable/regenerable.
# Each subject self-contains its Singapore multi-ethnic context and one-glance
# clinical anchor; STYLE/NEG above enforce the look + the no-text / no-branding /
# plain-solid-blue-scrubs rules.
SUBJECTS: dict[str, str] = json.loads(
    Path(__file__).with_name("flashcard_topic_subjects.json").read_text(encoding="utf-8")
)

# Reserve pro for fine clinical detail (macro eye pathology, fundus, diagnostic
# plates/scans); everything else runs on flash. NB_MODEL overrides both.
PRO_TOPICS: frozenset[str] = frozenset({
    "__mixed", "ocular_emergencies", "red_eye", "pupil_dilation", "colour_vision",
    "amsler_macula", "endothelial", "anatomy_physiology",
    "disorders_eyelid_lacrimal_orbit", "disorders_cornea_conjunctiva",
    "disorders_lens_cataract", "disorders_uvea_retina", "glaucoma",
    "systemic_disease", "oct_macula", "oct_rnfl", "asoct", "corneal_topography",
    "hrt", "aberrometry", "retinal_imaging", "dr_grading", "pam",
})
PRO_MODEL = "gemini-3-pro-image"
FLASH_MODEL = "gemini-3.1-flash-image"


def model_for(topic_key: str) -> str:
    override = os.getenv("NB_MODEL")
    if override:
        return override
    return PRO_MODEL if topic_key in PRO_TOPICS else FLASH_MODEL


def build_prompt(topic_key: str) -> str:
    return f"{STYLE} {SUBJECTS[topic_key]} {NEG}"


def _selected_keys(pool: str, only: str | None, keys_csv: str | None) -> list[str]:
    if keys_csv:
        return [k.strip() for k in keys_csv.split(",") if k.strip()]
    if only:
        return [only]
    keys = ["__mixed"]
    pools = FLASHCARD_TOPICS if pool == "all" else {pool: FLASHCARD_TOPICS[pool]}
    for topic_list in pools.values():
        keys.extend(k for k, _label in topic_list)
    return keys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pool", default="all", choices=["all", "CLINICAL", "OT"])
    parser.add_argument("--only", default=None, help="single topic_key (or __mixed)")
    parser.add_argument("--keys", default=None, help="comma-separated topic_keys (re-runs)")
    parser.add_argument("--count", type=int, default=1, help="candidates per topic")
    parser.add_argument("--aspect", default="3:4")
    args = parser.parse_args()

    keys = _selected_keys(args.pool, args.only, args.keys)
    unknown = [k for k in keys if k not in SUBJECTS]
    if unknown:
        print(f"unknown topic_key(s): {unknown}")
        return 1
    if not os.getenv("GEMINI_API_KEY"):
        print("GEMINI_API_KEY not set - refusing to run.")
        return 1

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"generating {len(keys)} topic image(s) @ {args.aspect}")

    written = 0
    for key in keys:
        stem = "mixed" if key == "__mixed" else key
        model = model_for(key)
        tier = "pro" if model == PRO_MODEL else ("flash" if model == FLASH_MODEL else model)
        for n in range(args.count):
            suffix = "" if args.count == 1 else f"-{n:02d}"
            try:
                res = client.models.generate_content(
                    model=model,
                    contents=build_prompt(key),
                    config=types.GenerateContentConfig(
                        response_modalities=["IMAGE"],
                        image_config=types.ImageConfig(aspect_ratio=args.aspect),
                    ),
                )
                saved = False
                for part in res.candidates[0].content.parts:
                    if getattr(part, "inline_data", None):
                        out = OUT_DIR / f"{stem}{suffix}.png"
                        raw = part.inline_data.data
                        # Shrink at write time so freshly generated images are
                        # always small (~10x). On any encode hiccup, keep the raw
                        # bytes rather than lose the paid generation.
                        try:
                            data = optimize_image_bytes(raw)
                            note = f"{len(raw) // 1024} -> {len(data) // 1024} KB"
                        except Exception as exc:  # noqa: BLE001
                            data = raw
                            note = f"{len(raw) // 1024} KB RAW (optimize failed: {type(exc).__name__})"
                        out.write_bytes(data)
                        print(f"  ok {out.name} [{tier}] ({note})")
                        written += 1
                        saved = True
                        break
                if not saved:
                    print(f"  WARN {key}{suffix} [{tier}]: no image part returned")
            except Exception as exc:  # noqa: BLE001 - one bad call shouldn't kill the run
                print(f"  ERROR {key}{suffix} [{tier}]: {type(exc).__name__}: {str(exc)[:160]}")

    print(f"done: {written} image(s) -> {OUT_DIR}")
    print("Review candidates; for --count>1 pick the best and drop the -NN suffix.")
    return 0 if written else 1


if __name__ == "__main__":
    raise SystemExit(main())
