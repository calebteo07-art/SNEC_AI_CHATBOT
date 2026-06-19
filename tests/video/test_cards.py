from PIL import Image
from tools.video.cards import title_card, end_card

def test_title_card_is_opaque_1080p(tmp_path):
    out = tmp_path / "t.png"
    title_card(str(out))
    im = Image.open(out)
    assert im.size == (1920, 1080)
    # opaque background: a corner pixel is fully opaque
    assert im.convert("RGBA").getpixel((5, 5))[3] == 255

def test_end_card_is_transparent_overlay(tmp_path):
    out = tmp_path / "e.png"
    end_card(str(out))
    im = Image.open(out).convert("RGBA")
    assert im.size == (1920, 1080)
    # corner is transparent (it's an overlay), centre panel is not
    assert im.getpixel((5, 5))[3] == 0
    assert im.getpixel((960, 540))[3] > 0
