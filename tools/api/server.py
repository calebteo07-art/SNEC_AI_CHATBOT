#!/usr/bin/env python3
"""FastAPI backend for the EyeBot web frontend.

Bridges the React frontend to the existing tools (gemini_client, onboarding,
log_session, generate_cards). Automatically runs in MOCK MODE when
GEMINI_API_KEY is not set in .env — the full frontend flow works without
an API key.

Run:
    uvicorn tools.api.server:app --reload --port 8000
"""

import csv
import io
import json
import os
import re
import sys
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
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
from tools.shared.gsheets import get_rows, append_row, update_row
from tools.chatbot.log_session import log_session
from tools.flashcards.generate_cards import generate_and_return_cards
from tools.cases.load_case import load_case, list_available_cases
from tools.cases.evaluate_response import evaluate_case
from tools.cases.log_case_completion import log_case_completion
from tools.cases.get_case_progress import get_case_progress
from tools.profile.get_profile import get_profile
from tools.profile.update_profile import update_profile
from tools.profile.summarize_gaps import summarize_gaps
from tools.supervisor.cohort_summary import cohort_summary as _cohort_summary
from tools.supervisor.at_risk import get_at_risk as _get_at_risk
from tools.supervisor.cohort_benchmarks import get_cohort_benchmarks as _get_benchmarks
from tools.supervisor.generate_report import generate_student_report as _generate_report
from tools.supervisor.weekly_digest import send_weekly_digest as _send_digest
from tools.cases.generate_case import generate_cases as _generate_cases
from tools.flashcards.generate_cards import generate_cards_from_rag as _gen_cards_rag
from tools.progress.get_progress import get_progress as _get_progress

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

_case_cache: dict[str, dict] = {}

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
    allow_methods=["*"],
    allow_headers=["*"],
)


SUPER_ADMIN_EMAIL = "snec.tne.edu@gmail.com"


def _get_email_for_id(student_id: str) -> str:
    """Return the email address for a given student_id, or empty string."""
    from tools.shared.gsheets import get_rows as _gr
    try:
        rows = _gr("snec_consent", filters={"student_id": student_id})
        return rows[0].get("email", "").strip().lower() if rows else ""
    except Exception:
        return ""


def _require_supervisor(x_supervisor_id: str = Header(..., alias="X-Supervisor-ID")):
    """FastAPI dependency — verifies the caller is a registered supervisor or admin."""
    from tools.shared.gsheets import get_rows as _get_rows
    email = _get_email_for_id(x_supervisor_id)
    if email == SUPER_ADMIN_EMAIL:
        return x_supervisor_id
    try:
        rows = _get_rows("snec_supervisors", filters={"email": email})
    except Exception:
        raise HTTPException(status_code=503, detail="Could not verify supervisor access")
    if not rows:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return x_supervisor_id


def _require_admin(x_admin_id: str = Header(..., alias="X-Admin-ID")):
    """FastAPI dependency — verifies the caller is admin (snec email or promoted admin)."""
    email = _get_email_for_id(x_admin_id)
    if not email:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if email == SUPER_ADMIN_EMAIL:
        return x_admin_id
    try:
        rows = get_rows("snec_supervisors", filters={"email": email})
    except Exception:
        raise HTTPException(status_code=503, detail="Could not verify admin access")
    if not rows or rows[0].get("role", "").lower() != "admin":
        raise HTTPException(status_code=401, detail="Unauthorized")
    return x_admin_id


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

class OnboardRequest(BaseModel):
    full_name: str
    email: str
    student_role: str = ""  # OA | OT | PSA (empty for supervisors)

class OnboardResponse(BaseModel):
    student_id: str
    mock_mode: bool
    role: str = "student"  # "student" or "supervisor"
    student_role: str = ""  # OA | OT | PSA

class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponse(BaseModel):
    student_id: str
    full_name: str
    role: str
    student_role: str
    must_change: bool
    is_new: bool
    mock_mode: bool

