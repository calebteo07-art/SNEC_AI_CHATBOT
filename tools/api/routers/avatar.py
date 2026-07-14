"""Eyecon avatar endpoints — per-student customization config.

Identity always comes from the JWT (current_user["sub"]), never the body. The config is
validated against the server-authoritative parts registry (fail closed) before it is
persisted to student_profiles.avatar_config (JSONB).

The avatar is composited client-side from this config by <Eyecon>; there is no
server-rendered portrait. GET returns the config + parts catalog + `customized` flag.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from tools.api.shared import limiter
from tools.avatar.parts import AVATAR_AXES, DEFAULT_AVATAR, validate_config, InvalidAvatarConfig
from tools.profile.get_profile import get_profile          # graceful read (never raises, ensures a row)
from tools.shared.audit_log import log
from tools.shared.db import update_profile                 # generic column setter: update_profile(sub, **fields)
from tools.shared.jwt_utils import get_current_user, CurrentUser

router = APIRouter()


class AvatarUpdate(BaseModel):
    """Request body for PUT /api/avatar — a partial Eyecon config.

    Keys are the axes returned by GET /api/avatar's ``axes`` catalog (the
    server-authoritative registry in tools/avatar/parts.py); values are option ids.
    Extra keys are allowed here and then validated/dropped by ``validate_config`` — the
    registry stays the single source of truth. Every id is checked fail-closed before
    anything is persisted.
    """
    model_config = ConfigDict(extra="allow")


async def _resolve_config(student_id: str) -> tuple[dict, bool]:
    """(config, customized) for the student, fail-closed.

    A stored config that has gone stale (a retired option id) never 500s a read — it
    falls back to the default and logs the drift for staff. ``customized`` is True the
    moment a student has EVER saved a config (even a now-stale one), so the first-run
    onboarding gate never re-nags someone who already built their Eyecon.
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


@router.get("/api/avatar")
async def get_avatar(current_user: CurrentUser = Depends(get_current_user)):
    """Return the student's saved Eyecon config (or default) + parts catalog + customized."""
    student_id = current_user["sub"]
    config, customized = await _resolve_config(student_id)
    return {"config": config, "axes": AVATAR_AXES, "customized": customized}


@router.put("/api/avatar")
@limiter.limit("30/minute")
async def put_avatar(
    request: Request,
    body: AvatarUpdate,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Validate + persist the student's Eyecon config. Identity from the JWT."""
    student_id = current_user["sub"]
    try:
        clean = validate_config(body.model_dump())
    except InvalidAvatarConfig as e:
        raise HTTPException(status_code=422, detail=str(e))
    await update_profile(student_id, avatar_config=clean)
    return {"config": clean}
