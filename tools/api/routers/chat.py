"""Chat and session endpoints."""
import json
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from tools.ai.guardrails.input_filter import filter_input
from tools.ai.guardrails.output_validator import validate_output
from tools.api.shared import limiter, tutor_system
from tools.chatbot.log_session import log_session
from tools.kb.search import search as _rag_search, format_context as _rag_format
from tools.profile.get_profile import get_profile
from tools.profile.update_profile import update_profile
from tools.progress.get_progress import get_progress as _get_progress
from tools.shared.audit_log import log as audit_log
from tools.shared.gemini_client import ask, stream_ask, MOCK_MODE, MODEL
from tools.shared.jwt_utils import get_current_user, CurrentUser

router = APIRouter()

# ── Knowledge base: RAG (Supabase) with markdown fallback ─────────────────
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent

_RAG_ENABLED = bool(os.getenv("SUPABASE_URL", "").strip())
_KB_PATH = _PROJECT_ROOT / "workflows" / "ophthalmology_kb.md"
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


# ── Request / Response models ──────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str = Field(max_length=8000)

class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(max_length=100)

class ChatResponse(BaseModel):
    content: str

class EndSessionRequest(BaseModel):
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
    cards_pending: bool = False   # True when card generation is running in background
    mock_mode: bool


@router.post("/api/chat")
@limiter.limit("30/minute")
async def chat(request: Request, body: ChatRequest, current_user: CurrentUser = Depends(get_current_user)):
    from tools.api.shared import _student_context_block
    student_id = current_user["sub"]
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    last_user_msg = next(
        (m.content for m in reversed(body.messages) if m.role == "user"), ""
    )
    try:
        profile = await get_profile(student_id)
        role = profile.get("role", "")
    except Exception:
        profile = {}
        role = ""

    # ── Stage 1: Input filter (regex + keyword + optional LLM) ───────────────
    try:
        guard = await filter_input(last_user_msg, student_role=role)
        if not guard["safe"]:
            audit_log("input_blocked", student_id=student_id, feature="guardrail",
                      detail=f"reason={guard['reason']} query={last_user_msg[:80]!r}")

            def _blocked_stream():
                msg = "I'm here to help with ophthalmology and eye care education. Please ask a clinical question."
                yield f"data: {json.dumps({'text': msg})}\n\n"
                yield "data: [DONE]\n\n"

            return StreamingResponse(_blocked_stream(), media_type="text/event-stream")
    except Exception:
        pass  # Guardrail errors must never block legitimate queries

    ctx_block = await _student_context_block(student_id)
    system_prompt = tutor_system(role) + "\n\n---\n\n" + _get_context(last_user_msg)
    if ctx_block:
        system_prompt = ctx_block + "\n\n" + system_prompt

    def sse_stream():
        full_response: list[str] = []
        try:
            for chunk in stream_ask(
                system_prompt=system_prompt,
                messages=messages,
                max_tokens=2048,
                feature="chatbot",
                model=MODEL,
            ):
                full_response.append(chunk)
                yield f"data: {json.dumps({'text': chunk})}\n\n"
        except RuntimeError as exc:
            if "quota_exceeded" in str(exc):
                _quota_msg = "API quota reached for today — the service resets at midnight. In the meantime, the tutor is running in practice mode."
                yield f"data: {json.dumps({'text': _quota_msg, 'quota_exceeded': True})}\n\n"
            else:
                _err_msg = "I'm having trouble reaching the service right now — please try again in a moment."
                yield f"data: {json.dumps({'text': _err_msg})}\n\n"
        except Exception as _exc:
            import traceback; traceback.print_exc()
            print(f"[chat-error] {type(_exc).__name__}: {_exc}", flush=True)
            _err_msg = "I'm having trouble reaching the service right now — please try again in a moment."
            yield f"data: {json.dumps({'text': _err_msg})}\n\n"

        # ── Stage 2: Output validation (runs after stream completes) ────────
        try:
            result = validate_output("".join(full_response))
            if result["issues"]:
                audit_log("output_flagged", student_id=student_id, feature="guardrail",
                          detail=str(result["issues"]))
            # Append disclaimer as a trailing SSE chunk if one was added
            full_text = "".join(full_response)
            validated = result["response"]
            if len(validated) > len(full_text):
                disclaimer = validated[len(full_text):]
                yield f"data: {json.dumps({'text': disclaimer})}\n\n"
        except Exception:
            pass

        yield "data: [DONE]\n\n"

    return StreamingResponse(sse_stream(), media_type="text/event-stream")


@router.post("/api/end-session", response_model=EndSessionResponse)
@limiter.limit("10/minute")
async def end_session(request: Request, body: EndSessionRequest, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    model_name = "mock" if MOCK_MODE else MODEL

    session_id = await log_session(
        student_id=student_id,
        topic=body.topic,
        messages=messages,
        token_count=body.token_count,
        model=model_name,
    )

    try:
        _role = (await get_profile(student_id)).get("role", "")
    except Exception:
        _role = ""

    # Fire card generation as a background Celery task — returns immediately
    cards_pending = False
    try:
        from tools.workers.tasks.card_generation import generate_cards_bg
        generate_cards_bg.delay(
            student_id=student_id,
            session_id=session_id,
            messages=messages,
            role=_role,
        )
        cards_pending = True
    except Exception:
        # Celery unavailable (no Redis) — fall back to synchronous generation
        from tools.flashcards.generate_cards import generate_and_return_cards
        try:
            _cards = await generate_and_return_cards(
                student_id=student_id,
                session_id=session_id,
                messages=messages,
                role=_role,
            )
        except Exception:
            _cards = []
        try:
            await update_profile(student_id)
        except Exception:
            pass
        return EndSessionResponse(
            session_id=session_id,
            cards=[Flashcard(**c) for c in _cards],
            cards_pending=False,
            mock_mode=MOCK_MODE,
        )

    try:
        await update_profile(student_id)
    except Exception:
        pass

    return EndSessionResponse(
        session_id=session_id,
        cards=[],
        cards_pending=cards_pending,
        mock_mode=MOCK_MODE,
    )


@router.get("/api/progress")
@limiter.limit("30/minute")
async def get_my_progress(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    """Return the calling student's own progress data (JWT-authenticated, no path param)."""
    student_id = current_user["sub"]
    try:
        return await _get_progress(student_id)
    except Exception as exc:
        print(f"[progress-error] {exc}", flush=True)
        raise HTTPException(status_code=500, detail="Could not load progress data")


@router.get("/api/progress/{student_id}")
async def get_student_progress(student_id: str, current_user: CurrentUser = Depends(get_current_user)):
    """Return topic performance, session history, and learning stats for a student."""
    # Students can only view their own progress; supervisors/admins can view anyone's
    if current_user["role"] == "student" and student_id != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        return await _get_progress(student_id)
    except Exception as exc:
        print(f"[progress-error] {exc}", flush=True)
        raise HTTPException(status_code=500, detail="Could not load progress data")
