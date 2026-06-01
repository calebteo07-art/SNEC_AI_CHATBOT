# Phase 2: Remaining Sheets Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `snec_approved_students`, `snec_consent`, and `snec_supervisors` from Google Sheets to Supabase PostgreSQL, eliminating the last three O(n) Sheets scans that run on every login.

**Architecture:** Same pattern as Phase 1 — new tables in `db.py`, routers switch from `get_rows_async`/`append_row_async` to `await db.*`, `identity.py` becomes fully async (its sync gsheets calls currently block the event loop). All three tables are upsert-safe so the one-time migration script is idempotent.

**Tech Stack:** `supabase-py` 2.x `AsyncClient`, `pytest-asyncio`, FastAPI async route handlers.

---

## Files Modified / Created

| Action | Path | Purpose |
|--------|------|---------|
| Manual | Supabase SQL Editor | Create 3 PostgreSQL tables |
| Modify | `tools/shared/db.py` | Add helpers for approved_students, student_consent, supervisors |
| Modify | `tests/shared/test_db.py` | Tests for new db.py helpers |
| Modify | `tools/shared/identity.py` | Rewrite sync Sheets calls as async db calls |
| Create | `tests/shared/test_identity.py` | Tests for async identity functions |
| Modify | `tools/api/routers/auth.py` | Replace gsheets calls; await identity functions |
| Modify | `tools/api/routers/admin.py` | Replace gsheets calls for all three tables |
| Modify | `tests/api/test_auth_endpoints.py` | Patch db.* instead of get_rows_async |
| Modify | `tests/api/test_admin_endpoints.py` | Patch db.* instead of get_rows_async |
| Create | `tools/shared/migrate_phase2.py` | One-time migration script |

---

## Task 1: Create Supabase PostgreSQL tables (manual step)

**Files:** Supabase SQL Editor (no code files)

- [ ] **Step 1: Open Supabase SQL Editor**

Log in to https://supabase.com, open your project, navigate to **SQL Editor**.

- [ ] **Step 2: Run the schema SQL**

Paste and execute:

```sql
CREATE TABLE approved_students (
    email           text PRIMARY KEY,
    full_name       text NOT NULL DEFAULT '',
    role            text NOT NULL DEFAULT '',
    added_by        text NOT NULL DEFAULT '',
    added_at        timestamptz,
    student_id      uuid
);
CREATE INDEX ON approved_students (student_id);

CREATE TABLE student_consent (
    student_id      uuid PRIMARY KEY,
    student_name    text NOT NULL DEFAULT '',
    email           text NOT NULL,
    consent_date    timestamptz,
    pdpa_version    text NOT NULL DEFAULT '',
    withdrawn_date  timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON student_consent (email);

CREATE TABLE supervisors (
    email           text PRIMARY KEY,
    supervisor_id   text NOT NULL DEFAULT '',
    cohort          text NOT NULL DEFAULT 'SNEC',
    role            text NOT NULL DEFAULT 'supervisor'
);
```

- [ ] **Step 3: Verify**

In Supabase **Table Editor**, confirm all three tables appear with no rows yet.

---

## Task 2: Write failing tests for new db.py helpers

**Files:**
- Modify: `tests/shared/test_db.py`

- [ ] **Step 1: Append the new tests to tests/shared/test_db.py**

Add these tests after the existing ones:

```python
# ── approved_students ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_approved_returns_row_when_found():
    row = {"email": "a@test.com", "full_name": "Alice", "role": "OA", "student_id": None}
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([row]))):
        result = await db.get_approved("a@test.com")
    assert result == row


@pytest.mark.asyncio
async def test_get_approved_returns_none_when_not_found():
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([]))):
        result = await db.get_approved("missing@test.com")
    assert result is None


@pytest.mark.asyncio
async def test_get_all_approved_returns_list():
    rows = [{"email": "a@test.com"}, {"email": "b@test.com"}]
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client(rows))):
        result = await db.get_all_approved()
    assert len(result) == 2


@pytest.mark.asyncio
async def test_upsert_approved_writes_to_approved_students_table():
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.upsert_approved("new@test.com", full_name="New", role="OT")
    client.table.assert_called_with("approved_students")
    payload = client.table.return_value.upsert.call_args[0][0]
    assert payload["email"] == "new@test.com"
    assert payload["role"] == "OT"


@pytest.mark.asyncio
async def test_delete_approved_returns_true_when_deleted():
    client = _make_client([{"email": "gone@test.com"}])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        result = await db.delete_approved("gone@test.com")
    assert result is True


@pytest.mark.asyncio
async def test_delete_approved_returns_false_when_not_found():
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        result = await db.delete_approved("nobody@test.com")
    assert result is False


# ── student_consent ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_consent_by_email_returns_row():
    row = {"student_id": "stu-001", "email": "a@test.com", "student_name": "Alice", "consent_date": None}
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([row]))):
        result = await db.get_consent_by_email("a@test.com")
    assert result["student_id"] == "stu-001"


@pytest.mark.asyncio
async def test_get_consent_by_email_returns_none_when_not_found():
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([]))):
        result = await db.get_consent_by_email("nobody@test.com")
    assert result is None


@pytest.mark.asyncio
async def test_get_consent_by_student_id_returns_row():
    row = {"student_id": "stu-001", "email": "a@test.com", "consent_date": "2026-01-01"}
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([row]))):
        result = await db.get_consent_by_student_id("stu-001")
    assert result["email"] == "a@test.com"


@pytest.mark.asyncio
async def test_get_all_consent_returns_list():
    rows = [{"student_id": "s1"}, {"student_id": "s2"}]
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client(rows))):
        result = await db.get_all_consent()
    assert len(result) == 2


@pytest.mark.asyncio
async def test_upsert_consent_writes_to_student_consent_table():
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.upsert_consent("stu-001", student_name="Alice", email="a@test.com")
    client.table.assert_called_with("student_consent")
    payload = client.table.return_value.upsert.call_args[0][0]
    assert payload["student_id"] == "stu-001"
    assert payload["email"] == "a@test.com"


# ── supervisors ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_supervisor_returns_row():
    row = {"email": "sup@snec.com", "role": "supervisor"}
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([row]))):
        result = await db.get_supervisor("sup@snec.com")
    assert result["role"] == "supervisor"


@pytest.mark.asyncio
async def test_get_supervisor_returns_none_when_not_found():
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([]))):
        result = await db.get_supervisor("nobody@snec.com")
    assert result is None


@pytest.mark.asyncio
async def test_get_all_supervisors_returns_list():
    rows = [{"email": "a@snec.com", "role": "supervisor"}, {"email": "b@snec.com", "role": "admin"}]
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client(rows))):
        result = await db.get_all_supervisors()
    assert len(result) == 2


@pytest.mark.asyncio
async def test_upsert_supervisor_writes_to_supervisors_table():
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.upsert_supervisor("sup@snec.com", role="admin")
    client.table.assert_called_with("supervisors")
    payload = client.table.return_value.upsert.call_args[0][0]
    assert payload["email"] == "sup@snec.com"
    assert payload["role"] == "admin"


@pytest.mark.asyncio
async def test_delete_supervisor_calls_delete_on_supervisors_table():
    client = _make_client([{"email": "sup@snec.com"}])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.delete_supervisor("sup@snec.com")
    client.table.assert_called_with("supervisors")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/shared/test_db.py -v -k "approved or consent or supervisor" 2>&1 | tail -20
```

