# Admin Dashboard & Password Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add password-based login for all users, a full admin dashboard with student detail modal, CSV bulk import, and in-app account management.

**Architecture:** bcrypt passwords stored in a new `snec_auth` Google Sheet; new `/api/auth/login` endpoint replaces the onboarding entry point; frontend gains `AdminGuard`, `ChangePasswordModal`, `AdminStudentDetail`, and an expanded 4-tab `AdminDashboard`.

**Tech Stack:** FastAPI (Python), bcrypt>=4.0, React/TypeScript, Framer Motion, Tailwind CSS, Google Sheets via gsheets.py, Gmail API via gmail_sender.py

---

## File Map

| File | Action |
|---|---|
| `tools/shared/auth.py` | **Create** — bcrypt helpers |
| `requirements.txt` | **Modify** — add bcrypt>=4.0 |
| `tools/api/server.py` | **Modify** — 6 new/extended endpoints |
| `frontend/src/app/components/AuthContext.tsx` | **Modify** — add mustChangePassword to User |
| `frontend/src/app/components/AdminGuard.tsx` | **Create** — admin-only route guard |
| `frontend/src/app/routes.tsx` | **Modify** — wrap /admin with AdminGuard |
| `frontend/src/app/components/ChangePasswordModal.tsx` | **Create** — change password form |
| `frontend/src/app/components/OnboardingScreen.tsx` | **Modify** — email+password login flow |
| `frontend/src/app/components/AdminStudentDetail.tsx` | **Create** — student detail modal |
| `frontend/src/app/components/AdminDashboard.tsx` | **Modify** — 4-tab expansion |
| `tests/auth/test_auth.py` | **Create** — auth helper tests |
| `tests/api/test_auth_endpoints.py` | **Create** — endpoint tests |

---

### Task 1: bcrypt helpers + requirements

**Files:**
- Create: `tools/shared/auth.py`
- Create: `tests/auth/test_auth.py`
- Modify: `requirements.txt`

- [ ] **Step 1: Write the failing tests**

```python
# tests/auth/test_auth.py
import pytest
from tools.shared.auth import hash_password, verify_password, generate_password


def test_hash_password_returns_string():
    h = hash_password("secret123")
    assert isinstance(h, str)
    assert h.startswith("$2b$")


def test_verify_password_correct():
    h = hash_password("correct")
    assert verify_password("correct", h) is True


def test_verify_password_wrong():
    h = hash_password("correct")
    assert verify_password("wrong", h) is False


def test_generate_password_length():
    p = generate_password()
    assert len(p) == 10


def test_generate_password_alphanumeric():
    for _ in range(20):
        p = generate_password()
        assert p.isalnum()


def test_generate_password_unique():
    passwords = {generate_password() for _ in range(50)}
    assert len(passwords) > 45
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/auth/test_auth.py -v
```
Expected: `ModuleNotFoundError: No module named 'tools.shared.auth'`

- [ ] **Step 3: Add bcrypt to requirements.txt**

Open `requirements.txt` and add on its own line:
```
bcrypt>=4.0
```

- [ ] **Step 4: Install**

```
pip install bcrypt>=4.0
```

- [ ] **Step 5: Create `tools/shared/auth.py`**

```python
#!/usr/bin/env python3
"""Password hashing and verification helpers using bcrypt."""

import random
import string
import bcrypt

_ALPHABET = string.ascii_letters + string.digits
_COST = 12


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(_COST)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def generate_password(length: int = 10) -> str:
    return "".join(random.choices(_ALPHABET, k=length))
```

- [ ] **Step 6: Run tests**

```
pytest tests/auth/test_auth.py -v
```
Expected: all 6 PASS

- [ ] **Step 7: Create `tests/auth/__init__.py`**

Create an empty file at `tests/auth/__init__.py`.

- [ ] **Step 8: Commit**

```
git add tools/shared/auth.py tests/auth/test_auth.py tests/auth/__init__.py requirements.txt
git commit -m "feat: add bcrypt password helpers and generate_password utility"
```

---

### Task 2: POST /api/auth/login endpoint

**Files:**
- Modify: `tools/api/server.py` (add after existing request models, around line 298)
- Create: `tests/api/test_auth_endpoints.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/api/test_auth_endpoints.py
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from tools.api.server import app

client = TestClient(app)


def _make_auth_row(email, plain_password, must_change="false"):
    from tools.shared.auth import hash_password
    return {"email": email, "password_hash": hash_password(plain_password), "must_change": must_change}


def _make_consent_row(email, student_id, full_name):
    return {"email": email, "student_id": student_id, "full_name": full_name, "consented": "true"}


def _make_approved_row(email, role="OA"):
    return {"email": email, "full_name": "Test User", "role": role}


def test_login_success():
    auth_row = _make_auth_row("alice@test.com", "password1")
    consent_row = _make_consent_row("alice@test.com", "stu_001", "Alice")
    approved_row = _make_approved_row("alice@test.com")

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_auth":
            return [auth_row]
        if sheet == "snec_consent":
            return [consent_row]
        if sheet == "snec_approved_students":
            return [approved_row]
        return []

    with patch("tools.api.server.get_rows", mock_get_rows), \
         patch("tools.api.server.get_or_create_student", return_value="stu_001"), \
         patch("tools.api.server.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "alice@test.com", "password": "password1"})
    assert r.status_code == 200
    data = r.json()
    assert data["student_id"] == "stu_001"
    assert data["must_change"] is False
    assert data["is_new"] is False


def test_login_wrong_password():
    auth_row = _make_auth_row("bob@test.com", "realpass")

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_auth":
            return [auth_row]
        if sheet == "snec_approved_students":
            return [{"email": "bob@test.com", "full_name": "Bob", "role": "OT"}]
        return []

    with patch("tools.api.server.get_rows", mock_get_rows):
        r = client.post("/api/auth/login", json={"email": "bob@test.com", "password": "wrongpass"})
    assert r.status_code == 401


def test_login_not_approved():
    with patch("tools.api.server.get_rows", return_value=[]):
        r = client.post("/api/auth/login", json={"email": "unknown@test.com", "password": "any"})
    assert r.status_code == 403
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/api/test_auth_endpoints.py::test_login_not_approved -v
```
Expected: `404` or attribute error (endpoint not yet defined)

- [ ] **Step 3: Add imports and models to server.py**

Find the imports section at the top of `tools/api/server.py` and add after the existing `from tools.shared.identity import ...` line:

```python
from tools.shared.auth import hash_password, verify_password, generate_password
from tools.shared.gsheets import get_rows, append_row, update_row
```

Then find the request models section (around line 256) and add:

```python
class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponse(BaseModel):
    student_id: str
    role: str
    student_role: str
    must_change: bool
    is_new: bool
    mock_mode: bool
```

- [ ] **Step 4: Add the login endpoint**

Find the `# ── Endpoints ──` comment in server.py and add immediately after it:

```python
@app.post("/api/auth/login", response_model=LoginResponse)
async def auth_login(body: LoginRequest):
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
        must_change = auth_rows[0].get("must_change", "true").lower() == "true"
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
            final_role = sup_rows[0].get("role", "student")
            approved_student_role = ""

    return LoginResponse(
        student_id=student_id,
        role=final_role,
        student_role=approved_student_role,
        must_change=must_change,
        is_new=is_new,
        mock_mode=MOCK_MODE,
    )
```

- [ ] **Step 5: Run tests**

```
pytest tests/api/test_auth_endpoints.py -v
```
Expected: all 3 PASS

- [ ] **Step 6: Create `tests/api/__init__.py`** (if not already present)

```
type nul > tests\api\__init__.py
```

- [ ] **Step 7: Commit**

```
git add tools/api/server.py tests/api/test_auth_endpoints.py tests/api/__init__.py
git commit -m "feat: add POST /api/auth/login endpoint with bcrypt verification"
```

---

### Task 3: POST /api/auth/change-password endpoint

**Files:**
- Modify: `tools/api/server.py`
- Modify: `tests/api/test_auth_endpoints.py`

- [ ] **Step 1: Add tests**

Append to `tests/api/test_auth_endpoints.py`:

