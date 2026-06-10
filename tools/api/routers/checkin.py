"""Check-in endpoints."""
import json
from datetime import date as _date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from tools.api.shared import limiter
from tools.checkin.static_questions import CHECKIN_QUESTION_POOL
from tools.profile.get_profile import get_profile
from tools.profile.update_profile import update_profile
from tools.shared import db
from tools.shared.gemini_client import ask, MODEL_SMALL
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

class CheckinAnswerRequest(BaseModel):
    question: str
    answer: str
    topic: str

class CheckinAnswerResponse(BaseModel):
    correct: bool
    feedback: str


# ── Check-in endpoints ─────────────────────────────────────────────────────

@router.get("/api/checkin/status", response_model=CheckinStatusResponse)
async def checkin_status(current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    try:
        profile = await get_profile(student_id)
    except Exception:
        return CheckinStatusResponse(checkin_done_today=False, streak=0, weak_topic=None)

    done = bool(profile.get("checkin_done_today", False))
    streak = int(profile.get("streak") or 0)
    today = _date.today()

    # Reset streak if the student missed ≥1 day since their last completed check-in
    last_checkin_raw = profile.get("last_checkin_date")
    try:
        last_checkin = _date.fromisoformat(str(last_checkin_raw)) if last_checkin_raw else None
    except (ValueError, TypeError):
        last_checkin = None

    if last_checkin is not None and last_checkin < today - timedelta(days=1):
        # Gap detected — streak is broken
        streak = 0
        done = False
        try:
            await db.update_profile(student_id, streak=0, checkin_done_today=False)
        except Exception:
            pass
    elif last_checkin is None and streak > 0:
        # Stale streak from before last_checkin_date existed — reset defensively
        streak = 0
        try:
            await db.update_profile(student_id, streak=0)
        except Exception:
            pass

    try:
        weak = profile.get("weak_topics", []) or []
        weak_topic = weak[0] if weak else None
    except Exception:
        weak_topic = None

    return CheckinStatusResponse(
        checkin_done_today=done,
        streak=streak,
        weak_topic=weak_topic,
    )


@router.get("/api/checkin/question", response_model=CheckinQuestionResponse)
@limiter.limit("10/minute")
async def checkin_question(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    today = _date.today().isoformat()

    # 1. In-memory cache — fastest path (same process, same day)
    cached = _question_cache.get(student_id)
    if cached and cached[0] == today:
        return cached[1]

    # 2. DB cache — survives server restarts (Render free tier restarts frequently)
    try:
        profile = await get_profile(student_id)
        if profile.get("daily_q_date") == today and profile.get("daily_q_text"):
            result = CheckinQuestionResponse(
                question=profile["daily_q_text"],
                topic=profile.get("daily_q_topic", "Ophthalmology"),
            )
            _question_cache[student_id] = (today, result)
            return result
        role = profile.get("role", "")
    except Exception:
        profile = {}
        role = ""

    role_pool = CHECKIN_QUESTION_POOL.get(role.upper()) or CHECKIN_QUESTION_POOL["OA"]
    idx = pick_by_day_count(student_id, len(role_pool), "checkin")
    entry = role_pool[idx]
    topic, question_text = entry["topic"], entry["question"]
    result = CheckinQuestionResponse(question=question_text, topic=topic)
    _question_cache[student_id] = (today, result)
    # Persist to DB so the DB-cache fast path (step 2 above) serves the rest of today
    try:
        await db.update_profile(student_id,
            daily_q_date=today,
            daily_q_text=question_text,
            daily_q_topic=topic,
        )
    except Exception:
        pass   # non-fatal — in-memory cache still serves this session
    return result


@router.post("/api/checkin/answer", response_model=CheckinAnswerResponse)
@limiter.limit("10/minute")
async def checkin_answer(request: Request, body: CheckinAnswerRequest, current_user: CurrentUser = Depends(get_current_user)):
    from tools.api.shared import _student_context_block
    student_id = current_user["sub"]
    ctx_block = await _student_context_block(student_id)
    system = (
        (ctx_block + "\n\n" if ctx_block else "")
        + "You are a rigorous ophthalmology clinical educator evaluating a daily warm-up answer. "
        "Be honest and critical — if the answer is incomplete, vague, or missing key details, say so. "
        "Do not inflate scores or praise weak answers. "
        "Frame your feedback using the student's role and target the specific gaps listed above.\n\n"
        "Return ONLY valid JSON with no other text:\n"
        "{\n"
        '  "correct": true or false,\n'
        '  "feedback": "2–4 sentences: (1) directly assess what the student got right or wrong, '
        "being specific about gaps or misconceptions; (2) provide the accurate, complete clinical answer "
        "with precise values, protocols, or mechanisms a competent allied health professional should know; "
        '(3) explain why this matters in practice at SNEC — patient safety, workflow, or clinical outcome."\n'
        "}"
    )
    try:
        raw = ask(
            system_prompt=system,
            messages=[{
                "role": "user",
                "content": (
                    f"Question: {body.question}\n"
                    f"Student answer: {body.answer}"
                ),
            }],
            max_tokens=1024,
            feature="checkin",
            model=MODEL_SMALL,
            thinking_level="LOW",
        )
    except Exception as exc:
        if "quota_exceeded" in str(exc):
            raise HTTPException(status_code=503, detail="quota_exceeded")
        try:
            await update_profile(student_id, checkin_done=True)
        except Exception:
            pass
        return CheckinAnswerResponse(
            correct=True,
            feedback="Your answer has been recorded. AI grading is temporarily unavailable — well done for completing today's check-in!"
        )

    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        parsed = json.loads(text)
        correct = bool(parsed.get("correct", False))
        feedback = str(parsed.get("feedback", raw.strip()))
    except Exception:
        correct = "true" in raw.lower().split("correct:")[-1][:10]
        feedback_parts = raw.split("FEEDBACK:")
        feedback = feedback_parts[-1].strip() if len(feedback_parts) > 1 else raw.strip()

    try:
        await update_profile(student_id, checkin_done=True)
    except Exception:
        pass

    return CheckinAnswerResponse(correct=correct, feedback=feedback)
