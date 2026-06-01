# Phase 1: Database Migration + HttpOnly Cookies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate four high-frequency Google Sheets tables to Supabase PostgreSQL, replace blocking synchronous Sheets I/O with async wrappers, and move JWT tokens from `sessionStorage` to `HttpOnly` cookies.

**Architecture:** A new `tools/shared/db.py` module owns all async PostgreSQL operations via the `supabase-py` 2.x `AsyncClient`. Profile, session, and case tools become `async def` and call `db.*` instead of gsheets. Remaining Sheets tables get `asyncio.to_thread` wrappers so they stop blocking the event loop. JWTs move to `HttpOnly` cookies set server-side on login; every frontend `fetch()` call switches from `Authorization` headers to `credentials: "include"`.

**Tech Stack:** `supabase>=2.4.0` async client, `pytest-asyncio`, FastAPI `Cookie` dependency, React `credentials: "include"`, `asyncio.to_thread` for remaining sync Sheets calls.

**Design spec:** `docs/superpowers/specs/2026-05-30-phase1-db-migration-cookies-design.md`

---

## Files Modified / Created

| Action | Path | Purpose |
|--------|------|---------|
| Manual | Supabase SQL Editor | Create 4 PostgreSQL tables |
| Create | `tools/shared/db.py` | Async PostgreSQL client for 4 migrated tables |
| Create | `tests/shared/test_db.py` | Unit tests for db.py |
| Create | `tools/shared/migrate_sheets_to_supabase.py` | One-time data migration script |
| Modify | `requirements.txt` | Add `pytest-asyncio` |
| Modify | `tools/shared/gsheets.py` | Add `*_async` wrappers using `asyncio.to_thread` |
| Modify | `tools/profile/get_profile.py` | Use `await db.get_profile()`; return native Python types |
| Modify | `tools/profile/update_profile.py` | Use `await db.update_profile()`; write native Python types |
| Modify | `tools/chatbot/log_session.py` | Use `await db.insert_session()` |
| Modify | `tools/cases/get_case_progress.py` | Use `await db.get_case_results()` |
| Modify | `tools/cases/log_case_completion.py` | Use `await db.insert_case_result()` |
| Modify | `tools/api/routers/auth.py` | Use `await db.get_auth()` / `db.update_auth()`; set/clear cookie |
| Modify | `tools/api/routers/chat.py` | Make route handlers `async def`; remove `student_id` from body models |
| Modify | `tools/api/routers/cases.py` | Make route handlers `async def` |
| Modify | `tools/api/routers/checkin.py` | Make route handlers `async def`; use async gsheets wrappers |
| Modify | `tools/api/routers/student.py` | Make route handlers `async def` |
| Modify | `tools/api/routers/admin.py` | Use async gsheets wrappers |
| Modify | `tools/api/routers/supervisor.py` | Use async gsheets wrappers |
| Modify | `tools/api/server.py` | CORS `allow_credentials=True`; add CSP header; add `ENVIRONMENT` env var to load |
| Modify | `tools/shared/jwt_utils.py` | Read JWT from `Cookie`; add `set_auth_cookie` / `clear_auth_cookie` |
| Modify | `tests/shared/test_jwt_utils.py` | Update tests for cookie-based auth |
| Modify | `tests/api/test_auth_endpoints.py` | Update mocks: gsheets → db |
| Modify | `tests/profile/test_get_profile.py` | Update to async + mock db.py |
| Modify | `tests/profile/test_update_profile.py` | Update to async + mock db.py |
| Modify | `tests/cases/test_case_access.py` | Update auth helper to use cookie headers |
| Modify | `.env.template` | Add `ENVIRONMENT=development` |
| Modify | `frontend/src/app/components/AuthContext.tsx` | Remove token/authHeaders; cookie-based auth |
| Modify | `frontend/src/app/components/OnboardingScreen.tsx` | `credentials: "include"` |
| Modify | `frontend/src/app/components/ChangePasswordModal.tsx` | `credentials: "include"` |
| Modify | `frontend/src/app/components/ChatScreen.tsx` | `credentials: "include"` |
| Modify | `frontend/src/app/components/CaseListScreen.tsx` | `credentials: "include"` |
| Modify | `frontend/src/app/components/CaseSessionScreen.tsx` | `credentials: "include"` |
| Modify | `frontend/src/app/components/DashboardScreen.tsx` | `credentials: "include"` |
| Modify | `frontend/src/app/components/DailyCheckInScreen.tsx` | `credentials: "include"` |
| Modify | `frontend/src/app/components/FlashcardScreen.tsx` | `credentials: "include"` |
| Modify | `frontend/src/app/components/ProgressScreen.tsx` | `credentials: "include"` |
| Modify | `frontend/src/app/components/SupervisorDashboard.tsx` | `credentials: "include"` |
| Modify | `frontend/src/app/components/AdminDashboard.tsx` | `credentials: "include"` |
| Modify | `frontend/src/app/components/AdminStudentDetail.tsx` | `credentials: "include"` |
| Modify | `frontend/src/app/components/StudentDrillDown.tsx` | `credentials: "include"` |

---

## Task 1: Create Supabase PostgreSQL tables (manual step)

**Files:** Supabase SQL Editor (no code files)

- [ ] **Step 1: Open Supabase SQL Editor**

Log in to https://supabase.com, open your project, navigate to **SQL Editor**.

- [ ] **Step 2: Run the schema SQL**

Paste and execute this SQL exactly:

```sql
CREATE TABLE student_auth (
    email           text PRIMARY KEY,
    password_hash   text NOT NULL,
    must_change     boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE student_profiles (
    student_id          uuid PRIMARY KEY,
    role                text NOT NULL DEFAULT '',
    weak_topics         jsonb NOT NULL DEFAULT '[]',
    missed_findings     jsonb NOT NULL DEFAULT '[]',
    retention_scores    jsonb NOT NULL DEFAULT '{}',
    session_count       integer NOT NULL DEFAULT 0,
    streak              integer NOT NULL DEFAULT 0,
    last_active         date,
    learning_velocity   text NOT NULL DEFAULT 'stable',
    checkin_done_today  boolean NOT NULL DEFAULT false,
    supervisor_note     text NOT NULL DEFAULT '',
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chat_sessions (
    session_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      uuid NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    topic           text NOT NULL DEFAULT '',
    summary         text NOT NULL DEFAULT '',
    token_count     integer NOT NULL DEFAULT 0,
    model           text NOT NULL DEFAULT ''
);
CREATE INDEX ON chat_sessions (student_id);

CREATE TABLE case_progress (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id      uuid NOT NULL,
    case_id         text NOT NULL,
    total_score     integer NOT NULL DEFAULT 0,
    passed          boolean NOT NULL DEFAULT false,
    completed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON case_progress (student_id);
CREATE INDEX ON case_progress (student_id, case_id);
```

