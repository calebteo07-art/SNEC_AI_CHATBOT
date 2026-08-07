"""Case simulation endpoints."""
import asyncio
import json
import logging
import os

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from tools.ai.guardrails.input_filter import filter_input
from tools.api.shared import limiter, _case_cache, PATIENT_SYSTEM, FORFEIT_PENALTY, _client_ip
from tools.cases.evaluate_response import GraderUnavailable, evaluate_case, procedure_block
from tools.cases.get_case_progress import get_case_progress
from tools.cases.load_case import load_case, list_available_cases
from tools.cases.log_case_completion import log_case_completion
from tools.chatbot.log_session import log_session
from tools.profile.get_profile import get_profile
from tools.shared import db
from tools.shared.audit_log import log as audit_log
from tools.shared.gemini_client import ask, stream_ask, MOCK_MODE, MODEL
from tools.shared.jwt_utils import get_current_user, CurrentUser
from tools.cases.topic_sets import resolve_set, sets_for, label_for, case_visible
from tools.cases.tier_gate import build_census, evaluate
from tools.cases.resolve_checklist import (
    resolve_procedure_name, build_rubric_checklist, is_tally_sheet,
)
from tools.cases.phase_split import group_by_phase
from tools.cases.examination_actions import build_actions, examiner_excluded_steps, has_manual_actions
from tools.cases.station_score import compute_station_score
from tools.cases.coaching_truth import strip_false_completion, missed_insight
from tools.cases.observe_steps import observe
from tools.cases.action_model_answer import grade_action
from tools.kb.search import get_checklist_by_name

logger = logging.getLogger("eyebot.cases")

# Bound the best-effort coaching call so a slow/hung Gemini response can't keep the
# student waiting after the station is already graded — the deterministic fallback
# (_fallback_coaching) fills in on timeout.
_COACH_TIMEOUT_S = float(os.getenv("OSCE_COACH_TIMEOUT_S", "30"))
# The GRADE call is bounded too. It used to be deliberately unbounded on the belief that
# it "carries its own fallback" — it does not: the fallback only covered an unparseable
# reply, and a raise went straight out as a 500. It now raises GraderUnavailable (→503),
# so it needs the same protection every other AI call in this router already has. Set
# above GEMINI_TIMEOUT_MS (60s) so the transport timeout normally wins and this is only
# the backstop. asyncio.to_thread is not cancellable, so the thread runs on until the
# transport gives up — but the student's request is freed either way.
_GRADE_TIMEOUT_S = float(os.getenv("OSCE_GRADE_TIMEOUT_S", "90"))

# The action panel grades the typed technique against the case's crafted model answer
# in REAL TIME and deterministically (grade_action) — never a hardcoded "good job"
# (ricoe C6). This prompt only polishes the wording of ONE tip and is grounded in the
# concrete missing points, so the model cannot fall back to empty praise. Graceful:
# any failure keeps the deterministic coaching line.
ACTION_COACH = (
    "You are EyeBot, an OSCE examiner for allied-health ophthalmic students. You are given a "
    "procedure, the student's described technique, the model-answer points, and which of those "
    "points they still MISSED. In ONE short sentence, give the single most useful, concrete "
    "technique tip drawn from a missed point (or affirm a specific strength if nothing was "
    "missed). Be specific — name the actual step. Never give empty praise like 'good job', never "
    "invent a different result, never add a medical diagnosis."
)

_COACHING_SCHEMA = {
    "type": "object",
    "properties": {
        "highlights": {"type": "array", "items": {"type": "string"}},
        "did_wrong": {"type": "array", "items": {"type": "string"}},
        "missed": {"type": "array", "items": {"type": "string"}},
        "focus": {"type": "string"},
    },
    "required": ["highlights", "did_wrong", "missed", "focus"],
}

router = APIRouter()

# OSCE is the app's premium earner (a long, AI-graded clinical encounter), so its reward
# is scaled by difficulty tier AND by the grade. A pass (>=60) pays the tier base scaled by
# the score; a sub-pass attempt pays only a flat consolation (an honest attempt earns a
# little, but failing doesn't pay like passing). What is actually granted is capped twice in
# case_submit: a case the student has already PASSED pays nothing at all, and below that a
# per-case high-water mark pays only the improvement over their best prior attempt. So a
# completed case is practice from then on, and repeated failures pay the consolation once.
OSCE_PASS_MARK = 60
OSCE_FAIL_CONSOLATION = 20
OSCE_TIER_BASE = {"beginner": 150, "intermediate": 220, "advanced": 300}


def osce_reward(score_100: int, difficulty: str = "beginner") -> int:
    """Gross Lumens an OSCE attempt at this grade + difficulty is worth (before the
    per-case high-water mark). Unknown/blank difficulty falls back to the beginner base."""
    s = max(0, min(100, int(score_100)))
    base = OSCE_TIER_BASE.get(str(difficulty or "beginner").lower(), OSCE_TIER_BASE["beginner"])
    if s >= OSCE_PASS_MARK:
        return round(base * s / 100)
    return OSCE_FAIL_CONSOLATION if s > 0 else 0


def _row_score_100(row: dict) -> int:
    """Best-effort score_100 for a stored case row. Uses the rich column when present
    (migration 011); otherwise derives it from the always-persisted /40 total_score."""
    val = row.get("score_100")
    if val is not None:
        try:
            return int(val)
        except (TypeError, ValueError):
            return 0
    try:
        return max(0, min(100, round(float(row.get("total_score", 0)) / 0.4)))
    except (TypeError, ValueError):
        return 0


def _row_passed(row: dict) -> bool:
    """Did this stored attempt pass?

    ONE predicate, used by both the /cases card and the Lumens guard, because a card that
    reads "completed" while the wallet still pays for a re-run is exactly the farm this is
    meant to close. The stored flag is authoritative when present; a row written before it
    existed falls back to the derived /100.
    """
    val = row.get("passed")
    if val is not None:
        return bool(val)
    return _row_score_100(row) >= OSCE_PASS_MARK


# ── Case simulation models ─────────────────────────────────────────────────

class CasePatientInfo(BaseModel):
    name: str
    age: int
    presenting_complaint: str
    face: str = ""   # public path to the demographic archetype face (ricoe §8)


def _patient_info(raw: dict) -> CasePatientInfo:
    """Build the API patient block from a raw case `patient` dict, deriving the
    demographic archetype face (deterministic, no I/O)."""
    from tools.patients import archetypes
    try:
        age = int(raw.get("age", 30))
    except (TypeError, ValueError):
        age = 30
    return CasePatientInfo(
        name=raw["name"],
        age=age,
        presenting_complaint=raw.get("presenting_complaint", ""),
        face=archetypes.face_path(archetypes.classify_patient(raw)),
    )

class CaseInfo(BaseModel):
    case_id: str
    title: str
    difficulty: str
    topic: str
    estimated_minutes: int
    patient: CasePatientInfo
    locked: bool = False
    unlock_hint: str = ""   # student-facing "how to unlock" note when locked (per-topic gate)
    set_key: str = ""
    set_label: str = ""
    # This student has PASSED this case before. The list sinks these to the bottom, marks
    # them done and stops paying Lumens for them. Deliberately "passed", not "attempted":
    # a failed attempt is not a finished case, and greying it out (or refusing to pay for
    # the eventual pass) would punish the student who most needs to go back in.
    completed: bool = False

class CasesResponse(BaseModel):
    cases: list[CaseInfo]

class CaseTopicInfo(BaseModel):
    set_key: str
    label: str
    total: int
    completed: int

class CaseTopicsResponse(BaseModel):
    topics: list[CaseTopicInfo]

class ChatMessage(BaseModel):
    role: str
    content: str = Field(max_length=8000)


