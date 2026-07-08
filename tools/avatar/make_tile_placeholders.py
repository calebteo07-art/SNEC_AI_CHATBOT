#!/usr/bin/env python3
"""Clearly-marked placeholder tiles so the Studio ships green keyless
(placeholders-first rule). Each is the real iris.png with a distinct per-axis
hue tint + the option id + 'PLACEHOLDER' watermarked on, so it reads as Selena
but is never mistaken for final art. Replaced per-id by
`generate_tiles.py --install` on explicit go-ahead. Idempotent; skips files
already replaced by real art (real tiles carry no watermark, but we can't tell —
so --force rewrites everything, default only fills gaps)."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from PIL import Image, ImageDraw

from tools.avatar.tiles import TILE_AXES, tile_ids, tile_path

ROOT = Path(__file__).resolve().parents[2]
IRIS = ROOT / "frontend" / "public" / "brand" / "iris.png"
# a distinct tint per axis so placeholder grids don't read as identical
AXIS_TINT = {
    "eyeShape": (1.04, 1.00, 0.96), "lashes": (1.00, 0.98, 1.05), "mouth": (1.05, 1.02, 0.97),
    "glasses": (0.97, 1.02, 1.05), "topper": (1.06, 1.00, 1.00), "accessory": (0.98, 1.05, 1.00),
    "outfit": (1.00, 1.03, 1.04),
}


def _tint(img: Image.Image, f: tuple[float, float, float]) -> Image.Image:
    r, g, b, a = img.split()
    r = r.point(lambda v: min(255, int(v * f[0])))
    g = g.point(lambda v: min(255, int(v * f[1])))
    b = b.point(lambda v: min(255, int(v * f[2])))
    return Image.merge("RGBA", (r, g, b, a))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="rewrite existing files too")
    args = ap.parse_args()
    base = Image.open(IRIS).convert("RGBA")
    wrote = 0
    for axis in TILE_AXES:
        for oid in tile_ids(axis):
            out = tile_path(axis, oid)
            if out.exists() and not args.force:
                continue
            out.parent.mkdir(parents=True, exist_ok=True)
            im = _tint(base, AXIS_TINT[axis])
            d = ImageDraw.Draw(im)
            d.text((14, 12), oid, fill=(25, 25, 30, 200))
            d.text((14, im.height - 30), "PLACEHOLDER", fill=(20, 20, 25, 130))
            im.save(out, "WEBP", quality=80)
            wrote += 1
    print(f"placeholder tiles written: {wrote}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
