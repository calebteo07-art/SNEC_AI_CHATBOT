"""Async media regeneration — runs the Gemini accent sweep on the worker.

Queued by POST /api/media/refresh (admin only). The sanitizer runs inside
generate_accents at generation time; a failed document is skipped, never
written.
"""
from __future__ import annotations

from tools.workers.celery_app import app


@app.task(name="tools.workers.tasks.media_refresh.refresh_media", bind=True)
def refresh_media(self, kinds: list[str], contexts: list[str]) -> dict:
    from tools.media import build_manifest, generate_accents

    written: list[str] = []
    if "svg" in kinds:
        written += [p.name for p in generate_accents.generate_svg(contexts)]
    if "raster" in kinds:
        written += [p.name for p in generate_accents.generate_raster(contexts)]
    manifest = build_manifest.build()
    return {
        "written": written,
        "manifest_version": manifest["version"],
        "accents": len(manifest["accents"]),
        "loops": len(manifest["loops"]),
    }