# A transcript longer than this is TRUNCATED, never rejected.
#
# Both request models used to carry `Field(max_length=100)`, which pydantic enforces
# BEFORE the handler runs — so message 101 was a 422 the student could never get past.
# The client posted the transcript unsliced and the transcript only ever grows, so the
# retry sent the same too-long payload and 422'd identically, forever, on a perfectly
# healthy service: the consult died around the 51st patient question and submit died
# once the combined thread passed 100. An OSCE history is exactly that — a long run of
# short questions — and cases are authored at 10-20 minutes.
#
# Truncation keeps the OPENING and the RECENT: an OSCE is graded on the history-taking
# at the start and the handover at the end, so dropping from the middle is the only
# honest way to shed, and the elision is stated in-band rather than hidden.
_MAX_MESSAGES = 400
_KEEP_HEAD = 80


def _bounded(messages: list[ChatMessage]) -> list[ChatMessage]:
    if len(messages) <= _MAX_MESSAGES:
        return messages
    tail = _MAX_MESSAGES - _KEEP_HEAD - 1
    dropped = len(messages) - _KEEP_HEAD - tail
    marker = ChatMessage(
        role="user",
        content=f"[... {dropped} earlier messages omitted from this transcript ...]",
    )
    return messages[:_KEEP_HEAD] + [marker] + messages[-tail:]


class CaseChatRequest(BaseModel):
    messages: list[ChatMessage]

class CaseChatResponse(BaseModel):
    response: str

class CaseSubmitRequest(BaseModel):
    messages: list[ChatMessage]
    # Allied-health (OA/OT/PSA) handover, not a doctor's diagnosis/treatment:
    # what the student found + what they recommend (triage/escalate/advise).
    findings: str
    recommendation: str
    performed_steps: list[int] = []
    # Steps the student could not complete and skipped to carry on. They pass the station's
    # gate but were NOT done: subtracted from performed_steps below (the client already
    # excludes them; the endpoint doesn't rely on that) and named to the debrief coach.
    skipped_steps: list[int] = []

class ScorePart(BaseModel):
    label: str
    pts: int
    max: int


class SchemeBreakdown(BaseModel):
    parts: list[ScorePart] = []
    total: int = 0
    max: int = 50
    capped: bool = False
    cap_reason: str = ""
    # The bucket's own remark, for a bucket with no examiner paragraph behind it (today:
    # checklist coverage, which is deterministic). Additive with a default, so an older
    # scorer during a deploy window simply sends no note.
    note: str = ""


class ScoreBreakdown(BaseModel):
    checklist: SchemeBreakdown = SchemeBreakdown()
    consult: SchemeBreakdown = SchemeBreakdown()
    judgement: SchemeBreakdown = SchemeBreakdown()


class DomainScore(BaseModel):
    history_score: int
    investigations_score: int
    diagnosis_score: int
    management_score: int
    history_feedback: str
    investigations_feedback: str
    diagnosis_feedback: str
    management_feedback: str
    total_score: int
    critical_hit: int = 0
    critical_total: int = 0
    # Three-bucket /100 (the student-facing model), 40/30/30 — the checklist is the
    # largest single bucket.
    score_100: int = 0
    verdict: str = ""
    checklist_coverage: int = 0       # Checklist coverage (0-40), deterministic
    checklist_coverage_max: int = 40
    consult_technique: int = 0        # Consultation & Technique (0-30)
    consult_technique_max: int = 30
    judgement_safety: int = 0         # Clinical Judgement & Safety (0-30), safety-gated
    judgement_safety_max: int = 30
    safe: bool = True
    missed_critical: list[str] = []
    # Why each bucket scored what it did — sub-scores + the safety cap. Additive with a
    # default, so an older frontend during a deploy window simply ignores it.
    breakdown: ScoreBreakdown = ScoreBreakdown()

class CoachingBlock(BaseModel):
    highlights: list[str] = []   # what the student genuinely did well
    did_wrong: list[str] = []    # done wrongly or only partially
    missed: list[str] = []       # missed out / lacking entirely
    focus: str = ""              # the one thing to fix next time

class ChecklistStepResult(BaseModel):
    step_number: int
    action: str
    critical: bool
    performed: bool
    clinical_note: str | None = None

class PhaseSummary(BaseModel):
    phase: int
    name: str
    done: int
    total: int

class Flashcard(BaseModel):
    card_id: str
    front: str
    back: str
    topic_tag: str

class CaseSubmitResponse(BaseModel):
    result: DomainScore
    cards: list[Flashcard]
    mock_mode: bool
    debrief: str | None = None
    coaching: CoachingBlock = CoachingBlock()
    checklist_comparison: list[ChecklistStepResult] = []
    per_phase: list[PhaseSummary] = []
    lumens_awarded: int = 0

class ChecklistStepModel(BaseModel):
    step_number: int
    action: str
    critical: bool
    category: str = ""
    notes: str | None = None

class ChecklistResponse(BaseModel):
    procedure_name: str
    steps: list[ChecklistStepModel]
    total_steps: int
    critical_count: int


class PhaseGroup(BaseModel):
    phase: int
    name: str
    steps: list[ChecklistStepModel]

class ExaminationAction(BaseModel):
    key: str
    label: str
    reveal_text: str
    satisfies_steps: list[int]
    mode: str = "do"
    prompt_text: str = ""
    phase: int = 2
    critical: bool = False
    step_number: int = 0
    kind: str = "manual"  # "manual" → shortcut chip; "verbal" → stays in the live chat
    quick: bool = False   # manual + no assessable technique → ticks on one click, no typing
    # Dual-source steps: for THESE steps the chip is only the action-panel half and the
    # patient supplies the rest, so the frontend holds the tick until both halves land
    # (see dualStep.ts). Per step, not per chip — a merged chip can hold one of each.
    also_ask_steps: list[int] = []
    dual_kind: str = ""   # "ask" | "identity" — which half the consult still owes

class StationChecklist(BaseModel):
    procedure_name: str
    phases: list[PhaseGroup]
    total_steps: int
    critical_count: int
    source: str

class StationResponse(BaseModel):
    case: CaseInfo
    checklist: StationChecklist
    examination_actions: list[ExaminationAction]

class ObserveRequest(BaseModel):
    messages: list[ChatMessage] = Field(max_length=100)
    already_ticked: list[int] = []
    # Stuck-valve: the student claims they already did this step — re-check it leniently.
    focus_step: int | None = None
    # Dual-source steps whose CHART half is done in the action panel — the examiner can't
    # see that in the transcript, so it judges only whether the patient was also asked.
    record_done: list[int] = []

class ObserveResponse(BaseModel):
    newly_satisfied: list[int]


class ActionRequest(BaseModel):
    action_label: str = Field(max_length=120)
    technique: str = Field(max_length=2000)
    finding: str = Field(default="", max_length=2000)
    satisfies_steps: list[int] = []

class ActionResponse(BaseModel):
    coaching: str = ""
    verdict: str = ""              # strong | partial | developing
    covered: list[str] = []        # model-answer points the technique addressed
    missing: list[str] = []        # model-answer points still to include
    model_answer: str = ""         # the crafted reference, surfaced so they learn


# ── Case endpoints ─────────────────────────────────────────────────────────

