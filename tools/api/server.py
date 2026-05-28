#!/usr/bin/env python3
"""FastAPI backend for the EyeBot web frontend.

Bridges the React frontend to the existing tools (gemini_client, onboarding,
log_session, generate_cards). Automatically runs in MOCK MODE when
GEMINI_API_KEY is not set in .env — the full frontend flow works without
an API key.

Run:
    uvicorn tools.api.server:app --reload --port 8000
"""

import json
import os
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request
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
from tools.shared.auth import hash_password, verify_password, generate_password
from tools.shared.jwt_utils import (
    create_access_token,
    get_current_user,
    require_supervisor,
    CurrentUser,
)
from tools.shared.otp_store import set_otp, verify_and_consume_otp
from tools.shared.gsheets import get_rows, append_row, update_row
from tools.chatbot.log_session import log_session
from tools.flashcards.generate_cards import generate_and_return_cards
from tools.profile.get_profile import get_profile
from tools.profile.update_profile import update_profile
from tools.profile.summarize_gaps import summarize_gaps
from tools.supervisor.cohort_summary import cohort_summary as _cohort_summary
from tools.supervisor.at_risk import get_at_risk as _get_at_risk
from tools.supervisor.cohort_benchmarks import get_cohort_benchmarks as _get_benchmarks
from tools.supervisor.generate_report import generate_student_report as _generate_report
from tools.supervisor.weekly_digest import send_weekly_digest as _send_digest
from tools.flashcards.generate_cards import generate_cards_from_rag as _gen_cards_rag
from tools.progress.get_progress import get_progress as _get_progress
from tools.api.routers.auth import router as auth_router
from tools.api.routers.cases import router as cases_router
from tools.api.routers.admin import router as admin_router
from tools.api.shared import _case_cache

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


_TUTOR_BASE = """You are EyeBot, an expert ophthalmology tutor at SNEC (Singapore National Eye Centre). \
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

_ROLE_TUTOR_CONTEXT = {
    "OA": (
        "STUDENT ROLE: Ophthalmic Auxiliary (OA). "
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

TUTOR_SYSTEM = _TUTOR_BASE


def _tutor_system(role: str) -> str:
    """Return TUTOR_SYSTEM enriched with the student's role context."""
    role_line = _ROLE_TUTOR_CONTEXT.get(role.upper(), "")
    if role_line:
        return _TUTOR_BASE + f"\n{role_line}\n"
    return _TUTOR_BASE


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="EyeBot API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(auth_router)
app.include_router(cases_router)
app.include_router(admin_router)



def _student_context_block(student_id: str) -> str:
    """Build a rich student profile block for injection into AI system prompts."""
    import json as _json
    _ROLE_NAMES = {
        "OA": "Ophthalmic Auxiliary",
        "OT": "Ophthalmic Technician",
        "PSA": "Patient Service Associate",
    }
    try:
        profile = get_profile(student_id)
    except Exception:
        return ""

    role = profile.get("role", "").upper()
    role_desc = _ROLE_NAMES.get(role, role)
    session_count = int(profile.get("session_count", "0") or "0")
    streak = int(profile.get("streak", "0") or "0")
    velocity = profile.get("learning_velocity", "stable")

    try:
        scores = _json.loads(profile.get("retention_scores", "{}") or "{}")
        weak = _json.loads(profile.get("weak_topics", "[]") or "[]")
        findings = _json.loads(profile.get("missed_findings", "[]") or "[]")
    except Exception:
        scores, weak, findings = {}, [], []

    lines = ["## Student Profile (use to personalise your response)"]
    if role_desc:
        lines.append(f"Role: {role} — {role_desc}")
    lines.append(f"Study streak: {streak} days · Sessions completed: {session_count} · Momentum: {velocity}")

    if weak:
        topic_parts = []
        for t in weak[:3]:
            sc = scores.get(t)
            topic_parts.append(f"{t} ({sc:.0%})" if sc is not None else t)
        lines.append(f"Weak topics: {', '.join(topic_parts)}")

    if findings:
        lines.append(f"Consistently misses: {', '.join(findings[:3])}")

    if not weak and not findings:
        lines.append("No weak areas identified yet — apply general best practice for their role.")

    return "\n".join(lines)