```python
def test_change_password_success():
    from tools.shared.auth import hash_password
    old_hash = hash_password("oldpass")
    auth_row = {"email": "carol@test.com", "password_hash": old_hash, "must_change": "true"}
    consent_row = {"email": "carol@test.com", "student_id": "stu_002", "full_name": "Carol"}

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_consent":
            return [consent_row]
        if sheet == "snec_auth":
            return [auth_row]
        return []

    with patch("tools.api.server.get_rows", mock_get_rows), \
         patch("tools.api.server.update_row") as mock_update:
        r = client.post("/api/auth/change-password", json={
            "student_id": "stu_002",
            "current_password": "oldpass",
            "new_password": "newpass123",
        })
    assert r.status_code == 200
    assert r.json()["ok"] is True
    mock_update.assert_called_once()


def test_change_password_wrong_current():
    from tools.shared.auth import hash_password
    old_hash = hash_password("correctpass")
    auth_row = {"email": "dave@test.com", "password_hash": old_hash, "must_change": "false"}
    consent_row = {"email": "dave@test.com", "student_id": "stu_003", "full_name": "Dave"}

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_consent":
            return [consent_row]
        if sheet == "snec_auth":
            return [auth_row]
        return []

    with patch("tools.api.server.get_rows", mock_get_rows):
        r = client.post("/api/auth/change-password", json={
            "student_id": "stu_003",
            "current_password": "wrongpass",
            "new_password": "newpass123",
        })
    assert r.status_code == 401


def test_change_password_too_short():
    with patch("tools.api.server.get_rows", return_value=[{"email": "e@t.com", "student_id": "x"}]):
        r = client.post("/api/auth/change-password", json={
            "student_id": "x",
            "current_password": "any",
            "new_password": "short",
        })
    assert r.status_code == 400
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/api/test_auth_endpoints.py::test_change_password_success -v
```
Expected: 404 or attribute error

- [ ] **Step 3: Add models and endpoint to server.py**

Add after the `LoginResponse` model:

```python
class ChangePasswordRequest(BaseModel):
    student_id: str
    current_password: str
    new_password: str
```

Add the endpoint after the login endpoint:

```python
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
        stored_hash = auth_rows[0].get("password_hash", "")
        if stored_hash and not verify_password(body.current_password, stored_hash):
            raise HTTPException(status_code=401, detail="Current password is incorrect.")

    new_hash = hash_password(body.new_password)
    update_row("snec_auth", "email", email, {"password_hash": new_hash, "must_change": "false"})
    return {"ok": True}
```

- [ ] **Step 4: Run tests**

```
pytest tests/api/test_auth_endpoints.py -v
```
Expected: all 6 PASS

- [ ] **Step 5: Commit**

```
git add tools/api/server.py tests/api/test_auth_endpoints.py
git commit -m "feat: add POST /api/auth/change-password endpoint"
```

---

### Task 4: GET /api/admin/student/{student_id}/detail endpoint

**Files:**
- Modify: `tools/api/server.py`

- [ ] **Step 1: Add test**

Append to `tests/api/test_auth_endpoints.py`:

```python
def test_student_detail_requires_admin():
    r = client.get("/api/admin/student/stu_001/detail")
    assert r.status_code == 422  # missing X-Admin-ID header


def test_student_detail_returns_shape():
    consent_row = {"email": "alice@test.com", "student_id": "stu_001", "full_name": "Alice"}

    profile_data = {
        "student_id": "stu_001", "full_name": "Alice", "email": "alice@test.com",
        "role": "OA", "session_count": "3", "streak": "2", "last_active": "2026-05-27",
        "learning_velocity": "improving", "weak_topics": "[]", "missed_findings": "[]",
        "retention_scores": "{}", "supervisor_note": "",
    }

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_consent":
            return [consent_row]
        if sheet == "snec_supervisors":
            return [{"email": "admin@snec.com", "role": "admin"}]
        if sheet == "snec_sessions":
            return []
        if sheet == "snec_case_progress":
            return []
        return []

    with patch("tools.api.server.get_rows", mock_get_rows), \
         patch("tools.api.server.get_profile", return_value=profile_data), \
         patch("tools.api.server._get_email_for_id", return_value="admin@snec.com"):
        r = client.get("/api/admin/student/stu_001/detail",
                       headers={"X-Admin-ID": "admin_x"})
    assert r.status_code == 200
    data = r.json()
    assert "sessions" in data
    assert "cases" in data
    assert "retention_scores" in data
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/api/test_auth_endpoints.py::test_student_detail_returns_shape -v
```

- [ ] **Step 3: Add endpoint to server.py**

Find the admin endpoints section (after `/api/admin/approved`) and add:

```python
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
```

- [ ] **Step 4: Run tests**

```
pytest tests/api/test_auth_endpoints.py -v
```

- [ ] **Step 5: Commit**

```
git add tools/api/server.py tests/api/test_auth_endpoints.py
git commit -m "feat: add GET /api/admin/student/{id}/detail endpoint"
```

---

### Task 5: GET /api/admin/token-summary + POST /api/admin/upload-csv + extend /api/admin/approved

**Files:**
- Modify: `tools/api/server.py`

- [ ] **Step 1: Add token-summary endpoint**

In `server.py`, add after the student detail endpoint:

```python
@app.get("/api/admin/token-summary")
async def admin_token_summary(admin_id: str = Depends(_require_admin)):
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
```

- [ ] **Step 2: Add upload-csv endpoint**

Add imports at the top of server.py (after existing imports):

```python
import csv
import io
import re as _re
from fastapi import File, UploadFile
```

Add the endpoint:

```python
_EMAIL_RE = _re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_VALID_ROLES = {"OA", "OT", "PSA"}


@app.post("/api/admin/upload-csv")
async def admin_upload_csv(file: UploadFile = File(...), admin_id: str = Depends(_require_admin)):
    from tools.shared.gmail_sender import send_email as _send_email

    content = await file.read()
    text = content.decode("utf-8-sig")  # handles BOM from Excel
    reader = csv.DictReader(io.StringIO(text))

    existing = {r.get("email", "").strip().lower() for r in get_rows("snec_approved_students")}
    imported, skipped = 0, 0
    errors = []
    credentials = []

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
            "added_by": admin_id, "added_at": "",
        })
        append_row("snec_auth", {"email": email, "password_hash": pw_hash, "must_change": "true"})
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
```

- [ ] **Step 3: Extend POST /api/admin/approved**

Find the existing `POST /api/admin/approved` endpoint in server.py. It currently just appends to `snec_approved_students`. Add password handling by finding the append_row call and surrounding it:

```python
# Find the existing handler body and add after the append_row for snec_approved_students:
plain_pw = generate_password()
pw_hash = hash_password(plain_pw)
append_row("snec_auth", {"email": email_lc, "password_hash": pw_hash, "must_change": "true"})

try:
    from tools.shared.gmail_sender import send_email as _send_email
    _send_email(
        to=email_lc,
        subject="Your EyeBot account is ready",
        html=f"""<p>Hi {body.full_name},</p>
<p>Your EyeBot account has been created.</p>
<p><strong>Email:</strong> {email_lc}<br>
<strong>Temporary password:</strong> {plain_pw}</p>
<p>Please log in and change your password when prompted.</p>
<p>EyeBot · SNEC</p>""",
    )
except Exception:
    pass

return {"ok": True, "password": plain_pw}
```

- [ ] **Step 4: Add token_count to activity feed**

Find the `/api/admin/activity` endpoint handler. In the part that builds session items, add `"token_count": int(s.get("token_count", 0) or 0)` to the session dict returned.

- [ ] **Step 5: Run existing tests to check nothing broken**

```
pytest tests/ -v --ignore=tests/auth
```

- [ ] **Step 6: Commit**

```
git add tools/api/server.py
git commit -m "feat: add token-summary, upload-csv endpoints; extend approved to generate passwords"
```

---

### Task 6: AuthContext — add mustChangePassword

**Files:**
- Modify: `frontend/src/app/components/AuthContext.tsx`

- [ ] **Step 1: Update the User interface**

In `AuthContext.tsx`, change the `User` interface to:

```typescript
interface User {
  fullName: string;
  email: string;
  role: "student" | "supervisor" | "admin";
  studentId: string;
  studentRole: "OA" | "OT" | "PSA" | "";
  mustChangePassword: boolean;
}
```

- [ ] **Step 2: Update AuthContextType**

Add to `AuthContextType`:

```typescript
setMustChangePassword: (v: boolean) => void;
```

- [ ] **Step 3: Update AuthProvider state and functions**

Add state:
```typescript
// no separate state needed — mustChangePassword lives on the user object
```

Update the `login` function to also persist `mustChangePassword`:

```typescript
const login = (userData: User) => {
  setUser(userData);
  sessionStorage.setItem("eyebot_user", JSON.stringify({ fullName: userData.fullName, email: userData.email }));
  sessionStorage.setItem("eyebot_student_id", userData.studentId);
  sessionStorage.setItem("eyebot_role", userData.role);
  sessionStorage.setItem("eyebot_student_role", userData.studentRole ?? "");
  sessionStorage.setItem("eyebot_must_change", userData.mustChangePassword ? "true" : "false");
  setLoading(false);
};
```

