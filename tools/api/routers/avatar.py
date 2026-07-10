"""Selena avatar endpoints — per-student customization + 3D portrait (RICOE v2 Foundation 2).

Identity always comes from the JWT (current_user["sub"]), never the body. The config is
validated against the server-authoritative parts registry (fail closed) before it is
persisted to student_profiles.avatar_config (JSONB).

The 3D portrait is a real transparent Iris PNG generated from the SAVED config and cached
by config-hash (avatar_images, migration 007). Generation is paid + slow (~15–30s), so
POST /api/avatar/portrait enqueues it off the event loop (BackgroundTasks → to_thread) and
returns immediately; the client polls GET /api/avatar for {portrait_status, portrait_url}.
The instant SVG <Selena> is the always-available fallback, so every path degrades
gracefully when the bucket/table or a live key is absent.
"""
import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from tools.api.shared import limiter
from tools.avatar.parts import AVATAR_AXES, DEFAULT_AVATAR, validate_config, InvalidAvatarConfig
from tools.avatar.portrait import config_hash, render_portrait, store_portrait
from tools.profile.get_profile import get_profile          # graceful read (never raises, ensures a row)
from tools.shared.audit_log import log
from tools.shared.db import update_profile                 # generic column setter: update_profile(sub, **fields)
from tools.shared.db import get_avatar_image, upsert_avatar_image
from tools.shared.jwt_utils import get_current_user, CurrentUser

router = APIRouter()

# Portrait renders happen in a background task whose only prior failure trace was the
# file-based audit log — lost on Render's ephemeral disk, so prod render failures were
# invisible. This logger writes to stdout (captured by Render) via the JSON root handler.
_log = logging.getLogger("eyebot.avatar")

# A pending render older than this is treated as lost (a crashed/evicted task) and re-enqueued.
_PENDING_TTL_S = 180


class AvatarUpdate(BaseModel):
    """Request body for PUT /api/avatar — a partial Selena config.

    Keys are the axes returned by GET /api/avatar's ``axes`` catalog (the
    server-authoritative registry in tools/avatar/parts.py); values are option
    ids. Extra keys are allowed here and then validated/dropped by
    ``validate_config`` — the registry stays the single source of truth, so we
    don't restate the 12 axes as fields (which would drift). Every id is still
    checked fail-closed before anything is persisted.
    """
    model_config = ConfigDict(extra="allow")


async def _resolve_config(student_id: str) -> tuple[dict, bool]:
    """(config, customized) for the student, fail-closed.

    A stored config that has gone stale (a retired option id) never 500s a read — it
    falls back to the default and logs the drift for staff. ``customized`` is True the
    moment a student has EVER saved a config (even a now-stale one), so the first-run
    onboarding gate (ricoe §7) never re-nags someone who already built their Selena.
    """
    profile = await get_profile(student_id) or {}
    stored = profile.get("avatar_config")
    customized = bool(stored)
    try:
        config = validate_config(stored) if stored else dict(DEFAULT_AVATAR)
    except InvalidAvatarConfig as e:
        log("avatar_config_corrupt", student_id=student_id, feature="avatar", detail=str(e))
        config = dict(DEFAULT_AVATAR)
    return config, customized


async def _current_config(student_id: str) -> dict:
    """The student's saved Selena config (or the default), fail-closed."""
    config, _ = await _resolve_config(student_id)
    return config


def _recent(updated_at, max_age_s: int = _PENDING_TTL_S) -> bool:
    """True if an ISO timestamp is within max_age_s of now. Unparseable ⇒ not recent."""
    if not updated_at:
        return False
    try:
        ts = datetime.fromisoformat(str(updated_at).replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - ts).total_seconds() < max_age_s
    except (ValueError, TypeError):
        return False


async def _portrait_state(config: dict) -> tuple[str, str | None]:
    """(status, url) for a look's cached portrait. Missing table ⇒ ('unavailable', None)."""
    try:
        row = await get_avatar_image(config_hash(config))
    except Exception:
        return "unavailable", None      # pre-migration 007 — the SVG fallback carries the UI
    if not row:
        return "none", None
    return (row.get("status") or "none"), row.get("image_url")


async def _generate_portrait(config: dict, chash: str) -> None:
    """Render + store the portrait off the event loop, then mark the cache ready/failed.

    Both blocking calls (the ~15–30s Gemini render and the sync Supabase upload) run in a
    threadpool so the single uvicorn worker's event loop stays free.
    """
    try:
        image_bytes = await asyncio.to_thread(render_portrait, config)
        url = await asyncio.to_thread(store_portrait, chash, image_bytes)
        await upsert_avatar_image(chash, "ready", url)
    except Exception as exc:
        # stdout (Render-visible) with traceback so the prod render failure is diagnosable,
        # plus the best-effort audit log. This is the ONLY place the real reason surfaces.
        _log.exception("portrait render failed (hash=%s): %s", chash, exc)
        log("portrait_gen_failed", feature="avatar", detail=f"{type(exc).__name__}: {exc}")
        try:
            await upsert_avatar_image(chash, "failed")
        except Exception:
            pass


@router.get("/api/avatar")
async def get_avatar(current_user: CurrentUser = Depends(get_current_user)):
    """Return the student's saved Selena config (or default) + catalog + portrait state + customized."""
    student_id = current_user["sub"]
    config, customized = await _resolve_config(student_id)
    status, url = await _portrait_state(config)
    return {
        "config": config, "axes": AVATAR_AXES,
        "portrait_status": status, "portrait_url": url, "customized": customized,
    }


@router.put("/api/avatar")
@limiter.limit("30/minute")
async def put_avatar(
    request: Request,
    body: AvatarUpdate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Validate + persist the student's Selena config. Identity from the JWT."""
    student_id = current_user["sub"]
    try:
        clean = validate_config(body.model_dump())
    except InvalidAvatarConfig as e:
        raise HTTPException(status_code=422, detail=str(e))
    await update_profile(student_id, avatar_config=clean)
    return {"config": clean}


@router.post("/api/avatar/portrait")
@limiter.limit("20/minute")
async def request_portrait(
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Ensure a 3D portrait exists for the caller's SAVED look; generate on a cache miss.

    Returns immediately: ``ready`` with the URL if cached, else ``pending`` (a fresh render
    is enqueued). Cache-gated + rate-limited so a paid render fires only on a genuinely new
    look. Identity — and therefore the look being rendered — comes from the JWT.
    """
    student_id = current_user["sub"]
    config = await _current_config(student_id)
    chash = config_hash(config)

    try:
        row = await get_avatar_image(chash)
    except Exception:
        return {"portrait_status": "unavailable", "portrait_url": None}

    if row and row.get("status") == "ready" and row.get("image_url"):
        return {"portrait_status": "ready", "portrait_url": row["image_url"]}
    if row and row.get("status") == "pending" and _recent(row.get("updated_at")):
        return {"portrait_status": "pending", "portrait_url": None}

    # Miss / failed / stale-pending → mark pending and enqueue exactly one render.
    await upsert_avatar_image(chash, "pending")
    background_tasks.add_task(_generate_portrait, config, chash)
    return {"portrait_status": "pending", "portrait_url": None}