# ── Request / Response models ──────────────────────────────────────────────

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


@app.post("/api/chat")
@limiter.limit("30/minute")
def chat(request: Request, body: ChatRequest, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    last_user_msg = next(
        (m.content for m in reversed(body.messages) if m.role == "user"), ""
    )
    try:
        profile = get_profile(student_id)
        role = profile.get("role", "")
    except Exception:
        profile = {}
        role = ""

    ctx_block = _student_context_block(student_id)
    system_prompt = _tutor_system(role) + "\n\n---\n\n" + _get_context(last_user_msg)
    if ctx_block:
        system_prompt = ctx_block + "\n\n" + system_prompt

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
def end_session(request: Request, body: EndSessionRequest, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    model_name = "mock" if MOCK_MODE else MODEL

    session_id = log_session(
        student_id=student_id,
        topic=body.topic,
        messages=messages,
        token_count=body.token_count,
        model=model_name,
    )

    try:
        _role = get_profile(student_id).get("role", "")
    except Exception:
        _role = ""
    try:
        cards = generate_and_return_cards(
            student_id=student_id,
            session_id=session_id,
            messages=messages,
            role=_role,
        )
    except RuntimeError as exc:
        if "quota_exceeded" in str(exc):
            cards = []
        else:
            raise

    try:
        update_profile(student_id)
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


@app.get("/api/progress")
@limiter.limit("30/minute")
async def get_my_progress(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    """Return the calling student's own progress data (JWT-authenticated, no path param)."""
    student_id = current_user["sub"]
    try:
        return _get_progress(student_id)
    except Exception as exc:
        print(f"[progress-error] {exc}", flush=True)
        raise HTTPException(status_code=500, detail="Could not load progress data")


@app.get("/api/progress/{student_id}")
def get_student_progress(student_id: str, current_user: CurrentUser = Depends(get_current_user)):
    """Return topic performance, session history, and learning stats for a student."""
    # Students can only view their own progress; supervisors/admins can view anyone's
    if current_user["role"] == "student" and student_id != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        return _get_progress(student_id)
    except Exception as exc:
        print(f"[progress-error] {exc}", flush=True)
        raise HTTPException(status_code=500, detail="Could not load progress data")



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
    supervisor_note: str = ""

class SaveNoteRequest(BaseModel):
    note: str

class BenchmarkTopic(BaseModel):
    topic: str
    avg_score: float
    student_count: int

class BenchmarkResponse(BaseModel):
    topics: list[BenchmarkTopic]


# ── Check-in endpoints ─────────────────────────────────────────────────────

@app.get("/api/checkin/status", response_model=CheckinStatusResponse)
def checkin_status(current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
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


_CHECKIN_TOPIC_POOL: dict[str, list[str]] = {
    "OA": [
        "IOP measurement technique", "Goldmann tonometry", "non-contact tonometry",
        "pupil dilation procedure", "dilating drops and contraindications",
        "visual acuity testing", "Snellen chart technique", "pinhole test",
        "patient history taking", "chief complaint documentation",
        "pre-operative checklist", "post-operative instructions",
        "anterior chamber assessment", "confrontation visual field test",
        "colour vision testing", "Amsler grid", "cover-uncover test",
        "documentation and EMR entry", "infection control in ophthalmology",
        "patient consent and counselling",
    ],
    "OT": [
        "A-scan biometry", "IOL power calculation", "AL measurement",
        "Humphrey Visual Field interpretation", "glaucoma HVF patterns",
        "OCT retinal nerve fibre layer", "OCT macular scan interpretation",
        "corneal topography and Ks", "specular microscopy ECC",
        "pachymetry and central corneal thickness", "fluorescein angiography",
        "B-scan ultrasonography", "slit-lamp biomicroscopy technique",
        "gonioscopy principles", "contact lens fitting",
        "anterior segment OCT", "refraction and keratometry",
        "retinal imaging and fundus photography", "ERG principles",
        "tear film assessment and TBUT",
    ],
    "PSA": [
        "non-contact tonometry procedure", "LogMAR visual acuity",
        "ETDRS chart", "near visual acuity testing",
        "eye drop instillation technique", "patient fall risk assessment",
        "PFAER documentation", "wheelchair and mobility assistance",
        "queue management and patient flow", "ophthalmic emergency triage",
        "appointment scheduling and referrals", "patient identification protocols",
        "informed consent for imaging", "infection control hand hygiene",
        "handling anxious or visually impaired patients",
        "billing codes for ophthalmic procedures", "pre-visit instructions",
        "post-dilation patient safety", "spectacle dispensing basics",
        "low vision aids overview",
    ],
    "": [
        "anatomy of the anterior segment", "anatomy of the posterior segment",
        "common causes of red eye", "acute angle-closure glaucoma",
        "diabetic retinopathy staging", "age-related macular degeneration",
        "cataract grading and management", "corneal abrasion management",
        "retinal detachment symptoms", "optic nerve assessment",
        "refractive errors overview", "strabismus basics",
        "ocular pharmacology", "fluorescein staining",
        "emergency ocular trauma", "uveitis classification",
    ],
}

_CHECKIN_QUESTION_STYLES = [
    "Ask a concise scenario-based clinical question (2–3 sentences, real patient context).",
    "Ask a direct knowledge question testing recall of a specific concept, value, or procedure step.",
    "Ask a 'what would you do if…' practical decision question.",
    "Ask a question distinguishing normal from abnormal findings.",
    "Ask a question connecting the topic to a patient safety or quality-care consideration.",
    "Ask a step-by-step procedural question ('Describe how you would…').",
]

@app.get("/api/checkin/question", response_model=CheckinQuestionResponse)
@limiter.limit("10/minute")
def checkin_question(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    import json as _json
    try:
        profile = get_profile(student_id)
        weak = _json.loads(profile.get("weak_topics", "[]") or "[]")
        role = profile.get("role", "")
    except Exception:
        weak = []
        role = ""

    role_pool = _CHECKIN_TOPIC_POOL.get(role.upper(), _CHECKIN_TOPIC_POOL[""])
    # Weight weak topics 3× vs the general pool so gaps are targeted but not exclusively
    weighted = list(weak) * 3 + role_pool
    topic = secrets.choice(weighted) if weighted else "Ophthalmology"
    question_style = secrets.choice(_CHECKIN_QUESTION_STYLES)

    role_line = _ROLE_TUTOR_CONTEXT.get(role.upper(), "")
    ctx_block = _student_context_block(student_id)
    system = (
        (ctx_block + "\n\n" if ctx_block else "")
        + "You are an ophthalmology tutor running a 60-second warm-up check-in. "
        + question_style + " "
        + (f"Student role context: {role_line} " if role_line else "")
        + "Calibrate difficulty to the student's experience level and known gaps. "
        "Return only the question text — no preamble, no numbering, no label."
    )
    try:
        question = ask(
            system_prompt=system,
            messages=[{"role": "user", "content": f"Topic: {topic}"}],
            max_tokens=200,
            feature="checkin",
        )
    except RuntimeError as exc:
        if "quota_exceeded" in str(exc):
            raise HTTPException(status_code=503, detail="quota_exceeded")
        raise
    return CheckinQuestionResponse(question=question.strip(), topic=topic)


@app.post("/api/checkin/answer", response_model=CheckinAnswerResponse)
@limiter.limit("10/minute")
def checkin_answer(request: Request, body: CheckinAnswerRequest, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    ctx_block = _student_context_block(student_id)
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
        update_profile(student_id, checkin_done=True)
    except Exception:
        pass

    return CheckinAnswerResponse(correct=correct, feedback=feedback)


# ── Supervisor endpoints ───────────────────────────────────────────────────

@app.get("/api/supervisor/cohort", response_model=CohortSummaryResponse)
def supervisor_cohort(current_user: CurrentUser = Depends(require_supervisor)):
    try:
        result = _cohort_summary()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch cohort data")
    return CohortSummaryResponse(**result)


@app.get("/api/supervisor/at-risk", response_model=AtRiskResponse)
def supervisor_at_risk(current_user: CurrentUser = Depends(require_supervisor)):
    try:
        students = _get_at_risk()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch at-risk data")
    return AtRiskResponse(students=students)


@app.get("/api/supervisor/student/{student_id}", response_model=StudentProfileResponse)
def supervisor_student(student_id: str, current_user: CurrentUser = Depends(require_supervisor)):
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
            supervisor_note=profile.get("supervisor_note", "") or "",
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")


@app.patch("/api/supervisor/student/{student_id}/note")
def supervisor_save_note(
    student_id: str,
    body: SaveNoteRequest,
    current_user: CurrentUser = Depends(require_supervisor),
):
    from tools.shared.gsheets import update_row as _update_row
    try:
        _update_row("snec_profiles", "student_id", student_id, {"supervisor_note": body.note})
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    return {"ok": True}


@app.get("/api/supervisor/student/{student_id}/report")
def supervisor_student_report(student_id: str, current_user: CurrentUser = Depends(require_supervisor)):
    try:
        pdf_bytes = _generate_report(student_id)
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    filename = f"eyebot_student_{student_id[:8]}_report.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/supervisor/benchmarks", response_model=BenchmarkResponse)
def supervisor_benchmarks(current_user: CurrentUser = Depends(require_supervisor)):
    try:
        topics = _get_benchmarks()
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    return BenchmarkResponse(topics=[BenchmarkTopic(**t) for t in topics])


class DigestRequest(BaseModel):
    recipient: str  # supervisor email to send digest to

@app.post("/api/supervisor/send-digest")
def supervisor_send_digest(body: DigestRequest, current_user: CurrentUser = Depends(require_supervisor)):
    try:
        _send_digest(body.recipient)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Operation failed. Please try again.")
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    return {"ok": True, "sent_to": body.recipient}


# ── Profile role update ────────────────────────────────────────────────────

class RoleUpdateRequest(BaseModel):
    role: str  # OA | OT | PSA

@app.patch("/api/profile/role")
def update_role(body: RoleUpdateRequest, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]  # identity from JWT
    role = body.role.strip().upper()
    if role not in ("OA", "OT", "PSA"):
        raise HTTPException(status_code=400, detail="Invalid role. Must be OA, OT, or PSA.")
    try:
        update_profile(student_id, role=role)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Could not update role. Please try again.")
    # Clear cached cases so the next visit to the case list regenerates
    # with role-appropriate checklists for the new role.
    _case_cache.clear()
    return {"ok": True}


# ── Flashcard AI check ─────────────────────────────────────────────────────

class FlashcardCheckRequest(BaseModel):
    question: str
    student_answer: str
    correct_answer: str

class FlashcardCheckResponse(BaseModel):
    feedback: str
    score: int
    mock_mode: bool

@app.post("/api/flashcards/check", response_model=FlashcardCheckResponse)
@limiter.limit("10/minute")
def flashcard_check(request: Request, body: FlashcardCheckRequest, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    ctx_block = _student_context_block(student_id)
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


# ── On-demand flashcard generation (RAG-backed) ────────────────────────────

@app.get("/api/flashcards/generate", response_model=list[Flashcard])
@limiter.limit("5/minute")
def flashcards_generate(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    import json as _json
    role = ""
    weak_topics: list[str] = []
    try:
        profile = get_profile(student_id)
        role = profile.get("role", "")
        weak_topics = _json.loads(profile.get("weak_topics", "[]") or "[]")
    except Exception:
        pass
    try:
        cards = _gen_cards_rag(student_id=student_id, role=role, weak_topics=weak_topics, n=6)
    except RuntimeError as exc:
        if "quota_exceeded" in str(exc):
            raise HTTPException(status_code=503, detail="quota_exceeded")
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Could not generate flashcards. Please try again.")
    return [Flashcard(**c) for c in cards]


# ── Study suggestion ───────────────────────────────────────────────────────

class StudySuggestionResponse(BaseModel):
    suggestion: str
    focus_topic: str | None = None

@app.get("/api/study-suggestion", response_model=StudySuggestionResponse)
@limiter.limit("10/minute")
def study_suggestion(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    import json as _json
    focus: str | None = None
    try:
        profile = get_profile(student_id)
        weak = _json.loads(profile.get("weak_topics", "[]") or "[]")
        streak = int(profile.get("streak", "0") or "0")
        session_count = int(profile.get("session_count", "0") or "0")
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
def supervisor_insights(request: Request, current_user: CurrentUser = Depends(require_supervisor)):
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


# Serve built React frontend — must be last so API routes take priority
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="static")
