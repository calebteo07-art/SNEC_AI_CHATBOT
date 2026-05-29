# Split server.py into Domain Routers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the 1,948-line `tools/api/server.py` god file into focused domain routers so each file can be reasoned about and onboarded into independently.

**Architecture:** FastAPI's `APIRouter` + `include_router`. A new `tools/api/shared.py` holds the `limiter` singleton and shared prompts so router files can import them without circular deps. `server.py` becomes a ~150-line composition root: app init, CORS, middleware, and `include_router` calls. Domain route handlers move to `tools/api/routers/{domain}.py`; each router file imports directly from the `tools.*` utilities it needs. Tests that patch `tools.api.server.*` are updated to patch the new router module path.

**Tech Stack:** FastAPI `APIRouter`, `slowapi` limiter shared via `tools.api.shared`, `pytest` + `unittest.mock.patch`

---

## File Structure After Completion

```
tools/api/
├── server.py             # ~150 lines: app init, middleware, includes all routers
├── shared.py             # limiter, SUPER_ADMIN_EMAIL, shared prompt strings, _case_cache
└── routers/
    ├── __init__.py
    ├── auth.py           # /api/auth/*, /api/onboard
    ├── chat.py           # /api/chat, /api/end-session, /api/progress
    ├── cases.py          # /api/cases/*, _check_case_access
    ├── checkin.py        # /api/checkin/*
    ├── student.py        # /api/profile/role, /api/flashcards/*, /api/study-suggestion
    ├── supervisor.py     # /api/supervisor/*
    └── admin.py          # /api/admin/*
```

---

## Task 1: Create shared.py and router skeleton

**Files:**
- Create: `tools/api/shared.py`
- Create: `tools/api/routers/__init__.py`

- [ ] **Step 1: Create `tools/api/shared.py`**

This module holds everything multiple routers need to share.

```python
"""Shared singletons and constants for all EyeBot API routers."""
import os

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

SUPER_ADMIN_EMAIL = os.getenv("SUPER_ADMIN_EMAIL", "")

# In-memory case cache shared across cases router endpoints
_case_cache: dict[str, dict] = {}

# System prompts
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


def tutor_system(role: str) -> str:
    """Return TUTOR_SYSTEM enriched with the student's role context."""
    role_line = _ROLE_TUTOR_CONTEXT.get(role.upper(), "")
    if role_line:
        return _TUTOR_BASE + f"\n{role_line}\n"
    return _TUTOR_BASE
```

- [ ] **Step 2: Create `tools/api/routers/__init__.py`**

```python
# tools/api/routers/__init__.py
```

- [ ] **Step 3: Verify imports cleanly**

```
python -c "from tools.api.shared import limiter, SUPER_ADMIN_EMAIL, _case_cache, PATIENT_SYSTEM, tutor_system; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add tools/api/shared.py tools/api/routers/__init__.py
git commit -m "feat: add shared.py and routers/ skeleton for server.py split"
```

---

## Task 2: Extract auth router + update test patches

**Files:**
- Create: `tools/api/routers/auth.py`
- Modify: `tests/api/test_auth_endpoints.py`

The auth router contains: `auth_login`, `auth_me`, `auth_change_password`, `auth_request_reset`, `auth_reset_password`, `onboard`.

Models that belong to this router (define them inline in auth.py — do NOT import from server.py):
`OnboardRequest`, `OnboardResponse`, `LoginRequest`, `LoginResponse`, `ChangePasswordRequest`, `RequestResetRequest`, `ResetPasswordRequest`, `MeResponse`

- [ ] **Step 1: Create `tools/api/routers/auth.py`**

Read `tools/api/server.py` to copy the exact bodies of: `auth_login`, `auth_me`, `auth_change_password`, `auth_request_reset`, `auth_reset_password`, `onboard`.

Create `tools/api/routers/auth.py`:

```python
"""Auth and onboarding endpoints."""
import os
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from tools.api.shared import limiter, SUPER_ADMIN_EMAIL
from tools.shared.auth import hash_password, verify_password, generate_password
from tools.shared.gemini_client import MOCK_MODE
from tools.shared.gsheets import get_rows, append_row, update_row
from tools.shared.identity import get_or_create_student, has_consented, record_consent
from tools.shared.jwt_utils import create_access_token, get_current_user, CurrentUser
from tools.shared.otp_store import set_otp, verify_and_consume_otp

router = APIRouter()


# ── Models ─────────────────────────────────────────────────────────────────

class OnboardRequest(BaseModel):
    full_name: str
    email: str
    student_role: str = ""

class OnboardResponse(BaseModel):
    student_id: str
    mock_mode: bool
    role: str = "student"
    student_role: str = ""

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
    token: str

class ChangePasswordRequest(BaseModel):
    student_id: str
    current_password: str
    new_password: str

class RequestResetRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str

class MeResponse(BaseModel):
    student_id: str
    role: str
    student_role: str


# ── Endpoints ───────────────────────────────────────────────────────────────

# PASTE THE EXACT BODIES OF THESE FUNCTIONS FROM server.py, changing:
#   @app.post/get/... → @router.post/get/...
#   @limiter.limit(...) stays the same (limiter imported from shared)
# Copy: auth_login, auth_me, auth_change_password, auth_request_reset,
#       auth_reset_password, onboard
```

**IMPORTANT:** When copying endpoints from `server.py` to `auth.py`, change `@app.post(...)` → `@router.post(...)` and `@app.get(...)` → `@router.get(...)`. Keep `@limiter.limit(...)` decorators unchanged. Keep the function bodies EXACTLY as they are in server.py.

- [ ] **Step 2: Include the auth router in server.py**

In `tools/api/server.py`, add after the existing imports:
```python
from tools.api.routers import auth as _auth_router
```

And after `app.add_middleware(...)`:
```python
app.include_router(_auth_router.router)
```

Then DELETE the auth endpoint functions and their models from server.py (the ones you just moved to auth.py).

- [ ] **Step 3: Verify the server still imports cleanly**

```
python -c "from tools.api.server import app; print('OK')"
```

- [ ] **Step 4: Run tests (expect failures — patches need updating)**

```
python -m pytest tests/api/test_auth_endpoints.py -v 2>&1 | head -40
```

- [ ] **Step 5: Update test patches in `tests/api/test_auth_endpoints.py`**

The tests patch `tools.api.server.X` for functions that now live in `tools.api.routers.auth`. Change ALL of these:

| Old patch target | New patch target |
|---|---|
| `tools.api.server.get_rows` (auth tests) | `tools.api.routers.auth.get_rows` |
| `tools.api.server.get_or_create_student` | `tools.api.routers.auth.get_or_create_student` |
| `tools.api.server.has_consented` | `tools.api.routers.auth.has_consented` |
| `tools.api.server.update_row` (change-password, reset-password) | `tools.api.routers.auth.update_row` |
| `tools.api.server.set_otp` | `tools.api.routers.auth.set_otp` |
| `tools.api.server.verify_and_consume_otp` | `tools.api.routers.auth.verify_and_consume_otp` |
| `tools.api.server.get_profile` (student_detail test) | `tools.api.routers.admin.get_profile` (leave this for Task 4) |

**Note:** The `test_student_detail_requires_admin` and `test_student_detail_returns_shape` tests use `get_rows` and `get_profile` from the admin domain — leave those two tests' patches unchanged for now (they'll be fixed in Task 4 when admin is extracted). Only fix the patches for auth-specific tests.

**Which tests are auth-specific:**
- `test_login_success`, `test_login_wrong_password`, `test_login_not_approved`, `test_login_student_promoted_to_supervisor`
- `test_change_password_success`, `test_change_password_wrong_current`, `test_change_password_too_short`
- `test_request_reset_returns_ok_for_approved_user`, `test_request_reset_returns_ok_for_unknown_email`
- `test_reset_password_success`, `test_reset_password_wrong_or_expired_otp_returns_400`, `test_reset_password_too_short_returns_400`