Update the `useEffect` restore to read `eyebot_must_change`:
```typescript
const mustChange = sessionStorage.getItem("eyebot_must_change") === "true";
if (storedUser && storedId && storedRole) {
  setUser({
    ...JSON.parse(storedUser),
    studentId: storedId,
    role: storedRole as "student" | "supervisor" | "admin",
    studentRole: storedStudentRole,
    mustChangePassword: mustChange,
  });
  setIsCheckInDone(checkInStatus);
}
```

Add `setMustChangePassword` function:
```typescript
const setMustChangePassword = (v: boolean) => {
  sessionStorage.setItem("eyebot_must_change", v ? "true" : "false");
  setUser((prev) => prev ? { ...prev, mustChangePassword: v } : prev);
};
```

Update the Provider value to include `setMustChangePassword`.

- [ ] **Step 4: Check TypeScript compiles**

```
cd frontend && npx tsc --noEmit
```

Expected: no errors (or only pre-existing errors unrelated to this change)

- [ ] **Step 5: Commit**

```
git add frontend/src/app/components/AuthContext.tsx
git commit -m "feat: add mustChangePassword field to AuthContext User type"
```

---

### Task 7: AdminGuard component + update routes.tsx

**Files:**
- Create: `frontend/src/app/components/AdminGuard.tsx`
- Modify: `frontend/src/app/routes.tsx`

- [ ] **Step 1: Create AdminGuard**

```typescript
// frontend/src/app/components/AdminGuard.tsx
import { Navigate } from "react-router";
import { useAuth } from "./AuthContext";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f1e] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || (user?.role !== "admin" && user?.role !== "supervisor")) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Update routes.tsx**

In `frontend/src/app/routes.tsx`, add the import:

```typescript
import { AdminGuard } from "./components/AdminGuard";
```

Change the `/admin` route from:
```typescript
{
  path: "/admin",
  Component: AdminDashboard,
},
```
to:
```typescript
{
  path: "/admin",
  element: (
    <AdminGuard>
      <AdminDashboard />
    </AdminGuard>
  ),
},
```

- [ ] **Step 3: Type check**

```
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```
git add frontend/src/app/components/AdminGuard.tsx frontend/src/app/routes.tsx
git commit -m "feat: add AdminGuard route protection for /admin"
```

---

### Task 8: ChangePasswordModal component

**Files:**
- Create: `frontend/src/app/components/ChangePasswordModal.tsx`

- [ ] **Step 1: Create the component**

```typescript
// frontend/src/app/components/ChangePasswordModal.tsx
import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Eye, EyeOff } from "lucide-react";
import { useAuth } from "./AuthContext";

interface Props {
  forced?: boolean;
  onClose?: () => void;
  onSuccess: () => void;
}

export function ChangePasswordModal({ forced = false, onClose, onSuccess }: Props) {
  const { user, setMustChangePassword } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (next.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setError("Passwords do not match."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: user?.studentId,
          current_password: current,
          new_password: next,
        }),
      });
      if (res.status === 401) { setError("Current password is incorrect."); return; }
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail ?? "Something went wrong."); return; }
      setMustChangePassword(false);
      onSuccess();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="glass-card-lg iri-border w-full max-w-md p-8 relative"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
        >
          {!forced && onClose && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-[#A39A8E] hover:text-[#1F1A12] transition-colors"
            >
              <X size={18} />
            </button>
          )}

          <h2
            className="mb-1"
            style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 400, color: "#1F1A12" }}
          >
            {forced ? "Set your password" : "Change password"}
          </h2>
          {forced && (
            <p className="text-[#5C544A] mb-6" style={{ fontSize: "0.88rem" }}>
              Your account requires a password change before you can continue.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-5 mt-6">
            {[
              { label: "Current password", val: current, set: setCurrent, show: showCurrent, toggle: () => setShowCurrent((v) => !v) },
              { label: "New password (min 8 chars)", val: next, set: setNext, show: showNext, toggle: () => setShowNext((v) => !v) },
              { label: "Confirm new password", val: confirm, set: setConfirm, show: showNext, toggle: () => {} },
            ].map(({ label, val, set, show, toggle }) => (
              <div key={label} className="relative">
                <label className="block text-[#5C544A] mb-2" style={{ fontSize: "0.78rem", letterSpacing: "0.04em" }}>{label}</label>
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    className="w-full bg-transparent border-0 border-b border-[#1F1A12]/12 px-0 py-3 pr-8 text-[#1F1A12] outline-none focus:border-[#8C6D3F] transition-colors text-base"
                  />
                  {toggle !== (() => {}) && (
                    <button type="button" onClick={toggle} className="absolute right-0 top-3 text-[#A39A8E]">
                      {show ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {error && <p className="text-[#8B2D2D] text-sm">{error}</p>}

            <motion.button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 px-8 py-4 iri-border-pill transition-all disabled:opacity-50"
              style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.95rem" }}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
            >
              {submitting ? (
                <span className="w-4 h-4 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" />
              ) : "Update password"}
            </motion.button>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Type check**

```
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add frontend/src/app/components/ChangePasswordModal.tsx
git commit -m "feat: add ChangePasswordModal component"
```

---

### Task 9: Rewrite OnboardingScreen — email+password login

**Files:**
- Modify: `frontend/src/app/components/OnboardingScreen.tsx`

Replace the entire file content with:

- [ ] **Step 1: Write the new OnboardingScreen**

```typescript
// frontend/src/app/components/OnboardingScreen.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useAuth } from "./AuthContext";
import { ChangePasswordModal } from "./ChangePasswordModal";

const PDPA_TEXT = `Personal Data Protection Act (PDPA) Consent

EyeBot collects your full name and email address solely to provide personalised medical education. Your data is encrypted at rest and never sold or shared with third parties. You may request deletion at any time by writing to the practitioner.`;

const ROLES = [
  { id: "OA" as const, label: "OA", title: "Ophthalmic Auxiliary", desc: "Patient flow, history taking, IOP measurement, dilation, pre/post-operative care." },
  { id: "OT" as const, label: "OT", title: "Ophthalmic Technician", desc: "A-scan biometry, HVF, OCT imaging, corneal topography, endothelial cell count." },
  { id: "PSA" as const, label: "PSA", title: "Patient Service Associate", desc: "NCT, LogMAR visual acuity, eye drop instillation, PFAER and fall risk assessment." },
];

type Step = "login" | "pdpa" | "role" | "change_password";

interface LoginResult {
  student_id: string;
  role: string;
  student_role: string;
  must_change: boolean;
  is_new: boolean;
  mock_mode: boolean;
  full_name?: string;
  email?: string;
}