class ChangePasswordRequest(BaseModel):
    student_id: str
    current_password: str
    new_password: str

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

@limiter.limit("5/minute")
@app.post("/api/auth/login", response_model=LoginResponse)
async def auth_login(request: Request, body: LoginRequest):
    email = body.email.strip().lower()

    # Must be in approved list
    approved = get_rows("snec_approved_students", filters={"email": email})
    if not approved:
        # Also allow super admin and promoted supervisors/admins
        sup_rows = get_rows("snec_supervisors", filters={"email": email})
        if email != SUPER_ADMIN_EMAIL and not sup_rows:
            raise HTTPException(status_code=403, detail="Not in approved list. Contact your administrator.")
        approved_role = "admin" if (email == SUPER_ADMIN_EMAIL or (sup_rows and sup_rows[0].get("role") == "admin")) else "supervisor"
        approved_student_role = ""
    else:
        approved_role = "student"
        approved_student_role = approved[0].get("role", "")

    # Check password hash
    auth_rows = get_rows("snec_auth", filters={"email": email})
    must_change = True
    if auth_rows:
        stored_hash = auth_rows[0].get("password_hash", "")
        if stored_hash and not verify_password(body.password, stored_hash):
            raise HTTPException(status_code=401, detail="Incorrect password.")
        raw_mc = auth_rows[0].get("must_change", "true")
        must_change = str(raw_mc).lower() == "true"
    else:
        # Legacy account — no hash stored; accept any password, force change
        must_change = True

    # Create/fetch student identity
    full_name = approved[0].get("full_name", email) if approved else email
    student_id = get_or_create_student(full_name, email)
    is_new = not has_consented(student_id)

    # Determine role from supervisors sheet if not a plain student
    final_role = approved_role
    if approved_role == "student":
        sup_rows = get_rows("snec_supervisors", filters={"email": email})
        if sup_rows:
            final_role = sup_rows[0].get("role") or "supervisor"
            approved_student_role = ""

    return LoginResponse(
        student_id=student_id,
        full_name=full_name,
        role=final_role,
        student_role=approved_student_role,
        must_change=must_change,
        is_new=is_new,
        mock_mode=MOCK_MODE,
    )


@app.post("/api/auth/change-password")
async def auth_change_password(body: ChangePasswordRequest):
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    # Resolve email from student_id
    consent = get_rows("snec_consent", filters={"student_id": body.student_id})
    if not consent:
        raise HTTPException(status_code=404, detail="Student not found.")
    email = consent[0].get("email", "").strip().lower()

    auth_rows = get_rows("snec_auth", filters={"email": email})
    if auth_rows:
        raw_mc = auth_rows[0].get("must_change", "true")
        row_must_change = str(raw_mc).lower() == "true"
        stored_hash = auth_rows[0].get("password_hash", "")
        # Skip current-password check when this is a forced first-time reset
        if not row_must_change and stored_hash and not verify_password(body.current_password, stored_hash):
            raise HTTPException(status_code=401, detail="Current password is incorrect.")

    new_hash = hash_password(body.new_password)
    updated = update_row("snec_auth", "email", email, {"password_hash": new_hash, "must_change": "false"})
    if not updated:
        # No existing row (e.g. admin accounts) — insert one
        append_row("snec_auth", {"email": email, "password_hash": new_hash, "must_change": "false"})
    return {"ok": True}


