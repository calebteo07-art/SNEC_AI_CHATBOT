from PIL import Image

from tools.shared.keying import _hex_rgb, despill_green, key_out, kill_green_residue, normalize_512


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


def test_kill_green_residue_drops_darkened_chroma_leftover():
    """Contact-shadow areas blend chroma green into muddy dark-green residue that keeps a
    LOW red channel — key_out/despill/_kill_chroma all miss it. kill_green_residue drops
    those opaque green-dominant low-red pixels (measured samples from the eyeless base)."""
    img = Image.new("RGBA", (4, 1), (0, 0, 0, 0))
    img.putpixel((0, 0), (24, 93, 51, 255))    # muddy chroma residue
    img.putpixel((1, 0), (0, 44, 32, 255))     # dark chroma residue
    img.putpixel((2, 0), (16, 101, 52, 255))   # chroma residue
    img.putpixel((3, 0), (35, 78, 50, 255))    # chroma residue
    out = kill_green_residue(img)
    for x in range(4):
        assert out.getpixel((x, 0))[3] == 0, f"residue at x={x} removed"


def test_kill_green_residue_spares_body_shading_and_natural_greens():
    """Only low-red chroma leftovers go: pale body shading + genuine prop greens (higher
    red) survive byte-identical, so tinting the base or a leafy topper is unaffected."""
    keep = {
        (0, 0): (150, 174, 154, 255),   # cool body shading (red high)
        (1, 0): (96, 130, 100, 255),    # greyish body shadow (red high)
        (2, 0): (90, 150, 60, 255),     # leaf/sprout green (red well above chroma)
        (3, 0): (245, 200, 180, 255),   # peach body
        (4, 0): (100, 140, 200, 255),   # blue eye
    }
    img = Image.new("RGBA", (5, 1), (0, 0, 0, 0))
    for xy, c in keep.items():
        img.putpixel(xy, c)
    out = kill_green_residue(img)
    for xy, c in keep.items():
        assert out.getpixel(xy) == c, f"kept {c}"


def test_kill_green_residue_skips_transparent():
    img = Image.new("RGBA", (1, 1), (16, 101, 52, 0))    # residue colour but already transparent
    assert kill_green_residue(img).getpixel((0, 0)) == (16, 101, 52, 0)


def test_kill_green_residue_band_spares_rows_above_y_from():
    """`y_from` limits the sweep to the bottom contact-shadow band, so a prop's legit
    green feature higher up (e.g. a wand's sparkle) survives while the bottom smudge goes."""
    img = Image.new("RGBA", (1, 10), (0, 0, 0, 0))
    img.putpixel((0, 2), (16, 101, 52, 255))   # green feature high up — keep
    img.putpixel((0, 8), (16, 101, 52, 255))   # green residue low down — drop
    out = kill_green_residue(img, y_from=5)
    assert out.getpixel((0, 2))[3] == 255, "green above the band untouched"
    assert out.getpixel((0, 8))[3] == 0, "green inside the bottom band removed"


def test_normalize_returns_centered_square():
    out = normalize_512(key_out(_subject_on_chroma(), "#00B140"))
    assert out.size == (512, 512)
    assert out.mode == "RGBA"
    assert out.getpixel((256, 256))[3] == 255    # subject centred, opaque
    assert out.getpixel((2, 2))[3] == 0          # margin stays transparent
