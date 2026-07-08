from PIL import Image

from tools.shared.keying import _hex_rgb, despill_green, key_out, normalize_512


def _subject_on_chroma(size: int = 64, bg: str = "#00B140") -> Image.Image:
    img = Image.new("RGBA", (size, size), (*_hex_rgb(bg), 255))
    for x in range(size // 4, size * 3 // 4):      # opaque red square = the "subject"
        for y in range(size // 4, size * 3 // 4):
            img.putpixel((x, y), (220, 30, 30, 255))
    return img


def test_key_out_clears_corners_keeps_subject():
    keyed = key_out(_subject_on_chroma(), "#00B140")
    assert keyed.getpixel((0, 0))[3] == 0        # corner background → transparent
    assert keyed.getpixel((32, 32))[3] == 255    # subject centre stays opaque


def test_despill_neutralizes_green_rim_keeps_body_and_eye():
    img = Image.new("RGBA", (3, 2), (0, 0, 0, 0))          # top row = keyed-out backdrop
    img.putpixel((0, 1), (150, 200, 120, 255))   # green-spill rim pixel (touches transparency)
    img.putpixel((1, 1), (245, 200, 180, 255))   # peachy body (red dominant)
    img.putpixel((2, 1), (100, 140, 200, 255))   # blue eye (blue dominant)
    out = despill_green(img)
    assert out.getpixel((0, 1)) == (150, 150, 120, 255)   # green clamped to max(r,b)
    assert out.getpixel((1, 1)) == (245, 200, 180, 255)   # body untouched
    assert out.getpixel((2, 1)) == (100, 140, 200, 255)   # eye untouched


def test_despill_preserves_green_interior_pixels():
    # Portrait v2 feeds arbitrary student looks: mint/sage/aqua bodies are genuinely
    # green-dominant. Only the rim (within 2px of keyed transparency) may be clamped —
    # interior green must survive byte-identical.
    emerald = (46, 204, 113, 255)
    img = Image.new("RGBA", (7, 7), emerald)               # green "mint body"
    for i in range(7):
        img.putpixel((i, 0), (0, 0, 0, 0))                 # keyed-out margin (top row)
    img.putpixel((3, 1), (150, 200, 120, 255))             # spill rim pixel, 1px from transparency
    out = despill_green(img)
    assert out.getpixel((3, 1)) == (150, 150, 120, 255)    # rim clamped to max(r,b)
    assert out.getpixel((3, 4)) == emerald                 # >2px from transparency: untouched
    assert out.getpixel((3, 6)) == emerald                 # deep interior: untouched


def test_despill_skips_transparent_pixels():
    img = Image.new("RGBA", (1, 1), (0, 255, 0, 0))       # fully green but alpha 0
    assert despill_green(img).getpixel((0, 0)) == (0, 255, 0, 0)


def test_normalize_returns_centered_square():
    out = normalize_512(key_out(_subject_on_chroma(), "#00B140"))
    assert out.size == (512, 512)
    assert out.mode == "RGBA"
    assert out.getpixel((256, 256))[3] == 255    # subject centred, opaque
    assert out.getpixel((2, 2))[3] == 0          # margin stays transparent