@app.post("/api/onboard", response_model=OnboardResponse)
def onboard(body: OnboardRequest):
    if not body.full_name.strip() or not body.email.strip():
        raise HTTPException(status_code=400, detail="full_name and email are required")

    email = body.email.strip().lower()

    from tools.shared.gsheets import get_rows as _get_rows

    # ── Determine role and access ──────────────────────────────────────────
    role = "student"
    student_role = body.student_role.strip().upper() if body.student_role else ""

    if email == SUPER_ADMIN_EMAIL:
        role = "admin"
    else:
        # Check supervisor list
        try:
            supervisors = _get_rows("snec_supervisors", filters={"email": email})
            if supervisors:
                role = "admin" if supervisors[0].get("role", "").lower() == "admin" else "supervisor"
        except Exception:
            pass

        if role == "student":
            # Check approved students whitelist
            try:
                approved = _get_rows("snec_approved_students", filters={"email": email})
            except Exception:
                approved = []
            if not approved:
                raise HTTPException(
                    status_code=403,
                    detail="Access restricted. Contact your administrator to request access.",
                )
            # Pre-fill role from whitelist if student didn't supply one
            if not student_role and approved[0].get("role", "").upper() in ("OA", "OT", "PSA"):
                student_role = approved[0]["role"].upper()

    student_id = get_or_create_student(body.full_name.strip(), email)
    if not has_consented(student_id):
        record_consent(student_id)

    # Link student_id back to approved record
    if role == "student":
        try:
            from tools.shared.gsheets import update_row as _update_row
            _update_row("snec_approved_students", "email", email, {"student_id": student_id})
        except Exception:
            pass

    if role == "student" and student_role in ("OA", "OT", "PSA"):
        try:
            update_profile(student_id, role=student_role)
        except Exception:
            pass

    return OnboardResponse(
        student_id=student_id,
        mock_mode=MOCK_MODE,
        role=role,
        student_role=student_role,
    )


@app.post("/api/chat")
@limiter.limit("30/minute")
def chat(request: Request, body: ChatRequest):
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    last_user_msg = next(
        (m.content for m in reversed(body.messages) if m.role == "user"), ""
    )
    try:
        profile = get_profile(body.student_id)
        role = profile.get("role", "")
    except Exception:
        profile = {}
        role = ""

    ctx_block = _student_context_block(body.student_id)
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
        _role = get_profile(body.student_id).get("role", "")
    except Exception:
        _role = ""
    try:
        cards = generate_and_return_cards(
            student_id=body.student_id,
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


@app.get("/api/progress/{student_id}")
def get_student_progress(student_id: str):
    """Return topic performance, session history, and learning stats for a student."""
    try:
        return _get_progress(student_id)
    except Exception as exc:
        print(f"[progress-error] {exc}", flush=True)
        raise HTTPException(status_code=500, detail="Could not load progress data")


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

@app.get("/api/cases", response_model=CasesResponse)
def get_cases(student_id: str = ""):
    import json as _json

    # Determine student role and weak topics for case generation
    role = "OA"
    weak_topics: list[str] = []
    if student_id:
        try:
            profile = get_profile(student_id)
            role = profile.get("role", "OA") or "OA"
            weak_topics = _json.loads(profile.get("weak_topics", "[]") or "[]")
        except Exception:
            pass

    # Try AI generation first
    try:
        generated = _generate_cases(role=role, weak_topics=weak_topics, n=5)
        if generated:
            _case_cache.clear()
            for c in generated:
                _case_cache[c["case_id"]] = c
            return CasesResponse(cases=[
                CaseInfo(
                    case_id=c["case_id"],
                    title=c["title"],
                    difficulty=c.get("difficulty", "intermediate"),
                    topic=c.get("topic", ""),
                    estimated_minutes=c.get("estimated_minutes", 15),
                    patient=CasePatientInfo(
                        name=c["patient"]["name"],
                        age=int(c["patient"].get("age", 30)),
                        presenting_complaint=c["patient"].get("presenting_complaint", ""),
                    ),
                )
                for c in generated if "patient" in c
            ])
    except Exception as exc:
        print(f"[case-gen] AI generation failed, using pre-stored cases: {exc}", flush=True)

    # Fallback: load pre-stored case files
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
            case_progress = get_case_progress(student_id)
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
        ))
    return CasesResponse(cases=cases)


@app.get("/api/cases/{case_id}", response_model=CaseInfo)
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


