"""Generate the leaderboard's Nano-Banana art — a game-like ember background and three
metallic podium cards (gold/silver/bronze) — into frontend/public/brand/leaderboard/.

Decorative art only (no mascot reference), tuned to leave a clean top-centre plinth for the
portrait and a calm lower band for text. Saved as webp (light for prod) with a PNG fallback if
Pillow is missing. Reuses the shared image core so there's one place that talks to Gemini.

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

JOBS: dict[str, tuple[str, str]] = {
    "bg": ("3:4",
        "A premium AAA mobile-game leaderboard background, vertical. A rich vertical gradient "
        "from vivid scarlet red at the top through crimson to a deep warm maroon at the bottom. "
        "A soft warm golden spotlight glows from the top-centre; gentle golden light particles, "
        "embers and sparks drift upward; faint god-rays; subtle bokeh; a soft dark vignette hugs "
        "the edges while the centre stays smooth and calm for UI to sit on. Luxurious, energetic, "
        "addictive arena feeling. " + CLEAN),
    "ped-gold": ("3:4",
        "A luxurious CHAMPION podium card for a game leaderboard — a tall vertical UI panel of "
        "radiant polished GOLD and warm amber. An ornate elegant frame with subtle laurel and "
        "tiny gem accents, a bright soft halo spotlight at the TOP-CENTRE forming a clean glowing "
        "circular plinth ready for a portrait, and a smooth calmer band lower down. Floating gold "
        "sparkles and a celebratory glow. Rich but not cluttered in the centre. " + CLEAN),
    "ped-silver": ("3:4",
        "A sleek 2nd-place podium card for a game leaderboard — a tall vertical UI panel of cool "
        "polished SILVER and platinum with icy white-blue highlights. An elegant frame, a soft "
        "halo spotlight at the TOP-CENTRE forming a clean circular plinth for a portrait, a calm "
        "band lower down, gentle sparkles and a refined glow. Uncluttered centre. " + CLEAN),
    "ped-bronze": ("3:4",
        "A warm 3rd-place podium card for a game leaderboard — a tall vertical UI panel of rich "
        "BRONZE and copper with deep brown-orange metallic tones. An elegant frame, a soft halo "
        "spotlight at the TOP-CENTRE forming a clean circular plinth for a portrait, a calm band "
        "lower down, gentle warm sparkles. Uncluttered centre. " + CLEAN),
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
