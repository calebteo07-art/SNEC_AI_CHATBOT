#!/usr/bin/env python3
"""FastAPI backend for the EyeQ web frontend.

Bridges the React frontend to the existing tools (claude_client, onboarding,
log_session, generate_cards). Automatically runs in MOCK MODE when
ANTHROPIC_API_KEY is not set in .env — the full frontend flow works without
an API key.

Run:
    uvicorn tools.api.server:app --reload --port 8000
"""

import json
import os
import sys
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared.gemini_client import ask, stream_ask, MOCK_MODE, MODEL
from tools.shared.identity import get_or_create_student, has_consented, record_consent
from tools.chatbot.log_session import log_session
from tools.flashcards.generate_cards import generate_and_return_cards
from tools.cases.load_case import load_case, list_available_cases
from tools.cases.evaluate_response import evaluate_case
from tools.profile.get_profile import get_profile
from tools.profile.update_profile import update_profile
from tools.profile.summarize_gaps import summarize_gaps
from tools.supervisor.cohort_summary import cohort_summary as _cohort_summary
from tools.supervisor.at_risk import get_at_risk as _get_at_risk
from tools.image_quiz.evaluate_description import evaluate_description
from tools.image_quiz.log_result import log_image_result

PATIENT_SYSTEM = """You are playing the role of a patient in a clinical case simulation for ophthalmic professionals.

IMPORTANT RULES:
- Answer ONLY what the student directly asks. Do not volunteer extra information.
- Stay in character as the patient — use lay language, not medical terminology.
- If the student asks for examination findings or investigation results, provide them as an examiner would.
- If the student asks to examine you, describe findings from the case.
- When the student says they are ready to give a diagnosis or management plan, acknowledge it.
- Do NOT reveal the diagnosis or correct answers — wait for the student to conclude.

Case details for your reference (do not reveal unless asked):
{case_json}"""

IMAGES_DIR = PROJECT_ROOT / "images"

# ── Knowledge base: RAG (Supabase) with markdown fallback ─────────────────
from tools.kb.search import search as _rag_search, format_context as _rag_format

_RAG_ENABLED = bool(os.getenv("SUPABASE_URL", "").strip())
_KB_PATH = PROJECT_ROOT / "workflows" / "ophthalmology_kb.md"
_KB_CACHE: Optional[str] = None


def _kb_fallback() -> str:
    global _KB_CACHE
    if _KB_CACHE is None and _KB_PATH.exists():
        _KB_CACHE = _KB_PATH.read_text(encoding="utf-8")
    return _KB_CACHE or ""


def _get_context(query: str) -> str:
    """Return RAG context if Supabase is ready, else fall back to full markdown KB."""
    if _RAG_ENABLED:
        try:
            chunks = _rag_search(query, top_k=6)
            if chunks:
                print(f"[rag] retrieved {len(chunks)} chunks for query: {query[:60]!r}", flush=True)
                return _rag_format(chunks)
        except Exception as exc:
            print(f"[rag-error] {exc}", flush=True)
    return _kb_fallback()


TUTOR_SYSTEM = """You are EyeQ, an expert ophthalmology tutor at SNEC (Singapore National Eye Centre). \
You teach through Socratic dialogue — your job is to guide students to discover answers, not hand them out.

TEACHING APPROACH:
- Respond directly to what the student actually said or asked. Never give a lecture when a nudge will do.
- Use probing questions and cues to make the student reason through the answer themselves.
- When they get something right, affirm it briefly then push deeper with a follow-up question.
- When they are wrong or vague, ask what led them to that thinking rather than correcting outright.
- When they are genuinely stuck, give a targeted hint — not the full answer.
- Keep responses conversational and focused. Two to four sentences, then a question back to the student.
- Vary your style: sometimes challenge, sometimes encourage, sometimes reframe. Sound like a person.

HARD RULES:
- Never use labelled sections or structured formatting. No "Explanation:", "Mechanism:", "Clinical Pearl:" headers.
- Never bullet-point a full answer. Write in flowing sentences.
- Never end a response without either a question or a challenge for the student.
- Do not repeat information the student already stated correctly back to them verbatim.
- Avoid phrases like "Great question!" or "Certainly!" — get straight to the teaching.

The ophthalmology knowledge base below is your reference. Draw on it naturally, not exhaustively.
"""


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="EyeQ API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_supervisor(x_supervisor_id: str = Header(..., alias="X-Supervisor-ID")):
    """FastAPI dependency — verifies the caller is a registered supervisor."""
    from tools.shared.gsheets import get_rows as _get_rows
    try:
        rows = _get_rows("snec_supervisors", filters={"student_id": x_supervisor_id})
    except Exception:
        raise HTTPException(status_code=503, detail="Could not verify supervisor access")
    if not rows:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return x_supervisor_id


