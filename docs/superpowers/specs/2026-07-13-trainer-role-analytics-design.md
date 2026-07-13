# Trainer role, unified staff experience & Analytics dashboard — Design

**Date:** 2026-07-13
**Status:** Approved design → ready for implementation plan
**Author:** EyeBot agent (grounded in a 6-agent read-only codebase map, run `wf_ddcc8ab3-fdd`)

## 1. Goal

Introduce a new top-level role **`trainer`**, collapse the staff model so **`trainer` and `admin` use the exact student app** (plus two additions), **remove the `supervisor` role**, and give trainers/admins:

1. A **loud content-pool toggle** (`OA · PSA ↔ OT`) beside the Level chip on the homepage.
2. A dedicated, **dark, PowerBI-style Analytics page** (sidebar link) for real-time, in-depth per-student + cohort tracking, with a one-click **downloadable per-student report**.
3. **Admin-only** add/remove/provision students on that Analytics page (trainers cannot).

EyeBot is production. Every change is production-bound; the new role and the two DB migrations are coordinated so `main` never boots broken.

## 2. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Old dark admin console (Overview/Students/Accounts/Activity) | **Retire & consolidate** into the new Analytics page |
| D2 | `supervisor` role | **Remove entirely** (role + console + screens) |
| D3 | Trainer/admin capability | **Identical to student app** + toggle + Analytics; admin-only add/remove students |
| D4 | Provisioning of trainer accounts | **Both paths** — promote an existing email, or add via the account form's role dropdown |
| D5 | Gamification participation | **Full participant** — trainer/admin accrue XP/streak and appear on the leaderboard |
| D6 | Analytics depth | **Deep** — build on existing data AND add two additive migrations for the richest signals |
| D7 | Student parity | **Literally identical** — trainer/admin also do daily check-in and the mandatory first-login Eyecon gate |
| D8 | Report file format | **Self-contained HTML** (client-side, print-to-PDF, emailable) — cloning `sessionExport.ts` |

## 3. Role model (backend)

Roles today are scattered string literals with **no central enum**; `supervisor`/`admin` are stored in the `supervisors` table (free-text `role`, **no CHECK constraint** → storing `"trainer"` needs no migration). Content pool is derived **server-side from `student_profiles.role`** (OA/OT/PSA), never from the request.

### 3.1 Three roles: `student` · `trainer` · `admin`

- **`supervisor` removed.** Login/register no longer yields it. **Back-compat:** any lingering DB `supervisors.role == "supervisor"` is normalised to **`trainer`** at the auth layer, so no existing staff account is locked out (they keep analytics, lose provisioning — the safe demotion). Document in the migration ledger note.

### 3.2 Guard collapse (`tools/shared/jwt_utils.py`)

Because analytics = `{admin, trainer}` and provisioning = `{admin}`:

- Rename **`require_supervisor` → `require_staff`**, allow-set `{"admin", "trainer"}`. Gates every `/api/supervisor/*` endpoint **and** the read-only `/api/admin/*` analytics endpoints.
- **`require_admin`** unchanged (`{"admin"}`). Keeps add/remove/CSV/promote/demote admin-only — the single trainer exception.
- `CurrentUser.role` comment updated to include `trainer`.

### 3.3 Endpoint re-gating

| Endpoint(s) | New guard | Note |
|---|---|---|
| `/api/supervisor/*` (cohort, at-risk, student/{id}, benchmarks, insights, report, note, leaderboard, send-digest) | `require_staff` | URLs unchanged (rename is risky); only the guard changes |
| `GET /api/admin/approved`, `/api/admin/students`, `/api/admin/activity`, `/api/admin/student/{id}/detail`, `/api/admin/token-summary` | `require_staff` | Read-only analytics → trainers allowed |
| `POST /api/admin/approved`, `DELETE /api/admin/approved/{email}`, `POST /api/admin/upload-csv` | `require_admin` | **Add/remove students — admin only** (the exception) |
| `POST/DELETE /api/admin/promote` | `require_admin` | Minting staff stays admin-only (least privilege); widen `new_role` validation to include `trainer` and `admin` |
| `PATCH /api/profile/role` | `require_staff` | Already edits caller's *own* profile role; used by the toggle |

`GET /api/progress/{student_id}` (`chat.py`) already grants any non-`student` role cross-student read → trainers get per-student analytics for free.

