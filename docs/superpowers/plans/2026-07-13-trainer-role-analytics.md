# Trainer Role, Unified Staff App & Analytics Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `trainer` role, fold `trainer` + `admin` into the exact student app with a loud homepage content-pool toggle (OA·PSA ↔ OT) and a dark, real-time PowerBI-style Analytics dashboard (admin-only student provisioning), and remove the `supervisor` role.

**Architecture:** Three top-level roles — `student` / `trainer` / `admin`. Backend guards collapse to `require_staff` (admin+trainer) for all analytics and `require_admin` for provisioning. The homepage toggle flips the staff member's own `student_profiles.role` between `OA` and `OT`, so every existing content + gamification path follows with zero new content plumbing. A new dark, self-themed `/analytics` route (kept in the light shell via a scoped `.aurora-analytics` class) reuses the existing `/api/supervisor/*` + read-only `/api/admin/*` endpoints, plus two additive migrations (`flashcard_attempts`, extended `case_progress`) that unlock per-topic accuracy and full OSCE-grade analytics. The per-student report is a self-contained, print-to-PDF HTML file cloning the proven `sessionExport.ts` pattern.

**Tech Stack:** FastAPI + uvicorn (Python 3.12, async), custom JWT in an HttpOnly cookie; Next.js 16 (App Router, standalone) + React 19, TanStack Query, dependency-free SVG charts; Supabase (Postgres + pgvector); tests via `pytest` (MOCK_MODE keyless) + Node harnesses in `frontend/tests/`.

**Build order (foundations-first — never ship `main` red):** Phase 1 → 2 (backend role/guards + graceful migrations) → 3 (shell/routing consolidation) → 4 (toggle) → 5 (dashboard) → 6 (report) → 7 (docs/rollout). Full green gate (`python -m pytest -q` · `cd frontend && npm run typecheck && npm run build` · `bash scripts/start-harness.sh aurora`) before each push.

---

## Phase 1 — Backend role model, guard collapse, auth resolution, supervisor removal

**Files:**
- `tools/shared/jwt_utils.py` — rename `require_supervisor` → `require_staff` (allow `{"admin","trainer"}`), `require_admin` unchanged, `CurrentUser.role` comment.
- `tools/api/routers/supervisor.py` — swap the guard import + all 9 `Depends(require_supervisor)`.
- `tools/api/routers/student.py` — swap the guard import + `PATCH /api/profile/role` guard.
- `tools/api/routers/auth.py` — `_normalise_staff_role` helper; login role pass-through + legacy `supervisor→trainer`; onboard preserve staff role; `MeResponse.student_role` from `student_profiles.role`.
- `tools/api/routers/admin.py` — re-gate the 5 read endpoints to `require_staff`; keep `require_admin` on mutations; widen `promote` `new_role` to `{trainer,admin}`; extend `POST /api/admin/approved` to provision staff (auth cred + `upsert_supervisor`).
- `tests/shared/test_jwt_utils.py`, `tests/api/test_auth_endpoints.py`, `tests/api/test_admin_endpoints.py` — TDD coverage (spec §10).

---

### Task P1.1: Guard collapse — `require_supervisor` → `require_staff`

- [ ] **Step 1: Failing test first — rewrite the guard tests in `tests/shared/test_jwt_utils.py`.** Replace the four `supervisor`-named tests (lines 34–39 and 81–104) with the `require_staff` set. Apply these edits.

Edit A (lines 34–39):
```python
def test_supervisor_role_in_token():
    from tools.shared.jwt_utils import create_access_token, decode_token
    token = create_access_token("supervisor-uuid", "supervisor", "")
    payload = decode_token(token)
    assert payload["role"] == "supervisor"
    assert payload["student_role"] == ""
```
becomes
```python
def test_trainer_role_in_token():
    from tools.shared.jwt_utils import create_access_token, decode_token
    token = create_access_token("trainer-uuid", "trainer", "")
    payload = decode_token(token)
    assert payload["role"] == "trainer"
    assert payload["student_role"] == ""
```

Edit B (lines 81–104):
```python
def test_require_supervisor_with_student_token_raises_403():
    from tools.shared.jwt_utils import create_access_token, decode_token, require_supervisor
    token = create_access_token("student-id", "student", "OA")
    user = decode_token(token)
    with pytest.raises(HTTPException) as exc_info:
        require_supervisor(current_user=user)
    assert exc_info.value.status_code == 403


def test_require_admin_with_supervisor_token_raises_403():
    from tools.shared.jwt_utils import create_access_token, decode_token, require_admin
    token = create_access_token("sup-id", "supervisor", "")
    user = decode_token(token)
    with pytest.raises(HTTPException) as exc_info:
        require_admin(current_user=user)
    assert exc_info.value.status_code == 403


def test_require_supervisor_passes_for_admin_role():
    from tools.shared.jwt_utils import create_access_token, decode_token, require_supervisor
    token = create_access_token("admin-id", "admin", "")
    user = decode_token(token)
    result = require_supervisor(current_user=user)
    assert result["role"] == "admin"
```
becomes
```python
def test_require_staff_with_student_token_raises_403():
    from tools.shared.jwt_utils import create_access_token, decode_token, require_staff
    token = create_access_token("student-id", "student", "OA")
    user = decode_token(token)
    with pytest.raises(HTTPException) as exc_info:
        require_staff(current_user=user)
    assert exc_info.value.status_code == 403


def test_require_admin_with_trainer_token_raises_403():
    from tools.shared.jwt_utils import create_access_token, decode_token, require_admin
    token = create_access_token("trainer-id", "trainer", "")
    user = decode_token(token)
    with pytest.raises(HTTPException) as exc_info:
        require_admin(current_user=user)
    assert exc_info.value.status_code == 403


def test_require_staff_passes_for_admin_role():
    from tools.shared.jwt_utils import create_access_token, decode_token, require_staff
    token = create_access_token("admin-id", "admin", "")
    user = decode_token(token)
    result = require_staff(current_user=user)
    assert result["role"] == "admin"


def test_require_staff_passes_for_trainer_role():
    from tools.shared.jwt_utils import create_access_token, decode_token, require_staff
    token = create_access_token("trainer-id", "trainer", "")
    user = decode_token(token)
    result = require_staff(current_user=user)
    assert result["role"] == "trainer"
```

- [ ] **Step 2: Run the test — expect FAIL.** `python -m pytest -q tests/shared/test_jwt_utils.py` → **FAIL** (`ImportError: cannot import name 'require_staff'`).

- [ ] **Step 3: Rename the guard in `tools/shared/jwt_utils.py`.** Edit the `CurrentUser.role` comment (line 21) and the `require_supervisor` function (lines 69–73).

`    role: str          # "student" | "supervisor" | "admin"` → `    role: str          # "student" | "trainer" | "admin"`

```python
def require_supervisor(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """FastAPI dependency: requires supervisor or admin role."""
    if current_user["role"] not in ("supervisor", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Supervisor access required")
    return current_user
```
becomes
```python
def require_staff(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """FastAPI dependency: requires staff (trainer or admin) role.

    Gates every /api/supervisor/* route and the read-only /api/admin/* analytics
    endpoints. Provisioning stays admin-only via require_admin.
    """
    if current_user["role"] not in ("admin", "trainer"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required")
    return current_user
```

- [ ] **Step 4: Update the importer `tools/api/routers/supervisor.py`.** Edit the import (line 11): `from tools.shared.jwt_utils import require_supervisor, CurrentUser` → `from tools.shared.jwt_utils import require_staff, CurrentUser`. Then `Edit` with `replace_all: true` on `Depends(require_supervisor)` → `Depends(require_staff)` (9 occurrences).

- [ ] **Step 5: Update the importer `tools/api/routers/student.py`.** Edit the import (line 22): `from tools.shared.jwt_utils import get_current_user, require_supervisor, CurrentUser` → `from tools.shared.jwt_utils import get_current_user, require_staff, CurrentUser`. Then `Edit` with `replace_all: true` on `Depends(require_supervisor)` → `Depends(require_staff)` (1 occurrence, `PATCH /api/profile/role`).

- [ ] **Step 6: Run tests — expect PASS.** `python -m pytest -q tests/shared/test_jwt_utils.py tests/api` → **PASS** (guard rename + both importers resolve; server imports cleanly).

- [ ] **Step 7: Commit.** Stage only these files.
```
git add tools/shared/jwt_utils.py tools/api/routers/supervisor.py tools/api/routers/student.py tests/shared/test_jwt_utils.py
git commit -m "refactor(auth): collapse require_supervisor into require_staff {admin,trainer}

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P1.2: Auth role resolution — `supervisor→trainer` normalise + `student_role` from profile

- [ ] **Step 1: Failing tests first — edit `tests/api/test_auth_endpoints.py`.** Replace `test_login_student_promoted_to_supervisor` (lines 94–109) and append three new tests.

Replace (lines 94–109):
```python
def test_login_student_promoted_to_supervisor():
    """Student in both approved_students and supervisors gets supervisor role."""
    auth_row = _make_auth_row("promo@test.com", "pass123")
    approved_row = _make_approved_row("promo@test.com", role="OA")
    sup_row = {"email": "promo@test.com", "role": "supervisor"}

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=sup_row)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student", return_value="stu_004"), \
         patch("tools.api.routers.auth.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "promo@test.com", "password": "pass123"})
    assert r.status_code == 200
    data = r.json()
    assert data["role"] == "supervisor"
    assert data["must_change"] is False
```
with
```python
def test_login_student_promoted_to_trainer():
    """Student also in supervisors resolves the staff role; a legacy 'supervisor'
    row normalises to 'trainer' so the account is never locked out."""
    auth_row = _make_auth_row("promo@test.com", "pass123")
    approved_row = _make_approved_row("promo@test.com", role="OA")
    sup_row = {"email": "promo@test.com", "role": "supervisor"}

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=sup_row)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student", return_value="stu_004"), \
         patch("tools.api.routers.auth.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "promo@test.com", "password": "pass123"})
    assert r.status_code == 200
    data = r.json()
    assert data["role"] == "trainer"
    assert data["must_change"] is False


def test_login_trainer_from_supervisors_only():
    """An email present ONLY in supervisors (not approved students) with role
    'trainer' logs in as trainer."""
    auth_row = _make_auth_row("coach@test.com", "pass123")
    sup_row = {"email": "coach@test.com", "role": "trainer"}

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=sup_row)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student", return_value="stu_005"), \
         patch("tools.api.routers.auth.has_consented", return_value=True):
        r = client.post("/api/auth/login", json={"email": "coach@test.com", "password": "pass123"})
    assert r.status_code == 200
    assert r.json()["role"] == "trainer"


def test_me_student_role_from_profile():
    """/api/auth/me sources student_role from student_profiles.role (the effective
    content pool a staff toggle writes), not the stale JWT claim."""
    consent_row = {"email": "coach@test.com", "student_id": "stu_006", "student_name": "Coach"}

    with patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=consent_row)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_profile", new=AsyncMock(return_value={"role": "OT"})):
        r = client.get("/api/auth/me", cookies=_auth_cookie("stu_006", "trainer", "OA"))
    assert r.status_code == 200
    assert r.json()["student_role"] == "OT"


def test_onboard_preserves_trainer_role():
    """Onboarding an email in supervisors preserves the staff role (legacy
    'supervisor' → 'trainer'); it no longer collapses to 'supervisor'."""
    sup_row = {"email": "coach@test.com", "role": "supervisor"}

    with patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=sup_row)), \
         patch("tools.api.routers.auth.get_or_create_student", return_value="stu_007"), \
         patch("tools.api.routers.auth.has_consented", return_value=False), \
         patch("tools.api.routers.auth.record_consent"):
        r = client.post("/api/onboard", json={"full_name": "Coach", "email": "coach@test.com", "student_role": ""})
    assert r.status_code == 200
    assert r.json()["role"] == "trainer"
```

- [ ] **Step 2: Run — expect FAIL.** `python -m pytest -q tests/api/test_auth_endpoints.py -k "trainer or student_role_from_profile"` → **FAIL** (login/onboard still return `"supervisor"`; `/me` returns the JWT claim `"OA"`).

- [ ] **Step 3: Add the `_normalise_staff_role` helper in `tools/api/routers/auth.py`.** Insert immediately after `router = APIRouter()` (line 17).
```python
router = APIRouter()


def _normalise_staff_role(raw: str) -> str:
    """Map a stored supervisors.role to a top-level staff role.

    Legacy 'supervisor' rows normalise to 'trainer' (safe demotion: keeps
    analytics, loses provisioning); 'admin' passes through; anything else falls
    back to 'trainer'. 'supervisor' is removed as a top-level role everywhere.
    """
    return "admin" if (raw or "").strip().lower() == "admin" else "trainer"
```

- [ ] **Step 4: Normalise the login approved-miss branch in `tools/api/routers/auth.py` (lines 79–80).**
```python
        approved_role = "admin" if (email == SUPER_ADMIN_EMAIL or (sup_row and sup_row.get("role") == "admin")) else "supervisor"
        approved_student_role = ""
```
becomes
```python
        if email == SUPER_ADMIN_EMAIL:
            approved_role = "admin"
        else:
            approved_role = _normalise_staff_role(sup_row.get("role") if sup_row else "")
        approved_student_role = ""
```

- [ ] **Step 5: Normalise the login student-also-staff branch in `tools/api/routers/auth.py` (line 111).**
```python
            final_role = sup_row.get("role") or "supervisor"
```
becomes
```python
            final_role = _normalise_staff_role(sup_row.get("role"))
```

- [ ] **Step 6: Preserve the staff role on onboard in `tools/api/routers/auth.py` (line 244).**
```python
                role = "admin" if sup_row.get("role", "").lower() == "admin" else "supervisor"
```
becomes
```python
                role = _normalise_staff_role(sup_row.get("role"))
```

- [ ] **Step 7: Source `MeResponse.student_role` from the profile in `tools/api/routers/auth.py` (auth_me, lines 136–145).**
```python
    auth_row = await db.get_auth(email) if email else None
    must_change = bool(auth_row.get("must_change", False)) if auth_row else False
    return MeResponse(
        student_id=student_id,
        role=current_user["role"],
        student_role=current_user["student_role"],
        full_name=full_name,
        email=email,
        must_change=must_change,
    )
```
becomes
```python
    auth_row = await db.get_auth(email) if email else None
    must_change = bool(auth_row.get("must_change", False)) if auth_row else False
    # student_role = the effective content pool from student_profiles.role (the
    # homepage toggle writes it for staff); fall back to the JWT claim.
    profile = await db.get_profile(student_id)
    student_role = (profile.get("role") if profile else "") or current_user["student_role"]
    return MeResponse(
        student_id=student_id,
        role=current_user["role"],
        student_role=student_role,
        full_name=full_name,
        email=email,
        must_change=must_change,
    )
```

- [ ] **Step 8: Update the stale `OnboardResponse.role` comment in `tools/api/routers/auth.py` (line 28).** `    role: str = "student"  # "student" or "supervisor"` → `    role: str = "student"  # "student" | "trainer" | "admin"`.

- [ ] **Step 9: Run — expect PASS.** `python -m pytest -q tests/api/test_auth_endpoints.py` → **PASS** (all new + existing auth tests green).

