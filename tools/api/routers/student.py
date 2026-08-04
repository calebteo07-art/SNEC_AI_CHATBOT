"""Student profile and learning endpoints."""
import asyncio
import json
import random
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from tools.api.shared import limiter, _case_cache, FORFEIT_PENALTY
from tools.flashcards.flashcard_store import (
    get_due_cards, get_served_static_card_ids,
    get_served_static_fronts, insert_cards, update_card_sm2,
)
from tools.flashcards.sm2 import next_review, due_date
from tools.flashcards.static_cards import (
    get_set_cards, get_all_cards, set_card_counts, mark_typed_cards, card_by_stem,
    topic_card_counts, shuffle_card_options,
)
from tools.flashcards.flashcard_sets import sets_for, split_set_key, topic_sets_for
from tools.flashcards.card_levels import DECK_COUNT, DECK_SIZE, get_deck_cards
from tools.gamification.leaderboard import rank_entries, would_be_rank_for
from tools.gamification.league import (
    DIVISION_MULTIPLIERS, TOP_DIVISION, division_multiplier, division_name, promote_count,
)
from tools.gamification.league_rollover import run_rollover
from tools.profile.get_profile import get_profile
from tools.profile.update_profile import update_profile
from tools.shared.gemini_client import ask, MOCK_MODE, MODEL, MODEL_SMALL
from tools.shared.jwt_utils import get_current_user, require_staff, CurrentUser
from tools.shared.static_pools import pick_next_unseen
from tools.shared import db
from tools.supervisor.topic_crosswalk import is_known_tag

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
    # Which rung of the topic ladder this card was served from (0 = not a ladder
    # deck). The client echoes it back on /complete, so the SERVER decides which
    # deck was played and a stale client can't mis-record progress.
    deck_level: int = 0

class StudySuggestionResponse(BaseModel):
    suggestion: str
    focus_topic: str | None = None


# ── Gamification sync ─────────────────────────────────────────────────────

class GamificationSyncRequest(BaseModel):
    xp_delta: int = 0
    hearts_used: int = 0
    # `topic`/`score` land in student_profiles.retention_scores, which every staff-facing
    # reader treats as a 0-1 fraction under a real topic key. Unlike xp_delta below — a
    # legitimate client value that just needs a ceiling — no production caller sends
    # either field (the live sender is the tutor chat, posting xp_delta/hearts_used
    # alone), so anything outside those bounds is a tampered payload and is REJECTED
    # rather than quietly rounded into range. update_profile still clamps the score, for
    # the two callers that legitimately carry one.
    topic: str | None = None
    score: float | None = Field(default=None, ge=0, le=1)

    @field_validator("topic")
    @classmethod
    def _known_topic(cls, value: str | None) -> str | None:
        # An unrecognised key is PERMANENT: it becomes a retention_scores entry, and
        # under WEAK_THRESHOLD a weak_topics entry rendered to a trainer. Constrain the
        # client to the flashcard namespace — the only closed one of the two this column
        # mixes (the other, raw case topics, is written server-side by cases.py).
        if value is not None and not is_known_tag(value):
            raise ValueError("unknown topic")
        return value

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

async def _completed_levels(student_id: str, topic_key: str) -> set[int]:
    """Deck levels the student has cleared for one topic. A missing table
    (pre-migration 015) reads as no progress: deck 1 and full earning, never a
    lockout."""
    try:
        return (await db.get_completed_deck_levels(student_id)).get(topic_key, set())
    except Exception:
        return set()


class FlashcardSetInfo(BaseModel):
    set_key: str
    topic_key: str
    label: str
    difficulty: str
    total: int
    decks_completed: int                # rungs cleared on this topic's ladder
    deck_count: int = DECK_COUNT

class FlashcardTopicsResponse(BaseModel):
    sets: list[FlashcardSetInfo]


