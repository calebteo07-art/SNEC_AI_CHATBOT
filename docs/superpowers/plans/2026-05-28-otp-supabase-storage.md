# OTP Supabase Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-memory `_reset_tokens` dict in the FastAPI server with a Supabase-backed OTP store that survives restarts, works across multiple server processes, and never stores OTPs in plaintext.

**Architecture:** A new `tools/shared/otp_store.py` module owns all OTP lifecycle logic — SHA-256 hashing before write, constant-time hash comparison on verify, upsert semantics so a second request-reset overwrites the first. The server endpoints become thin callers of three public functions (`set_otp`, `verify_and_consume_otp`, `delete_otp`). The Supabase `password_reset_otps` table acts as the single source of truth, keyed by email, with a `timestamptz` expiry column checked at verify time.

**Tech Stack:** Python `hashlib` (SHA-256), `hmac.compare_digest` (constant-time comparison), `datetime`/`timezone` (expiry), `supabase>=2.4.0` (already installed), `pytest` + `unittest.mock.patch` (tests)

---

## Files Modified / Created

| Action | Path | Purpose |
|--------|------|---------|
| Manual step | Supabase SQL editor | Create `password_reset_otps` table |
| Create | `tools/shared/otp_store.py` | Three public OTP lifecycle functions |
| Create | `tests/shared/test_otp_store.py` | Unit tests for `otp_store` (mocked Supabase) |
| Modify | `tools/api/server.py:162` | Delete `_reset_tokens` global |
| Modify | `tools/api/server.py` imports | Add import of `set_otp`, `verify_and_consume_otp` |
| Modify | `tools/api/server.py` auth_request_reset | Replace dict write with `set_otp(email, otp)` |
| Modify | `tools/api/server.py` auth_reset_password | Replace dict read/check/pop block with `verify_and_consume_otp` |
| Modify | `tests/api/test_auth_endpoints.py` | Add reset-flow tests patching `otp_store` functions |

---

## Task 1: Create the Supabase table (manual step — must complete before running code)

**Files:**
- Manual: Supabase SQL editor

- [ ] **Step 1: Open the Supabase SQL editor for your project**

Log in to https://supabase.com, open your project, and navigate to **SQL Editor** in the left sidebar.

- [ ] **Step 2: Run the CREATE TABLE statement**

Paste and run the following SQL exactly:

```sql
CREATE TABLE IF NOT EXISTS password_reset_otps (
    email       text        PRIMARY KEY,
    otp_hash    text        NOT NULL,
    expires_at  timestamptz NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 3: Verify the table exists**

In the Supabase **Table Editor**, confirm `password_reset_otps` appears with the four columns listed above. No rows should be present yet.

- [ ] **Step 4: Confirm RLS is disabled (service role bypasses it, but verify)**

In the Supabase dashboard, under **Authentication > Policies**, confirm there are no blocking policies on `password_reset_otps`. The server uses the `SUPABASE_SERVICE_ROLE_KEY` which bypasses Row Level Security entirely, so this is a safety check only.

---

## Task 2: Write tests for `otp_store` (TDD — write tests before implementation)

**Files:**
- Create: `tests/shared/test_otp_store.py`

- [ ] **Step 1: Create the test file**

Create `tests/shared/test_otp_store.py`:

```python
# tests/shared/test_otp_store.py
"""Unit tests for tools.shared.otp_store.

The Supabase client is fully mocked — these tests never hit the network.
"""
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _future_iso(minutes: int = 15) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


def _past_iso(minutes: int = 1) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()


def _make_mock_client(select_data: list[dict] | None = None):
    """Return a mock Supabase client whose table().upsert/select/delete chain works."""
    mock_client = MagicMock()

    # Chain: client.table(...).upsert(...).execute()
    mock_execute = MagicMock(return_value=MagicMock(data=[]))
    mock_client.table.return_value.upsert.return_value.execute = mock_execute

    # Chain: client.table(...).select(...).eq(...).execute()
    select_result = MagicMock(data=select_data if select_data is not None else [])
    mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = select_result

    # Chain: client.table(...).delete().eq(...).execute()
    mock_client.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock(data=[])

    return mock_client


# ---------------------------------------------------------------------------
# set_otp
# ---------------------------------------------------------------------------

