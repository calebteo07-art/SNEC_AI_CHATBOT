"""Case simulation endpoints."""
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from tools.ai.guardrails.input_filter import filter_input
from tools.api.shared import limiter, _case_cache, PATIENT_SYSTEM
from tools.cases.evaluate_response import evaluate_case
from tools.cases.get_case_progress import get_case_progress
from tools.cases.load_case import load_case, list_available_cases
from tools.cases.log_case_completion import log_case_completion
from tools.chatbot.log_session import log_session
from tools.profile.get_profile import get_profile
from tools.shared.audit_log import log as audit_log
from tools.shared.gemini_client import ask, stream_ask, MOCK_MODE, MODEL
from tools.shared.jwt_utils import get_current_user, CurrentUser
from tools.cases.topic_sets import resolve_set, sets_for, label_for, case_visible
from tools.cases.resolve_checklist import resolve_procedure_name, build_rubric_checklist
from tools.cases.phase_split import group_by_phase
from tools.cases.examination_actions import build_actions, has_manual_actions
from tools.cases.station_score import compute_station_score
from tools.cases.observe_steps import observe
from tools.cases.action_model_answer import grade_action
from tools.kb.search import get_checklist_by_name

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

OSCE_LUMEN_FACTOR = 2  # Lumens per point of the final station grade (0-100 -> 0-200).