- [ ] **Step 6: Run auth tests and confirm they pass**

```
python -m pytest tests/api/test_auth_endpoints.py -v
```

Expected: 14 passed (or 12 if admin tests still fail — those get fixed in Task 4).

- [ ] **Step 7: Run full suite**

```
python -m pytest --tb=short -q
```

- [ ] **Step 8: Commit**

```bash
git add tools/api/routers/auth.py tools/api/server.py tests/api/test_auth_endpoints.py
git commit -m "refactor: extract auth/onboard endpoints into routers/auth.py"
```

---

## Task 3: Extract cases router + update test imports/patches

**Files:**
- Create: `tools/api/routers/cases.py`
- Modify: `tests/cases/test_case_access.py`

The cases router contains: `get_cases`, `_check_case_access`, `get_case`, `get_case_checklist`, `case_chat`, `case_submit`.

Models: `CasePatientInfo`, `CaseInfo`, `CasesResponse`, `CaseChatRequest`, `CaseChatResponse`, `CaseSubmitRequest`, `CaseSubmitResponse`, plus the checklist models (`ChecklistStepModel`, `ChecklistResponse`).

- [ ] **Step 1: Create `tools/api/routers/cases.py`**

```python
"""Case simulation endpoints."""
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from tools.api.shared import limiter, _case_cache, PATIENT_SYSTEM
from tools.cases.evaluate_response import evaluate_case
from tools.cases.generate_case import generate_cases as _generate_cases
from tools.cases.get_case_progress import get_case_progress
from tools.cases.load_case import load_case, list_available_cases
from tools.cases.log_case_completion import log_case_completion
from tools.chatbot.log_session import log_session
from tools.flashcards.generate_cards import generate_and_return_cards
from tools.profile.get_profile import get_profile
from tools.shared.gemini_client import stream_ask, MOCK_MODE, MODEL
from tools.shared.jwt_utils import get_current_user, CurrentUser

router = APIRouter()

# ── Models ─────────────────────────────────────────────────────────────────
# (paste CasePatientInfo, CaseInfo, CasesResponse, CaseChatRequest,
#  CaseChatResponse, CaseSubmitRequest, CaseSubmitResponse,
#  ChecklistStepModel, ChecklistResponse from server.py)

# ── Endpoints + _check_case_access ─────────────────────────────────────────
# (paste _check_case_access, get_cases, get_case, get_case_checklist,
#  case_chat, case_submit from server.py, changing @app.* → @router.*)
```

- [ ] **Step 2: Include cases router in server.py**

```python
from tools.api.routers import cases as _cases_router
# ...
app.include_router(_cases_router.router)
```

Delete the moved functions/models from server.py.

- [ ] **Step 3: Update `tests/cases/test_case_access.py` imports and patches**

Change:
```python
# Old
from tools.api.server import app, _check_case_access, _case_cache

# Old patches
patch("tools.api.server.list_available_cases", ...)
patch("tools.api.server.load_case", ...)
patch("tools.api.server.get_case_progress", ...)
patch.dict("tools.api.server._case_cache", ...)
```

To:
```python
# New
from tools.api.server import app
from tools.api.routers.cases import _check_case_access
from tools.api.shared import _case_cache

# New patches
patch("tools.api.routers.cases.list_available_cases", ...)
patch("tools.api.routers.cases.load_case", ...)
patch("tools.api.routers.cases.get_case_progress", ...)
patch.dict("tools.api.shared._case_cache", ...)
```

- [ ] **Step 4: Run cases tests**

```
python -m pytest tests/cases/test_case_access.py -v
```

Expected: 10 passed.

- [ ] **Step 5: Run full suite**

