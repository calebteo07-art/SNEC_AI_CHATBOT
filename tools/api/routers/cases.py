"""Case simulation endpoints."""
import asyncio
import json
import os

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from tools.ai.guardrails.input_filter import filter_input
from tools.api.shared import limiter, _case_cache, PATIENT_SYSTEM, FORFEIT_PENALTY, _client_ip
from tools.cases.evaluate_response import evaluate_case
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
from tools.cases.resolve_checklist import resolve_procedure_name, build_rubric_checklist
from tools.cases.phase_split import group_by_phase
from tools.cases.examination_actions import build_actions, examiner_excluded_steps, has_manual_actions
from tools.cases.station_score import compute_station_score
from tools.cases.observe_steps import observe
from tools.cases.action_model_answer import grade_action
from tools.kb.search import get_checklist_by_name

# Bound the best-effort coaching call so a slow/hung Gemini response can't keep the
# student waiting after the station is already graded — the deterministic fallback
# (_fallback_coaching) fills in on timeout. The GRADE call is intentionally NOT bounded
# here: it is the assessment itself and carries its own fallback.
_COACH_TIMEOUT_S = float(os.getenv("OSCE_COACH_TIMEOUT_S", "30"))

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
# little, but failing doesn't pay like passing). The award actually granted is the
# improvement over the student's best prior attempt at that case (high-water mark, applied
# in case_submit) — so re-running an aced case, or repeatedly failing, both re-pay nothing.
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

class CaseChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(max_length=100)

class CaseChatResponse(BaseModel):
    response: str

class CaseSubmitRequest(BaseModel):
    messages: list[ChatMessage] = Field(max_length=100)
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


class ScoreBreakdown(BaseModel):
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
    overall_feedback: str
    critical_hit: int = 0
    critical_total: int = 0
    # Two-scheme /100 (the student-facing model). The checklist is NOT part of the grade.
    score_100: int = 0
    verdict: str = ""
    consult_technique: int = 0        # Consultation & Technique (0-50)
    consult_technique_max: int = 50
    judgement_safety: int = 0         # Clinical Judgement & Safety (0-50), safety-gated
    judgement_safety_max: int = 50
    safe: bool = True
    missed_critical: list[str] = []
    # Why each scheme scored what it did — sub-scores + the safety cap. Additive with a
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
    try:
        completed = set((await get_case_progress(student_id)).keys())
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


async def _check_case_access(student_id: str, case: dict, role: str = "OA") -> None:
    """Raise HTTP 403 if the student has not unlocked this case under the per-topic gate.

    Fail-closed mirror of `get_cases`' lock flags: Foundational (beginner) and unknown tiers
    are always accessible; Developing/Advanced are gated per topic-set by tier_gate.evaluate
    (see tools/cases/tier_gate.py). The 403 detail is the same actionable hint shown on the
    locked card. `role` is the student's OA/OT/PSA role (from the JWT) — it buckets cases
    into topic-sets exactly like the case list.
    """
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


def _case_actions(case: dict, steps: list[dict]) -> list[dict]:
    """build_actions for one case — ONE place, so /station and /observe can't classify the
    same case differently (the examiner's exclusion set is derived from this)."""
    return build_actions(
        case.get("examination_findings", {}), steps,
        allergy_record=str((case.get("history") or {}).get("allergies") or ""),
    )


