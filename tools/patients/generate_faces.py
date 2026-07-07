#!/usr/bin/env python3
"""OSCE patient faces via Nano Banana flash — PAID, go-ahead-gated (RICOE §8).

Mirrors tools/avatar/generate_sprites.py's cost discipline. Unlike the Selena
portraits, patient faces are NOT anchored to the Iris mascot (reference=False) —
they are warm, semi-realistic Singaporean patient portraits. Output lands in
.tmp/patient-faces/ for human review; --install copies approved faces into
frontend/public/patients/, overwriting the placeholders.

Usage:
    python tools/patients/generate_faces.py --estimate           # prints prompts, NO calls
    python tools/patients/generate_faces.py --generate [--only a,b]
    python tools/patients/generate_faces.py --install
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # repo root, so `tools.*` resolves when run by path

from tools.avatar import generate_sprites
from tools.patients.archetypes import ARCHETYPES, face_path
from tools.shared.gemini_client import MOCK_MODE

MODEL = generate_sprites.MODELS["flash"]  # ricoe §8 P2 — flash only
PROJECT_ROOT = Path(__file__).resolve().parents[2]
TMP_DIR = PROJECT_ROOT / ".tmp" / "patient-faces"
PUBLIC_DIR = PROJECT_ROOT / "frontend" / "public" / "patients"


def build_estimate() -> list[tuple[str, str]]:
    """(archetype_id, prompt) for every archetype — the estimate/generate worklist."""
    return [(aid, arch.prompt) for aid, arch in ARCHETYPES.items()]


def generate_one(archetype_id: str) -> Path | None:
    """Render one archetype face (LIVE + PAID). Refuses in MOCK_MODE. Writes image bytes."""
    if MOCK_MODE:
        raise RuntimeError("generate_one needs a live GEMINI_API_KEY; refusing to fabricate art in MOCK_MODE")
    arch = ARCHETYPES[archetype_id]
    data = generate_sprites.generate_image_bytes(arch.prompt, model=MODEL, reference=False)
    if not data:
        print(f"  [{archetype_id}] no image generated")
        return None
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    out = TMP_DIR / f"{archetype_id}.png"
    out.write_bytes(data)
    print(f"  [{archetype_id}] saved {out} ({len(data):,} bytes)")
    return out


def run_estimate() -> None:
    rows = build_estimate()
    print(f"ESTIMATE — {len(rows)} patient face(s) via {MODEL} (reference=False, warm semi-realistic)")
    print("Rough cost: flash image output bills a few cents each; confirm current pricing before the batch.\n")
    for aid, prompt in rows:
        print(f"— {aid}:\n    {prompt}\n")


def run_install() -> int:
    """Convert reviewed .tmp/patient-faces/*.png → frontend/public/patients/*.webp."""
    from PIL import Image
    srcs = sorted(TMP_DIR.glob("*.png"))
    if not srcs:
        print(f"nothing to install — {TMP_DIR} is empty (run --generate first)", file=sys.stderr)
        return 1
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    for src in srcs:
        aid = src.stem
        if aid not in ARCHETYPES:
            print(f"  skip {src.name} — not a known archetype")
            continue
        Image.open(src).convert("RGB").save(PUBLIC_DIR / f"{aid}.webp", "WEBP", quality=88)
        print(f"  installed {face_path(aid)}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate OSCE patient faces (paid; go-ahead only).")
    ap.add_argument("--estimate", action="store_true", help="Print prompts + count. No API calls.")
    ap.add_argument("--generate", action="store_true", help="Generate faces into .tmp/patient-faces/ (PAID).")
    ap.add_argument("--install", action="store_true", help="Copy reviewed faces into frontend/public/patients/.")
    ap.add_argument("--only", default="", help="Comma-separated archetype ids (default: all).")
    args = ap.parse_args()

    if args.install:
        return run_install()
    if not args.generate:
        run_estimate()
        return 0

    if MOCK_MODE:
        print("ERROR: no GEMINI_API_KEY (MOCK_MODE) — cannot generate real art.", file=sys.stderr)
        return 2
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    ids = [a for a in ARCHETYPES if not only or a in only]
    print(f"\nGENERATING {len(ids)} face(s) via {MODEL} into {TMP_DIR} …")
    ok = 0
    for aid in ids:
        try:
            if generate_one(aid):
                ok += 1
        except Exception as e:
            print(f"  [{aid}] FAILED: {type(e).__name__}: {str(e)[:300]}")
    print(f"\nDone: {ok}/{len(ids)} generated. Review {TMP_DIR} before --install.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