- [ ] **Step 3: Verify tables exist**

In Supabase **Table Editor**, confirm all four tables appear: `student_auth`, `student_profiles`, `chat_sessions`, `case_progress`. No rows yet.

---

## Task 2: Add pytest-asyncio and write failing tests for db.py

**Files:**
- Modify: `requirements.txt`
- Create: `tests/shared/test_db.py`

- [ ] **Step 1: Add pytest-asyncio to requirements.txt**

Open `requirements.txt`. Add after the existing `# Authentication` block:

```
# Testing
pytest-asyncio>=0.23.0
```

Install it:
```bash
pip install pytest-asyncio>=0.23.0
```

- [ ] **Step 2: Write the failing test file**

Create `tests/shared/test_db.py`:

```python
"""Unit tests for tools/shared/db.py — async Supabase PostgreSQL client."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import tools.shared.db as db


def _make_client(rows: list) -> AsyncMock:
    """Return a mock AsyncClient whose execute() returns the given rows."""
    response = MagicMock()
    response.data = rows
    execute = AsyncMock(return_value=response)

    client = AsyncMock()
    # Build a flexible chain that works for select/insert/update/upsert
    table = client.table.return_value
    table.select.return_value.eq.return_value.limit.return_value.execute = execute
    table.select.return_value.eq.return_value.order.return_value.limit.return_value.execute = execute
    table.select.return_value.eq.return_value.execute = execute
    table.upsert.return_value.execute = execute
    table.update.return_value.eq.return_value.execute = execute
    table.insert.return_value.execute = execute
    return client


@pytest.mark.asyncio
async def test_get_auth_returns_row_when_found():
    row = {"email": "a@b.com", "password_hash": "hashed", "must_change": True}
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([row]))):
        result = await db.get_auth("a@b.com")
    assert result == row


@pytest.mark.asyncio
async def test_get_auth_returns_none_when_not_found():
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([]))):
        result = await db.get_auth("missing@b.com")
    assert result is None


@pytest.mark.asyncio
async def test_get_profile_returns_row_when_found():
    row = {"student_id": "stu-001", "role": "OA", "session_count": 3,
           "weak_topics": ["glaucoma"], "missed_findings": [], "retention_scores": {}}
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([row]))):
        result = await db.get_profile("stu-001")
    assert result["role"] == "OA"
    assert result["session_count"] == 3


@pytest.mark.asyncio
async def test_get_profile_returns_none_when_not_found():
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([]))):
        result = await db.get_profile("unknown")
    assert result is None


@pytest.mark.asyncio
async def test_insert_session_writes_to_chat_sessions_table():
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.insert_session("stu-001", "glaucoma", "discussed IOP", 120, "gemini-2.5-flash")
    client.table.assert_called_with("chat_sessions")
    client.table.return_value.insert.assert_called_once()
    payload = client.table.return_value.insert.call_args[0][0]
    assert payload["student_id"] == "stu-001"
    assert payload["topic"] == "glaucoma"
    assert payload["token_count"] == 120


@pytest.mark.asyncio
async def test_get_sessions_returns_list():
    rows = [{"session_id": "s1", "topic": "glaucoma"}, {"session_id": "s2", "topic": "AMD"}]
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client(rows))):
        result = await db.get_sessions("stu-001")
    assert len(result) == 2
    assert result[0]["topic"] == "glaucoma"


@pytest.mark.asyncio
async def test_get_sessions_returns_empty_list_when_none():
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([]))):
        result = await db.get_sessions("stu-001")
    assert result == []


@pytest.mark.asyncio
async def test_insert_case_result_writes_to_case_progress_table():
    client = _make_client([])
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=client)):
        await db.insert_case_result("stu-001", "case_oa_001_history_triage", 32, True)
    client.table.assert_called_with("case_progress")
    payload = client.table.return_value.insert.call_args[0][0]
    assert payload["case_id"] == "case_oa_001_history_triage"
    assert payload["passed"] is True
    assert payload["total_score"] == 32


@pytest.mark.asyncio
async def test_get_case_results_returns_list():
    rows = [{"case_id": "case_oa_001", "passed": True, "total_score": 32}]
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client(rows))):
        result = await db.get_case_results("stu-001")
    assert result[0]["passed"] is True
    assert result[0]["total_score"] == 32


@pytest.mark.asyncio
async def test_get_case_results_returns_empty_list_when_none():
    with patch("tools.shared.db._get_client", new=AsyncMock(return_value=_make_client([]))):
        result = await db.get_case_results("unknown")
    assert result == []
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
python -m pytest tests/shared/test_db.py -v
```

Expected: `ModuleNotFoundError: No module named 'tools.shared.db'` — confirms tests are wired correctly.

---

## Task 3: Implement tools/shared/db.py

**Files:**
- Create: `tools/shared/db.py`

- [ ] **Step 1: Create the file**

Create `tools/shared/db.py` with this exact content:

