#!/usr/bin/env python3
"""Selena/Iris 3D art generation via Nano Banana (gemini-3-pro-image).

RICOE v2 · Foundation 2 · part 3 — the PAID, go-ahead-gated image generation that
D11 deferred. Every prompt is ANCHORED to the canonical homepage mascot
(frontend/public/brand/iris.png), passed to the model as a reference image, so
outputs resemble Iris and stay stylistically consistent across a batch (shared
reference = the main lever against cross-image drift, the hard part of D10).

Design intent: Selena *is* Iris (D9) — a one-eyed soft-3D mascot, NO hair, tiny
arms, gentle smile, transparent background so a look can drop onto any surface.

SAFETY / COST DISCIPLINE (this file only ever runs when a human invokes it):
- `--estimate`         prints the prompts + image count + rough cost. MAKES NO CALLS.
- `--pilot`            generates a tiny validation set into .tmp/selena-pilot/ for
                       human review BEFORE any full batch (the plan mandates verifying
                       a small batch first). ~3 paid images.
- Refuses to run the live path in MOCK_MODE (no key) — it can't fake real art.
- Output goes to .tmp/ (gitignored scratch); nothing here auto-commits.

Usage:
    python tools/avatar/generate_sprites.py --estimate
    python tools/avatar/generate_sprites.py --pilot
"""
import argparse
import sys
from pathlib import Path

from tools.shared.gemini_client import MOCK_MODE, _API_KEYS

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
IRIS_REF = PROJECT_ROOT / "frontend" / "public" / "brand" / "iris.png"
PILOT_DIR = PROJECT_ROOT / ".tmp" / "selena-pilot"

# "Nano Banana" image models served on this key (verified 2026-07-06). pro renders the
# richest art but is slow (~60–120s) and 504s often under load; flash is fast + reliable
# and the practical choice for a batch. Select with --model.
MODELS = {"pro": "gemini-3-pro-image", "flash": "gemini-3.1-flash-image"}
MODEL_IMAGE = MODELS["pro"]

# The invariant style contract baked into every prompt — this is what keeps a
# generated look recognizably Iris.
STYLE = (
    "Character: 'Iris', a cute one-eyed mascot. She has exactly ONE big round glossy "
    "eye centered on a smooth, rounded, hairless blob-like head/body (like the reference "
    "image), two tiny stubby arms, and a small friendly smile. Soft 3D Pixar/Ghibli style, "
    "gentle studio lighting, soft subsurface skin shading, subtle contact shadow. "
    "Front view, centered, full body, generous margin. "
    "IMPORTANT: fully TRANSPARENT background (alpha channel), no ground plane, no scene, "
    "no text, no border. Keep the same friendly proportions as the reference character."
)

# The pilot: a base render (resemblance/transparent-bg check) plus two deliberately
# unconventional looks (customization-range check — does it stay Iris when pushed?).
PILOT_LOOKS: list[tuple[str, str]] = [
    ("base-iris",
     "Render Iris exactly like the reference: peach skin, one large blue iris, calm gentle smile, "
     "one arm doing a small thumbs-up."),
    ("aqua-galaxy-crown",
     "Recolor Iris with a soft aqua-mint body. Her single eye has a swirling galaxy-purple iris with "
     "tiny sparkles. Bright delighted starry expression. A small gold crown floats just above her head, "
     "and she wears heart-shaped pink glasses over the eye."),
    ("lavender-scarf-sprout",
     "Recolor Iris with a lavender body. Big happy grin. A cozy knitted red scarf around the base of her "
     "body, and a tiny green leaf sprout growing from the top of her head."),
]


# Nano Banana pro image gen commonly runs 60–120s/image, so the shared 60s text
# client 504s on it. Use a dedicated client with a generous deadline.
_IMAGE_TIMEOUT_MS = 240_000


def _image_client():
    from google import genai
    from google.genai import types
    return genai.Client(api_key=_API_KEYS[0], http_options=types.HttpOptions(timeout=_IMAGE_TIMEOUT_MS))


