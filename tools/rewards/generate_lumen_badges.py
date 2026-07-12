#!/usr/bin/env python3
"""Generate the Lumens vault badge medallions via Nano-Banana flash — PAID, go-ahead-gated.
reference=True (anchored to iris.png), opaque. Output lands in .tmp/lumen-badges/ for review;
--install copies approved medallions into frontend/public/brand/lumen-badges/*.jpg.

Usage:
    python tools/rewards/generate_lumen_badges.py --estimate
    python tools/rewards/generate_lumen_badges.py --generate [--only spark,supernova]
    python tools/rewards/generate_lumen_badges.py --install
"""
import argparse
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from PIL import Image

from tools.avatar import generate_sprites
from tools.rewards.lumen_badge_art import BADGES, prompt
from tools.shared.gemini_client import MOCK_MODE

MODEL = generate_sprites.MODELS["flash"]
ROOT = Path(__file__).resolve().parents[2]
TMP_DIR = ROOT / ".tmp" / "lumen-badges"
PUBLIC_DIR = ROOT / "frontend" / "public" / "brand" / "lumen-badges"


def _square(img: Image.Image, size: int = 512) -> Image.Image:
    img = img.convert("RGB")
    s = min(img.size)
    left = (img.width - s) // 2
    top = (img.height - s) // 2
    return img.crop((left, top, left + s, top + s)).resize((size, size), Image.LANCZOS)


def run_estimate() -> None:
    print(f"ESTIMATE — {len(BADGES)} Lumens badge(s) via {MODEL} (reference=True, opaque jpg)")
    for bid, b in BADGES.items():
        print(f"— {bid}:\n    {prompt(b)}\n")


def generate_one(bid: str) -> Path | None:
    if MOCK_MODE:
        raise RuntimeError("needs a live GEMINI_API_KEY; refusing to fabricate art in MOCK_MODE")
    data = generate_sprites.generate_image_bytes(prompt(BADGES[bid]), model=MODEL, reference=True)
    if not data:
        print(f"  [{bid}] no image generated")
        return None
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    out = TMP_DIR / f"{bid}.png"
    _square(Image.open(io.BytesIO(data))).save(out)
    print(f"  [{bid}] saved {out} ({out.stat().st_size:,} bytes)")
    return out


def run_generate(only: list[str] | None) -> None:
    for bid in (only or list(BADGES)):
        if bid not in BADGES:
            print(f"  [{bid}] unknown badge, skipping")
            continue
        generate_one(bid)


def run_install() -> int:
    srcs = sorted(TMP_DIR.glob("*.png"))
    if not srcs:
        print(f"nothing to install — {TMP_DIR} is empty (run --generate first)", file=sys.stderr)
        return 1
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    for src in srcs:
        if src.stem not in BADGES:
            continue
        Image.open(src).convert("RGB").save(PUBLIC_DIR / f"{src.stem}.jpg", "JPEG", quality=88)
        print(f"  installed {src.stem}.jpg")
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
