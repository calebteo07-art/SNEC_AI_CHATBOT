# Admin Dashboard & Password Auth — Design Spec

**Date:** 2026-05-27
**Status:** Approved for implementation

---

## Context

Lecturers and course coordinators at SNEC need to monitor student progress, usage, and gaps without going through Google Sheets or asking the dev. They also need to create and manage student accounts themselves, including bulk onboarding at intake. Students, admins, and lecturers all need password-based login so accounts are properly secured, and users can change their own password after first login.

The current system has no password auth — identity is just email + name with no verification. The existing `AdminDashboard.tsx` has basic access control and a student list, but no detail view, no token visibility, and no CSV import.

---

## Architecture Overview

### Files changed / created

**Frontend**
- `frontend/src/app/components/AdminDashboard.tsx` — expand from 3 tabs to 4, add CSV import, token column
- `frontend/src/app/components/AdminStudentDetail.tsx` — new modal: stats header + 3 sub-tabs
- `frontend/src/app/components/OnboardingScreen.tsx` — replace name/email form with email + password login; keep PDPA + role steps for new users
- `frontend/src/app/components/ChangePasswordModal.tsx` — new modal for changing password in-app
- `frontend/src/app/routes.tsx` — add `AdminGuard` wrapper on `/admin` route
- `frontend/src/app/components/AuthContext.tsx` — add `mustChangePassword` flag to User type

**Backend**
- `tools/api/server.py` — add 4 new endpoints, update `/api/onboard` to verify password
- `tools/shared/auth.py` — new: password hashing (bcrypt) and verification helpers
- `tools/profile/get_profile.py` — no change needed

---

## Auth System

### Password storage
New Google Sheet: `snec_auth`
| Column | Type | Notes |
|---|---|---|
| `email` | string | primary key (lowercase) |
| `password_hash` | string | bcrypt hash |
| `must_change` | string | "true" / "false" — set true on admin-created accounts |

Passwords are hashed with bcrypt (cost factor 12) via `tools/shared/auth.py`. Plain-text passwords are never stored or logged.

### Login flow (replaces current onboarding step 1)

**Returning user:**
1. User enters email + password on `OnboardingScreen`
2. `POST /api/auth/login` verifies credentials → returns `{student_id, role, student_role, must_change, is_new}`
3. If `must_change: true` → show `ChangePasswordModal` before proceeding
4. Navigate to `/checkin` or `/dashboard` as before

**New user (first login after admin adds them):**
1. Same login step
2. After credential check, `is_new: true` → show PDPA consent step
3. Then role selection (or pre-filled from approved list)
4. Navigate to `/dashboard`

**Admin / lecturer login:**
Same flow — no PDPA or role step (role comes back as `"admin"` from the server).

### New backend endpoints for auth

**`POST /api/auth/login`**
```
Body: { email, password }
Response: { student_id, role, student_role, must_change, is_new, mock_mode }
Errors: 401 wrong credentials, 403 not in approved list
```
This endpoint replaces `/api/onboard` as the entry point. It verifies credentials, then runs the same `get_or_create_student` + `record_consent` logic from the old onboard flow (so student identity is created on first successful login). The existing `/api/onboard` endpoint is kept but deprecated — only called internally if needed. Server looks up `snec_auth` for the hash, verifies with bcrypt. If no hash exists for an email (accounts created before this feature), any password is accepted and `must_change: true` is returned so the user is forced to set a real password.

**`POST /api/auth/change-password`**
```
Body: { student_id, current_password, new_password }
Response: { ok: true }
Errors: 401 wrong current password, 400 password too short (min 8 chars)
```
Updates `snec_auth` row and sets `must_change: false`.

### Admin sets initial password
When adding a student (one-at-a-time or CSV), the system **auto-generates** a random 10-character password (letters + digits). The plain-text password is shown once in the app after the account is created (copy-to-clipboard button) so the admin can hand it to the student at intake. Simultaneously, the app emails the student their login credentials automatically using the existing Gmail sender (`tools/shared/gmail_sender.py`). The hash is stored in `snec_auth` with `must_change: true`.

