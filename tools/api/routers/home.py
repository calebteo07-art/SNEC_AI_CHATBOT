"""The Home game loop — one payload, and the two claims.

ONE endpoint on purpose. Prod is a single uvicorn worker on Render free, so a Home that
fanned out to progress + leaderboard + suggestion would cost three round-trips on the one
worker. It also gives the screen a single honest error state instead of three independent
partial failures.
"""
from datetime import timedelta

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from tools.api.shared import limiter
from tools.gamification.chest import boost_multiplier, roll_chest
from tools.gamification.daily_state import read_daily_state
from tools.gamification.quests import daily_quests, is_complete, quest_progress
from tools.profile.get_profile import get_profile
from tools.profile.update_profile import update_profile
from tools.progress.get_progress import DAILY_XP_GOAL
from tools.shared import db
from tools.shared.audit_log import log
from tools.shared.clock import app_now, app_today
from tools.shared.jwt_utils import CurrentUser, get_current_user

router = APIRouter()


class QuestClaim(BaseModel):
    kind: str


def _activity_for_quests(state: dict, profile: dict, today) -> dict:
    """The activity dict quests read. `xp` is NOT in daily_state — it already lives in the
    xp_today column, and duplicating it would be two counters that can disagree."""
    stamp = str(profile.get("xp_today_date") or "")
    xp_today = int(profile.get("xp_today") or 0) if stamp == today.isoformat() else 0
    return {**state["activity"], "xp": xp_today}


def _quest_payload(profile: dict, student_id: str, today) -> tuple[list[dict], dict]:
    state = read_daily_state(profile, today)
    activity = _activity_for_quests(state, profile, today)
    quests = daily_quests(student_id, today, list(profile.get("weak_topics") or []),
                          DAILY_XP_GOAL)
    rows = [{
        "kind": q.kind, "title": q.title, "target": q.target, "reward_xp": q.reward_xp,
        "progress": min(quest_progress(q, activity), q.target),
        "complete": is_complete(q, activity),
        "claimed": q.kind in state["quests_claimed"],
    } for q in quests]
    return rows, state


@router.get("/api/home")
@limiter.limit("60/minute")
async def home(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    """Everything the Home HUD needs, in one read.

    A failed read returns nulls, never zeros: the one screen a student opens to see their
    work must not report "no quests, no streak" as fact when it simply could not load."""
    student_id = current_user["sub"]
    today = app_today()
    try:
        profile = await get_profile(student_id) or {}
    except Exception as exc:
        log("home_read_error", student_id=student_id, feature="home", detail=str(exc))
        return {"quests": None, "chest": None, "boost": None}

    rows, state = _quest_payload(profile, student_id, today)
    drop = roll_chest(student_id, today)
    mult = boost_multiplier(profile, app_now())
    boosts = profile.get("boosts") if isinstance(profile.get("boosts"), dict) else {}

    return {
        "quests": rows,
        "chest": {"claimed": state["chest_claimed"], "key": drop.key, "label": drop.label},
        "boost": {"multiplier": mult, "until": boosts.get("xp2x_until") if mult > 1.0 else None},
    }


@router.post("/api/home/chest/claim")
@limiter.limit("30/minute")
async def claim_chest(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    """Claim today's chest. Idempotent by construction: the drop is a pure function of
    (student_id, date), so a repeat claim cannot pay a different prize even if the first
    claim's write failed. Identity is the JWT sub — never the body."""
    student_id = current_user["sub"]
    today = app_today()
    try:
        profile = await get_profile(student_id) or {}
    except Exception:
        return {"ok": False, "already_claimed": False, "drop": None}

    drop = roll_chest(student_id, today)
    state = read_daily_state(profile, today)
    payload = {"key": drop.key, "label": drop.label}
    if state["chest_claimed"]:
        return {"ok": True, "already_claimed": True, "drop": payload}

    fields = {"daily_state": {**state, "chest_claimed": True},
              "daily_state_date": today.isoformat()}
    if drop.boost_minutes:
        boosts = dict(profile.get("boosts") or {}) if isinstance(profile.get("boosts"), dict) else {}
        boosts["xp2x_until"] = (app_now() + timedelta(minutes=drop.boost_minutes)).isoformat()
        fields["boosts"] = boosts
    if drop.freezes:
        fields["streak_freezes"] = int(profile.get("streak_freezes") or 0) + drop.freezes

    try:
        await db.update_profile(student_id, **fields)
    except Exception as exc:
        log("chest_claim_error", student_id=student_id, feature="home", detail=str(exc))
        return {"ok": False, "already_claimed": False, "drop": payload}
    return {"ok": True, "already_claimed": False, "drop": payload}


@router.post("/api/home/quest/claim")
@limiter.limit("30/minute")
async def claim_quest(request: Request, body: QuestClaim,
                      current_user: CurrentUser = Depends(get_current_user)):
    """Claim a completed quest's XP. Identity is the JWT sub — never the body, which
    carries only which quest. Quests pay XP rather than boosts because a quest cannot be
    completed without studying, so the payout can never buy League rank."""
    student_id = current_user["sub"]
    today = app_today()
    try:
        profile = await get_profile(student_id) or {}
    except Exception:
        return {"ok": False, "already_claimed": False}

    rows, state = _quest_payload(profile, student_id, today)
    row = next((r for r in rows if r["kind"] == body.kind), None)
    if row is None or not row["complete"]:
        return {"ok": False, "already_claimed": False}
    if row["claimed"]:
        return {"ok": True, "already_claimed": True}

    # Mark claimed FIRST. If the award then fails the student can retry; the reverse order
    # would let a retry pay twice, and double-paying the League is the worse failure.
    try:
        await db.update_profile(
            student_id,
            daily_state={**state, "quests_claimed": [*state["quests_claimed"], body.kind]},
            daily_state_date=today.isoformat(),
        )
    except Exception as exc:
        log("quest_claim_error", student_id=student_id, feature="home", detail=str(exc))
        return {"ok": False, "already_claimed": False}

    await update_profile(student_id, xp_delta=row["reward_xp"])
    return {"ok": True, "already_claimed": False, "reward_xp": row["reward_xp"]}