# ── Request / Response models ──────────────────────────────────────────────

class OnboardRequest(BaseModel):
    full_name: str
    email: str

class OnboardResponse(BaseModel):
    student_id: str
    mock_mode: bool
    role: str = "student"

class ChatMessage(BaseModel):
    role: str
    content: str = Field(max_length=8000)

class ChatRequest(BaseModel):
    student_id: str
    messages: list[ChatMessage] = Field(max_length=100)

class ChatResponse(BaseModel):
    content: str

class EndSessionRequest(BaseModel):
    student_id: str
    messages: list[ChatMessage] = Field(max_length=100)
    topic: str = "Ophthalmology"
    token_count: int = 0

class Flashcard(BaseModel):
    card_id: str
    front: str
    back: str
    topic_tag: str

class EndSessionResponse(BaseModel):
    session_id: str
    cards: list[Flashcard]
    mock_mode: bool


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.post("/api/onboard", response_model=OnboardResponse)
def onboard(body: OnboardRequest):
    if not body.full_name.strip() or not body.email.strip():
        raise HTTPException(status_code=400, detail="full_name and email are required")

    email = body.email.strip().lower()
    student_id = get_or_create_student(body.full_name.strip(), email)
    if not has_consented(student_id):
        record_consent(student_id)

    # Check if this email belongs to a supervisor
    role = "student"
    try:
        from tools.shared.gsheets import get_rows as _get_rows
        supervisors = _get_rows("snec_supervisors", filters={"email": email})
        if supervisors:
            role = "supervisor"
    except Exception:
        pass

    return OnboardResponse(student_id=student_id, mock_mode=MOCK_MODE, role=role)


@app.post("/api/chat")
@limiter.limit("30/minute")
def chat(request: Request, body: ChatRequest):
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    last_user_msg = next(
        (m.content for m in reversed(body.messages) if m.role == "user"), ""
    )
    system_prompt = TUTOR_SYSTEM + "\n\n---\n\n" + _get_context(last_user_msg)
    try:
        profile = get_profile(body.student_id)
        gap_context = summarize_gaps(profile)
        if gap_context:
            system_prompt = f"## Student Weak Areas (steer toward these)\n{gap_context}\n\n{system_prompt}"
    except Exception:
        pass

    def sse_stream():
        try:
            for chunk in stream_ask(
                system_prompt=system_prompt,
                messages=messages,
                max_tokens=2048,
                feature="chatbot",
                model=MODEL,
            ):
                yield f"data: {json.dumps({'text': chunk})}\n\n"
        except RuntimeError as exc:
            if "quota_exceeded" in str(exc):
                yield f"data: {json.dumps({'text': 'API quota reached for today — the service resets at midnight. In the meantime, the tutor is running in practice mode.', 'quota_exceeded': True})}\n\n"
            else:
                yield f"data: {json.dumps({'text': 'I\'m having trouble reaching the service right now — please try again in a moment.'})}\n\n"
        except Exception as _exc:
            import traceback; traceback.print_exc()
            print(f"[chat-error] {type(_exc).__name__}: {_exc}", flush=True)
            yield f"data: {json.dumps({'text': 'I\'m having trouble reaching the service right now — please try again in a moment.'})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(sse_stream(), media_type="text/event-stream")


@app.post("/api/end-session", response_model=EndSessionResponse)
@limiter.limit("10/minute")
def end_session(request: Request, body: EndSessionRequest):
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    model_name = "mock" if MOCK_MODE else MODEL

    session_id = log_session(
        student_id=body.student_id,
        topic=body.topic,
        messages=messages,
        token_count=body.token_count,
        model=model_name,
    )

    try:
        cards = generate_and_return_cards(
            student_id=body.student_id,
            session_id=session_id,
            messages=messages,
        )
    except RuntimeError as exc:
        if "quota_exceeded" in str(exc):
            cards = []
        else:
            raise

    try:
        update_profile(body.student_id)
    except Exception:
        pass

    return EndSessionResponse(
        session_id=session_id,
        cards=[Flashcard(**c) for c in cards],
        mock_mode=MOCK_MODE,
    )