```python
#!/usr/bin/env python3
"""Async Supabase PostgreSQL client for the four migrated tables.

Replaces Google Sheets for: student_auth, student_profiles, chat_sessions, case_progress.
All functions are async. JSONB columns are returned as native Python dicts/lists.

Usage:
    from tools.shared import db
    profile = await db.get_profile(student_id)
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import AsyncClient, acreate_client

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env")

_client: AsyncClient | None = None


async def _get_client() -> AsyncClient:
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL", "").strip()
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
            )
        _client = await acreate_client(url, key)
    return _client


# ── student_auth ─────────────────────────────────────────────────────────────

async def get_auth(email: str) -> dict | None:
    """Return the auth row for email, or None if not found."""
    client = await _get_client()
    result = (
        await client.table("student_auth")
        .select("*")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def upsert_auth(email: str, password_hash: str, must_change: bool) -> None:
    """Insert or update an auth row."""
    client = await _get_client()
    await client.table("student_auth").upsert(
        {"email": email, "password_hash": password_hash, "must_change": must_change},
        on_conflict="email",
    ).execute()


async def update_auth(email: str, **fields) -> None:
    """Update specific fields on an auth row."""
    client = await _get_client()
    await client.table("student_auth").update(fields).eq("email", email).execute()


# ── student_profiles ──────────────────────────────────────────────────────────

async def get_profile(student_id: str) -> dict | None:
    """Return the profile row for student_id, or None if not found.
    JSONB columns (weak_topics, missed_findings, retention_scores) are
    returned as native Python lists/dicts — no json.loads() needed.
    """
    client = await _get_client()
    result = (
        await client.table("student_profiles")
        .select("*")
        .eq("student_id", student_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def upsert_profile(student_id: str, **fields) -> None:
    """Insert or update a profile row."""
    client = await _get_client()
    await client.table("student_profiles").upsert(
        {"student_id": student_id, **fields},
        on_conflict="student_id",
    ).execute()


async def update_profile(student_id: str, **fields) -> None:
    """Update specific fields on a profile row."""
    client = await _get_client()
    await client.table("student_profiles").update(fields).eq("student_id", student_id).execute()


# ── chat_sessions ─────────────────────────────────────────────────────────────

async def insert_session(
    student_id: str, topic: str, summary: str, token_count: int, model: str
) -> None:
    """Append a chat session record."""
    client = await _get_client()
    await client.table("chat_sessions").insert(
        {
            "student_id": student_id,
            "topic": topic,
            "summary": summary,
            "token_count": token_count,
            "model": model,
        }
    ).execute()


async def get_sessions(student_id: str, limit: int = 20) -> list[dict]:
    """Return the most recent sessions for a student, newest first."""
    client = await _get_client()
    result = (
        await client.table("chat_sessions")
        .select("*")
        .eq("student_id", student_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


# ── case_progress ─────────────────────────────────────────────────────────────

async def insert_case_result(
    student_id: str, case_id: str, total_score: int, passed: bool
) -> None:
    """Append a case completion record."""
    client = await _get_client()
    await client.table("case_progress").insert(
        {
            "student_id": student_id,
            "case_id": case_id,
            "total_score": total_score,
            "passed": passed,
        }
    ).execute()


async def get_case_results(student_id: str) -> list[dict]:
    """Return all case completion records for a student."""
    client = await _get_client()
    result = (
        await client.table("case_progress")
        .select("*")
        .eq("student_id", student_id)
        .execute()
    )
    return result.data or []
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
python -m pytest tests/shared/test_db.py -v
```

Expected: 9 tests pass.

- [ ] **Step 3: Commit**

```bash
git add requirements.txt tools/shared/db.py tests/shared/test_db.py
git commit -m "feat: async Supabase PostgreSQL client (db.py) for 4 migrated tables"
```

---

## Task 4: Add async wrappers to gsheets.py

**Files:**
- Modify: `tools/shared/gsheets.py`

- [ ] **Step 1: Add import and three async wrappers**

Open `tools/shared/gsheets.py`. At the top of the file, after the existing imports, add:

```python
import asyncio
```

At the very bottom of the file, after all existing functions, add:

```python
# ── Async wrappers for use in async FastAPI route handlers ─────────────────


async def get_rows_async(sheet_name: str, filters: dict | None = None) -> list[dict]:
    """Async wrapper — runs get_rows in a thread so it does not block the event loop."""
    return await asyncio.to_thread(get_rows, sheet_name, filters)


async def append_row_async(sheet_name: str, row: dict) -> None:
    """Async wrapper — runs append_row in a thread so it does not block the event loop."""
    await asyncio.to_thread(append_row, sheet_name, row)


async def update_row_async(
    sheet_name: str, key_col: str, key_val: str, updates: dict
) -> None:
    """Async wrapper — runs update_row in a thread so it does not block the event loop."""
    await asyncio.to_thread(update_row, sheet_name, key_col, key_val, updates)
```

- [ ] **Step 2: Verify existing tests still pass**

```bash
python -m pytest tests/ -q
```

Expected: all 105 tests pass (this change is purely additive).

- [ ] **Step 3: Commit**

```bash
git add tools/shared/gsheets.py
git commit -m "feat: add async wrappers to gsheets.py (asyncio.to_thread) to unblock event loop"
```

---

## Task 5: Update get_profile.py and update_profile.py to use db.py

**Files:**
- Modify: `tools/profile/get_profile.py`
- Modify: `tools/profile/update_profile.py`

Key difference from Sheets version: Supabase JSONB columns (`weak_topics`, `missed_findings`, `retention_scores`) return native Python lists/dicts. No `json.loads()` or `json.dumps()` needed for those fields.

- [ ] **Step 1: Rewrite get_profile.py**

Replace the full content of `tools/profile/get_profile.py` with:

```python
#!/usr/bin/env python3
"""Read a student's profile from Supabase student_profiles table.

Returns a default profile dict if the student has no row (and creates the row).
Resets checkin_done_today if last_active is not today.

Usage:
    from tools.profile.get_profile import get_profile
    profile = await get_profile(student_id)
"""
import sys
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db
from tools.shared.audit_log import log

_DEFAULTS = {
    "role": "",
    "weak_topics": [],
    "missed_findings": [],
    "retention_scores": {},
    "session_count": 0,
    "streak": 0,
    "last_active": None,
    "learning_velocity": "stable",
    "checkin_done_today": False,
    "supervisor_note": "",
}


def _default_profile(student_id: str) -> dict:
    return {"student_id": student_id, **_DEFAULTS}


async def get_profile(student_id: str) -> dict:
    """Return the student's profile dict. Creates a default row if missing.
    Resets checkin_done_today if last_active is not today.
    Never raises — returns a default profile on any error.
    """
    try:
        profile = await db.get_profile(student_id)
    except Exception as exc:
        log("profile_read_error", student_id=student_id, feature="profile", detail=str(exc))
        return _default_profile(student_id)

    if not profile:
        profile = _default_profile(student_id)
        try:
            await db.upsert_profile(student_id, **_DEFAULTS)
        except Exception as exc:
            log("profile_create_error", student_id=student_id, feature="profile", detail=str(exc))
        return profile

    # Reset checkin flag if this is a new day
    last_active = profile.get("last_active")
    if last_active:
        try:
            last_date = date.fromisoformat(str(last_active)) if isinstance(last_active, str) else last_active
            if last_date != date.today():
                profile["checkin_done_today"] = False
                try:
                    await db.update_profile(student_id, checkin_done_today=False)
                except Exception as exc:
                    log("profile_reset_error", student_id=student_id, feature="profile", detail=str(exc))
        except (ValueError, TypeError):
            pass

    return profile
```

- [ ] **Step 2: Rewrite update_profile.py**

Replace the full content of `tools/profile/update_profile.py` with:

