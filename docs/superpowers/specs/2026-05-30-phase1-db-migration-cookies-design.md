# EyeBot Phase 1: Database Migration + JWT Cookies Design Spec

## Context

EyeBot currently uses Google Sheets as its primary data store for all student data. Every API request fetches the entire sheet into memory and filters in Python — an O(n) full-table scan on every read. At 100 concurrent students this becomes the primary failure point. Additionally, JWT tokens are stored in `sessionStorage`, which is readable by any JavaScript running on the page (XSS risk). This spec covers the migration of the 4 highest-frequency tables to Supabase PostgreSQL, the replacement of blocking synchronous Sheets I/O with `asyncio.to_thread`, JWT migration to HttpOnly cookies, and a Content Security Policy header.

**Outcome:** The app runs on a real relational database with indexed queries, the event loop is never blocked by I/O, and tokens are invisible to JavaScript.

---

## Scope

### Tables migrating to Supabase PostgreSQL
| Old Sheet | New Table | Why critical |
|---|---|---|
| `snec_auth` | `student_auth` | Read on every login and password change |
| `snec_profiles` | `student_profiles` | Read on every API request |
| `snec_sessions` | `chat_sessions` | Written after every chat session |
| `snec_case_progress` | `case_progress` | Read on every case load (difficulty locks) |

### Tables staying on Google Sheets (low frequency, no bottleneck)
`snec_approved_students`, `snec_supervisors`, `snec_consent`, `snec_flashcards`, `snec_supervisor_alerts`
These get wrapped in `asyncio.to_thread()` so they no longer block the event loop.

---

## Database Schema

Run once in Supabase SQL Editor before any code changes.

```sql
-- Authentication
CREATE TABLE student_auth (
    email           text PRIMARY KEY,
    password_hash   text NOT NULL,
    must_change     boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Student learning state
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

-- Chat session logs
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

-- Clinical case completion records
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

---

## Architecture

### New file: `tools/shared/db.py`

Owns all PostgreSQL reads and writes for the 4 migrated tables. All functions are `async`. JSONB columns are returned as native Python dicts/lists — no `json.loads()` in callers.

**Public API:**

```python
# student_auth
async def get_auth(email: str) -> dict | None
async def upsert_auth(email: str, password_hash: str, must_change: bool) -> None
async def update_auth(email: str, **fields) -> None

# student_profiles
async def get_profile(student_id: str) -> dict | None
async def upsert_profile(student_id: str, **fields) -> None
async def update_profile(student_id: str, **fields) -> None

# chat_sessions
async def insert_session(student_id: str, topic: str, summary: str, token_count: int, model: str) -> None
async def get_sessions(student_id: str, limit: int = 20) -> list[dict]

# case_progress
async def insert_case_result(student_id: str, case_id: str, total_score: int, passed: bool) -> None
async def get_case_results(student_id: str) -> list[dict]
```

Implementation uses the `supabase-py` 2.x async client (`AsyncClient` from `supabase`). This is already installed, already configured via `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, and avoids setting up a raw `asyncpg` connection pool. A module-level `AsyncClient` singleton is initialised once on first call.

### Modified: `tools/shared/gsheets.py`

Add async wrappers for the 3 public functions. Callers in admin/supervisor/consent routers switch to `_async` variants:

```python
async def get_rows_async(sheet_name: str, filters: dict | None = None) -> list[dict]:
    return await asyncio.to_thread(get_rows, sheet_name, filters)

async def append_row_async(sheet_name: str, row: dict) -> None:
    await asyncio.to_thread(append_row, sheet_name, row)

async def update_row_async(sheet_name: str, key_col: str, key_val: str, updates: dict) -> None:
    await asyncio.to_thread(update_row, sheet_name, key_col, key_val, updates)
```

Sync functions remain intact — no breaking changes to any callers that haven't been updated yet.

### Files updated to use `db.py`

| File | Change |
|---|---|
| `tools/api/routers/auth.py` | `get_rows("snec_auth")` → `await db.get_auth(email)` |
| `tools/profile/get_profile.py` | `get_rows("snec_profiles")` → `await db.get_profile(sid)` |
| `tools/profile/update_profile.py` | `update_row("snec_profiles")` → `await db.update_profile(sid, ...)` |
| `tools/chatbot/log_session.py` | `append_row("snec_sessions")` → `await db.insert_session(...)` |
| `tools/cases/log_case_completion.py` | `append_row("snec_case_progress")` → `await db.insert_case_result(...)` |
| `tools/cases/get_case_progress.py` | `get_rows("snec_case_progress")` → `await db.get_case_results(sid)` |

### Files updated to use `_async` Sheets wrappers

`tools/api/routers/admin.py`, `tools/api/routers/supervisor.py`, `tools/api/routers/checkin.py`, `tools/api/routers/student.py`

---

## JWT Cookies

### Backend — `tools/shared/jwt_utils.py`

Replace `Authorization` header dependency with cookie dependency:

