"""Turn a Nano-Banana "transparent" render (which is really a flat GREY checkerboard
painted behind the subject) into a true-alpha PNG, then resize + optimise for the web.

The checkerboard + soft contact shadow are all near-grey (low saturation); the subject
is saturated with (usually) an enclosed white highlight. So we flood-fill from the
border through low-saturation pixels only — the coloured subject blocks the fill and
enclosed light areas survive. A small erode + blur on the alpha kills the grey fringe.

    python tools/media/strip_checkerboard.py <src.png> <dst.png> [--sat 46] [--size 512] [--erode 5]

Reproduce the homepage mascot:
    python tools/media/generate_mascot.py --count 3 --out .tmp/iris
    python tools/media/strip_checkerboard.py .tmp/iris/iris-00.png frontend/public/brand/iris.png
"""
from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter


def is_bg(px: tuple[int, int, int], sat: int) -> bool:
    return (max(px[0], px[1], px[2]) - min(px[0], px[1], px[2])) <= sat


def strip(src: Path, dst: Path, sat: int, size: int, erode: int) -> None:
    img = Image.open(src).convert("RGB")
    w, h = img.size
    px = img.load()

    bg = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        if 0 <= x < w and 0 <= y < h and not bg[y * w + x] and is_bg(px[x, y], sat):
            bg[y * w + x] = 1
            q.append((x, y))

    for x in range(w):
        push(x, 0); push(x, h - 1)
    for y in range(h):
        push(0, y); push(w - 1, y)
    while q:
        x, y = q.popleft()
        push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1)

    alpha = Image.new("L", (w, h), 255)
    ap = alpha.load()
    for y in range(h):
        row = y * w
        for x in range(w):
            if bg[row + x]:
                ap[x, y] = 0
    if erode > 1:
        alpha = alpha.filter(ImageFilter.MinFilter(erode))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))

    out = img.convert("RGBA")
    out.putalpha(alpha)
    if size and max(w, h) > size:
        scale = size / max(w, h)
        out = out.resize((round(w * scale), round(h * scale)), Image.LANCZOS)

    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, optimize=True)
    lo, hi = out.getchannel("A").getextrema()
    kb = dst.stat().st_size // 1024
    print(f"{src.name} -> {dst} : {out.size[0]}x{out.size[1]} RGBA alpha=({lo},{hi}) {kb} KB "
          f"({sum(bg) / (w * h):.0%} of source made transparent)")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--sat", type=int, default=46, help="max channel spread counted as grey background")
    ap.add_argument("--size", type=int, default=512, help="max output dimension (px); 0 = keep source size")
    ap.add_argument("--erode", type=int, default=5, help="MinFilter kernel to shrink the grey fringe (odd)")
    args = ap.parse_args()
    strip(Path(args.src), Path(args.dst), args.sat, args.size, args.erode)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