```python
#!/usr/bin/env python3
"""Update a student's profile in Supabase student_profiles after a session.

Usage:
    from tools.profile.update_profile import update_profile
    await update_profile(student_id, topic="glaucoma", score=0.75)
"""
import sys
from datetime import date, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.profile.get_profile import get_profile
from tools.shared import db
from tools.shared.audit_log import log

WEAK_THRESHOLD = 0.65


def _calc_velocity(old_scores: dict, new_scores: dict) -> str:
    if not old_scores or not new_scores:
        return "stable"
    old_avg = sum(old_scores.values()) / len(old_scores)
    new_avg = sum(new_scores.values()) / len(new_scores)
    diff = new_avg - old_avg
    if diff > 0.05:
        return "improving"
    if diff < -0.05:
        return "declining"
    return "stable"


async def update_profile(
    student_id: str,
    topic: str | None = None,
    score: float | None = None,
    new_missed_findings: list[str] | None = None,
    checkin_done: bool = False,
    role: str | None = None,
) -> None:
    """Update the student's profile. Never raises — logs errors to audit_log."""
    try:
        profile = await get_profile(student_id)
    except Exception as exc:
        log("profile_update_error", student_id=student_id, feature="profile", detail=str(exc))
        return

    today = date.today()

    # Streak
    last_active = profile.get("last_active")
    try:
        last = date.fromisoformat(str(last_active)) if last_active else None
    except (ValueError, TypeError):
        last = None

    current_streak = int(profile.get("streak") or 0)
    if last is None or last == today:
        new_streak = max(current_streak, 1)
    elif last == today - timedelta(days=1):
        new_streak = current_streak + 1
    else:
        new_streak = 1

    # Retention scores — already a dict from Supabase JSONB
    retention = dict(profile.get("retention_scores") or {})
    old_retention = dict(retention)

    if topic and score is not None:
        old = float(retention.get(topic, score))
        retention[topic] = round(0.3 * float(score) + 0.7 * old, 3)

    # Weak topics
    weak_topics = [t for t, s in retention.items() if s < WEAK_THRESHOLD]

    # Missed findings — already a list from Supabase JSONB
    findings = list(profile.get("missed_findings") or [])

    def _is_near_duplicate(new: str, existing: list) -> bool:
        new_words = set(new.lower().split())
        return any(len(new_words & set(f.lower().split())) >= 3 for f in existing)

    if new_missed_findings:
        for f in new_missed_findings:
            if not _is_near_duplicate(f, findings):
                findings.append(f)
        if len(findings) > 20:
            findings = findings[-20:]

    velocity = _calc_velocity(old_retention, retention)
    session_count = int(profile.get("session_count") or 0) + 1

    updates: dict = {
        "session_count": session_count,
        "streak": new_streak,
        "last_active": today.isoformat(),
        "retention_scores": retention,
        "weak_topics": weak_topics,
        "missed_findings": findings,
        "learning_velocity": velocity,
    }
    if checkin_done:
        updates["checkin_done_today"] = True
    if role:
        updates["role"] = role

    try:
        await db.update_profile(student_id, **updates)
    except Exception as exc:
        log("profile_write_error", student_id=student_id, feature="profile", detail=str(exc))
```

- [ ] **Step 3: Commit**

```bash
git add tools/profile/get_profile.py tools/profile/update_profile.py
git commit -m "feat: migrate get_profile and update_profile to async Supabase PostgreSQL"
```

---

## Task 6: Update log_session.py to use db.py

**Files:**
- Modify: `tools/chatbot/log_session.py`

- [ ] **Step 1: Read the current file**

Open `tools/chatbot/log_session.py` and note the current `log_session` signature and what it writes to `snec_sessions`.

- [ ] **Step 2: Rewrite the function**

Replace the content of `tools/chatbot/log_session.py` with:

```python
#!/usr/bin/env python3
"""Log a completed chat session to Supabase chat_sessions table.

Usage:
    from tools.chatbot.log_session import log_session
    await log_session(student_id, messages, topic, token_count, model)
"""
import sys
import uuid
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db
from tools.shared.audit_log import log as audit_log


async def log_session(
    student_id: str,
    messages: list[dict],
    topic: str = "Ophthalmology",
    token_count: int = 0,
    model: str = "",
) -> str:
    """Append a session record and return the session_id (UUID string).
    Never raises — logs errors to audit_log.
    """
    # Derive summary from last assistant message (max 200 chars)
    summary = next(
        (m["content"][:200] for m in reversed(messages) if m.get("role") == "assistant"),
        "",
    )

    try:
        await db.insert_session(
            student_id=student_id,
            topic=topic[:100],
            summary=summary,
            token_count=token_count,
            model=model,
        )
        audit_log("session_logged", student_id=student_id, feature="chatbot", detail=f"topic: {topic}")
    except Exception as exc:
        audit_log("session_log_error", student_id=student_id, feature="chatbot", detail=str(exc))

    return str(uuid.uuid4())
```

- [ ] **Step 3: Commit**

```bash
git add tools/chatbot/log_session.py
git commit -m "feat: migrate log_session to async Supabase PostgreSQL"
```

---

## Task 7: Update case progress tools to use db.py

**Files:**
- Modify: `tools/cases/get_case_progress.py`
- Modify: `tools/cases/log_case_completion.py`

- [ ] **Step 1: Rewrite get_case_progress.py**

Replace the full content of `tools/cases/get_case_progress.py`:

```python
#!/usr/bin/env python3
"""Read case completion records for a student from Supabase.

Usage:
    from tools.cases.get_case_progress import get_case_progress
    results = await get_case_progress(student_id)
    # returns list of dicts: [{case_id, total_score, passed, completed_at}, ...]
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db


async def get_case_progress(student_id: str) -> list[dict]:
    """Return all case completion records for a student.
    Each dict has: case_id (str), total_score (int), passed (bool), completed_at (str).
    Returns [] on error.
    """
    try:
        return await db.get_case_results(student_id)
    except Exception:
        return []
```

- [ ] **Step 2: Rewrite log_case_completion.py**

Replace the full content of `tools/cases/log_case_completion.py`:

```python
#!/usr/bin/env python3
"""Log a completed case simulation to Supabase case_progress table.

Usage:
    from tools.cases.log_case_completion import log_case_completion
    await log_case_completion(student_id, case_id, total_score, passed)
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared import db
from tools.shared.audit_log import log as audit_log


async def log_case_completion(
    student_id: str,
    case_id: str,
    total_score: int,
    passed: bool,
) -> None:
    """Append a case completion record. Never raises."""
    try:
        await db.insert_case_result(
            student_id=student_id,
            case_id=case_id,
            total_score=total_score,
            passed=passed,
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

- [ ] **Step 3: Commit**

```bash
git add tools/cases/get_case_progress.py tools/cases/log_case_completion.py
git commit -m "feat: migrate case progress tools to async Supabase PostgreSQL"
```

---

## Task 8: Make route handlers async and wire db.py into auth router

**Files:**
- Modify: `tools/api/routers/auth.py`
- Modify: `tools/api/routers/chat.py`
- Modify: `tools/api/routers/cases.py`
- Modify: `tools/api/routers/checkin.py`
- Modify: `tools/api/routers/student.py`

These routers call `get_profile`, `update_profile`, `log_session`, `get_case_progress`, and `log_case_completion` — all now async. The route handlers must become `async def` and use `await`.

### auth.py

- [ ] **Step 1: Add db import to auth.py**

At the top of `tools/api/routers/auth.py`, add:
```python
from tools.shared import db
```

- [ ] **Step 2: Replace all gsheets calls in auth.py with db calls**

In `auth.py`, every `get_rows("snec_auth", ...)`, `append_row("snec_auth", ...)`, and `update_row("snec_auth", ...)` call must be replaced:

```python
# OLD — remove these patterns:
rows = get_rows("snec_auth", filters={"email": email})
# NEW:
row = await db.get_auth(email)

