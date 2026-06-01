# Spring Cleaning Design Spec

**Date:** 2026-06-01
**Goal:** Fix five silent Sheets-read bugs, delete dead files, untrack build artifacts, slim gsheets.py, and purge completed plan docs — all in one sweep.

---

## Category 1: Fix stale Sheets reads (bugs)

Five tool files still read from tables that were migrated to Supabase in Phases 1–2. They silently return stale or empty data.

### tools/progress/get_progress.py

**Problems:**
- Calls sync `get_profile(student_id)` — now async.
- Calls `get_rows("snec_sessions")` — sessions are in Supabase `chat_sessions`.
- Caller in `chat.py` (`_get_progress(student_id)`) calls it synchronously — needs `await`.

**Fix:**
- Make `get_progress` an `async def`.
- Replace `get_profile(student_id)` with `await get_profile(student_id)`.
- Replace `get_rows("snec_sessions", ...)` with `await db.get_sessions(student_id, limit=30)`.
- Remove `gsheets` import; add `from tools.shared import db`.
- In `tools/api/routers/chat.py`: add `await` before both `_get_progress(student_id)` calls.
- Sessions from `db.get_sessions()` return dicts with `created_at` (timestamptz string), `topic`, `summary`, `session_id` — map these to the existing return shape.

### tools/supervisor/cohort_summary.py

**Problem:** `get_rows("snec_profiles")` — profiles are in Supabase.

**Fix:** Replace with `await db.get_all_profiles()`. Make the function `async`. Callers in `supervisor.py` router already `await` it (router handlers are async).

### tools/supervisor/cohort_benchmarks.py

**Problem:** `get_rows("snec_profiles")` — profiles are in Supabase.

**Fix:** Same pattern — `async def`, `await db.get_all_profiles()`.

### tools/supervisor/at_risk.py

**Problems:**
- `get_rows("snec_profiles")` → `db.get_all_profiles()`
- `get_rows("snec_consent", filters={"student_id": ...})` → `db.get_consent_by_student_id(student_id)`
- `get_rows("snec_case_progress", filters={"student_id": ...})` → `db.get_case_results(student_id)`

**Fix:** `async def`, replace all three, remove gsheets import.

### tools/supervisor/generate_report.py

**Problems:**
- `get_rows("snec_consent", filters={"student_id": ...})` → `db.get_consent_by_student_id(student_id)`
- `get_rows("snec_case_progress", filters={"student_id": ...})` → `db.get_case_results(student_id)`

**Fix:** Make affected functions `async def`, replace both calls.

### What stays on Sheets

`snec_flashcards` and `snec_supervisor_alerts` are intentionally not migrated. `generate_cards.py`, `weekly_digest.py`, and checkin router continue using Sheets as-is.

---

## Category 2: Delete dead files

| Path | Reason |
|---|---|
| `tools/profile/bootstrap_sheets.py` | Creates snec_profiles, snec_supervisors, snec_approved_students, snec_case_progress — all now in Supabase. Run-once setup script with no remaining purpose. |
| `.superpowers/brainstorm/1725-1779868048/` | Stale HTML artefacts from a May 27 brainstorm session. Not code, not referenced anywhere. |
| `pnpm-lock.yaml` (project root) | Orphaned 728-line lock file. The real frontend lock lives at `frontend/pnpm-lock.yaml`. |

---

## Category 3: Untrack frontend/dist from git

`frontend/dist/` is gitignored via `dist/` in `.gitignore` but was committed before that rule was in place, so it is still tracked. Remove it from git tracking without deleting the local build:

```bash
git rm -r --cached frontend/dist/
```

This stops the built JS/CSS/HTML from appearing in diffs and consuming repo size on every rebuild.

---

## Category 4: gsheets.py — remove dead async wrappers

The three async wrappers (`get_rows_async`, `append_row_async`, `update_row_async`) were added in Phase 1 as a bridge for routers that weren't yet on Supabase. After Phases 1 and 2, no router imports them. Delete those ~55 lines.

The sync functions (`get_rows`, `append_row`, `update_row`, `delete_row`) stay — flashcards and supervisor alerts still use them.

---

## Category 5: Delete completed plan docs

All 8 files in `docs/superpowers/plans/` describe work that is fully implemented and pushed. They are in `.claudeignore` so they never load into context, but they are clutter. Delete them. The specs in `docs/superpowers/specs/` are architecture reference and stay.

---

## What is NOT touched

- `GEMINI.md` — not touched (may be used by other tooling)
- `workflows/` — not touched (still serve as WAT SOPs)
- `tools/kb/` — actively used by chat, cases, flashcards
- `tools/shared/reauth.py` — utility script, still needed for OAuth re-auth
- `tools/flashcards/`, `tools/supervisor/weekly_digest.py` — leave Sheets calls intact
- `tests/` — no structural changes (test files named and organised correctly)
- `db.py` docstrings — acceptable as-is

---

## Testing

After all changes, `python -m pytest tests/ -q` must still show 139 passed. The supervisor tool changes are not exercised by the existing test suite (they call live Supabase), so correctness is verified by inspection of the replacement calls matching the db.py API exactly.
