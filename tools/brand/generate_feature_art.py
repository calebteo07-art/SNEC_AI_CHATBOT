#!/usr/bin/env python3
"""Feature-card Selena scenes via Nano-Banana flash — PAID, go-ahead-gated.

reference=True (anchored to iris.png). Output lands in .tmp/feature-art/ for
review; --install copies approved scenes into frontend/public/brand/features/,
overwriting the placeholders.

Usage:
    python tools/brand/generate_feature_art.py --estimate          # prompts + count, NO calls
    python tools/brand/generate_feature_art.py --generate [--only tutor,vp]
    python tools/brand/generate_feature_art.py --install
"""
import argparse
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # repo root, so `tools.*` resolves

import numpy as np
from PIL import Image

from tools.avatar import generate_sprites
from tools.brand.feature_art import SCENES, build_estimate, prompt
from tools.shared.gemini_client import MOCK_MODE

MODEL = generate_sprites.MODELS["flash"]  # nano-banana flash only
ROOT = Path(__file__).resolve().parents[2]
TMP = ROOT / ".tmp" / "feature-art"
PUB = ROOT / "frontend" / "public" / "brand" / "features"


def _alpha_coverage(img: "Image.Image") -> float:
    """Fraction of fully-opaque pixels — a quick transparency sanity check."""
    alpha = img.getchannel("A")
    hist = alpha.histogram()
    total = sum(hist) or 1
    return hist[255] / total


def key_background(img: "Image.Image", gray_tol: int = 46) -> "Image.Image":
    """Cut the mascot out of an opaque near-gray background into a real alpha channel.

    Nano-Banana flash ignores 'transparent background' and instead paints a flat grey
    or the transparency *checkerboard*. Both are DESATURATED (chroma≈0) while the mascot
    is saturated peach/blue/yellow. We flood-fill inward from the border across low-chroma
    grey pixels, so only the border-connected background is removed — interior highlights
    (white sclera, eye glints) and saturated islands (a floating lightbulb) are preserved.
    """
    rgba = np.asarray(img.convert("RGBA"))
    rgb = rgba[..., :3].astype(np.int16)
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    graylike = chroma <= gray_tol  # checker greys + their anti-aliased halo + soft shadow

    h, w = graylike.shape
    bg = np.zeros((h, w), dtype=bool)
    bg[0, :] = graylike[0, :]; bg[-1, :] = graylike[-1, :]
    bg[:, 0] = graylike[:, 0]; bg[:, -1] = graylike[:, -1]
    # iterative 4-connected dilation constrained to grey pixels == flood fill from the edge
    while True:
        grown = bg.copy()
        grown[1:, :] |= bg[:-1, :]
        grown[:-1, :] |= bg[1:, :]
        grown[:, 1:] |= bg[:, :-1]
        grown[:, :-1] |= bg[:, 1:]
        grown &= graylike
        if int(grown.sum()) == int(bg.sum()):
            break
        bg = grown

    # erode the foreground a couple of px to shave the anti-aliased grey fringe (the halo
    # that otherwise ghosts around the cut-out on a saturated card), then feather the edge.
    fg = ~bg
    for _ in range(2):
        fg = fg & np.roll(fg, 1, 0) & np.roll(fg, -1, 0) & np.roll(fg, 1, 1) & np.roll(fg, -1, 1)
    a = np.where(fg, 255.0, 0.0).astype(np.float32)
    blur = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5.0
    out = rgba.copy()
    out[..., 3] = np.minimum(a, blur).astype(np.uint8)  # feather only softens the outer edge
    return Image.fromarray(out, "RGBA")


def generate_one(pid: str) -> Path | None:
    """Render one scene (LIVE + PAID). Refuses in MOCK_MODE."""
    if MOCK_MODE:
        raise RuntimeError("generate_one needs a live GEMINI_API_KEY; refusing in MOCK_MODE")
    data = generate_sprites.generate_image_bytes(prompt(SCENES[pid]), model=MODEL, reference=True)
    if not data:
        print(f"  [{pid}] no image generated")
        return None
    TMP.mkdir(parents=True, exist_ok=True)
    out = TMP / f"{pid}.png"
    # the model paints a flat/checkerboard bg instead of real alpha — key it out to a
    # true transparent cut-out (these are split-hero mascots, not opaque backgrounds).
    img = key_background(Image.open(io.BytesIO(data)).convert("RGBA"))
    img.save(out)
    print(f"  [{pid}] saved {out} ({out.stat().st_size:,} bytes) - {_alpha_coverage(img):.0%} opaque after keying")
    return out


def run_key() -> int:
    """Re-key already-generated .tmp PNGs in place (no API calls). Use after tuning the
    matte, so a prior paid batch doesn't need regenerating."""
    srcs = sorted(TMP.glob("*.png"))
    if not srcs:
        print(f"nothing to key — {TMP} is empty", file=sys.stderr)
        return 1
    for src in srcs:
        if src.stem not in SCENES:
            continue
        img = key_background(Image.open(src).convert("RGBA"))
        img.save(src)
        print(f"  keyed {src.name} - {_alpha_coverage(img):.0%} opaque")
    return 0


def run_install() -> int:
    srcs = sorted(TMP.glob("*.png"))
    if not srcs:
        print(f"nothing to install — {TMP} is empty (run --generate first)", file=sys.stderr)
        return 1
    PUB.mkdir(parents=True, exist_ok=True)
    for src in srcs:
        if src.stem not in SCENES:
            print(f"  skip {src.name} — not a known scene")
            continue
        # preserve transparency: RGBA → lossy WEBP with alpha
        Image.open(src).convert("RGBA").save(PUB / f"{src.stem}.webp", "WEBP", quality=90)
        print(f"  installed /brand/features/{src.stem}.webp")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate feature-card scenes (paid; go-ahead only).")
    ap.add_argument("--estimate", action="store_true", help="Print prompts + count. No API calls.")
    ap.add_argument("--generate", action="store_true", help="Generate scenes into .tmp/feature-art/ (PAID).")
    ap.add_argument("--install", action="store_true", help="Copy reviewed scenes into frontend/public/brand/features/.")
    ap.add_argument("--key", action="store_true", help="Re-key existing .tmp PNGs to transparent (no API calls).")
    ap.add_argument("--only", default="", help="Comma-separated scene ids (default: all).")
    args = ap.parse_args()

    if args.key:
        return run_key()
    if args.install:
        return run_install()
    if not args.generate:
        rows = build_estimate()
        print(f"ESTIMATE — {len(rows)} scene(s) via {MODEL} (reference=True). flash bills a few cents each.\n")
        for pid, p in rows:
            print(f"— {pid}:\n    {p}\n")
        return 0
    if MOCK_MODE:
        print("ERROR: no GEMINI_API_KEY (MOCK_MODE) — cannot generate real art.", file=sys.stderr)
        return 2
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    ids = [p for p in SCENES if not only or p in only]
    print(f"\nGENERATING {len(ids)} scene(s) via {MODEL} into {TMP} …")
    ok = 0
    for pid in ids:
        try:
            if generate_one(pid):
                ok += 1
        except Exception as e:  # noqa: BLE001 — report + continue the batch
            print(f"  [{pid}] FAILED: {type(e).__name__}: {str(e)[:300]}")
    print(f"\nDone: {ok}/{len(ids)} generated. Review {TMP} before --install.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