# OLD:
append_row("snec_auth", {"email": email, "password_hash": hash, "must_change": "true"})
# NEW:
await db.upsert_auth(email, hash, must_change=True)

# OLD:
update_row("snec_auth", "email", email, {"password_hash": new_hash, "must_change": "false"})
# NEW:
await db.update_auth(email, password_hash=new_hash, must_change=False)
```

Also update the `must_change` boolean handling — Supabase returns a real boolean, not the string `"true"`:
```python
# OLD:
must_change = str(raw_mc).lower() == "true"
# NEW (db returns bool directly):
must_change = bool(row.get("must_change", True))
```

Make all `auth.py` endpoint functions `async def`.

Remove the `get_rows` and `update_row` imports from `gsheets` in `auth.py` (they are no longer needed).

### chat.py, cases.py, checkin.py, student.py

- [ ] **Step 3: Make all route handlers in chat.py async**

In `tools/api/routers/chat.py`:
- Change `def chat(...)` → `async def chat(...)`
- Change `def end_session(...)` → `async def end_session(...)`
- Change `def get_my_progress(...)` → `async def get_my_progress(...)`
- Change `def get_student_progress(...)` → `async def get_student_progress(...)`
- Add `await` before every call to `get_profile(...)`, `update_profile(...)`, `log_session(...)`
- Remove `student_id` field from `ChatRequest` and `EndSessionRequest` Pydantic models; replace `body.student_id` with `current_user["sub"]` everywhere in chat.py

- [ ] **Step 4: Make all route handlers in cases.py async**

In `tools/api/routers/cases.py`:
- Change every `def get_cases(...)`, `def case_chat(...)`, `def case_submit(...)`, `def get_checklist(...)` → `async def`
- Add `await` before every call to `get_profile(...)`, `get_case_progress(...)`, `log_case_completion(...)`, `log_session(...)`
- Replace `body.student_id` with `current_user["sub"]` everywhere in cases.py

- [ ] **Step 5: Make all route handlers in checkin.py async**

In `tools/api/routers/checkin.py`:
- Change every `def checkin_status(...)`, `def checkin_question(...)`, `def checkin_answer(...)` → `async def`
- Add `await` before every call to `get_profile(...)` and `update_profile(...)`
- Replace any Sheets calls with async gsheets wrappers (`get_rows_async`, `update_row_async`)

- [ ] **Step 6: Make all route handlers in student.py async**

In `tools/api/routers/student.py`:
- Change every `def update_role(...)`, `def flashcard_check(...)`, `def flashcards_generate(...)`, `def study_suggestion(...)` → `async def`
- Add `await` before every call to `get_profile(...)` and `update_profile(...)`

- [ ] **Step 7: Build to verify no syntax errors**

```bash
cd frontend && pnpm build
```

Then run:
```bash
python -m pytest tests/ -q 2>&1 | tail -10
```

Expected: some tests will fail because they mock `gsheets.get_rows` but the code now calls `db.get_auth` / `db.get_profile`. This is expected — tests are updated in Task 10.

- [ ] **Step 8: Commit**

```bash
git add tools/api/routers/auth.py tools/api/routers/chat.py tools/api/routers/cases.py tools/api/routers/checkin.py tools/api/routers/student.py
git commit -m "feat: wire db.py into routers; make route handlers async; remove body student_id trust"
```

---

## Task 9: Update admin and supervisor routers to use async gsheets

**Files:**
- Modify: `tools/api/routers/admin.py`
- Modify: `tools/api/routers/supervisor.py`

These routers still use Google Sheets (approved students, supervisors, supervisor alerts) but must not block the event loop.

- [ ] **Step 1: Update admin.py imports**

In `tools/api/routers/admin.py`, replace:
```python
from tools.shared.gsheets import get_rows, append_row, update_row
```
with:
```python
from tools.shared.gsheets import get_rows_async, append_row_async, update_row_async
```

- [ ] **Step 2: Update all gsheets calls in admin.py**

Replace every sync call pattern with the async equivalent and add `await`:
```python
# OLD:
rows = get_rows("snec_approved_students")
# NEW:
rows = await get_rows_async("snec_approved_students")

# OLD:
append_row("snec_approved_students", {...})
# NEW:
await append_row_async("snec_approved_students", {...})

# OLD:
update_row("snec_approved_students", "email", email, {...})
# NEW:
await update_row_async("snec_approved_students", "email", email, {...})
```

Make all admin route functions `async def`.

- [ ] **Step 3: Update supervisor.py imports and calls**

Apply the same pattern to `tools/api/routers/supervisor.py` — replace sync gsheets imports with async variants, add `await`, make all route functions `async def`.

- [ ] **Step 4: Commit**

```bash
git add tools/api/routers/admin.py tools/api/routers/supervisor.py
git commit -m "feat: use async gsheets wrappers in admin and supervisor routers"
```

---

## Task 10: Update test suite for new async interfaces

**Files:**
- Modify: `tests/api/test_auth_endpoints.py`
- Modify: `tests/profile/test_get_profile.py`
- Modify: `tests/profile/test_update_profile.py`
- Modify: `tests/cases/test_case_access.py`
- Modify: `tests/shared/test_jwt_utils.py`

- [ ] **Step 1: Update test_auth_endpoints.py**

The auth tests currently patch `tools.shared.gsheets.get_rows`. After migration they must patch `tools.shared.db.get_auth`, `tools.shared.db.update_auth`, and `tools.shared.db.upsert_auth`.

Find every `patch("tools.shared.gsheets.get_rows")` in `tests/api/test_auth_endpoints.py` and update to patch the relevant `tools.shared.db.*` function as `AsyncMock`.

Example pattern for login test:
```python
# OLD:
with patch("tools.shared.gsheets.get_rows", return_value=[{"email": ..., "password_hash": ..., "must_change": "false"}]):