For CSV bulk import: passwords are auto-generated per row. After import, a summary table is shown in-app listing each student's email + generated password, with a "Download as PDF" option so the admin can print and distribute at intake without any external tool. All students are also emailed their credentials automatically.

---

## Frontend: AdminDashboard.tsx (expanded)

### Route guard
In `routes.tsx`, wrap `/admin` with a new `AdminGuard` component (same pattern as `CheckInGuard`). If `user.role !== "admin"`, redirect to `/dashboard`. This blocks students who navigate directly to the URL.

### Tab 1 — Overview
- 5 stat cards: Total Students, Active This Week, At-Risk Count, Total Tokens Used, Cohort Momentum (velocity label)
- At-risk student list (name, days inactive, weak topic count) — clicking a name opens the student detail modal
- Cohort weak topics with frequency bars (red/amber by count)
- AI narrative (1–2 sentences from existing `/api/supervisor/insights`)

Data sources:
- `/api/supervisor/cohort` — total, active, at_risk_count, weakest_topics
- `/api/supervisor/at-risk` — at-risk list
- `/api/admin/token-summary` — total token count (new endpoint)
- `/api/supervisor/insights` — AI narrative

### Tab 2 — Students
- Search input (filters by name/email client-side)
- Filter chips: All | OA | OT | PSA | At Risk
- Table columns: Name, Email, Role, Sessions, Streak, Tokens Used, Velocity, Last Active
- Click any row → opens `AdminStudentDetail` modal

Data source: `/api/admin/students` (existing, already returns session_count, streak, last_active, learning_velocity, weak_topics). Token count per student comes from `/api/admin/token-summary` (keyed by student_id), merged client-side.

### Tab 3 — Accounts
Two-panel layout at the top:

**Add one student** (left panel): Form with Full Name, Email, Role dropdown, Initial Password field. Submit calls `POST /api/admin/approved` (extended to also write to `snec_auth`).

**Bulk import** (right panel): CSV drop zone. Expected columns: `full_name`, `email`, `role` (no password column — system generates passwords). Drag-and-drop or click to browse. Preview shows row count + validation errors before import. Submit calls `POST /api/admin/upload-csv`. After import, a credentials table appears in-app (name, email, generated password) with a "Download as PDF" button. Students are also auto-emailed their credentials via Gmail API.

Below: Approved students table (name, email, role, activated status, Remove button). Unchanged from current implementation.

Below that: Promote staff section (email + role dropdown → supervisor/admin). Unchanged.

### Tab 4 — Activity
Existing feed, enhanced:
- Token count displayed for chat session items
- Clicking student name opens `AdminStudentDetail` modal
- `/api/admin/activity` already returns this data; token_count needs to be added to the feed items in `server.py`

---

## Frontend: AdminStudentDetail.tsx (new modal)

Full-screen modal (same overlay pattern as existing modals in the app).

### Header
- Avatar circle (initial letter), full name, role label, email
- Active/inactive status badge + learning velocity badge

### Stat row (5 cards)
Sessions · Day Streak · Cases Done · Total Tokens · Last Active

### Sub-tabs

**Sessions tab**
Table: Date | Topic (first user message, truncated 60 chars) | Tokens | Model
Last 30 sessions, most-recent first.
Data: `/api/admin/student/{id}/detail` → `sessions` array.

**Cases tab**
Table: Case Name | Score /40 | Pass/Fail | Date
All attempts shown. Pass rate summary line at top (e.g., "Passed 3 of 5 cases").
Data: `/api/admin/student/{id}/detail` → `cases` array.

**Topics & Gaps tab**
- Retention score bar per topic (colour-coded: red < 65%, amber 65–79%, green ≥ 80%)
- Missed clinical findings list (plain text bullets)
- Learning velocity label
Data: `/api/admin/student/{id}/detail` → `retention_scores`, `missed_findings`, `learning_velocity`.

