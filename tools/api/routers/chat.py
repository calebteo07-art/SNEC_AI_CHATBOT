"""Chat and session endpoints."""
import asyncio
import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from tools.ai.guardrails.input_filter import filter_input
from tools.ai.guardrails.output_validator import validate_output
from tools.api.shared import limiter, tutor_system, _client_ip
from tools.chatbot.log_session import log_session
from tools.profile.get_profile import get_profile
from tools.profile.update_profile import update_profile
from tools.progress.get_progress import get_progress as _get_progress
from tools.shared import db
from tools.shared.audit_log import log as audit_log
from tools.shared.gemini_client import stream_ask, MOCK_MODE, MODEL, get_or_create_context_cache
from tools.shared.jwt_utils import get_current_user, CurrentUser

router = APIRouter()

# ── Knowledge base: static markdown, loaded once and cached ───────────────
# RAG (Supabase pgvector retrieval + an LLM query-condense step) was removed for
# speed: it added an extra Gemini round-trip plus an embedding call and a vector
# query before the tutor could start answering. The tutor now grounds on the full
# curated KB, read once and injected into every prompt — no per-message round-trips.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_KB_PATH = _PROJECT_ROOT / "workflows" / "ophthalmology_kb.md"
_KB_CACHE: Optional[str] = None


def _knowledge_base() -> str:
    """Return the full ophthalmology KB, read once from disk and cached in memory."""
    global _KB_CACHE
    if _KB_CACHE is None and _KB_PATH.exists():
        _KB_CACHE = _KB_PATH.read_text(encoding="utf-8")
    return _KB_CACHE or ""


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
            # Durable twin of the ephemeral line above (survives redeploy, queryable). The
            # durable detail carries only the reason — never the raw user query.
            await db.insert_audit_event(action="input_blocked", actor=student_id,
                                        feature="guardrail", detail=f"reason={guard['reason']}",
                                        ip=_client_ip(request))

            def _blocked_stream():
                msg = "I'm here to help with ophthalmology and eye care education. Please ask a clinical question."
                yield f"data: {json.dumps({'text': msg})}\n\n"
                yield "data: [DONE]\n\n"

            return StreamingResponse(_blocked_stream(), media_type="text/event-stream")
    except Exception:
        pass  # Guardrail errors must never block legitimate queries

    # Reuse the profile already fetched above — _student_context_block would
    # otherwise re-fetch it (a second sequential Supabase round-trip before any token).
    ctx_block = await _student_context_block(student_id, profile=profile)
    # No RAG: ground the tutor on the full curated KB (cached in memory, no round-trip).
    static_system = tutor_system(role) + "\n\n---\n\n" + _knowledge_base()
    inline_system = (ctx_block + "\n\n" + static_system) if ctx_block else static_system

    # becky §3: cache the large STATIC prefix (persona + KB, ~6.1k tokens) once and reuse it
    # so it isn't re-prefilled on every message. SECURITY: the per-user student block is NOT
    # cached (the cache is shared across users) — on the cached path it rides in the user turn.
    cache_name = await asyncio.to_thread(get_or_create_context_cache, static_system, key=f"tutor:{role or 'default'}")
    cached_messages = messages
    if cache_name and ctx_block:
        cached_messages = [dict(m) for m in messages]
        for _m in cached_messages:
            if _m.get("role") == "user":
                _m["content"] = (
                    "(Student context — personalise naturally, do not quote verbatim)\n"
                    + ctx_block + "\n\n" + _m["content"]
                )
                break

    def _tutor_stream():
        """Tutor tokens: try the cached path, fall back to the inline prompt on a
        pre-first-token failure (cache expired/evicted/quota). Never breaks the reply."""
        if cache_name:
            started = False
            try:
                for chunk in stream_ask(
                    system_prompt="", messages=cached_messages, max_tokens=1024,
                    feature="chatbot", model=MODEL, thinking_level="MINIMAL",
                    cached_content=cache_name,
                ):
                    started = True
                    yield chunk
                return
            except Exception:
                if started:
                    return  # partial already sent — stop (don't replay duplicate tokens)
                # pre-token cache failure → fall through to the inline path below

        for chunk in stream_ask(
            system_prompt=inline_system, messages=messages,
            # Tutor replies are short by design — 1024 is a generous ceiling.
            max_tokens=1024, feature="chatbot", model=MODEL,
            # becky §2: conversational tutoring doesn't need a thinking budget — MINIMAL.
            thinking_level="MINIMAL",
        ):
            yield chunk

    def sse_stream():
        full_response: list[str] = []
        try:
            for chunk in _tutor_stream():
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

    # SSE flush headers: stop Render's proxy (and any gzip layer) from coalescing the
    # stream so live tokens actually reach the client chunk-by-chunk (see becky §8).
    return StreamingResponse(sse_stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    })


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

    # No AI card generation — flashcards are served from the pre-authored static
    # pool (GET /api/flashcards/generate). The Summary screen reads card counts
    # from sessionStorage, so returning an empty list here is expected.
    try:
        await update_profile(student_id)
    except Exception:
        pass

    return EndSessionResponse(
        session_id=session_id,
        cards=[],
        cards_pending=False,
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