@router.get("/api/cases/{case_id}/station", response_model=StationResponse)
async def get_case_station(case_id: str, current_user: CurrentUser = Depends(get_current_user)):
    """Everything the OSCE station UI needs: case, phased checklist, exam actions."""
    case = _load_case_or_404(case_id)
    # Fail closed on a locked difficulty tier, matching chat/submit — the station serves
    # the full checklist + examination reveal_text, so it must honour the progression gate.
    await _check_case_access(current_user["sub"], case, current_user["student_role"] or "OA")
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
    await _check_case_access(current_user["sub"], case, current_user["student_role"] or "OA")  # fail closed on a locked case
    # _station_checklist hits the sync Supabase client; keep it off the event loop.
    cl = await asyncio.to_thread(_station_checklist, case)
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
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
    await _check_case_access(current_user["sub"], case, current_user["student_role"] or "OA")  # fail closed on a locked case

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

    await _check_case_access(current_user["sub"], case, current_user["student_role"] or "OA")
    # becky §4: the patient only needs what it must answer from. Drop `rubric` (~40% of
    # the file, pure grading meta) and `management` (answer-key) — the grader still sees
    # the full case on submit. `diagnosis` is KEPT so the model knows what NOT to reveal
    # (PATIENT_SYSTEM forbids revealing it). Compact-serialized (no indent).
    patient_view = {k: case[k] for k in
        ("patient", "history", "examination_findings", "investigations", "diagnosis")
        if k in case}
    patient_prompt = PATIENT_SYSTEM.format(case_json=json.dumps(patient_view, separators=(",", ":")))
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

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
            new_missed_findings=missed, xp_delta=award,
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

    await _check_case_access(student_id, case, current_user["student_role"] or "OA")
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
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
    try:
        _cl_compare = await asyncio.to_thread(_station_checklist, case)
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

    # ── Build the coaching prompt up front: it needs only the transcript + the
    #    missed steps (NOT the numeric score), so grading and coaching run in
    #    parallel. The old separate "missed-step notes" call is folded in here.
    from tools.api.shared import _student_context_block
    try:
        _coach_ctx = await _student_context_block(student_id)
    except Exception:
        _coach_ctx = ""
    missed_actions = [c.action for c in checklist_comparison if not c.performed]
    # Steps the student tried and gave up on (the station's skip). They're already in
    # missed_actions — this names them separately because "attempted, couldn't finish" is
    # coachable in a way "never attempted" isn't, and the debrief should tell them apart.
    skipped_named = [c.action for c in checklist_comparison if c.step_number in _skipped_set]
    # Feed BOTH the patient consultation AND the action-panel procedures (decoded from the
    # embedded markers) so the coach can comment on what was actually said and done — the
    # source of real, specific feedback (ricoe C7).
    consult_patient, consult_actions = _split_consult(messages[:-1])
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
        "medical diagnosis."
    )
    coaching_messages = [{
        "role": "user",
        "content": (
            f"Case: {case['title']}\n"
            f"Findings submitted: {body.findings}\n"
            f"Recommendation submitted: {body.recommendation}\n"
            f"Checklist steps NOT performed: {', '.join(missed_actions) or 'none'}\n"
            f"Steps the student tried but COULD NOT COMPLETE, and skipped to carry on (they "
            f"asked for help here — coach these first): {', '.join(skipped_named) or 'none'}\n\n"
            "PATIENT CONSULTATION:\n" + ("\n".join(consult_patient) or "(no conversation)") + "\n\n"
            "ACTION PANEL — procedures performed and examiner grades:\n"
            + ("\n".join(consult_actions) or "(no manual procedures performed)")
        ),
    }]

    grade_task = asyncio.create_task(
        asyncio.to_thread(evaluate_case, case, messages, student_id, performed_list)
    )
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

    try:
        raw_result = await grade_task
    except Exception:
        coaching_task.cancel()
        raise

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
    # Difficulty-scaled, grade-scaled gross reward, then the per-case high-water mark: award
    # only the improvement over the student's best prior attempt at this case, so retries
    # never re-pay (an aced case re-run pays 0; repeated fails pay 0). One indexed read — the
    # profile WRITE stays deferred to the BackgroundTask; a lookup failure defaults prior_best
    # to 0 (the student's favour → full award), never blocking the grant.
    difficulty = str(case.get("difficulty") or "beginner")
    gross = osce_reward(score["score_100"], difficulty)
    prior_best = 0
    try:
        prior_rows = await db.get_case_results(student_id)
        prior_best = max(
            (osce_reward(_row_score_100(r), difficulty)
             for r in prior_rows if r.get("case_id") == case_id),
            default=0,
        )
    except Exception:
        prior_best = 0
    award = max(0, gross - prior_best)

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

    # ── Persist everything OFF the response critical path. None of these writes feed the
    #    response (lumens + coaching are already computed), and all are best-effort, so
    #    schedule them as ONE BackgroundTask: the student gets their result immediately and
    #    the session log + profile/XP update + rich case grade run after the response is
    #    flushed. The rich grade's sub-domain/safety/coaching fields feed the Analytics
    #    dashboard; they were dropped before RICOE and degrade gracefully pre-migration 011.
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
    )

    per_phase = _per_phase_summary(_cl_compare.get("steps", []), performed_list)

    domain_fields = {k: raw_result.get(k, 0) for k in DomainScore.model_fields if k in raw_result}
    domain_fields.update({
        "total_score": score["total_score"],
        "score_100": score["score_100"],
        "verdict": score["verdict"],
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