@router.get("/api/flashcards/topics", response_model=FlashcardTopicsResponse)
async def flashcards_topics(current_user: CurrentUser = Depends(get_current_user)):
    """One selectable topic per entry for the caller's role, with how many cards the
    topic holds and how many of its DECK_COUNT curated decks the student has cleared —
    the "3/5" the picker shows."""
    student_id = current_user["sub"]
    role = ""
    try:
        role = (await get_profile(student_id)).get("role", "")
    except Exception:
        pass

    counts = topic_card_counts(role)
    cleared: dict[str, set[int]] = {}
    try:
        cleared = await db.get_completed_deck_levels(student_id)
    except Exception:
        pass

    sets: list[FlashcardSetInfo] = []
    for s in topic_sets_for(role):
        total = counts.get(s["topic_key"], 0)
        if total == 0:
            continue  # topic not yet authored — don't show an empty deck
        sets.append(FlashcardSetInfo(
            set_key=s["set_key"], topic_key=s["topic_key"], label=s["label"],
            difficulty="mixed", total=total,
            decks_completed=len(cleared.get(s["topic_key"], set())),
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
    level: int | None = None,
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

    # A topic deck → the difficulty ladder: DECK_COUNT rungs of DECK_SIZE cards, deck 1
    # easiest. Which cards make up a rung is fixed by the level (no per-user rotation —
    # the curated ramp is the point), so only their order within the deck varies.
    # An explicit level is the replay picker a student gets once the topic is cleared;
    # without one they get the next rung, capped at the top.
    if topic and not difficulty:
        cleared = await _completed_levels(student_id, topic)
        lvl = (min(max(level, 1), DECK_COUNT) if level
               else min(len(cleared) + 1, DECK_COUNT))
        pool = list(get_deck_cards(role, topic, lvl))
        if not pool:
            return []
        rng.shuffle(pool)
        # Replay is a designed flow here, so a card keeps ONE flashcards row for life:
        # re-inserting on every replay would fork its SM-2 schedule and let the review
        # deck serve the same stem twice. Only genuinely new cards are inserted.
        known = await get_served_static_card_ids(student_id)
        fresh = [c for c in pool if c["stem"] not in known]
        if fresh:
            rows = [{"front": c["stem"], "back": c["explanation"],
                     "topic_tag": c.get("topic_tag", "general"), "source": "static"}
                    for c in fresh]
            saved = await insert_cards(student_id, rows)
            known.update({c["stem"]: sv["card_id"] for c, sv in zip(fresh, saved)})
        out = [{**_to_out(c, known[c["stem"]]), "deck_level": lvl} for c in pool]
        return mark_typed_cards(out, len(out))

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
    topic_key: str | None = None        # ladder topic (absent for the Mixed deck)
    level: int | None = None            # which rung, 1..DECK_COUNT

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
    # ── The ladder's Lumens cap. A topic pays out for its DECK_COUNT curated decks and
    #    no more; past that it stays fully playable as unpaid practice. Evaluated on the
    #    state BEFORE this submission, so clearing the final deck is itself paid and only
    #    the replay after it is free. Server-owned: the client sends an amount but never
    #    decides whether it counts. The Mixed deck sends no topic_key and is never capped.
    if body.topic_key and len(await _completed_levels(student_id, body.topic_key)) >= DECK_COUNT:
        xp_delta = 0
    if body.topic_key and body.level:
        try:
            await db.mark_deck_complete(student_id, body.topic_key, body.level)
        except Exception:
            pass  # pre-migration 015 — the deck still grades, progress just doesn't stick
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
    # Same clamp idiom as xp_delta above, applied per-card: a single card can't
    # legitimately score this much (hard difficulty x the max combo multiplier tops out
    # at 24 -- CARD_BASE/comboMultiplier in frontend/.../flashcards/types.ts), so a bound
    # stops a tampered per-card score from polluting flashcard_attempts, which every P2
    # aggregation sums over. Clamped, not validated with a pydantic Field bound -- a
    # hostile value is pinned instead of 422-ing (and losing) the whole deck submission.
    attempt_tasks = [
        db.insert_flashcard_attempt(
            student_id=student_id, card_id=r.card_id, topic_tag=r.topic_tag,
            correct=bool(r.correct), score=max(0, min(int(r.score), 100)),
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
                    # Same i == 0 guard as the XP award, and for the same reason: one
                    # completed deck is ONE completion. Tagging every topic in the deck
                    # would let a three-topic deck clear a three-deck quest.
                    source="flashcards" if i == 0 else None,
                )
            except Exception:
                pass
    elif xp_delta:
        # No source tag here: this fallback only fires when body.results is empty (the
        # real frontend's CompleteCardResult.topic_tag is a required field, so any actual
        # deck submission lands in the by_topic branch above). Tagging it would also
        # collide with test_complete_without_topic_tag_writes_no_attempts's exact-dict
        # assertion on the update_profile kwargs.
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
    division: int = 1
    rank_delta: int | None = None   # places gained since the last daily snapshot
    # NOTE: `student_id` is deliberately absent. rank_entries attaches it as a server-side
    # join key; declaring it here would hand every viewer the id of every other student.


class LbResponse(BaseModel):
    entries: list[LbEntry]
    you_hidden: bool
    display_name: str | None = None
    # Where a hidden viewer would stand if they un-hid. Only ever set for the hidden
    # viewer themselves — a visible student has a real rank on `entries`, and a second
    # number would be a conflicting source of truth.
    you_would_be_rank: int | None = None
    roles: list[str]
    division: int = 1
    division_name: str = "Bronze"
    # What the division PAYS. Sent rather than mirrored in TypeScript: the economy has one
    # source of truth (tools/gamification/league.py), and a copy in the client is a copy
    # that drifts the first time the ladder is retuned — silently, since a wrong number
    # here still renders perfectly.
    division_multiplier: float = 1.0
    # The whole ladder, for the trophy road in the rules sheet. Redundant with the scalar
    # above by construction — both are read from DIVISION_MULTIPLIERS in the same request,
    # so they cannot disagree — and the alternative was hard-coding five numbers in the
    # client copy that explains the economy.
    division_multipliers: list[float] = Field(default_factory=list)
    pool_size: int = 0        # the real pool, unaffected by the role view filter
    promote_count: int = 0


class LbPrefs(BaseModel):
    hidden: bool | None = None
    display_name: str | None = None


@router.get("/api/leaderboard", response_model=LbResponse)
async def leaderboard(background: BackgroundTasks, role: str | None = None,
                      current_user: CurrentUser = Depends(get_current_user)):
    """The weekly league board: the viewer's own division, ranked by XP earned this week,
    with the promotion line (`pool_size` / `promote_count`) it is racing for. An optional
    `role` filter narrows the *view* only. The viewer's own row is flagged; their current
    hidden state + display name come back for the form.

    Two once-per-period jobs ride on this traffic because the app has no cron: closing last
    week (promotions) and stamping today's ranks for tomorrow's movement arrows. Both are
    seal-guarded in the DB and both run as BackgroundTasks — no student waits on them.

    Degrades to an empty board (never 500) until migration 008 lands, and to a single
    undivided ladder with no league jobs until 016 lands."""
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
    today, monday = app_today(), app_week_start()
    # Rank by XP earned this week once the xp_week columns exist; until migration 012
    # lands (no such key on any row) fall back to lifetime ranking so the board never
    # shows an all-zero week. Auto-cuts over to weekly the moment the columns are added.
    weekly_ready = any("xp_week_start" in p for p in profiles)
    week_start = monday if weekly_ready else None
    # Same shape for the league: until migration 016 adds `division`/`rank_prev`, no row
    # carries the column, so the board stays one undivided ladder with no arrows and the
    # two league jobs stay dark — they would write columns and tables that don't exist.
    league_ready = any("division" in p for p in profiles)

    me = next((p for p in profiles if p.get("student_id") == student_id), {})
    my_division = int(me.get("division") or 1) if league_ready else None
    entries = rank_entries(profiles, names, viewer_id=student_id, role=role or None,
                           today=today, week_start=week_start, division=my_division)

    # The pool is derived from the profiles, NOT from `entries`: the `role` filter is a
    # view, and letting it shrink the pool would quietly move the promotion line — a
    # filtered board would promise promotions the real division never awards.
    pool = [p for p in profiles
            if not p.get("leaderboard_hidden")                       # holds no slot
            and (my_division is None or int(p.get("division") or 1) == my_division)]
    roles = sorted({(p.get("role") or "").strip() for p in profiles if (p.get("role") or "").strip()})

    if league_ready:
        # Close last week (idempotent, seal-guarded inside) — never the live week.
        background.add_task(run_rollover, profiles, monday - timedelta(days=7))
        # And stamp today's ranks exactly once per day: without the seal every read would
        # restamp rank_prev with the live rank and every arrow would read 0 forever.
        if await db.take_seal(f"day:{today.isoformat()}"):
            snapshot: dict[str, int] = {}
            for d in sorted({int(p.get("division") or 1) for p in profiles}):
                for e in rank_entries(profiles, names, viewer_id=student_id,
                                      today=today, week_start=week_start, division=d):
                    snapshot[e["student_id"]] = e["rank"]   # join by id: names collide
            background.add_task(db.set_rank_prev_bulk, snapshot, today.isoformat())

    # A hidden viewer is off the ladder for everyone including themselves, so tell them
    # where they *would* stand — otherwise opting out means losing sight of your own
    # progress, and the toggle becomes a trap. Suppressed when a role filter excludes
    # them, because they would not appear on that board even un-hidden.
    you_would_be_rank = None
    if me.get("leaderboard_hidden") and (not role or (me.get("role") or "") == role):
        you_would_be_rank = would_be_rank_for(entries, me, names, week_start)

    return LbResponse(
        entries=[LbEntry(**{k: v for k, v in e.items() if k != "student_id"}) for e in entries],
        you_hidden=bool(me.get("leaderboard_hidden")),
        display_name=(me.get("display_name") or None),
        you_would_be_rank=you_would_be_rank,
        roles=roles,
        division=my_division or 1,
        division_name=division_name(my_division or 1),
        division_multiplier=division_multiplier(my_division or 1),
        division_multipliers=list(DIVISION_MULTIPLIERS),
        pool_size=len(pool),
        # ⚠ ZERO AT THE SUMMIT. close_week has always refused to promote anyone out of
        # Diamond, but the live payload did not agree with it: it sent the pool's raw count,
        # so a Diamond board drew a promotion cut and gold podium lips for a promotion that
        # cannot happen. The client had no way to tell — promotionLineIndex documents "the
        # top division promotes nobody" as a null case and gets there only via a 0 it was
        # never sent. Found 2026-08-04 while giving the stage a banner that says the count
        # out loud, which is what turned a quiet wrong marking into a written lie.
        promote_count=0 if (my_division or 1) >= TOP_DIVISION else promote_count(len(pool)),
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


# ── The Monday result (promoted / held), shown exactly once ───────────────────

class LeagueSeen(BaseModel):
    week_start: str


@router.get("/api/league/result")
# Plain limit(), not shared_limit: neither route carries a {path_param}, and slowapi's
# default key_style="url" buckets on the ASGI path, so there is nothing that could mint a
# fresh bucket per value. shared_limit(scope=...) is only needed where a templated path
# would (see admin_unapprove_student). `request` is slowapi's required seam.
@limiter.limit("60/minute")
async def league_result(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    """The viewer's outcome for the most recently closed week — or nothing, once seen.

    The seen-flag lives on the profile rather than in localStorage, so the ceremony fires
    exactly once per student across every device they log in from. It stores WHICH week was
    seen, not a boolean, so next Monday's result still comes through.

    Every failure is a null result, never a 500: pre-016 the table doesn't exist at all, and
    a homepage must not break because a celebration is unavailable."""
    from tools.shared.clock import app_week_start

    student_id = current_user["sub"]
    last_week = (app_week_start() - timedelta(days=7)).isoformat()
    try:
        row = await db.get_league_week(student_id, last_week)
        profile = await db.get_profile(student_id) or {}
    except Exception:
        return {"result": None}
    if not row or str(profile.get("league_result_seen_week") or "") == last_week:
        return {"result": None}

    from_div = int(row.get("division") or 1)
    # Only a promotion moves them: naming a division a held student didn't earn would be a
    # lie the very next board read contradicts.
    to_div = from_div + 1 if row.get("outcome") == "promoted" else from_div
    return {
        "week_start": last_week,
        "outcome": row.get("outcome"),
        "rank_final": row.get("rank_final"),
        "xp_final": row.get("xp_final"),
        "from_division_name": division_name(from_div),
        "to_division_name": division_name(to_div),
    }


@router.post("/api/league/result/seen")
@limiter.limit("60/minute")
async def league_result_seen(request: Request, body: LeagueSeen,
                             current_user: CurrentUser = Depends(get_current_user)):
    """Mark a week's result as seen. Identity is the JWT sub, never the body — trusting the
    body would let one student burn another's ceremony, or replay their own forever."""
    try:
        await db.update_profile(current_user["sub"], league_result_seen_week=body.week_start)
    except Exception:
        return {"ok": False}
    return {"ok": True}


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