# NEW:
with patch("tools.shared.db.get_auth", new=AsyncMock(return_value={"email": ..., "password_hash": ..., "must_change": False})):
```

- [ ] **Step 2: Update test_get_profile.py**

The profile tests patch `tools.profile.get_profile.get_rows`. After migration they patch `tools.shared.db.get_profile` and `tools.shared.db.upsert_profile`.

Add `@pytest.mark.asyncio` to each test. Add `import pytest` and `from unittest.mock import AsyncMock, patch`.

Example:
```python
# OLD:
def test_get_profile_returns_existing_row():
    with patch("tools.profile.get_profile.get_rows", return_value=[{
        "student_id": "stu-001", "role": "OA", "session_count": "5",
        "weak_topics": '["glaucoma"]', "missed_findings": "[]",
        "retention_scores": "{}", "streak": "3", "last_active": "",
        "learning_velocity": "stable", "checkin_done_today": "false",
    }]):
        result = get_profile("stu-001")
    assert result["role"] == "OA"

# NEW:
@pytest.mark.asyncio
async def test_get_profile_returns_existing_row():
    with patch("tools.shared.db.get_profile", new=AsyncMock(return_value={
        "student_id": "stu-001", "role": "OA", "session_count": 5,
        "weak_topics": ["glaucoma"], "missed_findings": [],
        "retention_scores": {}, "streak": 3, "last_active": None,
        "learning_velocity": "stable", "checkin_done_today": False,
        "supervisor_note": "",
    })):
        result = await get_profile("stu-001")
    assert result["role"] == "OA"
```

Apply this pattern to all 4 tests in `test_get_profile.py`.

- [ ] **Step 3: Update test_update_profile.py**

The update profile tests patch `tools.profile.get_profile.get_rows` and `tools.shared.gsheets.update_row`. After migration:
- Patch `tools.shared.db.get_profile` (AsyncMock returning a profile dict with native Python types)
- Patch `tools.shared.db.update_profile` (AsyncMock)
- Add `@pytest.mark.asyncio` and `async def` to each test

- [ ] **Step 4: Update test_case_access.py auth helper**

In `tests/cases/test_case_access.py`, the `_auth_headers` helper creates a JWT and passes it as `Authorization: Bearer`. After the cookie migration, the TestClient must send a cookie instead:

```python
# OLD:
def _auth_headers(student_id: str = "stu_test") -> dict:
    token = create_access_token(student_id, "student", "OA")
    return {"Authorization": f"Bearer {token}"}
# Used as: client.post("/api/cases/...", headers=_auth_headers())

# NEW:
def _auth_cookie(student_id: str = "stu_test") -> dict:
    token = create_access_token(student_id, "student", "OA")
    return {"eyebot_token": token}
# Used as: client.post("/api/cases/...", cookies=_auth_cookie())
```

Update all test calls from `headers=_auth_headers()` to `cookies=_auth_cookie()`.

- [ ] **Step 5: Run full test suite**

```bash
python -m pytest tests/ -v 2>&1 | tail -20
```

Expected: all 105 tests pass. Fix any remaining mock mismatches.

- [ ] **Step 6: Commit**

```bash
git add tests/
git commit -m "test: update test suite for async db.py interface and cookie-based auth"
```

---

## Task 11: Write and run the data migration script

**Files:**
- Create: `tools/shared/migrate_sheets_to_supabase.py`

This script runs once, migrates existing test data from Google Sheets to Supabase, and is deleted afterward.

- [ ] **Step 1: Create the migration script**

Create `tools/shared/migrate_sheets_to_supabase.py`:

```python
#!/usr/bin/env python3
"""One-time migration: copy snec_auth, snec_profiles, snec_sessions, snec_case_progress
from Google Sheets to Supabase PostgreSQL.

Run ONCE before switching the app to Supabase. Delete this file after successful run.

Usage:
    python tools/shared/migrate_sheets_to_supabase.py
"""
import asyncio
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.shared.gsheets import get_rows
from tools.shared import db


def _bool(val: object) -> bool:
    if isinstance(val, bool):
        return val
    return str(val).strip().lower() == "true"


def _int(val: object) -> int:
    try:
        return int(str(val).strip() or "0")
    except (ValueError, TypeError):
        return 0


