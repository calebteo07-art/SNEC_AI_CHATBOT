"""Pure-image unit tests for the composited-Eyecon real-art isolation
(`tools/avatar/generate_layers.py`). No network, no API — synthetic images only.

These guard the isolation logic the Phase-0 spike settled on: silhouette-delta +
region for props, disc-fill for the eye. Run: python -m pytest tests/avatar/test_layer_isolate.py -q
"""
from PIL import Image, ImageDraw

from tools.avatar.generate_layers import (
    CANVAS,
    EYE_DISC,
    _axis_region,
    isolate_eye,
    isolate_prop,
    iris_mask_from_eye,
    maxchan_diff,
)


def _solid(color):
    return Image.new("RGBA", (CANVAS, CANVAS), color)


def _body_base():
    """A pale-gray body disc centred low, transparent elsewhere (stand-in silhouette)."""
    img = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    ImageDraw.Draw(img).ellipse([106, 150, 406, 470], fill=(235, 232, 228, 255))
    return img


def test_maxchan_diff_zero_for_identical():
    a = _solid((120, 60, 200, 255))
    assert maxchan_diff(a, a.copy()).getbbox() is None  # all-zero → no bbox


def test_maxchan_diff_lights_up_changed_channel():
    a = _solid((10, 10, 10, 255))
    b = _solid((10, 200, 10, 255))  # green jumps 190
    ex = a.copy()
    hist = maxchan_diff(a, b).histogram()
    assert hist[190] == CANVAS * CANVAS  # every pixel differs by exactly 190


def test_isolate_prop_keeps_content_outside_the_silhouette():
    """A crown-like red bar ABOVE the body must survive; the untouched body must not."""
    base = _body_base()
    comp = base.copy()
    ImageDraw.Draw(comp).rectangle([200, 60, 312, 120], fill=(220, 30, 30, 255))  # bar above body
    out = isolate_prop(base, comp, _axis_region("topper"))
    a = out.getchannel("A")
    assert a.getpixel((256, 92)) > 120, "prop above the head is kept"
    assert a.getpixel((256, 300)) < 40, "untouched body interior is dropped"


def test_isolate_prop_keeps_strong_colour_change_over_the_body():
    base = _body_base()
    comp = base.copy()
    ImageDraw.Draw(comp).rectangle([150, 300, 360, 360], fill=(210, 20, 20, 255))  # red sash on body
    out = isolate_prop(base, comp, _axis_region("outfit"))
    assert out.getchannel("A").getpixel((256, 330)) > 120, "coloured garment over body kept"


def test_isolate_prop_region_excludes_out_of_region_change():
    """A change OUTSIDE the axis region is dropped (topper region is the top band)."""
    base = _body_base()
    comp = base.copy()
    ImageDraw.Draw(comp).rectangle([150, 400, 360, 450], fill=(210, 20, 20, 255))  # low change
    out = isolate_prop(base, comp, _axis_region("topper"))
    assert out.getchannel("A").getpixel((256, 425)) < 40, "below the topper region → dropped"


def test_isolate_eye_fills_the_disc_including_pale_sclera():
    """The eye layer must keep the whole disc (white sclera included) so a body tint
    can't bleed through the eye."""
    comp = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    cx, cy, r = EYE_DISC
    ImageDraw.Draw(comp).ellipse([cx - 80, cy - 80, cx + 80, cy + 80], fill=(250, 250, 250, 255))
    ImageDraw.Draw(comp).ellipse([cx - 30, cy - 30, cx + 30, cy + 30], fill=(140, 140, 140, 255))
    out = isolate_eye(comp)
    assert out.getchannel("A").getpixel((cx, cy)) > 120, "iris centre kept"
    assert out.getchannel("A").getpixel((cx - 60, cy)) > 120, "white sclera kept"
    assert out.getchannel("A").getpixel((10, 10)) == 0, "far outside the disc dropped"


def test_iris_mask_centres_on_the_dark_pupil():
    """The iris mask disc should follow the dark iris blob, not just the disc centre."""
    comp = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    cx, cy, r = EYE_DISC
    ImageDraw.Draw(comp).ellipse([cx - 80, cy - 80, cx + 80, cy + 80], fill=(250, 250, 250, 255))
    # dark iris offset to the left of the disc centre
    ox = cx - 40
    ImageDraw.Draw(comp).ellipse([ox - 26, cy - 26, ox + 26, cy + 26], fill=(40, 40, 40, 255))
    mask = iris_mask_from_eye(comp)
    a = mask.getchannel("A")
    assert a.getpixel((ox, cy)) > 120, "mask covers the offset iris"
    assert a.getpixel((cx + 70, cy)) < 40, "mask does not cover the far sclera edge"
