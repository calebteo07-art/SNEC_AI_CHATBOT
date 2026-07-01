"""The topic-image optimizer must shrink raw Gemini PNGs into compact JPEGs
without changing the pixel dimensions the fan expects. Pure -- no API calls,
no disk writes for the byte-level tests."""
from io import BytesIO

from PIL import Image

from tools.media.optimize_topic_images import (
    TARGET_MAX_BYTES,
    MIN_QUALITY,
    optimize_image_bytes,
)

SIZE = (896, 1200)  # the raw portrait size Gemini emits for the fan


def _raw_png(size=SIZE, mode="RGB") -> bytes:
    """A photo-ish PNG (smooth gradient + fine noise) that does NOT compress to
    nothing, so a real size reduction has to be earned by the encoder."""
    import random

    random.seed(1234)
    img = Image.new(mode, size)
    px = img.load()
    w, h = size
    for y in range(h):
        for x in range(0, w, 1):
            r = (x * 255) // w
            g = (y * 255) // h
            b = (r + g) // 2
            n = random.randint(-18, 18)
            val = tuple(max(0, min(255, c + n)) for c in (r, g, b))
            px[x, y] = val + ((255,) if mode == "RGBA" else ())
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _dims(data: bytes):
    with Image.open(BytesIO(data)) as im:
        return im.size


def test_output_is_jpeg_same_dims_and_smaller():
    raw = _raw_png()
    out = optimize_image_bytes(raw)
    assert out[:3] == b"\xff\xd8\xff", "output must be JPEG bytes (served as image/png)"
    assert _dims(out) == SIZE, "pixel dimensions must be preserved"
    assert len(out) < len(raw), "must shrink the raw PNG"
    assert len(out) <= TARGET_MAX_BYTES, "must land under the target ceiling"


def test_flattens_rgba_input():
    raw = _raw_png(mode="RGBA")
    out = optimize_image_bytes(raw)
    assert out[:3] == b"\xff\xd8\xff"
    assert _dims(out) == SIZE


def test_adaptive_quality_respects_tiny_ceiling():
    raw = _raw_png()
    ceiling = 20 * 1024
    out = optimize_image_bytes(raw, max_bytes=ceiling)
    # Either it fit under the ceiling, or it bottomed out at the quality floor.
    floor = optimize_image_bytes(raw, quality=MIN_QUALITY)
    assert len(out) <= ceiling or len(out) <= len(floor) + 16


def test_high_quality_input_stays_under_default_ceiling():
    # An already-compressible image should come out well under the ceiling.
    raw = _raw_png()
    out = optimize_image_bytes(raw)
    assert len(out) <= TARGET_MAX_BYTES