@app.get("/api/cases/{case_id}/checklist", response_model=ChecklistResponse)
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


@app.post("/api/cases/{case_id}/chat")
@limiter.limit("30/minute")
def case_chat(case_id: str, request: Request, body: CaseChatRequest):
    # Try in-memory cache first (AI-generated cases), then fall back to file
    case = _case_cache.get(case_id)
    if case is None:
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
    case = _case_cache.get(case_id)
    if case is None:
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

    raw_result = evaluate_case(case, messages, body.student_id, body.performed_steps)

    session_id = log_session(
        student_id=body.student_id,
        topic=f"Case: {case['title']}",
        messages=messages,
        token_count=0,
        model="mock" if MOCK_MODE else MODEL,
    )
    try:
        _case_role = get_profile(body.student_id).get("role", "")
    except Exception:
        _case_role = ""
    cards = generate_and_return_cards(
        student_id=body.student_id,
        session_id=session_id,
        messages=messages,
        role=_case_role,
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

    # Log case completion for difficulty progression tracking
    try:
        log_case_completion(body.student_id, case_id, raw_result.get("total_score", 0))
    except Exception:
        pass

    # Generate structured debrief
    debrief_text: str | None = None
    try:
        _debrief_ctx = _student_context_block(body.student_id)
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
        debrief_text = ask(
            system_prompt=debrief_prompt,
            messages=debrief_messages,
            max_tokens=2048,
            feature="debrief",
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
                    note_response = ask(
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
    import json as _json
    try:
        profile = get_profile(student_id)
        weak = _json.loads(profile.get("weak_topics", "[]") or "[]")
        topic = weak[0] if weak else "Ophthalmology"
        role = profile.get("role", "")
    except Exception:
        topic = "Ophthalmology"
        role = ""

    role_line = _ROLE_TUTOR_CONTEXT.get(role.upper(), "")
    ctx_block = _student_context_block(student_id)
    system = (
        (ctx_block + "\n\n" if ctx_block else "")
        + "You are an ophthalmology tutor running a 60-second warm-up check-in. "
        "Generate ONE concise clinical question targeting the given topic. "
        + (f"Student role context: {role_line} " if role_line else "")
        + "Calibrate difficulty to the student's experience level and known gaps. "
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
    ctx_block = _student_context_block(body.student_id)
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
            supervisor_note=profile.get("supervisor_note", "") or "",
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Internal server error")


@app.patch("/api/supervisor/student/{student_id}/note")
def supervisor_save_note(
    student_id: str,
    body: SaveNoteRequest,
    _: str = Depends(_require_supervisor),
):
    from tools.shared.gsheets import update_row as _update_row
    try:
        _update_row("snec_profiles", "student_id", student_id, {"supervisor_note": body.note})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"ok": True}


@app.get("/api/supervisor/student/{student_id}/report")
def supervisor_student_report(student_id: str, _: str = Depends(_require_supervisor)):
    try:
        pdf_bytes = _generate_report(student_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not generate report: {exc}")
    filename = f"eyebot_student_{student_id[:8]}_report.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/supervisor/benchmarks", response_model=BenchmarkResponse)
def supervisor_benchmarks(_: str = Depends(_require_supervisor)):
    try:
        topics = _get_benchmarks()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return BenchmarkResponse(topics=[BenchmarkTopic(**t) for t in topics])


class DigestRequest(BaseModel):
    recipient: str  # supervisor email to send digest to

@app.post("/api/supervisor/send-digest")
def supervisor_send_digest(body: DigestRequest, supervisor_id: str = Depends(_require_supervisor)):
    try:
        _send_digest(body.recipient)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"ok": True, "sent_to": body.recipient}


# ── Admin endpoints ────────────────────────────────────────────────────────

class ApproveStudentRequest(BaseModel):
    email: str
    full_name: str = ""
    role: str = ""  # OA | OT | PSA

class PromoteRequest(BaseModel):
    email: str
    new_role: str  # "supervisor" | "admin"

@app.get("/api/admin/approved")
def admin_list_approved(_: str = Depends(_require_admin)):
    from tools.shared.gsheets import get_rows as _gr
    try:
        rows = _gr("snec_approved_students")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"students": rows}

@app.post("/api/admin/approved")
def admin_approve_student(body: ApproveStudentRequest, admin_id: str = Depends(_require_admin)):
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    from tools.shared.gsheets import get_rows as _gr, append_row as _ar
    from datetime import datetime, timezone
    existing = _gr("snec_approved_students", filters={"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already approved")
    admin_email = _get_email_for_id(admin_id)
    _ar("snec_approved_students", {
        "email": email,
        "full_name": body.full_name.strip(),
        "role": body.role.strip().upper(),
        "added_by": admin_email,
        "added_at": datetime.now(timezone.utc).isoformat(),
        "student_id": "",
    })
    plain_pw = generate_password()
    pw_hash = hash_password(plain_pw)
    try:
        append_row("snec_auth", {"email": email, "password_hash": pw_hash, "must_change": "true"})
    except Exception as _auth_exc:
        raise HTTPException(status_code=500, detail="Account created but password setup failed. Contact support.")

    try:
        from tools.shared.gmail_sender import send_email as _send_email
        _send_email(
            to=email,
            subject="Your EyeBot account is ready",
            html=f"""<p>Hi {body.full_name},</p>
<p>Your EyeBot account has been created.</p>
<p><strong>Email:</strong> {email}<br>
<strong>Temporary password:</strong> {plain_pw}</p>
<p>Please log in and change your password when prompted.</p>
<p>EyeBot · SNEC</p>""",
        )
    except Exception:
        pass

    return {"ok": True, "password": plain_pw}

@app.delete("/api/admin/approved/{email}")
def admin_unapprove_student(email: str, _: str = Depends(_require_admin)):
    from tools.shared.gsheets import delete_row as _dr
    deleted = _dr("snec_approved_students", "email", email.lower())
    if not deleted:
        raise HTTPException(status_code=404, detail="Email not found in approved list")
    return {"ok": True}

@app.get("/api/admin/students")
def admin_all_students(_: str = Depends(_require_admin)):
    from tools.shared.gsheets import get_rows as _gr
    try:
        profiles = _gr("snec_profiles")
        consent = _gr("snec_consent")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    consent_map = {r["student_id"]: r for r in consent}
    result = []
    for p in profiles:
        sid = p.get("student_id", "")
        c = consent_map.get(sid, {})
        result.append({
            "student_id": sid,
            "full_name": c.get("student_name", ""),
            "email": c.get("email", ""),
            "role": p.get("role", ""),
            "session_count": p.get("session_count", 0),
            "streak": p.get("streak", 0),
            "last_active": p.get("last_active", ""),
            "weak_topics": p.get("weak_topics", "[]"),
            "learning_velocity": p.get("learning_velocity", "stable"),
        })
    return {"students": result}

@app.get("/api/admin/activity")
def admin_activity(_: str = Depends(_require_admin)):
    from tools.shared.gsheets import get_rows as _gr
    try:
        sessions = _gr("snec_sessions")
        cases = _gr("snec_case_progress")
        consent = _gr("snec_consent")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    name_map = {r["student_id"]: r.get("student_name", r["student_id"][:8]) for r in consent}
    feed = []
    for s in sessions[-50:]:
        feed.append({
            "type": "session",
            "student_id": s.get("student_id", ""),
            "name": name_map.get(s.get("student_id", ""), s.get("student_id", "")[:8]),
            "detail": s.get("topic", "Chat session"),
            "timestamp": s.get("timestamp", ""),
            "token_count": int(s.get("token_count", 0) or 0),
        })
    for c in cases[-50:]:
        passed = str(c.get("passed", "false")).lower() == "true"
        feed.append({
            "type": "case",
            "student_id": c.get("student_id", ""),
            "name": name_map.get(c.get("student_id", ""), c.get("student_id", "")[:8]),
            "detail": c.get("case_id", "") + (" ✓" if passed else " ✗") + " · " + str(c.get("total_score", 0)) + "/40",
            "timestamp": c.get("completed_at", ""),
        })
    feed.sort(key=lambda x: x["timestamp"], reverse=True)
    return {"feed": feed[:80]}

@app.post("/api/admin/promote")
def admin_promote(body: PromoteRequest, _: str = Depends(_require_admin)):
    from tools.shared.gsheets import get_rows as _gr, append_row as _ar, update_row as _ur
    email = body.email.strip().lower()
    new_role = body.new_role.strip().lower()
    if new_role not in ("supervisor", "admin"):
        raise HTTPException(status_code=400, detail="new_role must be 'supervisor' or 'admin'")
    existing = _gr("snec_supervisors", filters={"email": email})
    if existing:
        _ur("snec_supervisors", "email", email, {"role": new_role})
    else:
        _ar("snec_supervisors", {"supervisor_id": "", "email": email, "cohort": "SNEC", "role": new_role})
    return {"ok": True}

@app.delete("/api/admin/promote/{email}")
def admin_demote(email: str, _: str = Depends(_require_admin)):
    from tools.shared.gsheets import delete_row as _dr
    _dr("snec_supervisors", "email", email.lower())
    return {"ok": True}


@app.get("/api/admin/student/{student_id}/detail")
async def admin_student_detail(student_id: str, admin_id: str = Depends(_require_admin)):
    import json as _json

    profile = get_profile(student_id)

    # Sessions: last 30, newest first
    all_sessions = get_rows("snec_sessions", filters={"student_id": student_id})
    all_sessions.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
    sessions = [
        {
            "session_id": s.get("session_id", ""),
            "timestamp": s.get("timestamp", ""),
            "topic": (s.get("topic") or s.get("summary") or "")[:60],
            "summary": s.get("summary", ""),
            "token_count": int(s.get("token_count", 0) or 0),
            "model": s.get("model", ""),
        }
        for s in all_sessions[:30]
    ]

    # Cases: all attempts
    case_rows = get_rows("snec_case_progress", filters={"student_id": student_id})
    cases = [
        {
            "case_id": c.get("case_id", ""),
            "total_score": int(c.get("total_score", 0) or 0),
            "passed": str(c.get("passed", "false")).lower() == "true",
            "completed_at": c.get("completed_at", ""),
        }
        for c in case_rows
    ]

    try:
        retention_scores = _json.loads(profile.get("retention_scores", "{}") or "{}")
    except Exception:
        retention_scores = {}

    try:
        missed_findings = _json.loads(profile.get("missed_findings", "[]") or "[]")
    except Exception:
        missed_findings = []

    total_tokens = sum(s["token_count"] for s in sessions)

    return {
        "student_id": student_id,
        "full_name": profile.get("full_name", ""),
        "email": profile.get("email", ""),
        "role": profile.get("role", ""),
        "session_count": int(profile.get("session_count", 0) or 0),
        "streak": int(profile.get("streak", 0) or 0),
        "last_active": profile.get("last_active", ""),
        "learning_velocity": profile.get("learning_velocity", "stable"),
        "weak_topics": _json.loads(profile.get("weak_topics", "[]") or "[]"),
        "missed_findings": missed_findings,
        "retention_scores": retention_scores,
        "supervisor_note": profile.get("supervisor_note", ""),
        "sessions": sessions,
        "cases": cases,
        "total_tokens": total_tokens,
    }


@app.get("/api/admin/token-summary")
async def admin_token_summary(_: str = Depends(_require_admin)):
    all_sessions = get_rows("snec_sessions")
    total = 0
    by_student: dict[str, int] = {}
    for s in all_sessions:
        sid = s.get("student_id", "")
        tc = int(s.get("token_count", 0) or 0)
        total += tc
        by_student[sid] = by_student.get(sid, 0) + tc
    return {
        "total_tokens": total,
        "by_student": [{"student_id": k, "tokens": v} for k, v in by_student.items()],
    }


_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_VALID_ROLES = {"OA", "OT", "PSA"}


@app.post("/api/admin/upload-csv")
async def admin_upload_csv(file: UploadFile = File(...), admin_id: str = Depends(_require_admin)):
    from tools.shared.gmail_sender import send_email as _send_email
    from datetime import datetime, timezone

    content = await file.read()
    text = content.decode("utf-8-sig")  # handles BOM from Excel
    reader = csv.DictReader(io.StringIO(text))

    existing = {r.get("email", "").strip().lower() for r in get_rows("snec_approved_students")}
    imported, skipped = 0, 0
    errors = []
    credentials = []

    # Resolve admin email once before the loop; fall back to raw ID if lookup fails
    try:
        admin_email = _get_email_for_id(admin_id) or admin_id
    except Exception:
        admin_email = admin_id

    for i, row in enumerate(reader, start=2):
        full_name = (row.get("full_name") or "").strip()
        email = (row.get("email") or "").strip().lower()
        role = (row.get("role") or "").strip().upper()

        if not full_name:
            errors.append({"row": i, "reason": "missing full_name"})
            skipped += 1
            continue
        if not email or not _EMAIL_RE.match(email):
            errors.append({"row": i, "reason": "invalid email"})
            skipped += 1
            continue
        if role not in _VALID_ROLES:
            errors.append({"row": i, "reason": f"role must be OA, OT, or PSA (got {role!r})"})
            skipped += 1
            continue
        if email in existing:
            errors.append({"row": i, "reason": f"{email} already approved"})
            skipped += 1
            continue

        plain_pw = generate_password()
        pw_hash = hash_password(plain_pw)

        append_row("snec_approved_students", {
            "email": email, "full_name": full_name, "role": role,
            "added_by": admin_email,
            "added_at": datetime.now(timezone.utc).isoformat(),
            "student_id": "",
        })
        try:
            append_row("snec_auth", {"email": email, "password_hash": pw_hash, "must_change": "true"})
        except Exception:
            errors.append({"row": i, "reason": "password setup failed"})
            skipped += 1
            continue
        existing.add(email)

        try:
            _send_email(
                to=email,
                subject="Your EyeBot account is ready",
                html=f"""<p>Hi {full_name},</p>
<p>Your EyeBot account has been created.</p>
<p><strong>Email:</strong> {email}<br>
<strong>Temporary password:</strong> {plain_pw}</p>
<p>Please log in and change your password when prompted.</p>
<p>EyeBot · SNEC</p>""",
            )
        except Exception:
            pass  # email failure does not block import

        credentials.append({"full_name": full_name, "email": email, "password": plain_pw})
        imported += 1

    return {"imported": imported, "skipped": skipped, "errors": errors, "credentials": credentials}


# ── Profile role update ────────────────────────────────────────────────────

class RoleUpdateRequest(BaseModel):
    student_id: str
    role: str  # OA | OT | PSA

@app.patch("/api/profile/role")
def update_role(body: RoleUpdateRequest):
    role = body.role.strip().upper()
    if role not in ("OA", "OT", "PSA"):
        raise HTTPException(status_code=400, detail="role must be OA, OT, or PSA")
    try:
        update_profile(body.student_id, role=role)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    # Clear cached cases so the next visit to the case list regenerates
    # with role-appropriate checklists for the new role.
    _case_cache.clear()
    return {"role": role}


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
    ctx_block = _student_context_block(body.student_id)
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
def flashcards_generate(request: Request, student_id: str):
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
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return [Flashcard(**c) for c in cards]


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


# Serve built React frontend — must be last so API routes take priority
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="static")
