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
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared.gemini_client import MOCK_MODE
from tools.shared.config import assert_production_ready
from tools.shared.logging_config import configure_logging, init_sentry
from tools.api.health import readiness_report
from tools.api.shared import limiter

import logging
import uuid

configure_logging()
_request_log = logging.getLogger("eyebot.request")
_startup_log = logging.getLogger("eyebot.startup")
from tools.api.routers.auth import router as auth_router
from tools.api.routers.cases import router as cases_router
from tools.api.routers.admin import router as admin_router
from tools.api.routers.supervisor import router as supervisor_router
from tools.api.routers.chat import router as chat_router
from tools.api.routers.checkin import router as checkin_router
from tools.api.routers.student import router as student_router
from tools.api.routers.avatar import router as avatar_router

# Largest request body we accept (bytes). One oversized request must not be able
# to exhaust the instance. Tune via env; uploads are well under this.
MAX_REQUEST_BYTES = int(os.getenv("MAX_REQUEST_BYTES", "2000000"))


async def _warmup() -> None:
    """Pre-touch the lazy Supabase + Gemini clients so the FIRST request after a
    cold boot doesn't pay their init on its critical path.

    Render free spins the container down when idle; otherwise the first request
    afterwards constructs the Supabase async client (+ httpx pool) and imports
    google-genai inline. This builds them ahead of time. It makes NO live model
    call (zero quota/cost — client construction only) and is fully best-effort:
    any failure is logged and swallowed so a slow/missing dependency can never
    wedge startup.
    """
    try:
        from tools.shared import db
        await db._get_client()
    except Exception as exc:  # dependency not ready — warm lazily on first use
        _startup_log.info("warmup: supabase client not ready (%s)", exc)

    if not MOCK_MODE:
        try:
            from tools.shared.gemini_client import _ensure_sdk_clients
            await asyncio.to_thread(_ensure_sdk_clients)  # import + build, no generate
        except Exception as exc:
            _startup_log.info("warmup: gemini client not ready (%s)", exc)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Fail closed: refuse to start in production on an insecure/incomplete env
    # (forgeable JWT, missing DB, wildcard CORS) instead of running silently.
    assert_production_ready()

    # Error tracking is opt-in: dormant unless SENTRY_DSN is set.
    if init_sentry():
        _startup_log.info("Sentry error tracking active")

    # Bound the worker threadpool that runs blocking calls (Gemini, bcrypt, SMTP)
    # off the event loop, so a load spike queues instead of exhausting the
    # instance while the event loop stays free to serve /health and stream.
    try:
        import anyio
        tokens = int(os.getenv("THREAD_POOL_TOKENS", "64"))
        anyio.to_thread.current_default_thread_limiter().total_tokens = tokens
        _startup_log.info("thread-pool tokens set to %d", tokens)
    except Exception as exc:  # never block startup on this
        _startup_log.warning("could not set thread-pool tokens: %s", exc)

    # Warm the lazy Supabase + Gemini clients OFF the critical path so the first
    # real request after a cold boot doesn't pay their init. Fire-and-forget:
    # create_task (not await) keeps readiness instant; _warmup is fail-open. Hold a
    # reference on app.state so the task isn't garbage-collected mid-flight.
    try:
        _app.state.warmup_task = asyncio.create_task(_warmup())
    except Exception as exc:  # never block startup on this
        _startup_log.warning("could not schedule warmup: %s", exc)

    yield


app = FastAPI(title="EyeBot API", lifespan=lifespan)
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
async def limit_request_size(request, call_next):
    """Reject oversized bodies up front (before routing/rate limiting) so a
    single large request can't blow the instance's memory budget."""
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > MAX_REQUEST_BYTES:
                return JSONResponse(
                    {"detail": "Request body too large"}, status_code=413
                )
        except ValueError:
            pass
    return await call_next(request)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "0"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


@app.middleware("http")
async def request_context(request, call_next):
    """Correlation ID + structured access log. Declared LAST so it is the
    outermost middleware: it tags EVERY response (including early 413 / rate-limit
    rejections) with an X-Request-ID and records one JSON log line per request."""
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    # Skip the keep-alive liveness pings — they'd drown the signal.
    if request.url.path != "/health":
        _request_log.info(
            "request",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "latency_ms": round((time.perf_counter() - start) * 1000, 1),
            },
        )
    return response


app.include_router(auth_router)
app.include_router(cases_router)
app.include_router(admin_router)
app.include_router(supervisor_router)
app.include_router(chat_router)
app.include_router(checkin_router)
app.include_router(student_router)
app.include_router(avatar_router)


@app.get("/health")
def health():
    """Liveness: cheap, no I/O. The keep-alive cron hits this every 10 min."""
    return {
        "status": "ok",
        "mock_mode": MOCK_MODE,
        "topology": "api-only (Next.js standalone is the public server)",
        "server_file": str(Path(__file__).resolve()),
        "cwd": str(Path.cwd()),
    }


@app.get("/health/ready")
async def health_ready():
    """Readiness: probes Supabase + Redis. Returns 503 when a dependency is down
    so a load balancer can pull a sick instance out of rotation."""
    report = await readiness_report()
    return JSONResponse(report, status_code=200 if report["ready"] else 503)


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
