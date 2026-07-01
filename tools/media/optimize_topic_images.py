"""Compress the flashcard topic-fan images to small, fast-loading files.

Gemini emits ~600 KB raw PNGs (896x1200) for the topic fan; served as-is that is
~18 MB of images the selection screen must pull. This re-encodes them to compact
progressive JPEGs (~40-90 KB each, ~10x smaller) with the pixel dimensions kept
intact, so `topicImage()` in the frontend keeps pointing at the same
`/media/flashcards/topics/<key>.png` path (the bytes are JPEG, which browsers
sniff and render happily under a .png name -- that already worked in prod).

Two ways in:

* `optimize_image_bytes(raw)` -- the generator calls this at write time so freshly
  generated images are ALWAYS small; no manual step to forget.
* CLI -- re-optimize whatever is already on disk (idempotent; already-small JPEGs
  are skipped unless --force):

      python tools/media/optimize_topic_images.py            # the topics dir
      python tools/media/optimize_topic_images.py --force    # re-encode all
      python tools/media/optimize_topic_images.py path/to/img.png ...

Uses Pillow (a hard dependency; see requirements.txt). ASCII-only output.
"""
from __future__ import annotations

import argparse
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[2]
TOPICS_DIR = PROJECT_ROOT / "frontend" / "public" / "media" / "flashcards" / "topics"

# q74 matches the mozjpeg pass that first shrank the committed set (~61 KB avg).
DEFAULT_QUALITY = 74
# Never drop below this even when squeezing a stubborn image under the ceiling.
MIN_QUALITY = 55
# Aim: keep every file comfortably under this so the fan loads fast.
TARGET_MAX_BYTES = 120 * 1024


def _encode(img: Image.Image, quality: int) -> bytes:
    """Encode an RGB image as a lean progressive JPEG (no metadata)."""
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def optimize_image_bytes(
    raw: bytes,
    *,
    quality: int = DEFAULT_QUALITY,
    max_bytes: int = TARGET_MAX_BYTES,
    min_quality: int = MIN_QUALITY,
) -> bytes:
    """Re-encode raw image bytes to a compact JPEG, preserving dimensions.

    Flattens to RGB (JPEG has no alpha), starts at `quality`, then steps the
    quality down -- never below `min_quality` -- until the encoding fits in
    `max_bytes`. Returns the first encoding that fits, or the min-quality
    encoding if even that overshoots (dense images like colour-vision plates may
    not compress under the ceiling; we still return the smallest we produced).
    """
    with Image.open(BytesIO(raw)) as im:
        img = im.convert("RGB")  # convert() loads the pixels; safe after close

    q = quality
    out = _encode(img, q)
    while len(out) > max_bytes and q > min_quality:
        q = max(min_quality, q - 6)
        out = _encode(img, q)
    return out


def optimize_file(
    path: Path,
    *,
    force: bool = False,
    max_bytes: int = TARGET_MAX_BYTES,
) -> tuple[int, int, bool]:
    """Re-encode an image on disk in place. Returns (before, after, changed).

    Skips files already stored as a JPEG under the ceiling unless `force`, so
    re-running over an optimized directory is a no-op instead of re-encoding
    (which would quietly erode quality each pass).
    """
    raw = path.read_bytes()
    already_small = raw[:3] == b"\xff\xd8\xff" and len(raw) <= max_bytes
    if already_small and not force:
        return len(raw), len(raw), False
    small = optimize_image_bytes(raw, max_bytes=max_bytes)
    path.write_bytes(small)
    return len(raw), len(small), True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "paths",
        nargs="*",
        help="image files to optimize (default: the whole topics dir)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="re-encode even files already stored as a small JPEG",
    )
    args = parser.parse_args()

    if args.paths:
        targets = [Path(p) for p in args.paths]
    else:
        targets = sorted(TOPICS_DIR.glob("*.png"))

    if not targets:
        print(f"no images found (looked in {TOPICS_DIR})")
        return 1

    saved = 0
    changed = 0
    for path in targets:
        if not path.exists():
            print(f"  skip {path.name}: missing")
            continue
        before, after, did = optimize_file(path, force=args.force)
        if did:
            changed += 1
            saved += before - after
            print(f"  ok {path.name} ({before // 1024} -> {after // 1024} KB)")
        else:
            print(f"  -- {path.name} already small ({before // 1024} KB)")

    print(f"done: {changed} re-encoded, {saved // 1024} KB saved")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
