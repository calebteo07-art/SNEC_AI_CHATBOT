"""Student profile and learning endpoints."""
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from tools.api.shared import limiter, _case_cache
from tools.flashcards.flashcard_store import get_due_cards, get_served_static_fronts, insert_cards, update_card_sm2
from tools.flashcards.sm2 import next_review, due_date
from tools.flashcards.static_cards import get_set_cards, get_all_cards, set_card_counts
from tools.flashcards.flashcard_sets import sets_for, split_set_key
from tools.profile.get_profile import get_profile
from tools.profile.update_profile import update_profile
from tools.shared.gemini_client import ask, MOCK_MODE, MODEL, MODEL_SMALL
from tools.shared.jwt_utils import get_current_user, require_supervisor, CurrentUser
from tools.shared.static_pools import pick_next_unseen

router = APIRouter()

_ROLE_TUTOR_CONTEXT = {
    "OA": (
        "STUDENT ROLE: Ophthalmic Assistant (OA). "
        "Focus teaching on: patient history taking, IOP measurement, pupil dilation, "
        "pre-operative and post-operative care, patient education and counselling."
    ),
    "OT": (
        "STUDENT ROLE: Ophthalmic Technician (OT). "
        "Focus teaching on: A-scan biometry, Humphrey Visual Field testing, OCT imaging, "
        "corneal topography, endothelial cell count, equipment calibration and quality checks."
    ),
    "PSA": (
        "STUDENT ROLE: Patient Service Associate (PSA). "
        "Focus teaching on: history taking, LogMAR visual acuity testing, non-contact tonometry (NCT), "
        "eye drop instillation, pupil dilation, PFAER and fall risk assessment."
    ),
}


# ── Models ─────────────────────────────────────────────────────────────────

class RoleUpdateRequest(BaseModel):
    role: str  # OA | OT | PSA

class FlashcardCheckRequest(BaseModel):
    question: str
    student_answer: str
    correct_answer: str
    card_id: str | None = None          # Supabase UUID — enables SM-2 update when present
    repetitions: int = 0                # current card repetition count
    easiness: float = 2.5               # current easiness factor
    interval_days: int = 0              # current interval

class FlashcardCheckResponse(BaseModel):
    feedback: str
    score: int
    mock_mode: bool

class Flashcard(BaseModel):
    card_id: str
    front: str
    back: str
    topic_tag: str

class StudySuggestionResponse(BaseModel):
    suggestion: str
    focus_topic: str | None = None


# ── Gamification sync ─────────────────────────────────────────────────────

class GamificationSyncRequest(BaseModel):
    xp_delta: int = 0
    hearts_used: int = 0
    topic: str | None = None
    score: float | None = None

