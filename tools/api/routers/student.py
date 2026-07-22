"""Student profile and learning endpoints."""
import asyncio
import json
import random

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from tools.api.shared import limiter, _case_cache, FORFEIT_PENALTY
from tools.flashcards.flashcard_store import count_due_cards, get_due_cards, get_served_static_fronts, insert_cards, update_card_sm2
from tools.flashcards.sm2 import next_review, due_date
from tools.flashcards.static_cards import (
    get_set_cards, get_all_cards, set_card_counts, mark_typed_cards, card_by_stem,
    get_topic_cards, topic_card_counts, shuffle_card_options,
)
from tools.flashcards.flashcard_sets import sets_for, split_set_key, topic_sets_for
from tools.gamification.leaderboard import rank_entries
from tools.profile.get_profile import get_profile
from tools.profile.update_profile import update_profile
from tools.shared.gemini_client import ask, MOCK_MODE, MODEL, MODEL_SMALL
from tools.shared.jwt_utils import get_current_user, require_staff, CurrentUser
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

class FlashcardOut(BaseModel):
    card_id: str
    stem: str
    options: list[str]
    correct: list[int]
    qtype: str
    kind: str
    explanation: str
    requires_explanation: bool = False
    topic_tag: str
    difficulty: str = ""
    repetitions: int = 0
    easiness: float = 2.5
    interval_days: int = 0

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
    # Clamp the client-supplied gain per request. This is the chat/tutor XP path (a few
    # Lumens per message); a single sync can't legitimately carry more, so a bound stops a
    # tampered payload injecting arbitrary Lumens through the one previously-unclamped
    # earning endpoint. Per-REQUEST anti-abuse ceiling, never a daily cap.
    xp_delta = max(0, min(body.xp_delta, 100))
    await update_profile(
        student_id,
        topic=body.topic,
        score=body.score,
        xp_delta=xp_delta,
        hearts_used=body.hearts_used,
    )
    profile = await get_profile(student_id)
    xp = int(profile.get("xp") or 0)
    hearts = int(profile.get("hearts") or 5)
    # xp_today resets each SGT day; a stale date reads as zero.
    from datetime import date as _date
    from tools.shared.clock import app_today
    try:
        xtd = _date.fromisoformat(str(profile.get("xp_today_date"))) if profile.get("xp_today_date") else None
    except (ValueError, TypeError):
        xtd = None
    xp_today = int(profile.get("xp_today") or 0) if xtd == app_today() else 0
    # Return the RESOLVED streak (healed from checkin_history, lapsed → 0), matching
    # checkin_status/get_progress/leaderboard — the raw column briefly shows a stale value.
    from tools.gamification.streak import resolve_streak
    resolved_streak = resolve_streak(
        profile.get("streak"), profile.get("streak_freezes"),
        list(profile.get("checkin_history") or []), app_today(),
    )["current"]
    return {
        "xp": xp,
        "xp_today": xp_today,
        "hearts": hearts,
        "level": (xp // 500) + 1,
        "streak": resolved_streak,
    }


# ── Profile role update ────────────────────────────────────────────────────

@router.patch("/api/profile/role")
async def update_role(body: RoleUpdateRequest, current_user: CurrentUser = Depends(require_staff)):
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
    student_id = current_user["sub"]
    # Defensive cap — the UI limits answers to 300 chars; truncate generously here
    # so an oversized payload can never bloat the grader prompt.
    student_answer = (body.student_answer or "")[:600]
    # becky §5: grade OBJECTIVELY against the model answer. No student-profile block —
    # personalization belongs in teaching, not scoring — which also drops a Supabase fetch.
    system = (
        "You are a warm, encouraging ophthalmology tutor grading a student's active-recall attempt. "
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
        raw = await asyncio.to_thread(
            ask,
            system_prompt=system,
            messages=[{
                "role": "user",
                "content": (
                    f"Question: {body.question}\n\n"
                    f"Model answer (authoritative reference): {body.correct_answer}\n\n"
                    f"Student answer: {student_answer}"
                ),
            }],
            # becky §5: a 0-100 int + 1-2 sentences; MINIMAL thinking, tight token cap.
            max_tokens=256,
            feature="flashcard",
            model=MODEL_SMALL,
            thinking_level="MINIMAL",
            response_json_schema={
                "type": "object",
                "properties": {"score": {"type": "integer"}, "feedback": {"type": "string"}},
                "required": ["score", "feedback"],
            },
        )
    except RuntimeError as exc:
        if "quota_exceeded" in str(exc):
            raise HTTPException(status_code=503, detail="quota_exceeded")
        raise
    # response_json_schema makes the model stop on clean JSON — no fence-stripping needed.
    try:
        parsed = json.loads(raw.strip())
        score = int(parsed.get("score", 70))
        feedback = parsed.get("feedback", raw[:300])
    except Exception:
        score = 70
        feedback = raw[:300]
    score = max(0, min(100, score))  # clamp to the 0-100 grading scale

    # Persist the SM-2 schedule update in-request. This previously enqueued to Celery
    # (process_review.delay) and only wrote synchronously if the enqueue RAISED — but no
    # Celery worker is deployed, so the moment REDIS_URL is set the enqueue succeeds into
    # an unconsumed queue and every review write is silently lost. The write is a single
    # async Supabase upsert; do it inline. Non-critical: a failure must never break the
    # score response the student is waiting on.
    if body.card_id:
        quality = round(score / 20)  # map 0-100 → 0-5 for SM-2
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
    """One selectable deck per topic for the caller's role (difficulty collapsed —
    each topic mixes all tiers into a single set keyed by topic_key), with how many
    cards the topic holds and how many the student has already seen."""
    student_id = current_user["sub"]
    role = ""
    try:
        role = (await get_profile(student_id)).get("role", "")
    except Exception:
        pass

    counts = topic_card_counts(role)
    served_fronts: set[str] = set()
    try:
        served_fronts = await get_served_static_fronts(student_id)
    except Exception:
        pass

    sets: list[FlashcardSetInfo] = []
    for s in topic_sets_for(role):
        total = counts.get(s["topic_key"], 0)
        if total == 0:
            continue  # topic not yet authored — don't show an empty deck
        topic_cards = get_topic_cards(role, s["topic_key"])
        completed = sum(1 for c in topic_cards if c["stem"] in served_fronts)
        sets.append(FlashcardSetInfo(
            set_key=s["set_key"], topic_key=s["topic_key"], label=s["label"],
            difficulty="mixed", total=total,
            completed=completed,
        ))
    return FlashcardTopicsResponse(sets=sets)


# ── On-demand flashcard serving (static pool, per-user no-repeat) ───────────

@router.get("/api/flashcards/generate", response_model=list[FlashcardOut])
@limiter.limit("10/minute")
async def flashcards_generate(
    request: Request,
    topic: str | None = None,
    difficulty: str | None = None,
    set_key: str | None = None,
    n: int = 10,
    current_user: CurrentUser = Depends(get_current_user),
):
    student_id = current_user["sub"]
    n = max(1, min(20, n))
    role = ""
    try:
        role = (await get_profile(student_id)).get("role", "")
    except Exception:
        pass

    if set_key and not (topic and difficulty):
        if "__" in set_key:
            topic, difficulty = split_set_key(set_key)
        else:
            # No-difficulty selection: a bare topic_key → mix all tiers of that topic.
            topic, difficulty = set_key, None

    # Per-request RNG: the bank authors the correct answer(s) first, so every
    # served card has its options shuffled and `correct` remapped here — the
    # answer slot is randomised instead of always being "option A".
    rng = random.Random()

    def _to_out(pool_card: dict, card_id: str) -> dict:
        c = shuffle_card_options(pool_card, rng)
        return {
            "card_id": card_id,
            "stem": c["stem"],
            "options": c["options"],
            "correct": c["correct"],
            "qtype": c["qtype"],
            "kind": c["kind"],
            "explanation": c["explanation"],
            # mark_typed_cards sets this on the final deck; pool cards never carry it.
            "requires_explanation": False,
            "topic_tag": pool_card.get("topic_tag", topic or "general"),
            "difficulty": pool_card.get("difficulty", difficulty or ""),
            "repetitions": pool_card.get("repetitions", 0),
            "easiness": pool_card.get("easiness", 2.5),
            "interval_days": pool_card.get("interval_days", 0),
        }

    async def _persist(pool_cards: list[dict]) -> list[dict]:
        # DB stores stem->front, explanation->back for no-repeat + SM-2 only.
        rows = [{"front": c["stem"], "back": c["explanation"],
                 "topic_tag": c.get("topic_tag", "general"), "source": "static"}
                for c in pool_cards]
        saved = await insert_cards(student_id, rows)
        return [_to_out(pc, sv["card_id"]) for pc, sv in zip(pool_cards, saved)]

    # A topic-level deck (no difficulty) → mix every tier of that topic, no-repeat.
    if topic and not difficulty:
        pool = get_topic_cards(role, topic)
        if not pool:
            return []
        served = await get_served_static_fronts(student_id)
        served_idx = {i for i, c in enumerate(pool) if c["stem"] in served}
        picks = pick_next_unseen(student_id, len(pool), f"flash_topic_{topic}",
                                 served_idx, n=min(n, len(pool)))
        out = await _persist([pool[i] for i in picks])
        return mark_typed_cards(out, n)

    # A specific (topic, difficulty) set → serve that set with no-repeat rotation.
    if topic and difficulty:
        pool = get_set_cards(role, topic, difficulty)
        if not pool:
            return []
        served = await get_served_static_fronts(student_id)
        served_idx = {i for i, c in enumerate(pool) if c["stem"] in served}
        picks = pick_next_unseen(student_id, len(pool), f"flash_{topic}_{difficulty}",
                                 served_idx, n=min(n, len(pool)))
        out = await _persist([pool[i] for i in picks])
        return mark_typed_cards(out, n)

    # Mixed / review → SM-2 due first (rehydrated from pool by stem), then top up.
    out: list[dict] = []
    try:
        due = await get_due_cards(student_id, limit=n)
    except Exception:
        due = []
    index = card_by_stem(role)
    for d in due:
        # Only static-pool cards can be rehydrated to MCQ; orphaned due rows
        # (edited/legacy stems) are intentionally skipped and topped up below.
        pc = index.get(d.get("front", ""))
        if pc:
            merged = {**pc, "repetitions": d.get("repetitions", 0),
                      "easiness": d.get("easiness", 2.5),
                      "interval_days": d.get("interval_days", 0)}
            out.append(_to_out(merged, d["card_id"]))
    if len(out) < n:
        pool = get_all_cards(role)
        if pool:
            served = await get_served_static_fronts(student_id)
            served_idx = {i for i, c in enumerate(pool) if c["stem"] in served}
            picks = pick_next_unseen(student_id, len(pool), "flashcards",
                                     served_idx, n=(n - len(out)))
            out += await _persist([pool[i] for i in picks])
    return mark_typed_cards(out, n)


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


# ── Batched deck completion (SM-2 + XP) ──────────────────────────────────────

class CompleteCardResult(BaseModel):
    card_id: str | None = None
    correct: bool
    repetitions: int = 0
    easiness: float = 2.5
    interval_days: int = 0
    topic_tag: str | None = None        # deck topic — feeds attempts + retention
    score: int = 0                      # per-card points (analytics only)

class FlashcardCompleteRequest(BaseModel):
    results: list[CompleteCardResult] = []
    xp_delta: int = 0

class FlashcardCompleteResponse(BaseModel):
    xp: int
    level: int


@router.post("/api/flashcards/complete", response_model=FlashcardCompleteResponse)
@limiter.limit("30/minute")
async def flashcards_complete(
    request: Request,
    body: FlashcardCompleteRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    student_id = current_user["sub"]
    # Clamp client-supplied XP per request — a single deck can't legitimately earn
    # this much (a perfect ~20-card hard deck tops out well under 500), so a bound stops a
    # tampered payload inflating the balance. This is a per-REQUEST anti-abuse ceiling,
    # never a daily cap (there is no daily cap).
    xp_delta = max(0, min(body.xp_delta, 1000))
    # Deterministic SM-2 quality: correct -> 5, missed -> 2 (<3 triggers relearn).
    # Schedule all cards concurrently — a deck can be 20 cards, and sequential awaits
    # would hold the (single) worker for 20 Supabase round-trips at deck end.
    async def _schedule(res: CompleteCardResult) -> None:
        quality = 5 if res.correct else 2
        new_interval, new_ease, new_reps = next_review(
            quality, res.repetitions, res.easiness, res.interval_days)
        await update_card_sm2(res.card_id, new_interval, new_ease,
                              new_reps, due_date(new_interval))

    sm2_tasks = [_schedule(r) for r in body.results if r.card_id]
    if sm2_tasks:
        # return_exceptions: scheduling is non-critical; one failure never fails the response.
        await asyncio.gather(*sm2_tasks, return_exceptions=True)
    # ── Persist per-card attempts (best-effort) so Analytics can compute true per-topic
    #    accuracy — the platform's highest-volume learning signal, discarded before this
    #    change. A missing table (pre-migration 010) is swallowed per task, so the study
    #    loop is never blocked.
    attempt_tasks = [
        db.insert_flashcard_attempt(
            student_id=student_id, card_id=r.card_id, topic_tag=r.topic_tag,
            correct=bool(r.correct), score=int(r.score),
        )
        for r in body.results if r.topic_tag
    ]
    if attempt_tasks:
        await asyncio.gather(*attempt_tasks, return_exceptions=True)

    # ── Feed per-topic flashcard accuracy into retention_scores (the mastery signal).
    #    A study deck is normally one topic, so this is a single write; the XP delta rides
    #    the first retention write to avoid an extra update_profile call (and an extra
    #    session-count increment). No topic present → keep the legacy XP-only update.
    by_topic: dict[str, list[bool]] = {}
    for r in body.results:
        if r.topic_tag:
            by_topic.setdefault(r.topic_tag, []).append(bool(r.correct))
    if by_topic:
        for i, (topic, hits) in enumerate(by_topic.items()):
            accuracy = sum(hits) / len(hits)
            try:
                await update_profile(
                    student_id, topic=topic, score=accuracy,
                    xp_delta=xp_delta if i == 0 else 0,
                )
            except Exception:
                pass
    elif xp_delta:
        try:
            await update_profile(student_id, xp_delta=xp_delta)
        except Exception:
            pass
    try:
        profile = await get_profile(student_id)
        xp = int(profile.get("xp") or 0)
    except Exception:
        xp = 0
    return FlashcardCompleteResponse(xp=xp, level=(xp // 500) + 1)


@router.post("/api/flashcards/forfeit", response_model=FlashcardCompleteResponse)
@limiter.limit("30/minute")
async def flashcards_forfeit(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    """Quit-mid-deck penalty. The server owns the flat Lumens deduction (the client is
    never trusted for the amount). update_profile floors the balance at 0 and leaves the
    lifetime coins_earned counter untouched, so an earned badge is never lost."""
    student_id = current_user["sub"]
    try:
        await update_profile(student_id, xp_delta=-FORFEIT_PENALTY)
    except Exception:
        pass
    try:
        profile = await get_profile(student_id)
        xp = int(profile.get("xp") or 0)
    except Exception:
        xp = 0
    return FlashcardCompleteResponse(xp=xp, level=(xp // 500) + 1)


# ── Cohort leaderboard (D7: everyone by default, opt-out, XP-ranked) ──────────
# Ranking is the pure `rank_entries` core; this layer only wires DB reads to it and
# reports the viewer's own visibility state back for the hide toggle / display-name form.

class LbEntry(BaseModel):
    rank: int
    name: str
    role: str
    xp: int          # XP earned THIS week — the weekly-board score + ranking key
    xp_total: int    # lifetime XP — drives the tier ring on the frontend
    level: int
    streak_days: int
    avatar_config: dict | None = None
    is_you: bool


class LbResponse(BaseModel):
    entries: list[LbEntry]
    you_hidden: bool
    display_name: str | None = None
    roles: list[str]


class LbPrefs(BaseModel):
    hidden: bool | None = None
    display_name: str | None = None


@router.get("/api/leaderboard", response_model=LbResponse)
async def leaderboard(role: str | None = None, current_user: CurrentUser = Depends(get_current_user)):
    """The cohort leaderboard (D7): everyone is ranked by XP unless they've hidden
    themselves. An optional `role` filter ranks within a single role. The viewer's own
    row is flagged; their current hidden state + display name come back for the form.
    Degrades to an empty board (never 500) until migration 008 lands."""
    student_id = current_user["sub"]
    try:
        # get_active_leaderboard_profiles = active students (access revoked → dropped
        # immediately, same filter the admin roster uses) PLUS staff (trainers/admins,
        # matched via supervisors). consent is still needed for the display-name map.
        profiles = await db.get_active_leaderboard_profiles()
        consent = await db.get_all_consent()
    except Exception:
        return LbResponse(entries=[], you_hidden=False, display_name=None, roles=[])

    names = {r["student_id"]: (r.get("student_name") or "") for r in consent}
    from tools.shared.clock import app_today, app_week_start
    # Rank by XP earned this week once the xp_week columns exist; until migration 012
    # lands (no such key on any row) fall back to lifetime ranking so the board never
    # shows an all-zero week. Auto-cuts over to weekly the moment the columns are added.
    weekly_ready = any("xp_week_start" in p for p in profiles)
    week_start = app_week_start() if weekly_ready else None
    entries = rank_entries(profiles, names, viewer_id=student_id, role=role or None,
                           today=app_today(), week_start=week_start)
    me = next((p for p in profiles if p.get("student_id") == student_id), {})
    roles = sorted({(p.get("role") or "").strip() for p in profiles if (p.get("role") or "").strip()})
    return LbResponse(
        entries=[LbEntry(**e) for e in entries],
        you_hidden=bool(me.get("leaderboard_hidden")),
        display_name=(me.get("display_name") or None),
        roles=roles,
    )


@router.post("/api/leaderboard/prefs")
async def leaderboard_prefs(body: LbPrefs, current_user: CurrentUser = Depends(get_current_user)):
    """Update the caller's leaderboard preferences: hide/show themselves (D7 opt-out)
    and/or set an optional display name (blank clears it). Identity comes from the JWT,
    never the body. 503 until migration 008 adds the columns."""
    student_id = current_user["sub"]
    fields: dict = {}
    if body.hidden is not None:
        fields["leaderboard_hidden"] = bool(body.hidden)
    if body.display_name is not None:
        dn = body.display_name.strip()[:40]
        fields["display_name"] = dn or None
    if not fields:
        return {"ok": True}
    try:
        await db.update_profile(student_id, **fields)
    except Exception:
        raise HTTPException(status_code=503, detail="Leaderboard settings aren't available yet.")
    return {"ok": True, **fields}


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
        suggestion = await asyncio.to_thread(
            ask,
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
