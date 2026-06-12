"""Scan frontend/public/media/ and emit the versioned manifest the frontend
GenerativeMediaClient resolves from. Deterministic, idempotent.

Run:
    python -m tools.media.build_manifest
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.media.prompts import NAV_CONTEXTS  # noqa: E402

MEDIA_DIR = PROJECT_ROOT / "frontend" / "public" / "media"
ACCENTS_DIR = MEDIA_DIR / "accents"
LOOPS_DIR = MEDIA_DIR / "loops"
MANIFEST = MEDIA_DIR / "manifest.json"

_VIEWBOX = re.compile(r'viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"\s*')


def _sha(path: Path) -> str:
    return "sha256-" + hashlib.sha256(path.read_bytes()).hexdigest()[:24]


def _context_of(stem: str) -> list[str]:
    for ctx in sorted(NAV_CONTEXTS, key=len, reverse=True):
        if stem.startswith(ctx):
            return [ctx]
    return []


def _svg_dims(path: Path) -> tuple[int | None, int | None]:
    m = _VIEWBOX.search(path.read_text(encoding="utf-8", errors="ignore"))
    if m:
        return int(float(m.group(1))), int(float(m.group(2)))
    return None, None


def build() -> dict:
    prev_version = 0
    if MANIFEST.exists():
        try:
            prev_version = int(json.loads(MANIFEST.read_text()).get("version", 0))
        except Exception:
            prev_version = 0

    accents = []
    if ACCENTS_DIR.exists():
        for f in sorted(ACCENTS_DIR.iterdir()):
            if f.suffix.lower() not in {".svg", ".png", ".webp", ".jpg"}:
                continue
            kind = "svg" if f.suffix.lower() == ".svg" else "raster"
            w, h = _svg_dims(f) if kind == "svg" else (None, None)
            accents.append({
                "id": f.stem,
                "kind": kind,
                "context": _context_of(f.stem),
                "path": f"/media/accents/{f.name}",
                "width": w,
                "height": h,
                "hash": _sha(f),
            })

    loops = []
    if LOOPS_DIR.exists():
        for f in sorted(LOOPS_DIR.glob("*.mp4")):
            poster = f.with_suffix(".jpg")
            loops.append({
                "id": f.stem,
                "src": f"/media/loops/{f.name}",
                "poster": f"/media/loops/{poster.name}" if poster.exists() else None,
                "context": _context_of(f.stem),
                "hash": _sha(f),
            })

    manifest = {
        "version": prev_version + 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "palette": "photopic-v2",
        "accents": accents,
        "loops": loops,
    }
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


if __name__ == "__main__":
    m = build()
    print(f"manifest v{m['version']}: {len(m['accents'])} accents, {len(m['loops'])} loops")