def test_set_otp_upserts_hash_not_plaintext():
    """set_otp must store the SHA-256 hash of the OTP, never the plaintext."""
    mock_client = _make_mock_client()

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import set_otp
        set_otp("alice@test.com", "123456")

    upsert_call_args = mock_client.table.return_value.upsert.call_args
    row = upsert_call_args[0][0]

    assert row["email"] == "alice@test.com"
    assert row["otp_hash"] == _sha256("123456")
    assert "123456" not in str(row)


def test_set_otp_stores_future_expiry():
    """set_otp must store an expires_at approximately 15 minutes in the future."""
    mock_client = _make_mock_client()

    before = datetime.now(timezone.utc)
    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import set_otp
        set_otp("bob@test.com", "999999")
    after = datetime.now(timezone.utc)

    upsert_call_args = mock_client.table.return_value.upsert.call_args
    row = upsert_call_args[0][0]

    expires = datetime.fromisoformat(row["expires_at"])
    assert before + timedelta(minutes=14) < expires < after + timedelta(minutes=16)


def test_set_otp_upserts_on_conflict_email():
    """set_otp must call upsert with on_conflict='email' so a second OTP overwrites the first."""
    mock_client = _make_mock_client()

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import set_otp
        set_otp("carol@test.com", "111111")

    upsert_call = mock_client.table.return_value.upsert.call_args
    kwargs = upsert_call[1]
    assert kwargs.get("on_conflict") == "email"


# ---------------------------------------------------------------------------
# verify_and_consume_otp
# ---------------------------------------------------------------------------

def test_verify_and_consume_correct_otp_returns_true():
    """Correct OTP within the expiry window must return True and delete the row."""
    stored_hash = _sha256("654321")
    row = {"email": "dave@test.com", "otp_hash": stored_hash, "expires_at": _future_iso()}
    mock_client = _make_mock_client(select_data=[row])

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import verify_and_consume_otp
        result = verify_and_consume_otp("dave@test.com", "654321")

    assert result is True
    mock_client.table.return_value.delete.return_value.eq.assert_called_once_with(
        "email", "dave@test.com"
    )


def test_verify_and_consume_wrong_otp_returns_false():
    """Wrong OTP must return False and must NOT delete the row."""
    stored_hash = _sha256("correct")
    row = {"email": "eve@test.com", "otp_hash": stored_hash, "expires_at": _future_iso()}
    mock_client = _make_mock_client(select_data=[row])

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import verify_and_consume_otp
        result = verify_and_consume_otp("eve@test.com", "wrong_otp")

    assert result is False
    mock_client.table.return_value.delete.assert_not_called()


def test_verify_and_consume_expired_otp_returns_false():
    """Expired OTP must return False and delete the row (clean up stale data)."""
    stored_hash = _sha256("777777")
    row = {"email": "frank@test.com", "otp_hash": stored_hash, "expires_at": _past_iso()}
    mock_client = _make_mock_client(select_data=[row])

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import verify_and_consume_otp
        result = verify_and_consume_otp("frank@test.com", "777777")

    assert result is False
    mock_client.table.return_value.delete.return_value.eq.assert_called_once_with(
        "email", "frank@test.com"
    )


def test_verify_and_consume_no_row_returns_false():
    """No row in DB must return False without attempting a delete."""
    mock_client = _make_mock_client(select_data=[])

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import verify_and_consume_otp
        result = verify_and_consume_otp("ghost@test.com", "000000")

    assert result is False
    mock_client.table.return_value.delete.assert_not_called()


# ---------------------------------------------------------------------------
# delete_otp
# ---------------------------------------------------------------------------

def test_delete_otp_calls_delete_on_correct_email():
    """delete_otp must issue a DELETE filtered by email."""
    mock_client = _make_mock_client()

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import delete_otp
        delete_otp("grace@test.com")

    mock_client.table.return_value.delete.return_value.eq.assert_called_once_with(
        "email", "grace@test.com"
    )
    mock_client.table.return_value.delete.return_value.eq.return_value.execute.assert_called_once()


# ---------------------------------------------------------------------------
# Upsert overwrites
# ---------------------------------------------------------------------------