@app.get("/health")
def health():
    return {"status": "ok", "mock_mode": MOCK_MODE}

@app.get("/api/status")
def status():
    return {"status": "ok", "mock_mode": MOCK_MODE}


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

class CasesResponse(BaseModel):
    cases: list[CaseInfo]

class CaseChatRequest(BaseModel):
    student_id: str
    messages: list[ChatMessage] = Field(max_length=100)

class CaseChatResponse(BaseModel):
    response: str

class CaseSubmitRequest(BaseModel):
    student_id: str
    messages: list[ChatMessage] = Field(max_length=100)
    diagnosis: str
    management_plan: str

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

class CaseSubmitResponse(BaseModel):
    result: DomainScore
    cards: list[Flashcard]
    mock_mode: bool
    debrief: str | None = None


# ── Case endpoints ─────────────────────────────────────────────────────────

@app.get("/api/cases", response_model=CasesResponse)
def get_cases():
    cases = []
    for case_id in list_available_cases():
        try:
            c = load_case(case_id)
            cases.append(CaseInfo(
                case_id=c["case_id"],
                title=c["title"],
                difficulty=c["difficulty"],
                topic=c["topic"],
                estimated_minutes=c["estimated_minutes"],
                patient=CasePatientInfo(
                    name=c["patient"]["name"],
                    age=c["patient"]["age"],
                    presenting_complaint=c["patient"]["presenting_complaint"],
                ),
            ))
        except Exception:
            pass
    return CasesResponse(cases=cases)