Expected: `AttributeError: module 'tools.shared.db' has no attribute 'get_approved'`

---

## Task 3: Implement new db.py helpers

**Files:**
- Modify: `tools/shared/db.py`

- [ ] **Step 1: Append the three new sections to tools/shared/db.py**

Add after the existing `get_all_case_progress` function:

```python
# ── approved_students ─────────────────────────────────────────────────────────

async def get_approved(email: str) -> dict | None:
    """Return the approved_students row for email, or None if not found."""
    client = await _get_client()
    result = (
        await client.table("approved_students")
        .select("*")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def get_all_approved() -> list[dict]:
    """Return all rows from approved_students."""
    client = await _get_client()
    result = await client.table("approved_students").select("*").execute()
    return result.data or []


async def upsert_approved(
    email: str,
    full_name: str = "",
    role: str = "",
    added_by: str = "",
    added_at: str | None = None,
    student_id: str | None = None,
) -> None:
    """Insert or update an approved_students row."""
    client = await _get_client()
    payload: dict = {"email": email, "full_name": full_name, "role": role, "added_by": added_by}
    if added_at:
        payload["added_at"] = added_at
    if student_id:
        payload["student_id"] = student_id
    await client.table("approved_students").upsert(payload, on_conflict="email").execute()


async def update_approved(email: str, **fields) -> None:
    """Update specific fields on an approved_students row."""
    client = await _get_client()
    await client.table("approved_students").update(fields).eq("email", email).execute()


async def delete_approved(email: str) -> bool:
    """Delete an approved_students row. Returns True if a row was deleted."""
    client = await _get_client()
    result = await client.table("approved_students").delete().eq("email", email).execute()
    return len(result.data) > 0


# ── student_consent ───────────────────────────────────────────────────────────

async def get_consent_by_email(email: str) -> dict | None:
    """Return the student_consent row for email, or None."""
    client = await _get_client()
    result = (
        await client.table("student_consent")
        .select("*")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def get_consent_by_student_id(student_id: str) -> dict | None:
    """Return the student_consent row for student_id, or None."""
    client = await _get_client()
    result = (
        await client.table("student_consent")
        .select("*")
        .eq("student_id", student_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def get_all_consent() -> list[dict]:
    """Return all rows from student_consent."""
    client = await _get_client()
    result = await client.table("student_consent").select("*").execute()
    return result.data or []


async def upsert_consent(student_id: str, student_name: str, email: str) -> None:
    """Insert or update a student_consent row (core identity fields only)."""
    client = await _get_client()
    await client.table("student_consent").upsert(
        {"student_id": student_id, "student_name": student_name, "email": email},
        on_conflict="student_id",
    ).execute()


async def update_consent(student_id: str, **fields) -> None:
    """Update specific fields on a student_consent row."""
    client = await _get_client()
    await client.table("student_consent").update(fields).eq("student_id", student_id).execute()


# ── supervisors ───────────────────────────────────────────────────────────────

async def get_supervisor(email: str) -> dict | None:
    """Return the supervisors row for email, or None."""
    client = await _get_client()
    result = (
        await client.table("supervisors")
        .select("*")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def get_all_supervisors() -> list[dict]:
    """Return all rows from supervisors."""
    client = await _get_client()
    result = await client.table("supervisors").select("*").execute()
    return result.data or []


async def upsert_supervisor(
    email: str,
    role: str = "supervisor",
    cohort: str = "SNEC",
    supervisor_id: str = "",
) -> None:
    """Insert or update a supervisors row."""
    client = await _get_client()
    await client.table("supervisors").upsert(
        {"email": email, "role": role, "cohort": cohort, "supervisor_id": supervisor_id},
        on_conflict="email",
    ).execute()


async def delete_supervisor(email: str) -> None:
    """Delete a supervisors row."""
    client = await _get_client()
    await client.table("supervisors").delete().eq("email", email).execute()
```

