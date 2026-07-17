"""Generate the leaderboard's Nano-Banana art — a subtle abstract arena background and three
metallic podium cards (gold/silver/bronze) — into frontend/public/brand/leaderboard/.

The background is deliberately NOT a scene (the earlier literal 'hall of champions' render read
tacky under the flat vector UI): it is a tone-on-tone antique-gold/espresso surface with a very
subtle debossed laurel-wreath + sunburst motif, back-sitting and in the exact component palette,
so the board reads as one system. Decorative art only (no mascot reference), tuned to leave a
clean top-centre plinth for the portrait and a calm lower band for text. Saved as webp (light for
prod) with a PNG fallback if Pillow is missing. Reuses the shared image core so there's one place
that talks to Gemini.

    python tools/leaderboard/generate_board_art.py            # all four
    python tools/leaderboard/generate_board_art.py --only bg  # one
"""
import argparse
import io
import sys
from pathlib import Path

from tools.avatar.generate_sprites import generate_image_bytes
from tools.shared.gemini_client import MOCK_MODE

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "brand" / "leaderboard"

# Every prompt ends with this so the model reserves space for the HTML overlaid on top and
# never bakes in text/characters that would fight the real content.
CLEAN = ("Absolutely NO text, NO numbers, NO letters, NO words, NO characters, NO faces, "
         "NO logos, NO UI buttons. Soft premium 3D game art, elegant, high quality, smooth.")

# Shared podium composition so all three cards align pixel-for-pixel under the HTML overlay:
# a COMPACT portrait card (short, not tall), plinth in the upper half, and a clean nameplate
# plate in the lower third where the frontend paints the name + Lumens on top.
PED_LAYOUT = (
    "A compact ornate collectible trophy card for a premium game leaderboard, portrait format but "
    "SHORT and stout (not tall or elongated), richly framed right to the edges with an elegant "
    "decorative border and tiny gem accents. In the UPPER HALF a bright soft circular halo "
    "spotlight forms a clean glowing plinth ready for a portrait. In the LOWER THIRD a smooth "
    "elegant horizontal nameplate plaque, calm and empty, ready for a name and number to rest on "
    "it. Compact and full — almost no dead space in the middle. ")

JOBS: dict[str, tuple[str, str]] = {
    # Abstract, back-sitting, in-palette — NOT a scene (see module docstring). 16:9 so it is not
    # stretched on the viewport-locked landscape canvas; centred by CSS so the wreath lands in the
    # side-gutters. CLEAN forbids text/objects/architecture; the rest keeps it tone-on-tone.
    "bg": ("16:9",
        "A refined ABSTRACT tone-on-tone background — warm antique gold and deep espresso brown — "
        "with a VERY SUBTLE debossed radiating sunburst-and-laurel motif pressed into a matte "
        "premium surface like aged leather or brushed bronze: extremely low relief, low contrast, "
        "almost flat and quiet. A soft warm champagne glow sits in the upper-centre and fades to a "
        "brown vignette at the edges. Elegant, luxurious, understated, tactile. It is pure abstract "
        "atmosphere — very soft focus, gently desaturated and muted so bright UI cards sit on top "
        "and pop; the middle stays calm and even. Warm palette ONLY — champagne cream (#ECD9BC), "
        "warm honey gold (#F59E0B), deep espresso brown (#33210f). " + CLEAN),
    "ped-gold": ("4:5",
        PED_LAYOUT + "CHAMPION card in radiant polished GOLD and warm amber with a celebratory "
        "glow, subtle laurel accents and floating gold sparkles. " + CLEAN),
    "ped-silver": ("4:5",
        PED_LAYOUT + "2nd-place card in cool polished SILVER and platinum with icy white-blue "
        "highlights, a refined glow and gentle sparkles. " + CLEAN),
    "ped-bronze": ("4:5",
        PED_LAYOUT + "3rd-place card in rich BRONZE and copper with deep warm brown-orange "
        "metallic tones, a warm glow and gentle sparkles. " + CLEAN),
}


def _save(data: bytes, stem: str) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(data)).convert("RGB")
        out = OUT / f"{stem}.webp"
        img.save(out, "WEBP", quality=82, method=6)
    except Exception as e:  # no Pillow / decode issue → keep raw PNG
        print(f"  (webp encode skipped: {type(e).__name__}) — saving PNG")
        out = OUT / f"{stem}.png"
        out.write_bytes(data)
    print(f"  [{stem}] saved {out} ({out.stat().st_size:,} bytes)")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="comma-separated job names (default: all)")
    args = ap.parse_args()
    if MOCK_MODE:
        print("ERROR: no GEMINI_API_KEY (MOCK_MODE) — cannot generate real art.", file=sys.stderr)
        return 2
    names = [n.strip() for n in args.only.split(",") if n.strip()] or list(JOBS)
    ok = 0
    for name in names:
        aspect, prompt = JOBS[name]
        print(f"\n{name} ({aspect}) …")
        data = generate_image_bytes(prompt, reference=False, aspect_ratio=aspect)
        if data:
            _save(data, name)
            ok += 1
        else:
            print(f"  [{name}] no image")
    print(f"\nDone: {ok}/{len(names)} generated into {OUT}")
    return 0 if ok == len(names) else 1


if __name__ == "__main__":
    raise SystemExit(main())
