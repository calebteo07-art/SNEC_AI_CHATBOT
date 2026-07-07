from PIL import Image

from tools.brand.keying import _hex_rgb, key_out, normalize_512


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


def test_normalize_returns_centered_square():
    out = normalize_512(key_out(_subject_on_chroma(), "#00B140"))
    assert out.size == (512, 512)
    assert out.mode == "RGBA"
    assert out.getpixel((256, 256))[3] == 255    # subject centred, opaque
    assert out.getpixel((2, 2))[3] == 0          # margin stays transparent
