# JWT Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the insecure UUID-in-body identity model with signed JWT tokens so every protected API endpoint cryptographically verifies who is calling it.

**Architecture:** On login the server issues an HS256 JWT containing `{sub: student_id, role, student_role, exp}`. The frontend stores this token and sends it as `Authorization: Bearer <token>` on every request. The backend verifies the token in a shared FastAPI dependency; the student's identity comes from the token payload, not from the request body or a custom header.

**Tech Stack:** `python-jose[cryptography]` (JWT signing/verification), FastAPI `Depends` (dependency injection), React `sessionStorage` (token storage on frontend)

---

## Files Modified / Created

| Action | Path | Purpose |
|--------|------|---------|
| Create | `tools/shared/jwt_utils.py` | Token creation, decoding, FastAPI dependencies |
| Create | `tests/shared/test_jwt_utils.py` | Unit tests for JWT utilities |
| Create | `tests/api/test_jwt_endpoints.py` | Integration tests for protected endpoints |
| Modify | `requirements.txt` | Add `python-jose[cryptography]` |
| Modify | `.env.template` | Add `JWT_SECRET` variable |
| Modify | `tools/api/server.py` | Login returns token; all protected endpoints use JWT deps |
| Modify | `frontend/src/app/components/AuthContext.tsx` | Store token, expose `authHeaders` helper |
| Modify | `frontend/src/app/components/OnboardingScreen.tsx` | Read `token` from login response |
| Modify | `frontend/src/app/components/ChangePasswordModal.tsx` | Send Authorization header |
| Modify | `frontend/src/app/components/ChatScreen.tsx` | Send Authorization header |
| Modify | `frontend/src/app/components/CaseListScreen.tsx` | Send Authorization header |
| Modify | `frontend/src/app/components/CaseSessionScreen.tsx` | Send Authorization header |
| Modify | `frontend/src/app/components/DashboardScreen.tsx` | Send Authorization header |
| Modify | `frontend/src/app/components/DailyCheckInScreen.tsx` | Send Authorization header |
| Modify | `frontend/src/app/components/FlashcardScreen.tsx` | Send Authorization header |
| Modify | `frontend/src/app/components/ProgressScreen.tsx` | Send Authorization header |
| Modify | `frontend/src/app/components/SupervisorDashboard.tsx` | Send Authorization header (replaces X-Supervisor-ID) |
| Modify | `frontend/src/app/components/AdminDashboard.tsx` | Send Authorization header (replaces X-Admin-ID) |
| Modify | `frontend/src/app/components/AdminStudentDetail.tsx` | Send Authorization header |
| Modify | `frontend/src/app/components/StudentDrillDown.tsx` | Send Authorization header |

---

## Task 1: Add JWT library and create utility module

**Files:**
- Modify: `requirements.txt`
- Modify: `.env.template`
- Create: `tools/shared/jwt_utils.py`
- Create: `tests/shared/test_jwt_utils.py`

- [ ] **Step 1: Add python-jose to requirements.txt**

Open `requirements.txt` and add after the `# Authentication` line:
```
# Authentication
bcrypt>=4.0.0
python-jose[cryptography]>=3.3.0
```

- [ ] **Step 2: Add JWT_SECRET to .env.template**

Open `.env.template` and add:
```
# JWT Authentication
# Generate with: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET=replace-with-a-random-64-char-hex-string
JWT_EXPIRE_HOURS=8
```

- [ ] **Step 3: Add JWT_SECRET to your local .env**

Run in terminal to generate a secure key:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```
Copy the output and add to `.env`:
```
JWT_SECRET=<paste-generated-key-here>
JWT_EXPIRE_HOURS=8
```

- [ ] **Step 4: Write the failing tests first**

Create `tests/shared/test_jwt_utils.py`:
```python
import pytest
from fastapi import HTTPException


def test_create_and_decode_token():
    from tools.shared.jwt_utils import create_access_token, decode_token
    token = create_access_token("student-uuid-123", "student", "OA")
    assert isinstance(token, str)
    assert len(token) > 20

    payload = decode_token(token)
    assert payload["sub"] == "student-uuid-123"
    assert payload["role"] == "student"
    assert payload["student_role"] == "OA"