def _load_reference():
    from google.genai import types
    data = IRIS_REF.read_bytes()
    return types.Part.from_bytes(data=data, mime_type="image/png")


def _prompt(look_desc: str) -> str:
    return f"{STYLE}\n\nThis specific look: {look_desc}"


def generate_one(name: str, look_desc: str, out_dir: Path, model: str = MODEL_IMAGE, attempts: int = 3) -> Path | None:
    """Generate one Iris image and save it as a PNG. Returns the path, or None.

    Retries on a transient deadline/unavailable error (image gen is slow and
    occasionally 504s server-side even within the client deadline).
    """
    from google.genai import types

    client = _image_client()
    last = ""
    for attempt in range(attempts):
        try:
            resp = client.models.generate_content(
                model=model,
                contents=[_prompt(look_desc), _load_reference()],
                config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"]),
            )
        except Exception as e:  # transient 504/503 → retry once
            last = f"{type(e).__name__}: {str(e)[:200]}"
            msg = str(e)
            if attempt + 1 < attempts and any(s in msg for s in ("504", "503", "DEADLINE", "UNAVAILABLE")):
                print(f"  [{name}] transient ({last}) — retrying…")
                continue
            print(f"  [{name}] FAILED: {last}")
            return None
        if not resp.candidates:
            print(f"  [{name}] no candidates returned")
            return None
        for part in resp.candidates[0].content.parts:
            inline = getattr(part, "inline_data", None)
            if inline is not None and getattr(inline, "data", None):
                out_dir.mkdir(parents=True, exist_ok=True)
                out = out_dir / f"{name}.png"
                out.write_bytes(inline.data)
                print(f"  [{name}] saved {out} ({len(inline.data):,} bytes)")
                return out
        txt = "".join(getattr(p, "text", "") or "" for p in resp.candidates[0].content.parts)
        print(f"  [{name}] no image part in response. Model text: {txt[:200]!r}")
        return None
    print(f"  [{name}] FAILED after {attempts} attempts: {last}")
    return None


def run_estimate(looks: list[tuple[str, str]]) -> None:
    print(f"ESTIMATE — {len(looks)} image(s) via {MODEL_IMAGE}, anchored to {IRIS_REF.name}")
    print("Rough cost: Nano Banana image output bills per generated image (a few cents each).")
    print("Confirm current pricing in the Google AI Studio dashboard before a large batch.\n")
    for name, desc in looks:
        print(f"— {name}:\n    {_prompt(desc)}\n")


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate Iris/Selena 3D art (paid; go-ahead only).")
    ap.add_argument("--estimate", action="store_true", help="Print prompts + count + cost. No API calls.")
    ap.add_argument("--pilot", action="store_true", help="Generate the ~3-image pilot into .tmp/selena-pilot/.")
    ap.add_argument("--model", choices=list(MODELS), default="pro", help="Image model (default: pro).")
    ap.add_argument("--only", default="", help="Comma-separated look names to generate (default: all).")
    args = ap.parse_args()
    model = MODELS[args.model]
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    looks = [lk for lk in PILOT_LOOKS if not only or lk[0] in only]

    if not IRIS_REF.exists():
        print(f"ERROR: reference mascot not found at {IRIS_REF}", file=sys.stderr)
        return 2

    if args.estimate or not (args.pilot):
        run_estimate(looks)
        if not args.pilot:
            return 0

    if MOCK_MODE:
        print("ERROR: no GEMINI_API_KEY configured (MOCK_MODE) — cannot generate real art.", file=sys.stderr)
        return 2

    print(f"\nPILOT — generating {len(looks)} image(s) via {model} into {PILOT_DIR} …")
    ok = 0
    for name, desc in looks:
        try:
            if generate_one(name, desc, PILOT_DIR, model=model):
                ok += 1
        except Exception as e:  # a bad key/model/quota shouldn't crash mid-batch
            print(f"  [{name}] FAILED: {type(e).__name__}: {str(e)[:300]}")
    print(f"\nDone: {ok}/{len(looks)} generated. Review them in {PILOT_DIR} before any full batch.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