- [ ] **Step 2: Run the new tests to verify they pass**

```bash
python -m pytest tests/shared/test_db.py -v -k "approved or consent or supervisor" 2>&1 | tail -20
```

Expected: all 16 new tests pass.

- [ ] **Step 3: Run the full suite to check for regressions**

```bash
python -m pytest tests/ -q 2>&1 | tail -5
```

Expected: 115 passed (same count as before).

- [ ] **Step 4: Commit**

```bash
git add tools/shared/db.py tests/shared/test_db.py
git commit -m "feat: add db.py helpers for approved_students, student_consent, supervisors"
```

---

## Task 4: Rewrite identity.py to async + write tests

**Files:**
- Modify: `tools/shared/identity.py`
- Create: `tests/shared/test_identity.py`

- [ ] **Step 1: Write the failing test file**

Create `tests/shared/test_identity.py`:

```python
"""Unit tests for tools/shared/identity.py — async Supabase identity manager."""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_get_or_create_student_returns_existing_id():
    existing = {"student_id": "stu-abc", "email": "a@test.com", "student_name": "Alice"}
    with patch("tools.shared.db.get_consent_by_email", new=AsyncMock(return_value=existing)):
        from tools.shared.identity import get_or_create_student
        result = await get_or_create_student("Alice", "a@test.com")
    assert result == "stu-abc"


@pytest.mark.asyncio
async def test_get_or_create_student_creates_new_row_when_missing():
    with patch("tools.shared.db.get_consent_by_email", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.upsert_consent", new=AsyncMock()) as mock_upsert:
        from tools.shared.identity import get_or_create_student
        result = await get_or_create_student("Bob", "b@test.com")
    assert len(result) == 36  # UUID format
    mock_upsert.assert_called_once()
    call_kwargs = mock_upsert.call_args
    assert call_kwargs[1]["student_name"] == "Bob"
    assert call_kwargs[1]["email"] == "b@test.com"


@pytest.mark.asyncio
async def test_has_consented_returns_false_when_no_row():
    with patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=None)):
        from tools.shared.identity import has_consented
        result = await has_consented("stu-001")
    assert result is False


@pytest.mark.asyncio
async def test_has_consented_returns_false_when_no_consent_date():
    row = {"student_id": "stu-001", "consent_date": None, "withdrawn_date": None}
    with patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=row)):
        from tools.shared.identity import has_consented
        result = await has_consented("stu-001")
    assert result is False


@pytest.mark.asyncio
async def test_has_consented_returns_true_when_consent_date_set():
    row = {"student_id": "stu-001", "consent_date": "2026-01-01T00:00:00Z", "withdrawn_date": None}
    with patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=row)):
        from tools.shared.identity import has_consented
        result = await has_consented("stu-001")
    assert result is True


@pytest.mark.asyncio
async def test_has_consented_returns_false_when_withdrawn():
    row = {"student_id": "stu-001", "consent_date": "2026-01-01T00:00:00Z", "withdrawn_date": "2026-02-01T00:00:00Z"}
    with patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=row)):
        from tools.shared.identity import has_consented
        result = await has_consented("stu-001")
    assert result is False


@pytest.mark.asyncio
async def test_record_consent_sets_consent_date_and_pdpa_version():
    with patch("tools.shared.db.update_consent", new=AsyncMock()) as mock_update:
        from tools.shared.identity import record_consent
        await record_consent("stu-001")
    call_kwargs = mock_update.call_args[1]
    assert call_kwargs["pdpa_version"] == "1.0"
    assert "consent_date" in call_kwargs
    assert call_kwargs["withdrawn_date"] is None


@pytest.mark.asyncio
async def test_withdraw_consent_sets_withdrawn_date():
    with patch("tools.shared.db.update_consent", new=AsyncMock()) as mock_update:
        from tools.shared.identity import withdraw_consent
        await withdraw_consent("stu-001")
    call_kwargs = mock_update.call_args[1]
    assert "withdrawn_date" in call_kwargs
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/shared/test_identity.py -v 2>&1 | tail -10
```

Expected: import error or `AttributeError` — identity functions are still sync.

- [ ] **Step 3: Rewrite tools/shared/identity.py**

Replace the full content of `tools/shared/identity.py` with:

```python
#!/usr/bin/env python3
"""Async student identity manager — handles student IDs and PDPA consent.

All functions are async and use the Supabase student_consent table.

Usage:
    from tools.shared.identity import get_or_create_student, has_consented, record_consent
    student_id = await get_or_create_student(full_name, email)
"""
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db
from tools.shared.audit_log import log

PDPA_VERSION = "1.0"


async def get_or_create_student(name: str, email: str) -> str:
    """Look up a student by email; create a new consent row if not found.
    Returns the student_id UUID string.
    """
    existing = await db.get_consent_by_email(email)
    if existing:
        student_id = existing["student_id"]
        log("student_lookup", student_id=student_id, feature="identity", detail="returning student")
        return student_id

    student_id = str(uuid.uuid4())
    await db.upsert_consent(student_id, student_name=name, email=email)
    log("student_created", student_id=student_id, feature="identity", detail="new student registered")
    return student_id


async def has_consented(student_id: str) -> bool:
    """Return True if the student has a recorded consent_date and no withdrawn_date."""
    row = await db.get_consent_by_student_id(student_id)
    if not row:
        return False
    return bool(row.get("consent_date")) and not bool(row.get("withdrawn_date"))


async def record_consent(student_id: str) -> None:
    """Record PDPA consent for a student."""
    now = datetime.now(timezone.utc).isoformat()
    await db.update_consent(
        student_id,
        consent_date=now,
        pdpa_version=PDPA_VERSION,
        withdrawn_date=None,
    )
    log("consent_recorded", student_id=student_id, feature="identity",
        detail=f"pdpa_version={PDPA_VERSION}")


async def withdraw_consent(student_id: str) -> None:
    """Record consent withdrawal for a student."""
    now = datetime.now(timezone.utc).isoformat()
    await db.update_consent(student_id, withdrawn_date=now)
    log("consent_withdrawn", student_id=student_id, feature="identity", detail="")
```

