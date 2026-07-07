#!/usr/bin/env python3
"""Clearly-marked placeholder logo poses so the frontend ships green keyless
(logo→raster brief; placeholders-first). Each placeholder is the real iris.png
given a distinct hue-shift + tilt + a faint 'PLACEHOLDER' watermark, so it reads
as Selena-ish but is never mistaken for final art. Replaced by
`generate_poses.py --install` on go-ahead. Keeps alpha (webp RGBA)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from PIL import Image, ImageDraw

from tools.brand.logo_poses import POSES

ROOT = Path(__file__).resolve().parents[2]
IRIS = ROOT / "frontend" / "public" / "brand" / "iris.png"
OUT = ROOT / "frontend" / "public" / "brand" / "poses"
TILT = {"wave": -10.0, "cheer": 0.0, "groove": 9.0}
HUE = {"wave": (1.00, 1.02, 1.00), "cheer": (1.05, 1.05, 0.98), "groove": (0.97, 1.00, 1.06)}


def _tint(img: Image.Image, f: tuple[float, float, float]) -> Image.Image:
    r, g, b, a = img.split()
    r = r.point(lambda v: min(255, int(v * f[0])))
    g = g.point(lambda v: min(255, int(v * f[1])))
    b = b.point(lambda v: min(255, int(v * f[2])))
    return Image.merge("RGBA", (r, g, b, a))


def main() -> int:
    base = Image.open(IRIS).convert("RGBA")
    OUT.mkdir(parents=True, exist_ok=True)
    for pid in POSES:
        im = _tint(base, HUE[pid]).rotate(TILT[pid], resample=Image.BICUBIC, expand=False)
        ImageDraw.Draw(im).text((14, im.height - 30), "PLACEHOLDER", fill=(20, 20, 25, 130))
        im.save(OUT / f"{pid}.webp", "WEBP", quality=88)
        print(f"  placeholder /brand/poses/{pid}.webp")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