def _json_list(val: object) -> list:
    if isinstance(val, list):
        return val
    try:
        result = json.loads(str(val) or "[]")
        return result if isinstance(result, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _json_dict(val: object) -> dict:
    if isinstance(val, dict):
        return val
    try:
        result = json.loads(str(val) or "{}")
        return result if isinstance(result, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


async def migrate_auth(rows: list[dict]) -> int:
    count = 0
    for row in rows:
        email = row.get("email", "").strip()
        if not email:
            continue
        await db.upsert_auth(
            email=email,
            password_hash=str(row.get("password_hash", "")),
            must_change=_bool(row.get("must_change", "true")),
        )
        count += 1
    return count


async def migrate_profiles(rows: list[dict]) -> int:
    count = 0
    for row in rows:
        student_id = row.get("student_id", "").strip()
        if not student_id:
            continue
        last_active = row.get("last_active", "") or None
        await db.upsert_profile(
            student_id=student_id,
            role=str(row.get("role", "")),
            weak_topics=_json_list(row.get("weak_topics", "[]")),
            missed_findings=_json_list(row.get("missed_findings", "[]")),
            retention_scores=_json_dict(row.get("retention_scores", "{}")),
            session_count=_int(row.get("session_count", "0")),
            streak=_int(row.get("streak", "0")),
            last_active=last_active,
            learning_velocity=str(row.get("learning_velocity", "stable")),
            checkin_done_today=_bool(row.get("checkin_done_today", "false")),
            supervisor_note=str(row.get("supervisor_note", "")),
        )
        count += 1
    return count


async def migrate_sessions(rows: list[dict]) -> int:
    count = 0
    for row in rows:
        student_id = row.get("student_id", "").strip()
        if not student_id:
            continue
        await db.insert_session(
            student_id=student_id,
            topic=str(row.get("topic", ""))[:100],
            summary=str(row.get("summary", ""))[:200],
            token_count=_int(row.get("token_count", "0")),
            model=str(row.get("model", "")),
        )
        count += 1
    return count


async def migrate_case_progress(rows: list[dict]) -> int:
    count = 0
    for row in rows:
        student_id = row.get("student_id", "").strip()
        case_id = row.get("case_id", "").strip()
        if not student_id or not case_id:
            continue
        await db.insert_case_result(
            student_id=student_id,
            case_id=case_id,
            total_score=_int(row.get("total_score", "0")),
            passed=_bool(row.get("passed", "false")),
        )
        count += 1
    return count


async def main() -> None:
    print("EyeBot — Sheets → Supabase migration\n")

    print("Reading snec_auth from Sheets...")
    auth_rows = get_rows("snec_auth")
    n = await migrate_auth(auth_rows)
    print(f"  ✓ Migrated {n} auth rows")

    print("Reading snec_profiles from Sheets...")
    profile_rows = get_rows("snec_profiles")
    n = await migrate_profiles(profile_rows)
    print(f"  ✓ Migrated {n} profile rows")

    print("Reading snec_sessions from Sheets...")
    session_rows = get_rows("snec_sessions")
    n = await migrate_sessions(session_rows)
    print(f"  ✓ Migrated {n} session rows")

    print("Reading snec_case_progress from Sheets...")
    case_rows = get_rows("snec_case_progress")
    n = await migrate_case_progress(case_rows)
    print(f"  ✓ Migrated {n} case progress rows")

    print("\n✅ Migration complete. Verify row counts in Supabase Table Editor, then delete this file.")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Run the migration**

```bash
python tools/shared/migrate_sheets_to_supabase.py
```

Expected output:
```
EyeBot — Sheets → Supabase migration

Reading snec_auth from Sheets...
  ✓ Migrated N auth rows
Reading snec_profiles from Sheets...
  ✓ Migrated N profile rows
...
✅ Migration complete.
```

- [ ] **Step 3: Verify row counts in Supabase**

Open Supabase Table Editor. Confirm row counts in `student_auth`, `student_profiles`, `chat_sessions`, `case_progress` match the Google Sheets row counts.

- [ ] **Step 4: Delete the migration script and commit**

```bash
rm tools/shared/migrate_sheets_to_supabase.py
git add -A
git commit -m "chore: run Sheets→Supabase migration; delete one-time migration script"
```

---

## Task 12: JWT cookies — update jwt_utils.py

**Files:**
- Modify: `tools/shared/jwt_utils.py`

- [ ] **Step 1: Add cookie imports**

In `tools/shared/jwt_utils.py`, add to the imports:
```python
from fastapi import Cookie, Response
```

- [ ] **Step 2: Replace get_current_user**

Find the current `get_current_user` function (reads from `authorization` Header) and replace it entirely:

```python
def get_current_user(eyebot_token: str | None = Cookie(None)) -> CurrentUser:
    """FastAPI dependency: extracts and verifies JWT from the eyebot_token cookie."""
    if not eyebot_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_token(eyebot_token)
```

- [ ] **Step 3: Add set_auth_cookie and clear_auth_cookie helpers**

At the bottom of `jwt_utils.py`, add:

```python
def set_auth_cookie(response: Response, token: str) -> None:
    """Write the JWT to an HttpOnly cookie on the response."""
    is_production = os.getenv("ENVIRONMENT", "development") == "production"
    response.set_cookie(
        key="eyebot_token",
        value=token,
        httponly=True,
        secure=is_production,
        samesite="lax",
        max_age=_EXPIRE_HOURS * 3600,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    """Delete the eyebot_token cookie."""
    response.delete_cookie(key="eyebot_token", path="/")
```

- [ ] **Step 4: Remove the old Authorization header dependency**

Remove the `authorization: str | None = Header(None)` import from `jwt_utils.py` if it is no longer used elsewhere. The `Header` import can be removed from the FastAPI imports line.

- [ ] **Step 5: Update test_jwt_utils.py**

In `tests/shared/test_jwt_utils.py`, tests that test `get_current_user` currently call it with an `authorization` string. Update them to call with `eyebot_token`:

```python
# OLD:
result = get_current_user(authorization="Bearer <token>")

# NEW:
result = get_current_user(eyebot_token="<token>")

# OLD (missing header test):
with pytest.raises(HTTPException) as exc:
    get_current_user(authorization=None)

# NEW:
with pytest.raises(HTTPException) as exc:
    get_current_user(eyebot_token=None)
```

- [ ] **Step 6: Run jwt tests**

```bash
python -m pytest tests/shared/test_jwt_utils.py -v
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add tools/shared/jwt_utils.py tests/shared/test_jwt_utils.py
git commit -m "feat: move JWT auth from Authorization header to HttpOnly eyebot_token cookie"
```

---

## Task 13: JWT cookies — auth router login and logout

**Files:**
- Modify: `tools/api/routers/auth.py`

- [ ] **Step 1: Add imports to auth.py**

Add to the imports in `auth.py`:
```python
from fastapi import Response
from tools.shared.jwt_utils import create_access_token, get_current_user, CurrentUser, set_auth_cookie, clear_auth_cookie
```

- [ ] **Step 2: Update login endpoint to set cookie**

Find the login endpoint (the one that calls `create_access_token`). Add `response: Response` as a parameter and call `set_auth_cookie`:

```python
@router.post("/api/auth/login")
async def auth_login(body: LoginRequest, response: Response):
    # ... existing auth logic ...
    token = create_access_token(student_id, role, student_role)
    set_auth_cookie(response, token)
    # Return everything EXCEPT the token
    return {
        "student_id": student_id,
        "full_name": full_name,
        "role": role,
        "student_role": student_role,
        "must_change_password": must_change,
    }
```

Remove the `"token": token` field from the return dict.

- [ ] **Step 3: Add logout endpoint**

Add this new endpoint to `auth.py`:

```python
@router.post("/api/auth/logout")
async def auth_logout(response: Response):
    """Clear the auth cookie and end the session."""
    clear_auth_cookie(response)
    return {"ok": True}
```

- [ ] **Step 4: Run auth tests**

```bash
python -m pytest tests/api/test_auth_endpoints.py -v
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/auth.py
git commit -m "feat: login sets HttpOnly cookie; add POST /api/auth/logout endpoint"
```

---

## Task 14: server.py — CORS allow_credentials, CSP header, ENVIRONMENT

**Files:**
- Modify: `tools/api/server.py`
- Modify: `.env.template`

- [ ] **Step 1: Add allow_credentials to CORS middleware**

In `tools/api/server.py`, find the `CORSMiddleware` call and add `allow_credentials=True`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)
```

- [ ] **Step 2: Add Content-Security-Policy to security headers middleware**

In the `add_security_headers` middleware function, add the CSP header:

```python
response.headers["Content-Security-Policy"] = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "frame-ancestors 'none'"
)
```

- [ ] **Step 3: Add ENVIRONMENT to .env.template**

Open `.env.template` and add at the top:

```
# Deployment environment — set to "production" on the live server
ENVIRONMENT=development
```

- [ ] **Step 4: Add ENVIRONMENT=development to your local .env**

Open `.env` and add:
```
ENVIRONMENT=development
```

- [ ] **Step 5: Run full test suite**

```bash
python -m pytest tests/ -q
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add tools/api/server.py .env.template
git commit -m "feat: CORS allow_credentials=True; add CSP header; add ENVIRONMENT env var"
```

---

## Task 15: Frontend — AuthContext.tsx cookie-based auth

**Files:**
- Modify: `frontend/src/app/components/AuthContext.tsx`

- [ ] **Step 1: Read the current AuthContext.tsx**

Open `frontend/src/app/components/AuthContext.tsx` and read it fully.

- [ ] **Step 2: Remove token storage and authHeaders**

Make these changes:

1. Remove `token` from the `User` type/interface
2. Remove `authHeaders` from the context type and value
3. Remove `sessionStorage.setItem("eyebot_user", JSON.stringify({...token...}))` — keep other user metadata in sessionStorage but never the token
4. Update `logout` to call `POST /api/auth/logout` before clearing local state:

```tsx
const logout = async () => {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    // best-effort
  }
  sessionStorage.removeItem("eyebot_user");
  setUser(null);
};
```

5. Remove the `authHeaders` computation block entirely:
```tsx
// DELETE this block entirely:
const authHeaders: Record<string, string> = user?.token
  ? { Authorization: `Bearer ${user.token}` }
  : {};