- [ ] **Step 4: Run identity tests to verify they pass**

```bash
python -m pytest tests/shared/test_identity.py -v 2>&1 | tail -12
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add tools/shared/identity.py tests/shared/test_identity.py
git commit -m "feat: rewrite identity.py as async using Supabase student_consent"
```

---

## Task 5: Update auth.py

**Files:**
- Modify: `tools/api/routers/auth.py`

auth.py currently calls `get_rows_async` for all three sheets (8 call-sites) plus sync `get_or_create_student`, `has_consented`, `record_consent` (3 call-sites that now need `await`).

- [ ] **Step 1: Replace the gsheets import line**

Find:
```python
from tools.shared.gsheets import get_rows_async, update_row_async
```

Replace with:
```python
from tools.shared.gsheets import update_row_async
```

(`update_row_async` is still used for linking student_id back to approved record during onboard — that column stays in Sheets for now; it will be removed when the Sheets table is fully retired.)

Actually, after Phase 2 `snec_approved_students` is in Supabase so `update_row_async` for it is no longer needed either. Remove the import entirely:

```python
# remove: from tools.shared.gsheets import get_rows_async, update_row_async
```

- [ ] **Step 2: Update auth_login — replace all three Sheets lookups**

Find the `auth_login` function. Replace every `get_rows_async(...)` call:

```python
# OLD approved check:
approved = await get_rows_async("snec_approved_students", filters={"email": email})
if not approved:
    sup_rows = await get_rows_async("snec_supervisors", filters={"email": email})
    if email != SUPER_ADMIN_EMAIL and not sup_rows:
        raise HTTPException(status_code=403, detail="Not in approved list. Contact your administrator.")
    approved_role = "admin" if (email == SUPER_ADMIN_EMAIL or (sup_rows and sup_rows[0].get("role") == "admin")) else "supervisor"
    approved_student_role = ""
else:
    approved_role = "student"
    approved_student_role = approved[0].get("role", "")

# NEW:
approved_row = await db.get_approved(email)
if not approved_row:
    sup_row = await db.get_supervisor(email)
    if email != SUPER_ADMIN_EMAIL and not sup_row:
        raise HTTPException(status_code=403, detail="Not in approved list. Contact your administrator.")
    approved_role = "admin" if (email == SUPER_ADMIN_EMAIL or (sup_row and sup_row.get("role") == "admin")) else "supervisor"
    approved_student_role = ""
else:
    approved_role = "student"
    approved_student_role = approved_row.get("role", "")
```

Further down in `auth_login`, replace the supervisor re-check:
```python
# OLD:
sup_rows = await get_rows_async("snec_supervisors", filters={"email": email})
if sup_rows:
    final_role = sup_rows[0].get("role") or "supervisor"

# NEW:
sup_row = await db.get_supervisor(email)
if sup_row:
    final_role = sup_row.get("role") or "supervisor"
```

Also replace the `full_name` line:
```python
# OLD:
full_name = approved[0].get("full_name", email) if approved else email

# NEW:
full_name = approved_row.get("full_name", email) if approved_row else email
```

- [ ] **Step 3: Update auth_change_password — replace consent lookup**

Find in `auth_change_password`:
```python
# OLD:
consent = await get_rows_async("snec_consent", filters={"student_id": student_id})
if not consent:
    raise HTTPException(status_code=404, detail="Student not found.")
email = consent[0].get("email", "").strip().lower()

# NEW:
consent_row = await db.get_consent_by_student_id(student_id)
if not consent_row:
    raise HTTPException(status_code=404, detail="Student not found.")
email = consent_row.get("email", "").strip().lower()
```

- [ ] **Step 4: Update auth_request_reset — replace two Sheets lookups**

Find in `auth_request_reset`:
```python
# OLD:
approved = await get_rows_async("snec_approved_students", filters={"email": email})
sup_rows = await get_rows_async("snec_supervisors", filters={"email": email})
if not approved and email != SUPER_ADMIN_EMAIL and not sup_rows:

# NEW:
approved_row = await db.get_approved(email)
sup_row = await db.get_supervisor(email)
if not approved_row and email != SUPER_ADMIN_EMAIL and not sup_row:
```

- [ ] **Step 5: Update onboard — replace all Sheets calls and add await to identity functions**

Find in `onboard`:

