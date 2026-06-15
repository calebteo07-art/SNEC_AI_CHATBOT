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
from tools.shared.static_pools import pick_next_unseen
from tools.cases.topic_sets import resolve_set, sets_for, label_for

# How many cases to surface per student per visit (a small rotating set, not the
# whole library). The student cycles through every unlocked case before repeats.
CASE_WINDOW = 6

router = APIRouter()


# ── Case simulation models ─────────────────────────────────────────────────

class CasePatientInfo(BaseModel):
    name: str
    age: int
    presenting_complaint: str

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
    diagnosis: str
    management_plan: str
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

class ChecklistStepResult(BaseModel):
    step_number: int
    action: str
    critical: bool
    performed: bool
    clinical_note: str | None = None

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
    checklist_comparison: list[ChecklistStepResult] = []

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
            if case_role not in (role, "any"):
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
            patient=CasePatientInfo(
                name=c["patient"]["name"],
                age=c["patient"]["age"],
                presenting_complaint=c["patient"]["presenting_complaint"],
            ),
            locked=locked,
            set_key=sk,
            set_label=label_for(role, sk),
        ))

    # Topic-set view: the student picked a topic, so return that whole set
    # (keeping difficulty-lock flags) instead of a rotating window.
    if topic_set:
        cases = [c for c in cases if c.set_key == topic_set]
        return CasesResponse(cases=cases)

    # Default view — per-student no-repeat rotation: surface a small window of
    # unlocked cases the student hasn't completed yet, cycling through all of
    # them before repeating. "Served" = completed (from case_progress).
    unlocked = [c for c in cases if not c.locked]
    if unlocked:
        completed_ids = set(case_progress.keys())
        served = {i for i, c in enumerate(unlocked) if c.case_id in completed_ids}
        picks = pick_next_unseen(student_id, len(unlocked), "cases", served, n=CASE_WINDOW)
        seen: set[int] = set()
        window = []
        for i in picks:
            if i not in seen:
                seen.add(i)
                window.append(unlocked[i])
        cases = window
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
        if case_role not in (role, "any"):
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
        patient=CasePatientInfo(
            name=case["patient"]["name"],
            age=int(case["patient"].get("age", 30)),
            presenting_complaint=case["patient"].get("presenting_complaint", ""),
        ),
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
    patient_prompt = PATIENT_SYSTEM.format(case_json=json.dumps(case, indent=2))
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    # Input filter — prevents prompt injection via the case chat interface
    last_msg = next((m.content for m in reversed(body.messages) if m.role == "user"), "")
    try:
        guard = await filter_input(last_msg)
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
                max_tokens=3072,
                feature="case",
                model=MODEL,
                thinking_level="LOW",
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

    return StreamingResponse(sse_stream(), media_type="text/event-stream")


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
        "content": f"Diagnosis: {body.diagnosis}\nManagement Plan: {body.management_plan}",
    })

    # evaluate_case makes a blocking Gemini grading call — off the event loop.
    raw_result = await asyncio.to_thread(evaluate_case, case, messages, student_id, body.performed_steps)

    await log_session(
        student_id=student_id,
        topic=f"Case: {case['title']}",
        messages=messages,
        token_count=0,
        model="mock" if MOCK_MODE else MODEL,
    )

    # No card generation — flashcards are served from the pre-authored static pool.
    cards: list = []

    # Update profile: retention score = total_score / 40
    try:
        from tools.profile.update_profile import update_profile
        retention_score = raw_result.get("total_score", 0) / 40
        missed = []
        for domain in ("history_feedback", "investigations_feedback", "diagnosis_feedback", "management_feedback"):
            feedback = raw_result.get(domain, "")
            if feedback and any(word in feedback.lower() for word in ("miss", "forgot", "lack", "no mention")):
                missed.append(f"{domain.replace('_feedback', '')} gap in {case['topic']}")
        await update_profile(
            student_id,
            topic=case["topic"],
            score=retention_score,
            new_missed_findings=missed,
        )
    except Exception:
        pass

    # Log case completion for difficulty progression tracking
    total = raw_result.get("total_score", 0)
    passed = total >= 24
    try:
        await log_case_completion(student_id, case_id, total, passed)
    except Exception:
        pass

    # Generate structured debrief
    debrief_text: str | None = None
    try:
        from tools.api.shared import _student_context_block
        _debrief_ctx = await _student_context_block(student_id)
        debrief_prompt = (
            (_debrief_ctx + "\n\n" if _debrief_ctx else "")
            + "You are an ophthalmology clinical educator reviewing a student's case performance. "
            "Tailor your debrief to the student's role and known weak areas listed above. "
            "Write a structured debrief in exactly this format:\n\n"
            "**What you got right:** ...\n\n"
            "**What you missed:** ...\n\n"
            "**Why it matters clinically:** ...\n\n"
            "**Focus for next time:** ...\n\n"
            "Be specific and clinical. Reference the student's role-specific procedures where relevant. "
            "Do not repeat the scores — focus on insight."
        )
        debrief_messages = [
            {
                "role": "user",
                "content": (
                    f"Case: {case['title']}\n"
                    f"Diagnosis submitted: {body.diagnosis}\n"
                    f"Management submitted: {body.management_plan}\n"
                    f"Score: {raw_result.get('total_score', 0)}/40\n"
                    f"Overall feedback: {raw_result.get('overall_feedback', '')}"
                ),
            }
        ]
        debrief_text = await asyncio.to_thread(
            ask,
            system_prompt=debrief_prompt,
            messages=debrief_messages,
            max_tokens=4096,
            feature="debrief",
            model=MODEL,
            thinking_level="MEDIUM",
        )
    except Exception:
        debrief_text = None

    # Build checklist step comparison
    checklist_comparison: list[ChecklistStepResult] = []
    try:
        from tools.kb.search import get_checklist_by_name as _get_cl_for_compare
        procedure_name = case.get("checklist_procedure") or case.get("topic", "")
        cl_data = _get_cl_for_compare(procedure_name)
        if cl_data:
            raw_steps = cl_data.get("steps") or {}
            steps_list = raw_steps.get("steps", []) if isinstance(raw_steps, dict) else []
            performed_set = set(body.performed_steps)
            missed_critical_actions: list[str] = []

            for s in steps_list:
                step_num = int(s.get("step_number", 0))
                performed = step_num in performed_set
                critical = bool(s.get("critical", False))
                if not performed and critical:
                    missed_critical_actions.append(str(s.get("action", "")))
                checklist_comparison.append(ChecklistStepResult(
                    step_number=step_num,
                    action=str(s.get("action", "")),
                    critical=critical,
                    performed=performed,
                ))

            # Generate one-sentence clinical notes for missed critical steps
            if missed_critical_actions:
                note_prompt = (
                    "You are a clinical educator for ophthalmology allied health students. "
                    "For each procedure step listed below, write exactly one sentence explaining "
                    "WHY that step matters clinically — the consequence of skipping it. "
                    "Return a JSON array of strings, one string per step, in the same order."
                )
                note_messages = [{
                    "role": "user",
                    "content": "Steps:\n" + "\n".join(f"- {a}" for a in missed_critical_actions),
                }]
                try:
                    note_response = await asyncio.to_thread(
                        ask,
                        system_prompt=note_prompt,
                        messages=note_messages,
                        max_tokens=512,
                        feature="checklist_notes",
                    )
                    import json as _cj
                    raw_notes = note_response.strip()
                    if raw_notes.startswith("```"):
                        raw_notes = raw_notes.split("```")[1]
                        if raw_notes.startswith("json"):
                            raw_notes = raw_notes[4:]
                    notes = _cj.loads(raw_notes)
                    if isinstance(notes, list):
                        note_idx = 0
                        for step_result in checklist_comparison:
                            if not step_result.performed and step_result.critical:
                                if note_idx < len(notes):
                                    step_result.clinical_note = str(notes[note_idx])
                                    note_idx += 1
                except Exception:
                    pass
    except Exception:
        pass

    domain_fields = {k: raw_result.get(k, 0) for k in DomainScore.model_fields}
    return CaseSubmitResponse(
        result=DomainScore(**domain_fields),
        cards=[Flashcard(**c) for c in cards],
        mock_mode=MOCK_MODE,
        debrief=debrief_text,
        checklist_comparison=checklist_comparison,
    )
