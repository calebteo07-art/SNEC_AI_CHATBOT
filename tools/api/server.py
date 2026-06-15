#!/usr/bin/env python3
"""FastAPI backend for the EyeBot web frontend.

Bridges the React frontend to the existing tools (gemini_client, onboarding,
log_session, generate_cards). Automatically runs in MOCK MODE when
GEMINI_API_KEY is not set in .env — the full frontend flow works without
an API key.

Topology (PHOTOPIC Phase 0): this server is API-only. The Next.js standalone
server is the public process; it proxies /api/* and /health here via
next.config.ts rewrites. Page-level security headers (CSP etc.) are owned by
Next; this server only ever returns JSON/SSE.

Run (dev):
    uvicorn tools.api.server:app --reload --port 8000
"""

import asyncio
import os
import sys
import time
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared.gemini_client import MOCK_MODE
from tools.api.shared import limiter
from tools.api.routers.auth import router as auth_router
from tools.api.routers.cases import router as cases_router
from tools.api.routers.admin import router as admin_router
from tools.api.routers.supervisor import router as supervisor_router
from tools.api.routers.chat import router as chat_router
from tools.api.routers.checkin import router as checkin_router
from tools.api.routers.student import router as student_router
from tools.api.routers.media import router as media_router

app = FastAPI(title="EyeBot API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000")
_allow_all = _raw_origins.strip() == "*"
_ALLOWED_ORIGINS = ["*"] if _allow_all else [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=not _allow_all,   # credentials=True is incompatible with allow_origins=["*"]
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "0"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


@app.on_event("startup")
async def _configure_concurrency() -> None:
    """Bound the worker threadpool that runs blocking calls (Gemini, bcrypt, SMTP)
    off the event loop. This caps how many blocking ops run at once so a load
    spike queues instead of exhausting the 512MB instance, while the event loop
    itself stays free to serve /health and stream responses. Tune via env on a
    larger plan."""
    import anyio
    tokens = int(os.getenv("THREAD_POOL_TOKENS", "64"))
    try:
        anyio.to_thread.current_default_thread_limiter().total_tokens = tokens
        print(f"[startup] thread-pool tokens = {tokens}", flush=True)
    except Exception as exc:  # never block startup on this
        print(f"[startup] could not set thread-pool tokens: {exc}", flush=True)


app.include_router(auth_router)
app.include_router(cases_router)
app.include_router(admin_router)
app.include_router(supervisor_router)
app.include_router(chat_router)
app.include_router(checkin_router)
app.include_router(student_router)
app.include_router(media_router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "mock_mode": MOCK_MODE,
        "topology": "api-only (Next.js standalone is the public server)",
        "server_file": str(Path(__file__).resolve()),
        "cwd": str(Path.cwd()),
    }


@app.get("/api/status")
def status():
    return {"status": "ok", "mock_mode": MOCK_MODE}


if os.getenv("ENVIRONMENT") != "production":

    @app.get("/api/dev/sse-test")
    async def sse_test():
        """Dev-only probe for the Phase-0 migration gate: proves SSE chunks
        traverse the Next rewrite proxy unbuffered (5 chunks, 300 ms apart)."""

        async def gen():
            for i in range(5):
                yield f"data: chunk-{i} t={time.time():.3f}\n\n"
                await asyncio.sleep(0.3)

        return StreamingResponse(
            gen(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "X-Accel-Buffering": "no",
            },
        )
