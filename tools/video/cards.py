"""Render the brand title card (opaque) and end-card lockup (transparent overlay).

- title_card  -> opaque 1920x1080 aurora surface: circular eye mark + "EyeBot"
                 wordmark + descriptor. Used as scene 02's background.
- end_card    -> transparent 1920x1080 with a centered translucent panel holding the
                 "EyeBot" wordmark + tagline + SNEC logo. Composited over the scene 08
                 Veo close clip.
"""
from pathlib import Path
from PIL import Image, ImageDraw
from tools.video.captions import _font

W, H = 1920, 1080
BG = (247, 249, 252, 255)        # aurora light surface
INK = (12, 18, 28, 255)
MUTE = (96, 108, 126, 255)
PANEL = (255, 255, 255, 235)

EYE = "frontend/public/brand/login-eye.png"
SNEC = "frontend/public/brand/snec-logo.png"


def _center(d, text, font, y, fill):
    tw = d.textlength(text, font=font)
    d.text(((W - tw) / 2, y), text, font=font, fill=fill)


def _circle_eye(path, size):
    """Open the eye image and mask it into a clean circle (drops the white corners)."""
    eye = Image.open(path).convert("RGBA")
    s = min(eye.size)
    eye = eye.crop(((eye.width - s) // 2, (eye.height - s) // 2,
                    (eye.width + s) // 2, (eye.height + s) // 2)).resize((size, size))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(eye, (0, 0), mask)
    return out


def title_card(out, eye_path=EYE):
    im = Image.new("RGBA", (W, H), BG)
    d = ImageDraw.Draw(im)
    eye = _circle_eye(eye_path, 200)
    im.alpha_composite(eye, ((W - 200) // 2, 360))
    _center(d, "EyeBot", _font(104, bold=True), 600, INK)
    _center(d, "AI ophthalmology training", _font(36), 736, MUTE)
    im.save(out)
    return out


def end_card(out, snec_path=SNEC):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pw, ph = 1180, 600
    x0, y0 = (W - pw) // 2, (H - ph) // 2
    d.rounded_rectangle([x0, y0, x0 + pw, y0 + ph], radius=28, fill=PANEL)
    _center(d, "EyeBot", _font(100, bold=True), y0 + 96, INK)
    _center(d, "Your AI partner in ophthalmology training.", _font(44), y0 + 252, INK)
    snec = Image.open(snec_path).convert("RGBA")
    snec.thumbnail((460, 200))
    im.alpha_composite(snec, ((W - snec.width) // 2, y0 + ph - snec.height - 80))
    im.save(out)
    return out