```
python -m pytest --tb=short -q
```

- [ ] **Step 6: Commit**

```bash
git add tools/api/routers/cases.py tools/api/server.py tests/cases/test_case_access.py
git commit -m "refactor: extract cases endpoints into routers/cases.py"
```

---

## Task 4: Extract admin router + update test patches

**Files:**
- Create: `tools/api/routers/admin.py`
- Modify: `tests/api/test_auth_endpoints.py` (the admin endpoint tests)

The admin router contains: `admin_list_approved`, `admin_add_approved`, `admin_delete_approved`, `admin_get_students`, `admin_get_activity`, `admin_promote`, `admin_remove_supervisor`, `admin_student_detail`, `admin_token_summary`, `admin_upload_csv`.

Models: `ApprovedStudentOut`, `TokenSummaryRow`, `TokenSummaryResponse`, and any other admin-specific models from server.py.

- [ ] **Step 1: Create `tools/api/routers/admin.py`**

```python
"""Admin endpoints."""
import csv
import io
import os

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from tools.api.shared import limiter, SUPER_ADMIN_EMAIL
from tools.profile.get_profile import get_profile
from tools.shared.gsheets import get_rows, append_row, update_row
from tools.shared.auth import generate_password, hash_password
from tools.shared.gemini_client import MOCK_MODE, MODEL
from tools.shared.jwt_utils import require_admin, CurrentUser

router = APIRouter()

# (paste all admin models and endpoint functions from server.py,
#  changing @app.* → @router.*)
```

- [ ] **Step 2: Include admin router in server.py**

```python
from tools.api.routers import admin as _admin_router
app.include_router(_admin_router.router)
```

- [ ] **Step 3: Update admin-test patches in `tests/api/test_auth_endpoints.py`**

The `test_student_detail_returns_shape` test patches:
```python
# Old
patch("tools.api.server.get_rows", mock_get_rows)
patch("tools.api.server.get_profile", return_value=profile_data)

# New
patch("tools.api.routers.admin.get_rows", mock_get_rows)
patch("tools.api.routers.admin.get_profile", return_value=profile_data)
```

- [ ] **Step 4: Run full suite**

```
python -m pytest --tb=short -q
```

Expected: 69 passed.

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/admin.py tools/api/server.py tests/api/test_auth_endpoints.py
git commit -m "refactor: extract admin endpoints into routers/admin.py"
```

---

## Task 5: Extract remaining routers (supervisor, chat, checkin, student)

No test patches need updating for these domains — the existing tests patch `tools.supervisor.*` and `tools.profile.*` directly, not `tools.api.server.*`.

**Files:**
- Create: `tools/api/routers/supervisor.py`
- Create: `tools/api/routers/chat.py`
- Create: `tools/api/routers/checkin.py`
- Create: `tools/api/routers/student.py`

### supervisor.py

Endpoints: `supervisor_cohort`, `supervisor_at_risk`, `supervisor_student`, `supervisor_add_note`, `supervisor_report`, `supervisor_benchmarks`, `supervisor_send_digest`, `supervisor_insights`.

```python
"""Supervisor endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
# ... import from tools.supervisor.*, tools.shared.gsheets, tools.shared.jwt_utils

router = APIRouter()
# (paste supervisor models + endpoints, @app.* → @router.*)
```

### chat.py

Endpoints: `chat_endpoint`, `end_session`, `get_progress`, `get_my_progress` (plus `get_progress/{student_id}`).

```python
"""Chat and session endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
# ... import from tools.chatbot.*, tools.flashcards.*, tools.shared.*, tools.progress.*