### Lecturer note
Editable text area at the bottom. Pre-filled with existing `supervisor_note`. Save calls existing `PATCH /api/supervisor/student/{id}/note`.

---

## Frontend: ChangePasswordModal.tsx (new)

Triggered in two situations:
1. **Forced** — immediately after login when `must_change: true`, before the user reaches any other screen
2. **Voluntary** — accessible from the dashboard via a "Change password" option in the user menu / profile area

Form fields: Current password, New password (min 8 chars), Confirm new password.
Calls `POST /api/auth/change-password`. On success, clears `must_change` flag in session and proceeds normally.

---

## Backend: New Endpoints

### `GET /api/admin/student/{student_id}/detail`
Protected by `_require_admin`. Returns:
```python
{
  "student_id": str,
  "full_name": str,
  "email": str,
  "role": str,
  "session_count": int,
  "streak": int,
  "last_active": str,
  "learning_velocity": str,
  "weak_topics": list[str],
  "missed_findings": list[str],
  "retention_scores": dict,          # topic -> float
  "supervisor_note": str,
  "sessions": [                       # last 30, newest first
    { "session_id", "timestamp", "topic", "summary", "token_count", "model" }
  ],
  "cases": [                          # all completions
    { "case_id", "total_score", "passed", "completed_at" }
  ],
  "total_tokens": int                 # sum of token_count across all sessions
}
```
Pulls from: `get_profile()`, `get_rows("snec_sessions")`, `get_rows("snec_case_progress")`.

### `POST /api/admin/upload-csv`
Protected by `_require_admin`. Accepts `multipart/form-data` with a `file` field.
- Parses CSV with `csv.DictReader`
- Expected columns: `full_name`, `email`, `role`, `password` (password optional, defaults to `SNEC2026`)
- Validates: email format, role in (OA, OT, PSA), duplicate check against `snec_approved_students`
- For each valid row: auto-generates a random password, appends to `snec_approved_students`, writes bcrypt hash to `snec_auth` with `must_change: true`, sends welcome email via `gmail_sender`
- Returns: `{ imported: int, skipped: int, errors: [{ row: int, reason: str }], credentials: [{ full_name, email, password }] }`
- Credentials (plain-text, one-time) are returned so the frontend can display the in-app credentials table

### `GET /api/admin/token-summary`
Protected by `_require_admin`.
- Reads all rows from `snec_sessions`
- Sums `token_count` per student_id and overall
- Returns: `{ total_tokens: int, by_student: [{ student_id, tokens }] }`

### `POST /api/admin/approved` (extended)
Existing endpoint — extend to also accept `password` field and write to `snec_auth`.

### `POST /api/auth/login` (new — replaces /api/onboard for credential check)
Unprotected. Verifies email + bcrypt password, returns identity.

### `POST /api/auth/change-password` (new)
Unprotected (student identifies via student_id). Verifies current password, updates hash, clears `must_change`.

---

## New Python dependency

Add to `requirements.txt`:
```
bcrypt>=4.0
python-multipart>=0.0.9   # for CSV file upload (FastAPI)
```

`python-multipart` may already be installed (FastAPI needs it for form data).

---

## Verification

1. **Login flow**: Register a test student via admin Accounts tab with a known password. Log in at `/` with that email + password. Confirm redirect to check-in. Confirm `must_change` prompt appears. Change password. Log in again with new password — confirm it works.
2. **Student blocked from admin**: Log in as a student. Navigate to `/admin` manually. Confirm redirect to `/dashboard`.
3. **Admin detail modal**: In Students tab, click a student row. Confirm modal opens with correct stats, sessions (with token counts), case history, and topic bars.
4. **CSV import**: Upload a CSV with valid rows + one intentional error row. Confirm error is reported, valid rows are imported, all imported students can log in.
5. **Password change**: Log in, open ChangePasswordModal, enter wrong current password — confirm rejection. Enter correct current password + new password — confirm success and re-login with new password works.
6. **Token summary**: Confirm Overview tab stat card shows non-zero total tokens matching sum across sessions.
