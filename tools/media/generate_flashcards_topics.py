"""Generate per-topic flashcard images for the step-2 topic fan.

One portrait image per flashcard topic (both pools) plus a mixed cover, written
to frontend/public/media/flashcards/topics/<topic_key>.png (mixed.png for the
mixed deck). Photoreal, medically/anatomically accurate; clinical-scene topics
use authentic Singapore eye-clinic settings with SingHealth blue scrubs and
orange trim. Mirrors generate_flashcards_hero.py.

Each image is auto-compressed at write time (optimize_topic_images) from the
~600 KB raw Gemini PNG to a compact ~40-90 KB progressive JPEG (dimensions kept,
served as .png via browser sniffing) so the topic fan loads fast -- no manual
re-optimize step to forget. To re-shrink files already on disk, run
`python tools/media/optimize_topic_images.py`.

PAID API -- run deliberately, only on explicit go-ahead.

    python tools/media/generate_flashcards_topics.py                 # all 31
    python tools/media/generate_flashcards_topics.py --pool OT        # one pool
    python tools/media/generate_flashcards_topics.py --only oct_macula

Without GEMINI_API_KEY it exits without calling anything. ASCII-only output.
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

from tools.flashcards.flashcard_sets import FLASHCARD_TOPICS  # noqa: E402
from tools.media.optimize_topic_images import optimize_image_bytes  # noqa: E402

OUT_DIR = PROJECT_ROOT / "frontend" / "public" / "media" / "flashcards" / "topics"

STYLE = (
    "Ultra-realistic, photorealistic clinical photograph for premium "
    "medical education. Soft natural lighting, shallow depth of field, "
    "tack-sharp focus on the subject, portrait orientation, gallery quality."
)
NEG = (
    "Absolutely no text, no letters, no numbers, no labels, no arrows, no "
    "measurement overlays, no on-screen readouts, no UI elements, no watermark, "
    "no logos."
)
DRESS = (
    "Authentic Singapore eye-clinic setting; any staff wear SingHealth blue "
    "scrubs with orange trim."
)

# Subject phrase per topic_key. Concrete topics depict the eye/instrument; the
# genuinely abstract topics depict an evocative, accurate clinical scene.
SUBJECTS: dict[str, str] = {
    "__mixed":
        "A mesmerizing macro of a single human iris in exquisite jewel-like "
        "detail, inviting and premium, evoking the whole spectrum of eye care.",
    # ── CLINICAL pool (OA / PSA) ──
    "ocular_emergencies":
        "A dramatic close-up of an acutely red, painful, inflamed human eye "
        "conveying a true ocular emergency, clinically accurate surface detail.",
    "red_eye":
        "A clinically accurate macro of a markedly red eye with diffuse "
        "conjunctival injection and watering, true-to-life vasculature.",
    "triage":
        f"{DRESS} A calm clinic triage moment: a nurse attentively assessing a "
        "seated patient at a triage station.",
    "history_taking":
        f"{DRESS} An ophthalmic assistant warmly interviewing a patient across "
        "a clinic desk, professional and attentive.",
    "distance_va":
        "A patient seated in a clinic lane reading a back-lit distance "
        "visual-acuity letter chart, the chart softly out of focus behind.",
    "near_vision":
        "A near-vision reading card held at reading distance in a patient's "
        "hands under warm light, fine print, clinically authentic.",
    "pinhole":
        "A black pinhole occluder held before a patient's eye during "
        "refraction, macro, clinically authentic.",
    "iop_nct":
        "A non-contact air-puff tonometer aligned to a patient's eye, the "
        "instrument's soft blue alignment glow, clinical close-up.",
    "eye_drops":
        "A gloved clinician instilling a single eye drop into a patient's "
        "everted lower lid, the droplet caught mid-fall, sterile and precise.",
    "pupil_dilation":
        "A macro of a widely dilated dark pupil with a faint mydriatic sheen "
        "and richly detailed iris, clinically accurate.",
    "colour_vision":
        "An extreme close-up of a pseudoisochromatic colour-vision test plate "
        "as an abstract field of coloured dots, crisp dot texture, no figure.",
    "amsler_macula":
        "A vivid retinal fundus photograph centred on the macula with the "
        "foveal reflex and fine vasculature, clinically accurate.",
    "fall_risk":
        f"{DRESS} An elderly patient safely guided by a staff member along a "
        "clinic corridor with a handrail, caring and attentive.",
    "perioperative":
        f"{DRESS} A calm pre-operative ophthalmic prep: a patient resting on a "
        "day-surgery trolley with a nurse nearby in a serene theatre anteroom.",
    "abbreviations":
        "A tidy ophthalmic clinic desk still-life with a closed patient chart "
        "folder and pen under warm light, shallow focus, calm and clean.",
    # ── OT pool ──
    "oct_macula":
        "A patient at an OCT scanner chin-rest as it captures a macular scan, "
        "the instrument optics aglow, clinical close-up.",
    "oct_rnfl":
        "A patient positioned at an OCT instrument for a retinal nerve-fibre "
        "scan, the scanning optics glowing, clinical close-up.",
    "hvf":
        "A patient seated at a white Humphrey visual-field bowl perimeter with "
        "a hand on the response button, the bowl softly lit, clinical.",
    "gvf":
        "A Goldmann kinetic perimeter bowl with the examiner's projection arm, "
        "precision vintage instrument, clinical close-up.",
    "ascan_biometry":
        "An ultrasound A-scan biometry probe gently contacting an anaesthetised "
        "eye for axial-length measurement, sterile clinical macro.",
    "optical_biometry":
        "A patient at an optical biometer capturing axial length, the alignment "
        "optics glowing, clinical close-up.",
    "endothelial":
        "A specular microscope aligned to a patient's eye capturing corneal "
        "endothelial cells, the instrument optics, clinical close-up.",
    "asoct":
        "An anterior-segment OCT aligned to a patient's eye capturing the "
        "cornea and angle, instrument optics, clinical close-up.",
    "flare":
        "A laser-flare meter aligned to a patient's eye measuring "
        "anterior-chamber flare, instrument optics, clinical close-up.",
    "corneal_topography":
        "A Placido-disc corneal topographer with its concentric ring "
        "reflection mirrored on a patient's cornea, vivid rings, clinical macro.",
    "pam":
        "A potential-acuity meter projecting a tiny acuity target into a "
        "patient's eye through the optics, clinical close-up.",
    "hrt":
        "A Heidelberg retinal tomograph scanning a patient's optic disc, "
        "confocal laser optics aglow, clinical close-up.",
    "orthoptics":
        f"{DRESS} An orthoptist performing a cover test on a child with a "
        "paddle occluder, warm and engaging.",
    "dayward_theatre":
        f"{DRESS} A calm ophthalmic operating theatre with a surgical "
        "microscope and gowned staff, sterile and serene.",
    "auto_refraction":
        "A patient at an auto-refractor and keratometer with chin on the rest "
        "looking into the optics, the instrument's target glow, clinical.",
    # ── OT gap-fill (SNEC Procedure Manual Ch5 + diagnostic docs) ──
    "aberrometry":
        "A wavefront aberrometer aligned to a patient's eye mapping optical "
        "aberrations, the instrument optics aglow, clinical close-up.",
    "lens_meter":
        "A lensmeter (focimeter) with a spectacle lens on the stage and the "
        "illuminated target reticle, precise clinical instrument macro.",
    "retinal_imaging":
        "A fundus camera capturing a richly detailed retinal photograph, the "
        "flash optics and a vivid fundus on the monitor, clinical close-up.",
    "dr_grading":
        "A graded diabetic-retinopathy fundus photograph on a reading-centre "
        "monitor with microaneurysms and haemorrhages, clinical detail.",
    # ── FOUNDATIONS pool (shared by all roles) ──
    "anatomy_physiology":
        "An elegant anatomical cross-section of the human eye rendered as a "
        "premium medical illustration, labelled structures softly implied.",
    "microbiology_infection":
        "A macro of ocular microbiology culture plates and a gloved hand "
        "practising hand hygiene, clean clinical infection-control mood.",
    "pharmacology":
        "An array of ophthalmic eye-drop bottles with colour-coded caps on a "
        "clean clinical surface, pharmacology and medication theme.",
    "professional_ethics":
        f"{DRESS} A respectful clinician-patient consultation conveying "
        "professionalism, empathy and confidentiality in a calm clinic.",
    "disorders_eyelid_lacrimal_orbit":
        "A clinical close-up of the eyelids, lash line and lacrimal region "
        "showing eyelid and tear-drainage anatomy, true-to-life detail.",
    "disorders_cornea_conjunctiva":
        "A slit-lamp macro of the cornea, sclera and conjunctiva surface with "
        "a fine light section across the clear cornea, clinically accurate.",
    "disorders_lens_cataract":
        "A slit-lamp view of the crystalline lens showing a cataract with "
        "nuclear and cortical opacity behind the pupil, clinically accurate.",
    "disorders_uvea_retina":
        "A vivid retinal fundus photograph with the optic disc, macula and "
        "vasculature representing uvea and retina, clinically accurate.",
    "glaucoma":
        "A retinal fundus photograph centred on an optic disc with a notable "
        "cup-to-disc ratio suggesting glaucoma, clinically accurate detail.",
    "neuro_strabismus":
        f"{DRESS} An orthoptist assessing eye alignment and ocular motility "
        "with a paddle occluder, neuro-ophthalmology and strabismus theme.",
    "systemic_disease":
        "A retinal fundus photograph showing systemic-disease changes such as "
        "diabetic and hypertensive retinopathy, clinically accurate.",
}


def build_prompt(topic_key: str) -> str:
    return f"{STYLE} {SUBJECTS[topic_key]} {NEG}"


def _selected_keys(pool: str, only: str | None) -> list[str]:
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
    parser.add_argument("--count", type=int, default=1, help="candidates per topic")
    parser.add_argument("--aspect", default="3:4")
    args = parser.parse_args()

    if args.only and args.only not in SUBJECTS:
        print(f"unknown topic_key: {args.only}")
        return 1
    if not os.getenv("GEMINI_API_KEY"):
        print("GEMINI_API_KEY not set - refusing to run.")
        return 1

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    model = os.getenv("NB_MODEL", "gemini-3-pro-image")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    keys = _selected_keys(args.pool, args.only)
    print(f"generating {len(keys)} topic image(s) @ {args.aspect} ({model})")

    written = 0
    for key in keys:
        stem = "mixed" if key == "__mixed" else key
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
                        print(f"  ok {out.name} ({note})")
                        written += 1
                        saved = True
                        break
                if not saved:
                    print(f"  WARN {key}{suffix}: no image part returned")
            except Exception as exc:  # noqa: BLE001 - one bad call shouldn't kill the run
                print(f"  ERROR {key}{suffix}: {type(exc).__name__}: {str(exc)[:160]}")

    print(f"done: {written} image(s) -> {OUT_DIR}")
    print("Review candidates; for --count>1 pick the best and drop the -NN suffix.")
    return 0 if written else 1


if __name__ == "__main__":
    raise SystemExit(main())
