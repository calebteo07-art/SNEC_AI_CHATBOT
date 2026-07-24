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
from tools.shared.audit_log import log
# Raw DB read (returns None if absent, RAISES on a read error) — NOT the graceful
# tools.profile.get_profile, which swallows a read error into a default profile with no
# avatar_config. That swallow makes `customized` a false positive on any transient read blip,
# trapping an established student in the mandatory first-run Studio. Here we must tell "never
# customized" (None row) apart from "couldn't read" (exception) — see _resolve_config.
from tools.shared.db import get_profile, upsert_profile, insert_audit_event
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
    """(config, customized) for the student.

    ``customized`` gates the MANDATORY first-run Eyecon Studio, so it must never be a false
    positive. It is True the moment a student has EVER saved a config (even a now-stale one),
    and — crucially — a transient profile-read FAILURE is read fail-OPEN (customized=True,
    the returning-student path), NOT as "never customized". Identity is stable (one consent
    row per email), so an *intermittent* first-run signal for someone who already built their
    Eyecon can only be a swallowed read error; reporting False on it trapped established
    students in the Studio ("it re-pops and I can't leave"). A genuinely absent row (a real
    new student) still reads False. A stored config gone stale (a retired option id) never
    500s a read — it falls back to the default and logs the drift for staff.
    """
    try:
        profile = await get_profile(student_id) or {}
    except Exception as e:
        # Couldn't read the profile — do NOT claim first-run. Fail OPEN to returning-student;
        # the client repaints the real Eyecon on the next good read. Durable audit (audit_events
        # survives; the .tmp/audit_log.jsonl file is ephemeral per-worker on Render) so this
        # fail-open is observable in prod — query action='avatar_read_error' to see it fire.
        log("avatar_profile_read_error", student_id=student_id, feature="avatar", detail=str(e))
        await insert_audit_event(action="avatar_read_error", actor=student_id,
                                 feature="avatar", detail=str(e)[:200])
        return dict(DEFAULT_AVATAR), True
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
    # Upsert (not a blind UPDATE): the save is the only exit from the mandatory first-run
    # Studio, and UPDATE ... WHERE student_id silently no-ops when the row is missing —
    # trapping the student. Upsert guarantees the write lands and `customized` flips true.
    await upsert_profile(student_id, avatar_config=clean)
    return {"config": clean}