@router.get("/api/cases", response_model=CasesResponse)
async def get_cases(topic_set: str | None = None, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]

    # Determine the student's role; cases are filtered to it.
    role = "OA"
    if student_id:
        try:
            profile = await get_profile(student_id)
            role = profile.get("role", "OA") or "OA"
        except Exception:
            pass

    # Load pre-stored case files (content is pre-authored — no AI generation).
    raw_cases = []
    for case_id in list_available_cases():
        try:
            # Serve from the per-worker cache; only touch disk on a miss. Cases are
            # static, so a warm worker builds this list with zero file I/O.
            c = _case_cache.get(case_id)
            if c is None:
                c = load_case(case_id)
                _case_cache[c["case_id"]] = c
            case_role = c.get("role", "any") or "any"
            if not case_visible(role, case_role):
                continue
            raw_cases.append(c)
        except Exception:
            pass

    # Compute difficulty unlock status
    case_progress = {}
    if student_id:
        try:
            case_progress = await get_case_progress(student_id)
        except Exception:
            pass

    # Per-topic difficulty gate (tools/cases/tier_gate.py): a case's Developing/Advanced tier
    # unlocks from progress in its OWN topic-set (or, for a topic with no case of the tier
    # below, from any 3 completions in any topic). "Completed" = an attempt exists.
    tagged = [(c, c.get("topic_set") or resolve_set(role, c.get("topic", ""))) for c in raw_cases]
    census = build_census(
        (sk, c.get("difficulty", "beginner"), c["case_id"] in case_progress) for c, sk in tagged
    )

    cases = []
    for c, sk in tagged:
        diff = c.get("difficulty", "beginner")
        locked, hint = evaluate(diff, sk, census)
        cases.append(CaseInfo(
            case_id=c["case_id"],
            title=c["title"],
            difficulty=diff,
            topic=c["topic"],
            estimated_minutes=c["estimated_minutes"],
            patient=_patient_info(c["patient"]),
            locked=locked,
            unlock_hint=hint,
            set_key=sk,
            set_label=label_for(role, sk),
            completed=_row_passed(case_progress.get(c["case_id"]) or {}),
        ))

    # Topic-set view: the student picked a topic, so return that whole set
    # (keeping difficulty-lock flags) instead of a rotating window.
    if topic_set:
        cases = [c for c in cases if c.set_key == topic_set]
        return CasesResponse(cases=cases)

    # Default view — the Living-Eye diagram is the sole navigator (ricoe C4), so it
    # needs the FULL library: every part of the eye must stay populated, and LOCKED
    # cases are still returned (marked locked) so the student sees them as locked cards
    # rather than an empty region (ricoe C2). Difficulty locks still gate entry — the
    # station/chat/submit endpoints fail closed on a locked case (_check_case_access).
    return CasesResponse(cases=cases)


@router.get("/api/cases/topics", response_model=CaseTopicsResponse)
async def get_case_topics(current_user: CurrentUser = Depends(get_current_user)):
    """List the student's 10 topic-sets with case counts (for the topic picker)."""
    student_id = current_user["sub"]
    role = "OA"
    try:
        role = (await get_profile(student_id)).get("role", "OA") or "OA"
    except Exception:
        pass
    # PASSED, not merely attempted — the same `_row_passed` predicate the cards use. The
    # chip-row's tick and the cards beneath it are the same claim about the same cases, so
    # counting them differently showed a set as fully done over cards that still read as
    # outstanding.
    try:
        completed = {cid for cid, row in (await get_case_progress(student_id)).items()
                     if _row_passed(row)}
    except Exception:
        completed = set()

    total: dict[str, int] = {}
    done: dict[str, int] = {}
    for case_id in list_available_cases():
        try:
            c = _case_cache.get(case_id)
            if c is None:
                c = load_case(case_id)
                _case_cache[c["case_id"]] = c
        except Exception:
            continue
        case_role = c.get("role", "any") or "any"
        if not case_visible(role, case_role):
            continue
        sk = c.get("topic_set") or resolve_set(role, c.get("topic", ""))
        total[sk] = total.get(sk, 0) + 1
        if c["case_id"] in completed:
            done[sk] = done.get(sk, 0) + 1

    topics = [
        CaseTopicInfo(set_key=k, label=lbl, total=total.get(k, 0), completed=done.get(k, 0))
        for k, lbl in sets_for(role)
    ]
    return CaseTopicsResponse(topics=topics)


async def _check_case_access(
    student_id: str, case: dict, role: str = "OA", account_role: str = "student",
) -> None:
    """Raise 404 if this case is outside the student's role pool, 403 if it is theirs but
    not yet unlocked under the per-topic tier gate.

    Fail-closed mirror of `get_cases`' lock flags: Foundational (beginner) and unknown tiers
    are always accessible; Developing/Advanced are gated per topic-set by tier_gate.evaluate
    (see tools/cases/tier_gate.py). The 403 detail is the same actionable hint shown on the
    locked card. `role` is the student's OA/OT/PSA role (from the JWT) — it buckets cases
    into topic-sets exactly like the case list.

    The POOL check has to come first, and before the beginner early-return. `case_visible`
    was already imported here and applied to the list, the topic counts and the census loop
    inside this very function — but never to the target case — so an OA/PSA student who
    navigated to an OT case id got it served, graded, paid and persisted. 15 of the 54 OT
    cases are beginner, so it needed no progress to reach.

    404 rather than 403: a case outside the pool should not be enumerable. The tier gate's
    403 is different in kind — a locked case IS theirs, just not yet.
    """
    # Staff legitimately preview across pools; the /admin dossier is built on it.
    if account_role in ("trainer", "admin"):
        return
    if not case_visible(role, case.get("role", "any") or "any"):
        raise HTTPException(status_code=404, detail="Case not found")

    difficulty = case.get("difficulty", "beginner")
    if difficulty not in ("intermediate", "advanced"):
        return

    try:
        progress = await get_case_progress(student_id)
    except Exception:
        progress = {}

    items = []
    for cid in list_available_cases():
        c = _case_cache.get(cid)
        if c is None:
            try:
                c = load_case(cid)
                _case_cache[c["case_id"]] = c
            except Exception:
                continue
        if not case_visible(role, c.get("role", "any") or "any"):
            continue
        sk = c.get("topic_set") or resolve_set(role, c.get("topic", ""))
        items.append((sk, c.get("difficulty", "beginner"), c["case_id"] in progress))

    census = build_census(items)
    target_set = case.get("topic_set") or resolve_set(role, case.get("topic", ""))
    locked, hint = evaluate(difficulty, target_set, census)
    if locked:
        raise HTTPException(status_code=403, detail=hint)


@router.get("/api/cases/{case_id}", response_model=CaseInfo)
def get_case(case_id: str, current_user: CurrentUser = Depends(get_current_user)):
    """Return a single case stub from the in-memory cache or pre-stored files."""
    case = _case_cache.get(case_id)
    if case is None:
        try:
            case = load_case(case_id)
            _case_cache[case["case_id"]] = case
        except (ValueError, FileNotFoundError):
            raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")
    return CaseInfo(
        case_id=case["case_id"],
        title=case["title"],
        difficulty=case.get("difficulty", "intermediate"),
        topic=case.get("topic", ""),
        estimated_minutes=case.get("estimated_minutes", 15),
        patient=_patient_info(case["patient"]),
    )


@router.get("/api/cases/{case_id}/checklist", response_model=ChecklistResponse)
def get_case_checklist(case_id: str, current_user: CurrentUser = Depends(get_current_user)):
    """Return the procedure checklist for a given case."""
    from tools.kb.search import get_checklist_by_name as _get_cl
    case = _case_cache.get(case_id)
    if case is None:
        try:
            case = load_case(case_id)
        except (ValueError, FileNotFoundError):
            raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")

    procedure_name = case.get("checklist_procedure") or case.get("topic", "")
    cl_data = _get_cl(procedure_name)
    if not cl_data:
        raise HTTPException(status_code=404, detail="No checklist found for this case")

    raw_steps = (cl_data.get("steps") or {})
    steps_list = raw_steps.get("steps", []) if isinstance(raw_steps, dict) else []
    parsed = []
    critical_count = 0
    for s in steps_list:
        parsed.append(ChecklistStepModel(
            step_number=int(s.get("step_number", 0)),
            action=str(s.get("action", "")),
            critical=bool(s.get("critical", False)),
            category=str(s.get("category", "")),
            notes=s.get("notes"),
        ))
        if s.get("critical"):
            critical_count += 1

    return ChecklistResponse(
        procedure_name=cl_data.get("procedure_name", procedure_name),
        steps=parsed,
        total_steps=len(parsed),
        critical_count=critical_count,
    )


def _load_case_or_404(case_id: str) -> dict:
    case = _case_cache.get(case_id)
    if case is None:
        try:
            case = load_case(case_id)
            _case_cache[case["case_id"]] = case
        except (ValueError, FileNotFoundError):
            raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")
    return case