def test_set_otp_twice_overwrites_first():
    """Calling set_otp twice for the same email must call upsert twice."""
    mock_client = _make_mock_client()

    with patch("tools.shared.otp_store.get_client", return_value=mock_client):
        from tools.shared.otp_store import set_otp
        set_otp("henry@test.com", "111111")
        set_otp("henry@test.com", "222222")

    assert mock_client.table.return_value.upsert.call_count == 2
    second_call_row = mock_client.table.return_value.upsert.call_args_list[1][0][0]
    assert second_call_row["otp_hash"] == _sha256("222222")
```

- [ ] **Step 2: Run the tests to verify they all fail (implementation doesn't exist yet)**

```
pytest tests/shared/test_otp_store.py -v
```

Expected: all FAIL with `ModuleNotFoundError: No module named 'tools.shared.otp_store'`.

---

## Task 3: Implement `tools/shared/otp_store.py`

**Files:**
- Create: `tools/shared/otp_store.py`

- [ ] **Step 1: Create the implementation file**

```python
#!/usr/bin/env python3
"""OTP store backed by Supabase — replaces the in-memory _reset_tokens dict.

Public API:
    set_otp(email, otp)                — upsert SHA-256 hash + 15-min expiry
    verify_and_consume_otp(email, otp) — check hash+expiry, delete row on success
    delete_otp(email)                  — unconditional row delete
"""

import hashlib
import hmac
from datetime import datetime, timedelta, timezone

from tools.kb.supabase_client import get_client

_TABLE = "password_reset_otps"
_TTL_MINUTES = 15


def _hash(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()


def set_otp(email: str, otp: str) -> None:
    """Upsert a hashed OTP with a 15-minute expiry for the given email."""
    client = get_client()
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=_TTL_MINUTES)).isoformat()
    client.table(_TABLE).upsert(
        {
            "email": email,
            "otp_hash": _hash(otp),
            "expires_at": expires_at,
        },
        on_conflict="email",
    ).execute()


def verify_and_consume_otp(email: str, otp: str) -> bool:
    """Verify the OTP for email. Returns True if valid; deletes the row on True or expiry."""
    client = get_client()
    result = (
        client.table(_TABLE)
        .select("otp_hash,expires_at")
        .eq("email", email)
        .execute()
    )

    if not result.data:
        return False

    row = result.data[0]
    expires_at = datetime.fromisoformat(row["expires_at"])

    if datetime.now(timezone.utc) > expires_at:
        client.table(_TABLE).delete().eq("email", email).execute()
        return False

    if not hmac.compare_digest(row["otp_hash"], _hash(otp)):
        return False

    client.table(_TABLE).delete().eq("email", email).execute()
    return True


def delete_otp(email: str) -> None:
    """Unconditionally delete the OTP row for email. No-op if no row exists."""
    client = get_client()
    client.table(_TABLE).delete().eq("email", email).execute()
```

- [ ] **Step 2: Run the unit tests**

```
pytest tests/shared/test_otp_store.py -v
```

Expected: 9 passed.

- [ ] **Step 3: Commit**

```bash
git add tools/shared/otp_store.py tests/shared/test_otp_store.py
git commit -m "feat: add Supabase-backed OTP store with SHA-256 hashing"
```

---

## Task 4: Wire `otp_store` into `server.py`

**Files:**
- Modify: `tools/api/server.py`

- [ ] **Step 1: Remove the in-memory dict and add the import**

Delete this block (around line 161–162):
```python
# In-memory OTP store: email -> {otp, expires_at}
_reset_tokens: dict[str, dict] = {}
```

Add to the import block:
```python
from tools.shared.otp_store import set_otp, verify_and_consume_otp
```

- [ ] **Step 2: Replace the OTP write in `auth_request_reset`**

Find:
```python
    otp = "".join(str(secrets.randbelow(10)) for _ in range(6))
    _reset_tokens[email] = {
        "otp": otp,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
    }
```

Replace with:
```python
    otp = "".join(str(secrets.randbelow(10)) for _ in range(6))
    set_otp(email, otp)