```python
# OLD:
supervisors = await get_rows_async("snec_supervisors", filters={"email": email})
if supervisors:
    role = "admin" if supervisors[0].get("role", "").lower() == "admin" else "supervisor"
# ...
approved = await get_rows_async("snec_approved_students", filters={"email": email})
# ...
if not student_role and approved[0].get("role", "").upper() in ("OA", "OT", "PSA"):
    student_role = approved[0]["role"].upper()

student_id = get_or_create_student(body.full_name.strip(), email)
if not has_consented(student_id):
    record_consent(student_id)

if role == "student":
    try:
        await update_row_async("snec_approved_students", "email", email, {"student_id": student_id})

# NEW:
sup_row = await db.get_supervisor(email)
if sup_row:
    role = "admin" if sup_row.get("role", "").lower() == "admin" else "supervisor"
# ...
approved_row = await db.get_approved(email)
# ...
if not student_role and approved_row and approved_row.get("role", "").upper() in ("OA", "OT", "PSA"):
    student_role = approved_row["role"].upper()

student_id = await get_or_create_student(body.full_name.strip(), email)
if not await has_consented(student_id):
    await record_consent(student_id)

if role == "student":
    try:
        await db.update_approved(email, student_id=student_id)
```

- [ ] **Step 6: Run the full test suite**

```bash
python -m pytest tests/ -q 2>&1 | tail -10
```

Some auth tests will fail because they still patch `get_rows_async` — these are fixed in Task 7. Expected: ~100+ pass, auth endpoint tests fail.

- [ ] **Step 7: Commit**

```bash
git add tools/api/routers/auth.py
git commit -m "feat: wire auth.py to Supabase approved_students, supervisors, student_consent"
```

---

## Task 6: Update admin.py

**Files:**
- Modify: `tools/api/routers/admin.py`

- [ ] **Step 1: Remove gsheets imports for the three migrated tables**

Find at the top of `admin.py`:
```python
from tools.shared.gsheets import append_row_async, get_rows_async, update_row_async
```

Replace with:
```python
from tools.shared.gsheets import append_row_async, get_rows_async, update_row_async
```

Keep the import for now — `snec_flashcards` and `snec_supervisor_alerts` (used by supervisor.py) still use gsheets. We'll remove only what's no longer needed at the end of this task.

- [ ] **Step 2: Update admin_list_approved**

```python
# OLD:
rows = await get_rows_async("snec_approved_students")

# NEW:
rows = await db.get_all_approved()
```

- [ ] **Step 3: Update admin_approve_student**

```python
# OLD:
existing = await get_rows_async("snec_approved_students", filters={"email": email})
# ...
_consent = await get_rows_async("snec_consent", filters={"student_id": current_user["sub"]})
admin_email = _consent[0].get("email", "") if _consent else ""
await append_row_async("snec_approved_students", {
    "email": email,
    "full_name": body.full_name.strip(),
    "role": body.role.strip().upper(),
    "added_by": admin_email,
    "added_at": datetime.now(timezone.utc).isoformat(),
    "student_id": "",
})

# NEW:
existing = await db.get_approved(email)
# ...
_consent = await db.get_consent_by_student_id(current_user["sub"])
admin_email = _consent.get("email", "") if _consent else ""
await db.upsert_approved(
    email,
    full_name=body.full_name.strip(),
    role=body.role.strip().upper(),
    added_by=admin_email,
    added_at=datetime.now(timezone.utc).isoformat(),
)
```

- [ ] **Step 4: Update admin_unapprove_student**

```python
# OLD (note: this currently uses a sync inline import):
from tools.shared.gsheets import delete_row as _dr
deleted = _dr("snec_approved_students", "email", email.lower())
if not deleted:
    raise HTTPException(status_code=404, detail="Email not found in approved list")

# NEW:
deleted = await db.delete_approved(email.lower())
if not deleted:
    raise HTTPException(status_code=404, detail="Email not found in approved list")
```

- [ ] **Step 5: Update admin_all_students**

```python
# OLD:
consent = await get_rows_async("snec_consent")
approved_rows = await get_rows_async("snec_approved_students")

# NEW:
consent = await db.get_all_consent()
approved_rows = await db.get_all_approved()
```

The column name in student_consent is `student_name` (not `full_name`). Update the join logic:
```python
# OLD:
full_name = c.get("student_name", "").strip()

# NEW (unchanged — student_consent uses student_name):
full_name = c.get("student_name", "").strip()
```

- [ ] **Step 6: Update admin_activity**

```python
# OLD:
consent = await get_rows_async("snec_consent")

# NEW:
consent = await db.get_all_consent()
```

- [ ] **Step 7: Update admin_promote**

```python
# OLD:
existing = await get_rows_async("snec_supervisors", filters={"email": email})
if existing:
    await update_row_async("snec_supervisors", "email", email, {"role": new_role})
else:
    await append_row_async("snec_supervisors", {"supervisor_id": "", "email": email, "cohort": "SNEC", "role": new_role})

# NEW (upsert handles both cases):
await db.upsert_supervisor(email, role=new_role)
```

- [ ] **Step 8: Update admin_demote**

```python
# OLD:
from tools.shared.gsheets import delete_row as _dr
_dr("snec_supervisors", "email", email.lower())

# NEW:
await db.delete_supervisor(email.lower())
```

- [ ] **Step 9: Update admin_upload_csv**

```python
# OLD:
existing = {r.get("email", "").strip().lower() for r in await get_rows_async("snec_approved_students")}
# ...
_admin_consent = await get_rows_async("snec_consent", filters={"student_id": current_user["sub"]})
admin_email = _admin_consent[0].get("email", "") if _admin_consent else current_user["sub"]
# ...
await append_row_async("snec_approved_students", {
    "email": email, "full_name": full_name, "role": role,
    "added_by": admin_email,
    "added_at": datetime.now(timezone.utc).isoformat(),
    "student_id": "",
})

# NEW:
existing = {r.get("email", "").strip().lower() for r in await db.get_all_approved()}
# ...
_admin_consent = await db.get_consent_by_student_id(current_user["sub"])
admin_email = _admin_consent.get("email", "") if _admin_consent else current_user["sub"]
# ...
await db.upsert_approved(
    email,
    full_name=full_name,
    role=role,
    added_by=admin_email,
    added_at=datetime.now(timezone.utc).isoformat(),
)
```

