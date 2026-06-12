"""Ingest operator-generated Higgsfield loops into the media library.

Higgsfield generation is operator-driven (CLI skills) — no API key lives in
this repo. Download the MP4s, then:

    python -m tools.media.ingest_loops path/to/clip.mp4 --context login

Posters: extracted via ffmpeg when available; otherwise place a same-name
.jpg beside the mp4 before ingesting (posters are mandatory for the
<HiggsfieldLoop> reduced-motion/save-data fallback).
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.media.prompts import NAV_CONTEXTS  # noqa: E402
from tools.media import build_manifest  # noqa: E402

LOOPS_DIR = PROJECT_ROOT / "frontend" / "public" / "media" / "loops"


def _extract_poster(mp4: Path, poster: Path) -> bool:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return False
    res = subprocess.run(
        [ffmpeg, "-y", "-i", str(mp4), "-vf", "select=eq(n\\,12),scale=1280:-2",
         "-frames:v", "1", "-q:v", "3", str(poster)],
        capture_output=True,
    )
    return res.returncode == 0 and poster.exists()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("clips", nargs="+", type=Path)
    parser.add_argument("--context", required=True, choices=NAV_CONTEXTS)
    args = parser.parse_args()

    LOOPS_DIR.mkdir(parents=True, exist_ok=True)
    for i, clip in enumerate(args.clips):
        if not clip.exists():
            print(f"  REJECTED missing: {clip}")
            continue
        dest = LOOPS_DIR / f"{args.context}-loop-{i:02d}.mp4"
        shutil.copyfile(clip, dest)
        poster = dest.with_suffix(".jpg")
        side = clip.with_suffix(".jpg")
        if side.exists():
            shutil.copyfile(side, poster)
        elif not _extract_poster(dest, poster):
            print(f"  WARN no poster for {dest.name} — provide {side.name} or install ffmpeg")
        print(f"  ok {dest.name}")

    manifest = build_manifest.build()
    print(f"manifest v{manifest['version']}: {len(manifest['loops'])} loops")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
