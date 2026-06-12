"""Generative media endpoints — manifest + admin-gated async refresh.

The library itself is static (served by the Next server from /media/*);
this router exposes the manifest through the API surface and lets admins
queue background regeneration on the existing Celery/Redis workers.
Higgsfield loops are operator-driven (no API key in this deployment), so
those kinds report status "manual" instead of queueing.
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from tools.shared.jwt_utils import CurrentUser, require_admin
from tools.media.prompts import NAV_CONTEXTS

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
MANIFEST = PROJECT_ROOT / "frontend" / "public" / "media" / "manifest.json"

router = APIRouter(prefix="/api/media", tags=["media"])

QUEUEABLE_KINDS = {"svg", "raster"}
MANUAL_KINDS = {"loop"}


class RefreshRequest(BaseModel):
    kinds: list[str] = Field(default=["svg"])
    contexts: list[str] | None = None


@router.get("/manifest")
async def get_manifest():
    if not MANIFEST.exists():
        raise HTTPException(status_code=404, detail="media library not generated yet")
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


@router.post("/refresh")
async def refresh_media(
    body: RefreshRequest,
    current_user: CurrentUser = Depends(require_admin),
):
    kinds = set(body.kinds)
    unknown = kinds - QUEUEABLE_KINDS - MANUAL_KINDS
    if unknown:
        raise HTTPException(status_code=422, detail=f"unknown kinds: {sorted(unknown)}")
    contexts = body.contexts or NAV_CONTEXTS
    bad = [c for c in contexts if c not in NAV_CONTEXTS]
    if bad:
        raise HTTPException(status_code=422, detail=f"unknown contexts: {bad}")

    manual = sorted(kinds & MANUAL_KINDS)
    queueable = sorted(kinds & QUEUEABLE_KINDS)
    if not queueable:
        return {"status": "manual", "detail": "Higgsfield loops are generated via the operator CLI — nothing to queue."}

    try:
        from tools.workers.celery_app import app as celery_app

        result = celery_app.send_task(
            "tools.workers.tasks.media_refresh.refresh_media",
            kwargs={"kinds": queueable, "contexts": contexts},
            queue="media",
        )
    except Exception as exc:  # broker unreachable — graceful, not fatal
        raise HTTPException(status_code=503, detail=f"media workers offline ({type(exc).__name__})") from exc

    return {"status": "queued", "job_id": result.id, "manual_kinds": manual}


@router.get("/jobs/{job_id}")
async def job_status(job_id: str, current_user: CurrentUser = Depends(require_admin)):
    try:
        from tools.workers.celery_app import app as celery_app

        res = celery_app.AsyncResult(job_id)
        payload = {"job_id": job_id, "status": res.status.lower()}
        if res.successful():
            payload["result"] = res.result
        elif res.failed():
            payload["detail"] = str(res.result)[:300]
        return payload
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"media workers offline ({type(exc).__name__})") from exc
