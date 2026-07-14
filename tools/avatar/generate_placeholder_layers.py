#!/usr/bin/env python3
"""Keyless Pillow placeholder generator for the composited <Eyecon> layer model
(`frontend/src/aurora/avatar/layers.ts`). NO Gemini, NO network — pure shapes +
built-in font so the whole composite renders end-to-end and is visually
testable before paid art lands. Deterministic (no randomness).

Writes, under `frontend/public/avatar/`:
  base/body.webp                        — soft light neutral-gray body silhouette
  overlay/<axis>/<id>.webp              — per non-"none" option id, axis in
                                           {outfit, eyeShape, accessory, topper}
  overlay/eyeShape/<id>.iris.webp       — opaque white disc mask for the iris tint

Ids are iterated from `tools.avatar.parts.AVATAR_AXES`, the single source of
truth for valid option ids, so this can never drift from the registry.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from PIL import Image, ImageDraw, ImageFont  # noqa: E402

from tools.avatar.parts import AVATAR_AXES  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "frontend" / "public" / "avatar"

SIZE = 512
FONT = ImageFont.load_default(size=16)
FONT_SMALL = ImageFont.load_default(size=12)

OVERLAY_AXES = ["outfit", "eyeShape", "accessory", "topper"]

# Per-axis anchor point in the shared 512^2 registration space.
ANCHOR: dict[str, tuple[int, int]] = {
    "topper": (256, 90),
    "eyeShape": (256, 235),
    "accessory": (365, 300),
    "outfit": (256, 385),
}

# Distinct semi-translucent hue per non-eye axis so stacked placeholder layers
# are visually distinguishable from one another.
AXIS_COLOR: dict[str, tuple[int, int, int, int]] = {
    "topper": (255, 176, 59, 150),      # amber
    "accessory": (196, 105, 224, 150),  # violet
    "outfit": (90, 191, 158, 150),      # teal-green
}

BODY_FILL = (216, 210, 204, 255)   # light neutral-gray #D8D2CC — reads well multiplied
BODY_TEXT = (120, 112, 104, 255)
IRIS_GRAY = (150, 150, 150, 255)   # neutral iris disc the iris tint multiplies onto
IRIS_RADIUS = 34


def _blank() -> Image.Image:
    return Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))


def _centered_text(draw: ImageDraw.ImageDraw, xy: tuple[float, float], text: str,
                    fill: tuple[int, int, int, int], font: ImageFont.ImageFont = FONT) -> None:
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x, y = xy
    draw.text((x - w / 2 - bbox[0], y - h / 2 - bbox[1]), text, font=font, fill=fill,
               stroke_width=1, stroke_fill=(255, 255, 255, 200))


def make_body() -> Image.Image:
    """base/body.webp: a large rounded blob filling most of the canvas, centered,
    transparent outside the silhouette. Light neutral-gray so a multiply colour
    tint (bodyTint) reads well on top."""
    img = _blank()
    draw = ImageDraw.Draw(img)
    margin = 40
    draw.rounded_rectangle(
        [margin, margin + 20, SIZE - margin, SIZE - margin + 10],
        radius=180, fill=BODY_FILL,
    )
    _centered_text(draw, (SIZE / 2, SIZE / 2), "body", BODY_TEXT)
    return img


def make_overlay(axis: str, option_id: str) -> Image.Image:
    """overlay/<axis>/<id>.webp: a semi-translucent coloured shape at the axis's
    anchor with the id text drawn on it. eyeShape gets a real eye outline + a
    neutral gray iris disc instead of a plain coloured blob."""
    img = _blank()
    draw = ImageDraw.Draw(img)
    cx, cy = ANCHOR[axis]

    if axis == "eyeShape":
        draw.ellipse([cx - 90, cy - 50, cx + 90, cy + 50],
                     fill=(255, 255, 255, 235), outline=(60, 60, 65, 255), width=4)
        draw.ellipse([cx - IRIS_RADIUS, cy - IRIS_RADIUS, cx + IRIS_RADIUS, cy + IRIS_RADIUS],
                     fill=IRIS_GRAY)
        _centered_text(draw, (cx, cy + 72), option_id, (40, 40, 45, 255), font=FONT_SMALL)
    else:
        color = AXIS_COLOR[axis]
        draw.ellipse([cx - 85, cy - 60, cx + 85, cy + 60],
                     fill=color, outline=(255, 255, 255, 210), width=3)
        _centered_text(draw, (cx, cy), option_id, (25, 25, 25, 255), font=FONT_SMALL)

    return img


def make_iris_mask() -> Image.Image:
    """overlay/eyeShape/<id>.iris.webp: opaque white disc on transparent — the
    alpha mask the iris colour tint is clipped to."""
    img = _blank()
    draw = ImageDraw.Draw(img)
    cx, cy = ANCHOR["eyeShape"]
    draw.ellipse([cx - IRIS_RADIUS, cy - IRIS_RADIUS, cx + IRIS_RADIUS, cy + IRIS_RADIUS],
                 fill=(255, 255, 255, 255))
    return img


def main() -> int:
    base_dir = OUT_DIR / "base"
    base_dir.mkdir(parents=True, exist_ok=True)
    make_body().save(base_dir / "body.webp", "WEBP")

    overlay_counts: dict[str, int] = {}
    iris_count = 0
    for axis in OVERLAY_AXES:
        axis_dir = OUT_DIR / "overlay" / axis
        axis_dir.mkdir(parents=True, exist_ok=True)
        n = 0
        for option_id in AVATAR_AXES[axis]:
            if option_id == "none":
                continue
            make_overlay(axis, option_id).save(axis_dir / f"{option_id}.webp", "WEBP")
            n += 1
            if axis == "eyeShape":
                make_iris_mask().save(axis_dir / f"{option_id}.iris.webp", "WEBP")
                iris_count += 1
        overlay_counts[axis] = n

    total = 1 + sum(overlay_counts.values()) + iris_count
    print("base: 1")
    for axis, n in overlay_counts.items():
        print(f"overlay/{axis}: {n}")
    print(f"iris masks: {iris_count}")
    print(f"total files written: {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
