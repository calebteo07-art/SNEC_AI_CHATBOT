#!/usr/bin/env python3
"""EyeBot animated-logo poses via Nano-Banana flash — PAID, go-ahead-gated
(logo→raster brief). reference=True (anchored to the Iris mascot), then keyed to
transparency + normalised to 512² so poses register with iris.png. Output lands
in .tmp/logo-poses/ for review; --install copies approved poses into
frontend/public/brand/poses/, overwriting the placeholders.

Usage:
    python tools/brand/generate_poses.py --estimate             # prints prompts, NO calls
    python tools/brand/generate_poses.py --generate [--only wave,cheer]
    python tools/brand/generate_poses.py --install
"""
import argparse
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # repo root, so `tools.*` resolves by path

from PIL import Image

from tools.avatar import generate_sprites
from tools.brand import keying
from tools.brand.logo_poses import BG_KEY, POSES, prompt
from tools.shared.gemini_client import MOCK_MODE

MODEL = generate_sprites.MODELS["flash"]  # nano-banana flash only
PROJECT_ROOT = Path(__file__).resolve().parents[2]
TMP_DIR = PROJECT_ROOT / ".tmp" / "logo-poses"
PUBLIC_DIR = PROJECT_ROOT / "frontend" / "public" / "brand" / "poses"


def build_estimate() -> list[tuple[str, str]]:
    return [(pid, prompt(pose)) for pid, pose in POSES.items()]


def generate_one(pose_id: str) -> Path | None:
    """Render + key + normalise one pose (LIVE + PAID). Refuses in MOCK_MODE."""
    if MOCK_MODE:
        raise RuntimeError("generate_one needs a live GEMINI_API_KEY; refusing to fabricate art in MOCK_MODE")
    data = generate_sprites.generate_image_bytes(prompt(POSES[pose_id]), model=MODEL, reference=True)
    if not data:
        print(f"  [{pose_id}] no image generated")
        return None
    keyed = keying.normalize_512(keying.despill_green(keying.key_out(Image.open(io.BytesIO(data)), BG_KEY)))
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    out = TMP_DIR / f"{pose_id}.png"
    keyed.save(out)
    print(f"  [{pose_id}] saved {out} ({out.stat().st_size:,} bytes, keyed+normalised)")
    return out


def run_estimate() -> None:
    rows = build_estimate()
    print(f"ESTIMATE — {len(rows)} logo pose(s) via {MODEL} (reference=True, keyed to alpha)")
    print("Rough cost: flash image output bills a few cents each; confirm current pricing before the batch.\n")
    for pid, p in rows:
        print(f"— {pid}:\n    {p}\n")


def run_install() -> int:
    """Convert reviewed .tmp/logo-poses/*.png → frontend/public/brand/poses/*.webp (alpha kept)."""
    srcs = sorted(TMP_DIR.glob("*.png"))
    if not srcs:
        print(f"nothing to install — {TMP_DIR} is empty (run --generate first)", file=sys.stderr)
        return 1
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    for src in srcs:
        pid = src.stem
        if pid not in POSES:
            print(f"  skip {src.name} — not a known pose")
            continue
        Image.open(src).convert("RGBA").save(PUBLIC_DIR / f"{pid}.webp", "WEBP", quality=88)
        print(f"  installed /brand/poses/{pid}.webp")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate EyeBot logo poses (paid; go-ahead only).")
    ap.add_argument("--estimate", action="store_true", help="Print prompts + count. No API calls.")
    ap.add_argument("--generate", action="store_true", help="Generate poses into .tmp/logo-poses/ (PAID).")
    ap.add_argument("--install", action="store_true", help="Copy reviewed poses into frontend/public/brand/poses/.")
    ap.add_argument("--only", default="", help="Comma-separated pose ids (default: all).")
    args = ap.parse_args()

    if args.install:
        return run_install()
    if not args.generate:
        run_estimate()
        return 0
    if MOCK_MODE:
        print("ERROR: no GEMINI_API_KEY (MOCK_MODE) — cannot generate real art.", file=sys.stderr)
        return 2
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    ids = [p for p in POSES if not only or p in only]
    print(f"\nGENERATING {len(ids)} pose(s) via {MODEL} into {TMP_DIR} …")
    ok = 0
    for pid in ids:
        try:
            if generate_one(pid):
                ok += 1
        except Exception as e:
            print(f"  [{pid}] FAILED: {type(e).__name__}: {str(e)[:300]}")
    print(f"\nDone: {ok}/{len(ids)} generated. Review {TMP_DIR} before --install.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
