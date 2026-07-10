#!/usr/bin/env python3
"""Labeled feature-scene PLACEHOLDERS (keyless, free) — so the coverflow skin +
scrim can be verified before any paid Nano-Banana run. Each is a diagonal
tone-gradient with the scene id + "PLACEHOLDER" clearly stamped, plus a simple
Iris-hint blob, so it can never be mistaken for the real art. Overwritten by
`generate_feature_art.py --install` once real scenes are reviewed.

Usage:  python tools/brand/make_feature_placeholders.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "frontend" / "public" / "brand" / "features"
W, H = 600, 400

# id -> (top color, bottom color, iris-blob color)
TONES = {
    "tutor": ((167, 139, 250), (108, 43, 214), (255, 240, 210)),
    "vp": ((45, 212, 191), (12, 122, 122), (255, 250, 235)),
    "flash": ((253, 186, 116), (244, 63, 94), (255, 245, 225)),
}


def _lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def _gradient(top: tuple[int, int, int], bot: tuple[int, int, int]) -> Image.Image:
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        row = _lerp(top, bot, y / (H - 1))
        for x in range(W):
            px[x, y] = row
    return img


def build(pid: str) -> Image.Image:
    top, bot, blob = TONES[pid]
    img = _gradient(top, bot)
    d = ImageDraw.Draw(img)
    # simple Iris-hint: a soft body blob with one eye, upper-right
    cx, cy, r = 430, 150, 78
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=blob)
    d.ellipse([cx - 26, cy - 26, cx + 26, cy + 26], fill=(40, 40, 60))
    d.ellipse([cx - 20, cy - 20, cx + 20, cy + 20], fill=(70, 120, 220))
    d.ellipse([cx - 7, cy - 12, cx + 3, cy - 2], fill=(255, 255, 255))
    font = ImageFont.load_default()
    d.text((28, H - 54), f"{pid.upper()} — SELENA SCENE", fill=(255, 255, 255), font=font)
    d.text((28, H - 36), "PLACEHOLDER — replace via generate_feature_art.py", fill=(255, 255, 255), font=font)
    return img


def main() -> int:
    PUB.mkdir(parents=True, exist_ok=True)
    for pid in TONES:
        out = PUB / f"{pid}.webp"
        build(pid).save(out, "WEBP", quality=82)
        print(f"  wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