export function OnboardingScreen() {
  const navigate = useNavigate();
  const { login, setMustChangePassword } = useAuth();

  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"OA" | "OT" | "PSA" | null>(null);
  const [loginResult, setLoginResult] = useState<LoginResult | null>(null);
  const [errors, setErrors] = useState<{ email?: string; password?: string; pdpa?: string; role?: string; api?: string; blocked?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: typeof errors = {};
    if (!email.trim()) newErrors.email = "Please enter your email";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = "That doesn't look like a valid email";
    if (!password) newErrors.password = "Please enter your password";
    setErrors(newErrors);
    if (Object.keys(newErrors).length) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      if (res.status === 401) { setErrors({ password: "Incorrect password." }); return; }
      if (res.status === 403) {
        const d = await res.json().catch(() => ({}));
        setErrors({ blocked: d.detail ?? "Access restricted. Contact your administrator." });
        return;
      }
      if (!res.ok) throw new Error(await res.text());

      const data: LoginResult = await res.json();
      setLoginResult(data);

      if (data.must_change) {
        // Show change password modal before anything else
        login({
          fullName: data.full_name ?? email,
          email: email.trim().toLowerCase(),
          studentId: data.student_id,
          role: data.role as "student" | "supervisor" | "admin",
          studentRole: (data.student_role ?? "") as "OA" | "OT" | "PSA" | "",
          mustChangePassword: true,
        });
        setStep("change_password");
        return;
      }

      if (data.is_new && data.role === "student") {
        setStep("pdpa");
        return;
      }

      completeLogin(data);
    } catch {
      setErrors({ api: "We couldn't reach the service. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const completeLogin = (data: LoginResult, studentRole?: "OA" | "OT" | "PSA") => {
    login({
      fullName: data.full_name ?? email,
      email: email.trim().toLowerCase(),
      studentId: data.student_id,
      role: data.role as "student" | "supervisor" | "admin",
      studentRole: (studentRole ?? data.student_role ?? "") as "OA" | "OT" | "PSA" | "",
      mustChangePassword: false,
    });
    if (data.role === "admin") navigate("/admin");
    else if (data.role === "supervisor") navigate("/supervisor");
    else navigate("/checkin");
  };

  const handlePdpa = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdpaConsent) { setErrors({ pdpa: "We need your consent to continue" }); return; }
    setErrors({});
    setStep("role");
  };

  const handleRoleSelect = async (role: "OA" | "OT" | "PSA") => {
    if (!loginResult) return;
    setSelectedRole(role);
    setSubmitting(true);
    try {
      // Record consent via existing /api/onboard (still functional for new users)
      await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: loginResult.full_name ?? email,
          email: email.trim().toLowerCase(),
          student_role: role,
        }),
      });
    } catch { /* non-fatal */ }
    completeLogin(loginResult, role);
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-[#FBF8F1] flex flex-col items-center justify-center px-6 py-16 relative">
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] pointer-events-none"
        initial={{ opacity: 0 }} animate={{ opacity: 0.12 }} transition={{ duration: 2.5 }} aria-hidden="true"
      >
        <img src="/anatomy/eye-medallion.png" alt="" className="w-full h-full object-contain anatomy-hero" style={{ opacity: 1 }} />
      </motion.div>

      {step === "change_password" && loginResult && (
        <ChangePasswordModal
          forced
          onSuccess={() => {
            setMustChangePassword(false);
            if (loginResult.is_new && loginResult.role === "student") { setStep("pdpa"); return; }
            completeLogin(loginResult);
          }}
        />
      )}

      <motion.div
        className="w-full max-w-md relative z-10"
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex flex-col items-center mb-14">
          <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}>
            <HolographicEyeLogo size={72} animated />
          </motion.div>
          <h1 className="mt-8 text-center holo-text-subtle" style={{ fontFamily: "var(--font-display)", fontSize: "3.25rem", fontWeight: 400, lineHeight: 1, letterSpacing: "-0.02em" }}>
            EyeBot
          </h1>
          <p className="mt-4 text-center text-[#5C544A] italic-display" style={{ fontSize: "1.05rem" }}>an attentive tutor for the eye</p>
          <hr className="divider-shimmer w-16 mt-6" />
        </div>

        <AnimatePresence mode="wait">
          {step === "login" && (
            <motion.div key="login" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.35 }}>
              <div className="glass-card-lg iri-border p-10">
                <p className="annotation-label mb-6">Sign in to EyeBot</p>
                <form onSubmit={handleLogin} className="space-y-6">
                  <div>
                    <label className="block text-[#5C544A] mb-2" style={{ fontSize: "0.78rem", letterSpacing: "0.04em" }}>Email</label>
                    <input
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-transparent border-0 border-b border-[#1F1A12]/12 px-0 py-3 text-[#1F1A12] outline-none focus:border-[#8C6D3F] transition-colors text-base"
                    />
                    {errors.email && <p role="alert" className="text-[#8B2D2D] text-xs mt-2">{errors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-[#5C544A] mb-2" style={{ fontSize: "0.78rem", letterSpacing: "0.04em" }}>Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-transparent border-0 border-b border-[#1F1A12]/12 px-0 py-3 pr-8 text-[#1F1A12] outline-none focus:border-[#8C6D3F] transition-colors text-base"
                      />
                      <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-0 top-3 text-[#A39A8E]">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {errors.password && <p role="alert" className="text-[#8B2D2D] text-xs mt-2">{errors.password}</p>}
                  </div>

                  {(errors.api || errors.blocked) && (
                    <div className="px-4 py-3 bg-[#8B2D2D]/5 border border-[#8B2D2D]/20 rounded-lg">
                      <p className="text-[#8B2D2D] text-sm">{errors.blocked ?? errors.api}</p>
                      {errors.blocked && <p className="text-[#A39A8E] text-xs mt-1">snec.tne.edu@gmail.com</p>}
                    </div>
                  )}

                  <motion.button
                    type="submit" disabled={submitting}
                    className="w-full mt-4 inline-flex items-center justify-center gap-2 px-8 py-4 iri-border-pill transition-all disabled:opacity-50"
                    style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.95rem", letterSpacing: "0.02em" }}
                    whileHover={{ y: -1, scale: 1.01 }} whileTap={{ scale: 0.97 }}
                  >
                    {submitting ? <span className="w-4 h-4 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" /> : <>Sign in <ArrowRight size={16} strokeWidth={1.5} /></>}
                  </motion.button>
                </form>
              </div>
            </motion.div>
          )}

          {step === "pdpa" && (
            <motion.div key="pdpa" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.35 }}>
              <div className="glass-card-lg iri-border p-10">
                <p className="annotation-label mb-6">Data consent</p>
                <form onSubmit={handlePdpa} className="space-y-6">
                  <div className="max-h-32 overflow-y-auto pr-2 custom-scrollbar text-[#5C544A] whitespace-pre-line border-l-2 border-[#8C6D3F]/30 pl-4 py-1" style={{ fontSize: "0.78rem", lineHeight: 1.65 }}>{PDPA_TEXT}</div>
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input type="checkbox" checked={pdpaConsent} onChange={(e) => setPdpaConsent(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-[#1F1A12]/20 bg-white accent-[#8C6D3F]" />
                    <span className="text-[#5C544A]" style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>I consent to the collection and use of my data as described above.</span>
                  </label>
                  {errors.pdpa && <p role="alert" className="text-[#8B2D2D] text-xs">{errors.pdpa}</p>}
                  <motion.button type="submit" className="w-full inline-flex items-center justify-center gap-2 px-8 py-4 iri-border-pill transition-all" style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.95rem" }} whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}>
                    Continue <ArrowRight size={16} strokeWidth={1.5} />
                  </motion.button>
                </form>
              </div>
            </motion.div>
          )}

          {step === "role" && (
            <motion.div key="role" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.35 }}>
              <div className="glass-card-lg iri-border p-10">
                <p className="annotation-label mb-2">Your role</p>
                <p className="text-[#5C544A] mb-8" style={{ fontSize: "0.88rem", lineHeight: 1.55 }}>Select your training track. This scopes your cases, flashcards, and daily check-ins.</p>
                <div className="space-y-3">
                  {ROLES.map((r) => (
                    <motion.button key={r.id} onClick={() => !submitting && handleRoleSelect(r.id)} disabled={submitting}
                      className="w-full text-left glass-card iri-border px-6 py-5 group transition-all hover-shadow-holo disabled:opacity-50"
                      whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <span className="text-[#8C6D3F]" style={{ fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>{r.label}</span>
                            <span className="text-[#1F1A12]" style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: 400 }}>{r.title}</span>
                          </div>
                          <p className="text-[#5C544A]" style={{ fontSize: "0.82rem", lineHeight: 1.5 }}>{r.desc}</p>
                        </div>
                        {submitting && selectedRole === r.id ? (
                          <div className="w-4 h-4 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin flex-shrink-0 ml-4" />
                        ) : (
                          <ArrowRight size={16} strokeWidth={1.5} className="text-[#A39A8E] group-hover:text-[#8C6D3F] transition-colors flex-shrink-0 ml-4" />
                        )}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-12 text-center text-[#A39A8E]" style={{ fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase" }}>
          Singapore National Eye Centre · 2026
        </p>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

```
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add frontend/src/app/components/OnboardingScreen.tsx
git commit -m "feat: rewrite OnboardingScreen — email+password login replaces name/email form"
```

---

### Task 10: AdminStudentDetail modal

**Files:**
- Create: `frontend/src/app/components/AdminStudentDetail.tsx`

- [ ] **Step 1: Create the component**

```typescript
// frontend/src/app/components/AdminStudentDetail.tsx
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { useAuth } from "./AuthContext";

interface Session {
  session_id: string;
  timestamp: string;
  topic: string;
  token_count: number;
  model: string;
}

interface Case {
  case_id: string;
  total_score: number;
  passed: boolean;
  completed_at: string;
}

interface DetailData {
  student_id: string;
  full_name: string;
  email: string;
  role: string;
  session_count: number;
  streak: number;
  last_active: string;
  learning_velocity: string;
  weak_topics: string[];
  missed_findings: string[];
  retention_scores: Record<string, number>;
  supervisor_note: string;
  sessions: Session[];
  cases: Case[];
  total_tokens: number;
}

type SubTab = "sessions" | "cases" | "topics";

interface Props {
  studentId: string;
  onClose: () => void;
}

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function scoreColor(score: number) {
  if (score < 0.65) return "#ef4444";
  if (score < 0.80) return "#f59e0b";
  return "#4CAF50";
}

export function AdminStudentDetail({ studentId, onClose }: Props) {
  const { user } = useAuth();
  const adminId = user?.studentId ?? "";
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<SubTab>("sessions");
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/student/${studentId}/detail`, { headers: { "X-Admin-ID": adminId } })
      .then((r) => r.json())
      .then((d) => { setData(d); setNote(d.supervisor_note ?? ""); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [studentId, adminId]);

  const saveNote = async () => {
    if (!data) return;
    setSavingNote(true);
    try {
      await fetch(`/api/supervisor/student/${studentId}/note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Supervisor-ID": adminId },
        body: JSON.stringify({ note }),
      });
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    } catch { /* non-fatal */ }
    setSavingNote(false);
  };

  const velocityColor = (v: string) => {
    if (v === "improving") return "#4CAF50";
    if (v === "declining") return "#ef4444";
    return "#f59e0b";
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          className="w-full max-w-3xl bg-[#0f0f1e] border border-[#3a3a5a] rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: "90vh" }}
          initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        >
          {/* Header bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3a5a] flex-shrink-0">
            <span className="text-[#8C6D3F] text-xs uppercase tracking-widest">Student Detail</span>
            <button onClick={onClose} className="text-[#888] hover:text-white transition-colors"><X size={18} /></button>
          </div>

          {loading && (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" />
            </div>
          )}

          {data && (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="p-6 space-y-6">

                {/* Student header */}
                <div className="flex items-center gap-4 pb-4 border-b border-[#3a3a5a]">
                  <div className="w-12 h-12 bg-[#8C6D3F] rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                    {data.full_name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-semibold text-base">{data.full_name}</div>
                    <div className="text-[#888] text-xs">{data.role} · {data.email}</div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <span className="px-2 py-1 rounded text-xs" style={{ background: "#4CAF5022", color: "#4CAF50" }}>● Active</span>
                    <span className="px-2 py-1 rounded text-xs" style={{ background: "#8C6D3F22", color: velocityColor(data.learning_velocity) }}>
                      {data.learning_velocity}
                    </span>
                  </div>
                </div>

                {/* Stat cards */}
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { label: "Sessions", val: data.session_count },
                    { label: "Day Streak", val: data.streak },
                    { label: "Cases Done", val: data.cases.length },
                    { label: "Total Tokens", val: fmt(data.total_tokens) },
                    { label: "Last Active", val: data.last_active?.slice(0, 10) || "—" },
                  ].map(({ label, val }) => (
                    <div key={label} className="bg-[#2a2a4a] rounded-lg p-3 text-center">
                      <div className="text-[#8C6D3F] font-bold text-xl">{val}</div>
                      <div className="text-[#888] text-xs mt-1">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Sub-tabs */}
                <div>
                  <div className="flex gap-1 mb-0">
                    {(["sessions", "cases", "topics"] as SubTab[]).map((t) => (
                      <button key={t} onClick={() => setSubTab(t)}
                        className="px-4 py-2 text-xs rounded-t-lg transition-colors capitalize"
                        style={{ background: subTab === t ? "#8C6D3F" : "#2a2a4a", color: subTab === t ? "white" : "#888" }}>
                        {t === "topics" ? "Topics & Gaps" : t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>

                  <div className="bg-[#2a2a4a] rounded-b-lg rounded-tr-lg p-4">
                    {subTab === "sessions" && (
                      <div>
                        <div className="text-[#888] text-xs mb-3">Last 30 sessions · most recent first</div>
                        {data.sessions.length === 0 && <p className="text-[#888] text-sm">No sessions yet.</p>}
                        <div className="space-y-0">
                          <div className="grid grid-cols-[100px_1fr_70px_60px] gap-2 text-[#8C6D3F] text-xs uppercase tracking-wide pb-2 border-b border-[#3a3a5a]">
                            <span>Date</span><span>Topic</span><span>Tokens</span><span>Model</span>
                          </div>
                          {data.sessions.map((s) => (
                            <div key={s.session_id} className="grid grid-cols-[100px_1fr_70px_60px] gap-2 py-2 border-b border-[#3a3a5a]/50 text-sm">
                              <span className="text-[#888]">{s.timestamp?.slice(0, 10) || "—"}</span>
                              <span className="text-[#ccc] truncate">{s.topic || "—"}</span>
                              <span className="text-[#8C6D3F]">{s.token_count.toLocaleString()}</span>
                              <span className="text-[#888]">{s.model || "—"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {subTab === "cases" && (
                      <div>
                        {data.cases.length > 0 && (
                          <p className="text-[#888] text-xs mb-3">
                            Passed {data.cases.filter((c) => c.passed).length} of {data.cases.length} cases
                          </p>
                        )}
                        {data.cases.length === 0 && <p className="text-[#888] text-sm">No case attempts yet.</p>}
                        <div className="space-y-0">
                          <div className="grid grid-cols-[1fr_80px_70px_100px] gap-2 text-[#8C6D3F] text-xs uppercase tracking-wide pb-2 border-b border-[#3a3a5a]">
                            <span>Case</span><span>Score</span><span>Result</span><span>Date</span>
                          </div>
                          {data.cases.map((c, i) => (
                            <div key={i} className="grid grid-cols-[1fr_80px_70px_100px] gap-2 py-2 border-b border-[#3a3a5a]/50 text-sm">
                              <span className="text-[#ccc]">{c.case_id}</span>
                              <span className="text-[#ccc]">{c.total_score}/40</span>
                              <span style={{ color: c.passed ? "#4CAF50" : "#ef4444" }}>{c.passed ? "Pass" : "Fail"}</span>
                              <span className="text-[#888]">{c.completed_at?.slice(0, 10) || "—"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {subTab === "topics" && (
                      <div className="space-y-4">
                        <div>
                          {Object.keys(data.retention_scores).length === 0 && (
                            <p className="text-[#888] text-sm">No topic data yet.</p>
                          )}
                          {Object.entries(data.retention_scores).map(([topic, score]) => (
                            <div key={topic} className="mb-3">
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-[#ccc]">{topic}</span>
                                <span style={{ color: scoreColor(score) }}>{Math.round(score * 100)}%</span>
                              </div>
                              <div className="bg-[#1a1a2e] h-2 rounded-full">
                                <div className="h-2 rounded-full transition-all" style={{ width: `${score * 100}%`, background: scoreColor(score) }} />
                              </div>
                            </div>
                          ))}
                        </div>
                        {data.missed_findings.length > 0 && (
                          <div>
                            <div className="text-[#888] text-xs uppercase tracking-wide mb-2">Consistently missed</div>
                            <ul className="space-y-1">
                              {data.missed_findings.map((f) => (
                                <li key={f} className="text-[#ccc] text-sm">· {f}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Lecturer note */}
                <div>
                  <div className="text-[#8C6D3F] text-xs uppercase tracking-wide mb-2">Lecturer note</div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    className="w-full bg-[#1a1a2e] border border-[#3a3a5a] rounded-lg p-3 text-[#ccc] text-sm outline-none focus:border-[#8C6D3F] transition-colors resize-none"
                    placeholder="Add a note about this student..."
                  />
                  <button
                    onClick={saveNote}
                    disabled={savingNote}
                    className="mt-2 px-4 py-2 text-xs rounded-lg transition-colors disabled:opacity-50"
                    style={{ background: "#8C6D3F22", color: noteSaved ? "#4CAF50" : "#8C6D3F", border: "1px solid #8C6D3F44" }}
                  >
                    {noteSaved ? "Saved" : savingNote ? "Saving..." : "Save note"}
                  </button>
                </div>

              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Type check**

```
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add frontend/src/app/components/AdminStudentDetail.tsx
git commit -m "feat: add AdminStudentDetail modal with sessions/cases/topics sub-tabs"
```

---

### Task 11: Expand AdminDashboard to 4 tabs

**Files:**
- Modify: `frontend/src/app/components/AdminDashboard.tsx`

This is a full rewrite. Replace the entire file:

- [ ] **Step 1: Read the current file to understand what to keep**

Current file has: approved list loading, add student form, promote section, students table, activity feed. All of this is kept — we add Overview tab and wire up new endpoints.

- [ ] **Step 2: Write the new AdminDashboard**

Replace the full file with:

```typescript
import React, { useEffect, useState, useRef } from "react";
import { motion } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { useNavigate } from "react-router";
import { useAuth } from "./AuthContext";
import { LogOut, UserPlus, Trash2, ShieldCheck, Users, Activity, BarChart2, Upload, Copy, Check, Download } from "lucide-react";
import { AdminStudentDetail } from "./AdminStudentDetail";
import { ChangePasswordModal } from "./ChangePasswordModal";

const API = "";

// ── Types ──────────────────────────────────────────────────────────────────

interface ApprovedStudent { email: string; full_name: string; role: string; added_by: string; added_at: string; student_id: string; }
interface StudentProfile { student_id: string; full_name: string; email: string; role: string; session_count: number | string; streak: number | string; last_active: string; learning_velocity: string; weak_topics?: string[]; }
interface FeedItem { type: "session" | "case"; student_id: string; name: string; detail: string; timestamp: string; token_count?: number; }
interface CohortData { total_students: number; active_this_week: number; at_risk_count: number; weakest_topics: string[]; }
interface AtRiskItem { student_id: string; name: string; days_inactive: number; weak_topic_count: number; }
interface Credential { full_name: string; email: string; password: string; }

type Tab = "overview" | "students" | "accounts" | "activity";

// ── Helpers ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-[#2a2a4a] rounded-xl p-4 text-center">
      <div className="text-2xl font-bold mb-1" style={{ color: color ?? "#8C6D3F" }}>{value}</div>
      <div className="text-[#888] text-xs">{label}</div>
    </div>
  );
}

function fmtTokens(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n); }

// ── Main component ─────────────────────────────────────────────────────────

export function AdminDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const adminId = user?.studentId ?? "";
  const adminHeaders = { "X-Admin-ID": adminId };

  const [tab, setTab] = useState<Tab>("overview");
  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // ── Overview ──
  const [cohort, setCohort] = useState<CohortData | null>(null);
  const [atRisk, setAtRisk] = useState<AtRiskItem[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [aiInsight, setAiInsight] = useState("");
  const [overviewLoading, setOverviewLoading] = useState(true);

  // ── Students ──
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [tokensByStudent, setTokensByStudent] = useState<Record<string, number>>({});
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState<"all" | "OA" | "OT" | "PSA" | "at-risk">("all");

  // ── Accounts ──
  const [approved, setApproved] = useState<ApprovedStudent[]>([]);
  const [approvedLoading, setApprovedLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [addedCredential, setAddedCredential] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoteRole, setPromoteRole] = useState("supervisor");
  const [promoting, setPromoting] = useState(false);
  const [promoteMsg, setPromoteMsg] = useState("");
  const [csvCredentials, setCsvCredentials] = useState<Credential[]>([]);
  const [csvErrors, setCsvErrors] = useState<{ row: number; reason: string }[]>([]);
  const [csvImportSummary, setCsvImportSummary] = useState<{ imported: number; skipped: number } | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvPreview, setCsvPreview] = useState<{ count: number; errors: number } | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Activity ──
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedLoaded, setFeedLoaded] = useState(false);

  // ── Load overview on mount ──
  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/supervisor/cohort`, { headers: adminHeaders }).then((r) => r.json()).catch(() => null),
      fetch(`${API}/api/supervisor/at-risk`, { headers: adminHeaders }).then((r) => r.json()).catch(() => ({ at_risk: [] })),
      fetch(`${API}/api/admin/token-summary`, { headers: adminHeaders }).then((r) => r.json()).catch(() => ({ total_tokens: 0 })),
      fetch(`${API}/api/supervisor/insights`, { headers: adminHeaders }).then((r) => r.json()).catch(() => ({ insight: "" })),
    ]).then(([cohortData, riskData, tokenData, insightData]) => {
      if (cohortData) setCohort(cohortData);
      setAtRisk(riskData?.at_risk ?? []);
      setTotalTokens(tokenData?.total_tokens ?? 0);
      setAiInsight(insightData?.insight ?? "");
    }).finally(() => setOverviewLoading(false));

    fetch(`${API}/api/admin/approved`, { headers: adminHeaders })
      .then((r) => r.json())
      .then((d) => setApproved(d.students ?? []))
      .catch(() => {})
      .finally(() => setApprovedLoading(false));
  }, []);

  const loadStudents = () => {
    if (studentsLoaded) return;
    setStudentsLoading(true);
    Promise.all([
      fetch(`${API}/api/admin/students`, { headers: adminHeaders }).then((r) => r.json()).catch(() => ({ students: [] })),
      fetch(`${API}/api/admin/token-summary`, { headers: adminHeaders }).then((r) => r.json()).catch(() => ({ by_student: [] })),
    ]).then(([sd, td]) => {
      setStudents(sd.students ?? []);
      const map: Record<string, number> = {};
      for (const item of td.by_student ?? []) map[item.student_id] = item.tokens;
      setTokensByStudent(map);
      setStudentsLoaded(true);
    }).finally(() => setStudentsLoading(false));
  };

  const loadFeed = () => {
    if (feedLoaded) return;
    setFeedLoading(true);
    fetch(`${API}/api/admin/activity`, { headers: adminHeaders })
      .then((r) => r.json())
      .then((d) => { setFeed(d.feed ?? []); setFeedLoaded(true); })
      .catch(() => {})
      .finally(() => setFeedLoading(false));
  };

  const handleTabChange = (t: Tab) => {
    setTab(t);
    if (t === "students") loadStudents();
    if (t === "activity") loadFeed();
  };

  // ── Add one student ──
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    if (!newEmail.trim() || !newName.trim() || !newRole) { setAddError("All fields are required."); return; }
    setAdding(true);
    try {
      const res = await fetch(`${API}/api/admin/approved`, {
        method: "POST",
        headers: { ...adminHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim().toLowerCase(), full_name: newName.trim(), role: newRole }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setAddError(d.detail ?? "Failed to add student."); return; }
      const data = await res.json();
      setAddedCredential({ email: newEmail.trim().toLowerCase(), password: data.password });
      setApproved((prev) => [...prev, { email: newEmail.trim().toLowerCase(), full_name: newName.trim(), role: newRole, added_by: adminId, added_at: "", student_id: "" }]);
      setNewEmail(""); setNewName(""); setNewRole("");
    } catch { setAddError("Network error."); }
    setAdding(false);
  };

  // ── Remove student ──
  const handleRemove = async (email: string) => {
    setRemoving(email);
    try {
      await fetch(`${API}/api/admin/approved`, {
        method: "DELETE",
        headers: { ...adminHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setApproved((prev) => prev.filter((s) => s.email !== email));
    } catch { }
    setRemoving(null);
  };

  // ── Promote ──
  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromoting(true);
    setPromoteMsg("");
    try {
      const res = await fetch(`${API}/api/admin/promote`, {
        method: "POST",
        headers: { ...adminHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ email: promoteEmail.trim().toLowerCase(), role: promoteRole }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setPromoteMsg(d.detail ?? "Failed."); }
      else { setPromoteMsg("Done."); setPromoteEmail(""); }
    } catch { setPromoteMsg("Network error."); }
    setPromoting(false);
  };

  // ── CSV handling ──
  const handleCsvFile = (f: File) => {
    setCsvFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? "";
      const lines = text.split("\n").filter((l) => l.trim());
      setCsvPreview({ count: Math.max(0, lines.length - 1), errors: 0 });
    };
    reader.readAsText(f);
  };

  const handleCsvImport = async () => {
    if (!csvFile) return;
    setCsvUploading(true);
    const form = new FormData();
    form.append("file", csvFile);
    try {
      const res = await fetch(`${API}/api/admin/upload-csv`, { method: "POST", headers: adminHeaders, body: form });
      const data = await res.json();
      setCsvImportSummary({ imported: data.imported, skipped: data.skipped });
      setCsvErrors(data.errors ?? []);
      setCsvCredentials(data.credentials ?? []);
      setCsvFile(null);
      setCsvPreview(null);
    } catch { }
    setCsvUploading(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ── Filtered students ──
  const filteredStudents = students.filter((s) => {
    const q = studentSearch.toLowerCase();
    if (q && !s.full_name.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q)) return false;
    if (studentFilter === "at-risk") return atRisk.some((r) => r.student_id === s.student_id);
    if (studentFilter !== "all") return s.role === studentFilter;
    return true;
  });

  const TABS = [
    { key: "overview" as Tab, label: "Overview", icon: <BarChart2 size={14} /> },
    { key: "students" as Tab, label: "Students", icon: <Users size={14} /> },
    { key: "accounts" as Tab, label: "Accounts", icon: <ShieldCheck size={14} /> },
    { key: "activity" as Tab, label: "Activity", icon: <Activity size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a14] text-[#ccc]">
      {/* Nav */}
      <div className="border-b border-[#3a3a5a] px-6 py-3 flex items-center justify-between bg-[#0f0f1e] sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <HolographicEyeLogo size={28} />
          <span className="text-[#8C6D3F] text-sm font-medium tracking-wide">EyeBot Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowChangePassword(true)} className="text-[#888] hover:text-[#8C6D3F] text-xs transition-colors">Change password</button>
          <button onClick={() => { logout(); navigate("/"); }} className="flex items-center gap-1.5 text-[#888] hover:text-[#ccc] text-xs transition-colors">
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4 border-b border-[#3a3a5a] bg-[#0f0f1e]">
        {TABS.map(({ key, label, icon }) => (
          <button key={key} onClick={() => handleTabChange(key)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs rounded-t-lg transition-colors"
            style={{ background: tab === key ? "#1a1a2e" : "transparent", color: tab === key ? "#8C6D3F" : "#888", borderBottom: tab === key ? "2px solid #8C6D3F" : "2px solid transparent" }}>
            {icon} {label}
          </button>
        ))}
      </div>

      <div className="p-6 max-w-6xl mx-auto">

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div className="space-y-6">
            {overviewLoading ? (
              <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" /></div>
            ) : (
              <>
                <div className="grid grid-cols-5 gap-4">
                  <StatCard label="Total Students" value={cohort?.total_students ?? 0} />
                  <StatCard label="Active This Week" value={cohort?.active_this_week ?? 0} color="#4CAF50" />
                  <StatCard label="At Risk" value={cohort?.at_risk_count ?? 0} color="#ef4444" />
                  <StatCard label="Total Tokens" value={fmtTokens(totalTokens)} />
                  <StatCard label="Cohort Momentum" value="↑" color="#f59e0b" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#1a1a2e] rounded-xl p-5 border border-[#3a3a5a]">
                    <div className="text-[#ef4444] text-xs font-semibold uppercase tracking-widest mb-4">At-Risk Students</div>
                    {atRisk.length === 0 && <p className="text-[#888] text-sm">No at-risk students.</p>}
                    {atRisk.map((s) => (
                      <div key={s.student_id} className="flex justify-between items-center py-2 border-b border-[#3a3a5a]/50 last:border-0 text-sm">
                        <button onClick={() => setDetailStudentId(s.student_id)} className="text-[#ccc] hover:text-[#8C6D3F] transition-colors text-left">{s.name}</button>
                        <span className="text-[#ef4444] text-xs">{s.days_inactive}d inactive · {s.weak_topic_count} weak</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-[#1a1a2e] rounded-xl p-5 border border-[#3a3a5a]">
                    <div className="text-[#f59e0b] text-xs font-semibold uppercase tracking-widest mb-4">Cohort Weak Topics</div>
                    {(cohort?.weakest_topics ?? []).length === 0 && <p className="text-[#888] text-sm">No data yet.</p>}
                    {(cohort?.weakest_topics ?? []).slice(0, 5).map((t, i) => (
                      <div key={t} className="mb-3">
                        <div className="flex justify-between text-sm mb-1"><span>{t}</span></div>
                        <div className="bg-[#3a3a5a] h-1.5 rounded-full">
                          <div className="h-1.5 rounded-full bg-[#f59e0b]" style={{ width: `${Math.max(20, 90 - i * 15)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {aiInsight && (
                  <div className="bg-[#1a1a2e] border border-[#8C6D3F]/30 rounded-xl p-4 text-[#ccc] text-sm italic">
                    {aiInsight}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── STUDENTS ── */}
        {tab === "students" && (
          <div className="space-y-4">
            <div className="flex gap-3 items-center flex-wrap">
              <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search name or email…"
                className="bg-[#1a1a2e] border border-[#3a3a5a] rounded-lg px-4 py-2 text-sm outline-none focus:border-[#8C6D3F] transition-colors flex-1 min-w-[200px]" />
              <div className="flex gap-1">
                {(["all", "OA", "OT", "PSA", "at-risk"] as const).map((f) => (
                  <button key={f} onClick={() => setStudentFilter(f)}
                    className="px-3 py-1.5 rounded-lg text-xs transition-colors"
                    style={{ background: studentFilter === f ? "#8C6D3F" : "#2a2a4a", color: studentFilter === f ? "white" : "#888" }}>
                    {f === "at-risk" ? "At Risk" : f === "all" ? "All" : f}
                  </button>
                ))}
              </div>
            </div>

            {studentsLoading ? (
              <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" /></div>
            ) : (
              <div className="bg-[#1a1a2e] rounded-xl border border-[#3a3a5a] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#3a3a5a]">
                      {["Name", "Email", "Role", "Sessions", "Streak", "Tokens", "Velocity", "Last Active"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-[#8C6D3F] text-xs uppercase tracking-wide font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((s) => (
                      <tr key={s.student_id} onClick={() => setDetailStudentId(s.student_id)}
                        className="border-b border-[#3a3a5a]/50 hover:bg-[#2a2a4a] cursor-pointer transition-colors">
                        <td className="px-4 py-3 text-[#ccc]">{s.full_name}</td>
                        <td className="px-4 py-3 text-[#888] text-xs">{s.email}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-xs" style={{ background: "#8C6D3F22", color: "#8C6D3F" }}>{s.role}</span>
                        </td>
                        <td className="px-4 py-3 text-[#ccc]">{s.session_count}</td>
                        <td className="px-4 py-3 text-[#ccc]">{s.streak}</td>
                        <td className="px-4 py-3 text-[#8C6D3F]">{fmtTokens(tokensByStudent[s.student_id] ?? 0)}</td>
                        <td className="px-4 py-3 text-[#888] text-xs">{s.learning_velocity}</td>
                        <td className="px-4 py-3 text-[#888] text-xs">{s.last_active?.slice(0, 10) || "—"}</td>
                      </tr>
                    ))}
                    {filteredStudents.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-[#888] text-sm">No students found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ACCOUNTS ── */}
        {tab === "accounts" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {/* Add one student */}
              <div className="bg-[#1a1a2e] rounded-xl p-5 border border-[#3a3a5a]">
                <div className="text-[#8C6D3F] text-sm font-medium mb-4 flex items-center gap-2"><UserPlus size={14} /> Add one student</div>
                <form onSubmit={handleAdd} className="space-y-3">
                  {[
                    { label: "Full name", val: newName, set: setNewName, type: "text" },
                    { label: "Email", val: newEmail, set: setNewEmail, type: "email" },
                  ].map(({ label, val, set, type }) => (
                    <div key={label}>
                      <label className="block text-[#888] text-xs mb-1">{label}</label>
                      <input type={type} value={val} onChange={(e) => set(e.target.value)}
                        className="w-full bg-[#0f0f1e] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#8C6D3F] transition-colors" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-[#888] text-xs mb-1">Role</label>
                    <select value={newRole} onChange={(e) => setNewRole(e.target.value)}
                      className="w-full bg-[#0f0f1e] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#8C6D3F] transition-colors">
                      <option value="">Select role…</option>
                      <option value="OA">Ophthalmic Auxiliary (OA)</option>
                      <option value="OT">Ophthalmic Technician (OT)</option>
                      <option value="PSA">Patient Service Associate (PSA)</option>
                    </select>
                  </div>
                  {addError && <p className="text-[#8B2D2D] text-xs">{addError}</p>}
                  <button type="submit" disabled={adding}
                    className="w-full py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    style={{ background: "#8C6D3F", color: "white" }}>
                    {adding ? "Adding…" : "Add Student"}
                  </button>
                </form>

                {addedCredential && (
                  <div className="mt-4 p-3 bg-[#0f0f1e] border border-[#8C6D3F]/40 rounded-lg">
                    <div className="text-[#4CAF50] text-xs mb-2">Student added. Share these credentials:</div>
                    <div className="text-xs text-[#ccc] mb-1">Email: {addedCredential.email}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#ccc] font-mono">Password: {addedCredential.password}</span>
                      <button onClick={() => copyToClipboard(addedCredential.password)} className="text-[#8C6D3F]">
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                    <div className="text-[#888] text-xs mt-1">Credentials also emailed to student.</div>
                  </div>
                )}
              </div>

              {/* CSV upload */}
              <div className="bg-[#1a1a2e] rounded-xl p-5 border border-[#3a3a5a]">
                <div className="text-[#8C6D3F] text-sm font-medium mb-4 flex items-center gap-2"><Upload size={14} /> Bulk import via CSV</div>
                <div
                  className="border-2 border-dashed border-[#3a3a5a] rounded-xl p-8 text-center cursor-pointer hover:border-[#8C6D3F]/50 transition-colors mb-3"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}
                >
                  <div className="text-3xl mb-2">📄</div>
                  <div className="text-[#888] text-xs">Drop CSV file here or click to browse</div>
                  <div className="text-[#555] text-xs mt-1">Columns: full_name, email, role</div>
                  <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }} />
                </div>

                {csvPreview && (
                  <div className="bg-[#0f0f1e] rounded-lg p-3 text-xs mb-3">
                    <div className="text-[#4CAF50]">✓ {csvPreview.count} students ready to import</div>
                  </div>
                )}

                {csvFile && (
                  <button onClick={handleCsvImport} disabled={csvUploading}
                    className="w-full py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    style={{ background: "#8C6D3F", color: "white" }}>
                    {csvUploading ? "Importing…" : `Import ${csvPreview?.count ?? ""} Students`}
                  </button>
                )}

                {csvImportSummary && (
                  <div className="mt-3 text-xs space-y-1">
                    <div className="text-[#4CAF50]">Imported: {csvImportSummary.imported}</div>
                    {csvImportSummary.skipped > 0 && <div className="text-[#f59e0b]">Skipped: {csvImportSummary.skipped}</div>}
                    {csvErrors.map((e) => <div key={e.row} className="text-[#ef4444]">Row {e.row}: {e.reason}</div>)}
                  </div>
                )}

                {csvCredentials.length > 0 && (
                  <div className="mt-4">
                    <div className="text-[#8C6D3F] text-xs mb-2">Generated credentials (show once):</div>
                    <div className="bg-[#0f0f1e] rounded-lg p-2 max-h-40 overflow-y-auto text-xs space-y-1">
                      {csvCredentials.map((c) => (
                        <div key={c.email} className="flex justify-between gap-2 py-1 border-b border-[#3a3a5a]/50">
                          <span className="text-[#888] truncate">{c.email}</span>
                          <span className="font-mono text-[#ccc] flex-shrink-0">{c.password}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-[#888] text-xs mt-1">All students have been emailed their credentials.</div>
                  </div>
                )}
              </div>
            </div>

            {/* Approved students table */}
            <div className="bg-[#1a1a2e] rounded-xl border border-[#3a3a5a] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#3a3a5a] text-[#8C6D3F] text-sm font-medium">
                Approved students ({approved.length})
              </div>
              {approvedLoading ? (
                <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" /></div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#3a3a5a]">
                      {["Name", "Email", "Role", "Status", ""].map((h) => (
                        <th key={h} className="text-left px-4 py-2 text-[#888] text-xs font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {approved.map((s) => (
                      <tr key={s.email} className="border-b border-[#3a3a5a]/50">
                        <td className="px-4 py-2.5 text-[#ccc]">{s.full_name}</td>
                        <td className="px-4 py-2.5 text-[#888] text-xs">{s.email}</td>
                        <td className="px-4 py-2.5">
                          <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: "#8C6D3F22", color: "#8C6D3F" }}>{s.role}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs ${s.student_id ? "text-[#4CAF50]" : "text-[#888]"}`}>
                            {s.student_id ? "✓ Active" : "Pending"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => handleRemove(s.email)} disabled={removing === s.email} className="text-[#ef4444] text-xs hover:opacity-70 disabled:opacity-30">
                            {removing === s.email ? "…" : "Remove"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {approved.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-[#888] text-sm">No approved students yet.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Promote staff */}
            <div className="bg-[#1a1a2e] rounded-xl p-5 border border-[#3a3a5a]">
              <div className="text-[#8C6D3F] text-sm font-medium mb-4 flex items-center gap-2"><ShieldCheck size={14} /> Promote staff</div>
              <form onSubmit={handlePromote} className="flex gap-3 flex-wrap items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[#888] text-xs mb-1">Staff email</label>
                  <input type="email" value={promoteEmail} onChange={(e) => setPromoteEmail(e.target.value)}
                    className="w-full bg-[#0f0f1e] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#8C6D3F] transition-colors" />
                </div>
                <div>
                  <label className="block text-[#888] text-xs mb-1">Role</label>
                  <select value={promoteRole} onChange={(e) => setPromoteRole(e.target.value)}
                    className="bg-[#0f0f1e] border border-[#3a3a5a] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#8C6D3F] transition-colors">
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <button type="submit" disabled={promoting}
                  className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ background: "#8C6D3F22", color: "#8C6D3F", border: "1px solid #8C6D3F44" }}>
                  {promoting ? "…" : "Promote"}
                </button>
              </form>
              {promoteMsg && <p className="mt-2 text-xs text-[#4CAF50]">{promoteMsg}</p>}
            </div>
          </div>
        )}

        {/* ── ACTIVITY ── */}
        {tab === "activity" && (
          <div className="space-y-2">
            {feedLoading && <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" /></div>}
            {!feedLoading && feed.length === 0 && <p className="text-[#888] text-sm">No activity yet.</p>}
            {feed.map((item, i) => (
              <div key={i} className="bg-[#1a1a2e] rounded-lg px-4 py-3 border border-[#3a3a5a] flex justify-between items-center">
                <div>
                  <button onClick={() => setDetailStudentId(item.student_id)} className="text-[#8C6D3F] text-sm hover:underline">{item.name}</button>
                  <span className="text-[#888] text-xs ml-2">{item.detail}</span>
                  {item.token_count ? <span className="text-[#555] text-xs ml-2">· {item.token_count.toLocaleString()} tokens</span> : null}
                </div>
                <span className="text-[#555] text-xs flex-shrink-0">{item.timestamp?.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Student detail modal */}
      {detailStudentId && (
        <AdminStudentDetail studentId={detailStudentId} onClose={() => setDetailStudentId(null)} />
      )}

      {/* Change password modal */}
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} onSuccess={() => setShowChangePassword(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type check**

```
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add frontend/src/app/components/AdminDashboard.tsx
git commit -m "feat: expand AdminDashboard to 4 tabs with Overview, CSV import, student detail"
```

---

### Task 12: Wire mustChangePassword into DashboardScreen

**Files:**
- Modify: `frontend/src/app/components/DashboardScreen.tsx`

- [ ] **Step 1: Add forced password change on dashboard load**

Open `DashboardScreen.tsx`. Find the top of the component function and add:

```typescript
import { ChangePasswordModal } from "./ChangePasswordModal";

// Inside the component, after existing state declarations:
const { user, setMustChangePassword } = useAuth();
```

Then in the JSX, add before the main content:

```typescript
{user?.mustChangePassword && (
  <ChangePasswordModal
    forced
    onSuccess={() => setMustChangePassword(false)}
  />
)}
```

- [ ] **Step 2: Type check**

```
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```
git add frontend/src/app/components/DashboardScreen.tsx
git commit -m "feat: show forced ChangePasswordModal on dashboard if mustChangePassword"
```

---

### Task 13: End-to-end verification

- [ ] **Step 1: Start backend**

```
uvicorn tools.api.server:app --reload --port 8000
```

- [ ] **Step 2: Start frontend**

```
cd frontend && npm run dev
```

- [ ] **Step 3: Verify login flow**

Navigate to `http://localhost:5173`. Confirm:
- Form shows email + password fields (no name field)
- Submit with wrong password → "Incorrect password." error
- Submit with unregistered email → "Access restricted." error

- [ ] **Step 4: Verify admin route guard**

Log in as a student. Navigate to `http://localhost:5173/admin`. Confirm redirect to `/`.

- [ ] **Step 5: Verify student detail modal**

Log in as admin. In Students tab, click any student row. Confirm modal opens with stat cards, Sessions sub-tab, Cases sub-tab, Topics & Gaps sub-tab. Confirm lecturer note textarea is editable.

- [ ] **Step 6: Verify CSV import**

Create a test CSV:
```
full_name,email,role
Test Student One,test1@snec.edu.sg,OA
Test Student Two,test2@snec.edu.sg,OT
Bad Row,,PSA
```
Upload in Accounts tab. Confirm: 2 imported, 1 error, credentials table shown.

- [ ] **Step 7: Verify password change**

Log in. Click "Change password" in nav. Enter wrong current password → error. Enter correct + matching new → success. Re-login with new password → works.

- [ ] **Step 8: Run all tests**

```
pytest tests/ -v
```

Expected: all PASS

- [ ] **Step 9: Commit and push**

```
git add -A
git commit -m "test: end-to-end verification complete"
git push
```
