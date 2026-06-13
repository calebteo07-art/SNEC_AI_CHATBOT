"""Strip the solid white background off the SNEC logo JPG and emit a transparent PNG.

The source asset (frontend/public/brand/snec-logo.jpg) is a flat logo on pure
white. We can't just key out *all* white globally — that would also punch holes
in the white eye inside the blue icon. Instead we flood-fill from the image
border, so only white that is connected to the edge (the true background) is made
transparent; enclosed whites (icon interior) stay opaque. A light blur on the
alpha channel softens the anti-aliased cut around the text.

Usage:  python tools/media/strip_logo_bg.py
Output: frontend/public/brand/snec-logo.png
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "frontend" / "public" / "brand" / "snec-logo.jpg"
DST = ROOT / "frontend" / "public" / "brand" / "snec-logo.png"

# A pixel counts as "background white" when every channel is at least this bright.
WHITE_MIN = 232


def is_white(px: tuple[int, int, int]) -> bool:
    return px[0] >= WHITE_MIN and px[1] >= WHITE_MIN and px[2] >= WHITE_MIN


def main() -> None:
    img = Image.open(SRC).convert("RGB")
    w, h = img.size
    px = img.load()

    # BFS flood fill from every border pixel through connected near-white regions.
    bg = bytearray(w * h)  # 1 == background (to be made transparent)
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        if 0 <= x < w and 0 <= y < h and not bg[y * w + x] and is_white(px[x, y]):
            bg[y * w + x] = 1
            q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        push(x + 1, y)
        push(x - 1, y)
        push(x, y + 1)
        push(x, y - 1)

    # Build the alpha channel: transparent where flagged background, else opaque.
    alpha = Image.new("L", (w, h), 255)
    ap = alpha.load()
    for y in range(h):
        row = y * w
        for x in range(w):
            if bg[row + x]:
                ap[x, y] = 0

    # Soften the hard flood-fill edge so anti-aliased text doesn't look jagged.
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.6))

    out = img.convert("RGBA")
    out.putalpha(alpha)
    out.save(DST)

    cleared = sum(bg)
    print(f"{SRC.name} {w}x{h} -> {DST.name}: {cleared} px made transparent "
          f"({cleared / (w * h):.0%} of frame)")


if __name__ == "__main__":
    main()