def osce_lumens(score_100: int) -> int:
    """Lumens awarded for a completed OSCE station, scaled to the final grade."""
    return round(max(0, min(100, int(score_100))) * OSCE_LUMEN_FACTOR)


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

    passing_beginner = sum(
        1 for c in raw_cases
        if c.get("difficulty") == "beginner"
        and case_progress.get(c["case_id"], {}).get("passed")
    )
    passing_intermediate = sum(
        1 for c in raw_cases
        if c.get("difficulty") == "intermediate"
        and case_progress.get(c["case_id"], {}).get("passed")
    )
    intermediate_unlocked = passing_beginner >= 2
    advanced_unlocked = passing_intermediate >= 2

    cases = []
    for c in raw_cases:
        diff = c.get("difficulty", "beginner")
        if diff == "intermediate":
            locked = not intermediate_unlocked
        elif diff == "advanced":
            locked = not advanced_unlocked
        else:
            locked = False
        sk = c.get("topic_set") or resolve_set(role, c.get("topic", ""))
        cases.append(CaseInfo(
            case_id=c["case_id"],
            title=c["title"],
            difficulty=diff,
            topic=c["topic"],
            estimated_minutes=c["estimated_minutes"],
            patient=_patient_info(c["patient"]),
            locked=locked,
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
            c = load_case(case_id)
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


async def _check_case_access(student_id: str, case: dict) -> None:
    """Raise HTTP 403 if the student has not unlocked this case's difficulty tier.

    Rules:
    - beginner      → always accessible
    - intermediate  → requires >= 2 passing beginner cases
    - advanced      → requires >= 2 passing intermediate cases
    - unknown tier  → treated as beginner (allowed)
    """
    difficulty = case.get("difficulty", "beginner")
    if difficulty == "beginner":
        return
    if difficulty not in ("intermediate", "advanced"):
        return

    prerequisite = "beginner" if difficulty == "intermediate" else "intermediate"

    try:
        progress = await get_case_progress(student_id)
    except Exception:
        progress = {}

    passing = 0
    for cid in list_available_cases():
        c = _case_cache.get(cid)
        if c is None:
            try:
                c = load_case(cid)
                _case_cache[c["case_id"]] = c
            except Exception:
                continue
        if c.get("difficulty") == prerequisite:
            if progress.get(c["case_id"], {}).get("passed"):
                passing += 1

    if passing < 2:
        tier_label = "beginner" if difficulty == "intermediate" else "intermediate"
        raise HTTPException(
            status_code=403,
            detail=f"Complete at least 2 {tier_label} cases before accessing {difficulty} cases.",
        )


@router.get("/api/cases/{case_id}", response_model=CaseInfo)
def get_case(case_id: str):
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
def get_case_checklist(case_id: str):
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
    name, _how = resolve_procedure_name(case)
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
    return build_rubric_checklist(case)


@router.get("/api/cases/{case_id}/station", response_model=StationResponse)
def get_case_station(case_id: str, current_user: CurrentUser = Depends(get_current_user)):
    """Everything the OSCE station UI needs: case, phased checklist, exam actions."""
    case = _load_case_or_404(case_id)
    cl = _station_checklist(case)
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
    actions = [ExaminationAction(**a) for a in build_actions(case.get("examination_findings", {}), steps)]

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
    cl = _station_checklist(case)
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    # Hands-on procedures tick ONLY via the action panel — the conversational examiner must
    # never auto-tick them, so exclude every manual step number from what it may satisfy.
    manual_steps = {
        n for a in build_actions(case.get("examination_findings", {}), cl["steps"])
        if a.get("kind") == "manual" for n in a.get("satisfies_steps", [])
    }
    newly = await asyncio.to_thread(
        observe, cl["steps"], messages, body.already_ticked, manual_steps
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

    # Resolve the same checklist the station showed so the model answer can fall back to
    # the exact step text when the rubric has no matching investigations point.
    try:
        steps = _station_checklist(case).get("steps", [])
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
@limiter.limit("30/minute")
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

    await _check_case_access(current_user["sub"], case)
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
                # A patient turn is a few lay-language sentences — 1536 is a safe ceiling.
                max_tokens=1536,
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


@router.post("/api/cases/{case_id}/submit", response_model=CaseSubmitResponse)
async def case_submit(case_id: str, body: CaseSubmitRequest, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    case = _case_cache.get(case_id)
    if case is None:
        try:
            case = load_case(case_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid case ID")
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")

    await _check_case_access(student_id, case)
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
    try:
        _cl_compare = _station_checklist(case)
        performed_set = set(body.performed_steps)
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
    coaching_system = (
        (_coach_ctx + "\n\n" if _coach_ctx else "")
        + "You are an ophthalmology clinical educator coaching an allied-health (OA/OT/PSA) "
        "student after an OSCE station. Return ONLY JSON: {\"highlights\":[..],\"did_wrong\":[..],"
        "\"missed\":[..],\"focus\":\"..\"}. highlights = 1-3 concrete things they genuinely did well, "
        "drawn from the conversation. did_wrong = 1-3 things they did WRONGLY or only PARTIALLY (an "
        "incorrect step, an unsafe or out-of-role action, or something done half-way). missed = 1-3 "
        "things they MISSED OUT or were LACKING entirely (never attempted), each tied to a specific "
        "step and naming the clinical consequence in the same short phrase. focus = ONE sentence: the "
        "single most important thing for next time. Every item is a short phrase (~6-12 words), warm and "
        "specific; leave an array empty ([]) if there is genuinely nothing to say. Reward triage/"
        "escalation within role; do not reward making a medical diagnosis."
    )
    coaching_messages = [{
        "role": "user",
        "content": (
            f"Case: {case['title']}\n"
            f"Findings submitted: {body.findings}\n"
            f"Recommendation submitted: {body.recommendation}\n"
            f"Steps the student missed: {', '.join(missed_actions) or 'none'}\n\n"
            "Conversation:\n" + "\n".join(
                f"{'Student' if m['role'] == 'user' else 'Patient'}: {m['content']}" for m in messages
            )
        ),
    }]

    grade_task = asyncio.create_task(
        asyncio.to_thread(evaluate_case, case, messages, student_id, body.performed_steps)
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
        body.performed_steps,
        has_manual,
    )

    await log_session(
        student_id=student_id,
        topic=f"Case: {case['title']}",
        messages=messages,
        token_count=0,
        model="mock" if MOCK_MODE else MODEL,
    )

    cards: list = []

    award = 0
    # Profile update: retention = score_100/100; missed-gap heuristic unchanged.
    try:
        from tools.profile.update_profile import update_profile
        missed = []
        for domain in ("history_feedback", "investigations_feedback", "diagnosis_feedback", "management_feedback"):
            feedback = raw_result.get(domain, "")
            if feedback and any(w in feedback.lower() for w in ("miss", "forgot", "lack", "no mention")):
                missed.append(f"{domain.replace('_feedback', '')} gap in {case['topic']}")
        award = osce_lumens(score["score_100"])
        await update_profile(
            student_id, topic=case["topic"], score=score["score_100"] / 100,
            new_missed_findings=missed, xp_delta=award,
        )
    except Exception:
        pass

    # Difficulty progression: pass at 60/100 (== 24/40).
    passed = score["score_100"] >= 60

    audit_log("case_evaluated", student_id=student_id, feature="cases",
              detail=f"case_id={case['case_id']} score={score['score_100']}/100 "
                     f"checklist={score['critical_hit']}/{score['critical_total']}")

    # ── Coaching (best-effort): parse the structured JSON; never 500 the request.
    coaching = CoachingBlock()
    try:
        raw_coach = (await coaching_task or "").strip()
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

    # Persist the RICH grade now that coaching is parsed — the score sub-domains, safety
    # verdict, missed-critical steps and the coaching block feed the Analytics dashboard.
    # Every value is already computed; they were dropped before this change. The additive
    # DB columns degrade gracefully until migration 011 (see db.insert_case_result).
    try:
        await log_case_completion(
            student_id, case_id, score["total_score"], passed,
            score_100=int(score["score_100"]),
            safe=bool(score["safe"]),
            consult_technique=int(score["consult_technique"]),
            judgement_safety=int(score["judgement_safety"]),
            missed_critical=list(score["missed_critical"]),
            coaching={
                "highlights": coaching.highlights,
                "did_wrong": coaching.did_wrong,
                "missed": coaching.missed,
                "focus": coaching.focus,
            },
        )
    except Exception:
        pass

    per_phase = _per_phase_summary(_cl_compare.get("steps", []), body.performed_steps)

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
