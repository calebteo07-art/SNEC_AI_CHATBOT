#!/usr/bin/env python3
"""FastAPI backend for the EyeBot web frontend.

Bridges the React frontend to the existing tools (gemini_client, onboarding,
log_session, generate_cards). Automatically runs in MOCK MODE when
GEMINI_API_KEY is not set in .env — the full frontend flow works without
an API key.

Run:
    uvicorn tools.api.server:app --reload --port 8000
"""

import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
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

app = FastAPI(title="EyeBot API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
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
    if os.getenv("ENVIRONMENT") != "production":
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'"
        )
    return response


app.include_router(auth_router)
app.include_router(cases_router)
app.include_router(admin_router)
app.include_router(supervisor_router)
app.include_router(chat_router)
app.include_router(checkin_router)
app.include_router(student_router)


@app.get("/health")
def health():
    return {"status": "ok", "mock_mode": MOCK_MODE, "frontend_built": FRONTEND_DIST.exists()}


@app.get("/api/status")
def status():
    return {"status": "ok", "mock_mode": MOCK_MODE}


# Serve Next.js static export — mounts must be last so API routes take priority
FRONTEND_DIST = PROJECT_ROOT / "chinita" / "out"

if FRONTEND_DIST.exists():
    _next_dir = FRONTEND_DIST / "_next"
    if _next_dir.exists():
        app.mount("/_next", StaticFiles(directory=_next_dir), name="next-static")

    _images_dir = FRONTEND_DIST / "images"
    if _images_dir.exists():
        app.mount("/images", StaticFiles(directory=_images_dir), name="images-static")


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    if not FRONTEND_DIST.exists():
        raise HTTPException(status_code=503, detail="Frontend not built — chinita/out/ missing")

    # Security: reject path traversal
    try:
        resolved = (FRONTEND_DIST / full_path).resolve()
        resolved.relative_to(FRONTEND_DIST.resolve())
    except (ValueError, Exception):
        raise HTTPException(status_code=404)

    # 1. Next.js App Router flat HTML: /dashboard → out/dashboard.html (Next.js 16 default)
    flat_html = FRONTEND_DIST / (full_path + ".html")
    if flat_html.is_file():
        return FileResponse(flat_html)

    # 2. Next.js App Router dir HTML: /dashboard → out/dashboard/index.html (older pattern)
    page_html = FRONTEND_DIST / full_path / "index.html"
    if page_html.is_file():
        return FileResponse(page_html)

    # 3. Direct file: favicon.ico, manifest.json, sw.js, etc.
    if resolved.is_file():
        return FileResponse(resolved)

    # 3. SPA fallback to root index
    root_html = FRONTEND_DIST / "index.html"
    if root_html.is_file():
        return FileResponse(root_html)

    raise HTTPException(status_code=404, detail="Page not found")
