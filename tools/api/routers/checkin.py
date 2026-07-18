"""Check-in endpoints — daily multiple-choice "brain icebreaker".

Each day a student is served one easy MCQ, rotated through the role pool with no
repeat until the pool is exhausted (pick_by_day_count). Options are shuffled
deterministically per student/day so the correct answer is not always in the same
position. Grading is fully deterministic (selected option text == correct option
text) — no AI marks the check-in.
"""
import random as _random

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from tools.api.shared import limiter
from tools.checkin.static_questions import CHECKIN_QUESTION_POOL
from tools.gamification import streak as streak_engine
from tools.profile.get_profile import get_profile
from tools.profile.update_profile import update_profile
from tools.shared.clock import app_today
from tools.shared.jwt_utils import get_current_user, CurrentUser
from tools.shared.static_pools import pick_by_day_count

router = APIRouter()

# Per-student daily question cache: student_id -> (date_iso, CheckinQuestionResponse)
_question_cache: dict[str, tuple[str, "CheckinQuestionResponse"]] = {}


# ── Check-in models ────────────────────────────────────────────────────────

class CheckinStatusResponse(BaseModel):
    checkin_done_today: bool
    streak: int
    weak_topic: str | None

class CheckinQuestionResponse(BaseModel):
    question: str
    topic: str
    options: list[str]
    question_id: str

class CheckinAnswerRequest(BaseModel):
    question_id: str
    answer: str          # the selected option's text

class CheckinAnswerResponse(BaseModel):
    correct: bool
    feedback: str
    correct_answer: str


# ── Helpers ────────────────────────────────────────────────────────────────

def _shuffle_options(options: list[str], seed: str) -> list[str]:
    """Deterministic per (student, question, day) option order."""
    opts = list(options)
    _random.Random(seed).shuffle(opts)
    return opts


def _lookup(question_id: str) -> dict | None:
    """Resolve a question_id ('ROLE-idx') back to its canonical pool entry."""
    try:
        role, idx = question_id.rsplit("-", 1)
        pool = CHECKIN_QUESTION_POOL.get(role.upper())
        if pool is None:
            return None
        return pool[int(idx)]
    except (ValueError, IndexError, KeyError):
        return None


# ── Check-in endpoints ─────────────────────────────────────────────────────

@router.get("/api/checkin/status", response_model=CheckinStatusResponse)
async def checkin_status(current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    try:
        profile = await get_profile(student_id)
    except Exception:
        return CheckinStatusResponse(checkin_done_today=False, streak=0, weak_topic=None)

    today = app_today()
    history = list(profile.get("checkin_history") or [])
    # Streak resolved from the durable check-in log (survives weekend rest days and a
    # freeze-bridged weekday; a lapsed streak reads as 0), and healed from history
    # when the stored column never persisted. `done` is true once today is logged.
    resolved = streak_engine.resolve_streak(
        profile.get("streak"), profile.get("streak_freezes"), history, today
    )
    streak = resolved["current"]
    done = resolved["done_today"] or bool(profile.get("checkin_done_today", False))

    try:
        weak = profile.get("weak_topics", []) or []
        weak_topic = weak[0] if weak else None
    except Exception:
        weak_topic = None

    return CheckinStatusResponse(checkin_done_today=done, streak=streak, weak_topic=weak_topic)


@router.get("/api/checkin/question", response_model=CheckinQuestionResponse)
@limiter.limit("10/minute")
async def checkin_question(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    today = app_today().isoformat()

    cached = _question_cache.get(student_id)
    if cached and cached[0] == today:
        return cached[1]

    role = "OA"
    try:
        profile = await get_profile(student_id)
        role = (profile.get("role") or "OA").upper()
    except Exception:
        role = "OA"

    pool = CHECKIN_QUESTION_POOL.get(role) or CHECKIN_QUESTION_POOL["OA"]
    idx = pick_by_day_count(student_id, len(pool), "checkin", today=app_today())
    entry = pool[idx]
    question_id = f"{role}-{idx}"
    options = _shuffle_options(entry["options"], f"{student_id}:{question_id}:{today}")

    result = CheckinQuestionResponse(
        question=entry["question"],
        topic=entry["topic"],
        options=options,
        question_id=question_id,
    )
    _question_cache[student_id] = (today, result)
    return result


@router.post("/api/checkin/answer", response_model=CheckinAnswerResponse)
@limiter.limit("20/minute")
async def checkin_answer(request: Request, body: CheckinAnswerRequest, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    entry = _lookup(body.question_id)
    if entry is None:
        raise HTTPException(status_code=400, detail="Unknown question.")

    correct_text = entry["options"][entry["answer"]]
    is_correct = body.answer.strip() == correct_text.strip()

    # Completing the check-in marks it done (keeps the streak alive) regardless of score.
    try:
        await update_profile(student_id, checkin_done=True)
    except Exception:
        pass

    return CheckinAnswerResponse(
        correct=is_correct,
        feedback=entry.get("explanation", ""),
        correct_answer=correct_text,
    )
