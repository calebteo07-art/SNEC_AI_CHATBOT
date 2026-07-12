#!/usr/bin/env python3
"""Generate the reward banner backdrops via Nano-Banana flash — PAID, go-ahead-gated.
reference=True (anchored to iris.png so the mascot stays smooth/hairless, not furry),
landscape-ish. Output lands in .tmp/reward-banners/ for review;
--install copies approved banners into frontend/public/brand/reward-banners/*.webp.

Usage:
    python tools/rewards/generate_reward_banners.py --estimate
    python tools/rewards/generate_reward_banners.py --generate [--only level-up,badge-unlock]
    python tools/rewards/generate_reward_banners.py --install
"""
import argparse
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from PIL import Image

from tools.avatar import generate_sprites
from tools.rewards.banner_art import BANNERS, prompt
from tools.shared.gemini_client import MOCK_MODE

MODEL = generate_sprites.MODELS["flash"]
ROOT = Path(__file__).resolve().parents[2]
TMP_DIR = ROOT / ".tmp" / "reward-banners"
PUBLIC_DIR = ROOT / "frontend" / "public" / "brand" / "reward-banners"


def run_estimate() -> None:
    print(f"ESTIMATE — {len(BANNERS)} reward banner(s) via {MODEL} (reference=True, webp)")
    for cid, b in BANNERS.items():
        print(f"— {cid}:\n    {prompt(b)}\n")


def generate_one(cid: str) -> Path | None:
    if MOCK_MODE:
        raise RuntimeError("needs a live GEMINI_API_KEY; refusing to fabricate art in MOCK_MODE")
    data = generate_sprites.generate_image_bytes(prompt(BANNERS[cid]), model=MODEL, reference=True)
    if not data:
        print(f"  [{cid}] no image generated")
        return None
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    out = TMP_DIR / f"{cid}.png"
    Image.open(io.BytesIO(data)).save(out)
    print(f"  [{cid}] saved {out} ({out.stat().st_size:,} bytes)")
    return out


def run_generate(only: list[str] | None) -> None:
    for cid in (only or list(BANNERS)):
        if cid not in BANNERS:
            print(f"  [{cid}] unknown banner, skipping")
            continue
        generate_one(cid)


def run_install() -> int:
    srcs = sorted(TMP_DIR.glob("*.png"))
    if not srcs:
        print(f"nothing to install — {TMP_DIR} is empty (run --generate first)", file=sys.stderr)
        return 1
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    for src in srcs:
        if src.stem not in BANNERS:
            continue
        Image.open(src).save(PUBLIC_DIR / f"{src.stem}.webp", "WEBP")
        print(f"  installed {src.stem}.webp")
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
