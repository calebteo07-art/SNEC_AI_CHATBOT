"""Render an on-screen caption (+ optional feature label) to a 1920x1080 RGBA PNG."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
INK = (12, 18, 28, 255)
SCRIM = (255, 255, 255, 210)
ACCENT = (37, 99, 235, 255)

def _font(size, bold=False):
    for name in (
        ("arialbd.ttf" if bold else "arial.ttf"),
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
    ):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()

def render_caption(text, out, label="", font_path=None):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    big = ImageFont.truetype(font_path, 58) if font_path else _font(58, bold=True)
    small = _font(30, bold=True)
    lines = text.split("\n")

    pad, lh = 64, 74
    block_h = lh * len(lines) + pad
    y0 = H - block_h - 96
    d.rounded_rectangle([96, y0, W - 96, y0 + block_h], radius=24, fill=SCRIM)
    ty = y0 + pad // 2
    for ln in lines:
        d.text((140, ty), ln, font=big, fill=INK)
        ty += lh

    if label:
        tw = d.textlength(label, font=small)
        d.rounded_rectangle([96, 84, 96 + tw + 56, 84 + 56], radius=28, fill=ACCENT)
        d.text((124, 98), label, font=small, fill=(255, 255, 255, 255))

    im.save(out)
    return out
