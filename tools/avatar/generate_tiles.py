#!/usr/bin/env python3
"""Studio option-tile art via Nano-Banana flash — PAID, go-ahead-gated.

One render per non-colour option id: the DEFAULT Selena wearing just that option,
on flat chroma green, keyed to a transparent 512² cutout (tools/shared/keying).
Output lands in .tmp/selena-tiles/<axis>/ for human review; --install converts
approved art to frontend/public/avatar/tiles/<axis>/<id>.webp, replacing the
placeholders.

Usage:
    python tools/avatar/generate_tiles.py --estimate                 # prompts + count, NO calls
    python tools/avatar/generate_tiles.py --generate [--only topper] # PAID
    python tools/avatar/generate_tiles.py --install
"""
import argparse
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from PIL import Image

from tools.avatar import generate_sprites
from tools.avatar.portrait import phrase_for
from tools.avatar.tiles import TILE_AXES, tile_ids, tile_path
from tools.shared import keying
from tools.shared.gemini_client import MOCK_MODE

MODEL = generate_sprites.MODELS["flash"]
ROOT = Path(__file__).resolve().parents[2]
TMP_DIR = ROOT / ".tmp" / "selena-tiles"

_ANCHOR = (
    "The same one-eyed EyeBot mascot as the reference image — a soft, rounded, "
    "hairless character with a single large friendly eye, peachy body, calm gentle "
    "smile, identical proportions, colours, and rendering to the reference."
)
_FRAME = (
    f"Full body centered, plain flat solid chroma-green ({keying.BG_KEY}) background, "
    "soft even lighting. No text, no border, no watermark, no extra characters."
)


def tile_prompt(axis: str, oid: str) -> str:
    phrase = phrase_for(axis, oid)
    if not phrase:
        raise KeyError(f"no bespoke phrase for {axis}/{oid} — add it to portrait.PROMPT_MAPS")
    return f"{_ANCHOR} She is styled with exactly ONE addition: {phrase}. Nothing else changes. {_FRAME}"


def pairs(only: set[str]) -> list[tuple[str, str]]:
    return [(a, o) for a in TILE_AXES if not only or a in only for o in tile_ids(a)]


def generate_one(axis: str, oid: str) -> Path | None:
    if MOCK_MODE:
        raise RuntimeError("generate_tiles needs a live GEMINI_API_KEY; refusing in MOCK_MODE")
    data = generate_sprites.generate_image_bytes(tile_prompt(axis, oid), model=MODEL, reference=True)
    if not data:
        print(f"  [{axis}/{oid}] no image generated")
        return None
    keyed = keying.normalize_512(keying.despill_green(keying.key_out(Image.open(io.BytesIO(data)), keying.BG_KEY)))
    out = TMP_DIR / axis / f"{oid}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    keyed.save(out)
    print(f"  [{axis}/{oid}] saved {out} ({out.stat().st_size:,} bytes)")
    return out


def run_install() -> int:
    srcs = sorted(TMP_DIR.glob("*/*.png"))
    if not srcs:
        print(f"nothing to install — {TMP_DIR} is empty (run --generate first)", file=sys.stderr)
        return 1
    for src in srcs:
        axis, oid = src.parent.name, src.stem
        if axis not in TILE_AXES or oid not in tile_ids(axis):
            print(f"  skip {axis}/{oid} — not a known tile id")
            continue
        dest = tile_path(axis, oid)
        dest.parent.mkdir(parents=True, exist_ok=True)
        Image.open(src).convert("RGBA").save(dest, "WEBP", quality=88)
        print(f"  installed /avatar/tiles/{axis}/{oid}.webp")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate Studio tile art (paid; go-ahead only).")
    ap.add_argument("--estimate", action="store_true")
    ap.add_argument("--generate", action="store_true")
    ap.add_argument("--install", action="store_true")
    ap.add_argument("--only", default="", help="comma-separated axes (default: all)")
    args = ap.parse_args()
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    todo = pairs(only)

    if args.install:
        return run_install()
    if not args.generate:
        print(f"ESTIMATE — {len(todo)} tile(s) via {MODEL} (reference=True, keyed to alpha)")
        for axis, oid in todo:
            print(f"— {axis}/{oid}:\n    {tile_prompt(axis, oid)}\n")
        return 0
    if MOCK_MODE:
        print("ERROR: no GEMINI_API_KEY (MOCK_MODE) — cannot generate real art.", file=sys.stderr)
        return 2
    ok = 0
    for axis, oid in todo:
        try:
            if generate_one(axis, oid):
                ok += 1
        except Exception as e:
            print(f"  [{axis}/{oid}] FAILED: {type(e).__name__}: {str(e)[:300]}")
    print(f"\nDone: {ok}/{len(todo)} generated. Review {TMP_DIR} before --install.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