def _per_phase_summary(steps: list[dict], performed: list[int]) -> list[dict]:
    """Return [{phase,name,done,total}] using the same phase grouping as the station."""
    done = set(performed or [])
    out = []
    for g in group_by_phase(steps):
        nums = [int(s.get("step_number", 0)) for s in g["steps"]]
        out.append({
            "phase": g["phase"],
            "name": g["name"],
            "done": sum(1 for n in nums if n in done),
            "total": len(nums),
        })
    return out


def _station_checklist(case: dict) -> dict:
    """Resolve the case's checklist (real or rubric fallback) as a flat dict with steps."""
    name, how = resolve_procedure_name(case)
    # A preceptor LOGBOOK TALLY SHEET is not a procedure — its rows are roster entries
    # ("Record patient's Date, Age, Sex, Race", "Obtain preceptor's Name and Signature"),
    # all flagged critical. Serving one put 40 of 100 marks on steps the student cannot
    # perform in a simulator and produced a debrief blaming them for not collecting a
    # signature. `is_tally_sheet` has always existed; until now nothing on the live path
    # called it. See tests/cases/test_no_tally_sheet_stations.py for the 15-case backlog.
    if name and is_tally_sheet(name):
        print(
            f"[station-tally-sheet] case={case.get('case_id')!r} resolved={name!r} how={how} "
            f"— logbook tally sheet, not a procedure; serving the case's rubric instead",
            flush=True,
        )
        return build_rubric_checklist(case)
    if name:
        cl = get_checklist_by_name(name)
        if cl:
            raw = cl.get("steps") or {}
            steps = raw.get("steps", []) if isinstance(raw, dict) else []
            return {
                "procedure_name": cl.get("procedure_name", name),
                "steps": steps,
                "source": "checklist",
            }
    # Reaching here is a DEGRADED station, never the intent: rubric.key_points are
    # marking descriptors ("Asks about fasting status"), not steps to perform, so the
    # action panel comes out near-empty. Three different faults land here — no rule
    # matched, the name isn't in Supabase (typo'd, or authored but never seeded), or
    # get_checklist_by_name swallowed an exception into None — and none of them raise.
    # Without this line they are indistinguishable from a healthy station.
    print(
        f"[station-rubric-fallback] case={case.get('case_id')!r} "
        f"resolved={name!r} how={how} — no database checklist; serving the case's rubric",
        flush=True,
    )
    return build_rubric_checklist(case)


def _identity_record(case: dict) -> str:
    """The chart identifiers the Identify-patient chip reveals, from authored case data.

    Fail-closed like the allergy record: with no authored name there is nothing truthful to
    show, so the chip reveals nothing rather than inventing an identity. Age, not a DOB —
    the cases author an age, and a derived date of birth would be a fact the case never made.
    """
    patient = (case.get("patient") or {})
    name = str(patient.get("name") or "").strip()
    if not name:
        return ""
    age = str(patient.get("age") or "").strip()
    return f"EMR — {name}" + (f", {age} yr" if age else "")


def _case_actions(case: dict, steps: list[dict]) -> list[dict]:
    """build_actions for one case — ONE place, so /station and /observe can't classify the
    same case differently (the examiner's exclusion set is derived from this)."""
    return build_actions(
        case.get("examination_findings", {}), steps,
        allergy_record=str((case.get("history") or {}).get("allergies") or ""),
        identity_record=_identity_record(case),
    )


@router.get("/api/cases/{case_id}/station", response_model=StationResponse)
async def get_case_station(case_id: str, current_user: CurrentUser = Depends(get_current_user)):
    """Everything the OSCE station UI needs: case, phased checklist, exam actions."""
    case = _load_case_or_404(case_id)
    # Fail closed on a locked difficulty tier, matching chat/submit — the station serves
    # the full checklist + examination reveal_text, so it must honour the progression gate.
    await _check_case_access(current_user["sub"], case, current_user["student_role"] or "OA", current_user["role"])
    # async handler now, so keep the sync Supabase checklist fetch off the event loop.
    cl = await asyncio.to_thread(_station_checklist, case)
    steps = cl["steps"]

    parsed_steps = [
        ChecklistStepModel(
            step_number=int(s.get("step_number", 0)),
            action=str(s.get("action", "")),
            critical=bool(s.get("critical", False)),
            category=str(s.get("category", "")),
            notes=s.get("notes"),
        )
        for s in steps
    ]
    by_step = {p.step_number: p for p in parsed_steps}
    groups = [
        PhaseGroup(
            phase=g["phase"],
            name=g["name"],
            steps=[by_step[int(s.get("step_number", 0))] for s in g["steps"]
                   if int(s.get("step_number", 0)) in by_step],
        )
        for g in group_by_phase(steps)
    ]
    critical_count = sum(1 for p in parsed_steps if p.critical)
    actions = [ExaminationAction(**a) for a in _case_actions(case, steps)]

    return StationResponse(
        case=CaseInfo(
            case_id=case["case_id"],
            title=case["title"],
            difficulty=case.get("difficulty", "beginner"),
            topic=case.get("topic", ""),
            estimated_minutes=case.get("estimated_minutes", 15),
            patient=_patient_info(case["patient"]),
        ),
        checklist=StationChecklist(
            procedure_name=cl["procedure_name"],
            phases=groups,
            total_steps=len(parsed_steps),
            critical_count=critical_count,
            source=cl["source"],
        ),
        examination_actions=actions,
    )


@router.post("/api/cases/{case_id}/observe", response_model=ObserveResponse)
@limiter.limit("40/minute")
async def observe_case(case_id: str, request: Request, body: ObserveRequest,
                       current_user: CurrentUser = Depends(get_current_user)):
    """Live examiner: return checklist steps the transcript now satisfies."""
    case = _load_case_or_404(case_id)
    await _check_case_access(current_user["sub"], case, current_user["student_role"] or "OA", current_user["role"])  # fail closed on a locked case
    # _station_checklist hits the sync Supabase client; keep it off the event loop.
    cl = await asyncio.to_thread(_station_checklist, case)
    messages = [{"role": m.role, "content": m.content} for m in _bounded(body.messages)]
    # Hands-on procedures tick ONLY via the action panel — the conversational examiner must
    # never auto-tick them, so exclude every manual step number from what it may satisfy.
    # A DUAL-SOURCE step is the exception: its second half is the consult (see
    # examiner_excluded_steps), and body.record_done says its chart half is already done.
    excluded = examiner_excluded_steps(_case_actions(case, cl["steps"]))
    newly = await asyncio.to_thread(
        observe, cl["steps"], messages, body.already_ticked, excluded, body.focus_step,
        body.record_done,
    )
    return ObserveResponse(newly_satisfied=newly)


