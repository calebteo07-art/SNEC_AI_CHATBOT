"""Render an on-screen caption (+ optional feature label) to a 1920x1080 RGBA PNG.

No background box: text is drawn with a dark stroke + soft shadow so it stays legible
over both dark and light footage while keeping the screen clear.
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
WHITE = (255, 255, 255, 255)
STROKE = (8, 12, 20, 235)
SHADOW = (0, 0, 0, 150)


def _font(size, bold=False):
    for name in (
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        ("arialbd.ttf" if bold else "arial.ttf"),
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
    ):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _line(d, cx, y, s, font):
    """Centered text with soft shadow + stroke for legibility, no box."""
    d.text((cx + 3, y + 3), s, font=font, fill=SHADOW, anchor="ma")
    d.text((cx, y), s, font=font, fill=WHITE, anchor="ma",
           stroke_width=4, stroke_fill=STROKE)


def render_caption(text, out, label="", font_path=None):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    big = ImageFont.truetype(font_path, 56) if font_path else _font(56, bold=True)
    small = _font(28, bold=True)
    lines = text.split("\n")

    lh = 70
    y = H - 88 - lh * len(lines)
    if label:
        _line(d, W // 2, y - 52, label.upper(), small)   # kicker sits just above the caption
    for ln in lines:
        _line(d, W // 2, y, ln, big)
        y += lh

    im.save(out)
    return out
