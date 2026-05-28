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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
app.include_router(supervisor_router)
app.include_router(chat_router)
app.include_router(checkin_router)
app.include_router(student_router)


@app.get("/health")
def health():
    return {"status": "ok", "mock_mode": MOCK_MODE}


@app.get("/api/status")
def status():
    return {"status": "ok", "mock_mode": MOCK_MODE}


# Serve built React frontend — must be last so API routes take priority
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="static")