@router.post("/api/cases/{case_id}/action", response_model=ActionResponse)
@limiter.limit("40/minute")
async def case_action(case_id: str, request: Request, body: ActionRequest,
                      current_user: CurrentUser = Depends(get_current_user)):
    """Real-time grade of one manual procedure against the case's crafted model answer
    (ricoe C6). The verdict/covered/missing/model_answer are computed DETERMINISTICALLY
    (grade_action) so the panel responds instantly, keyless, and never with a hardcoded
    'good job'. A grounded AI tip may refine the coaching line; any AI failure keeps the
    deterministic line. Never blocks the tick — the step already ticked client-side."""
    case = _load_case_or_404(case_id)
    await _check_case_access(current_user["sub"], case, current_user["student_role"] or "OA", current_user["role"])  # fail closed on a locked case

    # Resolve the same checklist the station showed so the model answer can fall back to
    # the exact step text when the rubric has no matching investigations point.
    try:
        steps = (await asyncio.to_thread(_station_checklist, case)).get("steps", [])
    except Exception:
        steps = []
    grade = grade_action(case, body.action_label, body.satisfies_steps, steps, body.technique)

    user_msg = (
        f"Procedure: {body.action_label}\n"
        f"Student technique: {body.technique}\n"
        f"Measured finding: {body.finding or '(none)'}\n"
        f"Model answer points: {' | '.join(grade['model_points']) or '(none)'}\n"
        f"Points still MISSED: {' | '.join(grade['missing']) or '(none — all covered)'}"
    )
    # All fields are student-supplied free text → filter the whole prompt like /chat
    # before the model sees it (not just `technique`).
    try:
        guard = await filter_input(user_msg, patient_context=True)
        if not guard["safe"]:
            audit_log("input_blocked", student_id=current_user["sub"], feature="guardrail_action",
                      detail=f"reason={guard['reason']}")
            await db.insert_audit_event(action="input_blocked", actor=current_user["sub"],
                                        feature="guardrail_action", detail=f"reason={guard['reason']}",
                                        ip=_client_ip(request))
            # Still return the deterministic grade — only the AI tip is suppressed.
            return ActionResponse(
                coaching=grade["coaching"], verdict=grade["verdict"],
                covered=grade["covered"], missing=grade["missing"],
                model_answer=grade["model_answer"],
            )
    except Exception:
        pass

    coaching = grade["coaching"]
    try:
        tip = await asyncio.wait_for(
            asyncio.to_thread(
                ask,
                system_prompt=ACTION_COACH,
                messages=[{"role": "user", "content": user_msg}],
                max_tokens=220,            # 1 sentence; MINIMAL = no thinking, so no starve
                feature="case_action",
                model=MODEL,
                thinking_level="MINIMAL",
            ),
            timeout=12.0,                  # single-worker safety: never hang the event loop
        )
        if tip and tip.strip():
            coaching = tip.strip()
    except Exception:
        pass  # graceful: keep the grounded deterministic coaching line
    return ActionResponse(
        coaching=coaching, verdict=grade["verdict"],
        covered=grade["covered"], missing=grade["missing"],
        model_answer=grade["model_answer"],
    )


@router.post("/api/cases/{case_id}/chat")
# /observe fires on every turn too, so a real consult costs two calls per message — 30 was
# tighter than it looked and read to students as "the AI stopped working" (Branda 2026-07-29).
@limiter.limit("60/minute")
async def case_chat(case_id: str, request: Request, body: CaseChatRequest, current_user: CurrentUser = Depends(get_current_user)):
    # Try in-memory cache first (AI-generated cases), then fall back to file
    case = _case_cache.get(case_id)
    if case is None:
        try:
            case = load_case(case_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid case ID")
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")

    await _check_case_access(current_user["sub"], case, current_user["student_role"] or "OA", current_user["role"])
    # becky §4: the patient only needs what it must answer from. Drop `rubric` (~40% of
    # the file, pure grading meta) and `management` (answer-key) — the grader still sees
    # the full case on submit. `diagnosis` is KEPT so the model knows what NOT to reveal
    # (PATIENT_SYSTEM forbids revealing it). Compact-serialized (no indent).
    patient_view = {k: case[k] for k in
        ("patient", "history", "examination_findings", "investigations", "diagnosis")
        if k in case}
    patient_prompt = PATIENT_SYSTEM.format(case_json=json.dumps(patient_view, separators=(",", ":")))
    messages = [{"role": m.role, "content": m.content} for m in _bounded(body.messages)]

    # Input filter — blocks prompt injection via the case chat interface, but allows
    # patient-identity questions (name, NRIC, DOB, address): confirming particulars is
    # part of the OSCE encounter and the patient prompt answers it from the case record.
    last_msg = next((m.content for m in reversed(body.messages) if m.role == "user"), "")
    try:
        guard = await filter_input(last_msg, patient_context=True)
        if not guard["safe"]:
            audit_log("input_blocked", student_id=current_user["sub"], feature="guardrail_case",
                      detail=f"reason={guard['reason']}")
            await db.insert_audit_event(action="input_blocked", actor=current_user["sub"],
                                        feature="guardrail_case", detail=f"reason={guard['reason']}",
                                        ip=_client_ip(request))

            def _blocked():
                yield f"data: {json.dumps({'text': 'Please keep the conversation focused on this clinical case.'})}\n\n"
                yield "data: [DONE]\n\n"

            return StreamingResponse(_blocked(), media_type="text/event-stream")
    except Exception:
        pass

    def sse_stream():
        try:
            for chunk in stream_ask(
                system_prompt=patient_prompt,
                messages=messages,
                # A patient turn is one or two short sentences (PATIENT_SYSTEM). 320 is a
                # STRUCTURAL backstop: prompt drift alone must not bring the essay back.
                max_tokens=320,
                feature="case",
                model=MODEL,
                # becky §2: patient roleplay is conversational — MINIMAL thinking.
                thinking_level="MINIMAL",
            ):
                yield f"data: {json.dumps({'text': chunk})}\n\n"
        except RuntimeError as exc:
            if "quota_exceeded" in str(exc):
                yield f"data: {json.dumps({'text': '(API quota reached for today — case simulation will resume tomorrow.)', 'quota_exceeded': True})}\n\n"
            else:
                yield f"data: {json.dumps({'text': '(I\'m having trouble reaching the service right now.)'})}\n\n"
        except Exception:
            yield f"data: {json.dumps({'text': '(I\'m having trouble reaching the service right now.)'})}\n\n"
        yield "data: [DONE]\n\n"

    # SSE flush headers — keep Render's proxy from buffering the live patient stream.
    return StreamingResponse(sse_stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    })


# Markers the station UI embeds in the action-panel transcript (mirror ActionPalette.tsx).
_EXAM_PREFIX = "[Examination performed: "
_GRADE_PREFIX = "[[GRADE]]"


def _readable_action_line(content: str) -> str:
    """Turn one embedded action-panel marker into a plain, examiner-readable line so the
    debrief coach can comment on HOW procedures were performed (not raw markers)."""
    if content.startswith(_EXAM_PREFIX):
        inner = content[len(_EXAM_PREFIX):]
        if inner.endswith("]"):
            inner = inner[:-1]
        label, _, body = inner.partition(" → ")
        technique, _, result = body.partition(" · Result: ")
        line = f"Performed: {label.strip()}"
        # "performed" / "record checked" are the one-click MARKERS the panel writes, not a
        # technique the student typed — reporting them as one coaches on a phantom answer.
        if technique.strip() and technique.strip() not in ("performed", "record checked"):
            line += f" — technique described: {technique.strip()}"
        if result.strip():
            line += f" (result: {result.strip()})"
        return line
    if content.startswith(_GRADE_PREFIX):
        try:
            g = json.loads(content[len(_GRADE_PREFIX):])
        except Exception:
            return ""
        parts = [f"Examiner grade: {g.get('verdict', '')}"]
        if g.get("missing"):
            parts.append("still to include: " + "; ".join(str(x) for x in g["missing"]))
        return " — ".join(parts)
    return ""


def _split_consult(messages: list[dict]) -> tuple[list[str], list[str]]:
    """Split a flat transcript into (patient-consultation lines, action-panel lines)."""
    patient: list[str] = []
    actions: list[str] = []
    for m in messages:
        c = str(m.get("content", ""))
        if c.startswith(_EXAM_PREFIX) or c.startswith(_GRADE_PREFIX):
            line = _readable_action_line(c)
            if line:
                actions.append(line)
        else:
            who = "Student" if m.get("role") == "user" else "Patient"
            patient.append(f"{who}: {c}")
    return patient, actions


def _case_standard_block(case: dict) -> str:
    """The case's OWN expected answer, for the coach.

    The coach is asked to judge the student's submitted findings and recommendation. Until
    2026-08-04 its prompt held neither the case's `diagnosis` nor its `management` plan nor
    its `rubric.key_points`, so it had nothing to judge them against except its own general
    knowledge — the "open graded against internet" the report was accused of.
    """
    lines = ["THE CASE'S OWN STANDARD — judge the student against THIS:"]
    if case.get("diagnosis"):
        lines.append(f"  Expected clinical picture: {case['diagnosis']}")
    if case.get("management"):
        lines.append(f"  Expected plan: {case['management']}")
    for domain, spec in (case.get("rubric") or {}).items():
        for kp in (spec or {}).get("key_points", []):
            lines.append(f"  [{domain}] {kp}")
    return "\n".join(lines) + "\n\n"


