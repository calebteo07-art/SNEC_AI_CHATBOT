"""Selena avatar endpoints — per-student customization (RICOE v2 Foundation 2).

Identity always comes from the JWT (current_user["sub"]), never the body. The
config is validated against the server-authoritative parts registry (fail closed)
before it is persisted to student_profiles.avatar_config (JSONB).
"""
from fastapi import APIRouter, Depends, HTTPException, Request

from tools.api.shared import limiter
from tools.avatar.parts import AVATAR_AXES, DEFAULT_AVATAR, validate_config, InvalidAvatarConfig
from tools.profile.get_profile import get_profile          # graceful read (never raises, ensures a row)
from tools.shared.db import update_profile                 # generic column setter: update_profile(sub, **fields)
from tools.shared.jwt_utils import get_current_user, CurrentUser

router = APIRouter()


@router.get("/api/avatar")
async def get_avatar(current_user: CurrentUser = Depends(get_current_user)):
    """Return the student's saved Selena config (or the default) + the parts catalog."""
    student_id = current_user["sub"]
    profile = await get_profile(student_id) or {}
    stored = profile.get("avatar_config")
    try:
        config = validate_config(stored) if stored else dict(DEFAULT_AVATAR)
    except InvalidAvatarConfig:
        config = dict(DEFAULT_AVATAR)  # never 500 a read on a stale/corrupt value
    return {"config": config, "axes": AVATAR_AXES}


@router.put("/api/avatar")
@limiter.limit("30/minute")
async def put_avatar(
    request: Request,
    body: dict,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Validate + persist the student's Selena config. Identity from the JWT."""
    student_id = current_user["sub"]
    try:
        clean = validate_config(body)
    except InvalidAvatarConfig as e:
        raise HTTPException(status_code=422, detail=str(e))
    await update_profile(student_id, avatar_config=clean)
    return {"config": clean}
