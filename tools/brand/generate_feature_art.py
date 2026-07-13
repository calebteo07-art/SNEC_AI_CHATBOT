#!/usr/bin/env python3
"""Feature-card Selena cards via Nano-Banana flash — PAID, go-ahead-gated.

reference=True (anchored to iris.png), rendered landscape (3:2). Each card is baked WHOLE
(themed gradient background + mascot hero in one opaque image) so there is no transparent
cut-out to key and nothing to crop distortedly. Output lands in .tmp/feature-art/ for review;
--install copies approved cards into frontend/public/brand/features/, overwriting placeholders.

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

from PIL import Image

from tools.avatar import generate_sprites
from tools.brand.feature_art import SCENES, build_estimate, prompt
from tools.shared.gemini_client import MOCK_MODE

MODEL = generate_sprites.MODELS["flash"]  # nano-banana flash only
ASPECT = "3:2"                             # landscape card (~ the 466x300 coverflow card)
ROOT = Path(__file__).resolve().parents[2]
TMP = ROOT / ".tmp" / "feature-art"
PUB = ROOT / "frontend" / "public" / "brand" / "features"


def generate_one(pid: str) -> Path | None:
    """Render one baked card (LIVE + PAID). Refuses in MOCK_MODE."""
    if MOCK_MODE:
        raise RuntimeError("generate_one needs a live GEMINI_API_KEY; refusing in MOCK_MODE")
    data = generate_sprites.generate_image_bytes(
        prompt(SCENES[pid]), model=MODEL, reference=True, aspect_ratio=ASPECT
    )
    if not data:
        print(f"  [{pid}] no image generated")
        return None
    TMP.mkdir(parents=True, exist_ok=True)
    out = TMP / f"{pid}.png"
    Image.open(io.BytesIO(data)).convert("RGB").save(out)  # baked full card, opaque — no keying
    print(f"  [{pid}] saved {out} ({out.stat().st_size:,} bytes)")
    return out


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
        img = Image.open(src).convert("RGB")
        dest = PUB / f"{src.stem}.webp"
        img.save(dest, "WEBP", quality=90, method=6)
        print(f"  installed /brand/features/{src.stem}.webp ({dest.stat().st_size:,} bytes, {img.width}x{img.height})")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate feature-card scenes (paid; go-ahead only).")
    ap.add_argument("--estimate", action="store_true", help="Print prompts + count. No API calls.")
    ap.add_argument("--generate", action="store_true", help="Generate cards into .tmp/feature-art/ (PAID).")
    ap.add_argument("--install", action="store_true", help="Copy reviewed cards into frontend/public/brand/features/.")
    ap.add_argument("--only", default="", help="Comma-separated scene ids (default: all).")
    args = ap.parse_args()

    if args.install:
        return run_install()
    if not args.generate:
        rows = build_estimate()
        print(f"ESTIMATE — {len(rows)} card(s) via {MODEL} ({ASPECT}, reference=True). flash bills a few cents each.\n")
        for pid, p in rows:
            print(f"— {pid}:\n    {p}\n")
        return 0
    if MOCK_MODE:
        print("ERROR: no GEMINI_API_KEY (MOCK_MODE) — cannot generate real art.", file=sys.stderr)
        return 2
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    ids = [p for p in SCENES if not only or p in only]
    print(f"\nGENERATING {len(ids)} card(s) via {MODEL} ({ASPECT}) into {TMP} …")
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