@app.post("/api/cases/{case_id}/chat")
@limiter.limit("30/minute")
def case_chat(case_id: str, request: Request, body: CaseChatRequest):
    try:
        case = load_case(case_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid case ID")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")

    patient_prompt = PATIENT_SYSTEM.format(case_json=json.dumps(case, indent=2))
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    def sse_stream():
        try:
            for chunk in stream_ask(
                system_prompt=patient_prompt,
                messages=messages,
                max_tokens=2048,
                feature="case",
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


@app.post("/api/cases/{case_id}/submit", response_model=CaseSubmitResponse)
def case_submit(case_id: str, body: CaseSubmitRequest):
    try:
        case = load_case(case_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid case ID")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found")

    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    messages.append({
        "role": "user",
        "content": f"Diagnosis: {body.diagnosis}\nManagement Plan: {body.management_plan}",
    })

    raw_result = evaluate_case(case, messages, body.student_id)

    session_id = log_session(
        student_id=body.student_id,
        topic=f"Case: {case['title']}",
        messages=messages,
        token_count=0,
        model="mock" if MOCK_MODE else MODEL,
    )
    cards = generate_and_return_cards(
        student_id=body.student_id,
        session_id=session_id,
        messages=messages,
    )

    # Update profile: retention score = total_score / 40
    try:
        retention_score = raw_result.get("total_score", 0) / 40
        missed = []
        for domain in ("history_feedback", "investigations_feedback", "diagnosis_feedback", "management_feedback"):
            feedback = raw_result.get(domain, "")
            if feedback and any(word in feedback.lower() for word in ("miss", "forgot", "lack", "no mention")):
                missed.append(f"{domain.replace('_feedback', '')} gap in {case['topic']}")
        update_profile(
            body.student_id,
            topic=case["topic"],
            score=retention_score,
            new_missed_findings=missed,
        )
    except Exception:
        pass

    # Generate structured debrief
    debrief_text: str | None = None
    try:
        debrief_prompt = (
            "You are an ophthalmology clinical educator reviewing a student's case performance. "
            "Write a structured debrief in exactly this format:\n\n"
            "**What you got right:** ...\n\n"
            "**What you missed:** ...\n\n"
            "**Why it matters clinically:** ...\n\n"
            "**Focus for next time:** ...\n\n"
            "Be specific and clinical. Do not repeat the scores — focus on insight."
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
        debrief_text = ask(
            system_prompt=debrief_prompt,
            messages=debrief_messages,
            max_tokens=2048,
            feature="debrief",
        )
    except Exception:
        debrief_text = None

    return CaseSubmitResponse(
        result=DomainScore(**{k: raw_result[k] for k in DomainScore.model_fields}),
        cards=[Flashcard(**c) for c in cards],
        mock_mode=MOCK_MODE,
        debrief=debrief_text,
    )


# ── Check-in models ────────────────────────────────────────────────────────

class CheckinStatusResponse(BaseModel):
    checkin_done_today: bool
    streak: int
    weak_topic: str | None

class CheckinQuestionResponse(BaseModel):
    question: str
    topic: str

class CheckinAnswerRequest(BaseModel):
    student_id: str
    question: str
    answer: str
    topic: str

class CheckinAnswerResponse(BaseModel):
    correct: bool
    feedback: str


# ── Supervisor models ──────────────────────────────────────────────────────

class CohortSummaryResponse(BaseModel):
    total: int
    active_this_week: int
    inactive_7_plus_days: list[dict]
    weakest_topics: list[str]
    at_risk_count: int

class AtRiskResponse(BaseModel):
    students: list[dict]

class StudentProfileResponse(BaseModel):
    student_id: str
    weak_topics: list[str]
    missed_findings: list[str]
    retention_scores: dict
    session_count: int
    streak: int
    last_active: str
    learning_velocity: str
    checkin_done_today: bool


# ── Check-in endpoints ─────────────────────────────────────────────────────

@app.get("/api/checkin/status", response_model=CheckinStatusResponse)
def checkin_status(student_id: str):
    try:
        profile = get_profile(student_id)
    except Exception:
        return CheckinStatusResponse(checkin_done_today=True, streak=0, weak_topic=None)

    done = str(profile.get("checkin_done_today", "false")).lower() == "true"
    streak = int(profile.get("streak", "0") or "0")
    try:
        import json as _json
        weak = _json.loads(profile.get("weak_topics", "[]") or "[]")
        weak_topic = weak[0] if weak else None
    except Exception:
        weak_topic = None

    return CheckinStatusResponse(
        checkin_done_today=done,
        streak=streak,
        weak_topic=weak_topic,
    )


@app.get("/api/checkin/question", response_model=CheckinQuestionResponse)
@limiter.limit("10/minute")
def checkin_question(request: Request, student_id: str):
    try:
        profile = get_profile(student_id)
        import json as _json
        weak = _json.loads(profile.get("weak_topics", "[]") or "[]")
        topic = weak[0] if weak else "Ophthalmology"
    except Exception:
        topic = "Ophthalmology"

    system = (
        "You are an ophthalmology tutor running a 60-second warm-up check-in. "
        "Generate ONE concise clinical question targeting the given topic. "
        "Return only the question text — no preamble, no numbering."
    )
    try:
        question = ask(
            system_prompt=system,
            messages=[{"role": "user", "content": f"Topic: {topic}"}],
            max_tokens=2048,
            feature="checkin",
        )
    except RuntimeError as exc:
        if "quota_exceeded" in str(exc):
            raise HTTPException(status_code=503, detail="quota_exceeded")
        raise
    return CheckinQuestionResponse(question=question.strip(), topic=topic)


@app.post("/api/checkin/answer", response_model=CheckinAnswerResponse)
@limiter.limit("10/minute")
def checkin_answer(request: Request, body: CheckinAnswerRequest):
    system = (
        "You are an ophthalmology tutor evaluating a warm-up answer. "
        "Return ONLY valid JSON with no other text:\n"
        '{"correct": true or false, "feedback": "<one sentence confirming or correcting the answer, and one line on why it matters clinically>"}'
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
            max_tokens=2048,
            feature="checkin",
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
        correct = bool(parsed.get("correct", False))
        feedback = str(parsed.get("feedback", raw.strip()))
    except Exception:
        correct = "true" in raw.lower().split("correct:")[-1][:10]
        feedback_parts = raw.split("FEEDBACK:")
        feedback = feedback_parts[-1].strip() if len(feedback_parts) > 1 else raw.strip()

    try:
        update_profile(body.student_id, checkin_done=True)
    except Exception:
        pass

    return CheckinAnswerResponse(correct=correct, feedback=feedback)


# ── Supervisor endpoints ───────────────────────────────────────────────────

@app.get("/api/supervisor/cohort", response_model=CohortSummaryResponse)
def supervisor_cohort(_: str = Depends(_require_supervisor)):
    try:
        result = _cohort_summary()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch cohort data")
    return CohortSummaryResponse(**result)


@app.get("/api/supervisor/at-risk", response_model=AtRiskResponse)
def supervisor_at_risk(_: str = Depends(_require_supervisor)):
    try:
        students = _get_at_risk()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch at-risk data")
    return AtRiskResponse(students=students)


@app.get("/api/supervisor/student/{student_id}", response_model=StudentProfileResponse)
def supervisor_student(student_id: str, _: str = Depends(_require_supervisor)):
    import json as _json
    try:
        profile = get_profile(student_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Student not found")

    try:
        return StudentProfileResponse(
            student_id=profile["student_id"],
            weak_topics=_json.loads(profile.get("weak_topics", "[]") or "[]"),
            missed_findings=_json.loads(profile.get("missed_findings", "[]") or "[]"),
            retention_scores=_json.loads(profile.get("retention_scores", "{}") or "{}"),
            session_count=int(profile.get("session_count", "0") or "0"),
            streak=int(profile.get("streak", "0") or "0"),
            last_active=profile.get("last_active", ""),
            learning_velocity=profile.get("learning_velocity", "stable"),
            checkin_done_today=str(profile.get("checkin_done_today", "false")).lower() == "true",
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")


# ── Flashcard AI check ─────────────────────────────────────────────────────

class FlashcardCheckRequest(BaseModel):
    student_id: str
    question: str
    student_answer: str
    correct_answer: str

class FlashcardCheckResponse(BaseModel):
    feedback: str
    score: int
    mock_mode: bool

@app.post("/api/flashcards/check", response_model=FlashcardCheckResponse)
@limiter.limit("10/minute")
def flashcard_check(request: Request, body: FlashcardCheckRequest):
    system = (
        "You are an ophthalmology tutor evaluating a student's active recall attempt. "
        "Compare the student's answer to the correct answer. "
        "Return ONLY valid JSON with no other text:\n"
        '{"score": <0-10>, "feedback": "<2 concise sentences: what they got right, then what they missed or got wrong>"}'
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
            max_tokens=2048,
            feature="flashcard",
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
        return FlashcardCheckResponse(
            feedback=parsed.get("feedback", raw[:300]),
            score=int(parsed.get("score", 5)),
            mock_mode=MOCK_MODE,
        )
    except Exception:
        return FlashcardCheckResponse(feedback=raw[:300], score=5, mock_mode=MOCK_MODE)


# ── Study suggestion ───────────────────────────────────────────────────────

class StudySuggestionResponse(BaseModel):
    suggestion: str
    focus_topic: str | None = None

@app.get("/api/study-suggestion", response_model=StudySuggestionResponse)
@limiter.limit("10/minute")
def study_suggestion(request: Request, student_id: str):
    import json as _json
    focus: str | None = None
    try:
        profile = get_profile(student_id)
        weak = _json.loads(profile.get("weak_topics", "[]") or "[]")
        streak = int(profile.get("streak", "0") or "0")
        session_count = int(profile.get("session_count", "0") or "0")
        velocity = profile.get("learning_velocity", "stable")
        focus = weak[0] if weak else None
        context = (
            f"Weak topics: {', '.join(weak) if weak else 'none identified yet'}\n"
            f"Study streak: {streak} days\n"
            f"Total sessions: {session_count}\n"
            f"Learning velocity: {velocity}"
        )
    except Exception:
        context = "New student — no profile data yet."

    system = (
        "You are an ophthalmology study coach. "
        "Give the student one specific, clinical, motivating sentence telling them exactly what to study today and why. "
        "Under 30 words. No preamble."
    )
    try:
        suggestion = ask(
            system_prompt=system,
            messages=[{"role": "user", "content": context}],
            max_tokens=2048,
            feature="suggestion",
        )
    except RuntimeError as exc:
        if "quota_exceeded" in str(exc):
            raise HTTPException(status_code=503, detail="quota_exceeded")
        raise
    return StudySuggestionResponse(suggestion=suggestion.strip(), focus_topic=focus)


# ── Supervisor AI insights ─────────────────────────────────────────────────

class SupervisorInsightsResponse(BaseModel):
    narrative: str

@app.get("/api/supervisor/insights", response_model=SupervisorInsightsResponse)
@limiter.limit("10/minute")
def supervisor_insights(request: Request, _: str = Depends(_require_supervisor)):
    try:
        cohort = _cohort_summary()
        at_risk = _get_at_risk()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch cohort insights")

    context = (
        f"Cohort size: {cohort.get('total', 0)} students\n"
        f"Active this week: {cohort.get('active_this_week', 0)}\n"
        f"At-risk count: {cohort.get('at_risk_count', 0)}\n"
        f"Weakest topics: {', '.join(cohort.get('weakest_topics', [])) or 'none recorded'}\n"
        f"At-risk students: {len(at_risk)}"
    )
    system = (
        "You are an AI assistant for an ophthalmology education supervisor. "
        "Write 2-3 sentences summarising the cohort's current state and the single most important action the supervisor should take today. "
        "Be specific and direct. No preamble."
    )
    try:
        narrative = ask(
            system_prompt=system,
            messages=[{"role": "user", "content": context}],
            max_tokens=2048,
            feature="supervisor",
        )
    except RuntimeError as exc:
        if "quota_exceeded" in str(exc):
            raise HTTPException(status_code=503, detail="quota_exceeded")
        raise
    return SupervisorInsightsResponse(narrative=narrative.strip())


# ── Image quiz helpers ─────────────────────────────────────────────────────

def _load_image_meta(image_id: str) -> tuple[dict, Path]:
    """Return (meta_dict, png_path) for the given image_id, or raise 404."""
    for json_path in IMAGES_DIR.glob("*.json"):
        try:
            meta = json.loads(json_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if meta.get("image_id") == image_id:
            png_path = IMAGES_DIR / meta["filename"]
            return meta, png_path
    raise HTTPException(status_code=404, detail=f"Image '{image_id}' not found")


def _list_images() -> list[dict]:
    if not IMAGES_DIR.exists():
        return []
    result = []
    for json_path in sorted(IMAGES_DIR.glob("*.json")):
        try:
            meta = json.loads(json_path.read_text(encoding="utf-8"))
            result.append(meta)
        except Exception:
            pass
    return result


# ── Image quiz models ──────────────────────────────────────────────────────

class ImageInfo(BaseModel):
    image_id: str
    modality: str
    eye: str
    difficulty: str
    topic: str

class ImagesResponse(BaseModel):
    images: list[ImageInfo]

class ImageSubmitRequest(BaseModel):
    student_id: str
    description: str

class ImageSubmitResponse(BaseModel):
    score: int
    correct_findings: list[str]
    missed_findings: list[str]
    incorrect_findings: list[str]
    diagnosis_correct: bool
    feedback: str
    mock_mode: bool


# ── Image quiz endpoints ───────────────────────────────────────────────────

@app.get("/api/images", response_model=ImagesResponse)
def get_images():
    images = [
        ImageInfo(
            image_id=m["image_id"],
            modality=m.get("modality", ""),
            eye=m.get("eye", ""),
            difficulty=m.get("difficulty", "intermediate"),
            topic=m.get("topic", ""),
        )
        for m in _list_images()
    ]
    return ImagesResponse(images=images)


@app.get("/api/images/{image_id}/file")
def get_image_file(image_id: str):
    meta, png_path = _load_image_meta(image_id)
    if not png_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
    return FileResponse(str(png_path), media_type="image/png")


@app.post("/api/images/{image_id}/submit", response_model=ImageSubmitResponse)
def image_submit(image_id: str, body: ImageSubmitRequest):
    meta, png_path = _load_image_meta(image_id)

    image_path = png_path if png_path.exists() else None
    result = evaluate_description(meta, body.description, image_path)

    result["_raw_description"] = body.description
    try:
        log_image_result(body.student_id, meta, result)
    except Exception:
        pass

    try:
        score_normalised = result.get("score", 0) / 10
        update_profile(
            body.student_id,
            topic=meta.get("topic", "image_quiz"),
            score=score_normalised,
            new_missed_findings=result.get("missed_findings", []),
        )
    except Exception:
        pass

    return ImageSubmitResponse(
        score=int(result.get("score", 0)),
        correct_findings=result.get("correct_findings", []),
        missed_findings=result.get("missed_findings", []),
        incorrect_findings=result.get("incorrect_findings", []),
        diagnosis_correct=bool(result.get("diagnosis_correct", False)),
        feedback=result.get("feedback", ""),
        mock_mode=MOCK_MODE,
    )


# Serve built React frontend — must be last so API routes take priority
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="static")