- [ ] **Step 10: Clean up now-unused gsheets imports in admin.py**

After all the above changes, `append_row_async`, `get_rows_async`, and `update_row_async` are no longer used in admin.py. Remove the import line entirely:

```python
# Remove this line from admin.py:
from tools.shared.gsheets import append_row_async, get_rows_async, update_row_async
```

- [ ] **Step 11: Run tests**

```bash
python -m pytest tests/ -q 2>&1 | tail -10
```

Expected: admin endpoint tests may fail (mocks still patch gsheets). These are fixed in Task 8.

- [ ] **Step 12: Commit**

```bash
git add tools/api/routers/admin.py
git commit -m "feat: wire admin.py to Supabase approved_students, supervisors, student_consent"
```

---

## Task 7: Update test_auth_endpoints.py

**Files:**
- Modify: `tests/api/test_auth_endpoints.py`

The auth tests currently patch `get_rows_async` for the three migrated sheets. After Tasks 5–6, the code calls `db.*` instead.

- [ ] **Step 1: Update test_login_success**

```python
# OLD mock_get_rows patches get_rows_async returning approved + auth rows
# NEW: patch db.get_approved and db.get_supervisor directly

def test_login_success():
    auth_row = _make_auth_row("alice@test.com", "password1")
    approved_row = _make_approved_row("alice@test.com")

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student", new=AsyncMock(return_value="stu_001")), \
         patch("tools.api.routers.auth.has_consented", new=AsyncMock(return_value=True)):
        r = client.post("/api/auth/login", json={"email": "alice@test.com", "password": "password1"})
    assert r.status_code == 200
    data = r.json()
    assert data["student_id"] == "stu_001"
    assert data["must_change"] is False
    assert data["is_new"] is False
```

- [ ] **Step 2: Update test_login_wrong_password**

```python
def test_login_wrong_password():
    auth_row = _make_auth_row("bob@test.com", "realpass")

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value={"email": "bob@test.com", "full_name": "Bob", "role": "OT"})), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)):
        r = client.post("/api/auth/login", json={"email": "bob@test.com", "password": "wrongpass"})
    assert r.status_code == 401
```

- [ ] **Step 3: Update test_login_not_approved**

```python
def test_login_not_approved():
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)):
        r = client.post("/api/auth/login", json={"email": "unknown@test.com", "password": "any"})
    assert r.status_code == 403
```

- [ ] **Step 4: Update test_login_student_promoted_to_supervisor**

```python
def test_login_student_promoted_to_supervisor():
    auth_row = _make_auth_row("promo@test.com", "pass123")
    approved_row = _make_approved_row("promo@test.com", role="OA")
    sup_row = {"email": "promo@test.com", "role": "supervisor"}

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=sup_row)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.api.routers.auth.get_or_create_student", new=AsyncMock(return_value="stu_004")), \
         patch("tools.api.routers.auth.has_consented", new=AsyncMock(return_value=True)):
        r = client.post("/api/auth/login", json={"email": "promo@test.com", "password": "pass123"})
    assert r.status_code == 200
    data = r.json()
    assert data["role"] == "supervisor"
    assert data["must_change"] is False
```

- [ ] **Step 5: Update test_change_password_success**

```python
def test_change_password_success():
    from tools.shared.auth import hash_password
    old_hash = hash_password("oldpass")
    auth_row = {"email": "carol@test.com", "password_hash": old_hash, "must_change": True}
    consent_row = {"email": "carol@test.com", "student_id": "stu_002", "student_name": "Carol"}

    with patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=consent_row)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()) as mock_upsert:
        r = client.post(
            "/api/auth/change-password",
            json={"student_id": "stu_002", "current_password": "oldpass", "new_password": "newpass123"},
            cookies=_auth_cookie("stu_002"),
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    mock_upsert.assert_called_once()
```

- [ ] **Step 6: Update test_change_password_wrong_current**

```python
def test_change_password_wrong_current():
    from tools.shared.auth import hash_password
    old_hash = hash_password("correctpass")
    auth_row = {"email": "dave@test.com", "password_hash": old_hash, "must_change": False}
    consent_row = {"email": "dave@test.com", "student_id": "stu_003", "student_name": "Dave"}

    with patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=consent_row)), \
         patch("tools.shared.db.get_auth", new=AsyncMock(return_value=auth_row)):
        r = client.post(
            "/api/auth/change-password",
            json={"student_id": "stu_003", "current_password": "wrongpass", "new_password": "newpass123"},
            cookies=_auth_cookie("stu_003"),
        )
    assert r.status_code == 401
```

- [ ] **Step 7: Update test_request_reset_returns_ok_for_approved_user**

```python
def test_request_reset_returns_ok_for_approved_user():
    approved_row = {"email": "reset@test.com", "full_name": "Reset User", "role": "OA"}

    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=approved_row)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)), \
         patch("tools.api.routers.auth.set_otp") as mock_set_otp, \
         patch("tools.shared.gmail_sender.send_email", side_effect=Exception("email disabled")):
        r = client.post("/api/auth/request-reset", json={"email": "reset@test.com"})

    assert r.status_code == 200
    assert r.json()["ok"] is True
    mock_set_otp.assert_called_once()
    assert mock_set_otp.call_args[0][0] == "reset@test.com"
```