### 3.4 Auth role resolution (`tools/api/routers/auth.py`)

- **Login** (`~L106–114`) already passes the stored `supervisors.role` through `create_access_token` → `trainer` flows correctly once stored. Add the `supervisor→trainer` normalisation here.
- **Login approved-miss branch** (`~L76–83`): allow a `supervisors` row with `role in {admin, trainer}` to resolve its stored role (currently hardcodes admin/supervisor).
- **Register/onboard** (`~L240–246`): stop collapsing non-admin rows to `supervisor`; preserve the stored role (`trainer`).
- `/api/auth/me` (`MeResponse`): return `student_role` sourced from **`student_profiles.role` (the effective content pool)**, falling back to the JWT claim — so the homepage toggle reflects the real server pool on every load (for students it equals their fixed role; for staff it's the last toggled pool, default `OA` when empty).

## 4. Content-pool toggle (the homepage switch)

Every content + gamification surface already reads the pool from `profile.role`. So the toggle **flips the trainer/admin's own `student_profiles.role` between `OA` and `OT`** — no new content plumbing.

- **UI:** a loud segmented switch **`OA · PSA | OT`** in `Dashboard.tsx`, rendered in `.hm-topr` beside the Level chip, **only for `role ∈ {trainer, admin}`**. In-UI helper text explains it switches which discipline's content they're viewing (per the standing "explain to users" rule).
- **Action:** on flip → optimistic `setStudentRole(local)` + `PATCH /api/profile/role {role}` → invalidate `["progress"]`, `["flashcard-topics"]`, `["flashcards"]`, cases queries, `["leaderboard"]`, `["flashcard-due-count"]`. The pool (flashcards, OSCE, check-in question, greeting `track`, leaderboard membership) follows automatically.
- **Default:** `OA` (clinical / OA·PSA) on first staff login (empty `profile.role` already falls back to OA in content endpoints).
- **Students never see the toggle**; their `profile.role` remains fixed (set at onboarding, locked as today).

## 5. Shell, routing & guards (frontend) — consolidation

### 5.1 Everyone on the light student shell

- `AppShell.tsx`: **no role uses the dark `console-dark` shell anymore** (supervisor gone, admin/trainer go light). Remove the `isStaff` dark branch; all authenticated users get `.aurora-shell` + `AtlasRail` (and the existing immersive branch for `/chat`,`/flashcards`).
- **Retire** the dark-console surface: `ConsoleRail.tsx`, `AdminShell.tsx`, the `/admin/*` route group + its screens (`AdminOverview`, `AdminStudents`, `AdminActivity`, `AdminAccounts` — logic moves into Analytics), `Supervisor.tsx`, `SupervisorDrillDown.tsx`, `/supervisor` route. Reusable pieces (`AdminStudentDetail` drill-down, `adminShared` helpers, `StatCard`, `EngagementBlock`, bar/table patterns) are **kept and repurposed** inside Analytics. Each deletion is verified for stray importers during implementation; orphans created by this change are removed, unrelated dead code is only flagged.

### 5.2 New `/analytics` route (admin + trainer)

- New page `frontend/src/app/(shell)/analytics/page.tsx`, dynamic-import pattern like every other screen, wrapped in a **new `AnalyticsGuard`** (`role ∈ {admin, trainer}` else `Navigate('/')`). Not wrapped in `CheckInGuard`.
- The screen keeps the rail but **self-themes dark** via a scoped `.aurora-analytics` wrapper class (the `/chat` `.aurora-chat` pattern) — a coherent dark surface inside the light shell, **not** added to the immersive list. Dark palette mirrors the retired `.console-dark` tokens.
- `AtlasRail.tsx`: add an **Analytics** nav item gated `role ∈ {admin, trainer}` (mirror the `showOversight` block); add an `analytics` glyph. Profile role chip maps `trainer → "Trainer"`.
- `AppShell` `destinations` (⌘K palette): add the Analytics destination for admin/trainer.

### 5.3 Guards — all three roles are "learners"

- `CheckInGuard.tsx`: remove the `admin→/admin` and `supervisor→/supervisor` bounces. Run the daily-check-in gate and the mandatory first-login Eyecon Studio gate for **all authenticated roles** (D7: literally identical). Net effect: only role-conditional behaviour anywhere in the learning app is the toggle, the Analytics link, and admin-only provisioning.
- `OnboardingScreen.tsx`: post-login routing sends `student|trainer|admin` to `/dashboard` (drop admin→/admin, supervisor→/supervisor). Widen the two role casts to include `trainer`.
- `AuthContext.tsx`: widen `User.role` union to `"student" | "admin" | "trainer"` (drop `supervisor`).

## 6. Analytics dashboard (dark, PowerBI-style, real-time)

One dark single-page screen (`frontend/src/aurora/screens/Analytics.tsx`) that **reuses existing endpoints and data primitives**. ~70% of the data layer already exists (cohort snapshot, at-risk, roster, per-student detail, benchmarks, activity, token usage, AI insight).

### 6.1 Charts — bespoke, dependency-free SVG

No chart library is installed and the project design standard is "custom everything" (and Spring Clean removed heavy deps). Build a **small set of dark SVG chart primitives**: trend line/area, donut/ring gauge, stacked/horizontal bar, plus the existing `Heatmap`/`EngagementBlock`. No new npm dependency (keeps the CI supply-chain audit and bundle clean).

### 6.2 Layout

- **Cohort band:** KPI tiles (total students, active this week, at-risk, avg mastery / avg OSCE score), AI cohort insight banner, engagement trend (from `checkin_history` + session timestamps), weak-topic & benchmark bars, topic-mastery heatmap, OSCE safety-failure rate (Tier-2 data), most-missed OSCE steps (Tier-2).
- **Roster:** searchable / role-filter / at-risk-filter / paginated table (reuse `AdminStudents` controls) → row click opens the drill-down.
- **Per-student drill-down** (reuse/extend `AdminStudentDetail`): vitals, engagement heatmap, per-topic retention **incl. flashcard accuracy** (Tier-2) vs cohort, OSCE results with sub-scores + safety + missed-critical (Tier-2), missed findings, lecturer note (editable), and the **report download**.
- **Admin-only provisioning block** (rendered only when `role === 'admin'`, and backend-enforced): add account (role dropdown OA/OT/PSA/**Trainer**/**Admin**), CSV import, remove student, promote existing email. Trainers never see it.

### 6.3 Real-time

React Query hooks over the existing endpoints with `refetchOnWindowFocus`, a light polling interval, and a manual **Refresh** control. Endpoints are cheap reads (bulk profile/session/case reads already exist). "Real-time" = always-fresh-on-focus + refresh, not websockets.

## 7. Per-student report — self-contained HTML (D8)

Clone the proven `sessionExport.ts` split:

- **New pure builder** `frontend/src/aurora/lib/studentReportExport.ts`: `interface StudentReportData` + `buildStudentReportHtml(data): string`. DOM-free, dependency-free (Node-testable), **every value HTML-escaped** (`esc()` copied verbatim — `supervisor_note`/`missed_findings` are free text), one inlined `<style>` with the same `@media print` rules (`break-inside:avoid`, zero body padding). `<title>EyeBot — Student Report — <name></title>`.
- **Trigger:** in the drill-down, a "Download report (HTML)" action maps the already-loaded per-student data (no fetch) into `StudentReportData` and reuses the `Blob → createObjectURL → <a download> → revoke(4s)` recipe. Filename `EyeBot-Student-<id8>-<yyyy-mm-dd>.html`.
- **Contents:** identity/meta, vitals (sessions, streak, last active, velocity), per-topic retention **and flashcard accuracy** vs cohort avg, OSCE results (score, pass, safety, missed-critical — Tier-2), weak topics, missed findings, lecturer note, recent-activity summary.
- Opens in any browser offline, one-click Print→Save-as-PDF, tiny emailable attachment. The old server PDF endpoint is retired with the console (or left dormant).

## 8. Data persistence — deep analytics (D6, two additive migrations)

The richest "improve your lessons" signals are currently **computed then discarded**. Two low-risk additive migrations (values already exist at write time) via `/db-migrate`, ledgered in `tools/db/migrations/APPLIED.md`:

### 8.1 `flashcard_attempts` (new table) — the biggest single win

- Columns: `student_id`, `card_id`, `topic_tag`, `correct` (bool), `score` (int), `ts` (timestamptz).
- Written from `flashcards_complete` (`student.py:~437`), which today maps correctness to SM-2 quality then **loses it**.
- **Also** feed per-topic flashcard results into `retention_scores` (today `student.py:~450` passes only `xp_delta`, so the platform's mastery signal ignores its highest-volume activity).
- Unlocks: true per-topic accuracy, accuracy-over-time trends, repeatedly-failed cards.

### 8.2 Extend `case_progress` — real OSCE depth

- Add columns: `score_100`, `safe` (bool), `consult_technique` (0–50), `judgement_safety` (0–50), `missed_critical` (JSONB), `coaching` (JSONB).
- Wire through `case_submit` (`cases.py:~860`) → `log_case_completion.py` → `db.insert_case_result`/`get_case_results` (widen the 4-field shape). All values are already computed at submit time and dropped today.
- Unlocks: cohort safety-failure rate, sub-domain trends, most-missed critical steps (the top "what to teach next" signal).

### 8.3 Out of scope (flagged, not built)

Durable event table replacing the ephemeral `.tmp/audit_log.jsonl` (would unlock true time-on-task/session-duration), uncapping `checkin_history` (21-entry cap), and tutor transcript capture. Noted for a future pass; the dashboard degrades gracefully without them and clearly labels time-on-task as unavailable rather than faking it.

### 8.4 Data caveats (honour, don't paper over)

- `streak` column is a cache — always resolve via `resolve_streak(checkin_history)`.
- `session_count` is incremented on **every** `update_profile` (check-in + OSCE + tutor) → over-counts; label it "activity events," not "sessions completed," or split counters.
- Migration `009_lumens` (`coins_earned`) is still **PENDING** in `APPLIED.md` (lifetime Lumens falls back to `xp`) — confirm before relying on it.
- Base `student_profiles` columns predate `migrations/001` — verify against the live table before altering.

## 9. Provisioning (D4) — both paths

Admin-only, on the Analytics provisioning block:

- **Add account form** role dropdown: `OA / OT / PSA / Trainer / Admin`.
  - Student roles → existing `POST /api/admin/approved` (approved row + auth temp password + email).
  - **Staff roles (Trainer/Admin)** → extend the add flow to create the auth credential (temp password, `must_change`) **and** upsert the `supervisors` row with that role, then email creds — so a brand-new trainer/admin can log in. (Identity/profile created on first login as usual.)
- **Promote existing email** → `POST /api/admin/promote` with `new_role ∈ {trainer, admin}` (validation widened).
- **Remove** → existing `DELETE /api/admin/approved/{email}` (student) / `DELETE /api/admin/promote/{email}` (staff demote).

## 10. Testing (TDD — failing test first)

- **Backend (`pytest`):**
  - `require_staff` passes for admin+trainer, 403 for student; `require_admin` 403 for trainer.
  - `create_access_token(...,'trainer',...)` round-trips; login/onboard resolve a `trainer` supervisors row (and normalise legacy `supervisor→trainer`).
  - Trainer allowed on the read `/api/admin/*` analytics endpoints; **403 on** `POST /api/admin/approved`, `DELETE /api/admin/approved/{email}`, `POST /api/admin/upload-csv` (the exception).
  - `flashcard_attempts` write + per-topic accuracy aggregation; flashcard results now move `retention_scores`.
  - Extended `case_progress` persists safety/sub-scores/missed-critical; graceful until the migration is applied.
- **Frontend (Node harness `frontend/tests/`):**
  - `buildStudentReportHtml` → output starts `<!doctype html>`, is fully self-contained (no external `src/href/link`), escapes injected markup in the note, includes the `@media print` block.
  - Toggle regression: flipping the pool changes the effective content pool and persists across reload (per `/ship-check` — a state invariant needs a repeat-case test + a behavioral verify on the running app).
- **Visual harness:** trainer/admin fixture renders the light shell + toggle + Analytics link; Analytics page renders dark.

## 11. Docs & rollout

- Update `docs/ARCHITECTURE.md` (endpoint/role map) and `docs/SECURITY.md` (the `require_staff` vs `require_admin` split; trainer = admin analytics minus student provisioning).
- Add a `docs/design-locks.md` entry for the Analytics dashboard + the homepage toggle.
- **Prod coordination (fail-closed):** the two migrations are applied via `/db-migrate` and endpoints degrade gracefully until then; the new role needs no env var. Ship order keeps `main` green: (1) backend role/guards + migrations (graceful) → (2) shell/routing consolidation → (3) toggle → (4) Analytics page → (5) report → (6) tests/docs. Verify green (pytest / typecheck / build / harness) before each push to `main` (auto-deploys to Render).

## 12. Risks & mitigations

- **Large consolidation touching auth + routing.** Mitigate: foundations-first, one concern per commit, full gate before each push; the union-widening surfaces every unhandled role site at typecheck.
- **Deleting the old console.** Mitigate: verify no stray importers; reuse (not rebuild) the drill-down + helpers; keep the analytics *endpoints*.
- **Staff on the student leaderboard** (D5 full participant) — accepted; optionally default staff `leaderboard_hidden=true` if it proves noisy (not built now).
- **`profile.role` doubles as content-pool for staff** — intended; it has no other meaning for staff (their top-level role lives in the JWT/supervisors table).

## 13. Appendix — file touch-list (from the map, file:line)

**Backend**
- `tools/shared/jwt_utils.py` — `require_supervisor`→`require_staff` `{admin,trainer}` (L69-73); `require_admin` unchanged (L76-80); `CurrentUser` comment (L21).
- `tools/api/routers/auth.py` — login role pass-through + `supervisor→trainer` normalise (L76-83, L106-114); register preserve role (L240-246); `MeResponse.student_role` from profile.
- `tools/api/routers/admin.py` — imports + re-gate 5 read endpoints to `require_staff` (L35,98,129,177,233); keep `require_admin` on add/remove/CSV (L43,91,253); `new_role` validation widen (L165); extend add flow for staff roles.
- `tools/api/routers/supervisor.py` — all endpoints inherit `require_staff` (no per-file edit beyond the rename import).
- `tools/api/routers/student.py` — `flashcards_complete` write `flashcard_attempts` + feed retention (L437,450); `/api/profile/role` on `require_staff` (L132).
- `tools/api/routers/cases.py` + `tools/cases/log_case_completion.py` + `tools/shared/db.py` — persist extended OSCE grade (cases L860; log L18; db L133).
- `tools/db/migrations/` — `NNN_flashcard_attempts.sql`, `NNN_case_progress_grade.sql` (+ `APPLIED.md`).

**Frontend**
- `frontend/src/screens/AuthContext.tsx` — `User.role` union (L6).
- `frontend/src/screens/OnboardingScreen.tsx` — casts (L140,158) + routing (L159-163).
- `frontend/src/screens/AdminGuard.tsx` → new `frontend/src/screens/AnalyticsGuard.tsx` (`admin||trainer`).
- `frontend/src/screens/CheckInGuard.tsx` — drop role bounces (L51,56); learner gates for all roles (L27,61,72).
- `frontend/src/aurora/AppShell.tsx` — drop dark `isStaff` branch (L78,88-100); destinations incl. Analytics (L79-83).
- `frontend/src/aurora/components/AtlasRail.tsx` — Analytics section + `showAnalytics` (L39,89-94), `analytics` glyph (L127-135), `trainer→"Trainer"` chip (L110).
- `frontend/src/aurora/screens/Dashboard.tsx` — loud toggle in `.hm-topr` (L98-104).
- `frontend/src/aurora/aurora.css` — `.aurora-analytics` dark scope.
- **New:** `frontend/src/app/(shell)/analytics/page.tsx`, `frontend/src/aurora/screens/Analytics.tsx`, dark SVG chart primitives, `frontend/src/aurora/lib/studentReportExport.ts`.
- **Reuse:** `AdminStudentDetail`, `adminShared.tsx`, `StatCard`, `EngagementBlock`, `Heatmap`, `ProgressBar`.
- **Retire:** `ConsoleRail.tsx`, `AdminShell.tsx`, `/admin/*` route group, `AdminOverview/AdminStudents/AdminActivity/AdminAccounts` (logic → Analytics), `Supervisor.tsx`, `SupervisorDrillDown.tsx`, `/supervisor` route.
- **Role badge CSS:** `adminShared.tsx` `ROLE_COLORS`/`roleBadgeClass`, `styles/eyebot.css` + `styles/gemini-gradients.css` `.role-badge.trainer`.

**Tests/docs:** `tests/shared/test_jwt_utils.py`, `tests/api/test_admin_endpoints.py`, `tests/api/test_auth_endpoints.py`, `frontend/tests/` report + toggle harnesses, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/design-locks.md`.
