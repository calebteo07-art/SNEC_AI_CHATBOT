"""Student profile and learning endpoints."""
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from tools.api.shared import limiter, _case_cache
from tools.flashcards.flashcard_store import count_due_cards, get_due_cards, get_served_static_fronts, insert_cards, update_card_sm2
from tools.flashcards.sm2 import next_review, due_date
from tools.flashcards.static_cards import get_set_cards, get_all_cards, set_card_counts
from tools.flashcards.flashcard_sets import sets_for, split_set_key
from tools.profile.get_profile import get_profile
from tools.profile.update_profile import update_profile
from tools.shared.gemini_client import ask, MOCK_MODE, MODEL, MODEL_SMALL
from tools.shared.jwt_utils import get_current_user, require_supervisor, CurrentUser
from tools.shared.static_pools import pick_next_unseen
from tools.shared import db

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
    # Defensive cap — the UI limits answers to 300 chars; truncate generously here
    # so an oversized payload can never bloat the grader prompt.
    student_answer = (body.student_answer or "")[:600]
    system = (
        (ctx_block + "\n\n" if ctx_block else "")
        + "You are a warm, encouraging ophthalmology tutor grading a student's active-recall attempt. "
        "Grade the attempt ONLY against the model answer provided — that model answer is the "
        "authoritative reference drawn from the training material, so treat it as the source of truth. "
        "Give a score from 0 to 100 for how well the student's answer captures the key ideas in the model answer. "
        "Be VERY lenient and generous: reward any correct idea, give partial credit freely, ignore spelling, "
        "phrasing, grammar and word order, and always give the benefit of the doubt. A reasonable attempt that "
        "shows understanding should land in the 70-100 range; only a blank or entirely wrong answer scores low. "
        "Write feedback in short, natural, plain language — 1 to 2 sentences. Keep it warm and motivating: "
        "say what they got right first, then gently mention anything to add. Use clinical jargon only when it is "
        "the clearest word; otherwise keep it simple. "
        "Return ONLY valid JSON with no other text:\n"
        '{"score": <0-100>, "feedback": "<1-2 short, warm, natural sentences>"}'
    )
    try:
        raw = ask(
            system_prompt=system,
            messages=[{
                "role": "user",
                "content": (
                    f"Question: {body.question}\n\n"
                    f"Model answer (authoritative reference): {body.correct_answer}\n\n"
                    f"Student answer: {student_answer}"
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
        score = int(parsed.get("score", 70))
        feedback = parsed.get("feedback", raw[:300])
    except Exception:
        score = 70
        feedback = raw[:300]
    score = max(0, min(100, score))  # clamp to the 0-100 grading scale

    # Persist SM-2 schedule update in background (non-critical — never blocks response)
    if body.card_id:
        quality = round(score / 20)  # map 0-100 → 0-5 for SM-2
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
    n: int = 6,
    current_user: CurrentUser = Depends(get_current_user),
):
    student_id = current_user["sub"]
    # Session length (F4): Quick 5 / Standard 10 / Deep 20. Clamp defensively.
    n = max(1, min(20, n))
    role = ""
    try:
        role = (await get_profile(student_id)).get("role", "")
    except Exception:
        pass

    # Accept either set_key="topic__difficulty" or explicit topic+difficulty.
    if set_key and not (topic and difficulty):
        topic, difficulty = split_set_key(set_key)

    # A specific set was chosen → serve that set with per-user no-repeat rotation.
    # A set is a fixed 5-card unit, so the session length only caps it (never extends).
    if topic and difficulty:
        pool = get_set_cards(role, topic, difficulty)
        if pool:
            served_fronts = await get_served_static_fronts(student_id)
            served_indices = {i for i, c in enumerate(pool) if c["front"] in served_fronts}
            picks = pick_next_unseen(student_id, len(pool), f"flash_{topic}_{difficulty}", served_indices, n=min(n, len(pool)))
            new_cards = [{**pool[i], "source": "static"} for i in picks]
            return [Flashcard(**{k: c[k] for k in ("card_id", "front", "back", "topic_tag") if k in c})
                    for c in await insert_cards(student_id, new_cards)]
        return []

    # Mixed / Review (no set) → blend SM-2 due cards first, then top up with new
    # cards from the role pool until the chosen session length is reached.
    try:
        cards = await get_due_cards(student_id, limit=n)
    except Exception:
        cards = []

    if len(cards) < n:
        pool = get_all_cards(role)
        if pool:
            served_fronts = await get_served_static_fronts(student_id)
            served_indices = {i for i, c in enumerate(pool) if c["front"] in served_fronts}
            picks = pick_next_unseen(student_id, len(pool), "flashcards", served_indices, n=(n - len(cards)))
            new_cards = [{**pool[i], "source": "static"} for i in picks]
            cards = cards + await insert_cards(student_id, new_cards)

    return [Flashcard(**{k: c[k] for k in ("card_id", "front", "back", "topic_tag") if k in c}) for c in cards]


class DueCountResponse(BaseModel):
    count: int


@router.get("/api/flashcards/due-count", response_model=DueCountResponse)
async def flashcards_due_count(current_user: CurrentUser = Depends(get_current_user)):
    """How many cards are due for review today (SM-2) — surfaced on the dashboard."""
    student_id = current_user["sub"]
    try:
        count = await count_due_cards(student_id)
    except Exception:
        count = 0
    return DueCountResponse(count=count)


# ── Cohort leaderboard (opt-in, supervisor-gated) ───────────────────────────

def _short_name(full: str) -> str:
    """First name + last initial, e.g. 'Caleb T.' — shown for opted-in students."""
    parts = (full or "").strip().split()
    if not parts:
        return "Student"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0]}."


class LeaderboardEntry(BaseModel):
    rank: int
    name: str
    xp: int
    level: int
    is_you: bool


class LeaderboardResponse(BaseModel):
    enabled: bool
    opted_in: bool
    entries: list[LeaderboardEntry]


class OptInRequest(BaseModel):
    opt_in: bool


@router.get("/api/leaderboard", response_model=LeaderboardResponse)
async def leaderboard(current_user: CurrentUser = Depends(get_current_user)):
    """The cohort leaderboard — only populated when a supervisor has enabled it
    AND the calling student has opted in. Entries are the opted-in students,
    ranked by XP and shown as first name + last initial."""
    student_id = current_user["sub"]
    try:
        enabled = await db.get_leaderboard_enabled()
    except Exception:
        enabled = False

    opted_in = False
    try:
        prof = await get_profile(student_id)
        opted_in = bool(prof.get("leaderboard_opt_in"))
    except Exception:
        pass

    entries: list[LeaderboardEntry] = []
    if enabled and opted_in:
        try:
            profiles = await db.get_all_profiles()
            consent = await db.get_all_consent()
            name_map = {r["student_id"]: (r.get("student_name") or "") for r in consent}
            ranked = sorted(
                [p for p in profiles if p.get("leaderboard_opt_in")],
                key=lambda p: int(p.get("xp") or 0),
                reverse=True,
            )
            for i, p in enumerate(ranked):
                sid = p["student_id"]
                entries.append(LeaderboardEntry(
                    rank=i + 1,
                    name=_short_name(name_map.get(sid, "Student")),
                    xp=int(p.get("xp") or 0),
                    level=int(p.get("level") or 1),
                    is_you=(sid == student_id),
                ))
        except Exception:
            entries = []

    return LeaderboardResponse(enabled=enabled, opted_in=opted_in, entries=entries)


@router.post("/api/leaderboard/opt-in")
async def leaderboard_opt_in(body: OptInRequest, current_user: CurrentUser = Depends(get_current_user)):
    """Student joins or leaves the cohort leaderboard."""
    student_id = current_user["sub"]
    try:
        await db.update_profile(student_id, leaderboard_opt_in=body.opt_in)
    except Exception:
        raise HTTPException(status_code=503, detail="The leaderboard isn't available yet.")
    return {"ok": True, "opted_in": body.opt_in}


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