def test_decode_invalid_token_raises_401():
    from tools.shared.jwt_utils import decode_token
    with pytest.raises(HTTPException) as exc_info:
        decode_token("not.a.valid.token")
    assert exc_info.value.status_code == 401


def test_decode_tampered_token_raises_401():
    from tools.shared.jwt_utils import create_access_token, decode_token
    token = create_access_token("student-uuid-123", "student", "OA")
    # Corrupt the signature
    parts = token.split(".")
    tampered = parts[0] + "." + parts[1] + ".badsignature"
    with pytest.raises(HTTPException) as exc_info:
        decode_token(tampered)
    assert exc_info.value.status_code == 401


def test_supervisor_role_in_token():
    from tools.shared.jwt_utils import create_access_token, decode_token
    token = create_access_token("supervisor-uuid", "supervisor", "")
    payload = decode_token(token)
    assert payload["role"] == "supervisor"
    assert payload["student_role"] == ""


def test_admin_role_in_token():
    from tools.shared.jwt_utils import create_access_token, decode_token
    token = create_access_token("admin-uuid", "admin", "")
    payload = decode_token(token)
    assert payload["role"] == "admin"
```

- [ ] **Step 5: Run the tests — expect ImportError (module not created yet)**

```bash
pytest tests/shared/test_jwt_utils.py -v
```
Expected: `ModuleNotFoundError: No module named 'tools.shared.jwt_utils'`

- [ ] **Step 6: Install the new dependency**

```bash
pip install python-jose[cryptography]
```

- [ ] **Step 7: Create tools/shared/jwt_utils.py**

```python
import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt
from typing import TypedDict

_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-set-JWT_SECRET-in-env")
_ALGORITHM = "HS256"
_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "8"))


class CurrentUser(TypedDict):
    sub: str           # student_id (UUID)
    role: str          # "student" | "supervisor" | "admin"
    student_role: str  # "OA" | "OT" | "PSA" | ""


def create_access_token(student_id: str, role: str, student_role: str = "") -> str:
    payload = {
        "sub": student_id,
        "role": role,
        "student_role": student_role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=_EXPIRE_HOURS),
    }
    return jwt.encode(payload, _SECRET, algorithm=_ALGORITHM)