```

- [ ] **Step 3: Replace the OTP check block in `auth_reset_password`**

Find:
```python
    token_data = _reset_tokens.get(email)
    if not token_data:
        raise HTTPException(status_code=400, detail="No reset code found. Please request a new one.")

    expires_at = datetime.fromisoformat(token_data["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        _reset_tokens.pop(email, None)
        raise HTTPException(status_code=400, detail="Reset code has expired. Please request a new one.")

    if not secrets.compare_digest(token_data["otp"], otp):
        raise HTTPException(status_code=400, detail="Incorrect reset code.")
```

Replace with:
```python
    if not verify_and_consume_otp(email, otp):
        raise HTTPException(status_code=400, detail="Incorrect or expired reset code.")
```

- [ ] **Step 4: Remove the final `_reset_tokens.pop` at end of `auth_reset_password`**

Find and delete:
```python
    _reset_tokens.pop(email, None)
```

(`verify_and_consume_otp` already deletes the row on success.)

- [ ] **Step 5: Verify the server module imports cleanly**

```
python -c "from tools.api.server import app; print('OK')"
```

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add tools/api/server.py
git commit -m "feat: replace in-memory OTP dict with Supabase otp_store in server"
```

---

## Task 5: Update `tests/api/test_auth_endpoints.py`

**Files:**
- Modify: `tests/api/test_auth_endpoints.py`

- [ ] **Step 1: Verify no `_reset_tokens` references exist in the test file**

```
python -c "
import pathlib
text = pathlib.Path('tests/api/test_auth_endpoints.py').read_text()
matches = [l for l in text.splitlines() if '_reset_tokens' in l]
print(matches if matches else 'CLEAN')
"
```

Expected: `CLEAN`. If any lines print, delete them.

- [ ] **Step 2: Append reset-password flow tests to the end of the test file**

```python


# ---------------------------------------------------------------------------
# /api/auth/request-reset and /api/auth/reset-password
# ---------------------------------------------------------------------------

def test_request_reset_returns_ok_for_approved_user():
    """request-reset returns {"ok": True} for a known approved email."""
    approved_row = {"email": "reset@test.com", "full_name": "Reset User", "role": "OA"}

    def mock_get_rows(sheet, filters=None):
        if sheet == "snec_approved_students":
            return [approved_row]
        return []

    with patch("tools.api.server.get_rows", mock_get_rows), \
         patch("tools.api.server.set_otp") as mock_set_otp, \
         patch("tools.shared.gmail_sender.send_email", side_effect=Exception("email disabled")):
        r = client.post("/api/auth/request-reset", json={"email": "reset@test.com"})

    assert r.status_code == 200
    assert r.json()["ok"] is True
    mock_set_otp.assert_called_once()
    assert mock_set_otp.call_args[0][0] == "reset@test.com"


def test_request_reset_returns_ok_for_unknown_email():
    """request-reset returns {"ok": True} even for unknown emails (no enumeration)."""
    with patch("tools.api.server.get_rows", return_value=[]):
        r = client.post("/api/auth/request-reset", json={"email": "nobody@test.com"})
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_reset_password_success():
    """Valid OTP and new password updates auth row and returns {"ok": True}."""
    with patch("tools.api.server.verify_and_consume_otp", return_value=True), \
         patch("tools.api.server.update_row", return_value=True):
        r = client.post("/api/auth/reset-password", json={
            "email": "reset@test.com",
            "otp": "123456",
            "new_password": "newpassword1",
        })
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_reset_password_wrong_or_expired_otp_returns_400():
    """Invalid OTP must return 400."""
    with patch("tools.api.server.verify_and_consume_otp", return_value=False):
        r = client.post("/api/auth/reset-password", json={
            "email": "reset@test.com",
            "otp": "000000",
            "new_password": "newpassword1",
        })
    assert r.status_code == 400
    assert "Incorrect or expired" in r.json()["detail"]


def test_reset_password_too_short_returns_400():
    """Password shorter than 8 chars must return 400 even when OTP is valid."""
    with patch("tools.api.server.verify_and_consume_otp", return_value=True):
        r = client.post("/api/auth/reset-password", json={
            "email": "reset@test.com",
            "otp": "123456",
            "new_password": "short",
        })
    assert r.status_code == 400
    assert "8 characters" in r.json()["detail"]
```

- [ ] **Step 3: Run the full auth endpoint test suite**

```
pytest tests/api/test_auth_endpoints.py -v
```

Expected: all previously passing tests pass, plus 5 new ones — 14 total.

- [ ] **Step 4: Run the full test suite**

```
pytest --tb=short -q
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/api/test_auth_endpoints.py
git commit -m "test: add reset-password endpoint tests using otp_store mocks"
```