```

6. Remove `authHeaders` from the context value object passed to the Provider.

- [ ] **Step 3: Update the login fetch call in AuthContext**

The login response no longer returns a `token` field. Remove any code that reads `data.token` and stores it. Only read `student_id`, `full_name`, `role`, `student_role`, `must_change_password` from the response.

The login fetch call itself needs `credentials: "include"` so the browser accepts the Set-Cookie response:

```tsx
const res = await fetch("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ email, password }),
});
```

- [ ] **Step 4: Remove authHeaders from all component imports**

Search for `const { ..., authHeaders, ... } = useAuth()` across all components and remove `authHeaders` from the destructuring. This will cause TypeScript errors that guide you to the fetch calls to fix in Task 16.

- [ ] **Step 5: Build to confirm TypeScript errors are authHeaders-related only**

```bash
cd frontend && pnpm build 2>&1 | grep -i error
```

You should see errors about `authHeaders` not existing — these are the fetch calls to fix in Task 16.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/components/AuthContext.tsx
git commit -m "feat: remove JWT from sessionStorage; logout calls /api/auth/logout; drop authHeaders from AuthContext"
```

---

## Task 16: Frontend — replace authHeaders with credentials: "include" in all components

**Files:**
- Modify: Every frontend component that makes API calls (13 components listed in the Files table above)

The pattern is identical in every file. Apply it systematically.

- [ ] **Step 1: Apply the pattern to every component**

For every `fetch()` call in the frontend, make two changes:
1. Remove `...authHeaders` from the `headers` object (or remove the `headers` object entirely if it only contained `authHeaders`)
2. Add `credentials: "include"` to the fetch options

**Pattern A — fetch with only authHeaders in headers:**
```tsx
// BEFORE:
fetch("/api/endpoint", { headers: { ...authHeaders } })

// AFTER:
fetch("/api/endpoint", { credentials: "include" })
```

**Pattern B — fetch with Content-Type and authHeaders:**
```tsx
// BEFORE:
fetch("/api/endpoint", {
  method: "POST",
  headers: { "Content-Type": "application/json", ...authHeaders },
  body: JSON.stringify(payload),
})

// AFTER:
fetch("/api/endpoint", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify(payload),
})
```

**Pattern C — FormData with authHeaders:**
```tsx
// BEFORE:
fetch("/api/endpoint", { method: "POST", headers: { ...authHeaders }, body: form })

// AFTER:
fetch("/api/endpoint", { method: "POST", credentials: "include", body: form })
```

Apply to all files: `AdminDashboard.tsx`, `AdminStudentDetail.tsx`, `CaseListScreen.tsx`, `CaseSessionScreen.tsx`, `ChangePasswordModal.tsx`, `ChatScreen.tsx`, `DailyCheckInScreen.tsx`, `DashboardScreen.tsx`, `FlashcardScreen.tsx`, `OnboardingScreen.tsx`, `ProgressScreen.tsx`, `StudentDrillDown.tsx`, `SupervisorDashboard.tsx`.

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd frontend && pnpm build
```

Expected: clean build, no errors about `authHeaders`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/
git commit -m "feat: replace authHeaders with credentials: include across all frontend fetch calls"
```

---

## Task 17: Final verification and push

- [ ] **Step 1: Run the full test suite**

```bash
python -m pytest tests/ -v 2>&1 | tail -15
```

Expected: 105 tests pass.

- [ ] **Step 2: Start the dev server and verify manually**

```bash
# Terminal 1: backend
uvicorn tools.api.server:app --reload --port 8000

# Terminal 2: frontend
cd frontend && pnpm dev
```

Open http://localhost:5173 and verify:
1. Login → DevTools → Application → Cookies → `eyebot_token` present, `HttpOnly` checked, not visible in `document.cookie`
2. Navigate to Cases → cases load from Supabase (check Supabase Table Editor for no new Sheets traffic)
3. Submit a case → row appears in `case_progress` table in Supabase
4. Complete check-in → `checkin_done_today` updates to `true` in `student_profiles` in Supabase
5. DevTools → Network → any response → `Content-Security-Policy` header present
6. Logout → `eyebot_token` cookie gone → redirected to login

- [ ] **Step 3: Push to origin**

```bash
git push
```

---

## Self-Review

### Spec coverage
| Requirement | Task |
|---|---|
| 4 tables migrated to Supabase PostgreSQL | Tasks 1, 3, 5, 6, 7, 8 |
| Async db.py module with typed API | Task 3 |
| Remaining Sheets calls wrapped in asyncio.to_thread | Task 4, 9 |
| Route handlers made async | Task 8, 9 |
| One-time data migration script | Task 11 |
| JWT moved to HttpOnly cookie | Tasks 12, 13 |
| Login sets cookie; logout clears it | Task 13 |
| CORS allow_credentials=True | Task 14 |
| CSP header added | Task 14 |
| ENVIRONMENT env var | Task 14 |
| Frontend authHeaders removed | Tasks 15, 16 |
| student_id trust fixed (body → JWT sub) | Task 8 |
| Test suite updated for new interfaces | Tasks 2, 10 |

### Placeholder scan
No TBD, TODO, or vague steps present.

### Type consistency
- `db.get_profile()` returns `dict | None` — used consistently in Task 5 and tested in Task 2
- `db.get_auth()` returns `dict | None` — used in Task 8 and tested in Task 2
- `set_auth_cookie(response, token)` defined in Task 12, called in Task 13
- `get_case_progress` returns `list[dict]` — consistent across Tasks 7 and 8
- Cookie name `eyebot_token` used consistently in Tasks 12, 13, 15