def _grade_block(score: dict) -> str:
    """The grade the coach is narrating — bucket totals and the sub-scores behind them.

    Rendered from `breakdown`, which station_score.py owns, so the coach is told about a
    sub-score only when that sub-score actually counted (a case with no manual procedures
    has no Examination technique part, and must not be coached as though it did).
    """
    b = score.get("breakdown") or {}
    names = (("checklist", "Checklist coverage"), ("consult", "Consultation & Technique"),
             ("judgement", "Clinical Judgement & Safety"))
    lines = ["THE GRADE YOU ARE EXPLAINING (already awarded, shown beside your words):"]
    for key, label in names:
        bucket = b.get(key) or {}
        parts = ", ".join(f"{p['label']} {p['pts']}/{p['max']}" for p in bucket.get("parts", []))
        lines.append(f"  {label}: {bucket.get('total', 0)}/{bucket.get('max', 0)}"
                     + (f"  ({parts})" if parts else ""))
        if bucket.get("capped") and bucket.get("cap_reason"):
            lines.append(f"    {bucket['cap_reason']}")
    return "\n".join(lines) + "\n"


def _fallback_coaching(score: dict, raw_result: dict,
                       checklist_comparison: list["ChecklistStepResult"],
                       action_lines: list[str]) -> "CoachingBlock":
    """A grounded, deterministic debrief built from the graded result — so the coach
    summary is NEVER empty (ricoe: "coach summary shows nothing — must show real comments
    and feedback based on the student's performance")."""
    performed = [c.action for c in checklist_comparison if c.performed]
    missed = [c.action for c in checklist_comparison if not c.performed]
    highlights: list[str] = []
    did_wrong: list[str] = []

    if score.get("safe") and any(c.critical and c.performed for c in checklist_comparison):
        highlights.append("Completed the safety-critical steps for this station.")
    if int(raw_result.get("history_score", 0)) >= 7:
        highlights.append("Took a clear, relevant history from the patient.")
    if action_lines:
        highlights.append(f"Performed {len(action_lines)} hands-on procedure(s) in the action panel.")
    if not highlights and performed:
        highlights.append(f"Worked through {len(performed)} of {len(checklist_comparison)} checklist steps.")

    if not score.get("safe") and score.get("missed_critical"):
        did_wrong.append(f"Missed a critical safety step: {score['missed_critical'][0]}.")
    if int(raw_result.get("management_score", 0)) <= 4:
        did_wrong.append("Escalation / handover was unclear — state the urgency and who to refer to.")

    if score.get("missed_critical"):
        focus = f"Always complete the safety-critical step: {score['missed_critical'][0]}."
    elif missed:
        focus = f"Next time, don't skip: {missed[0]}."
    else:
        focus = "Keep consolidating a smooth, in-order routine for this station."

    return CoachingBlock(
        highlights=highlights[:3], did_wrong=did_wrong[:3], missed=missed[:3], focus=focus,
    )


def _build_checklist_detail(steps: list[dict], *, performed: set[int],
                            skipped: set[int]) -> list[dict]:
    """The per-step ledger persisted with the attempt (migration 019).

    Built from the SAME resolved steps and the SAME phase grouping /station serves, so a
    report rebuilt from this row groups exactly as the ledger the student watched. `skipped`
    is recorded alongside `performed=False` rather than instead of it: on the day they are the
    same outcome, and the distinction is only for whoever reviews the attempt later.
    """
    # Two passes on purpose: the ledger is emitted in the STEPS' order, not in phase order.
    # group_by_phase buckets by category, and nothing guarantees categories appear in phase
    # order — flattening its groups would silently reorder the ledger a student worked through.
    phase_of: dict[int, str] = {}
    for group in group_by_phase(steps):
        for s in group["steps"]:
            phase_of[int(s.get("step_number", 0))] = str(group["name"])
    detail: list[dict] = []
    for s in steps:
        n = int(s.get("step_number", 0))
        detail.append({
            "step_number": n,
            "action": str(s.get("action", "")),
            "phase": phase_of.get(n, ""),
            "critical": bool(s.get("critical", False)),
            "performed": n in performed,
            "skipped": n in skipped,
        })
    return detail


async def _persist_submit(
    *,
    student_id: str,
    case: dict,
    case_id: str,
    messages: list,
    score: dict,
    award: int,
    missed: list,
    passed: bool,
    coaching: dict,
    checklist_detail: list[dict],
) -> None:
    """Best-effort persistence for a submitted station, run as a BackgroundTask so
    the ~7 Supabase round-trips (session log + profile/XP + rich case grade) stay OFF
    the response critical path. Each write is isolated: one failing (e.g. an additive
    column still pending its migration) must never sink the others — the response has
    already gone out regardless."""
    try:
        await log_session(
            student_id=student_id,
            topic=f"Case: {case['title']}",
            messages=messages,
            token_count=0,
            model="mock" if MOCK_MODE else MODEL,
        )
    except Exception:
        pass

    try:
        from tools.profile.update_profile import update_profile
        await update_profile(
            student_id, topic=case["topic"], score=score["score_100"] / 100,
            new_missed_findings=missed, xp_delta=award, source="osce",
        )
    except Exception:
        pass

    # The additive DB columns (score sub-domains, safety verdict, missed-critical,
    # coaching block) degrade gracefully until migration 011 (see db.insert_case_result).
    try:
        await log_case_completion(
            student_id, case_id, score["total_score"], passed,
            score_100=int(score["score_100"]),
            safe=bool(score["safe"]),
            consult_technique=int(score["consult_technique"]),
            judgement_safety=int(score["judgement_safety"]),
            missed_critical=list(score["missed_critical"]),
            coaching=coaching,
            # .get, not [] — a scorer that predates these stores NULL and reads back as the
            # legacy ×50 era, which is the honest degrade. A KeyError here would be swallowed
            # by the enclosing except and silently drop the whole row instead.
            checklist_coverage=score.get("checklist_coverage"),
            grade_scale=score.get("grade_scale"),
            checklist_detail=checklist_detail,
        )
    except Exception:
        pass


