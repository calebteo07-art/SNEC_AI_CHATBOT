#!/usr/bin/env python3
"""Keyless placeholder art for the Lumens vault badges + reward banners so the app ships
GREEN before any paid nano-banana run. Clearly stamped PLACEHOLDER; overwritten by the
real generators' --install. No API calls.

Usage: python tools/rewards/make_reward_placeholders.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from PIL import Image, ImageDraw

from tools.rewards.lumen_badge_art import BADGES
from tools.rewards.banner_art import BANNERS

ROOT = Path(__file__).resolve().parents[2]
BADGE_DIR = ROOT / "frontend" / "public" / "brand" / "lumen-badges"
BANNER_DIR = ROOT / "frontend" / "public" / "brand" / "reward-banners"


def _grad(w: int, h: int, top: tuple, bot: tuple) -> Image.Image:
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        px_row = tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = px_row
    return img


def _stamp(img: Image.Image, label: str) -> None:
    d = ImageDraw.Draw(img)
    d.text((14, 12), "PLACEHOLDER", fill=(255, 255, 255))
    d.text((14, img.height - 24), label, fill=(255, 236, 170))


def main() -> None:
    BADGE_DIR.mkdir(parents=True, exist_ok=True)
    BANNER_DIR.mkdir(parents=True, exist_ok=True)
    for bid, b in BADGES.items():
        img = _grad(512, 512, (18, 26, 48), (230, 169, 0))
        d = ImageDraw.Draw(img)
        d.ellipse((156, 156, 356, 356), outline=(255, 236, 170), width=6)
        _stamp(img, f"lumen badge: {b['name']}")
        img.save(BADGE_DIR / f"{bid}.jpg", "JPEG", quality=82)
        print(f"  placeholder {BADGE_DIR.name}/{bid}.jpg")
    for cid in BANNERS:
        img = _grad(1200, 520, (14, 20, 38), (34, 188, 255))
        _stamp(img, f"reward banner: {cid}")
        img.save(BANNER_DIR / f"{cid}.webp", "WEBP")
        print(f"  placeholder {BANNER_DIR.name}/{cid}.webp")


if __name__ == "__main__":
    main()