- [ ] **Step 8: Update test_request_reset_returns_ok_for_unknown_email**

```python
def test_request_reset_returns_ok_for_unknown_email():
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_supervisor", new=AsyncMock(return_value=None)):
        r = client.post("/api/auth/request-reset", json={"email": "nobody@test.com"})
    assert r.status_code == 200
    assert r.json()["ok"] is True
```

- [ ] **Step 9: Update test_student_detail_returns_shape**

No gsheets patches needed here — `admin_student_detail` only uses `db.get_profile`, `db.get_sessions`, `db.get_case_results`. Verify no `get_rows_async` patch remains and it already uses db mocks (no change needed if test already passes).

- [ ] **Step 10: Run auth tests**

```bash
python -m pytest tests/api/test_auth_endpoints.py -v 2>&1 | tail -20
```

Expected: all auth tests pass.

- [ ] **Step 11: Commit**

```bash
git add tests/api/test_auth_endpoints.py
git commit -m "test: update auth endpoint tests for Supabase approved/consent/supervisor"
```

---

## Task 8: Update test_admin_endpoints.py

**Files:**
- Modify: `tests/api/test_admin_endpoints.py`

- [ ] **Step 1: Update test_admin_list_approved_returns_students**

```python
def test_admin_list_approved_returns_students():
    rows = [
        {"email": "a@test.com", "full_name": "Alice", "role": "OA"},
        {"email": "b@test.com", "full_name": "Bob",   "role": "OT"},
    ]
    with patch("tools.shared.db.get_all_approved", new=AsyncMock(return_value=rows)):
        r = client.get("/api/admin/approved", cookies=_admin_headers())
    assert r.status_code == 200
    assert len(r.json()["students"]) == 2
```

- [ ] **Step 2: Update test_admin_list_approved_returns_empty_list**

```python
def test_admin_list_approved_returns_empty_list():
    with patch("tools.shared.db.get_all_approved", new=AsyncMock(return_value=[])):
        r = client.get("/api/admin/approved", cookies=_admin_headers())
    assert r.status_code == 200
    assert r.json()["students"] == []
```

- [ ] **Step 3: Update test_admin_list_approved_500_on_sheets_failure**

```python
def test_admin_list_approved_500_on_sheets_failure():
    with patch("tools.shared.db.get_all_approved", new=AsyncMock(side_effect=Exception("db down"))):
        r = client.get("/api/admin/approved", cookies=_admin_headers())
    assert r.status_code == 500
    assert "db down" not in r.json()["detail"]
```

- [ ] **Step 4: Update _mock_get_rows_no_existing and approve_student tests**

Replace the `_mock_get_rows_no_existing` helper and the two tests that use it:

```python
def test_admin_approve_student_success():
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"email": "admin@test.com"})), \
         patch("tools.shared.db.upsert_approved", new=AsyncMock()), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.api.routers.admin.generate_password", return_value="TmpPass1!"):
        r = client.post(
            "/api/admin/approved",
            json={"email": "new@test.com", "full_name": "New User", "role": "OA"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert "password" not in r.json()


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
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)):
        r = client.post(
            "/api/admin/approved",
            json={"email": "   ", "full_name": "X", "role": "OA"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 400


def test_admin_approve_student_does_not_return_password():
    with patch("tools.shared.db.get_approved", new=AsyncMock(return_value=None)), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value={"email": "admin@test.com"})), \
         patch("tools.shared.db.upsert_approved", new=AsyncMock()), \
         patch("tools.shared.db.upsert_auth", new=AsyncMock()), \
         patch("tools.api.routers.admin.generate_password", return_value="SuperSecret1!"):
        r = client.post(
            "/api/admin/approved",
            json={"email": "safe@test.com", "full_name": "Safe User", "role": "OT"},
            cookies=_admin_headers(),
        )
    assert "SuperSecret1!" not in r.text
    assert "password" not in r.json()
```

- [ ] **Step 5: Update promote tests**

```python
def test_admin_promote_success():
    with patch("tools.shared.db.upsert_supervisor", new=AsyncMock()):
        r = client.post(
            "/api/admin/promote",
            json={"email": "staff@test.com", "new_role": "supervisor"},
            cookies=_admin_headers(),
        )
    assert r.status_code == 200


def test_admin_promote_invalid_role():
    # Role check fires before any DB call
    r = client.post(
        "/api/admin/promote",
        json={"email": "x@test.com", "new_role": "overlord"},
        cookies=_admin_headers(),
    )
    assert r.status_code == 400
```

- [ ] **Step 6: Run full test suite**

```bash
python -m pytest tests/ -v 2>&1 | tail -20
```

Expected: 115+ tests pass (more now, since we added identity tests).

- [ ] **Step 7: Commit**

```bash
git add tests/api/test_admin_endpoints.py
git commit -m "test: update admin endpoint tests for Supabase approved/consent/supervisor"
```

---

## Task 9: Write and run the migration script

**Files:**
- Create: `tools/shared/migrate_phase2.py`

- [ ] **Step 1: Create the migration script**

Create `tools/shared/migrate_phase2.py`:

```python
#!/usr/bin/env python3
"""One-time migration: copy snec_approved_students, snec_consent, snec_supervisors
from Google Sheets to Supabase PostgreSQL.

Run ONCE. Upsert-safe — can be re-run without creating duplicates.
Delete this file after successful run.

Usage:
    python tools/shared/migrate_phase2.py
"""
import asyncio
import sys
import uuid
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared.gsheets import get_rows
from tools.shared import db


def _is_uuid(val: str) -> bool:
    try:
        uuid.UUID(str(val).strip())
        return True
    except (ValueError, AttributeError):
        return False


def _ts(val: object) -> str | None:
    """Return a non-empty string or None."""
    s = str(val).strip() if val else ""
    return s if s else None


async def migrate_approved(rows: list[dict]) -> int:
    count = 0
    for row in rows:
        email = row.get("email", "").strip().lower()
        if not email:
            continue
        student_id = row.get("student_id", "").strip()
        await db.upsert_approved(
            email=email,
            full_name=str(row.get("full_name", "")),
            role=str(row.get("role", "")),
            added_by=str(row.get("added_by", "")),
            added_at=_ts(row.get("added_at")),
            student_id=student_id if _is_uuid(student_id) else None,
        )
        count += 1
    return count


async def migrate_consent(rows: list[dict]) -> int:
    count = 0
    for row in rows:
        student_id = row.get("student_id", "").strip()
        email = row.get("email", "").strip().lower()
        if not student_id or not email or not _is_uuid(student_id):
            print(f"  Skipping consent row: student_id={student_id!r}, email={email!r}")
            continue
        await db.upsert_consent(
            student_id=student_id,
            student_name=str(row.get("student_name", "")),
            email=email,
        )
        # Set consent/withdrawn dates if present
        updates = {}
        if cd := _ts(row.get("consent_date")):
            updates["consent_date"] = cd
        if pv := row.get("pdpa_version", ""):
            updates["pdpa_version"] = str(pv)
        if wd := _ts(row.get("withdrawn_date")):
            updates["withdrawn_date"] = wd
        if updates:
            await db.update_consent(student_id, **updates)
        count += 1
    return count


async def migrate_supervisors(rows: list[dict]) -> int:
    count = 0
    for row in rows:
        email = row.get("email", "").strip().lower()
        if not email:
            continue
        await db.upsert_supervisor(
            email=email,
            role=str(row.get("role", "supervisor")),
            cohort=str(row.get("cohort", "SNEC")),
            supervisor_id=str(row.get("supervisor_id", "")),
        )
        count += 1
    return count


async def main() -> None:
    print("EyeBot Phase 2 — Sheets -> Supabase migration\n")

    print("Reading snec_approved_students...")
    n = await migrate_approved(get_rows("snec_approved_students"))
    print(f"  Migrated {n} approved student rows")

    print("Reading snec_consent...")
    n = await migrate_consent(get_rows("snec_consent"))
    print(f"  Migrated {n} consent rows")

    print("Reading snec_supervisors...")
    n = await migrate_supervisors(get_rows("snec_supervisors"))
    print(f"  Migrated {n} supervisor rows")

    print("\nMigration complete. Verify in Supabase Table Editor, then delete this file.")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Run the migration**

```bash
python tools/shared/migrate_phase2.py
```

Expected output:
```
EyeBot Phase 2 — Sheets -> Supabase migration

Reading snec_approved_students...
  Migrated N approved student rows
Reading snec_consent...
  Migrated N consent rows
Reading snec_supervisors...
  Migrated N supervisor rows

Migration complete.
```

- [ ] **Step 3: Verify in Supabase Table Editor**

Confirm row counts in `approved_students`, `student_consent`, `supervisors` match the Google Sheets row counts.

- [ ] **Step 4: Delete the migration script and commit**

```bash
git rm tools/shared/migrate_phase2.py
git commit -m "chore: run Phase 2 Sheets->Supabase migration; delete migration script"
git push
```

---

## Task 10: Final verification

- [ ] **Step 1: Run the full test suite**

```bash
python -m pytest tests/ -v 2>&1 | tail -15
```

Expected: all tests pass (115+ with the new identity tests).

- [ ] **Step 2: Start servers and do a real login**

```bash
# Terminal 1:
python -m uvicorn tools.api.server:app --reload --port 8000

# Terminal 2:
cd frontend && pnpm dev
```

Open http://localhost:5173. Log in. Confirm:
- Login succeeds
- Dashboard loads (requires GET /api/progress authenticated via cookie — hits `student_consent` for name)
- Admin dashboard loads approved students list (now from `approved_students` table)

- [ ] **Step 3: Push**

```bash
git push
```

---

## Self-Review

### Spec coverage
| Requirement | Task |
|---|---|
| `snec_approved_students` → Supabase | Tasks 3, 5, 6, 9 |
| `snec_consent` → Supabase | Tasks 3, 4, 5, 6, 9 |
| `snec_supervisors` → Supabase | Tasks 3, 5, 6, 9 |
| identity.py made async | Task 4 |
| All route handlers updated | Tasks 5, 6 |
| Test suite updated | Tasks 7, 8 |
| One-time migration | Task 9 |

### Placeholder scan
No TBD, TODO, or vague steps. All code shown in full.

### Type consistency
- `db.get_approved(email)` returns `dict | None` — used consistently in Tasks 5, 6, 7, 8
- `db.get_supervisor(email)` returns `dict | None` — used consistently
- `db.get_consent_by_student_id(student_id)` returns `dict | None` — used consistently
- `db.delete_approved(email)` returns `bool` — used in admin_unapprove_student and its test
- `get_or_create_student`, `has_consented`, `record_consent` are all async — all call-sites use `await`
- `student_consent` rows use `student_name` (not `full_name`) — consistent across identity.py and admin.py join