@router.post("/api/cases/{case_id}/submit", response_model=CaseSubmitResponse)
@limiter.limit("10/minute")
async def case_submit(request: Request, case_id: str, body: CaseSubmitRequest, background_tasks: BackgroundTasks, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    case = _case_cache.get(case_id)
    if case is None:
        try:
            case = load_case(case_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid case ID")
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")

    await _check_case_access(student_id, case, current_user["student_role"] or "OA", current_user["role"])
    messages = [{"role": m.role, "content": m.content} for m in _bounded(body.messages)]
    messages.append({
        "role": "user",
        "content": f"Findings & impression: {body.findings}\nRecommendation & escalation: {body.recommendation}",
    })

    # ── Resolve the checklist up front (pure CPU). The comparison + missed steps depend
    #    only on the checklist + performed steps — NOT on the grade — so build them now
    #    and let the coaching call run CONCURRENTLY with grading.
    checklist_comparison: list[ChecklistStepResult] = []
    _cl_compare: dict = {}
    # A skipped step reached the gate without being done, so it is not performed — anywhere.
    # The client already strips them; doing it here too means no client version, old or
    # hand-rolled, can buy credit (or clear the safety gate) by giving up on a step.
    _skipped_set = set(body.skipped_steps)
    performed_set = set(body.performed_steps) - _skipped_set
    performed_list = sorted(performed_set)
    _cl_steps: list[dict] = []
    try:
        _cl_compare = await asyncio.to_thread(_station_checklist, case)
        _cl_steps = list(_cl_compare.get("steps") or [])
        for s in (_cl_compare.get("steps") or []):
            step_num = int(s.get("step_number", 0))
            performed = step_num in performed_set
            critical = bool(s.get("critical", False))
            checklist_comparison.append(ChecklistStepResult(
                step_number=step_num,
                action=str(s.get("action", "")),
                critical=critical,
                performed=performed,
            ))
    except Exception:
        pass

    # ── The coaching prompt is built AFTER the grade (below): it used to run CONCURRENTLY
    #    with grading and was deliberately denied the numeric score, so its prose could
    #    praise a domain the grader scored 3/10 and attack one it scored 10/10 — the two
    #    halves of the same report disagreeing (reported 2026-08-04). Everything that does
    #    NOT depend on the grade is still assembled here.
    from tools.api.shared import _student_context_block
    try:
        _coach_ctx = await _student_context_block(student_id)
    except Exception:
        _coach_ctx = ""
    missed_actions = [c.action for c in checklist_comparison if not c.performed]
    _cl_done = sum(1 for c in checklist_comparison if c.performed)
    # Steps the student tried and gave up on (the station's skip). They're already in
    # missed_actions — this names them separately because "attempted, couldn't finish" is
    # coachable in a way "never attempted" isn't, and the debrief should tell them apart.
    skipped_named = [c.action for c in checklist_comparison if c.step_number in _skipped_set]
    # Feed BOTH the patient consultation AND the action-panel procedures (decoded from the
    # embedded markers) so the coach can comment on what was actually said and done — the
    # source of real, specific feedback (ricoe C7).
    consult_patient, consult_actions = _split_consult(messages[:-1])
    # The grade runs FIRST and alone — the coaching prompt below is built from its result.
    # A grader that cannot grade is a 503, not a 500 and not an invented score: everything
    # that persists this attempt (log_case_completion, log_session, update_profile) is a
    # BackgroundTask scheduled BELOW, so returning here writes nothing and the student's
    # resubmit is a real retry against the same station. See test_grader_unavailable.py.
    try:
        raw_result = await asyncio.wait_for(
            asyncio.to_thread(
                evaluate_case, case, messages, student_id, performed_list,
                _cl_compare.get("steps", []),
            ),
            _GRADE_TIMEOUT_S,
        )
    except (GraderUnavailable, asyncio.TimeoutError) as exc:
        audit_log("case_grade_unavailable", student_id=student_id, feature="cases",
                  detail=f"case_id={case_id} reason={exc}")
        # Durable, unlike the .tmp audit log: this is the one signal an operator can see
        # when a station dies on a healthy-looking service.
        logger.error("osce grade unavailable case_id=%s student=%s: %s",
                     case_id, student_id, exc)
        raise HTTPException(
            status_code=503,
            detail="The grader is unavailable right now, so your station was not graded "
                   "or recorded. Your answers are still here — submit again in a moment.",
        )

    # ── Station-100: the legible score, computed from the SAME steps the student
    #    saw tick (the station-resolved checklist) so Thoroughness reconciles.
    # The Technique bucket only applies when the case has manual procedures — use
    # the same classification that decides whether the action panel renders.
    has_manual = has_manual_actions(
        case.get("examination_findings", {}), _cl_compare.get("steps", [])
    )
    score = compute_station_score(
        {
            "history": raw_result.get("history_score", 0),
            "investigations": raw_result.get("investigations_score", 0),
            "diagnosis": raw_result.get("diagnosis_score", 0),
            "management": raw_result.get("management_score", 0),
        },
        _cl_compare.get("steps", []),
        performed_list,
        has_manual,
    )

    coaching_system = (
        (_coach_ctx + "\n\n" if _coach_ctx else "")
        + "You are an ophthalmology clinical educator coaching an allied-health (OA/OT/PSA) "
        "student after an OSCE station. Base every point on the ACTUAL patient consultation and "
        "the procedures they performed in the action panel below — quote or paraphrase what they "
        "really said or did. Return ONLY JSON: {\"highlights\":[..],\"did_wrong\":[..],"
        "\"missed\":[..],\"focus\":\"..\"}. highlights = 1-3 concrete things they genuinely did well, "
        "drawn from the consultation or their technique. did_wrong = 1-3 things they did WRONGLY or "
        "only PARTIALLY (an incorrect step, unsafe or out-of-role action, weak technique, or something "
        "done half-way). missed = 1-3 things they MISSED OUT or were LACKING entirely (never "
        "attempted), each tied to a specific step and naming the clinical consequence in the same short "
        "phrase. focus = ONE sentence: the single most important thing for next time. Every item is a "
        "short phrase (~6-12 words), warm and specific; leave an array empty ([]) only if there is "
        "genuinely nothing to say. Reward triage/escalation within role; do not reward making a "
        "medical diagnosis.\n"
        # Two rules that exist because a real report broke both (2026-08-04): it told a student
        # who performed 15 of 16 steps that they had completed every step, and left "missed"
        # empty. The counts are in the message below so a completion claim now contradicts the
        # model's own input, not just the record.
        "TWO HARD RULES. (1) NEVER say or imply the student completed the whole checklist, "
        "every step, or that nothing was missed, unless the performed count below equals the "
        "total. (2) NEVER let `missed` merely restate a step they didn't perform — the report "
        "already lists every one of those, so repeating one is not feedback. Each `missed` item "
        "must say what the omission COSTS clinically, or name the pattern across the omissions. "
        "If they did perform every step, `missed` is about DEPTH — what a top answer would have "
        "gone into that this one only touched.\n"
        # Reported 2026-08-04. The coach was judging the student's findings and recommendation
        # with no idea what the case's right answer WAS — its prompt carried the title, the
        # transcript and bare step names, so every clinical claim came from the model's own
        # priors. It now gets the case's own standard and SNEC's checklist, below.
        "SNEC IS THE STANDARD. This is Singapore National Eye Centre. Coach against THE CASE'S "
        "OWN STANDARD and the SNEC PROCEDURE below — never against how the procedure is done "
        "elsewhere. Where they differ, SNEC wins: correct SNEC technique is never a fault, and "
        "something SNEC's checklist does not ask for is not a gap. Do not invent a clinical "
        "expectation that appears in neither.\n"
        # Grader and coach used to run concurrently, so the prose and the numbers were two
        # independent opinions printed side by side in one report.
        "AGREE WITH THE GRADE. The scores below are already awarded and shown to the student "
        "next to your words. Explain them — never contradict them. Do not celebrate a domain "
        "that scored below 5, and do not attack one that scored 8 or above; for a high score "
        "with a real shortfall, name the shortfall as depth, not as failure."
    )
    coaching_messages = [{
        "role": "user",
        "content": (
            f"Case: {case['title']}\n\n"
            + _case_standard_block(case)
            + "SNEC PROCEDURE — this station's checklist, with SNEC's reason for each step:\n"
            + (procedure_block(_cl_compare.get("steps", []), performed_set)
               or "(no checklist resolved for this station)") + "\n\n"
            + _grade_block(score) + "\n"
            f"Findings submitted: {body.findings}\n"
            f"Recommendation submitted: {body.recommendation}\n"
            f"Checklist: {_cl_done} of {len(checklist_comparison)} steps performed\n"
            f"Checklist steps NOT performed: {', '.join(missed_actions) or 'none'}\n"
            f"Steps the student tried but COULD NOT COMPLETE, and skipped to carry on (they "
            f"asked for help here — coach these first): {', '.join(skipped_named) or 'none'}\n\n"
            "PATIENT CONSULTATION:\n" + ("\n".join(consult_patient) or "(no conversation)") + "\n\n"
            "ACTION PANEL — procedures performed and examiner grades:\n"
            + ("\n".join(consult_actions) or "(no manual procedures performed)")
        ),
    }]

    # Still a task, not an await: the prior-attempt read below is I/O the coach can overlap.
    coaching_task = asyncio.create_task(asyncio.to_thread(
        ask,
        system_prompt=coaching_system,
        messages=coaching_messages,
        max_tokens=512,
        feature="debrief",
        model=MODEL,
        thinking_level="MEDIUM",
        response_json_schema=_COACHING_SCHEMA,
    ))

    cards: list = []

    # Retention/missed-gap heuristic + Lumens award — computed INLINE because they feed
    # the response (lumens_awarded) and the backgrounded profile write. Pure CPU, no I/O:
    # the actual DB writes are deferred to a BackgroundTask at the end of the handler so
    # the student isn't kept waiting on them after the station is already graded.
    missed: list[str] = []
    for domain in ("history_feedback", "investigations_feedback", "diagnosis_feedback", "management_feedback"):
        feedback = raw_result.get(domain, "")
        if feedback and any(w in feedback.lower() for w in ("miss", "forgot", "lack", "no mention")):
            missed.append(f"{domain.replace('_feedback', '')} gap in {case['topic']}")
    # Difficulty-scaled, grade-scaled gross reward, then TWO guards against farming one case.
    #
    # 1. Once the case has been PASSED, it pays nothing, ever again (user-directed: "their
    #    second attempt does not earn them lumens … if not student can just farm the same
    #    case over and over again"). This is what the greyed, sunk, ticked card on /cases
    #    means — a completed patient is practice from then on, not income.
    # 2. Before a pass, the per-case HIGH-WATER MARK still applies: award only the
    #    improvement over the best prior attempt, so repeated failures pay the consolation
    #    once rather than once per try.
    #
    # Rule 1 is deliberately keyed on PASSED and not on "attempted". A student who failed at
    # 40 and comes back to earn a 90 is the exact behaviour this feature is meant to
    # encourage; refusing to pay them for it would make a first bad attempt permanently
    # cost them the case. One indexed read — the profile WRITE stays deferred to the
    # BackgroundTask; a lookup failure falls through to the student's favour (full award),
    # never blocking the grant.
    difficulty = str(case.get("difficulty") or "beginner")
    gross = osce_reward(score["score_100"], difficulty)
    prior_best = 0
    already_passed = False
    try:
        prior_rows = [r for r in await db.get_case_results(student_id)
                      if r.get("case_id") == case_id]
        already_passed = any(_row_passed(r) for r in prior_rows)
        prior_best = max(
            (osce_reward(_row_score_100(r), difficulty) for r in prior_rows),
            default=0,
        )
    except Exception:
        prior_best = 0
        already_passed = False
    award = 0 if already_passed else max(0, gross - prior_best)

    # Difficulty progression: pass at 60/100 (== 24/40).
    passed = score["score_100"] >= 60

    audit_log("case_evaluated", student_id=student_id, feature="cases",
              detail=f"case_id={case['case_id']} score={score['score_100']}/100 "
                     f"checklist={score['critical_hit']}/{score['critical_total']}")

    # ── Coaching (best-effort): parse the structured JSON; never 500 the request.
    coaching = CoachingBlock()
    try:
        raw_coach = (await asyncio.wait_for(coaching_task, _COACH_TIMEOUT_S) or "").strip()
        if raw_coach.startswith("```"):
            raw_coach = raw_coach.split("```")[1]
            if raw_coach.startswith("json"):
                raw_coach = raw_coach[4:]
        data = json.loads(raw_coach)
        coaching = CoachingBlock(
            highlights=[str(x) for x in (data.get("highlights") or [])][:3],
            did_wrong=[str(x) for x in (data.get("did_wrong") or [])][:3],
            missed=[str(x) for x in (data.get("missed") or [])][:3],
            focus=str(data.get("focus") or ""),
        )
    except Exception:
        coaching = CoachingBlock()

    # Never leave the debrief empty (MOCK_MODE, a quota blip, or unparseable JSON): synthesise
    # a grounded summary from the graded result so the student always gets real, specific
    # feedback tied to their performance (ricoe: "coach summary shows nothing").
    if not (coaching.highlights or coaching.did_wrong or coaching.missed or coaching.focus):
        coaching = _fallback_coaching(score, raw_result, checklist_comparison, consult_actions)

    # ── The debrief may not outrun the ledger. Whatever the model returned, a claim of full
    #    coverage cannot survive a record that says otherwise, and "Missed or lacking" cannot
    #    come back empty — a blank column reads as "you missed nothing", which is a claim, not
    #    an absence. Both faults were in one real report (2026-08-04). Pure + deterministic.
    _cl_total = len(checklist_comparison)
    coaching = CoachingBlock(
        highlights=strip_false_completion(coaching.highlights, _cl_done, _cl_total),
        did_wrong=strip_false_completion(coaching.did_wrong, _cl_done, _cl_total),
        missed=coaching.missed or [missed_insight(
            _cl_compare.get("steps", []), performed_set, _skipped_set,
            {k: raw_result.get(f"{k}_score", 0)
             for k in ("history", "investigations", "diagnosis", "management")},
        )],
        focus=coaching.focus,
    )

    # ── Persist everything OFF the response critical path. None of these writes feed the
    #    response (lumens + coaching are already computed), and all are best-effort, so
    #    schedule them as ONE BackgroundTask: the student gets their result immediately and
    #    the session log + profile/XP update + rich case grade run after the response is
    #    flushed. The rich grade's sub-domain/safety/coaching fields feed the Analytics
    #    dashboard; they were dropped before RICOE and degrade gracefully pre-migration 011.
    # Built HERE rather than inside _persist_submit, so wrap it: an argument to add_task is
    # evaluated on the request path, and a purely-additive analytics field must never be able
    # to fail a submission that was already graded.
    try:
        _checklist_detail = _build_checklist_detail(
            _cl_steps, performed=performed_set, skipped=_skipped_set)
    except Exception:
        _checklist_detail = []
    background_tasks.add_task(
        _persist_submit,
        student_id=student_id,
        case=case,
        case_id=case_id,
        messages=messages,
        score=score,
        award=award,
        missed=missed,
        passed=passed,
        coaching={
            "highlights": coaching.highlights,
            "did_wrong": coaching.did_wrong,
            "missed": coaching.missed,
            "focus": coaching.focus,
        },
        checklist_detail=_checklist_detail,
    )

    per_phase = _per_phase_summary(_cl_compare.get("steps", []), performed_list)

    domain_fields = {k: raw_result.get(k, 0) for k in DomainScore.model_fields if k in raw_result}
    domain_fields.update({
        "total_score": score["total_score"],
        "score_100": score["score_100"],
        "verdict": score["verdict"],
        "checklist_coverage": score["checklist_coverage"],
        "checklist_coverage_max": score["checklist_coverage_max"],
        "consult_technique": score["consult_technique"],
        "consult_technique_max": score["consult_technique_max"],
        "judgement_safety": score["judgement_safety"],
        "judgement_safety_max": score["judgement_safety_max"],
        "safe": score["safe"],
        "missed_critical": score["missed_critical"],
        "critical_hit": score["critical_hit"],
        "critical_total": score["critical_total"],
        # .get, not [] — breakdown is additive and the DomainScore field already defaults,
        # so a scorer that predates it degrades to an empty explanation, never a 500.
        "breakdown": score.get("breakdown", {}),
    })
    return CaseSubmitResponse(
        result=DomainScore(**domain_fields),
        cards=[Flashcard(**c) for c in cards],
        mock_mode=MOCK_MODE,
        debrief=None,
        coaching=coaching,
        checklist_comparison=checklist_comparison,
        per_phase=[PhaseSummary(**p) for p in per_phase],
        lumens_awarded=award,
    )


class ForfeitResponse(BaseModel):
    penalty: int


@router.post("/api/cases/{case_id}/forfeit", response_model=ForfeitResponse)
@limiter.limit("30/minute")
async def forfeit_station(case_id: str, request: Request, current_user: CurrentUser = Depends(get_current_user)):
    """Quit-mid-station penalty. Deducts a flat, server-owned Lumen amount (the client never
    sends it, so it can't be gamed) when a student leaves a virtual-patient station before
    submitting the handover. update_profile floors the balance at 0 and leaves the lifetime
    coins_earned counter untouched, so an earned badge is never lost. Called fire-and-forget
    from the client (sendBeacon on the way out), so it echoes only the penalty amount."""
    student_id = current_user["sub"]
    try:
        from tools.profile.update_profile import update_profile
        await update_profile(student_id, xp_delta=-FORFEIT_PENALTY)
    except Exception:
        pass
    audit_log("station_forfeit", student_id=student_id, feature="cases",
              detail=f"case_id={case_id} penalty={FORFEIT_PENALTY}")
    return ForfeitResponse(penalty=FORFEIT_PENALTY)