router = APIRouter()
# (paste chat/progress models + endpoints, @app.* → @router.*)
```

The `_get_context`, `_kb_fallback`, `_RAG_ENABLED`, `_KB_PATH`, `_KB_CACHE` helpers used by the chat endpoint should be defined locally in `chat.py`.

The `_tutor_system` helper moves to `tools.api.shared` (already done in Task 1 as `tutor_system`).

### checkin.py

Endpoints: `checkin_status`, `checkin_question`, `checkin_answer`.

```python
"""Check-in endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
# ... import from tools.shared.gsheets, tools.shared.jwt_utils, tools.shared.gemini_client

router = APIRouter()
# (paste checkin models + endpoints, @app.* → @router.*)
```

### student.py

Endpoints: `set_student_role`, `flashcard_check`, `flashcard_generate`, `study_suggestion`.

```python
"""Student profile and learning endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
# ... import from tools.profile.*, tools.flashcards.*, tools.shared.*

router = APIRouter()
# (paste student models + endpoints, @app.* → @router.*)
```

- [ ] **Step 1: Create all four router files**

For each router file, read the corresponding sections in `tools/api/server.py`, copy the models and endpoint functions, change `@app.*` to `@router.*`, and fix imports.

- [ ] **Step 2: Include all four routers in server.py**

```python
from tools.api.routers import supervisor as _supervisor_router
from tools.api.routers import chat as _chat_router
from tools.api.routers import checkin as _checkin_router
from tools.api.routers import student as _student_router

app.include_router(_supervisor_router.router)
app.include_router(_chat_router.router)
app.include_router(_checkin_router.router)
app.include_router(_student_router.router)
```

Delete the moved code from server.py.

- [ ] **Step 3: Verify server imports cleanly**

```
python -c "from tools.api.server import app; print(len(app.routes), 'routes')"
```

Expected: a number >= 38 (the total route count).

- [ ] **Step 4: Run full suite**

```
python -m pytest --tb=short -q
```

Expected: 69 passed.

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/supervisor.py tools/api/routers/chat.py tools/api/routers/checkin.py tools/api/routers/student.py tools/api/server.py
git commit -m "refactor: extract supervisor, chat, checkin, student endpoints into routers"
```

---

## Task 6: Final server.py cleanup and full verification

**Files:**
- Modify: `tools/api/server.py`

After Tasks 1–5, `server.py` should contain only:
- imports for app init
- `app = FastAPI(...)`, middleware, static files
- `/health` and `/api/status` endpoints
- All `app.include_router(...)` calls

- [ ] **Step 1: Read server.py and verify it's clean**

It should be roughly this:

```python
#!/usr/bin/env python3
"""EyeBot API — composition root. Run: uvicorn tools.api.server:app --reload --port 8000"""
import os
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.api.shared import limiter
from tools.api.routers import auth, chat, cases, checkin, student, supervisor, admin

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

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(cases.router)
app.include_router(checkin.router)
app.include_router(student.router)
app.include_router(supervisor.router)
app.include_router(admin.router)

# Static files (React frontend)
_DIST = PROJECT_ROOT / "frontend" / "dist"
if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(_DIST / "assets")), name="assets")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/status")
    def api_status():
        from tools.shared.gemini_client import MOCK_MODE, MODEL
        return {"mock_mode": MOCK_MODE, "model": MODEL}

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        return FileResponse(str(_DIST / "index.html"))
```

- [ ] **Step 2: Count lines in the final server.py**

```
python -c "print(len(open('tools/api/server.py').readlines()), 'lines')"
```

Expected: under 80 lines.

- [ ] **Step 3: Run the complete test suite**

```
python -m pytest -v --tb=short
```

Expected: 69 passed, 0 failed.

- [ ] **Step 4: Count lines in each router file (sanity check)**

```
python -c "
import pathlib
for f in sorted(pathlib.Path('tools/api/routers').glob('*.py')):
    lines = len(f.read_text().splitlines())
    print(f'{f.name}: {lines} lines')
"
```

Each router should be under 400 lines. If any is over 500, flag it.

- [ ] **Step 5: Final commit**

```bash
git add tools/api/server.py
git commit -m "refactor: server.py is now a composition root under 80 lines"
```