def decode_token(token: str) -> CurrentUser:
    try:
        payload = jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])
        return CurrentUser(
            sub=payload["sub"],
            role=payload.get("role", "student"),
            student_role=payload.get("student_role", ""),
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


def get_current_user(authorization: str = Header(...)) -> CurrentUser:
    """FastAPI dependency: extracts and verifies JWT from Authorization header."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header must start with 'Bearer '",
        )
    return decode_token(authorization[7:])


def require_supervisor(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """FastAPI dependency: requires supervisor or admin role."""
    if current_user["role"] not in ("supervisor", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Supervisor access required")
    return current_user


def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """FastAPI dependency: requires admin role."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user
```

- [ ] **Step 8: Run the tests — expect all to pass**

```bash
pytest tests/shared/test_jwt_utils.py -v
```
Expected output:
```
tests/shared/test_jwt_utils.py::test_create_and_decode_token PASSED
tests/shared/test_jwt_utils.py::test_decode_invalid_token_raises_401 PASSED
tests/shared/test_jwt_utils.py::test_decode_tampered_token_raises_401 PASSED
tests/shared/test_jwt_utils.py::test_supervisor_role_in_token PASSED
tests/shared/test_jwt_utils.py::test_admin_role_in_token PASSED
```

- [ ] **Step 9: Commit**

```bash
git add requirements.txt .env.template tools/shared/jwt_utils.py tests/shared/test_jwt_utils.py
git commit -m "feat: add JWT utility module with token creation and FastAPI dependencies"
```

---

## Task 2: Update login endpoint to issue JWT

**Files:**
- Modify: `tools/api/server.py` (lines 282–290 and 379–387)

- [ ] **Step 1: Add `token` field to LoginResponse model**

In `server.py`, find the `LoginResponse` class (around line 282) and add the `token` field:

```python
class LoginResponse(BaseModel):
    student_id: str
    full_name: str
    role: str
    student_role: str
    must_change: bool
    is_new: bool
    mock_mode: bool
    token: str  # signed JWT — send as Authorization: Bearer <token>
```

- [ ] **Step 2: Import jwt_utils in server.py**

At the top of `server.py`, after the existing imports from `tools.shared`, add:
```python
from tools.shared.jwt_utils import (
    create_access_token,
    get_current_user,
    require_supervisor,
    require_admin,
    CurrentUser,
)
```

- [ ] **Step 3: Remove the old SUPER_ADMIN_EMAIL hardcode — move to env**

Find line 174 in `server.py`:
```python
SUPER_ADMIN_EMAIL = "snec.tne.edu@gmail.com"
```
Replace with:
```python
SUPER_ADMIN_EMAIL = os.getenv("SUPER_ADMIN_EMAIL", "snec.tne.edu@gmail.com")
```

Add `SUPER_ADMIN_EMAIL=snec.tne.edu@gmail.com` to both `.env` and `.env.template`.

- [ ] **Step 4: Update auth_login to issue a token**

Find the `return LoginResponse(...)` block at the end of `auth_login` (around line 379) and update it:

```python
    token = create_access_token(student_id, final_role, approved_student_role)

    return LoginResponse(
        student_id=student_id,
        full_name=full_name,
        role=final_role,
        student_role=approved_student_role,
        must_change=must_change,
        is_new=is_new,
        mock_mode=MOCK_MODE,
        token=token,
    )
```

- [ ] **Step 5: Add /api/auth/me endpoint**

After the `auth_login` endpoint, add:
```python
@app.get("/api/auth/me")
def auth_me(current_user: CurrentUser = Depends(get_current_user)):
    """Validate a token and return the caller's identity. Used by the frontend on app load."""
    return {
        "student_id": current_user["sub"],
        "role": current_user["role"],
        "student_role": current_user["student_role"],
    }
```

- [ ] **Step 6: Start the server and manually verify login returns a token**

```bash
uvicorn tools.api.server:app --reload --port 8000
```
Then in another terminal:
```bash
curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<your-test-email>","password":"<your-password>"}' | python -m json.tool
```
Expected: response JSON includes a `"token"` field containing a string like `eyJ...`

- [ ] **Step 7: Verify /api/auth/me works**

```bash
TOKEN="<paste-token-from-above>"
curl -s http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```
Expected: `{"student_id": "...", "role": "student", "student_role": "OA"}`

- [ ] **Step 8: Verify /api/auth/me rejects bad tokens**

```bash
curl -s http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer bad.token.here"
```
Expected: `{"detail": "Invalid or expired token"}` with HTTP 401

- [ ] **Step 9: Commit**

```bash
git add tools/api/server.py .env.template
git commit -m "feat: login endpoint issues JWT; add /api/auth/me validation endpoint"
```

---

## Task 3: Protect all student endpoints with JWT

**Files:**
- Modify: `tools/api/server.py` (multiple endpoint functions)

The strategy: add `current_user: CurrentUser = Depends(get_current_user)` to every student endpoint. Use `current_user["sub"]` as the student identity instead of `body.student_id` or query params. The body can still contain `student_id` (no breaking frontend change needed), but the backend ignores it for identity — the JWT is authoritative.

- [ ] **Step 1: Protect /api/chat**

Find the `chat` function (around line 544). Update its signature and replace `body.student_id`:
```python
@app.post("/api/chat")
@limiter.limit("30/minute")
def chat(request: Request, body: ChatRequest, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]  # identity from JWT, not body
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
        # ... (keep existing sse_stream body unchanged)
```

- [ ] **Step 2: Protect /api/end-session**

Find `end_session` (around line 588). Update:
```python
@app.post("/api/end-session", response_model=EndSessionResponse)
@limiter.limit("10/minute")
def end_session(request: Request, body: EndSessionRequest, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]  # identity from JWT
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
```

- [ ] **Step 3: Protect /api/progress/{student_id}**

Find `get_student_progress` (around line 640). Update:
```python
@app.get("/api/progress/{student_id}")
def get_student_progress(student_id: str, current_user: CurrentUser = Depends(get_current_user)):
    # Students can only view their own progress; supervisors/admins can view anyone's
    if current_user["role"] == "student" and student_id != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        return _get_progress(student_id)
    except Exception as exc:
        print(f"[progress-error] {exc}", flush=True)
        raise HTTPException(status_code=500, detail="Could not load progress data")
```

- [ ] **Step 4: Protect /api/cases (GET)**

Find `get_cases` (around line 727). Update:
```python
@app.get("/api/cases", response_model=CasesResponse)
def get_cases(current_user: CurrentUser = Depends(get_current_user)):
    import json as _json
    student_id = current_user["sub"]
    role = current_user.get("student_role", "OA") or "OA"
    # ... rest of function uses student_id instead of the old query param ...
```

Note: remove the `student_id: str = ""` parameter entirely. The function body references `student_id` and `role` — update all those references to use the JWT values:
```python
    weak_topics: list[str] = []
    try:
        profile = get_profile(student_id)
        role = profile.get("role", role) or role
        weak_topics = _json.loads(profile.get("weak_topics", "[]") or "[]")
    except Exception:
        pass
```
(Keep the rest of the function body unchanged, just replace references to the old `student_id` param)

- [ ] **Step 5: Protect /api/cases/{case_id}/chat**

Find `case_chat` (around line 889). Update:
```python
@app.post("/api/cases/{case_id}/chat")
@limiter.limit("30/minute")
def case_chat(case_id: str, request: Request, body: CaseChatRequest, current_user: CurrentUser = Depends(get_current_user)):
    # student_id available as current_user["sub"] if needed
    # ... rest of function unchanged ...
```

- [ ] **Step 6: Protect /api/cases/{case_id}/submit**

Find `case_submit` (around line 926). Update:
```python
@app.post("/api/cases/{case_id}/submit", response_model=CaseSubmitResponse)
def case_submit(case_id: str, body: CaseSubmitRequest, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]  # identity from JWT
    # Replace ALL body.student_id references with student_id
```

Replace every occurrence of `body.student_id` in this function with `student_id`.

- [ ] **Step 7: Protect check-in endpoints**

Find `checkin_status` (around line 1156). Update:
```python
@app.get("/api/checkin/status", response_model=CheckinStatusResponse)
def checkin_status(current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]
    try:
        profile = get_profile(student_id)
    except Exception:
        return CheckinStatusResponse(checkin_done_today=True, streak=0, weak_topic=None)
    # ... rest unchanged, replace `student_id` references ...
```

Find `checkin_question` (around line 1237). Update:
```python
@app.get("/api/checkin/question", response_model=CheckinQuestionResponse)
@limiter.limit("10/minute")
def checkin_question(request: Request, current_user: CurrentUser = Depends(get_current_user)):
    import json as _json
    student_id = current_user["sub"]
    # ... replace body/param student_id with student_id from JWT ...
```

Find `checkin_answer` (around line 1279). Update:
```python
@app.post("/api/checkin/answer", response_model=CheckinAnswerResponse)
@limiter.limit("10/minute")
def checkin_answer(request: Request, body: CheckinAnswerRequest, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]  # identity from JWT
    ctx_block = _student_context_block(student_id)
    # ... replace body.student_id with student_id ...
    try:
        update_profile(student_id, checkin_done=True)
    except Exception:
        pass
```

- [ ] **Step 8: Protect /api/auth/change-password**

Find `auth_change_password` (around line 390). Update:
```python
@app.post("/api/auth/change-password")
async def auth_change_password(body: ChangePasswordRequest, current_user: CurrentUser = Depends(get_current_user)):
    student_id = current_user["sub"]  # identity from JWT
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    consent = get_rows("snec_consent", filters={"student_id": student_id})
    if not consent:
        raise HTTPException(status_code=404, detail="Student not found.")
    # ... rest of function unchanged ...
```

- [ ] **Step 9: Update CORS to allow Authorization header explicitly**

Find the `CORSMiddleware` block (around line 166) and update:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)
```

- [ ] **Step 10: Test all endpoints reject requests with no token**

With server running:
```bash
# Should return 422 (missing Authorization header)
curl -s -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"student_id":"fake","messages":[{"role":"user","content":"hello"}]}'
```
Expected: `{"detail": [{"msg": "Field required", ...}]}` with 422, or 401 if header present but bad.

```bash
# Should return 401 (bad token)
curl -s -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer bad.token" \
  -d '{"student_id":"fake","messages":[{"role":"user","content":"hello"}]}'
```
Expected: `{"detail": "Invalid or expired token"}` with 401.

- [ ] **Step 11: Commit**

```bash
git add tools/api/server.py
git commit -m "feat: protect all student endpoints with JWT — identity from token, not request body"
```

---

## Task 4: Replace header-based supervisor/admin auth with JWT

**Files:**
- Modify: `tools/api/server.py` (supervisor and admin endpoint signatures)

The old `_require_supervisor` and `_require_admin` functions read `X-Supervisor-ID` / `X-Admin-ID` headers and do a database lookup. These are replaced by `require_supervisor` and `require_admin` from `jwt_utils.py`, which check the JWT role claim. No database call needed.

- [ ] **Step 1: Delete the old _require_supervisor and _require_admin functions**

Find and delete the `_require_supervisor` function (lines 187–199) and the `_require_admin` function (lines 202–215) entirely. They are replaced by the JWT-based versions imported from `jwt_utils`.

- [ ] **Step 2: Update all supervisor endpoint signatures**

Replace every `_: str = Depends(_require_supervisor)` and `supervisor_id: str = Depends(_require_supervisor)` with `current_user: CurrentUser = Depends(require_supervisor)`.

Affected endpoints:
- `supervisor_cohort`
- `supervisor_at_risk`
- `supervisor_student`
- `supervisor_save_note`
- `supervisor_student_report`
- `supervisor_benchmarks`
- `supervisor_send_digest`

For `supervisor_send_digest`, the old code used `supervisor_id` — update its body to not need it (the identity comes from `current_user["sub"]` if needed):
```python
@app.post("/api/supervisor/send-digest")
def supervisor_send_digest(body: DigestRequest, current_user: CurrentUser = Depends(require_supervisor)):
    try:
        _send_digest(body.recipient)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="Could not send digest. Please try again.")
    except Exception:
        raise HTTPException(status_code=500, detail="Could not send digest. Please try again.")
    return {"ok": True, "sent_to": body.recipient}
```

- [ ] **Step 3: Update all admin endpoint signatures**

Replace every `_: str = Depends(_require_admin)` and `admin_id: str = Depends(_require_admin)` with `current_user: CurrentUser = Depends(require_admin)`.

Affected endpoints:
- `admin_list_approved`
- `admin_approve_student` — also update the `admin_email` lookup:
  ```python
  # OLD: admin_email = _get_email_for_id(admin_id)
  # NEW: get admin email from consent table using JWT sub
  admin_email_rows = get_rows("snec_consent", filters={"student_id": current_user["sub"]})
  admin_email = admin_email_rows[0].get("email", "") if admin_email_rows else ""
  ```
- `admin_unapprove_student`
- `admin_all_students`
- `admin_activity`

Also fix error detail leakage in admin endpoints — replace `detail=str(exc)` with generic messages:
```python
# Find all instances of: raise HTTPException(status_code=500, detail=str(exc))
# Replace with:
import logging
logger = logging.getLogger(__name__)
# ... in each except block:
logger.error("Admin operation failed: %s", exc, exc_info=True)
raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
```

- [ ] **Step 4: Delete the _get_email_for_id function if no longer needed**

Check if `_get_email_for_id` is still called anywhere after the changes above. If not, delete it (lines 177–184).

- [ ] **Step 5: Remove the plaintext password from admin_approve_student response**

Find line 1494:
```python
return {"ok": True, "password": plain_pw}
```
Replace with:
```python
return {"ok": True}
```
The password is already emailed to the student. It must never appear in API responses.

- [ ] **Step 6: Test supervisor endpoints with no/bad token**

```bash
# Should return 422 or 401
curl -s http://localhost:8000/api/supervisor/cohort
```
Expected: 422 (missing Authorization header)

```bash
# Should return 403 (student token, not supervisor)
STUDENT_TOKEN="<token from student login>"
curl -s http://localhost:8000/api/supervisor/cohort \
  -H "Authorization: Bearer $STUDENT_TOKEN"
```
Expected: `{"detail": "Supervisor access required"}` with 403.

- [ ] **Step 7: Commit**

```bash
git add tools/api/server.py
git commit -m "feat: supervisor/admin endpoints use JWT role claims instead of custom headers"
```

---

## Task 5: Update frontend AuthContext to store and expose JWT

**Files:**
- Modify: `frontend/src/app/components/AuthContext.tsx`

- [ ] **Step 1: Add token to the User interface and AuthContext**

Replace the entire `AuthContext.tsx` content:

```tsx
import React, { createContext, useContext, useState, useEffect } from "react";

interface User {
  fullName: string;
  email: string;
  role: "student" | "supervisor" | "admin";
  studentId: string;
  studentRole: "OA" | "OT" | "PSA" | "";
  mustChangePassword: boolean;
  token: string;  // JWT access token
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isCheckInDone: boolean;
  login: (userData: User) => void;
  logout: () => void;
  setCheckInDone: (done: boolean) => void;
  setStudentRole: (role: "OA" | "OT" | "PSA") => void;
  setMustChangePassword: (v: boolean) => void;
  loading: boolean;
  authHeaders: Record<string, string>;  // { Authorization: "Bearer <token>" }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isCheckInDone, setIsCheckInDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem("eyebot_token");
    if (!token) {
      setLoading(false);
      return;
    }

    // Validate token with backend on every app load
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Token invalid");
        return res.json();
      })
      .then(() => {
        const storedUser = sessionStorage.getItem("eyebot_user");
        const checkInStatus = sessionStorage.getItem("eyebot_checkin_done") === "true";
        const mustChange = sessionStorage.getItem("eyebot_must_change") === "true";
        const storedStudentRole = (sessionStorage.getItem("eyebot_student_role") ?? "") as "OA" | "OT" | "PSA" | "";

        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          setUser({
            ...parsed,
            token,
            mustChangePassword: mustChange,
            studentRole: storedStudentRole,
          });
          setIsCheckInDone(checkInStatus);
        }
      })
      .catch(() => {
        // Token invalid or expired — clear everything
        sessionStorage.clear();
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    sessionStorage.setItem("eyebot_token", userData.token);
    sessionStorage.setItem("eyebot_user", JSON.stringify({
      fullName: userData.fullName,
      email: userData.email,
      studentId: userData.studentId,
      role: userData.role,
    }));
    sessionStorage.setItem("eyebot_student_role", userData.studentRole ?? "");
    sessionStorage.setItem("eyebot_must_change", userData.mustChangePassword ? "true" : "false");
    setLoading(false);
  };

  const setMustChangePassword = (v: boolean) => {
    sessionStorage.setItem("eyebot_must_change", v ? "true" : "false");
    setUser((prev) => prev ? { ...prev, mustChangePassword: v } : prev);
  };

  const setStudentRole = (role: "OA" | "OT" | "PSA") => {
    sessionStorage.setItem("eyebot_student_role", role);
    setUser((prev) => prev ? { ...prev, studentRole: role } : prev);
  };

  const logout = () => {
    setUser(null);
    setIsCheckInDone(false);
    sessionStorage.clear();
  };

  const setCheckInDone = (done: boolean) => {
    setIsCheckInDone(done);
    sessionStorage.setItem("eyebot_checkin_done", done ? "true" : "false");
  };

  const authHeaders: Record<string, string> = user?.token
    ? { Authorization: `Bearer ${user.token}` }
    : {};

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isCheckInDone,
      login,
      logout,
      setCheckInDone,
      setStudentRole,
      setMustChangePassword,
      loading,
      authHeaders,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
```

- [ ] **Step 2: Update OnboardingScreen to pass token into login()**

In `OnboardingScreen.tsx`, find the `LoginResult` interface (around line 21) and add `token`:
```tsx
interface LoginResult {
  student_id: string;
  role: string;
  student_role: string;
  must_change: boolean;
  is_new: boolean;
  mock_mode: boolean;
  full_name?: string;
  email?: string;
  token: string;  // NEW
}
```

Find both calls to `login({...})` in `handleLogin` and `completeLogin` and add `token: data.token`:
```tsx
// In handleLogin (must_change flow):
login({
  fullName: data.full_name ?? email,
  email: email.trim().toLowerCase(),
  studentId: data.student_id,
  role: data.role as "student" | "supervisor" | "admin",
  studentRole: (data.student_role ?? "") as "OA" | "OT" | "PSA" | "",
  mustChangePassword: true,
  token: data.token,  // ADD THIS
});

// In completeLogin:
login({
  fullName: data.full_name ?? email,
  email: email.trim().toLowerCase(),
  studentId: data.student_id,
  role: data.role as "student" | "supervisor" | "admin",
  studentRole: (studentRole ?? data.student_role ?? "") as "OA" | "OT" | "PSA" | "",
  mustChangePassword: false,
  token: data.token,  // ADD THIS
});
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/AuthContext.tsx frontend/src/app/components/OnboardingScreen.tsx
git commit -m "feat: frontend stores JWT in sessionStorage and validates on app load"
```

---

## Task 6: Add Authorization header to all frontend API calls

**Files:** All screen components that make API calls.

The pattern for every `fetch()` call: add `...authHeaders` to the headers object.

First, add `const { authHeaders } = useAuth();` to any component that doesn't already destructure it.

- [ ] **Step 1: Update ChangePasswordModal.tsx**

Find the file at `frontend/src/app/components/ChangePasswordModal.tsx`. Add `authHeaders` to the component:
```tsx
const { user, authHeaders, setMustChangePassword } = useAuth();
```

Find the `fetch("/api/auth/change-password", ...)` call and add the Authorization header:
```tsx
const res = await fetch("/api/auth/change-password", {
  method: "POST",
  headers: { "Content-Type": "application/json", ...authHeaders },
  body: JSON.stringify({ ... }),
});
```

- [ ] **Step 2: Update ChatScreen.tsx**

Open `frontend/src/app/components/ChatScreen.tsx`. Add `authHeaders` to the `useAuth()` destructure. Find the `fetch("/api/chat", ...)` and `fetch("/api/end-session", ...)` calls and add `...authHeaders` to their headers objects.

For the streaming fetch (SSE), it's already using `fetch()` with a body, so:
```tsx
const res = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json", ...authHeaders },
  body: JSON.stringify({ student_id: user.studentId, messages: apiMessages }),
});
```

- [ ] **Step 3: Update CaseListScreen.tsx**

Add `authHeaders` to destructure. Find `fetch("/api/cases", ...)` and add:
```tsx
const res = await fetch(`/api/cases`, {
  headers: { ...authHeaders },
});
```
Remove the `?student_id=${user.studentId}` query param (the backend now reads it from JWT).

- [ ] **Step 4: Update CaseSessionScreen.tsx**

Add `authHeaders` to destructure. Find all `fetch(...)` calls (case chat, case submit) and add `...authHeaders` to their headers.

- [ ] **Step 5: Update DashboardScreen.tsx**

Add `authHeaders` to destructure. Find all `fetch(...)` calls and add `...authHeaders`.

- [ ] **Step 6: Update DailyCheckInScreen.tsx**

Add `authHeaders` to destructure. Find all `fetch(...)` calls (`/api/checkin/status`, `/api/checkin/question`, `/api/checkin/answer`) and add `...authHeaders`.

Remove `?student_id=${user.studentId}` from the GET calls — the backend reads identity from JWT now:
```tsx
// OLD: fetch(`/api/checkin/status?student_id=${user.studentId}`)
// NEW:
fetch("/api/checkin/status", { headers: { ...authHeaders } })
```

- [ ] **Step 7: Update FlashcardScreen.tsx**

Add `authHeaders` to destructure. Find all `fetch(...)` calls and add `...authHeaders`.

- [ ] **Step 8: Update ProgressScreen.tsx**

Add `authHeaders` to destructure. Find the progress fetch and add `...authHeaders`.

- [ ] **Step 9: Update SupervisorDashboard.tsx**

Add `authHeaders` to destructure. Replace all `"X-Supervisor-ID": user.studentId` headers with `...authHeaders`:
```tsx
// OLD:
headers: { "Content-Type": "application/json", "X-Supervisor-ID": user.studentId }

// NEW:
headers: { "Content-Type": "application/json", ...authHeaders }
```

Do this for every `fetch(...)` call in this component.

- [ ] **Step 10: Update AdminDashboard.tsx**

Add `authHeaders` to destructure. Replace all `"X-Admin-ID": user.studentId` headers with `...authHeaders`:
```tsx
// OLD:
headers: { "X-Admin-ID": user.studentId }

// NEW:
headers: { ...authHeaders }
```

- [ ] **Step 11: Update AdminStudentDetail.tsx and StudentDrillDown.tsx**

Add `authHeaders` to destructure. Replace any `X-Supervisor-ID` or `X-Admin-ID` headers with `...authHeaders`.

- [ ] **Step 12: Run TypeScript compiler to check for errors**

```bash
cd frontend
npx tsc --noEmit
```
Expected: no errors. Fix any type errors before continuing.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/app/components/
git commit -m "feat: all frontend API calls send Authorization: Bearer token"
```

---

## Task 7: End-to-end verification

- [ ] **Step 1: Start the backend**

```bash
uvicorn tools.api.server:app --reload --port 8000
```

- [ ] **Step 2: Start the frontend**

```bash
cd frontend
pnpm dev
```

- [ ] **Step 3: Test the full login flow**

1. Open http://localhost:5173
2. Log in with a valid student account
3. Open browser DevTools → Network tab
4. Click any chat message or navigate to a screen that makes API calls
5. Inspect the request headers — confirm `Authorization: Bearer eyJ...` is present

- [ ] **Step 4: Test that spoofing another student fails**

With browser DevTools → Console:
```js
// Try calling chat with another student's ID
fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ student_id: "some-other-uuid", messages: [{ role: "user", content: "test" }] })
})
.then(r => r.text()).then(console.log)
```
Expected: `{"detail": "Field required"}` or 422/401 — **the student_id in the body is now ignored; what matters is the JWT**.

- [ ] **Step 5: Test supervisor can't access admin endpoints**

Log in as a supervisor user. In DevTools console:
```js
fetch("/api/admin/approved", {
  headers: { Authorization: `Bearer ${JSON.parse(sessionStorage.eyebot_user || '{}').token || sessionStorage.eyebot_token}` }
})
.then(r => r.status + " " + r.statusText).then(console.log)
```
Expected: `403 Forbidden`

- [ ] **Step 6: Test that a cleared session correctly redirects to login**

1. Open the app while logged in
2. In DevTools console: `sessionStorage.clear()`
3. Refresh the page
4. Expected: redirected to login screen (token validation fails → logout)

- [ ] **Step 7: Run the full test suite**

```bash
pytest tests/ -v
```
Expected: all existing tests pass (new JWT tests pass too).

- [ ] **Step 8: Final commit**

```bash
git add .
git commit -m "feat: JWT auth end-to-end — all endpoints verified, tests passing"
```

---

## Verification Summary

| Check | How to verify |
|-------|---------------|
| Login returns `token` field | `curl POST /api/auth/login` → JSON has `token` |
| `/api/auth/me` validates token | `curl GET /api/auth/me -H "Authorization: Bearer <token>"` → 200; bad token → 401 |
| `/api/chat` requires JWT | Call without header → 422; with bad token → 401; with valid student token → 200 |
| `/api/supervisor/cohort` requires supervisor role | Student token → 403; supervisor token → 200 |
| `/api/admin/approved` requires admin role | Student/supervisor token → 403; admin token → 200 |
| Frontend sends Authorization header | DevTools Network → confirm header present on every API request |
| Session validated on app load | Corrupt `sessionStorage.eyebot_token` → page redirects to login |
| Plaintext password gone | `POST /api/admin/approved` response has no `password` field |

---

## Notes for Implementer

- **Never commit `.env`** — it contains your real `JWT_SECRET`
- `JWT_SECRET` must be at least 32 bytes of randomness in production — use `python -c "import secrets; print(secrets.token_hex(32))"`
- The `dev-only-secret-set-JWT_SECRET-in-env` fallback in `jwt_utils.py` is intentional for local dev — it must not reach production
- If you add a new endpoint in the future, always include `current_user: CurrentUser = Depends(get_current_user)` — there is no global auth middleware; you must opt-in per endpoint
