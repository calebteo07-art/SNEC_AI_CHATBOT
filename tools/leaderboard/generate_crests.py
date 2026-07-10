#!/usr/bin/env python3
"""Generate the leaderboard tier crests + champion crown via Nano-Banana flash — PAID,
go-ahead-gated. reference=False (standalone emblems), keyed to transparency + normalised
to 512². Output lands in .tmp/leaderboard-crests/ for review; --install copies approved
crests into frontend/public/brand/tiers/*.webp. Mirrors tools/brand/generate_poses.py.

Usage:
    python tools/leaderboard/generate_crests.py --estimate            # prints prompts, NO calls
    python tools/leaderboard/generate_crests.py --generate [--only gold,crown]
    python tools/leaderboard/generate_crests.py --install
"""
import argparse
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # repo root, so `tools.*` resolves by path

from PIL import Image

from tools.avatar import generate_sprites
from tools.leaderboard.crest_art import BG_KEY, CRESTS, prompt
from tools.shared import keying
from tools.shared.gemini_client import MOCK_MODE

MODEL = generate_sprites.MODELS["flash"]  # nano-banana flash only
ROOT = Path(__file__).resolve().parents[2]
TMP_DIR = ROOT / ".tmp" / "leaderboard-crests"
PUBLIC_DIR = ROOT / "frontend" / "public" / "brand" / "tiers"


def run_estimate() -> None:
    print(f"ESTIMATE — {len(CRESTS)} crest(s) via {MODEL} (reference=False, keyed to alpha)")
    print("Rough cost: flash image output bills a few cents each; confirm current pricing before the batch.\n")
    for cid, crest in CRESTS.items():
        print(f"— {cid}:\n    {prompt(crest)}\n")


def generate_one(cid: str) -> Path | None:
    if MOCK_MODE:
        raise RuntimeError("generate_one needs a live GEMINI_API_KEY; refusing to fabricate art in MOCK_MODE")
    data = generate_sprites.generate_image_bytes(prompt(CRESTS[cid]), model=MODEL, reference=False)
    if not data:
        print(f"  [{cid}] no image generated")
        return None
    keyed = keying.normalize_512(keying.despill_green(keying.key_out(Image.open(io.BytesIO(data)), BG_KEY)))
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    out = TMP_DIR / f"{cid}.png"
    keyed.save(out)
    print(f"  [{cid}] saved {out} ({out.stat().st_size:,} bytes, keyed+normalised)")
    return out


def run_generate(only: list[str] | None) -> None:
    for cid in (only or list(CRESTS)):
        if cid not in CRESTS:
            print(f"  [{cid}] unknown crest, skipping")
            continue
        generate_one(cid)


def run_install() -> int:
    srcs = sorted(TMP_DIR.glob("*.png"))
    if not srcs:
        print(f"nothing to install — {TMP_DIR} is empty (run --generate first)", file=sys.stderr)
        return 1
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    for src in srcs:
        cid = src.stem
        if cid not in CRESTS:
            continue
        Image.open(src).save(PUBLIC_DIR / f"{cid}.webp", "WEBP")
        print(f"  installed {cid}.webp")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--estimate", action="store_true")
    ap.add_argument("--generate", action="store_true")
    ap.add_argument("--install", action="store_true")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    only = [x for x in args.only.split(",") if x] or None
    if args.estimate:
        run_estimate()
    elif args.generate:
        run_generate(only)
    elif args.install:
        sys.exit(run_install())
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