@router.post("/api/gamification/sync")
@limiter.limit("30/minute")
async def sync_gamification(
    request: Request,
    body: GamificationSyncRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    student_id = current_user["sub"]
    await update_profile(
        student_id,
        topic=body.topic,
        score=body.score,
        xp_delta=body.xp_delta,
        hearts_used=body.hearts_used,
    )
    profile = await get_profile(student_id)
    xp = int(profile.get("xp") or 0)
    hearts = int(profile.get("hearts") or 5)
    return {
        "xp": xp,
        "hearts": hearts,
        "level": (xp // 500) + 1,
        "streak": int(profile.get("streak") or 0),
    }


# ── Profile role update ────────────────────────────────────────────────────

@router.patch("/api/profile/role")
async def update_role(body: RoleUpdateRequest, current_user: CurrentUser = Depends(require_supervisor)):
    student_id = current_user["sub"]  # identity from JWT
    role = body.role.strip().upper()
    if role not in ("OA", "OT", "PSA"):
        raise HTTPException(status_code=400, detail="Invalid role. Must be OA, OT, or PSA.")
    try:
        await update_profile(student_id, role=role)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Could not update role. Please try again.")
    # Clear cached cases so the next visit to the case list regenerates
    # with role-appropriate checklists for the new role.
    _case_cache.clear()
    return {"ok": True}


# ── Flashcard AI check ─────────────────────────────────────────────────────

@router.post("/api/flashcards/check", response_model=FlashcardCheckResponse)
@limiter.limit("10/minute")
async def flashcard_check(request: Request, body: FlashcardCheckRequest, current_user: CurrentUser = Depends(get_current_user)):
    from tools.api.shared import _student_context_block
    student_id = current_user["sub"]
    ctx_block = await _student_context_block(student_id)
    system = (
        (ctx_block + "\n\n" if ctx_block else "")
        + "You are an ophthalmology tutor evaluating a student's active recall attempt. "
        "Consider the student's role and weak areas above when giving feedback — connect the concept to their clinical context. "
        "Return ONLY valid JSON with no other text:\n"
        '{"score": <0-10>, "feedback": "<2-3 sentences: what they got right, what they missed, and a clinical tip relevant to their role>"}'
    )
    try:
        raw = ask(
            system_prompt=system,
            messages=[{
                "role": "user",
                "content": (
                    f"Question: {body.question}\n\n"
                    f"Correct answer: {body.correct_answer}\n\n"
                    f"Student answer: {body.student_answer}"
                ),
            }],
            max_tokens=1024,
            feature="flashcard",
            model=MODEL_SMALL,
            thinking_level="LOW",
        )
    except RuntimeError as exc:
        if "quota_exceeded" in str(exc):
            raise HTTPException(status_code=503, detail="quota_exceeded")
        raise
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        parsed = json.loads(text)
        score = int(parsed.get("score", 5))
        feedback = parsed.get("feedback", raw[:300])
    except Exception:
        score = 5
        feedback = raw[:300]

    # Persist SM-2 schedule update in background (non-critical — never blocks response)
    if body.card_id:
        quality = round(score / 2)  # map 0-10 → 0-5 for SM-2
        try:
            from tools.workers.tasks.sm2_review import process_review
            process_review.delay(
                body.card_id, quality,
                body.repetitions, body.easiness, body.interval_days,
            )
        except Exception:
            # Celery unavailable — fall back to synchronous write
            try:
                new_interval, new_ease, new_reps = next_review(
                    quality, body.repetitions, body.easiness, body.interval_days
                )
                await update_card_sm2(body.card_id, new_interval, new_ease, new_reps, due_date(new_interval))
            except Exception:
                pass

    return FlashcardCheckResponse(feedback=feedback, score=score, mock_mode=MOCK_MODE)


# ── Flashcard topic + difficulty picker ────────────────────────────────────

class FlashcardSetInfo(BaseModel):
    set_key: str
    topic_key: str
    label: str
    difficulty: str
    total: int
    completed: int

class FlashcardTopicsResponse(BaseModel):
    sets: list[FlashcardSetInfo]


@router.get("/api/flashcards/topics", response_model=FlashcardTopicsResponse)
async def flashcards_topics(current_user: CurrentUser = Depends(get_current_user)):
    """The 30 selectable sets (15 topics x easy/medium) for the caller's role,
    with how many cards each set has and how many the student has already seen."""
    student_id = current_user["sub"]
    role = ""
    try:
        role = (await get_profile(student_id)).get("role", "")
    except Exception:
        pass

    counts = set_card_counts(role)
    served_fronts: set[str] = set()
    try:
        served_fronts = await get_served_static_fronts(student_id)
    except Exception:
        pass

    sets: list[FlashcardSetInfo] = []
    for s in sets_for(role):
        set_cards = get_set_cards(role, s["topic_key"], s["difficulty"])
        completed = sum(1 for c in set_cards if c["front"] in served_fronts)
        sets.append(FlashcardSetInfo(
            set_key=s["set_key"], topic_key=s["topic_key"], label=s["label"],
            difficulty=s["difficulty"], total=counts.get(s["set_key"], 0),
            completed=completed,
        ))
    return FlashcardTopicsResponse(sets=sets)


# ── On-demand flashcard serving (static pool, per-user no-repeat) ───────────

@router.get("/api/flashcards/generate", response_model=list[Flashcard])
@limiter.limit("10/minute")
async def flashcards_generate(
    request: Request,
    topic: str | None = None,
    difficulty: str | None = None,
    set_key: str | None = None,
    current_user: CurrentUser = Depends(get_current_user),
):
    student_id = current_user["sub"]
    role = ""
    try:
        role = (await get_profile(student_id)).get("role", "")
    except Exception:
        pass

    # Accept either set_key="topic__difficulty" or explicit topic+difficulty.
    if set_key and not (topic and difficulty):
        topic, difficulty = split_set_key(set_key)

    # A specific set was chosen → serve that set with per-user no-repeat rotation.
    if topic and difficulty:
        pool = get_set_cards(role, topic, difficulty)
        if pool:
            served_fronts = await get_served_static_fronts(student_id)
            served_indices = {i for i, c in enumerate(pool) if c["front"] in served_fronts}
            picks = pick_next_unseen(student_id, len(pool), f"flash_{topic}_{difficulty}", served_indices, n=min(5, len(pool)))
            new_cards = [{**pool[i], "source": "static"} for i in picks]
            return [Flashcard(**{k: c[k] for k in ("card_id", "front", "back", "topic_tag") if k in c})
                    for c in await insert_cards(student_id, new_cards)]
        return []

    # No set chosen → due cards first, then rotate across the whole role pool.
    try:
        cards = await get_due_cards(student_id, limit=6)
    except Exception:
        cards = []

    if not cards:
        pool = get_all_cards(role)
        if pool:
            served_fronts = await get_served_static_fronts(student_id)
            served_indices = {i for i, c in enumerate(pool) if c["front"] in served_fronts}
            picks = pick_next_unseen(student_id, len(pool), "flashcards", served_indices, n=6)
            new_cards = [{**pool[i], "source": "static"} for i in picks]
            cards = await insert_cards(student_id, new_cards)

    return [Flashcard(**{k: c[k] for k in ("card_id", "front", "back", "topic_tag") if k in c}) for c in cards]


# ── Study suggestion ───────────────────────────────────────────────────────

@router.get("/api/study-suggestion", response_model=StudySuggestionResponse)
@limiter.limit("10/minute")
async def study_suggestion(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    focus: str | None = None
    try:
        profile = await get_profile(student_id)
        weak = profile.get("weak_topics", []) or []
        streak = int(profile.get("streak") or 0)
        session_count = int(profile.get("session_count") or 0)
        velocity = profile.get("learning_velocity", "stable")
        focus = weak[0] if weak else None
        role_line = _ROLE_TUTOR_CONTEXT.get(profile.get("role", "").upper(), "")
        context = (
            f"Weak topics: {', '.join(weak) if weak else 'none identified yet'}\n"
            f"Study streak: {streak} days\n"
            f"Total sessions: {session_count}\n"
            f"Learning velocity: {velocity}"
        )
    except Exception:
        context = "New student — no profile data yet."
        role_line = ""

    system = (
        "You are an ophthalmology study coach. "
        + (f"Student role context: {role_line} " if role_line else "")
        + "Give the student one specific, clinical, motivating sentence telling them exactly what to study today and why — mention their role's procedures where relevant. "
        "Under 30 words. No preamble."
    )
    try:
        suggestion = ask(
            system_prompt=system,
            messages=[{"role": "user", "content": context}],
            max_tokens=256,
            feature="suggestion",
            model=MODEL_SMALL,
            thinking_level="MINIMAL",
        )
    except RuntimeError as exc:
        if "quota_exceeded" in str(exc):
            raise HTTPException(status_code=503, detail="quota_exceeded")
        raise
    return StudySuggestionResponse(suggestion=suggestion.strip(), focus_topic=focus)
