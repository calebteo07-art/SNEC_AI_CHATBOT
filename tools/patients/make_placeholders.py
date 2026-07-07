#!/usr/bin/env python3
"""Generate clearly-marked placeholder patient faces for all archetypes.

Free + keyless (Pillow only). Draws a soft warm gradient tile with the archetype
label + a "PLACEHOLDER" band, so the frontend surface ships and passes the harness
before any paid Nano-Banana art exists (RICOE placeholders-first rule). The real
faces are produced later by generate_faces.py and overwrite these files.

Usage:  python tools/patients/make_placeholders.py
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # repo root, so `tools.*` resolves when run by path
from tools.patients.archetypes import ARCHETYPES

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "patients"
SIZE = 256


def _tile(label: str) -> Image.Image:
    img = Image.new("RGB", (SIZE, SIZE), (236, 230, 218))
    d = ImageDraw.Draw(img)
    for y in range(SIZE):  # warm vertical gradient
        t = y / SIZE
        d.line([(0, y), (SIZE, y)], fill=(int(216 - 20 * t), int(150 - 10 * t), int(123 - 8 * t)))
    d.ellipse([SIZE * 0.30, SIZE * 0.22, SIZE * 0.70, SIZE * 0.62], fill=(255, 255, 255))  # head
    d.rectangle([SIZE * 0.22, SIZE * 0.66, SIZE * 0.78, SIZE * 0.95], fill=(255, 255, 255))  # shoulders
    d.text((10, 8), "PLACEHOLDER", fill=(90, 40, 20))
    d.text((10, SIZE - 22), label, fill=(60, 30, 15))
    return img


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for aid in ARCHETYPES:
        _tile(aid).save(OUT / f"{aid}.webp", "WEBP", quality=80)
    print(f"wrote {len(ARCHETYPES)} placeholders -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
