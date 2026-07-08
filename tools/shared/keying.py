"""Chroma-key helpers — restore transparency to opaque flash renders.

flash-image can't emit alpha: renders come back opaque on a flat chroma
backdrop. `key_out` floods that backdrop to transparent from the corners;
`despill_green` neutralises the green rim; `normalize_512` trims to the
subject and letterboxes onto a 512² canvas so frames register with iris.png.
Pure PIL. PROD-PATH code: the Selena portrait pipeline keys every student
render server-side (as well as the offline brand/tile asset builds)."""
from __future__ import annotations

from collections import deque

from PIL import Image, ImageFilter

BG_KEY = "#00B140"  # canonical flat chroma-green backdrop (absent from the mascot's palette)


def _hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def key_out(img: Image.Image, bg_hex: str, tol: int = 48) -> Image.Image:
    """Flood-fill the flat background to alpha=0 from all four corners.

    4-connected BFS over pixels within `tol` (max per-channel distance) of the
    background colour, seeded from the corners. Only the contiguous background is
    removed — same-coloured pixels enclosed by the subject are kept."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    br, bg, bb = _hex_rgb(bg_hex)
    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def close(r: int, g: int, b: int) -> bool:
        return abs(r - br) <= tol and abs(g - bg) <= tol and abs(b - bb) <= tol

    for cx, cy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        idx = cy * w + cx
        if not seen[idx]:
            r, g, b, _ = px[cx, cy]
            if close(r, g, b):
                seen[idx] = 1
                q.append((cx, cy))
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                r, g, b, a = px[nx, ny]
                if a != 0 and close(r, g, b):
                    seen[ny * w + nx] = 1
                    q.append((nx, ny))
    return img


def despill_green(img: Image.Image) -> Image.Image:
    """Neutralise green chroma spill on the keyed subject's anti-aliased edge.

    Corner-flood keying leaves a rim of edge pixels that blended the subject with
    the green backdrop — a faint green outline on light surfaces. Spill lives ONLY
    on that rim, so the clamp (green down to max(red, blue)) is restricted to
    opaque green-dominant pixels within 2px of keyed transparency: portrait configs
    include genuinely green subjects (mint/sage/aqua bodies, green outfits) whose
    interiors must survive untouched. The rim mask is the alpha==0 mask dilated by
    a 5×5 max filter (transparent neighbour within Chebyshev distance 2)."""
    img = img.convert("RGBA")
    rim = img.getchannel("A").point(lambda a: 255 if a == 0 else 0).filter(ImageFilter.MaxFilter(5))
    px = img.load()
    rm = rim.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and g > r and g > b and rm[x, y]:
                px[x, y] = (r, max(r, b), b, a)
    return img


def normalize_512(img: Image.Image, canvas: int = 512, margin: float = 0.06) -> Image.Image:
    """Trim to the opaque subject, centre it, and letterbox onto a transparent
    square canvas so every pose shares the iris.png framing/scale."""
    img = img.convert("RGBA")
    bbox = img.getbbox()          # bbox of the non-transparent region
    if bbox:
        img = img.crop(bbox)
    sw, sh = img.size
    inner = int(canvas * (1 - 2 * margin))
    scale = min(inner / sw, inner / sh)
    img = img.resize((max(1, round(sw * scale)), max(1, round(sh * scale))), Image.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(img, ((canvas - img.width) // 2, (canvas - img.height) // 2), img)
    return out