```python
from fastapi import Cookie

def get_current_user(eyebot_token: str | None = Cookie(None)) -> CurrentUser:
    if not eyebot_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_token(eyebot_token)

def set_auth_cookie(response: Response, token: str) -> None:
    # secure=True required in production (HTTPS); False in local HTTP dev
    is_production = os.getenv("ENVIRONMENT", "development") == "production"
    response.set_cookie(
        key="eyebot_token",
        value=token,
        httponly=True,
        secure=is_production,
        samesite="lax",
        max_age=int(os.getenv("JWT_EXPIRE_HOURS", "8")) * 3600,
        path="/",
    )

def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key="eyebot_token", path="/")
```

`require_supervisor` and `require_admin` chain from `get_current_user` unchanged.

### Backend — `tools/api/routers/auth.py`

- Login endpoint: call `set_auth_cookie(response, token)` before returning
- New `POST /api/auth/logout` endpoint: call `clear_auth_cookie(response)`, return 200
- Remove token from JSON response body (no longer needed by frontend)

### Backend — `tools/api/server.py`

CORS middleware gets `allow_credentials=True`. Required for cookies to be sent on cross-origin requests (Vite dev server on port 5173 → FastAPI on port 8000):

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,          # ← add this
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)
```

Add CSP to the security headers middleware:
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

### Frontend — `AuthContext.tsx`

- Remove `token` field from `User` type and state
- Remove `authHeaders` from context value and all usages
- Login flow reads `studentId`, `fullName`, `role`, `studentRole`, `mustChangePassword` from response — not the token
- Logout calls `POST /api/auth/logout` (clears server cookie) then clears local user state
- `sessionStorage.setItem("eyebot_user", ...)` keeps non-sensitive user metadata; token never touches storage

### Frontend — all fetch calls (~40 locations)

Replace `headers: { ...authHeaders }` with `credentials: "include"`. Pattern:

```ts
// Before
fetch("/api/profile", { headers: { ...authHeaders } })

// After
fetch("/api/profile", { credentials: "include" })

// Before (with body)
fetch("/api/profile/role", {
  method: "PATCH",
  headers: { "Content-Type": "application/json", ...authHeaders },
  body: JSON.stringify(payload),
})

// After
fetch("/api/profile/role", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify(payload),
})
```

Files affected: `AdminDashboard.tsx`, `AdminStudentDetail.tsx`, `CaseListScreen.tsx`, `CaseSessionScreen.tsx`, `ChangePasswordModal.tsx`, `ChatScreen.tsx`, `DailyCheckInScreen.tsx`, `DashboardScreen.tsx`, `FlashcardScreen.tsx`, `OnboardingScreen.tsx`, `ProgressScreen.tsx`, `StudentDrillDown.tsx`, `SupervisorDashboard.tsx`.

---

## student_id Trust Fix

In `tools/api/routers/chat.py`:
- Remove `student_id` field from `ChatRequest` and `EndSessionRequest` Pydantic models
- Replace all `body.student_id` references with `current_user["sub"]`

In all other routers: audit for any remaining `body.student_id` patterns and replace with `current_user["sub"]`.

---

## Data Migration Script

One-time script `tools/shared/migrate_sheets_to_supabase.py` runs before cutover:

1. Reads all rows from `snec_auth`, `snec_profiles`, `snec_sessions`, `snec_case_progress` via gsheets
2. Transforms types: JSON strings → dicts, "true"/"false" → bool, numeric strings → int
3. Bulk-inserts into Supabase PostgreSQL via asyncpg
4. Prints row counts for verification
5. Is deleted after successful migration (like the `fix_snec_auth_schema.py` pattern)

---

## Environment Variables

Add to `.env` and `.env.template`:
```
# Deployment environment (set to "production" on the live server)
ENVIRONMENT=development
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` already exist and are reused for the PostgreSQL tables. No new database credentials needed.

---

## Verification

1. **SQL schema**: Run schema SQL in Supabase SQL Editor → confirm 4 tables appear in Table Editor
2. **Migration script**: Run `python tools/shared/migrate_sheets_to_supabase.py` → verify row counts match Sheets
3. **Backend tests**: `python -m pytest tests/ -q` → all 105 tests pass (mocks operate at router level, unaffected)
4. **Manual login flow**: Login → check Supabase `student_auth` table, confirm `must_change` column is boolean not string
5. **Manual profile flow**: Complete a check-in → confirm `student_profiles.checkin_done_today` is `true` (boolean) in Supabase
6. **Manual case flow**: Submit a case → confirm row in `case_progress` with correct `passed` boolean and `total_score` integer
7. **Cookie verification**: Open DevTools → Application → Cookies → confirm `eyebot_token` is present with `HttpOnly` flag set, absent from JS `document.cookie`
8. **CSP verification**: DevTools → Network → any response → confirm `Content-Security-Policy` header present
9. **No Sheets traffic**: After cutover, confirm Google Sheets API quota usage drops to near-zero for the 4 migrated tables