- [ ] **Step 10: Commit.** Stage only these files.
```
git add tools/api/routers/auth.py tests/api/test_auth_endpoints.py
git commit -m "feat(auth): resolve trainer role, normalise legacy supervisor->trainer, /me student_role from profile

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P1.3: Admin endpoints — re-gate reads to `require_staff`, widen promote, provision staff

- [ ] **Step 1: Failing tests first — replace `tests/api/test_admin_endpoints.py` in full.** Write the file with the two-tier guard split.
```python
# tests/api/test_admin_endpoints.py
"""Security and functional tests for admin endpoints.

Two guard tiers:
  • require_staff  → read-only analytics: admin + trainer allowed, student 403.
  • require_admin  → add/remove/CSV/promote: admin only, trainer + student 403.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

# Read-only analytics endpoints — require_staff (admin + trainer)
STAFF_READ_ENDPOINTS = [
    ("GET", "/api/admin/approved"),
    ("GET", "/api/admin/students"),
    ("GET", "/api/admin/activity"),
    ("GET", "/api/admin/student/stu_x/detail"),
    ("GET", "/api/admin/token-summary"),
]

# Mutating endpoints — require_admin (admin only)
ADMIN_ONLY_ENDPOINTS = [
    ("POST",   "/api/admin/approved"),
    ("DELETE", "/api/admin/approved/test@x.com"),
    ("POST",   "/api/admin/promote"),
    ("DELETE", "/api/admin/promote/test@x.com"),
    ("POST",   "/api/admin/upload-csv"),
]

ALL_ENDPOINTS = STAFF_READ_ENDPOINTS + ADMIN_ONLY_ENDPOINTS


def _cookies(role: str, student_role: str = "OA") -> dict:
    token = create_access_token("user_001", role, student_role)
    return {"eyebot_token": token}


def _admin_headers() -> dict:
    return _cookies("admin")


def _trainer_headers() -> dict:
    return _cookies("trainer")


def _student_headers() -> dict:
    return _cookies("student")


# ---------------------------------------------------------------------------
# Auth enforcement — no token
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("method,path", ALL_ENDPOINTS)
def test_admin_endpoint_rejects_unauthenticated(method, path):
    r = client.request(method, path)
    assert r.status_code in (401, 403), f"{method} {path} → {r.status_code}"


# ---------------------------------------------------------------------------
# Auth enforcement — student rejected everywhere
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("method,path", ALL_ENDPOINTS)
def test_admin_endpoint_rejects_student_token(method, path):
    r = client.request(method, path, cookies=_student_headers())
    assert r.status_code == 403, f"{method} {path} → {r.status_code}"


# ---------------------------------------------------------------------------
# Auth enforcement — trainer: allowed on reads, 403 on mutations
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("method,path", ADMIN_ONLY_ENDPOINTS)
def test_admin_only_endpoint_rejects_trainer_token(method, path):
    """The single trainer exception: add/remove/CSV/promote stay admin-only."""
    r = client.request(method, path, cookies=_trainer_headers())
    assert r.status_code == 403, f"{method} {path} → {r.status_code}"


@pytest.mark.parametrize("method,path", STAFF_READ_ENDPOINTS)
def test_staff_read_endpoint_allows_trainer_token(method, path):
    """Trainer must pass the require_staff guard on read-only analytics endpoints.

    The DB reads aren't mocked here, so a 500 is acceptable — the point is the
    guard let the trainer through rather than returning 401/403.
    """
    r = client.request(method, path, cookies=_trainer_headers())
    assert r.status_code not in (401, 403), f"{method} {path} → {r.status_code}"


# ---------------------------------------------------------------------------
# Functional: list approved students
# ---------------------------------------------------------------------------

def test_admin_list_approved_returns_students():
    rows = [
        {"email": "a@test.com", "full_name": "Alice", "role": "OA"},
        {"email": "b@test.com", "full_name": "Bob",   "role": "OT"},
    ]
    with patch("tools.shared.db.get_all_approved", new=AsyncMock(return_value=rows)):
        r = client.get("/api/admin/approved", cookies=_admin_headers())
    assert r.status_code == 200
    assert len(r.json()["students"]) == 2


def test_admin_list_approved_returns_empty_list():
    with patch("tools.shared.db.get_all_approved", new=AsyncMock(return_value=[])):
        r = client.get("/api/admin/approved", cookies=_admin_headers())
    assert r.status_code == 200
    assert r.json()["students"] == []


def test_admin_list_approved_500_on_sheets_failure():
    with patch("tools.shared.db.get_all_approved", new=AsyncMock(side_effect=Exception("db down"))):
        r = client.get("/api/admin/approved", cookies=_admin_headers())
    assert r.status_code == 500
    assert "db down" not in r.json()["detail"]


# ---------------------------------------------------------------------------
# Functional: approve one student
# ---------------------------------------------------------------------------

def test_admin_approve_student_success():
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"email": "admin@test.com", "student_id": "user_001"})), \
         patch("tools.shared.db.upsert_approved", new=AsyncMock()), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.shared.gmail_sender.send_email", return_value=None), \
         patch("tools.api.routers.admin.generate_password", return_value="TmpPass1!"):
        r = client.post(
            "/api/admin/approved",
            json={"email": "new@test.com", "full_name": "New User", "role": "OA"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert r.json()["password"] == "TmpPass1!"
    assert r.json()["email_sent"] is True


def test_admin_approve_trainer_provisions_supervisor():
    """A staff role (Trainer/Admin) creates a supervisors row + auth credential,
    NOT an approved-students row, so a brand-new trainer can log in."""
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"email": "admin@test.com", "student_id": "user_001"})), \
         patch("tools.shared.db.upsert_supervisor", new=AsyncMock()) as mock_sup, \
         patch("tools.shared.db.upsert_approved", new=AsyncMock()) as mock_appr, \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.shared.gmail_sender.send_email", return_value=None), \
         patch("tools.api.routers.admin.generate_password", return_value="TmpPass1!"):
        r = client.post(
            "/api/admin/approved",
            json={"email": "coach@test.com", "full_name": "Coach", "role": "trainer"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    mock_sup.assert_called_once_with("coach@test.com", role="trainer")
    mock_appr.assert_not_called()


def test_admin_approve_student_409_duplicate():
    existing = {"email": "dup@test.com", "full_name": "Dup", "role": "OA"}

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=existing)):
        r = client.post(
            "/api/admin/approved",
            json={"email": "dup@test.com", "full_name": "Dup", "role": "OA"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 409


def test_admin_approve_student_400_empty_email():
    r = client.post(
        "/api/admin/approved",
        json={"email": "   ", "full_name": "X", "role": "OA"},
        cookies=_admin_headers(),
    )
    assert r.status_code == 400


def test_admin_approve_student_returns_temp_password_when_email_fails():
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"email": "admin@test.com", "student_id": "user_001"})), \
         patch("tools.shared.db.upsert_approved", new=AsyncMock()), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.shared.gmail_sender.send_email", side_effect=Exception("smtp down")), \
         patch("tools.api.routers.admin.generate_password", return_value="SuperSecret1!"):
        r = client.post(
            "/api/admin/approved",
            json={"email": "safe@test.com", "full_name": "Safe User", "role": "OT"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert r.json()["email_sent"] is False
    assert r.json()["password"] == "SuperSecret1!"


# ---------------------------------------------------------------------------
# Functional: remove student
# ---------------------------------------------------------------------------

def test_admin_remove_student_success():
    with patch("tools.shared.db.delete_approved", new=AsyncMock(return_value=True)):
        r = client.delete("/api/admin/approved/gone@test.com", cookies=_admin_headers())
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_admin_remove_student_404_not_found():
    with patch("tools.shared.db.delete_approved", new=AsyncMock(return_value=False)):
        r = client.delete("/api/admin/approved/nobody@test.com", cookies=_admin_headers())
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Functional: promote staff (widened to trainer/admin)
# ---------------------------------------------------------------------------

def test_admin_promote_trainer_success():
    with patch("tools.shared.db.upsert_supervisor", new=AsyncMock()) as mock_sup:
        r = client.post(
            "/api/admin/promote",
            json={"email": "staff@test.com", "new_role": "trainer"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200
    mock_sup.assert_called_once_with("staff@test.com", role="trainer")


def test_admin_promote_invalid_role():
    # Role check fires before any DB call; no patch needed
    r = client.post(
        "/api/admin/promote",
        json={"email": "x@test.com", "new_role": "overlord"},
        cookies=_admin_headers(),
    )
    assert r.status_code == 400
```

- [ ] **Step 2: Run — expect FAIL.** `python -m pytest -q tests/api/test_admin_endpoints.py` → **FAIL** (`test_staff_read_endpoint_allows_trainer_token` → 403 because reads still `require_admin`; `test_admin_approve_trainer_provisions_supervisor` → `upsert_approved` still called; `test_admin_promote_trainer_success` → 400, `new_role` still `{supervisor,admin}`).

- [ ] **Step 3: Import `require_staff` in `tools/api/routers/admin.py` (line 16).** `from tools.shared.jwt_utils import CurrentUser, require_admin` → `from tools.shared.jwt_utils import CurrentUser, require_admin, require_staff`.

- [ ] **Step 4: Re-gate the 5 read endpoints to `require_staff`.** Edit each decorator's dependency in `tools/api/routers/admin.py`:
  - Line 35 `admin_list_approved`: `Depends(require_admin)` → `Depends(require_staff)`
  - Line 98 `admin_all_students`: `Depends(require_admin)` → `Depends(require_staff)`
  - Line 129 `admin_activity`: `Depends(require_admin)` → `Depends(require_staff)`
  - Line 177 `admin_student_detail`: `Depends(require_admin)` → `Depends(require_staff)`
  - Line 233 `admin_token_summary`: `Depends(require_admin)` → `Depends(require_staff)`

  (Leave `Depends(require_admin)` on lines 43, 91, 162, 171, 253 — add/remove/promote/demote/CSV.)

- [ ] **Step 5: Widen promote validation in `tools/api/routers/admin.py`.** Update the `PromoteRequest` comment (line 29) and the validation (lines 164–166).

`    new_role: str  # "supervisor" | "admin"` → `    new_role: str  # "trainer" | "admin"`

```python
    new_role = body.new_role.strip().lower()
    if new_role not in ("supervisor", "admin"):
        raise HTTPException(status_code=400, detail="new_role must be 'supervisor' or 'admin'")
```
becomes
```python
    new_role = body.new_role.strip().lower()
    if new_role not in ("trainer", "admin"):
        raise HTTPException(status_code=400, detail="new_role must be 'trainer' or 'admin'")
```

- [ ] **Step 6: Extend `POST /api/admin/approved` to provision staff in `tools/api/routers/admin.py` (lines 43–64).** Update the `ApproveStudentRequest.role` comment (line 25) `    role: str = ""  # OA | OT | PSA` → `    role: str = ""  # OA | OT | PSA | trainer | admin`, then replace the body up to the auth-hash block:
```python
async def admin_approve_student(body: ApproveStudentRequest, current_user: CurrentUser = Depends(require_admin)):
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    existing = await db.get_approved(email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already approved")
    _consent = await db.get_consent_by_student_id(current_user["sub"])
    admin_email = _consent.get("email", "") if _consent else ""
    await db.upsert_approved(
        email,
        full_name=body.full_name.strip(),
        role=body.role.strip().upper(),
        added_by=admin_email,
        added_at=datetime.now(timezone.utc).isoformat(),
    )
    plain_pw = generate_password()
    pw_hash = await asyncio.to_thread(hash_password, plain_pw)
```
becomes
```python
async def admin_approve_student(body: ApproveStudentRequest, current_user: CurrentUser = Depends(require_admin)):
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    role = body.role.strip().upper()
    is_staff = role in ("TRAINER", "ADMIN")
    existing = await db.get_approved(email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already approved")
    _consent = await db.get_consent_by_student_id(current_user["sub"])
    admin_email = _consent.get("email", "") if _consent else ""
    if is_staff:
        # Staff live in the supervisors table, not the approved-students whitelist.
        # Create the credential + supervisors row so a brand-new trainer/admin can
        # log in (identity/profile are created on first login as usual).
        await db.upsert_supervisor(email, role=role.lower())
    else:
        await db.upsert_approved(
            email,
            full_name=body.full_name.strip(),
            role=role,
            added_by=admin_email,
            added_at=datetime.now(timezone.utc).isoformat(),
        )
    plain_pw = generate_password()
    pw_hash = await asyncio.to_thread(hash_password, plain_pw)
```

- [ ] **Step 7: Run — expect PASS.** `python -m pytest -q tests/api/test_admin_endpoints.py` → **PASS**.

- [ ] **Step 8: Full backend gate — expect PASS.** `python -m pytest -q` → **PASS** (no regressions across the suite from the guard/role changes).

- [ ] **Step 9: Commit.** Stage only these files.
```
git add tools/api/routers/admin.py tests/api/test_admin_endpoints.py
git commit -m "feat(admin): trainer reads via require_staff, admin-only mutations, staff provisioning + promote widen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 2 — Additive migrations + persistence wiring (spec §8)

**Files:**
- `tools/db/migrations/010_flashcard_attempts.sql` — **new**: per-card grading log table (§8.1)
- `tools/db/migrations/011_case_progress_grade.sql` — **new**: rich OSCE-grade columns on `case_progress` (§8.2)
- `tools/db/migrations/APPLIED.md` — ledger both as PENDING
- `tools/shared/db.py` — `insert_flashcard_attempt` / `get_flashcard_attempts` / `get_topic_accuracy`; widen `insert_case_result` (graceful) + `get_case_results` docstring
- `tools/cases/log_case_completion.py` — widen signature to carry the rich grade
- `tools/api/routers/cases.py` — `case_submit`: wire the already-computed rich grade + coaching through to `log_case_completion`
- `tools/api/routers/student.py` — `flashcards_complete`: write attempts + feed per-topic accuracy into retention; extend `CompleteCardResult`
- `tests/shared/test_db.py` — db-helper unit tests (attempts, topic accuracy, graceful case insert)
- `tests/api/test_flashcards_complete.py` — attempts persisted + retention moves
- `tests/cases/test_log_case_completion.py` — **new**: rich grade passes through, never raises
- `tests/cases/test_case_submit_persists_grade.py` — **new**: `/submit` end-to-end feeds the rich grade

All DB helpers are additive and **graceful before the migrations are applied** (a missing column/table is caught), so `main` stays green when these land; migrations 010/011 ship as PENDING and are applied out-of-band via `/db-migrate`.

---

### Task P2.1: Migration 010 — `flashcard_attempts` table

- [ ] **Step 1: Write the migration.** Create `tools/db/migrations/010_flashcard_attempts.sql` (010 is the next free number — the dir ends at `009_lumens.sql`). Mirror the `001_flashcards.sql` house style; PG-safe idempotency uses `DROP POLICY IF EXISTS` + `CREATE POLICY` (never `CREATE POLICY IF NOT EXISTS`, PG 42601):

```sql
-- Migration 010: flashcard_attempts — per-card grading log (deep analytics, spec §8.1)
-- Run via the /db-migrate skill or the Supabase SQL editor.
--
-- Every graded flashcard answer is appended here so the Analytics dashboard can compute
-- true per-topic accuracy, accuracy-over-time and repeatedly-failed cards — the platform's
-- highest-volume learning signal, discarded before this migration. The app degrades
-- gracefully until applied: POST /api/flashcards/complete swallows a missing table and the
-- study loop is unaffected.

CREATE TABLE IF NOT EXISTS flashcard_attempts (
  attempt_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES student_profiles(student_id) ON DELETE CASCADE,
  card_id      TEXT,                                    -- NULL for static (non-SM-2) cards
  topic_tag    TEXT NOT NULL DEFAULT 'general',
  correct      BOOLEAN NOT NULL DEFAULT false,
  score        INTEGER NOT NULL DEFAULT 0,
  ts           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-student, per-topic accuracy scan (the dashboard's hot path).
CREATE INDEX IF NOT EXISTS idx_flashcard_attempts_student_topic
  ON flashcard_attempts(student_id, topic_tag);

-- Per-student chronological scan for accuracy-over-time trends.
CREATE INDEX IF NOT EXISTS idx_flashcard_attempts_student_ts
  ON flashcard_attempts(student_id, ts DESC);

-- RLS mirrors the flashcards table: students touch only their own rows. The API uses the
-- service-role key (bypasses RLS); this guards against direct / anon-key access.
ALTER TABLE flashcard_attempts ENABLE ROW LEVEL SECURITY;

-- PG-safe idempotency: DROP-then-CREATE (no CREATE POLICY IF NOT EXISTS, PG 42601).
DROP POLICY IF EXISTS flashcard_attempts_own_student ON flashcard_attempts;
CREATE POLICY flashcard_attempts_own_student ON flashcard_attempts
  FOR ALL
  USING (student_id::text = auth.uid()::text);
```

- [ ] **Step 2: Lint for forbidden DDL — expect EMPTY output.** Run (Bash tool):
```bash
grep -nE "(ADD CONSTRAINT|CREATE POLICY) IF NOT EXISTS" tools/db/migrations/010_flashcard_attempts.sql || echo "OK: no forbidden DDL"
```
Expected: prints `OK: no forbidden DDL` (the guarded patterns are absent). Optionally also run `/db-migrate` on the file to confirm paste-ready SQL.

- [ ] **Step 3: Ledger as PENDING.** Append to `tools/db/migrations/APPLIED.md` after the `009_lumens.sql` line:
```markdown
- [ ] 010_flashcard_attempts.sql — **PENDING APPLICATION** (per-card flashcard grading log for Analytics per-topic accuracy; app degrades gracefully — the study loop swallows a missing table until this is applied)
```

- [ ] **Step 4: Commit.**
```bash
git add tools/db/migrations/010_flashcard_attempts.sql tools/db/migrations/APPLIED.md
git commit -m "feat(analytics): migration 010 flashcard_attempts (PENDING)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P2.2: Migration 011 — extend `case_progress` with the rich OSCE grade

- [ ] **Step 1: Write the migration.** Create `tools/db/migrations/011_case_progress_grade.sql`. All columns nullable/additive (`ADD COLUMN IF NOT EXISTS` is the house-style idempotent form, per `005`/`008`):

```sql
-- Migration 011: case_progress rich OSCE grade columns (deep analytics, spec §8.2)
-- Run via the /db-migrate skill or the Supabase SQL editor.
--
-- The OSCE submit path already COMPUTES a Station-100 score, safety verdict, the two
-- sub-domain scores, the missed-critical steps and the coaching block — then dropped them.
-- These additive, nullable columns capture them so the Analytics dashboard can show cohort
-- safety-failure rate, sub-domain trends and most-missed critical steps. All nullable →
-- db.insert_case_result writes them when present and falls back to the base four columns
-- until this migration is applied.

ALTER TABLE case_progress
  ADD COLUMN IF NOT EXISTS score_100         INTEGER,
  ADD COLUMN IF NOT EXISTS safe              BOOLEAN,
  ADD COLUMN IF NOT EXISTS consult_technique INTEGER,
  ADD COLUMN IF NOT EXISTS judgement_safety  INTEGER,
  ADD COLUMN IF NOT EXISTS missed_critical   JSONB,
  ADD COLUMN IF NOT EXISTS coaching          JSONB;
```

- [ ] **Step 2: Lint for forbidden DDL — expect EMPTY output.**
```bash
grep -nE "(ADD CONSTRAINT|CREATE POLICY) IF NOT EXISTS" tools/db/migrations/011_case_progress_grade.sql || echo "OK: no forbidden DDL"
```
Expected: `OK: no forbidden DDL`.

- [ ] **Step 3: Ledger as PENDING.** Append to `tools/db/migrations/APPLIED.md`:
```markdown
- [ ] 011_case_progress_grade.sql — **PENDING APPLICATION** (rich OSCE-grade columns on case_progress: score_100/safe/consult_technique/judgement_safety/missed_critical/coaching; db.insert_case_result falls back to the base 4 columns until applied)
```

- [ ] **Step 4: Commit.**
```bash
git add tools/db/migrations/011_case_progress_grade.sql tools/db/migrations/APPLIED.md
git commit -m "feat(analytics): migration 011 case_progress rich grade (PENDING)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P2.3: `db.py` — flashcard-attempt helpers

- [ ] **Step 1: Write the failing tests.** Append to `tests/shared/test_db.py` (imports `AsyncMock, MagicMock, patch` and `_make_client` already exist at the top of the file):

```python
# ── flashcard_attempts (migration 010) ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_insert_flashcard_attempt_writes_to_table():
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.insert_flashcard_attempt("stu-001", "c1", "glaucoma", True, 20)
    client.table.assert_called_with("flashcard_attempts")
    payload = client.table.return_value.insert.call_args[0][0]
    assert payload == {"student_id": "stu-001", "card_id": "c1",
                       "topic_tag": "glaucoma", "correct": True, "score": 20}


@pytest.mark.asyncio
async def test_get_flashcard_attempts_returns_list():
    rows = [{"topic_tag": "glaucoma", "correct": True}]
    client = _make_client(rows)
    # get_flashcard_attempts uses select().eq().order().execute() (no limit) — wire it.
    resp = MagicMock(); resp.data = rows
    client.table.return_value.select.return_value.eq.return_value.order.return_value.execute = \
        AsyncMock(return_value=resp)
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        result = await db.get_flashcard_attempts("stu-001")
    assert result == rows


@pytest.mark.asyncio
async def test_get_topic_accuracy_aggregates_per_topic():
    attempts = [
        {"topic_tag": "glaucoma", "correct": True},
        {"topic_tag": "glaucoma", "correct": False},
        {"topic_tag": "amd", "correct": True},
    ]
    with patch("tools.shared.db.get_flashcard_attempts", new=AsyncMock(return_value=attempts)):
        acc = await db.get_topic_accuracy("stu-001")
    assert acc["glaucoma"] == {"correct": 1, "total": 2, "pct": 50.0}
    assert acc["amd"] == {"correct": 1, "total": 1, "pct": 100.0}
```

- [ ] **Step 2: Run the tests — expect FAIL.**
```bash
python -m pytest -q tests/shared/test_db.py -k "flashcard_attempt or topic_accuracy"
```
Expected: FAIL — `AttributeError: module 'tools.shared.db' has no attribute 'insert_flashcard_attempt'` (helpers don't exist yet).

- [ ] **Step 3: Implement the helpers.** In `tools/shared/db.py`, insert this block immediately after `get_case_results` (after line 157, before the `# ── Admin helpers` banner at line 160):

```python
# ── flashcard_attempts (migration 010 — per-card grading log) ──────────────────

async def insert_flashcard_attempt(
    student_id: str, card_id: str | None, topic_tag: str, correct: bool, score: int
) -> None:
    """Append a per-card flashcard attempt. Raises if the table is missing
    (pre-migration 010) — callers best-effort-catch so the study loop still works."""
    client = await _get_client()
    await client.table("flashcard_attempts").insert(
        {
            "student_id": student_id,
            "card_id": card_id,
            "topic_tag": topic_tag,
            "correct": correct,
            "score": score,
        }
    ).execute()


async def get_flashcard_attempts(student_id: str) -> list[dict]:
    """Return all flashcard attempts for a student, newest first. Raises on a missing
    table (pre-migration 010) — callers catch and treat as no data."""
    client = await _get_client()
    result = (
        await client.table("flashcard_attempts")
        .select("*")
        .eq("student_id", student_id)
        .order("ts", desc=True)
        .execute()
    )
    return result.data or []


async def get_topic_accuracy(student_id: str) -> dict[str, dict]:
    """Per-topic flashcard accuracy for a student:
    {topic_tag: {"correct": int, "total": int, "pct": float}}. Built from the raw
    attempts, so it propagates the pre-migration missing-table error to the caller."""
    attempts = await get_flashcard_attempts(student_id)
    agg: dict[str, dict] = {}
    for a in attempts:
        topic = a.get("topic_tag") or "general"
        bucket = agg.setdefault(topic, {"correct": 0, "total": 0, "pct": 0.0})
        bucket["total"] += 1
        if a.get("correct"):
            bucket["correct"] += 1
    for bucket in agg.values():
        bucket["pct"] = (
            round(100 * bucket["correct"] / bucket["total"], 1) if bucket["total"] else 0.0
        )
    return agg
```

- [ ] **Step 4: Run the tests — expect PASS.**
```bash
python -m pytest -q tests/shared/test_db.py -k "flashcard_attempt or topic_accuracy"
```
Expected: 3 passed.

- [ ] **Step 5: Commit.**
```bash
git add tools/shared/db.py tests/shared/test_db.py
git commit -m "feat(analytics): db helpers for flashcard_attempts + per-topic accuracy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P2.4: `db.insert_case_result` — carry the rich grade, graceful pre-migration

- [ ] **Step 1: Write the failing tests.** Append to `tests/shared/test_db.py`:

```python
# ── case_progress rich grade (migration 011) ───────────────────────────────────

@pytest.mark.asyncio
async def test_insert_case_result_persists_rich_grade():
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.insert_case_result(
            "stu-001", "case_x", 32, True,
            score_100=80, safe=True, consult_technique=40, judgement_safety=40,
            missed_critical=["Measure IOP"], coaching={"focus": "escalate sooner"},
        )
    payload = client.table.return_value.insert.call_args[0][0]
    assert payload["score_100"] == 80
    assert payload["safe"] is True
    assert payload["consult_technique"] == 40
    assert payload["missed_critical"] == ["Measure IOP"]
    assert payload["coaching"] == {"focus": "escalate sooner"}


@pytest.mark.asyncio
async def test_insert_case_result_falls_back_to_base_when_columns_absent():
    client = _make_client([])
    resp = MagicMock(); resp.data = []
    # First (rich) insert raises as if score_100 is missing; the base insert succeeds.
    client.table.return_value.insert.return_value.execute = AsyncMock(
        side_effect=[Exception('column "score_100" does not exist'), resp]
    )
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.insert_case_result("stu-001", "case_x", 32, True, score_100=80, safe=True)
    calls = client.table.return_value.insert.call_args_list
    assert len(calls) == 2
    assert calls[1][0][0] == {"student_id": "stu-001", "case_id": "case_x",
                              "total_score": 32, "passed": True}
```

- [ ] **Step 2: Run the tests — expect FAIL.**
```bash
python -m pytest -q tests/shared/test_db.py -k "case_result"
```
Expected: FAIL — `test_insert_case_result_persists_rich_grade` raises `TypeError: insert_case_result() got an unexpected keyword argument 'score_100'` (the signature has only the base 4 params).

- [ ] **Step 3: Widen `insert_case_result` + note `get_case_results`.** In `tools/shared/db.py`, replace the current `insert_case_result` (lines 133–145) and add a docstring note to `get_case_results`:

```python
async def insert_case_result(
    student_id: str,
    case_id: str,
    total_score: int,
    passed: bool,
    score_100: int | None = None,
    safe: bool | None = None,
    consult_technique: int | None = None,
    judgement_safety: int | None = None,
    missed_critical: list | None = None,
    coaching: dict | None = None,
) -> None:
    """Append a case completion record. The rich OSCE-grade columns are additive and
    nullable (migration 011); when any are supplied we try the full insert first and,
    if those columns are absent (pre-migration), fall back to the base four columns so
    the submit path stays green until the migration is applied."""
    client = await _get_client()
    base: dict = {
        "student_id": student_id,
        "case_id": case_id,
        "total_score": total_score,
        "passed": passed,
    }
    rich = dict(base)
    if score_100 is not None:
        rich["score_100"] = score_100
    if safe is not None:
        rich["safe"] = safe
    if consult_technique is not None:
        rich["consult_technique"] = consult_technique
    if judgement_safety is not None:
        rich["judgement_safety"] = judgement_safety
    if missed_critical is not None:
        rich["missed_critical"] = missed_critical
    if coaching is not None:
        rich["coaching"] = coaching
    try:
        await client.table("case_progress").insert(rich).execute()
    except Exception:
        if len(rich) == len(base):  # nothing extra to shed → the error is real
            raise
        await client.table("case_progress").insert(base).execute()


async def get_case_results(student_id: str) -> list[dict]:
    """Return all case completion records for a student. `select("*")` surfaces the
    additive rich-grade columns (score_100, safe, consult_technique, judgement_safety,
    missed_critical, coaching) automatically once migration 011 is applied."""
    client = await _get_client()
    result = (
        await client.table("case_progress")
        .select("*")
        .eq("student_id", student_id)
        .execute()
    )
    return result.data or []
```

- [ ] **Step 4: Run the tests — expect PASS (and no regressions).**
```bash
python -m pytest -q tests/shared/test_db.py
```
Expected: all pass, including the existing `test_insert_case_result_writes_to_case_progress_table` and `test_get_case_results_returns_list`.

- [ ] **Step 5: Commit.**
```bash
git add tools/shared/db.py tests/shared/test_db.py
git commit -m "feat(analytics): insert_case_result carries rich OSCE grade, graceful pre-migration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P2.5: `flashcards_complete` — persist attempts + feed per-topic retention

- [ ] **Step 1: Write the failing test.** Append to `tests/api/test_flashcards_complete.py` (note the JWT `sub` default in `tests/api/conftest.py::auth_headers` is `"stud-test"`):

```python
@pytest.mark.asyncio
async def test_complete_persists_attempts_and_feeds_retention(monkeypatch):
    from tools.api.routers import student as mod
    attempts = []
    profile_updates = []

    async def _sm2(cid, interval, ease, reps, due): pass
    async def _profile(_sid): return {"xp": 50}
    async def _update_profile(_sid, **k): profile_updates.append(k)
    async def _attempt(**k): attempts.append(k)

    monkeypatch.setattr(mod, "update_card_sm2", _sm2)
    monkeypatch.setattr(mod, "get_profile", _profile)
    monkeypatch.setattr(mod, "update_profile", _update_profile)
    monkeypatch.setattr(mod.db, "insert_flashcard_attempt", _attempt)

    body = {"xp_delta": 40, "results": [
        {"card_id": "c1", "correct": True,  "topic_tag": "glaucoma", "score": 20},
        {"card_id": "c2", "correct": False, "topic_tag": "glaucoma", "score": 0},
    ]}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.post("/api/flashcards/complete", json=body, headers=auth_headers(role="OA"))
    assert r.status_code == 200
    # Both graded cards persisted as attempts with topic + correctness.
    assert len(attempts) == 2
    assert attempts[0] == {"student_id": "stud-test", "card_id": "c1",
                           "topic_tag": "glaucoma", "correct": True, "score": 20}
    # One retention write for the single-topic deck: accuracy 1/2 = 0.5, xp rides along.
    assert len(profile_updates) == 1
    assert profile_updates[0]["topic"] == "glaucoma"
    assert profile_updates[0]["score"] == 0.5
    assert profile_updates[0]["xp_delta"] == 40
```

- [ ] **Step 2: Run the test — expect FAIL.**
```bash
python -m pytest -q tests/api/test_flashcards_complete.py -k "attempts_and_feeds_retention"
```
Expected: FAIL — `topic_tag` is currently an unknown field silently dropped, no attempts are written (`len(attempts) == 0`), and `profile_updates[0]` has no `"topic"` key.

- [ ] **Step 3: Extend `CompleteCardResult`.** In `tools/api/routers/student.py`, replace the model (lines 406–411):

```python
class CompleteCardResult(BaseModel):
    card_id: str | None = None
    correct: bool
    repetitions: int = 0
    easiness: float = 2.5
    interval_days: int = 0
    topic_tag: str | None = None        # deck topic — feeds attempts + retention
    score: int = 0                      # per-card points (analytics only)
```

- [ ] **Step 4: Write attempts + feed retention.** In `tools/api/routers/student.py::flashcards_complete`, replace the current XP-only block (lines 448–452):

```python
    if xp_delta:
        try:
            await update_profile(student_id, xp_delta=xp_delta)
        except Exception:
            pass
```

with:

```python
    # ── Persist per-card attempts (best-effort) so Analytics can compute true per-topic
    #    accuracy — the platform's highest-volume learning signal, discarded before this
    #    change. A missing table (pre-migration 010) is swallowed per task, so the study
    #    loop is never blocked.
    attempt_tasks = [
        db.insert_flashcard_attempt(
            student_id=student_id, card_id=r.card_id, topic_tag=r.topic_tag,
            correct=bool(r.correct), score=int(r.score),
        )
        for r in body.results if r.topic_tag
    ]
    if attempt_tasks:
        await asyncio.gather(*attempt_tasks, return_exceptions=True)

    # ── Feed per-topic flashcard accuracy into retention_scores (the mastery signal).
    #    A study deck is normally one topic, so this is a single write; the XP delta rides
    #    the first retention write to avoid an extra update_profile call (and an extra
    #    session-count increment). No topic present → keep the legacy XP-only update.
    by_topic: dict[str, list[bool]] = {}
    for r in body.results:
        if r.topic_tag:
            by_topic.setdefault(r.topic_tag, []).append(bool(r.correct))
    if by_topic:
        for i, (topic, hits) in enumerate(by_topic.items()):
            accuracy = sum(hits) / len(hits)
            try:
                await update_profile(
                    student_id, topic=topic, score=accuracy,
                    xp_delta=xp_delta if i == 0 else 0,
                )
            except Exception:
                pass
    elif xp_delta:
        try:
            await update_profile(student_id, xp_delta=xp_delta)
        except Exception:
            pass
```

- [ ] **Step 5: Run the file — expect PASS (new + both existing tests).**
```bash
python -m pytest -q tests/api/test_flashcards_complete.py
```
Expected: all pass — the existing `test_complete_updates_sm2_and_returns_xp` (no `topic_tag` → `elif xp_delta` → `xp_applied == [23]`) and `test_complete_clamps_oversized_xp` (`[5000]`) still hold via the legacy branch.

- [ ] **Step 6: Commit.**
```bash
git add tools/api/routers/student.py tests/api/test_flashcards_complete.py
git commit -m "feat(analytics): flashcards_complete writes attempts + feeds per-topic retention

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P2.6: `log_case_completion` — widen signature to carry the rich grade

- [ ] **Step 1: Write the failing tests.** Create `tests/cases/test_log_case_completion.py`:

```python
import pytest
from unittest.mock import patch
from tools.cases.log_case_completion import log_case_completion


@pytest.mark.asyncio
async def test_log_case_completion_passes_rich_grade_through():
    captured = {}

    async def _insert(**kwargs):
        captured.update(kwargs)

    with patch("tools.cases.log_case_completion.db.insert_case_result", new=_insert):
        await log_case_completion(
            "stu-001", "case_x", 32, True,
            score_100=80, safe=True, consult_technique=40, judgement_safety=40,
            missed_critical=["Measure IOP"], coaching={"focus": "escalate sooner"},
        )
    assert captured["score_100"] == 80
    assert captured["safe"] is True
    assert captured["consult_technique"] == 40
    assert captured["judgement_safety"] == 40
    assert captured["missed_critical"] == ["Measure IOP"]
    assert captured["coaching"] == {"focus": "escalate sooner"}


@pytest.mark.asyncio
async def test_log_case_completion_never_raises():
    async def _boom(**kwargs):
        raise RuntimeError("db down")

    # Best-effort logging must not propagate (e.g. columns absent pre-migration).
    with patch("tools.cases.log_case_completion.db.insert_case_result", new=_boom):
        await log_case_completion("stu-001", "case_x", 32, True, score_100=80)
```

- [ ] **Step 2: Run the tests — expect FAIL.**
```bash
python -m pytest -q tests/cases/test_log_case_completion.py
```
Expected: FAIL — `TypeError: log_case_completion() got an unexpected keyword argument 'score_100'`.

- [ ] **Step 3: Widen the function.** Replace the whole body of `tools/cases/log_case_completion.py` (lines 18–39):

```python
async def log_case_completion(
    student_id: str,
    case_id: str,
    total_score: int,
    passed: bool,
    score_100: int | None = None,
    safe: bool | None = None,
    consult_technique: int | None = None,
    judgement_safety: int | None = None,
    missed_critical: list | None = None,
    coaching: dict | None = None,
) -> None:
    """Append a case completion record. Never raises. The rich OSCE-grade fields are
    additive and forwarded to db.insert_case_result, which degrades to the base four
    columns until migration 011 is applied."""
    try:
        await db.insert_case_result(
            student_id=student_id,
            case_id=case_id,
            total_score=total_score,
            passed=passed,
            score_100=score_100,
            safe=safe,
            consult_technique=consult_technique,
            judgement_safety=judgement_safety,
            missed_critical=missed_critical,
            coaching=coaching,
        )
        audit_log(
            "case_completed",
            student_id=student_id,
            feature="cases",
            detail=f"case: {case_id}, score: {total_score}, passed: {passed}",
        )
    except Exception as exc:
        audit_log("case_log_error", student_id=student_id, feature="cases", detail=str(exc))
```

- [ ] **Step 4: Run the tests — expect PASS.**
```bash
python -m pytest -q tests/cases/test_log_case_completion.py
```
Expected: 2 passed.

- [ ] **Step 5: Commit.**
```bash
git add tools/cases/log_case_completion.py tests/cases/test_log_case_completion.py
git commit -m "feat(analytics): log_case_completion carries the rich OSCE grade

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P2.7: `case_submit` — wire the computed rich grade + coaching through

- [ ] **Step 1: Write the failing end-to-end test.** Create `tests/cases/test_case_submit_persists_grade.py` (mirrors the `/submit` monkeypatch pattern in `tests/api/test_lumens.py`; asserts `log_case_completion` receives the rich grade):

```python
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

_CASE = {
    "case_id": "case_grade",
    "title": "Routine IOP check",
    "difficulty": "beginner",           # always unlocked → no access gate in the way
    "topic": "iop_va_measurement",
    "estimated_minutes": 15,
    "patient": {"name": "Mr Tan", "age": 60, "presenting_complaint": "glaucoma review"},
    "examination_findings": {},
}
_DOMAINS = {
    "history_score": 5, "investigations_score": 5, "diagnosis_score": 5, "management_score": 5,
    "history_feedback": "", "investigations_feedback": "", "diagnosis_feedback": "",
    "management_feedback": "", "overall_feedback": "", "total_score": 20,
    "critical_hit": 1, "critical_total": 2,
}
# Pinned station score → the rich grade the persist path must forward.
_SCORE = {
    "score_100": 80, "total_score": 32, "verdict": "Competent",
    "consult_technique": 40, "consult_technique_max": 50,
    "judgement_safety": 40, "judgement_safety_max": 50, "safe": False,
    "missed_critical": ["Measure IOP with tonometer"], "critical_hit": 1, "critical_total": 2,
}
_COACH_JSON = '{"highlights":["calm rapport"],"did_wrong":[],"missed":["IOP"],"focus":"escalate sooner"}'


def test_submit_persists_rich_grade_to_case_progress():
    captured = {}

    async def _log(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs

    client = TestClient(app)
    with patch.dict("tools.api.shared._case_cache", {"case_grade": _CASE}, clear=False), \
         patch("tools.api.routers.cases.list_available_cases", return_value=["case_grade"]), \
         patch("tools.api.routers.cases.load_case", return_value=_CASE), \
         patch("tools.api.routers.cases.get_case_progress", new=AsyncMock(return_value={})), \
         patch("tools.api.routers.cases._station_checklist",
               return_value={"procedure_name": "NCT", "steps": [], "source": "checklist"}), \
         patch("tools.api.routers.cases.evaluate_case", return_value=_DOMAINS), \
         patch("tools.api.routers.cases.compute_station_score", return_value=_SCORE), \
         patch("tools.api.routers.cases.log_session", new=AsyncMock(return_value=None)), \
         patch("tools.api.routers.cases.ask", return_value=_COACH_JSON), \
         patch("tools.profile.update_profile.update_profile", new=AsyncMock(return_value=None)), \
         patch("tools.api.routers.cases.log_case_completion", new=_log):
        r = client.post(
            "/api/cases/case_grade/submit",
            json={
                "messages": [{"role": "user", "content": "Good morning, can I confirm your name?"}],
                "findings": "IOP within range on repeat readings.",
                "recommendation": "Document and hand over to the doctor.",
                "performed_steps": [],
            },
            cookies={"eyebot_token": create_access_token("stu_grade", "student", "OA")},
        )
    assert r.status_code == 200, r.text
    kw = captured["kwargs"]
    assert kw["score_100"] == 80
    assert kw["safe"] is False
    assert kw["consult_technique"] == 40
    assert kw["judgement_safety"] == 40
    assert kw["missed_critical"] == ["Measure IOP with tonometer"]
    assert kw["coaching"]["focus"] == "escalate sooner"
    assert kw["coaching"]["missed"] == ["IOP"]
```

- [ ] **Step 2: Run the test — expect FAIL.**
```bash
python -m pytest -q tests/cases/test_case_submit_persists_grade.py
```
Expected: FAIL — the current call `await log_case_completion(student_id, case_id, score["total_score"], passed)` passes no keyword args, so `captured["kwargs"]` is `{}` and `kw["score_100"]` raises `KeyError`.

- [ ] **Step 3: Remove the early bare log call.** In `tools/api/routers/cases.py::case_submit`, replace lines 868–873:

```python
    # Difficulty progression: pass at 60/100 (== 24/40).
    passed = score["score_100"] >= 60
    try:
        await log_case_completion(student_id, case_id, score["total_score"], passed)
    except Exception:
        pass

    audit_log("case_evaluated", student_id=student_id, feature="cases",
```

with (drop the log call here — `coaching` is not parsed until further down):

```python
    # Difficulty progression: pass at 60/100 (== 24/40).
    passed = score["score_100"] >= 60

    audit_log("case_evaluated", student_id=student_id, feature="cases",
```

- [ ] **Step 4: Persist the rich grade after coaching is parsed.** In the same function, replace lines 895–898:

```python
    except Exception:
        coaching = CoachingBlock()

    per_phase = _per_phase_summary(_cl_compare.get("steps", []), body.performed_steps)
```

with:

```python
    except Exception:
        coaching = CoachingBlock()

    # Persist the RICH grade now that coaching is parsed — the score sub-domains, safety
    # verdict, missed-critical steps and the coaching block feed the Analytics dashboard.
    # Every value is already computed; they were dropped before this change. The additive
    # DB columns degrade gracefully until migration 011 (see db.insert_case_result).
    try:
        await log_case_completion(
            student_id, case_id, score["total_score"], passed,
            score_100=int(score["score_100"]),
            safe=bool(score["safe"]),
            consult_technique=int(score["consult_technique"]),
            judgement_safety=int(score["judgement_safety"]),
            missed_critical=list(score["missed_critical"]),
            coaching={
                "highlights": coaching.highlights,
                "did_wrong": coaching.did_wrong,
                "missed": coaching.missed,
                "focus": coaching.focus,
            },
        )
    except Exception:
        pass

    per_phase = _per_phase_summary(_cl_compare.get("steps", []), body.performed_steps)
```

- [ ] **Step 5: Run the new test + the existing submit suites — expect PASS.**
```bash
python -m pytest -q tests/cases/test_case_submit_persists_grade.py tests/api/test_lumens.py tests/cases/test_submit_per_phase.py
```
Expected: all pass — `test_lumens` still patches `log_case_completion` with an `AsyncMock` (accepts the added kwargs), and the Lumen award / per-phase behaviour is unchanged.

- [ ] **Step 6: Commit.**
```bash
git add tools/api/routers/cases.py tests/cases/test_case_submit_persists_grade.py
git commit -m "feat(analytics): case_submit persists rich OSCE grade + coaching to case_progress

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

**Phase gate (run before pushing to `main`):**
```bash
python -m pytest -q tests/shared/test_db.py tests/api/test_flashcards_complete.py tests/cases/
```
Expected: green. Both migrations remain PENDING in `APPLIED.md`; every persistence path degrades gracefully until they are applied via `/db-migrate`, so this phase can land without breaking prod.

---

## Phase 3 — Frontend role plumbing + shell/routing consolidation

**Files:**
- `frontend/src/screens/AuthContext.tsx` — `User.role` union `student|admin|trainer` (widen in P3.2, drop `supervisor` in P3.9)
- `frontend/src/screens/adminShared.tsx` — `ROLE_COLORS`/`roleBadgeClass` `trainer` entry (P3.1)
- `frontend/src/styles/eyebot.css`, `frontend/src/styles/gemini-gradients.css` — `.role-badge.trainer` (P3.1)
- `frontend/src/screens/AnalyticsGuard.tsx` — **new** (clone of AdminGuard; `admin||trainer`) (P3.3)
- `frontend/src/aurora/screens/Analytics.tsx` — **new** dark stub screen (P3.3)
- `frontend/src/app/(shell)/analytics/page.tsx` — **new** route (P3.3)
- `frontend/src/aurora/aurora.css` — **new** `.aurora-analytics` dark scope (P3.3)
- `frontend/src/proxy.ts` — matcher: add `/analytics` (P3.3), drop `/admin`+`/supervisor` (P3.8)
- `frontend/src/aurora/components/AtlasRail.tsx` — Analytics nav item + `showAnalytics` + `analytics` glyph + trainer chip (P3.4)
- `frontend/src/aurora/AppShell.tsx` — drop dark `isStaff` console branch; destinations + Analytics (P3.5)
- `frontend/src/screens/CheckInGuard.tsx` — drop role bounces; learner gates for all roles (P3.6)
- `frontend/src/screens/OnboardingScreen.tsx` — casts + routing (P3.7)
- **Retire (P3.8):** `frontend/src/screens/AdminGuard.tsx`, `frontend/src/aurora/components/ConsoleRail.tsx`, `frontend/src/aurora/screens/{AdminShell,AdminOverview,AdminStudents,AdminActivity,Supervisor,SupervisorDrillDown}.tsx`, `frontend/src/app/(shell)/admin/**`, `frontend/src/app/(shell)/supervisor/**`
- **Preserved orphans (kept, NOT deleted):** `frontend/src/aurora/screens/{AdminAccounts,AdminStudentDetail}.tsx`, `frontend/src/aurora/components/{StatCard,EngagementBlock,Heatmap,ProgressBar}.tsx`, `frontend/src/screens/adminShared.tsx`

> Note: assignment (b) says "route → /dashboard". Students today land on `/checkin` (the learner entry); after this phase `CheckInGuard` runs the check-in gate for **all** roles, so `/dashboard` immediately redirects to `/checkin` anyway. To avoid a student redirect-hop regression while making trainer/admin **identical** to students, P3.7 routes every role to `/checkin` (the same learner entry students use today).

---

### Task P3.1: `trainer` role-badge colours (additive, self-contained)

- [ ] **Step 1: Add the `trainer` colour entry to `ROLE_COLORS`.** Edit `frontend/src/screens/adminShared.tsx`, replacing:
```tsx
  admin:      { bg: "rgba(31,31,31,0.10)", color: "#1F1F1F" },
  supervisor: { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
};
```
with:
```tsx
  admin:      { bg: "rgba(31,31,31,0.10)", color: "#1F1F1F" },
  supervisor: { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
  trainer:    { bg: "rgba(99,102,241,0.15)",  color: "#818cf8" },
};
```

- [ ] **Step 2: Add the `trainer` branch to `roleBadgeClass`.** In the same file, replace:
```tsx
  if (r === "admin") return "role-badge admin";
  if (r === "supervisor") return "role-badge supervisor";
  return "role-badge";
```
with:
```tsx
  if (r === "admin") return "role-badge admin";
  if (r === "supervisor") return "role-badge supervisor";
  if (r === "trainer") return "role-badge trainer";
  return "role-badge";
```

- [ ] **Step 3: Add `.role-badge.trainer` to the base stylesheet.** Edit `frontend/src/styles/eyebot.css`, replacing:
```css
.role-badge.supervisor { background: rgba(99,102,241,.1); color: #818cf8; border-color: rgba(99,102,241,.2); }
```
with:
```css
.role-badge.supervisor { background: rgba(99,102,241,.1); color: #818cf8; border-color: rgba(99,102,241,.2); }
.role-badge.trainer { background: rgba(99,102,241,.1); color: #818cf8; border-color: rgba(99,102,241,.2); }
```

- [ ] **Step 4: Add `.role-badge.trainer` to the Gemini-gradient override.** Edit `frontend/src/styles/gemini-gradients.css`, replacing:
```css
.role-badge.supervisor { background: rgba(26,115,232,.12) !important; color: #1A73E8 !important; border-color: rgba(66,133,244,.25) !important; }
```
with:
```css
.role-badge.supervisor { background: rgba(26,115,232,.12) !important; color: #1A73E8 !important; border-color: rgba(66,133,244,.25) !important; }
.role-badge.trainer    { background: rgba(99,102,241,.12) !important; color: #6366F1 !important; border-color: rgba(99,102,241,.25) !important; }
```

- [ ] **Step 5: Typecheck (expected PASS).** Run `cd frontend && npm run typecheck`. Additive-only change — expect it to pass.

- [ ] **Step 6: Commit.**
```bash
git add frontend/src/screens/adminShared.tsx frontend/src/styles/eyebot.css frontend/src/styles/gemini-gradients.css
git commit -m "feat(trainer): role-badge colours for the trainer role

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.2: Widen `User.role` to include `trainer`

- [ ] **Step 1: Add `trainer` to the union (keep `supervisor` for now so every intermediate commit stays green).** Edit `frontend/src/screens/AuthContext.tsx`, replacing:
```tsx
  role: "student" | "supervisor" | "admin";
```
with:
```tsx
  role: "student" | "supervisor" | "admin" | "trainer";
```

- [ ] **Step 2: Typecheck (expected PASS).** Run `cd frontend && npm run typecheck`. Purely additive to the union — no existing comparison breaks. Expect pass.

- [ ] **Step 3: Commit.**
```bash
git add frontend/src/screens/AuthContext.tsx
git commit -m "feat(trainer): add trainer to the User.role union

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.3: New `/analytics` route — AnalyticsGuard + dark stub screen

- [ ] **Step 1: Create the guard.** Write `frontend/src/screens/AnalyticsGuard.tsx` (clone of `AdminGuard`, allow-set `admin||trainer`):
```tsx
import React from "react";
import { Navigate } from "@/lib/nav";
import { useAuth } from "./AuthContext";

export function AnalyticsGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page)" }}>
        <span className="spinner spinner--teal" aria-label="Loading" />
      </div>
    );
  }

  if (!isAuthenticated || (user?.role !== "admin" && user?.role !== "trainer")) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Create the dark stub screen.** Write `frontend/src/aurora/screens/Analytics.tsx` (Phase 5 fills the charts/roster/drill-down/provisioning):
```tsx
"use client";
/* Analytics — dark, PowerBI-style cohort + per-student dashboard for trainers and
   admins. Phase 3 ships the routed dark shell; Phase 5 fills the KPI tiles, SVG
   charts, roster table, per-student drill-down and (admin-only) provisioning. */
export function Analytics() {
  return (
    <div className="aurora-analytics">
      <header className="aa-head">
        <p className="aurora-eyebrow">SNEC training analytics</p>
        <h1 className="aurora-h1">Analytics</h1>
      </header>
      <p className="aa-placeholder">Cohort and per-student analytics load here.</p>
    </div>
  );
}
```

- [ ] **Step 3: Create the route page** (dynamic-import pattern like every other screen; NOT wrapped in `CheckInGuard`, per spec §5.2). Write `frontend/src/app/(shell)/analytics/page.tsx`:
```tsx
"use client";

import dynamic from "next/dynamic";

const AnalyticsGuard = dynamic(
  () => import("@/screens/AnalyticsGuard").then((m) => m.AnalyticsGuard),
  { ssr: false },
);
const Analytics = dynamic(
  () => import("@/aurora/screens/Analytics").then((m) => m.Analytics),
  { ssr: false },
);

export default function Page() {
  return (
    <AnalyticsGuard>
      <Analytics />
    </AnalyticsGuard>
  );
}
```

- [ ] **Step 4: Add the `.aurora-analytics` dark scope.** Edit `frontend/src/aurora/aurora.css`, replacing:
```css
.aurora-shell-immersive .aurora-chat { height: 100dvh; }
```
with:
```css
.aurora-shell-immersive .aurora-chat { height: 100dvh; }

/* ─── Analytics (dark PowerBI-style surface inside the light shell) ────────────
   A self-themed dark scope like .aurora-chat — a coherent dark analytics surface
   that keeps the light rail (NOT added to the immersive list). Phase 3 ships the
   base scope + routed stub; Phase 5 fills the tiles, charts, roster + drill-down. */
.aurora-analytics { min-height: 100%; padding: clamp(20px, 3vw, 40px); background: #0e1117; color: #e6e8ee; }
.aurora-analytics .aurora-eyebrow { color: #7b8494; }
.aurora-analytics .aurora-h1 { color: #f3f5f9; }
.aurora-analytics .aa-head { margin-bottom: 18px; }
.aurora-analytics .aa-placeholder { color: #98a2b3; font-size: 14px; }
```

- [ ] **Step 5: Add `/analytics` to the middleware matcher** so signed-out visitors are bounced to login. Edit `frontend/src/proxy.ts`, replacing:
```ts
    "/flashcards",
    "/supervisor",
```
with:
```ts
    "/flashcards",
    "/analytics",
    "/supervisor",
```

- [ ] **Step 6: Typecheck + build (expected PASS).** Run `cd frontend && npm run typecheck && npm run build`. `trainer` is in the union (P3.2), all new files resolve. Expect pass.

- [ ] **Step 7: Commit.**
```bash
git add frontend/src/screens/AnalyticsGuard.tsx frontend/src/aurora/screens/Analytics.tsx "frontend/src/app/(shell)/analytics/page.tsx" frontend/src/aurora/aurora.css frontend/src/proxy.ts
git commit -m "feat(analytics): /analytics route, AnalyticsGuard + dark stub screen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.4: AtlasRail — Analytics nav item, glyph, trainer chip

- [ ] **Step 1: Replace the OVERSIGHT nav list with an Analytics item.** Edit `frontend/src/aurora/components/AtlasRail.tsx`, replacing:
```tsx
const OVERSIGHT: NavItem[] = [
  { href: "/supervisor", label: "Supervisor", icon: "supervisor" },
  { href: "/admin", label: "Admin", icon: "admin" },
];
```
with:
```tsx
const ANALYTICS_NAV: NavItem[] = [
  { href: "/analytics", label: "Analytics", icon: "analytics" },
];
```

- [ ] **Step 2: Run typecheck to see the failing state (expected FAIL).** Run `cd frontend && npm run typecheck`. `ANALYTICS_NAV` references `icon: "analytics"`, which is not yet a key of `NAV_ICONS` → TS2322 on the `analytics` literal. Confirm the error names the missing `analytics` glyph, then fix it in Step 3.

- [ ] **Step 3: Swap the `supervisor`/`admin` glyphs (now orphaned) for an `analytics` glyph.** In the same file, replace:
```tsx
  supervisor: (<svg {...ico}><circle cx="9" cy="8" r="3" /><path d="M4 19a5 5 0 0 1 10 0" /><path d="M16 6.5a3 3 0 0 1 0 5.5" /><path d="M16.5 19a5 5 0 0 0-2-4" /></svg>),
  admin: (<svg {...ico}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" /><path d="M9 12l2 2 4-4" /></svg>),
} as const;
```
with:
```tsx
  analytics: (<svg {...ico}><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="4" width="3" height="14" /></svg>),
} as const;
```

- [ ] **Step 4: Gate the section on `admin||trainer`.** Replace:
```tsx
  const showOversight = role === "admin" || role === "supervisor";
```
with:
```tsx
  const showAnalytics = role === "admin" || role === "trainer";
```

- [ ] **Step 5: Render the Analytics section.** Replace:
```tsx
        {showOversight && (
          <section className="aurora-rail-section">
            <p className="aurora-rail-label">Oversight</p>
            {OVERSIGHT.map((i) => <Item key={i.href} {...i} />)}
          </section>
        )}
```
with:
```tsx
        {showAnalytics && (
          <section className="aurora-rail-section">
            <p className="aurora-rail-label">Insights</p>
            {ANALYTICS_NAV.map((i) => <Item key={i.href} {...i} />)}
          </section>
        )}
```

- [ ] **Step 6: Map the `trainer` role chip to "Trainer".** Replace:
```tsx
            <span className="aurora-profile-role">{role}{user?.studentRole ? ` · ${user.studentRole}` : ""}</span>
```
with:
```tsx
            <span className="aurora-profile-role">{role === "trainer" ? "Trainer" : role}{user?.studentRole ? ` · ${user.studentRole}` : ""}</span>
```

- [ ] **Step 7: Typecheck (expected PASS).** Run `cd frontend && npm run typecheck`. The `analytics` glyph now exists and no `supervisor`/`OVERSIGHT` references remain. Expect pass.

- [ ] **Step 8: Commit.**
```bash
git add frontend/src/aurora/components/AtlasRail.tsx
git commit -m "feat(analytics): AtlasRail Analytics nav item + trainer chip; drop oversight

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.5: AppShell — drop the dark console branch; all roles on the light shell

- [ ] **Step 1: Remove the ConsoleRail import.** Edit `frontend/src/aurora/AppShell.tsx`, deleting the line:
```tsx
import { ConsoleRail } from "./components/ConsoleRail";
```

- [ ] **Step 2: Replace the staff palette consts with an Analytics destination.** Replace:
```tsx
/* Staff palettes mirror the ConsoleRail nav — no student surfaces. */
const ADMIN_DEST: Destination[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/activity", label: "Activity" },
];
const SUPERVISOR_DEST: Destination[] = [
  { href: "/supervisor", label: "Supervisor" },
  { href: "/admin", label: "Admin" },
];
```
with:
```tsx
/* Trainers/admins get one extra palette destination — the Analytics page. */
const ANALYTICS_DEST: Destination = { href: "/analytics", label: "Analytics" };
```

- [ ] **Step 3: Collapse `role`/`isStaff`/`destinations` to the light-shell model.** Replace:
```tsx
  const role = user?.role ?? "student";
  const isStaff = role === "admin" || role === "supervisor";
  const destinations = useMemo<Destination[]>(() => {
    if (role === "admin") return ADMIN_DEST;
    if (role === "supervisor") return SUPERVISOR_DEST;
    return STUDY;
  }, [role]);
```
with:
```tsx
  const role = user?.role ?? "student";
  const destinations = useMemo<Destination[]>(() => {
    if (role === "admin" || role === "trainer") return [...STUDY, ANALYTICS_DEST];
    return STUDY;
  }, [role]);
```

- [ ] **Step 4: Delete the dark console render branch entirely.** Remove this whole block:
```tsx
  /* Staff get the dark "control console": a dedicated oversight-only rail on the
     same mesh/scroll markup, re-themed by the .console-dark scope. Students keep
     the light AURORA shell untouched. */
  if (isStaff) {
    return (
      <div className="aurora-shell console-dark" data-rail={railState}>
        {!pinned && <RailHandle onReveal={togglePin} />}
        <ConsoleRail onOpenPalette={() => setPaletteOpen(true)} pinned={pinned} onTogglePin={togglePin} />
        <main id="main" className="aurora-main">
          <div className="aurora-mesh" aria-hidden><span /><span /><span /></div>
          <div className="aurora-main-scroll">{children}</div>
        </main>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} destinations={destinations} />
      </div>
    );
  }

```

- [ ] **Step 5: De-stale the immersive-branch comment** (staff no longer have a branch above). Replace:
```tsx
     its own labelled back/exit affordance. Reached only for non-staff (staff above). */
```
with:
```tsx
     its own labelled back/exit affordance. */
```

- [ ] **Step 6: Typecheck (expected PASS).** Run `cd frontend && npm run typecheck`. `isStaff`, `ADMIN_DEST`, `SUPERVISOR_DEST`, `ConsoleRail` and the `supervisor` comparisons are gone; `ConsoleRail.tsx` still exists on disk (deleted in P3.8) so nothing dangles. Expect pass.

- [ ] **Step 7: Commit.**
```bash
git add frontend/src/aurora/AppShell.tsx
git commit -m "refactor(shell): all roles on the light AtlasRail shell; drop dark console branch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.6: CheckInGuard — learner gates for every role

- [ ] **Step 1: Drop the student-only avatar gate; fetch for all authenticated users.** Edit `frontend/src/screens/CheckInGuard.tsx`, replacing:
```tsx
  const { user, isAuthenticated, isCheckInDone, loading } = useAuth();
  const location = useLocation();
  const isStudent = user?.role === "student";
  // Only students fetch this; the query is shared/deduped with the rest of the app.
  const { data: avatar } = useAvatar(isAuthenticated && isStudent);
```
with:
```tsx
  const { user, isAuthenticated, isCheckInDone, loading } = useAuth();
  const location = useLocation();
  // Trainers/admins are learners too (D7): every authenticated role runs the same
  // check-in + Eyecon gates. The avatar query is shared/deduped with the rest of the app.
  const { data: avatar } = useAvatar(isAuthenticated);
```

- [ ] **Step 2: Remove the admin + supervisor route bounces.** Delete this block:
```tsx
  /* Admin users may only access the admin panel (they log out via the Atlas Rail). */
  if (user?.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  /* Supervisor users may only access the supervisor panel (log out via the Atlas Rail). */
  if (user?.role === "supervisor" && location.pathname !== "/supervisor") {
    return <Navigate to="/supervisor" replace />;
  }

```

- [ ] **Step 3: Un-gate the check-in redirect from `isStudent`.** Replace:
```tsx
  /* Students must complete check-in before accessing any page */
  if (isStudent && !isCheckInDone && location.pathname !== "/checkin") {
    return <Navigate to="/checkin" replace />;
  }
```
with:
```tsx
  /* All authenticated users must complete the daily check-in before any page */
  if (!isCheckInDone && location.pathname !== "/checkin") {
    return <Navigate to="/checkin" replace />;
  }
```

- [ ] **Step 4: Un-gate the Eyecon welcome-Studio redirect.** Replace:
```tsx
  const wantStudio = devAlways ? !studioShownThisLoad : avatar?.customized === false;
  if (isStudent && isCheckInDone && wantStudio && location.pathname !== "/studio") {
    return <Navigate to="/studio?welcome=1" replace />;
  }
```
with:
```tsx
  const wantStudio = devAlways ? !studioShownThisLoad : avatar?.customized === false;
  if (isCheckInDone && wantStudio && location.pathname !== "/studio") {
    return <Navigate to="/studio?welcome=1" replace />;
  }
```

- [ ] **Step 5: Un-gate the re-customization lock.** Replace:
```tsx
  if (isStudent && !devAlways && avatar?.customized === true && location.pathname === "/studio") {
    return <Navigate to="/dashboard" replace />;
  }
```
with:
```tsx
  if (!devAlways && avatar?.customized === true && location.pathname === "/studio") {
    return <Navigate to="/dashboard" replace />;
  }
```

- [ ] **Step 6: Typecheck (expected PASS).** Run `cd frontend && npm run typecheck`. `isStudent` and both `supervisor`/`admin` bounces are gone. Expect pass.

- [ ] **Step 7: Commit.**
```bash
git add frontend/src/screens/CheckInGuard.tsx
git commit -m "feat(trainer): run check-in + Eyecon gates for all roles; drop admin/supervisor bounces

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.7: OnboardingScreen — casts + post-login routing

- [ ] **Step 1: Widen both role casts to `student|admin|trainer`.** Edit `frontend/src/screens/OnboardingScreen.tsx`. Both `login({...})` calls (in `handleLogin` and in `completeLogin`) share the substring `as "student" | "supervisor" | "admin"` — replace **all** occurrences of:
```tsx
role: data.role as "student" | "supervisor" | "admin",
```
with:
```tsx
role: data.role as "student" | "admin" | "trainer",
```

- [ ] **Step 2: Route every role to the shared learner entry.** In `completeLogin`'s `apply`, replace:
```tsx
      login({ fullName: data.full_name ?? email, email: email.trim().toLowerCase(), studentId: data.student_id, role: data.role as "student" | "admin" | "trainer", studentRole: (studentRole ?? data.student_role ?? "") as "OA" | "OT" | "PSA" | "", mustChangePassword: false });
      if (data.role === "admin")      navigate("/admin");
      else if (data.role === "supervisor") navigate("/supervisor");
      else navigate("/checkin");
```
with:
```tsx
      login({ fullName: data.full_name ?? email, email: email.trim().toLowerCase(), studentId: data.student_id, role: data.role as "student" | "admin" | "trainer", studentRole: (studentRole ?? data.student_role ?? "") as "OA" | "OT" | "PSA" | "", mustChangePassword: false });
      // Every role is a learner now (D7) — no admin/supervisor console detour.
      navigate("/checkin");
```

- [ ] **Step 3: Typecheck (expected PASS).** Run `cd frontend && npm run typecheck`. No `supervisor` literal remains in this file. Expect pass.

- [ ] **Step 4: Commit.**
```bash
git add frontend/src/screens/OnboardingScreen.tsx
git commit -m "feat(trainer): route all roles to the learner entry; widen login casts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.8: Retire the dark console + supervisor surface

- [ ] **Step 1: Confirm no live importers of the retire targets** (the preserved orphans `AdminAccounts`/`AdminStudentDetail`/`adminShared`/`StatCard`/`EngagementBlock`/`Heatmap`/`ProgressBar` must NOT be deleted). Run:
```bash
cd frontend && npx grep -rn "" >/dev/null 2>&1; \
rg -n "AdminGuard|ConsoleRail|AdminShell|AdminOverview|AdminStudents\b|AdminActivity|Supervisor\b|SupervisorDrillDown|/admin|/supervisor" src \
  | grep -vE "src/(app/\(shell\)/(admin|supervisor)|screens/AdminGuard|aurora/components/ConsoleRail|aurora/screens/(AdminShell|AdminOverview|AdminStudents|AdminActivity|Supervisor|SupervisorDrillDown))"
```
Expect only: `proxy.ts` (`/supervisor`,`/admin/:path*` — removed in Step 3), `AdminAccounts.tsx`/`AdminStudentDetail.tsx` (their own `/api/admin`+`/api/supervisor` endpoint URLs — kept, unchanged). No live component importer of a deleted screen.

- [ ] **Step 2: Delete the retired files + route groups** (keep `AdminAccounts.tsx` + `AdminStudentDetail.tsx` — Phase 5 folds them into Analytics):
```bash
git rm frontend/src/screens/AdminGuard.tsx \
       frontend/src/aurora/components/ConsoleRail.tsx \
       frontend/src/aurora/screens/AdminShell.tsx \
       frontend/src/aurora/screens/AdminOverview.tsx \
       frontend/src/aurora/screens/AdminStudents.tsx \
       frontend/src/aurora/screens/AdminActivity.tsx \
       frontend/src/aurora/screens/Supervisor.tsx \
       frontend/src/aurora/screens/SupervisorDrillDown.tsx
git rm -r "frontend/src/app/(shell)/admin" "frontend/src/app/(shell)/supervisor"
```

- [ ] **Step 3: Drop the dead middleware matchers.** Edit `frontend/src/proxy.ts`, replacing:
```ts
    "/analytics",
    "/supervisor",
    "/admin/:path*",
    "/checkin",
```
with:
```ts
    "/analytics",
    "/checkin",
```

- [ ] **Step 4: Typecheck + build (expected PASS).** Run `cd frontend && npm run typecheck && npm run build`. `AdminAccounts.tsx` (imports `adminShared`, `useAuth`, `Icon` — all kept) and `AdminStudentDetail.tsx` (imports `adminShared`, `EngagementBlock` — kept) survive as compiling orphans; every deleted screen's only importers were the deleted route pages. Expect pass.

- [ ] **Step 5: Commit.**
```bash
git add frontend/src/proxy.ts frontend/src/screens/AdminGuard.tsx frontend/src/aurora/components/ConsoleRail.tsx frontend/src/aurora/screens/AdminShell.tsx frontend/src/aurora/screens/AdminOverview.tsx frontend/src/aurora/screens/AdminStudents.tsx frontend/src/aurora/screens/AdminActivity.tsx frontend/src/aurora/screens/Supervisor.tsx frontend/src/aurora/screens/SupervisorDrillDown.tsx "frontend/src/app/(shell)/admin" "frontend/src/app/(shell)/supervisor"
git commit -m "refactor(console): retire dark admin/supervisor console + routes (logic → Analytics in P5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.9: Drop `supervisor` from the frontend role union

- [ ] **Step 1: Narrow the union to the final three roles.** Edit `frontend/src/screens/AuthContext.tsx`, replacing:
```tsx
  role: "student" | "supervisor" | "admin" | "trainer";
```
with:
```tsx
  role: "student" | "admin" | "trainer";
```

- [ ] **Step 2: Typecheck + build (expected PASS).** Run `cd frontend && npm run typecheck && npm run build`. All `User.role === "supervisor"` comparisons were removed (P3.4–P3.8) or deleted with `AdminGuard`; the only remaining `"supervisor"` literals are the preserved orphans' plain-string state (`AdminAccounts` `promoteRole`) and data/endpoint strings (`AdminStudentDetail`, `adminShared` map key) — none are `User.role` comparisons, so no TS2367. Expect pass.

- [ ] **Step 3: Commit.**
```bash
git add frontend/src/screens/AuthContext.tsx
git commit -m "refactor(trainer): remove supervisor from the frontend role union

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 4 — The loud homepage content-pool toggle

Delivers spec §4: a loud segmented `OA · PSA | OT` switch beside the Level chip, shown only for `trainer`/`admin`, that flips the caller's own `student_profiles.role` between the OA (clinical / OA·PSA) and OT pools, persists via `PATCH /api/profile/role`, and invalidates every pool-dependent query so flashcards, cases, leaderboard and progress re-read the new discipline.

**Depends on (must land first, per ship order §11):** Phase 1 — `MeResponse.student_role` sourced from `student_profiles.role` (the load-time source of truth a flip survives a reload through); and the shell-consolidation phase — `User.role` union widened to `"student" | "admin" | "trainer"` in `frontend/src/screens/AuthContext.tsx` (Phase 4's `user?.role === "trainer"` gate does not typecheck until `"supervisor"→"trainer"` is done). This phase touches neither file; it consumes their contract.

**Files:**
- `frontend/src/aurora/components/home/poolToggle.ts` — **new**, pure DOM-free helpers (segments, `activePool`, invalidation keys). Unit-testable under Node type-stripping.
- `frontend/src/aurora/components/home/PoolToggle.tsx` — **new**, the client component: reads `useAuth().user.studentRole`, on flip calls `setStudentRole` + `PATCH /api/profile/role` + `useQueryClient` invalidation, with an in-UI help tooltip.
- `frontend/src/aurora/home.css` — **edit**, `.hm-pool*` segmented-switch + tooltip styles (aurora `--flame/--spring/--sh` tokens; mirrors the `.console-segment` pattern).
- `frontend/src/aurora/screens/Dashboard.tsx` — **edit**, render `<PoolToggle/>` in `.hm-topr` beside the Level chip, gated `role ∈ {trainer, admin}`.
- `frontend/tests/pool_toggle_logic.mjs` — **new**, pure Node harness: segment shape, `activePool` mapping, exact invalidation set, and the flip→reload repeat-case (spec §10 / `/ship-check`).

---

### Task P4.1: Pure pool-toggle helpers (TDD)

- [ ] **Step 1: Write the failing harness.** Create `frontend/tests/pool_toggle_logic.mjs`:
  ```js
  /* Pure unit test for the homepage content-pool toggle logic (spec §4 + §10 /ship-check).
     poolToggle.ts is dependency-free; run under Node type stripping:
       node --experimental-strip-types frontend/tests/pool_toggle_logic.mjs

     Covers: segment shape, active-pool mapping, the exact invalidation key set, and the
     flip → reload repeat-case (the state invariant: a flipped pool survives a reload). */
  import assert from "node:assert";
  import { activePool, POOL_SEGMENTS, POOL_INVALIDATE_KEYS } from "../src/aurora/components/home/poolToggle.ts";

  // 1) Two loud segments, correct values + labels.
  assert.deepStrictEqual(
    POOL_SEGMENTS,
    [{ value: "OA", label: "OA · PSA" }, { value: "OT", label: "OT" }],
    "segments = OA·PSA | OT",
  );

  // 2) active-pool mapping: OA / PSA / "" → OA clinical pool; only "OT" → OT.
  assert.strictEqual(activePool("OA"), "OA", "OA → OA");
  assert.strictEqual(activePool("PSA"), "OA", "PSA folds into the OA clinical pool");
  assert.strictEqual(activePool(""), "OA", "empty defaults to OA");
  assert.strictEqual(activePool("OT"), "OT", "OT → OT");

  // 3) exact invalidation set from the naming contract (order-independent).
  assert.deepStrictEqual(
    [...POOL_INVALIDATE_KEYS].map((k) => k.join(".")).sort(),
    ["cases", "flashcard-due-count", "flashcard-topics", "flashcards", "leaderboard", "progress"],
    "invalidates every pool-dependent query key",
  );

  // 4) flip → reload repeat-case. Mirror AuthContext: on a flip the client optimistically
  //    persists the pool (sessionStorage mirror) AND the server PATCH stores it; on reload
  //    /api/auth/me.student_role (Phase 1: sourced from student_profiles.role) is the source
  //    of truth. Simulate the full round-trip and assert the flipped pool survives.
  const server = { role: "OA" };                 // server-side student_profiles.role
  const store = new Map();                        // sessionStorage mirror ("eyebot_student_role")
  function flip(next) {                           // what PoolToggle does on a segment click
    store.set("eyebot_student_role", next);       // AuthContext.setStudentRole mirror
    server.role = next;                           // PATCH /api/profile/role persists it
  }
  function reload() {                             // AuthContext restore ordering: server wins
    const me = { student_role: server.role };     // /api/auth/me (Phase 1)
    return activePool(me.student_role);
  }
  assert.strictEqual(reload(), "OA", "starts on OA");
  flip("OT");
  assert.strictEqual(activePool(store.get("eyebot_student_role")), "OT", "optimistic client flip → OT");
  assert.strictEqual(reload(), "OT", "OT pool persists across reload");
  flip("OA");
  assert.strictEqual(reload(), "OA", "flip back to OA persists (repeat case is stable)");

  console.log("pool_toggle_logic: all assertions passed");
  ```

- [ ] **Step 2: Run it — expect FAIL.** `node --experimental-strip-types frontend/tests/pool_toggle_logic.mjs` → expected FAIL: `Cannot find module '.../poolToggle.ts'` (the module does not exist yet).

- [ ] **Step 3: Create the module.** Write `frontend/src/aurora/components/home/poolToggle.ts`:
  ```ts
  /* Pure, DOM-free helpers for the homepage content-pool toggle (spec §4). The toggle flips a
     trainer/admin's OWN student_profiles.role between the OA (clinical / OA·PSA) and OT pools;
     every content + gamification surface already reads the pool from that role, so no new content
     plumbing is needed. Kept dependency-free so it's unit-testable under Node type-stripping. */

  export type Pool = "OA" | "OT";

  /** The two segments of the loud switch. "OA" is the clinical pool shared by OA + PSA. */
  export const POOL_SEGMENTS: { value: Pool; label: string }[] = [
    { value: "OA", label: "OA · PSA" },
    { value: "OT", label: "OT" },
  ];

  /** Which segment is lit for a given stored profile role. OA / PSA / "" all map to the OA
      clinical pool (OA ≡ PSA content); only an explicit "OT" lights the OT segment. */
  export function activePool(studentRole: string): Pool {
    return studentRole === "OT" ? "OT" : "OA";
  }

  /** React-Query keys whose data is pool-dependent — invalidated on every flip so the whole app
      (flashcards, cases, leaderboard, progress) re-reads the newly selected discipline's content. */
  export const POOL_INVALIDATE_KEYS: string[][] = [
    ["progress"],
    ["flashcard-topics"],
    ["flashcards"],
    ["flashcard-due-count"],
    ["leaderboard"],
    ["cases"],
  ];
  ```

- [ ] **Step 4: Run it — expect PASS.** `node --experimental-strip-types frontend/tests/pool_toggle_logic.mjs` → expected PASS: `pool_toggle_logic: all assertions passed`.

- [ ] **Step 5: Commit.** Stage only this task's files:
  ```bash
  git add frontend/src/aurora/components/home/poolToggle.ts frontend/tests/pool_toggle_logic.mjs
  git commit -m "$(cat <<'EOF'
  test(eyecon): pure pool-toggle helpers + flip→reload repeat-case harness

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task P4.2: PoolToggle component

- [ ] **Step 1: Create the component.** Write `frontend/src/aurora/components/home/PoolToggle.tsx` (imports mirror the existing React-Query usage in `frontend/src/aurora/screens/Flashcards.tsx` L9/L57 and `useAuth` from `@/screens/AuthContext`; `setStudentRole`'s `(role: "OA"|"OT"|"PSA")` signature accepts the `Pool` subset):
  ```tsx
  "use client";
  /* AURORA Home — the loud content-pool toggle (spec §4). Rendered ONLY for trainer/admin, in
     Dashboard's top bar beside the Level chip. Flipping a segment optimistically switches the
     caller's OWN student_profiles.role between the OA (clinical / OA·PSA) and OT pools, persists
     it via PATCH /api/profile/role, and invalidates every pool-dependent query so flashcards,
     cases, leaderboard and progress re-read the new discipline's content. */
  import { useState } from "react";
  import { useQueryClient } from "@tanstack/react-query";
  import { toast } from "sonner";
  import { useAuth } from "@/screens/AuthContext";
  import { activePool, POOL_SEGMENTS, POOL_INVALIDATE_KEYS, type Pool } from "./poolToggle";

  export function PoolToggle() {
    const { user, setStudentRole } = useAuth();
    const qc = useQueryClient();
    const [busy, setBusy] = useState(false);
    const current = activePool(user?.studentRole ?? "");

    const select = async (next: Pool) => {
      if (busy || next === current) return;
      const prev = current;
      setBusy(true);
      setStudentRole(next); // optimistic — the whole app re-reads the pool immediately
      try {
        const res = await fetch("/api/profile/role", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ role: next }),
        });
        if (!res.ok) throw new Error("role update failed");
        POOL_INVALIDATE_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
      } catch {
        setStudentRole(prev); // roll back the optimistic flip
        toast.error("Could not switch content pool. Please try again.");
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="hm-pool">
        <div className="hm-pool-seg" role="tablist" aria-label="Content pool">
          {POOL_SEGMENTS.map((s) => (
            <button
              key={s.value}
              type="button"
              role="tab"
              aria-selected={current === s.value}
              data-active={current === s.value}
              disabled={busy}
              onClick={() => select(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="hm-pool-help" tabIndex={0} aria-label="What is this?">
          ?
          <span className="hm-pool-tip" role="tooltip">
            Switch which discipline&rsquo;s content you&rsquo;re viewing — flashcards, virtual
            patients, the daily check-in and the leaderboard all follow the pool you pick.
          </span>
        </span>
      </div>
    );
  }
  ```

- [ ] **Step 2: Typecheck — expect PASS.** `cd frontend && npm run typecheck` → expected: clean (no errors). The `role="tab"` / `aria-selected` container pattern already ships in `frontend/src/aurora/screens/AdminAccounts.tsx` (L142), so it compiles and lints identically.

- [ ] **Step 3: Commit.**
  ```bash
  git add frontend/src/aurora/components/home/PoolToggle.tsx
  git commit -m "$(cat <<'EOF'
  feat(eyecon): PoolToggle — optimistic OA·PSA|OT switch + PATCH + query invalidation

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task P4.3: Segmented-switch + tooltip CSS

- [ ] **Step 1: Add the styles.** In `frontend/src/aurora/home.css`, insert the block below immediately after the `.hm-chip small { … }` rule (currently line 40, the end of the top-bar chip styles). All tokens (`--flame1/2`, `--spring`, `--sh`, `--sh-lg`, `--pop`, `--line`, `--hink/hink2`, `--font-home`, `--font-sans`) resolve because `.hm-pool` lives inside `.aurora-home` (defined L8–25); the segment mirrors `.console-segment` (aurora.css L2201–2204) on the warm home surface:
  ```css
  /* ── content-pool toggle (trainer/admin only; spec §4) — mirrors .console-segment on the warm surface ── */
  .hm-pool { display:flex; align-items:center; gap:8px; }
  .hm-pool-seg { display:inline-flex; gap:3px; padding:3px; background:linear-gradient(180deg,#FFF6E6,#FCEAC8); border:1px solid #F1DCB2; border-radius:999px; box-shadow:inset 0 1px 0 rgba(255,255,255,.6), var(--sh); }
  .hm-pool-seg button { border:none; background:none; padding:7px 16px; border-radius:999px; font-family:var(--font-home); font-weight:700; font-size:13.5px; letter-spacing:-.01em; color:var(--hink2); cursor:pointer; transition:color .15s, background .15s, box-shadow .15s, transform .15s var(--spring); }
  .hm-pool-seg button:hover:not([data-active="true"]) { color:var(--hink); }
  .hm-pool-seg button:active { transform:scale(.95); }
  .hm-pool-seg button[data-active="true"] { color:#fff; background:linear-gradient(140deg,var(--flame1),var(--flame2)); box-shadow:var(--pop); }
  .hm-pool-seg button:disabled { cursor:default; opacity:.75; }
  /* in-UI help affordance (standing "explain to users" rule) — hover/focus reveals the tooltip */
  .hm-pool-help { position:relative; width:22px; height:22px; border-radius:50%; display:inline-grid; place-items:center; background:#FFF7EA; border:1px solid var(--line); color:var(--hink2); font-family:var(--font-home); font-weight:800; font-size:13px; cursor:help; }
  .hm-pool-tip { position:absolute; top:calc(100% + 8px); right:0; width:240px; padding:10px 12px; background:var(--hink); color:#FFF7EA; font-family:var(--font-sans); font-weight:500; font-size:12.5px; line-height:1.45; text-align:left; border-radius:12px; box-shadow:var(--sh-lg); opacity:0; visibility:hidden; transform:translateY(-4px); transition:opacity .15s, transform .15s var(--spring), visibility .15s; z-index:20; pointer-events:none; }
  .hm-pool-help:hover .hm-pool-tip, .hm-pool-help:focus .hm-pool-tip, .hm-pool-help:focus-visible .hm-pool-tip { opacity:1; visibility:visible; transform:translateY(0); }
  ```

- [ ] **Step 2: Build — expect PASS.** `cd frontend && npm run build` → expected: build succeeds (CSS is valid, no unresolved-token or syntax error).

- [ ] **Step 3: Commit.**
  ```bash
  git add frontend/src/aurora/home.css
  git commit -m "$(cat <<'EOF'
  style(eyecon): loud .hm-pool segmented switch + help tooltip on the home surface

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task P4.4: Mount the toggle in Dashboard (role-gated)

- [ ] **Step 1: Import the component.** In `frontend/src/aurora/screens/Dashboard.tsx`, add the import directly under the `EyeconMenu` import (currently L23):
  ```tsx
  import { EyeconMenu } from "@/aurora/components/home/EyeconMenu";
  import { PoolToggle } from "@/aurora/components/home/PoolToggle";
  ```

- [ ] **Step 2: Render it in `.hm-topr`, gated by role.** Replace the `.hm-topr` block (currently L98–104) with:
  ```tsx
          <div className="hm-topr">
            {(user?.role === "trainer" || user?.role === "admin") && <PoolToggle />}
            <div className="hm-chip">
              <span>Level <b>{level}</b> <small>· {rank}</small></span>
              <span className="hm-medal"><Icon name="medal" /></span>
            </div>
            <EyeconMenu />
          </div>
  ```
  (`user` is already destructured from `useAuth()` at L32. Students never satisfy the gate, so the toggle stays hidden — spec §4.)

- [ ] **Step 3: Typecheck + build — expect PASS.** `cd frontend && npm run typecheck && npm run build` → expected: clean. `user?.role === "trainer"` requires the widened `User.role` union (AuthContext.tsx, shell-consolidation phase) — if it errors with `This comparison appears to be unintentional because the types … have no overlap`, that phase has not landed; do not weaken the gate, land the union first (noted in the phase dependency).

- [ ] **Step 4: Commit.**
  ```bash
  git add frontend/src/aurora/screens/Dashboard.tsx
  git commit -m "$(cat <<'EOF'
  feat(eyecon): render PoolToggle beside the Level chip for trainer/admin only

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task P4.5: Ship-check gate — regression + behavioral verify (no new files)

Verification only — nothing to stage or commit. Per `/ship-check`, a user-facing state invariant (a flipped pool persists) needs its regression test green AND a behavioral verify on the running app.

- [ ] **Step 1: Re-run the repeat-case regression — expect PASS.** `node --experimental-strip-types frontend/tests/pool_toggle_logic.mjs` → expected: `pool_toggle_logic: all assertions passed` (asserts the flip→reload→flip-back round-trip is stable; the reload source of truth is `/api/auth/me.student_role` from Phase 1).

- [ ] **Step 2: Full frontend gate — expect PASS.** `cd frontend && npm run typecheck && npm run build` → expected: both clean.

- [ ] **Step 3: Behavioral verify on the running app.** `bash scripts/start-harness.sh aurora` (or `serve`; `SKIP_BUILD=1` to reuse `.next` from Step 2). With an `admin`/`trainer` session (the `admin` fixture in `frontend/tests/_mocks.mjs` L15–18 already has `role:"admin"`, which satisfies the gate), load `/dashboard` and confirm on the running app:
  - the loud `OA · PSA | OT` switch renders in `.hm-topr` immediately left of the Level chip (and is **absent** for a `student` fixture);
  - the `?` affordance reveals the discipline-switch helper text on hover/focus;
  - clicking **OT** lights the OT segment, fires `PATCH /api/profile/role {role:"OT"}`, and the flashcard-topics / cases lists re-fetch (invalidated keys);
  - **reload the page** → the OT segment is still lit (the pool survives, sourced from `/api/auth/me.student_role`), proving the persistence invariant end-to-end.
  Expected: all four hold. If reload snaps back to OA, the Phase 1 `MeResponse.student_role`-from-profile source is not wired — fix Phase 1, do not paper over it here. `bash scripts/start-harness.sh stop` when done.

- [ ] **Step 4: Confirm nothing to commit.** `git status --short` → expected: clean (this task adds no files; the toggle already shipped in P4.1–P4.4).

---

## Phase 5 — Dark PowerBI-style Analytics dashboard + admin-only provisioning

**Files:**
```
frontend/src/aurora/aurora.css                                  # (edit) add .aurora-analytics dark scope
frontend/src/aurora/components/analytics/chartGeometry.ts       # (new) pure SVG math, unit-tested
frontend/src/aurora/components/analytics/TrendChart.tsx         # (new) line/area chart
frontend/src/aurora/components/analytics/DonutGauge.tsx         # (new) ring gauge
frontend/src/aurora/components/analytics/BarSeries.tsx          # (new) horizontal + stacked bars
frontend/src/hooks/useAnalytics.ts                              # (new) React-Query hooks over existing endpoints
frontend/src/aurora/screens/AnalyticsCohort.tsx                # (new) cohort band section
frontend/src/aurora/screens/AnalyticsRoster.tsx                # (new) roster table + drill-down opener
frontend/src/aurora/screens/AnalyticsProvisioning.tsx          # (new) admin-only add/CSV/remove/promote
frontend/src/aurora/screens/AdminStudentDetail.tsx             # (edit) extend drill-down: flashcard accuracy + OSCE sub-scores
frontend/src/aurora/screens/Analytics.tsx                       # (replace Phase-3 stub) compose the page
frontend/tests/analytics_charts_logic.mjs                       # (new) Node harness for chartGeometry
```

Interlock assumptions (from earlier phases; do not re-do here): `User.role` union already widened to `"student" | "admin" | "trainer"` with `"supervisor"` dropped (Phase 1/3); `AdminStudentDetail`, `adminShared`, `StatCard`, `EngagementBlock`, `Heatmap`, `ProgressBar` retained (Phase 3); the `/analytics` route + `AnalyticsGuard` + a `Analytics.tsx` stub exporting a named `Analytics` exist (Phase 3); the five read `/api/{supervisor,admin}/*` endpoints re-gated to `require_staff` and `POST /api/admin/approved` + `POST /api/admin/promote` widened to accept `trainer`/`admin` (Phase 1/2). Every panel here degrades gracefully so the page renders before the two additive migrations land.

---

### Task P5.1: Dark `.aurora-analytics` scope in aurora.css

- [ ] **Step 1: Append the dark scope.** Add to the end of `frontend/src/aurora/aurora.css` (mirrors the retired `.console-dark` slate tokens at L2126-2251 so the page self-themes dark inside the light shell — the `.aurora-chat` pattern; reuses the token-based global `.console-*` structural classes which inherit these dark tokens):

```css
/* ═══════════════ Analytics — dark PowerBI-style surface ═══════════════
   Rendered INSIDE the light student shell (the .aurora-chat self-theming
   pattern). Re-declares the retired .console-dark slate tokens on the scope so
   trainers/admins read charts + tables on dark while the rail stays light. The
   global token-driven .console-* classes (segment/card-accent/disclosure/
   focus/split/risk-dot) inherit these tokens automatically. Students never
   mount this scope. */
.aurora-analytics {
  --paper:   #14161F;
  --canvas:  #0E1016;
  --surface: #181B26;
  --hairline: rgba(255, 255, 255, 0.15);
  --ink:   #F4F5F9;
  --ink-2: #C9CED9;
  --ink-3: #9CA2B2;
  --g-blue: #5B9DFF; --g-purple: #B68BE6; --g-rose: #F07A86; --g-green: #43C76B;
  --on-blue: #8FBEFF;   --on-blue-2: #8FBEFF;
  --on-purple: #CBA6F0; --on-purple-2: #CBA6F0;
  --on-rose: #F4969F;   --on-rose-2: #F4969F;
  --on-green: #6FD89A;  --on-green-2: #6FD89A;
  color-scheme: dark;
  min-height: 100%;
  background: var(--canvas);
  color: var(--ink);
  padding: clamp(16px, 2.5vw, 30px);
}
/* Re-apply the light-hardcoded patches that .console-dark scoped to itself. */
.aurora-analytics .aurora-statcard-value { color: var(--ink); }
.aurora-analytics .aurora-badge { background: rgba(255,255,255,0.07); }
.aurora-analytics .aurora-badge[data-tone="blue"]   { color: var(--on-blue-2);   background: rgba(91,157,255,.12);  border-color: rgba(91,157,255,.26); }
.aurora-analytics .aurora-badge[data-tone="purple"] { color: var(--on-purple-2); background: rgba(182,139,230,.12); border-color: rgba(182,139,230,.26); }
.aurora-analytics .aurora-badge[data-tone="rose"]   { color: var(--on-rose);     background: rgba(240,122,134,.12); border-color: rgba(240,122,134,.26); }
.aurora-analytics .aurora-badge[data-tone="green"]  { color: var(--on-green-2);  background: rgba(67,199,107,.13);  border-color: rgba(67,199,107,.28); }
.aurora-analytics .aurora-badge[data-tone="amber"]  { color: #F0C36B;            background: rgba(240,195,107,.12); border-color: rgba(240,195,107,.30); }
.aurora-analytics .aurora-badge[data-tone="ok"]     { color: var(--on-green-2);  background: rgba(67,199,107,.13);  border-color: rgba(67,199,107,.26); }
.aurora-analytics .aurora-bar-track, .aurora-analytics .aurora-progress { background: rgba(255,255,255,0.09); }
.aurora-analytics .aurora-trow.is-clickable:hover { background: rgba(255,255,255,0.04); }
.aurora-analytics .aurora-select { color-scheme: dark; }
.aurora-analytics .aurora-btn { background: linear-gradient(100deg, var(--g-blue), var(--g-purple)); color: #0B0D13; font-weight: 700; }
.aurora-analytics .aurora-insight { background: rgba(182,139,230,0.12); border-left-color: var(--g-purple); }
.aurora-analytics .aurora-flow[data-variant="tint-blue"]   { background-image: linear-gradient(100deg, rgba(91,157,255,.20), rgba(182,139,230,.10), rgba(91,157,255,.20)); border-color: rgba(91,157,255,.32); }
.aurora-analytics .aurora-flow[data-variant="tint-purple"] { background-image: linear-gradient(100deg, rgba(182,139,230,.22), rgba(240,122,134,.10), rgba(182,139,230,.22)); border-color: rgba(182,139,230,.32); }
.aurora-analytics .aurora-flow[data-variant="tint-rose"]   { background-image: linear-gradient(100deg, rgba(240,122,134,.20), rgba(182,139,230,.10), rgba(240,122,134,.20)); border-color: rgba(240,122,134,.32); }
.aurora-analytics .aurora-flow[data-variant="tint-green"]  { background-image: linear-gradient(100deg, rgba(67,199,107,.20), rgba(91,157,255,.10), rgba(67,199,107,.20)); border-color: rgba(67,199,107,.32); }
.aurora-analytics .aurora-modal-backdrop { background: rgba(0,0,0,0.55); }
.aurora-analytics .aurora-modal-close:hover { background: rgba(255,255,255,0.06); }

/* Analytics-specific chrome */
.aurora-analytics-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; }
.aurora-analytics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.aurora-panel { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-lg); padding: 16px 18px; }
.aurora-panel-head { font-family: var(--font-mono); font-size: 12.3px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); font-weight: 600; margin: 0 0 12px; }
.aurora-refresh { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--hairline); background: var(--surface); color: var(--ink-2); border-radius: 999px; padding: 7px 13px; font-size: 13px; font-weight: 600; cursor: pointer; transition: color .15s, border-color .15s; }
.aurora-refresh:hover:not(:disabled) { color: var(--ink); border-color: rgba(255,255,255,0.28); }
.aurora-refresh:disabled { opacity: .6; cursor: default; }
.aurora-unavail { color: var(--ink-3); font-size: 13px; line-height: 1.6; margin: 0; }
.aurora-trend { display: block; width: 100%; height: auto; }
.aurora-gauge { display: grid; place-items: center; }
.aurora-gauge-num { fill: var(--ink); font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.aurora-gauge-cap { fill: var(--ink-3); font-size: 9px; letter-spacing: .1em; text-transform: uppercase; font-weight: 600; }
.aurora-analytics .aurora-bar-seg { height: 100%; display: block; }
```

- [ ] **Step 2: Verify the CSS compiles (no page regression).** Run `cd frontend && npm run build`. Expected: PASS — the production build completes; a CSS syntax error here would fail the Tailwind/postcss step. (This is the one full build until P5.8.)
- [ ] **Step 3: Commit.** `git add frontend/src/aurora/aurora.css` then commit `feat(analytics): dark .aurora-analytics scope mirroring the retired console tokens` with the co-author trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task P5.2: Chart geometry helpers (pure, unit-tested)

- [ ] **Step 1: Write the failing Node test first.** Create `frontend/tests/analytics_charts_logic.mjs`:

```js
/* Pure unit test for the analytics chart geometry (dependency-free, Node type-strip,
   mirrors session_export_logic.mjs):
     node --experimental-strip-types frontend/tests/analytics_charts_logic.mjs */
import assert from "node:assert";
import { niceCeil, points, linePath, areaPath, polar, arcPath } from "../src/aurora/components/analytics/chartGeometry.ts";

// niceCeil rounds up to a readable axis ceiling and floors at `min`.
assert.strictEqual(niceCeil(0), 1);
assert.strictEqual(niceCeil(7), 10);
assert.strictEqual(niceCeil(12), 20);
assert.strictEqual(niceCeil(3), 5);
assert.strictEqual(niceCeil(0.4, 1), 1);

// points: single value centres; y inverts (SVG top-left); x spans the padded box.
const p1 = points([5], 100, 40, 4, 10);
assert.strictEqual(p1.length, 1);
assert.ok(Math.abs(p1[0][0] - 50) < 1e-6, "single point centred on x");
const p = points([0, 10], 100, 40, 4, 10);         // pad 4 ⇒ innerW 92, innerH 32
assert.ok(Math.abs(p[0][0] - 4) < 1e-6 && Math.abs(p[1][0] - 96) < 1e-6, "x spans pad..w-pad");
assert.ok(p[0][1] > p[1][1], "higher value sits higher (smaller y)");
assert.ok(Math.abs(p[1][1] - 4) < 1e-6, "max value pins to the top pad");

// linePath / areaPath are well-formed SVG path strings.
const lp = linePath(p);
assert.ok(lp.startsWith("M") && lp.includes("L"), "line path uses M..L");
const ap = areaPath(p, 36);
assert.ok(ap.endsWith("Z"), "area path closes");
assert.ok(ap.includes("L4.0 36.0"), "area drops to baseline at the first x");

// polar: 0° = 12 o'clock (straight up).
const [tx, ty] = polar(50, 50, 10, 0);
assert.ok(Math.abs(tx - 50) < 1e-6 && Math.abs(ty - 40) < 1e-6, "0deg is straight up");

// arcPath: single arc command with the correct large-arc flag + clockwise sweep.
assert.ok(arcPath(50, 50, 20, 0, 90).includes("A20 20 0 0 1"), "quarter arc: small-arc, clockwise");
assert.ok(arcPath(50, 50, 20, 0, 270).includes("A20 20 0 1 1"), "3/4 arc sets the large-arc flag");

console.log("analytics_charts_logic: all assertions passed");
```

- [ ] **Step 2: Run it and watch it FAIL.** `node --experimental-strip-types frontend/tests/analytics_charts_logic.mjs`. Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `chartGeometry.ts` (not created yet).
- [ ] **Step 3: Implement the helpers.** Create `frontend/src/aurora/components/analytics/chartGeometry.ts`:

```ts
/* Pure, dependency-free geometry helpers for the dark SVG analytics charts. No
   React/DOM imports so the Node harness can type-strip + unit-test them. */

/** Round a max up to a readable axis ceiling (1 / 2 / 2.5 / 5 × 10ⁿ) so gridlines
    land on clean numbers. Returns at least `min` (default 1). */
export function niceCeil(value: number, min = 1): number {
  if (!Number.isFinite(value) || value <= 0) return min;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const frac = value / base;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10;
  return Math.max(min, nice * base);
}

/** Map values to (x,y) points in a [pad..w-pad] × [pad..h-pad] box. x is evenly
    spaced (a single point centres); y is inverted for SVG. Empty ⇒ []. */
export function points(values: number[], w: number, h: number, pad: number, max: number): [number, number][] {
  const n = values.length;
  if (n === 0) return [];
  const span = Math.max(1e-6, max);
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const step = n === 1 ? 0 : innerW / (n - 1);
  return values.map((v, i) => {
    const x = pad + (n === 1 ? innerW / 2 : step * i);
    const y = pad + innerH * (1 - Math.max(0, Math.min(1, v / span)));
    return [x, y];
  });
}

/** SVG `d` for the polyline through the points (straight segments). */
export function linePath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

/** Closed area `d`: the line, dropped to `baselineY` and back to the first x. */
export function areaPath(pts: [number, number][], baselineY: number): string {
  if (pts.length === 0) return "";
  const first = pts[0][0].toFixed(1);
  const last = pts[pts.length - 1][0].toFixed(1);
  return `${linePath(pts)} L${last} ${baselineY.toFixed(1)} L${first} ${baselineY.toFixed(1)} Z`;
}

/** Point on a circle of radius r about (cx,cy) at `deg` (0° = 12 o'clock, clockwise). */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** SVG arc `d` from `startDeg` to `endDeg` along a circle (a stroked ring, no fill). */
export function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const [x0, y0] = polar(cx, cy, r, startDeg);
  const [x1, y1] = polar(cx, cy, r, endDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  const sweep = endDeg > startDeg ? 1 : 0;
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
```

- [ ] **Step 4: Run it and watch it PASS.** `node --experimental-strip-types frontend/tests/analytics_charts_logic.mjs`. Expected: PASS — prints `analytics_charts_logic: all assertions passed`.
- [ ] **Step 5: Commit.** `git add frontend/src/aurora/components/analytics/chartGeometry.ts frontend/tests/analytics_charts_logic.mjs` then commit `feat(analytics): dependency-free SVG chart geometry helpers + test`.

---

### Task P5.3: Chart primitives — TrendChart, DonutGauge, BarSeries

- [ ] **Step 1: TrendChart.** Create `frontend/src/aurora/components/analytics/TrendChart.tsx`:

```tsx
"use client";
/* TrendChart — a dependency-free dark line/area chart. Pure SVG from
   chartGeometry, scaled to its container via viewBox. Decorative (aria-hidden);
   pair with a text summary. */
import { useId } from "react";
import { niceCeil, points, linePath, areaPath } from "./chartGeometry";

const W = 320, H = 120, PAD = 10;
type Tone = "blue" | "purple" | "green" | "rose";

export function TrendChart({ values, tone = "blue" }: { values: number[]; tone?: Tone }) {
  const gid = useId().replace(/:/g, "");
  if (values.length === 0) return <p className="aurora-unavail">No activity data yet.</p>;

  const max = niceCeil(Math.max(0, ...values));
  const pts = points(values, W, H, PAD, max);
  const stroke = `var(--g-${tone})`;

  return (
    <svg className="aurora-trend" viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <defs>
        <linearGradient id={`tg-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.34" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath(pts, H - PAD)} fill={`url(#tg-${gid})`} stroke="none" />
      <path d={linePath(pts)} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.length <= 14 && pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.4" fill={stroke} />)}
    </svg>
  );
}
```

- [ ] **Step 2: DonutGauge.** Create `frontend/src/aurora/components/analytics/DonutGauge.tsx`:

```tsx
"use client";
/* DonutGauge — a dependency-free dark ring gauge (0..1 fraction). A faint track
   ring + a coloured progress arc + a centred %. Pure SVG from chartGeometry;
   decorative (aria-hidden), pair with a text readout. */
import { arcPath } from "./chartGeometry";

type Tone = "blue" | "purple" | "green" | "rose";

export function DonutGauge({ value, label, tone = "blue", size = 132 }: {
  value: number; label?: string; tone?: Tone; size?: number;
}) {
  const frac = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const cx = 60, cy = 60, r = 48;
  // Cap a full ring just short of 360° so the arc never degenerates to a point.
  const endDeg = frac >= 1 ? 359.999 : frac * 360;
  const pct = Math.round(frac * 100);
  const stroke = `var(--g-${tone})`;

  return (
    <div className="aurora-gauge" style={{ width: size, flexShrink: 0 }}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="10" />
        {frac > 0 && <path d={arcPath(cx, cy, r, 0, endDeg)} fill="none" stroke={stroke} strokeWidth="10" strokeLinecap="round" />}
        <text x="60" y="58" textAnchor="middle" className="aurora-gauge-num">{pct}%</text>
        {label && <text x="60" y="76" textAnchor="middle" className="aurora-gauge-cap">{label}</text>}
      </svg>
    </div>
  );
}
```

- [ ] **Step 3: BarSeries.** Create `frontend/src/aurora/components/analytics/BarSeries.tsx`:

```tsx
"use client";
/* BarSeries — a dependency-free dark horizontal bar list. Each row: a label, a
   track, and one or more stacked segments (fractions of `max`, default 1). One
   segment reads as a plain bar; several stack left-to-right. Reuses the shared
   .aurora-bar-* track styling (dark via the .aurora-analytics scope). */
type Tone = "blue" | "purple" | "green" | "rose";

export interface BarRow {
  label: string;
  segments: { value: number; tone: Tone; title?: string }[];
  readout?: string;
  weak?: boolean;
}

const TONE: Record<Tone, string> = {
  blue: "var(--g-blue)", purple: "var(--g-purple)", green: "var(--g-green)", rose: "var(--g-rose)",
};

export function BarSeries({ rows, max = 1 }: { rows: BarRow[]; max?: number }) {
  if (rows.length === 0) return <p className="aurora-unavail">No data yet.</p>;
  const span = Math.max(1e-6, max);
  return (
    <div className="aurora-bars">
      {rows.map((row, i) => (
        <div key={row.label + i} className="aurora-bar-row">
          <span className="aurora-bar-label">{row.label}</span>
          <span className="aurora-bar-track" style={{ display: "flex" }}>
            {row.segments.map((s, j) => (
              <span
                key={j}
                className="aurora-bar-seg"
                title={s.title}
                style={{
                  width: `${Math.max(0, Math.min(1, s.value / span)) * 100}%`,
                  background: row.weak && row.segments.length === 1
                    ? "linear-gradient(100deg, var(--g-rose), var(--g-purple))"
                    : TONE[s.tone],
                }}
              />
            ))}
          </span>
          {row.readout !== undefined && <span className="aurora-bar-pct">{row.readout}</span>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck the primitives.** Run `cd frontend && npm run typecheck`. Expected: PASS — `tsc --noEmit` reports no errors (the three components + their `chartGeometry` imports type-clean).
- [ ] **Step 5: Commit.** `git add frontend/src/aurora/components/analytics/TrendChart.tsx frontend/src/aurora/components/analytics/DonutGauge.tsx frontend/src/aurora/components/analytics/BarSeries.tsx` then commit `feat(analytics): dark SVG chart primitives (trend, donut gauge, bar series)`.

---

### Task P5.4: `useAnalytics.ts` React-Query hooks over existing endpoints

- [ ] **Step 1: Write the hooks.** Create `frontend/src/hooks/useAnalytics.ts` (thin, never-throw wrappers over the real endpoint shapes verified in `supervisor.py`/`admin.py`; live = focus-refetch + 30s poll, per the naming contract):

```ts
import { useQuery } from "@tanstack/react-query";

/* React-Query hooks for the dark Analytics dashboard. Thin wrappers over the
   EXISTING supervisor/admin read endpoints (re-gated to require_staff in the
   backend phase). "Real-time" = fresh-on-focus + a ~30s poll; every fetch
   degrades to a safe fallback (never throws) so the page renders before the two
   additive migrations land. Namespaced under ["analytics", …] so the Refresh
   control can invalidate the whole board in one call. */
const LIVE = { refetchOnWindowFocus: true, refetchInterval: 30_000, staleTime: 15_000 } as const;

async function getJSON<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export interface Cohort {
  total: number; active_this_week: number; at_risk_count: number;
  weakest_topics: string[]; inactive_7_plus_days: { student_id: string; days_inactive: number }[];
}
export function useCohort() {
  return useQuery<Cohort>({
    queryKey: ["analytics", "cohort"],
    queryFn: () => getJSON<Cohort>("/api/supervisor/cohort",
      { total: 0, active_this_week: 0, at_risk_count: 0, weakest_topics: [], inactive_7_plus_days: [] }),
    ...LIVE,
  });
}

export interface AtRiskRow {
  student_id: string; name?: string; days_inactive: number;
  weak_count?: number; weak_topic_count?: number; weak_topics?: string[];
}
export function useAtRisk() {
  return useQuery<AtRiskRow[]>({
    queryKey: ["analytics", "at-risk"],
    queryFn: async () => {
      const d = await getJSON<{ students?: AtRiskRow[]; at_risk?: AtRiskRow[] }>("/api/supervisor/at-risk", {});
      return d.students ?? d.at_risk ?? [];
    },
    ...LIVE,
  });
}

export interface RosterRow {
  student_id: string; full_name: string; email: string; role: string;
  session_count: number | string; streak: number | string; last_active: string; learning_velocity: string;
}
export function useRoster() {
  return useQuery<RosterRow[]>({
    queryKey: ["analytics", "roster"],
    queryFn: async () => (await getJSON<{ students?: RosterRow[] }>("/api/admin/students", {})).students ?? [],
    ...LIVE,
  });
}

export interface CaseResult {
  case_id: string; total_score: number; passed: boolean; completed_at: string;
  // Tier-2 OSCE grade (Phase-2 migration) — optional so the drill-down renders before it lands.
  score_100?: number; safe?: boolean; consult_technique?: number; judgement_safety?: number; missed_critical?: string[];
}
export interface StudentDetail {
  student_id: string; full_name: string; email: string; role: string;
  session_count: number; streak: number; last_active: string; learning_velocity: string;
  weak_topics: string[]; missed_findings: string[]; retention_scores: Record<string, number>;
  supervisor_note: string;
  sessions: { session_id: string; timestamp: string; topic: string; token_count: number; model: string }[];
  cases: CaseResult[]; total_tokens: number;
  // Tier-2 flashcard accuracy (Phase-2 migration) — optional.
  flashcard_accuracy?: Record<string, { correct: number; total: number; pct: number }>;
}
export function useStudentDetail(id: string | null) {
  return useQuery<StudentDetail | null>({
    queryKey: ["analytics", "student", id],
    enabled: !!id,
    queryFn: () => getJSON<StudentDetail | null>(`/api/admin/student/${id}/detail`, null),
    ...LIVE,
  });
}

export interface Benchmark { topic: string; avg_score: number; student_count: number; }
export function useBenchmarks() {
  return useQuery<Benchmark[]>({
    queryKey: ["analytics", "benchmarks"],
    queryFn: async () => (await getJSON<{ topics?: Benchmark[] }>("/api/supervisor/benchmarks", {})).topics ?? [],
    ...LIVE,
  });
}

export interface FeedItem {
  type: string; student_id: string; name: string; detail: string; timestamp: string;
  token_count?: number;
  // Tier-2 (Phase-2): the feed's case items carry safety + missed-critical once recorded.
  safe?: boolean; missed_critical?: string[];
}
export function useActivity() {
  return useQuery<FeedItem[]>({
    queryKey: ["analytics", "activity"],
    queryFn: async () => (await getJSON<{ feed?: FeedItem[] }>("/api/admin/activity", {})).feed ?? [],
    ...LIVE,
  });
}

export interface TokenSummary { total_tokens: number; by_student: { student_id: string; tokens: number }[]; }
export function useTokenSummary() {
  return useQuery<TokenSummary>({
    queryKey: ["analytics", "token-summary"],
    queryFn: () => getJSON<TokenSummary>("/api/admin/token-summary", { total_tokens: 0, by_student: [] }),
    ...LIVE,
  });
}

export function useCohortInsight() {
  return useQuery<string>({
    queryKey: ["analytics", "insight"],
    queryFn: async () => (await getJSON<{ narrative?: string }>("/api/supervisor/insights", {})).narrative ?? "",
    // The insight is a paid, rate-limited (10/min) Gemini call — do NOT poll it.
    // Fresh on manual Refresh + a 5-min stale window only. (Prod-cost invariant.)
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });
}
```

- [ ] **Step 2: Typecheck.** Run `cd frontend && npm run typecheck`. Expected: PASS — the hooks and all exported interfaces type-clean.
- [ ] **Step 3: Commit.** `git add frontend/src/hooks/useAnalytics.ts` then commit `feat(analytics): React-Query hooks over the existing staff read endpoints`.

---

### Task P5.5: Cohort band section

- [ ] **Step 1: Write the cohort band.** Create `frontend/src/aurora/screens/AnalyticsCohort.tsx` (reuses `StatCard` + `Heatmap`; Tier-2 OSCE panels honour spec §8.4 — labelled unavailable, never faked, until the grade migration feeds `safe`/`missed_critical`):

```tsx
"use client";
/* Analytics — cohort band. The top-of-page situational picture: KPI tiles, the
   AI cohort insight, an activity trend, weak-topic + cohort-benchmark bars, a
   topic-mastery heatmap, and the Tier-2 OSCE panels (safety-failure rate +
   most-missed steps) which light up once the OSCE-grade migration is applied. */
import { StatCard } from "@/aurora/components/StatCard";
import { Heatmap } from "@/aurora/components/Heatmap";
import { TrendChart } from "@/aurora/components/analytics/TrendChart";
import { DonutGauge } from "@/aurora/components/analytics/DonutGauge";
import { BarSeries, type BarRow } from "@/aurora/components/analytics/BarSeries";
import { fmtTokens } from "@/screens/adminShared";
import { useCohort, useAtRisk, useBenchmarks, useActivity, useTokenSummary, useCohortInsight } from "@/hooks/useAnalytics";

/* Bucket activity-feed timestamps into a per-day count over the last `days`. */
function dailyCounts(timestamps: string[], days = 21): number[] {
  const counts = Array(days).fill(0) as number[];
  const now = Date.now();
  for (const ts of timestamps) {
    const t = new Date(ts).getTime();
    if (Number.isNaN(t)) continue;
    const diff = Math.floor((now - t) / 86_400_000);
    if (diff >= 0 && diff < days) counts[days - 1 - diff]++;
  }
  return counts;
}

/* Parse "C123 ✓ · 32/40" (admin activity feed) → the /40 score, or null. */
function parseCaseScore(detail: string): number | null {
  const m = detail.match(/(\d+)\s*\/\s*40/);
  return m ? Number(m[1]) : null;
}

export function AnalyticsCohort() {
  const cohort = useCohort();
  const atRisk = useAtRisk();
  const benchmarks = useBenchmarks();
  const activity = useActivity();
  const tokens = useTokenSummary();
  const insight = useCohortInsight();

  const c = cohort.data;
  const total = c?.total ?? 0;
  const active = c?.active_this_week ?? 0;
  const atRiskCount = c?.at_risk_count ?? atRisk.data?.length ?? 0;

  const bench = benchmarks.data ?? [];
  const avgMastery = bench.length
    ? Math.round((bench.reduce((s, b) => s + b.avg_score, 0) / bench.length) * 100)
    : null;

  const feed = activity.data ?? [];
  const caseItems = feed.filter((f) => f.type === "case");
  const caseScores = caseItems.map((f) => parseCaseScore(f.detail)).filter((x): x is number => x !== null);
  const avgOsce = caseScores.length
    ? Math.round((caseScores.reduce((a, b) => a + b, 0) / caseScores.length / 40) * 100)
    : null;

  const trend = dailyCounts(feed.map((f) => f.timestamp));

  const weakRows: BarRow[] = (c?.weakest_topics ?? []).slice(0, 6).map((t, i) => ({
    label: t.replace(/_/g, " "),
    segments: [{ value: Math.max(0.2, 0.9 - i * 0.12), tone: "rose" }],
    weak: true,
  }));
  const benchRows: BarRow[] = [...bench].sort((a, b) => a.avg_score - b.avg_score).slice(0, 8).map((b) => ({
    label: b.topic.replace(/_/g, " "),
    segments: [{ value: b.avg_score, tone: b.avg_score < 0.65 ? "rose" : "blue" }],
    readout: `${Math.round(b.avg_score * 100)}%`,
    weak: b.avg_score < 0.65,
  }));
  const heat = bench.map((b) => b.avg_score);

  // Tier-2 OSCE — only compute from the extended grade fields if present.
  const graded = caseItems.filter((f) => typeof f.safe === "boolean");
  const unsafe = graded.filter((f) => f.safe === false).length;
  const safetyRate = graded.length ? unsafe / graded.length : null;
  const missCounts = new Map<string, number>();
  for (const f of caseItems) for (const m of f.missed_critical ?? []) missCounts.set(m, (missCounts.get(m) ?? 0) + 1);
  const mostMissed = [...missCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const missMax = mostMissed.length ? mostMissed[0][1] : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="aurora-kpis">
        <StatCard tone="blue" label="Total students" value={total} />
        <StatCard tone="green" label="Active this week" value={active} />
        <StatCard tone="rose" label="At risk" value={atRiskCount} />
        <StatCard tone="purple" label="Avg mastery" value={avgMastery === null ? "—" : `${avgMastery}%`} />
        <StatCard tone="blue" label="Avg OSCE" value={avgOsce === null ? "—" : `${avgOsce}%`} />
        <StatCard tone="purple" label="AI tokens" value={fmtTokens(tokens.data?.total_tokens ?? 0)} />
      </div>

      {insight.data && <div className="aurora-insight"><p>“{insight.data}”</p></div>}

      <div className="aurora-analytics-grid">
        <section className="aurora-panel">
          <p className="aurora-panel-head">Activity · last 3 weeks</p>
          <TrendChart values={trend} tone="blue" />
          <p className="aurora-unavail" style={{ marginTop: 8 }}>
            {feed.length ? `${feed.length} recent activity events across the cohort.` : "No recent activity events."}
          </p>
        </section>

        <section className="aurora-panel">
          <p className="aurora-panel-head">Cohort mastery by topic</p>
          {heat.length ? (
            <>
              <Heatmap values={heat} columns={Math.min(10, heat.length)} />
              <p className="aurora-unavail" style={{ marginTop: 8 }}>{bench.length} topics benchmarked · avg {avgMastery}%.</p>
            </>
          ) : <p className="aurora-unavail">No benchmark data yet.</p>}
        </section>

        <section className="aurora-panel">
          <p className="aurora-panel-head">Weakest topics (cohort)</p>
          <BarSeries rows={weakRows} />
        </section>

        <section className="aurora-panel">
          <p className="aurora-panel-head">Topic benchmarks (lowest first)</p>
          <BarSeries rows={benchRows} />
        </section>

        <section className="aurora-panel">
          <p className="aurora-panel-head">OSCE safety-failure rate</p>
          {safetyRate === null ? (
            <p className="aurora-unavail">Available once the OSCE-grade migration is applied — per-attempt safety isn’t recorded yet.</p>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <DonutGauge value={safetyRate} label="unsafe" tone="rose" size={120} />
              <p className="aurora-unavail">{unsafe} of {graded.length} recent attempts missed a critical safety step.</p>
            </div>
          )}
        </section>

        <section className="aurora-panel">
          <p className="aurora-panel-head">Most-missed OSCE steps</p>
          {mostMissed.length ? (
            <BarSeries max={missMax} rows={mostMissed.map(([step, n]) => ({ label: step, segments: [{ value: n, tone: "rose" }], readout: String(n), weak: true }))} />
          ) : (
            <p className="aurora-unavail">Available once the OSCE-grade migration records missed-critical steps.</p>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck.** Run `cd frontend && npm run typecheck`. Expected: PASS.
- [ ] **Step 3: Commit.** `git add frontend/src/aurora/screens/AnalyticsCohort.tsx` then commit `feat(analytics): cohort band — KPIs, insight, trend, mastery + OSCE panels`.

---

### Task P5.6: Roster table + drill-down (extend AdminStudentDetail)

- [ ] **Step 1: Extend the drill-down interfaces.** In `frontend/src/aurora/screens/AdminStudentDetail.tsx`, replace the two interface declarations (current lines 9-16) so the reused drill-down carries the Tier-2 fields:

```tsx
interface Session { session_id: string; timestamp: string; topic: string; token_count: number; model: string; }
interface CaseRow {
  case_id: string; total_score: number; passed: boolean; completed_at: string;
  // Tier-2 OSCE grade (Phase-2 migration) — optional so this renders before it lands.
  score_100?: number; safe?: boolean; consult_technique?: number; judgement_safety?: number; missed_critical?: string[];
}
interface DetailData {
  student_id: string; full_name: string; email: string; role: string;
  session_count: number; streak: number; last_active: string; learning_velocity: string;
  weak_topics: string[]; missed_findings: string[]; retention_scores: Record<string, number>;
  supervisor_note: string; sessions: Session[]; cases: CaseRow[]; total_tokens: number;
  // Tier-2 flashcard accuracy (Phase-2 migration) — optional.
  flashcard_accuracy?: Record<string, { correct: number; total: number; pct: number }>;
}
```

- [ ] **Step 2: Render OSCE sub-scores + safety in the cases sub-tab.** In the same file, replace the cases-table block (current lines 123-138, `{subTab === "cases" && (…)}`) with:

```tsx
              {subTab === "cases" && (
                <div className="aurora-table-wrap">
                  <div className="aurora-trow aurora-thead" style={{ gridTemplateColumns: "1fr 80px 88px 66px 96px" }}>
                    <span>Case</span><span>Score</span><span>Sub-scores</span><span>Safety</span><span>Date</span>
                  </div>
                  {data.cases.length === 0 && <p className="aurora-tempty">No case attempts yet.</p>}
                  {data.cases.map((c, i) => {
                    const scored = c.score_100 !== undefined;
                    return (
                      <div key={i} className="aurora-trow" style={{ gridTemplateColumns: "1fr 80px 88px 66px 96px" }}>
                        <span className="aurora-tcell">{c.case_id}</span>
                        <span className="aurora-tcell is-mono">{scored ? `${c.score_100}/100` : `${c.total_score}/40`}</span>
                        <span className="aurora-tcell is-muted">
                          {c.consult_technique !== undefined && c.judgement_safety !== undefined
                            ? `${c.consult_technique}·${c.judgement_safety}` : "—"}
                        </span>
                        <span className="aurora-tcell">
                          {c.safe === undefined
                            ? <span className="aurora-badge" data-tone={c.passed ? "ok" : "rose"}>{c.passed ? "Pass" : "Fail"}</span>
                            : <span className="aurora-badge" data-tone={c.safe ? "ok" : "rose"}>{c.safe ? "Safe" : "Unsafe"}</span>}
                        </span>
                        <span className="aurora-tcell is-muted">{c.completed_at?.slice(0, 10) || "—"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
```

- [ ] **Step 3: Render flashcard accuracy in the topics sub-tab.** In the same file, inside the `{subTab === "topics" && (…)}` block, add — immediately after the `retention_scores` bars block (after the closing of the `Object.keys(data.retention_scores).length > 0 && (…)` group, before the `missed_findings` block, current line ~158):

```tsx
                  {data.flashcard_accuracy && Object.keys(data.flashcard_accuracy).length > 0 && (
                    <div>
                      <p className="aurora-activity-head">Flashcard accuracy (per topic)</p>
                      <div className="aurora-bars">
                        {Object.entries(data.flashcard_accuracy).map(([topic, a]) => (
                          <div key={topic} className="aurora-bar-row">
                            <span className="aurora-bar-label">{topic.replace(/_/g, " ")}</span>
                            <span className="aurora-bar-track"><span className="aurora-bar-fill" data-weak={a.pct < 65} style={{ width: `${Math.max(0, Math.min(100, a.pct))}%` }} /></span>
                            <span className="aurora-bar-pct">{a.correct}/{a.total}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
```

- [ ] **Step 4: Write the roster section.** Create `frontend/src/aurora/screens/AnalyticsRoster.tsx` (the AdminStudents search/filter/paginate controls, now hook-driven, opening the reused drill-down):

```tsx
"use client";
/* Analytics — roster. The cohort table: search + role/at-risk filter + paginate
   (the AdminStudents controls, now hook-driven so it refreshes in real time).
   A row click opens the reused AdminStudentDetail drill-down. */
import { useState } from "react";
import { fmtTokens } from "@/screens/adminShared";
import { AdminStudentDetail } from "@/aurora/screens/AdminStudentDetail";
import { useRoster, useAtRisk, useTokenSummary } from "@/hooks/useAnalytics";

const PAGE_SIZE = 20;
const COLS = "2.2fr 2.4fr 84px 92px 78px 92px 112px";
type Filter = "all" | "OA" | "OT" | "PSA" | "at-risk";

function roleTone(role: string): "blue" | "purple" | "rose" | undefined {
  if (role === "OA") return "blue";
  if (role === "OT") return "purple";
  if (role === "PSA") return "rose";
  return undefined;
}

export function AnalyticsRoster() {
  const roster = useRoster();
  const atRiskQ = useAtRisk();
  const tokensQ = useTokenSummary();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const students = roster.data ?? [];
  const atRisk = (atRiskQ.data ?? []).map((r) => r.student_id);
  const tokensByStudent: Record<string, number> = {};
  for (const t of tokensQ.data?.by_student ?? []) tokensByStudent[t.student_id] = t.tokens;

  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    if (q && !s.full_name.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q)) return false;
    if (filter === "at-risk") return atRisk.includes(s.student_id);
    if (filter !== "all") return s.role === filter;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="aurora-toolbar">
        <input className="aurora-field" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search name or email…" />
        <div className="aurora-chips">
          {(["all", "OA", "OT", "PSA", "at-risk"] as Filter[]).map((f) => (
            <button key={f} type="button" className={`aurora-chip${filter === f ? " aurora-flow" : ""}`} data-active={filter === f} onClick={() => { setFilter(f); setPage(0); }}>
              <span>{f === "all" ? "All" : f === "at-risk" ? "At risk" : f}</span>
            </button>
          ))}
        </div>
      </div>

      {roster.isLoading ? (
        <p className="aurora-unavail">Loading roster…</p>
      ) : (
        <div className="aurora-table-wrap" data-testid="analytics-roster">
          <div className="aurora-trow aurora-thead" style={{ gridTemplateColumns: COLS }}>
            <span>Name</span><span>Email</span><span>Role</span><span>Sessions</span><span>Streak</span><span>Tokens</span><span>Last active</span>
          </div>
          {paged.map((s) => (
            <div key={s.student_id} className="aurora-trow is-clickable" style={{ gridTemplateColumns: COLS }} onClick={() => setOpenId(s.student_id)}>
              <span className="aurora-tcell" style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 7 }}>
                {atRisk.includes(s.student_id) && <span className="console-risk-dot" title="At risk" aria-label="At risk" />}
                {s.full_name}
              </span>
              <span className="aurora-tcell is-muted">{s.email}</span>
              <span><span className="aurora-badge" data-tone={roleTone(s.role)}>{s.role}</span></span>
              <span className="aurora-tcell is-mono">{s.session_count}</span>
              <span className="aurora-tcell is-mono">{s.streak}</span>
              <span className="aurora-tcell is-accent">{fmtTokens(tokensByStudent[s.student_id] ?? 0)}</span>
              <span className="aurora-tcell is-mono">{s.last_active?.slice(0, 10) || "—"}</span>
            </div>
          ))}
          {filtered.length === 0 && <p className="aurora-tempty">No students found.</p>}
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="aurora-pager">
          <span>{safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
          <div className="aurora-pager-btns">
            <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>← Prev</button>
            <span style={{ padding: "0 4px" }}>Page {safePage + 1} / {totalPages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>Next →</button>
          </div>
        </div>
      )}

      {openId && <AdminStudentDetail studentId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck.** Run `cd frontend && npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit.** `git add frontend/src/aurora/screens/AdminStudentDetail.tsx frontend/src/aurora/screens/AnalyticsRoster.tsx` then commit `feat(analytics): roster table + drill-down with flashcard accuracy & OSCE sub-scores`.

---

### Task P5.7: Admin-only provisioning block

- [ ] **Step 1: Write the provisioning block.** Create `frontend/src/aurora/screens/AnalyticsProvisioning.tsx` (based on the retired `AdminAccounts.tsx` handlers; the add-form role dropdown now includes Trainer/Admin and the promote dropdown offers Trainer/Admin — backend enforcement stays `require_admin`, and the parent only mounts this for `role === "admin"`):

```tsx
"use client";
/* Analytics — provisioning (ADMIN ONLY). Add one account (role: OA/OT/PSA/Trainer/
   Admin), bulk-import a student CSV, remove an approved account, or promote an
   existing email to Trainer/Admin. Same endpoints as the retired AdminAccounts;
   staff roles (Trainer/Admin) are handled by the widened POST /api/admin/approved
   + /api/admin/promote. The parent gates render on role === "admin"; the backend
   also enforces require_admin on every write here. */
import { useState, useRef, useEffect, type FormEvent, type CSSProperties } from "react";
import { useAuth } from "@/screens/AuthContext";
import { type ApprovedStudent, type Credential, getInitials } from "@/screens/adminShared";
import { Icon } from "@/aurora/icons";

function roleTone(role: string): "blue" | "purple" | "rose" | undefined {
  if (role === "OA") return "blue";
  if (role === "OT") return "purple";
  if (role === "PSA") return "rose";
  return undefined;
}

export function AnalyticsProvisioning() {
  const { user } = useAuth();
  const adminId = user?.studentId ?? "";

  const [approved, setApproved] = useState<ApprovedStudent[]>([]);
  const [approvedLoading, setApprovedLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [addedCredential, setAddedCredential] = useState<{ email: string; password: string; emailSent: boolean; emailError: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoteRole, setPromoteRole] = useState("trainer");
  const [promoting, setPromoting] = useState(false);
  const [promoteMsg, setPromoteMsg] = useState("");
  const [csvCredentials, setCsvCredentials] = useState<Credential[]>([]);
  const [csvErrors, setCsvErrors] = useState<{ row: number; reason: string }[]>([]);
  const [csvImportSummary, setCsvImportSummary] = useState<{ imported: number; skipped: number } | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvPreview, setCsvPreview] = useState<{ count: number } | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [accountSearch, setAccountSearch] = useState("");
  const [provMode, setProvMode] = useState<"one" | "csv">("one");

  useEffect(() => {
    fetch("/api/admin/approved", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setApproved(d.students ?? []))
      .catch(() => {})
      .finally(() => setApprovedLoading(false));
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAddError("");
    if (!newEmail.trim() || !newName.trim() || !newRole) { setAddError("All fields are required."); return; }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/approved", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ email: newEmail.trim().toLowerCase(), full_name: newName.trim(), role: newRole }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setAddError((d as { detail?: string }).detail ?? "Failed to add account."); setAdding(false); return; }
      const data = await res.json().catch(() => ({})) as { email_sent?: boolean; email_error?: string; password?: string };
      setAddedCredential({
        email: newEmail.trim().toLowerCase(),
        password: data.password ?? "",
        emailSent: !!data.email_sent,
        emailError: data.email_error ?? "",
      });
      setApproved((prev) => [...prev, { email: newEmail.trim().toLowerCase(), full_name: newName.trim(), role: newRole, added_by: adminId, added_at: "", student_id: "" }]);
      setNewEmail(""); setNewName(""); setNewRole("");
    } catch { setAddError("Network error."); }
    setAdding(false);
  };

  const handleRemove = async (email: string) => {
    setRemoving(email); setRemoveError("");
    try {
      const res = await fetch(`/api/admin/approved/${encodeURIComponent(email)}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { setRemoveError("Failed to remove."); setRemoving(null); return; }
      setApproved((prev) => prev.filter((s) => s.email !== email));
    } catch { setRemoveError("Network error."); }
    setRemoving(null);
  };

  const handlePromote = async (e: FormEvent) => {
    e.preventDefault();
    setPromoting(true); setPromoteMsg("");
    try {
      const res = await fetch("/api/admin/promote", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ email: promoteEmail.trim().toLowerCase(), new_role: promoteRole }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setPromoteMsg((d as { detail?: string }).detail ?? "Failed."); }
      else { setPromoteMsg("Done."); setPromoteEmail(""); }
    } catch { setPromoteMsg("Network error."); }
    setPromoting(false);
  };

  const handleCsvFile = (f: File) => {
    setCsvFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? "";
      const lines = text.split("\n").filter((l) => l.trim());
      setCsvPreview({ count: Math.max(0, lines.length - 1) });
    };
    reader.readAsText(f);
  };

  const handleCsvImport = async () => {
    if (!csvFile) return;
    setCsvUploading(true);
    const form = new FormData();
    form.append("file", csvFile);
    try {
      const res = await fetch("/api/admin/upload-csv", { method: "POST", credentials: "include", body: form });
      const data = await res.json();
      setCsvImportSummary({ imported: data.imported, skipped: data.skipped });
      setCsvErrors(data.errors ?? []);
      setCsvCredentials(data.credentials ?? []);
      setCsvFile(null); setCsvPreview(null);
    } catch {
      setCsvImportSummary({ imported: 0, skipped: 0 });
      setCsvErrors([{ row: 0, reason: "Network error — import failed." }]);
    }
    setCsvUploading(false);
  };

  const filteredApproved = approved.filter((s) => {
    if (!accountSearch) return true;
    const q = accountSearch.toLowerCase();
    return s.full_name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="aurora-panel console-card-accent" style={{ "--accent": "var(--g-green)" } as CSSProperties}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <p className="aurora-activity-head" style={{ margin: 0 }}>Provision accounts</p>
          <div className="console-segment" role="tablist" aria-label="Provisioning mode">
            <button type="button" role="tab" aria-selected={provMode === "one"} data-active={provMode === "one"} onClick={() => setProvMode("one")}>One account</button>
            <button type="button" role="tab" aria-selected={provMode === "csv"} data-active={provMode === "csv"} onClick={() => setProvMode("csv")}>Import CSV</button>
          </div>
        </div>

        {provMode === "one" ? (
          <>
            <form onSubmit={handleAdd} className="aurora-form-row">
              <div>
                <label className="aurora-form-label">Full name</label>
                <input className="aurora-field" style={{ width: "100%" }} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jane Doe" />
              </div>
              <div>
                <label className="aurora-form-label">Email</label>
                <input className="aurora-field" style={{ width: "100%" }} type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="jane@snec.com.sg" />
              </div>
              <div>
                <label className="aurora-form-label">Role</label>
                <select className="aurora-select" style={{ width: "100%" }} value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  <option value="">Select role…</option>
                  <option value="OA">Ophthalmic Assistant (OA)</option>
                  <option value="OT">Ophthalmic Technician (OT)</option>
                  <option value="PSA">Patient Service Associate (PSA)</option>
                  <option value="trainer">Trainer (staff)</option>
                  <option value="admin">Admin (staff)</option>
                </select>
              </div>
              {addError && <p className="aurora-note is-err">{addError}</p>}
              <button type="submit" className="aurora-btn" disabled={adding}>{adding ? "Adding…" : "Add account"}</button>
            </form>
            <p className="aurora-unavail" style={{ marginTop: 8 }}>
              Student roles (OA · OT · PSA) get a learner account. Trainer / Admin get staff access — Trainer sees Analytics; Admin also provisions accounts here.
            </p>
            {addedCredential && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {addedCredential.emailSent ? (
                  <p className="aurora-note is-ok">Account added. Login details emailed to {addedCredential.email}.</p>
                ) : (
                  <p className="aurora-note is-err">
                    Account added, but the email didn’t send{addedCredential.emailError ? ` — ${addedCredential.emailError}` : ""}. Give them the temporary password below (they’ll be asked to change it).
                  </p>
                )}
                {addedCredential.password && (
                  <p className="aurora-note">
                    Temporary password (shown once):{" "}
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{addedCredential.password}</span>
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div
              className="aurora-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}
            >
              <div style={{ fontSize: "1.6rem" }}>⬚</div>
              <p className="aurora-dropzone-title">Drop CSV here or click to browse</p>
              <p className="aurora-dropzone-sub">Columns: full_name · email · role (OA / OT / PSA)</p>
              <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }} />
            </div>
            {csvPreview && <p className="aurora-note is-ok" style={{ marginTop: 8 }}>{csvPreview.count} students ready to import</p>}
            {csvFile && <button type="button" className="aurora-btn" style={{ width: "100%", marginTop: 10 }} onClick={handleCsvImport} disabled={csvUploading}>{csvUploading ? "Importing…" : `Import ${csvPreview?.count ?? ""} students`}</button>}
            {csvImportSummary && (
              <div style={{ marginTop: 10 }}>
                <p className="aurora-note is-ok">Imported: {csvImportSummary.imported}</p>
                {csvImportSummary.skipped > 0 && <p className="aurora-note">Skipped: {csvImportSummary.skipped}</p>}
                {csvErrors.map((er, i) => <p key={i} className="aurora-note is-err">Row {er.row}: {er.reason}</p>)}
              </div>
            )}
            {csvCredentials.length > 0 && (
              <div className="aurora-table-wrap" style={{ marginTop: 12 }}>
                <div className="aurora-trow aurora-thead" style={{ gridTemplateColumns: "1fr 1fr" }}><span>Email</span><span>Password (shown once)</span></div>
                {csvCredentials.map((c) => (
                  <div key={c.email} className="aurora-trow" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <span className="aurora-tcell is-muted">{c.email}</span>
                    <span className="aurora-tcell is-mono">{c.password}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="aurora-panel" style={{ padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--hairline)" }}>
          <p className="aurora-activity-head" style={{ margin: 0 }}>Approved accounts ({approved.length})</p>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {removeError && <span className="aurora-note is-err">{removeError}</span>}
            <input className="aurora-field" style={{ width: 180, minWidth: 0, flex: "none" }} value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Search…" />
          </div>
        </div>
        {approvedLoading ? (
          <p className="aurora-tempty">Loading…</p>
        ) : filteredApproved.length === 0 ? (
          <p className="aurora-tempty">{accountSearch ? "No accounts match your search." : "No approved accounts yet."}</p>
        ) : (
          filteredApproved.map((s) => (
            <div key={s.email} className="aurora-acct-row">
              <span className="aurora-avatar" style={{ width: 30, height: 30 }}>{getInitials(s.full_name)}</span>
              <div className="aurora-acct-meta">
                <div className="aurora-acct-name">{s.full_name}</div>
                <div className="aurora-acct-email">{s.email}</div>
              </div>
              <span className="aurora-badge" data-tone={roleTone(s.role)}>{s.role}</span>
              <span className="aurora-badge" data-tone={s.student_id ? "green" : "amber"}>{s.student_id ? "Active" : "Pending"}</span>
              <button type="button" className="aurora-acct-remove" onClick={() => handleRemove(s.email)} disabled={removing === s.email} aria-label={`Remove ${s.full_name}`}>
                <Icon.close size={14} />
              </button>
            </div>
          ))
        )}
      </section>

      <details className="console-disclosure">
        <summary>
          <span>Promote existing email<span className="console-disc-sub" style={{ marginLeft: 8 }}>staff access</span></span>
          <svg className="console-disc-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
        </summary>
        <div className="console-disclosure-body">
          <p className="aurora-unavail" style={{ margin: "8px 0 12px" }}>
            Grant an existing account Trainer or Admin access. Trainer sees Analytics; Admin also provisions accounts.
          </p>
          <form onSubmit={handlePromote} style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label className="aurora-form-label">Email</label>
              <input className="aurora-field" style={{ width: "100%" }} type="email" value={promoteEmail} onChange={(e) => setPromoteEmail(e.target.value)} placeholder="staff@snec.com.sg" />
            </div>
            <div>
              <label className="aurora-form-label">Role</label>
              <select className="aurora-select" value={promoteRole} onChange={(e) => setPromoteRole(e.target.value)}>
                <option value="trainer">Trainer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button type="submit" className="aurora-btn" disabled={promoting}>{promoting ? "…" : "Promote"}</button>
          </form>
          {promoteMsg && <p className="aurora-note is-ok" style={{ marginTop: 10 }}>{promoteMsg}</p>}
        </div>
      </details>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck.** Run `cd frontend && npm run typecheck`. Expected: PASS. (Note: `handlePromote` sends `new_role` — matching `PromoteRequest` in `admin.py` — not `role`; this fixes the retired AdminAccounts' body key which sent `role`.)
- [ ] **Step 3: Commit.** `git add frontend/src/aurora/screens/AnalyticsProvisioning.tsx` then commit `feat(analytics): admin-only provisioning (OA/OT/PSA/Trainer/Admin, CSV, remove, promote)`.

---

### Task P5.8: Compose Analytics.tsx + full build gate

- [ ] **Step 1: Replace the Phase-3 stub screen.** Overwrite `frontend/src/aurora/screens/Analytics.tsx` (keep the named `Analytics` export so the Phase-3 `analytics/page.tsx` dynamic import — `.then((m) => m.Analytics)` — resolves):

```tsx
"use client";
/* Analytics — the dark, PowerBI-style staff dashboard (trainer + admin). Renders
   inside the light student shell (rail stays light) but self-themes dark via the
   scoped .aurora-analytics wrapper — the .aurora-chat pattern. Cohort band +
   roster/drill-down for both roles; the provisioning block only for admins (also
   backend-enforced by require_admin). "Real-time" = the useAnalytics hooks
   refetch on focus + poll ~30s; Refresh forces an immediate refetch of the board. */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/screens/AuthContext";
import { AnalyticsCohort } from "@/aurora/screens/AnalyticsCohort";
import { AnalyticsRoster } from "@/aurora/screens/AnalyticsRoster";
import { AnalyticsProvisioning } from "@/aurora/screens/AnalyticsProvisioning";

type Tab = "cohort" | "roster" | "accounts";

export function Analytics() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<Tab>("cohort");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["analytics"] });
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <main className="aurora-analytics">
      <div className="aurora-analytics-head">
        <div className="console-section-head">
          <span className="console-tick" data-hue="blue" />
          <h1 className="aurora-h1">Analytics</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div className="console-segment" role="tablist" aria-label="Analytics view">
            <button type="button" role="tab" aria-selected={tab === "cohort"} data-active={tab === "cohort"} onClick={() => setTab("cohort")}>Cohort</button>
            <button type="button" role="tab" aria-selected={tab === "roster"} data-active={tab === "roster"} onClick={() => setTab("roster")}>Students</button>
            {isAdmin && <button type="button" role="tab" aria-selected={tab === "accounts"} data-active={tab === "accounts"} onClick={() => setTab("accounts")}>Accounts</button>}
          </div>
          <button type="button" className="aurora-refresh" onClick={refresh} disabled={refreshing}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <p className="aurora-unavail" style={{ marginBottom: 18 }}>
        Live cohort and per-student analytics. Data refreshes automatically on focus and every 30 seconds. Switch the content pool (OA · PSA / OT) from the home toggle to view a discipline’s cohort.
      </p>

      {tab === "cohort" && <AnalyticsCohort />}
      {tab === "roster" && <AnalyticsRoster />}
      {tab === "accounts" && isAdmin && <AnalyticsProvisioning />}
    </main>
  );
}
```

- [ ] **Step 2: Full frontend gate — expect PASS.** Run `cd frontend && npm run typecheck && npm run build`. Expected: PASS — typecheck clean and the production build completes (all new screens/charts/hooks compile; `.aurora-analytics` CSS bundles).
- [ ] **Step 3: Re-run the chart unit test — expect PASS.** `node --experimental-strip-types frontend/tests/analytics_charts_logic.mjs`. Expected: PASS (regression guard for the geometry the charts depend on).
- [ ] **Step 4: Commit.** `git add frontend/src/aurora/screens/Analytics.tsx` then commit `feat(analytics): compose the dark Analytics dashboard (cohort · roster · admin provisioning)`.

---

## Phase 6 — Per-student self-contained HTML report

Clones the proven `sessionExport.ts` split (pure DOM-free builder + Node unit test), then wires a "Download report (HTML)" action into the reused Analytics drill-down (`AdminStudentDetail.tsx`) mapping already-loaded per-student data → `StudentReportData` → Blob download. Depends on Phase 5's drill-down being the Analytics detail surface; grounded in the real current `AdminStudentDetail.tsx` (its `DetailData`/`CaseRow` shape) and extended additively/gracefully for the Tier-2 fields Phase 5/backend add.

**Files:**
- `frontend/src/aurora/lib/studentReportExport.ts` — NEW. `interface StudentReportData` + `buildStudentReportHtml(data): string` (pure, DOM-free, `esc()` verbatim, `bulletList` helper, one inlined `<style>` with the same `@media print` rules).
- `frontend/tests/student-report.test.mjs` — NEW. Node type-strip unit test (mirrors `session_export_logic.mjs`).
- `frontend/src/aurora/screens/AdminStudentDetail.tsx` — EDIT. Additive optional Tier-2 fields on `DetailData`/`CaseRow`; `handleDownloadReport`; "Download report (HTML)" button beside "Save note".

---

### Task P6.1: Pure `buildStudentReportHtml` builder (TDD)

- [ ] **Step 1: Write the failing Node test.** Create `frontend/tests/student-report.test.mjs` (imports the not-yet-existing module, so it fails at import):

```js
/* Pure unit test for the per-student analytics report export. Run with Node's type
   stripping (studentReportExport.ts is dependency-free, mirrors session_export_logic.mjs):
     node --experimental-strip-types frontend/tests/student-report.test.mjs

   buildStudentReportHtml turns already-loaded per-student analytics data into ONE
   self-contained, print-friendly, fully HTML-escaped document. */
import assert from "node:assert";
import { buildStudentReportHtml } from "../src/aurora/lib/studentReportExport.ts";

const data = {
  meta: {
    studentId: "abcd1234ef567890", fullName: "Test Student", email: "test@snec.edu",
    role: "OA", dateStr: "2026-07-13 14:30",
  },
  vitals: {
    sessions: 42, streak: 5, lastActive: "2026-07-12", velocity: "steady",
    cases: 3, tokens: "12.4k",
  },
  topics: [
    { topic: "glaucoma", retentionPct: 82, flashcardPct: 74, cohortPct: 68 },
    { topic: "refraction", retentionPct: 55, flashcardPct: null, cohortPct: null },
  ],
  osce: [
    { caseId: "C001", totalScore: 32, scoreMax: 40, passed: true, score100: 80, safe: true, missedCritical: [], dateStr: "2026-07-10" },
    { caseId: "C002", totalScore: 18, scoreMax: 40, passed: false, score100: 45, safe: false, missedCritical: ["Did not check IOP"], dateStr: "2026-07-11" },
  ],
  weakTopics: ["refraction"],
  missedFindings: ["Allergy status not confirmed"],
  note: "Good progress overall.",
  activity: [{ dateStr: "2026-07-12", topic: "Glaucoma" }],
};

const html = buildStudentReportHtml(data);

// 1) A complete, standalone HTML document.
assert.ok(typeof html === "string", "must return a string");
assert.ok(html.trim().toLowerCase().startsWith("<!doctype html>"), "must start with <!doctype html>");
assert.ok(/<\/html>\s*$/i.test(html.trim()), "must close the html document");

// 2) Fully self-contained — no external resources of any kind.
assert.ok(!/\b(src|href)\s*=\s*["']https?:/i.test(html), "must not reference external http(s) src/href");
assert.ok(!/<link\b/i.test(html), "must not use <link> to external stylesheets");
assert.ok(!/<script\b[^>]*\bsrc\b/i.test(html), "must not load external scripts");

// 3) Title + identity + vitals + topics + OSCE render.
assert.ok(html.includes("EyeBot — Student Report — Test Student"), "missing report <title>");
for (const bit of ["Test Student", "test@snec.edu", "glaucoma", "refraction", "82%", "C001", "Did not check IOP", "Good progress overall."]) {
  assert.ok(html.includes(bit), `content missing: ${bit}`);
}

// 4) The @media print rules are present (print → Save as PDF).
assert.ok(/@media\s+print/i.test(html), "missing @media print block");
assert.ok(html.includes("break-inside"), "missing break-inside print rule");

// 5) HTML-escaping: injected markup in the free-text note must be neutralised.
const hostile = buildStudentReportHtml({ ...data, note: "<script>alert(1)</script> & <b>x</b>" });
assert.ok(hostile.includes("&lt;script&gt;"), "must escape angle brackets in the note");
assert.ok(hostile.includes("&amp;"), "must escape ampersands in the note");
assert.ok(!hostile.includes("<script>alert(1)</script>"), "must not emit a raw script tag");

console.log("student-report.test: all assertions passed");
```

- [ ] **Step 2: Run the test — expect FAIL.** `node --experimental-strip-types frontend/tests/student-report.test.mjs` → expected FAIL: `ERR_MODULE_NOT_FOUND` / cannot find `../src/aurora/lib/studentReportExport.ts` (module does not exist yet).

- [ ] **Step 3: Implement the pure builder.** Create `frontend/src/aurora/lib/studentReportExport.ts` (`esc` copied verbatim from `sessionExport.ts`, `bulletList` helper cloned, one inlined `<style>` with the same `@media print` rules — zero body padding, `break-inside:avoid`):

```ts
// frontend/src/aurora/lib/studentReportExport.ts
/* Pure builder for the per-student analytics report (the Analytics drill-down's
   "Download report" action). Clones sessionExport.ts: turns already-loaded per-student
   data into ONE self-contained, print-friendly (→ "Save as PDF"), fully HTML-escaped
   document — vitals, per-topic retention + flashcard accuracy vs cohort, OSCE results,
   weak topics, missed findings, the lecturer note, and a recent-activity summary.
   Dependency-free so it runs under Node's type-stripping in the test harness and never
   touches React/DOM. The caller (AdminStudentDetail) maps its live data into this plain
   model; this module only renders it. */

export interface StudentReportData {
  meta: {
    studentId: string; fullName: string; email: string; role: string; dateStr: string;
  };
  vitals: {
    sessions: number; streak: number; lastActive: string; velocity: string;
    cases: number; tokens: string;
  };
  topics: {
    topic: string; retentionPct: number;
    flashcardPct: number | null; cohortPct: number | null;
  }[];
  osce: {
    caseId: string; totalScore: number; scoreMax: number; passed: boolean;
    score100: number | null; safe: boolean | null; missedCritical: string[]; dateStr: string;
  }[];
  weakTopics: string[];
  missedFindings: string[];
  note: string;
  activity: { dateStr: string; topic: string }[];
}

/** Escape the five HTML-significant characters so any free text (lecturer note, missed
    findings, topic names) renders as literal text — never interpreted as markup. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bulletList(items: string[]): string {
  if (!items.length) return '<p class="muted">— none —</p>';
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

function topicRows(topics: StudentReportData["topics"]): string {
  if (!topics.length) return '<tr><td class="muted">— no topic data —</td></tr>';
  return topics
    .map((t) => {
      const fc = t.flashcardPct == null ? "—" : `${esc(t.flashcardPct)}%`;
      const co = t.cohortPct == null ? "—" : `${esc(t.cohortPct)}%`;
      return `<tr>
        <td>${esc(t.topic.replace(/_/g, " "))}</td>
        <td class="num ${t.retentionPct < 65 ? "weak" : ""}">${esc(t.retentionPct)}%</td>
        <td class="num">${fc}</td>
        <td class="num muted">${co}</td>
      </tr>`;
    })
    .join("");
}

function osceRows(osce: StudentReportData["osce"]): string {
  if (!osce.length) return '<tr><td class="muted">— no case attempts —</td></tr>';
  return osce
    .map((c) => {
      const score = c.score100 == null ? `${esc(c.totalScore)} / ${esc(c.scoreMax)}` : `${esc(c.score100)} / 100`;
      const safety = c.safe == null ? "—" : c.safe ? "🛡 safe" : "⚠ unsafe";
      const missed = c.missedCritical.length ? esc(c.missedCritical.join("; ")) : "—";
      return `<tr>
        <td>${esc(c.caseId)}</td>
        <td class="num">${score}</td>
        <td><span class="pill ${c.passed ? "ok" : "no"}">${c.passed ? "Pass" : "Fail"}</span></td>
        <td class="${c.safe === false ? "weak" : ""}">${safety}</td>
        <td>${missed}</td>
        <td class="ph">${esc(c.dateStr)}</td>
      </tr>`;
    })
    .join("");
}

function activityRows(activity: StudentReportData["activity"]): string {
  if (!activity.length) return '<p class="muted">— no recent activity —</p>';
  return `<table>${activity
    .map((a) => `<tr><td class="ph">${esc(a.dateStr)}</td><td>${esc(a.topic || "—")}</td></tr>`)
    .join("")}</table>`;
}

export function buildStudentReportHtml(data: StudentReportData): string {
  const { meta, vitals, topics, osce, weakTopics, missedFindings, note, activity } = data;

  // session_count over-counts (spec §8.4) — label it "activity events", not "sessions".
  const vitalTiles = [
    { label: "Activity events", val: vitals.sessions },
    { label: "Streak", val: `${vitals.streak}d` },
    { label: "Cases", val: vitals.cases },
    { label: "Tokens", val: vitals.tokens },
    { label: "Velocity", val: vitals.velocity },
    { label: "Last active", val: vitals.lastActive || "—" },
  ]
    .map((t) => `<div class="tile"><div class="tv">${esc(t.val)}</div><div class="tl">${esc(t.label)}</div></div>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>EyeBot — Student Report — ${esc(meta.fullName)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a1a; background: #fff; margin: 0; padding: 32px; max-width: 900px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .04em; color: #555; border-bottom: 1px solid #e2e2e2; padding-bottom: 6px; margin: 28px 0 12px; }
  .meta { color: #555; font-size: 13px; margin-bottom: 4px; }
  .tiles { display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0; }
  .tile { border: 1px solid #e2e2e2; border-radius: 8px; padding: 8px 14px; min-width: 110px; }
  .tv { font-size: 20px; font-weight: 700; }
  .tl { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #888; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border-bottom: 1px solid #eee; padding: 5px 8px; vertical-align: top; text-align: left; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #888; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .weak { color: #c0392b; font-weight: 700; }
  .ph { color: #888; font-size: 12px; white-space: nowrap; }
  .pill { padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .pill.ok { background: #e9f7ef; color: #1a8f4c; } .pill.no { background: #fdecec; color: #c0392b; }
  ul { margin: 4px 0 4px 18px; padding: 0; } li { margin: 2px 0; }
  .muted { color: #999; font-style: italic; }
  .note { background: #f4f0ff; padding: 8px 12px; border-radius: 6px; white-space: pre-wrap; }
  @media print { body { padding: 0; } h2 { break-after: avoid; } tr, .tile { break-inside: avoid; } }
</style>
</head>
<body>
  <h1>EyeBot — Student Report</h1>
  <div class="meta"><b>${esc(meta.fullName)}</b> · ${esc(meta.email)} · ${esc(meta.role)}</div>
  <div class="meta">Student ${esc(meta.studentId)} · Generated ${esc(meta.dateStr)}</div>

  <h2>Vitals</h2>
  <div class="tiles">${vitalTiles}</div>

  <h2>Per-topic retention &amp; flashcard accuracy</h2>
  <table>
    <tr><th>Topic</th><th class="num">Retention</th><th class="num">Flashcards</th><th class="num">Cohort avg</th></tr>
    ${topicRows(topics)}
  </table>

  <h2>OSCE results</h2>
  <table>
    <tr><th>Case</th><th class="num">Score</th><th>Result</th><th>Safety</th><th>Missed critical</th><th>Date</th></tr>
    ${osceRows(osce)}
  </table>

  <h2>Weak topics</h2>
  ${bulletList(weakTopics)}

  <h2>Consistently missed findings</h2>
  ${bulletList(missedFindings)}

  <h2>Lecturer note</h2>
  ${note.trim() ? `<div class="note">${esc(note)}</div>` : '<p class="muted">— none —</p>'}

  <h2>Recent activity</h2>
  ${activityRows(activity)}
</body>
</html>`;
}
```

- [ ] **Step 4: Run the test — expect PASS.** `node --experimental-strip-types frontend/tests/student-report.test.mjs` → expected PASS: prints `student-report.test: all assertions passed`, exit 0.

- [ ] **Step 5: Commit.** Stage ONLY the two new files and commit:

```bash
git add frontend/src/aurora/lib/studentReportExport.ts frontend/tests/student-report.test.mjs
git commit -m "$(cat <<'EOF'
feat(analytics): pure self-contained per-student HTML report builder + Node test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task P6.2: Wire "Download report (HTML)" into the Analytics drill-down

- [ ] **Step 1: Import the builder.** In `frontend/src/aurora/screens/AdminStudentDetail.tsx`, add the import beside the existing ones (after the `EngagementBlock` import at L7):

```ts
import { EngagementBlock } from "@/aurora/components/EngagementBlock";
import { buildStudentReportHtml, type StudentReportData } from "@/aurora/lib/studentReportExport";
```

- [ ] **Step 2: Widen `CaseRow`/`DetailData` additively for the Tier-2 fields.** Replace the current interface block (L9–16) — the new fields are all optional so the file typechecks against today's backend and lights up once Phase 5's migration/detail endpoint provides them:

```ts
interface Session { session_id: string; timestamp: string; topic: string; token_count: number; model: string; }
interface CaseRow {
  case_id: string; total_score: number; passed: boolean; completed_at: string;
  score_100?: number; safe?: boolean; missed_critical?: string[]; // Tier-2 (migration NNN_case_progress_grade), graceful until applied
}
interface DetailData {
  student_id: string; full_name: string; email: string; role: string;
  session_count: number; streak: number; last_active: string; learning_velocity: string;
  weak_topics: string[]; missed_findings: string[]; retention_scores: Record<string, number>;
  supervisor_note: string; sessions: Session[]; cases: CaseRow[]; total_tokens: number;
  flashcard_accuracy?: Record<string, number>; cohort_retention?: Record<string, number>; // Tier-2 per-topic flashcard accuracy + cohort avg, graceful
}
```

- [ ] **Step 3: Add the `handleDownloadReport` mapper + download recipe.** In `AdminStudentDetail`, insert this function immediately after `saveNote` (after L53, before the `return (`) — it maps the already-loaded `data` + live `note` into `StudentReportData` and reuses the `Blob → createObjectURL → <a download> → revoke(4s)` recipe from `CaseSession.handleSave`:

```ts
  // Map the already-loaded per-student data (no fetch) into the report model and download
  // it as one self-contained, print-to-PDF HTML file. Re-runnable (unlike the one-time
  // OSCE save) — filename EyeBot-Student-<id8>-<yyyy-mm-dd>.html.
  const handleDownloadReport = () => {
    if (!data) return;
    const report: StudentReportData = {
      meta: {
        studentId: data.student_id, fullName: data.full_name, email: data.email,
        role: data.role, dateStr: new Date().toLocaleString(),
      },
      vitals: {
        sessions: data.session_count, streak: data.streak,
        lastActive: data.last_active?.slice(0, 10) || "", velocity: data.learning_velocity,
        cases: data.cases.length, tokens: fmtTokens(data.total_tokens),
      },
      topics: Object.entries(data.retention_scores).map(([topic, score]) => ({
        topic,
        retentionPct: Math.round(score * 100),
        flashcardPct: data.flashcard_accuracy?.[topic] != null ? Math.round(data.flashcard_accuracy[topic] * 100) : null,
        cohortPct: data.cohort_retention?.[topic] != null ? Math.round(data.cohort_retention[topic] * 100) : null,
      })),
      osce: data.cases.map((c) => ({
        caseId: c.case_id, totalScore: c.total_score, scoreMax: 40, passed: c.passed,
        score100: c.score_100 ?? null, safe: c.safe ?? null,
        missedCritical: c.missed_critical ?? [], dateStr: c.completed_at?.slice(0, 10) || "",
      })),
      weakTopics: data.weak_topics,
      missedFindings: data.missed_findings,
      note,
      activity: data.sessions.slice(0, 12).map((s) => ({ dateStr: s.timestamp?.slice(0, 10) || "", topic: s.topic })),
    };
    const blob = new Blob([buildStudentReportHtml(report)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `EyeBot-Student-${data.student_id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
```

- [ ] **Step 4: Add the download button beside "Save note".** Replace the current single-button block (L180–182) with a flex row carrying both actions:

```tsx
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" className="aurora-btn-ghost" onClick={saveNote} disabled={savingNote}>
                    {noteSaved ? "Saved" : savingNote ? "Saving…" : "Save note"}
                  </button>
                  <button type="button" className="aurora-btn-ghost" onClick={handleDownloadReport}>
                    Download report (HTML)
                  </button>
                </div>
```

- [ ] **Step 5: Typecheck + build — expect PASS.** `cd frontend && npm run typecheck && npm run build` → expected PASS: `tsc --noEmit` reports no errors (optional Tier-2 fields resolve cleanly) and `next build` completes. Re-run the unit test to confirm no regression: `node --experimental-strip-types frontend/tests/student-report.test.mjs` → `all assertions passed`.

- [ ] **Step 6: Commit.** Stage ONLY the edited screen:

```bash
git add frontend/src/aurora/screens/AdminStudentDetail.tsx
git commit -m "$(cat <<'EOF'
feat(analytics): wire "Download report (HTML)" into the student drill-down

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7 — Docs, design-lock, rollout & final verification

**Files:**
- `docs/ARCHITECTURE.md` — role/endpoint map: `student|trainer|admin`, `require_staff` vs `require_admin`, `/analytics`, retired console.
- `docs/SECURITY.md` — new **Roles & authorization** section (guard split, trainer = admin-analytics-minus-provisioning, legacy `supervisor→trainer` normalisation).
- `docs/design-locks.md` — new criterion-named lock for the Analytics dashboard + homepage pool toggle.
- `tools/db/migrations/APPLIED.md` — flip `010_flashcard_attempts.sql` / `011_case_progress_grade.sql` PENDING → applied during rollout.
- (verify-only, no edits) `tools/shared/jwt_utils.py`, `tools/api/routers/admin.py`, `frontend/src/aurora/screens/Analytics.tsx`, `frontend/src/aurora/lib/studentReportExport.ts`, `scripts/start-harness.sh`.

> These are all Phase-7 deliverables. This phase must run **last** — the doc/rollout claims below are only true once Phases 1–6 have landed. Every grep "test" below is run from repo root; on Windows use the Bash tool for the POSIX `grep` snippets (per CLAUDE.md the Bash tool is POSIX-only).

---

### Task P7.1: ARCHITECTURE.md — role & endpoint map

- [ ] **Step 1: Failing check.** Run — expect it to print `0` (the new guard name isn't in the doc yet, so this FAILS):
  ```bash
  grep -c "require_staff" docs/ARCHITECTURE.md
  ```

- [ ] **Step 2: Rewrite the API-surface rows.** In `docs/ARCHITECTURE.md`, replace the two admin/supervisor rows (lines 88–89, verbatim below) so the read/write guard split is explicit:

  Replace:
  ```markdown
  | GET/POST | `/api/admin/*` (roster, promote, CSV, tokens) | **admin** |
  | GET/POST | `/api/supervisor/*` (cohort, at-risk, reports, digest) | **supervisor/admin** |
  ```
  with:
  ```markdown
  | GET | `/api/admin/*` reads (roster, students, activity, student detail, token-summary) | **staff** |
  | POST/DELETE | `/api/admin/approved` · `/upload-csv` · `/promote` (add/remove/provision) | **admin** |
  | GET/POST | `/api/supervisor/*` (cohort, at-risk, reports, digest) | **staff** |
  | PATCH | `/api/profile/role` (content-pool toggle) | **staff** |
  ```

- [ ] **Step 3: Rewrite the enforcement paragraph.** Replace lines 92–93 (verbatim):
  ```markdown
  Role enforcement is via the `require_admin` / `require_supervisor` dependencies
  in `jwt_utils.py`; every admin/supervisor route depends on them.
  ```
  with:
  ```markdown
  Top-level roles are **`student` · `trainer` · `admin`** — the old `supervisor`
  role is removed (a lingering `supervisors.role == "supervisor"` is normalised to
  `trainer` at login). Enforcement uses two dependencies in `jwt_utils.py`:
  `require_staff` (`{admin, trainer}`) gates the read-only analytics routes
  (`/api/supervisor/*` and the `/api/admin/*` reads); `require_admin` (`{admin}`)
  keeps add/remove/CSV/promote admin-only. Trainers and admins run the **same light
  student app** plus a content-pool toggle and the dark `/analytics` page (a Next
  route backed by the `require_staff` endpoints); the old dark admin/supervisor
  console is retired. The effective content pool is `current_user["student_role"]`
  (OA·PSA vs OT), derived server-side from `student_profiles.role`.
  ```

- [ ] **Step 4: Verify PASS.** Re-run `grep -c "require_staff" docs/ARCHITECTURE.md` — expect `≥1` (now PASSES). Also confirm the stale term is gone: `grep -c "require_supervisor" docs/ARCHITECTURE.md` should print `0`.

- [ ] **Step 5: Commit.** Stage only this file:
  ```bash
  git add docs/ARCHITECTURE.md
  git commit -m "docs(trainer): update ARCHITECTURE role/endpoint map (student|trainer|admin, require_staff)

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task P7.2: SECURITY.md — guard split & legacy normalisation

- [ ] **Step 1: Failing check.** Run — expect `0` (FAILS, section not written yet):
  ```bash
  grep -c "Roles & authorization" docs/SECURITY.md
  ```

- [ ] **Step 2: Fix the identity bullet.** In `docs/SECURITY.md` replace lines 13–15 (verbatim):
  ```markdown
  - **Identity is server-derived.** Every authenticated route takes the user from
    `current_user["sub"]` (the JWT), never from the request body. Role guards
    (`require_admin`, `require_supervisor`) protect privileged routes.
  ```
  with:
  ```markdown
  - **Identity is server-derived.** Every authenticated route takes the user from
    `current_user["sub"]` (the JWT), never from the request body. Role guards
    (`require_admin`, `require_staff`) protect privileged routes (see **Roles &
    authorization** below).
  ```

- [ ] **Step 3: Insert the new section.** Immediately before `## Rate limiting` (line 26), insert:
  ```markdown
  ## Roles & authorization

  Three top-level roles live in the JWT (`current_user["role"]`): **`student`**,
  **`trainer`**, and **`admin`**. Two dependency guards in
  `tools/shared/jwt_utils.py` gate privileged routes:

  - **`require_staff`** (`{admin, trainer}`) — read-only cohort/per-student
    **analytics** (`/api/supervisor/*` and the `/api/admin/*` read endpoints) plus
    the caller's own content-pool toggle (`PATCH /api/profile/role`, which edits the
    caller's own profile only).
  - **`require_admin`** (`{admin}`) — **provisioning** only: add/remove approved
    accounts, CSV import, and promote/demote. This is the single capability a
    trainer does **not** have — a trainer is *admin analytics minus provisioning*.

  The legacy **`supervisor`** role is removed. Any lingering
  `supervisors.role == "supervisor"` row is normalised to **`trainer`** at the auth
  layer (login and onboard) — a safe demotion that keeps the account logged in with
  analytics but drops provisioning. No data migration is required: the `supervisors`
  table has no CHECK constraint on `role`, so storing `"trainer"` needs no DDL. The
  effective content pool (`student_role`, OA·PSA vs OT) is derived server-side from
  `student_profiles.role` and returned by `GET /api/auth/me`, never trusted from the
  request body.

  ```

- [ ] **Step 4: Verify PASS.** `grep -c "Roles & authorization" docs/SECURITY.md` → `≥1`; `grep -c "require_supervisor" docs/SECURITY.md` → `0`.

- [ ] **Step 5: Commit.** Stage only this file:
  ```bash
  git add docs/SECURITY.md
  git commit -m "docs(trainer): SECURITY require_staff/require_admin split + supervisor->trainer normalisation

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task P7.3: design-locks.md — Analytics + homepage pool toggle lock

- [ ] **Step 1: Failing check.** Run — expect `0` (FAILS):
  ```bash
  grep -c "Trainer/Admin Analytics" docs/design-locks.md
  ```

- [ ] **Step 2: Append the lock entry.** In `docs/design-locks.md`, anchor on the final lines of the Leaderboard lock (the last two lines of the file, verbatim):
  ```markdown
  - **Out of scope**: real weekly leagues (promotion/relegation/reset — needs backend),
    rank-movement arrows (needs history).
  ```
  and replace with those same two lines **followed by** the new section:
  ```markdown
  - **Out of scope**: real weekly leagues (promotion/relegation/reset — needs backend),
    rank-movement arrows (needs history).

  ## Trainer/Admin Analytics + homepage pool toggle — LOCKED 2026-07-13
  **Direction** (approved via the trainer-role spec): trainers and admins run the
  **exact light student app** (daily check-in + mandatory first-login Eyecon gate
  included) plus **two** additions — a homepage content-pool toggle and a dedicated
  dark Analytics page. The `supervisor` role and the old dark admin/supervisor
  console (Overview/Students/Accounts/Activity) are **retired**, their reusable
  pieces repurposed inside Analytics.
  - **Pool toggle** (`PoolToggle.tsx`, rendered in `Dashboard.tsx` `.hm-topr` beside
    the Level chip, only for `role ∈ {trainer, admin}`): a **loud segmented switch
    `OA · PSA | OT`** with in-UI helper text (explains it flips which discipline's
    content they see, per the standing "explain to users" rule). A flip
    optimistically calls `setStudentRole` + `PATCH /api/profile/role` and invalidates
    the progress / flashcard / cases / leaderboard queries; the whole pool (flashcards,
    OSCE, check-in question, greeting track, leaderboard membership) follows. Students
    **never** see it; their pool stays fixed.
  - **Analytics page** (`/analytics`, `AnalyticsGuard` → `role ∈ {admin, trainer}`
    else `Navigate('/')`; screen `aurora/screens/Analytics.tsx`): keeps the light rail
    but **self-themes dark** via a scoped **`.aurora-analytics`** wrapper (the
    `.aurora-chat` pattern — a coherent dark surface inside the light shell, palette
    mirroring the retired `.console-dark` tokens); it is **not** added to the immersive
    list and **not** wrapped in `CheckInGuard`. PowerBI-style: cohort KPI band, AI
    insight banner, engagement trend, weak-topic/benchmark bars, mastery heatmap, OSCE
    safety/most-missed; searchable roster → per-student drill-down with a one-click
    **downloadable self-contained HTML report** (`studentReportExport.ts`, cloning
    `sessionExport.ts`). Charts are **bespoke dependency-free dark SVG** primitives
    (`TrendChart` / `DonutGauge` / `BarSeries` + reused `Heatmap`/`EngagementBlock`) —
    **no new npm dependency** (keeps the supply-chain audit + bundle clean).
  - **Admin-only provisioning block**: rendered only when `role === 'admin'` **and**
    backend-enforced (`require_admin`) — add account (role dropdown OA/OT/PSA/Trainer/
    Admin), CSV import, remove, promote existing email. Trainers never see it.
  - **Acceptance criteria when refining** (name the criterion you change): trainer/admin
    get the light student shell + the toggle + the Analytics link and **nothing else
    role-conditional**; the toggle is a loud `OA · PSA | OT` segment beside the Level
    chip with helper text and persists the flipped pool across reload; `/analytics`
    renders **dark** via `.aurora-analytics` (not immersive), guarded to `{admin,
    trainer}`; charts stay dependency-free SVG (no chart-library import); the report is
    fully self-contained (starts `<!doctype html>`, no external `src/href/link`, every
    value HTML-escaped, `@media print`); provisioning UI is admin-only and
    backend-enforced; students see zero change; WCAG-legible, 390px-safe, motion frozen
    under `prefers-reduced-motion` / `data-motion=reduce`.
  - Spec: `docs/superpowers/specs/2026-07-13-trainer-role-analytics-design.md`.
  ```

- [ ] **Step 3: Verify PASS.** `grep -c "Trainer/Admin Analytics" docs/design-locks.md` → `≥1`.

- [ ] **Step 4: Commit.** Stage only this file:
  ```bash
  git add docs/design-locks.md
  git commit -m "docs(trainer): design-lock the Analytics dashboard + homepage pool toggle

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task P7.4: Rollout — apply migrations + full green gate + ship order

> The two migrations `010_flashcard_attempts.sql` and `011_case_progress_grade.sql` were authored and ledgered PENDING in an earlier phase; the backend degrades gracefully until they run (default-null / graceful reads). This task applies them and gates the merge. Do **not** paste a file *path* into the Supabase SQL editor — paste the emitted SQL (per `/db-migrate`).

- [ ] **Step 1: Confirm ship order is complete.** Verify Phases 1–6 have all landed on `main` in spec §11 order — (1) backend role/guards + migrations (graceful) → (2) shell/routing consolidation → (3) toggle → (4) Analytics page → (5) report → (6) tests/docs. Run `git log --oneline -15` and confirm the phase commits are present before proceeding.

- [ ] **Step 2: Lint both migrations via `/db-migrate`.** Invoke the `db-migrate` skill on `tools/db/migrations/010_flashcard_attempts.sql`, then on `011_case_progress_grade.sql`. Confirm each emits PG-safe DDL (no `ADD CONSTRAINT IF NOT EXISTS` / `CREATE POLICY IF NOT EXISTS`) and copy the paste-ready SQL it prints.

- [ ] **Step 3: Apply in Supabase.** Paste the emitted SQL for `010` into the Supabase SQL editor and run; then `011`. Verify: `flashcard_attempts` table exists, and `case_progress` now has `score_100`, `safe`, `consult_technique`, `judgement_safety`, `missed_critical`, `coaching`.

- [ ] **Step 4: Flip the ledger.** In `tools/db/migrations/APPLIED.md`, change the two PENDING lines to applied, e.g.:
  ```markdown
  - [x] 010_flashcard_attempts.sql — applied 2026-07-13 (per-topic flashcard accuracy + attempt log)
  - [x] 011_case_progress_grade.sql — applied 2026-07-13 (OSCE score_100/safe/sub-scores/missed_critical/coaching)
  ```

- [ ] **Step 5: Backend gate — expect PASS.** `MOCK_MODE` is auto (no `GEMINI_API_KEY`):
  ```bash
  python -m pytest -q
  ```

- [ ] **Step 6: Frontend gate — expect PASS.**
  ```bash
  cd frontend && npm run typecheck && npm run build
  ```

- [ ] **Step 7: Visual harness — expect PASS (green aurora asserts).**
  ```bash
  bash scripts/start-harness.sh aurora
  ```

- [ ] **Step 8: Commit the ledger + push.** Only after Steps 5–7 are green (`main` auto-deploys to Render):
  ```bash
  git add tools/db/migrations/APPLIED.md
  git commit -m "chore(trainer): ledger 010/011 migrations applied

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  git fetch origin && git rev-list --left-right --count origin/main...main
  git push origin HEAD:main
  ```
  (If the `rev-list` shows `main` is behind, reconcile before pushing — the repo is edited by concurrent sessions.)

---

### Task P7.5: Final end-to-end behavioral verify

> Per `/ship-check`: a real behavioral verify on the running app, not just green tests. Serve the built app and drive the three role journeys. Reuse the harness's known-good standalone serve.

- [ ] **Step 1: Serve the built app.** From the Phase-7.4 build:
  ```bash
  bash scripts/start-harness.sh serve
  ```
  (Serves `node .next/standalone/server.js` with static/public copied in — the one known-good recipe; never `next start`.)

- [ ] **Step 2: Trainer journey.** Log in as a `trainer` fixture. Verify, in order:
  - the **light** student shell + Atlas Rail load (no dark console); an **Analytics** nav item is present.
  - the homepage shows the loud **`OA · PSA | OT`** toggle beside the Level chip; flip it → the flashcard topics / OSCE cases / leaderboard membership change to the OT pool, and the choice **persists across a reload** (server-truth `student_role`).
  - open **`/analytics`** → it renders **dark** (`.aurora-analytics`), charts populate from live endpoints, roster search works, and a per-student drill-down offers **Download report (HTML)** — download one and confirm it opens offline and Print→Save-as-PDF works.
  - confirm **no** provisioning block is visible (trainer).

- [ ] **Step 3: Admin journey.** Log in as an `admin` fixture. On `/analytics`, confirm the **admin-only provisioning block** is present: **add** a student (role dropdown incl. Trainer/Admin) and **remove** one; confirm the roster updates. Confirm a `POST /api/admin/approved` as a trainer would 403 (already covered by pytest in the tests phase — spot-check the network tab if in doubt).

- [ ] **Step 4: Student parity — unchanged.** Log in as a `student` fixture. Confirm: **no** pool toggle, **no** Analytics link, `/analytics` redirects to `/`, and the daily check-in + first-login Eyecon gate behave exactly as before. Nothing role-conditional leaks into the student experience.

- [ ] **Step 5: Record the verify.** No code change — report the observed results (all four journeys pass) as the completion evidence. If any journey fails, stop and route back to the owning phase; do not claim done. Stop the harness:
  ```bash
  bash scripts/start-harness.sh stop
  ```
