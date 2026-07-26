# Admin console rebuild — P2: Analytics Depth — Design

**Date:** 2026-07-26
**Status:** Approved design → ready for implementation plan
**Audit basis:** full read of the admin analytics surface at `origin/main` (`c5ea4da`), in an
isolated worktree. Follows P1 (Truth & Safety), shipped `bcd6e0e`.

## 1. Goal

P1 made the console **honest**. P2 makes it **deep**: cohort figures come from real
performance events, staff can slice by discipline, "at-risk" explains *why*, a student's
mastery is shown against the cohort, and trends cover performance over time — not just
activity counts.

The whole depth layer lands in one spec, but as **three independently-shippable slices**
(2a → 2b → 2c) on a shared data foundation, so each can be verified and pushed alone — the
same discipline that made P1 safe to land incrementally.

## 2. Why — the audit

Every cohort-level metric today aggregates denormalized **profile snapshots**, never the
raw performance events:

- `cohort_summary()` (`tools/supervisor/cohort_summary.py`) ranks "weakest topics" with a
  bare `Counter` over each profile's `weak_topics` list — a proxy with no performance
  signal behind it.
- `at_risk.py` flags a student on a single binary rule: `days_inactive >= 5 AND
  len(weak_topics) >= 2`. No score, no reason, no OSCE/flashcard signal.
- `cohort_benchmarks.py` averages the profile `retention_scores` dict (SM-2 memory
  strength) per topic — the closest thing to real aggregation, but still a snapshot, and
  it ignores OSCE and flashcard performance entirely.
- `/api/admin/token-summary` reads `db.get_all_sessions()`, which **defaults `limit=500`**
  — so once a cohort passes 500 chat sessions the token totals silently under-report.

Meanwhile the real truth sits unused in two tables the analytics layer never aggregates:

- `case_progress` — real OSCE grades: `score_100`, `safe`, `total_score`, `passed`,
  `consult_technique`, `judgement_safety`, `missed_critical` (migration-011, live since
  2026-07-14). `db.get_all_case_progress()` already returns the full table (`select("*")`,
  no limit).
- `flashcard_attempts` — `student_id`, `topic_tag`, `correct`, `ts` (migration-010, live).
  Only a **per-student** read exists (`db.get_flashcard_attempts`).

P2 re-grounds cohort analytics on those events.

**Scope note (locked with the user 2026-07-26):** the depth layer is the whole of P2, built
in one spec, sequenced aggregation → at-risk → trends. Operations (P3), access/scale (P4)
and the visual/a11y rebuild (P5) each keep their own spec.

## 3. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Scope | Full depth layer in one spec, as three shippable slices 2a/2b/2c |
| D2 | Discipline dimension | **Filter / switcher** — one pool in view at a time (`oa_psa` \| `ot` \| `all`); no side-by-side comparison in P2 |
| D3 | Chart quality bar | **Function now, polish in P5** — correct, legible, themed to the current dark `.aurora-admin` shell; no bespoke motion/branding/a11y (that is P5) |
| D4 | Aggregation engine | **Python over bounded reads**, in isolated pure modules; no migration; clean seam so P4 can push to SQL behind the same contract |
| D5 | Topic granularity | Aggregate at `set_key` topic-groups (reuse `tools/cases/topic_sets.py`), not the 155 raw per-case `topic` strings — actionable, not noisy |
| D6 | Cohort endpoint | **New** `GET /api/admin/cohort-analytics`, not an overload of the live `/api/supervisor/cohort` — the old contract stays until the frontend migrates |
| D7 | At-risk model | Deterministic **scored** model with a documented weight rubric; the old binary rule becomes one input, not the whole model. No AI in the scoring path |
| D8 | Migrations | **None.** Grade columns (011) and `flashcard_attempts` (010) are live; the new flashcard bulk read is pure code |

## 4. Slice 0 — Data foundation (the shared seam)

Everything in 2a–2c reads through this layer. Keeping it pure and isolated is what lets
P4 later swap the data source for SQL without touching an endpoint or a component.

### 4.1 Case-metadata index — `case_id → {topic, role, pool}`

`case_progress` rows carry `case_id` but no topic or discipline. Build a lightweight index
once per worker from `tools/cases/load_case.py` (`list_available_cases()` + `load_case()`),
capturing `topic`, `role`, and the discipline **pool** via `tools/cases/topic_sets.py`
(`case_pool`, which already groups OA∪PSA vs OT), plus the `set_key` topic-group.

- Build lazily and cache module-level (idempotent per-worker read cache — same pattern as
  the existing case cache; **no shared in-process mutable state**, invariant #2).
- A `case_id` with no matching case file resolves to `topic="unknown"`, `pool=None`; such
  attempts are excluded from per-topic/discipline roll-ups (fail closed, don't miscategorise).

### 4.2 New bulk flashcard read — `db.get_all_flashcard_attempts()`

Mirror `get_all_case_progress()`: `client.table("flashcard_attempts").select("student_id,
topic_tag, correct, ts")`. Match the existing per-student helper's error behaviour — it may
raise on a missing table, and the cohort aggregator catches that and treats it as "no
flashcard data" (never a 500). This one bulk read replaces N per-student reads.

### 4.3 Pagination-safe session read (token-summary correctness)

`get_all_sessions(limit: int = 500)` truncates. Add a read that returns **all** sessions
regardless of count — either page through until exhausted, or an explicit `limit=None`
full fetch — so token totals and any session-based aggregate are correct past 500 rows.
Keep `token_count` and `student_id` in the projection.

> **Flagged for P4:** this is the one place unbounded table growth bites a single worker.
> P2 makes it *correct*; P4 makes it *cheap* by summing in SQL. Do **not** solve it here
> with Celery/materialisation (D4, and the single-worker/no-Redis invariant).

### 4.4 Discipline filter

A student's pool is `case_pool(profile["role"])`. The `discipline` query param maps:
`oa_psa` → the OA/PSA pool, `ot` → the OT pool, `all` → no filter. Applied in Python at
the aggregation boundary; validated against an allow-list (unknown value → 400).

## 5. Slice 2a — Real cohort aggregation *(ships first)*

### 5.1 Aggregation modules — `tools/supervisor/`

New pure functions, each over `(rows, case_index)`, no I/O:

- **OSCE per topic-group:** attempts, pass rate, `avg_score_100`, **safety-fail rate**
  (`safe is False` over graded attempts), and the top missed-critical steps — from
  `case_progress` joined through the case index, filtered to the active-profiles invariant
  (`get_active_leaderboard_profiles`, same as P1's feed/trend/token endpoints).
- **Flashcard per topic-group:** accuracy (`correct / total`) and `n`, from
  `get_all_flashcard_attempts()`, bucketed by `set_key` and filtered by discipline via the
  student→pool map.
- **Weakest topics (real):** a `weakness_score` combining low OSCE score, high safety-fail
  rate, and low flashcard accuracy into a single ranked list — replacing the `Counter`
  proxy. Weights documented alongside the at-risk rubric (§6.3).

### 5.2 Endpoint

```
GET /api/admin/cohort-analytics?discipline=oa_psa|ot|all   (require_staff, rate-limited)
→ {
    "discipline": "oa_psa",
    "topics": [
      {"topic_group": str, "label": str,
       "osce": {"attempts": int, "pass_rate": float, "avg_score": float,
                "safety_fail_rate": float, "missed_top": [{"step": str, "count": int}]},
       "flashcard": {"accuracy": float, "n": int},
       "weakness_score": float},
      ...  # ranked weakest-first
    ],
    "totals": {"students_in_pool": int, "osce_attempts": int, "flashcard_attempts": int}
  }
```

On the shared `limiter`, keyed on the real caller (invariant #6). `discipline` defaults to
`all`.

### 5.3 token-summary fix

Point `/api/admin/token-summary` at the pagination-safe read (§4.3). Add a regression test
that a cohort with > 500 sessions reports the full total, not a capped one.

### 5.4 Frontend

- **Discipline switcher** at the console top (`oa_psa` / `ot` / `all`); its value threads
  into the admin React Query keys so a switch refetches. Persisted in the URL or local
  state (implementer's call; must survive a refetch/poll).
- `useCohortAnalytics(discipline)` hook (throw-on-error, per P1's `getJSON`).
- Charts (function-now): grouped bar per topic-group (OSCE avg vs flashcard accuracy),
  safety-fail callouts, a real weakest-topics ranking. Reuses `charts/BarSeries`,
  `DonutGauge` where they fit; new components themed to `.aurora-admin`.

## 6. Slice 2b — Explainable at-risk + mastery vs cohort

### 6.1 Explainable at-risk — `tools/supervisor/at_risk.py` (rewrite)

Per active student, compute a deterministic `risk_score` (0–100) from weighted signals and
emit the contributing **reasons** so the UI shows *why*:

```python
{
  "student_id": str, "name": str,
  "risk_score": int,                       # 0–100, higher = more at risk
  "band": "high" | "medium" | "low",
  "reasons": [{"factor": str, "detail": str, "weight": int}, ...],  # desc by weight
  # back-compat superset of today's fields:
  "last_active": str, "days_inactive": int, "weak_topics": list, "weak_count": int
}
```

Signals (weights fixed in an explicit rubric constant, not inline magic numbers):
inactivity (`days_inactive`), broken streak, OSCE failing/declining (`score_100` trend,
`passed` rate), safety fails (`safe is False`), low flashcard accuracy, weak-topic breadth.
The old binary rule (`inactive≥5 AND weak≥2`) becomes one weighted input.

`GET /api/supervisor/at-risk` returns the scored, reasoned list (existing consumers keep
working — it is a superset). No AI in the path (deterministic, free, testable).

### 6.2 Mastery vs cohort — extend `GET /api/admin/student/{id}/detail`

Add a `mastery` block: for each topic-group the student has data on,
`{topic_group, student_mastery, cohort_avg, delta}` across OSCE, flashcard and retention.
Cohort averages come from extending `cohort_benchmarks.py` (already averages retention) to
cover OSCE and flashcard, computed for the student's own discipline pool. StudentDetail
renders a diverging-bar mastery-vs-cohort chart (function-now).

### 6.3 Weight/rubric documentation

Both the `weakness_score` (§5.1) and the at-risk weights live in one documented rubric
block (a module constant + a short doc comment) so a trainer — and a reviewer — can see
exactly what drives a flag. Tuned during planning; no hidden constants.

## 7. Slice 2c — Time-series depth

### 7.1 Widen the windowed reads

`get_case_progress_since()` currently selects only the two columns P1's activity-count
trend needed. Add `score_100`, `safe`, `case_id`, `completed_at` to its projection (or a
scored sibling helper) so performance — not just volume — can be bucketed over time.

### 7.2 Endpoint

```
GET /api/admin/performance-trend?days=&discipline=   (require_staff, rate-limited)
→ {"discipline": str, "period": "day"|"week",
   "points": [{"date": "YYYY-MM-DD", "avg_score": float, "pass_rate": float,
               "safety_fail_rate": float, "n": int}, ...]}
```

`days` clamps to `[1, 90]` (same guard as `/activity-trend`); active-profiles invariant
honored. Distinct from P1's `/activity-trend` (which counts events); this trends
performance.

### 7.3 Frontend

`TrendChart` gains a multi-series/line mode (function-now); `usePerformanceTrend(days,
discipline)` hook. Empty window → explicit empty state (P1 discipline).

## 8. Testing

TDD throughout: failing test first, watch it fail, minimal pass.

**Backend** (`pytest -q`, `MOCK_MODE`):

| Test | Asserts |
|---|---|
| `test_cohort_analytics_osce_aggregation` | Pass rate / avg score / safety-fail rate per topic-group match hand-computed values from fixture `case_progress` |
| `test_cohort_analytics_flashcard_accuracy` | Per-topic-group accuracy from `get_all_flashcard_attempts` is correct |
| `test_cohort_analytics_discipline_filter` | `oa_psa` excludes OT attempts and vice-versa; `all` includes both; unknown → 400 |
| `test_cohort_analytics_ignores_removed_students` | Active-profiles invariant honored |
| `test_case_index_unknown_case_excluded` | An attempt on an unknown `case_id` is not miscategorised |
| `test_token_summary_counts_past_500_sessions` | A > 500-session cohort reports the full total, not a capped one |
| `test_at_risk_scored_with_reasons` | `risk_score`/`band`/`reasons` computed from signals; reasons sorted by weight; back-compat fields present |
| `test_at_risk_deterministic` | Same input → same score (no AI, no randomness) |
| `test_student_mastery_vs_cohort` | `delta = student_mastery − cohort_avg`; cohort avg scoped to the student's pool |
| `test_performance_trend_buckets_and_clamps` | Per-period avg score / pass / safety-fail correct; `days` clamps to `[1, 90]` |

**Frontend:** `npm --prefix frontend run typecheck` + `build:safe` (webpack — Turbopack
rejects the junctioned `node_modules`), plus aurora harness assertions: the discipline
switcher renders and refetches, the new charts render on mocked data, and a mocked 500
still renders an **error state** (P1 regression guard). Reconcile mock shapes in **both**
`frontend/tests/aurora_assert.mjs` and `frontend/tests/_mocks.mjs`.

**Behavioral verify before push** (per `/ship-check`, each slice): load `/admin` against
the running app; confirm cohort numbers change with the discipline switcher, weakest topics
reflect real performance, at-risk rows show reasons, mastery bars compare to cohort, and the
performance trend renders over a real window.

## 9. Rollout

No migration, no new env var, no coordinated setup — pure code, like P1. The three slices
land in order (2a → 2b → 2c); each is independently shippable and independently verifiable.
Fail-closed behaviour and the active-profiles invariant are preserved throughout.

**Preconditions to verify, not assume** (before building the relevant slice):

- `db.get_all_case_progress()` actually returns `score_100`, `safe`, `missed_critical`,
  `consult_technique`, `judgement_safety` (widen the projection if it selects an explicit
  column list — it currently uses `select("*")`, so likely fine).
- `flashcard_attempts` exists and carries `topic_tag`, `correct`, `ts`, `student_id`.
- `tools/cases/topic_sets.py` exposes `case_pool` and `set_key` with the OA∪PSA / OT pool
  grouping assumed here; confirm the exact function names/signatures before wiring §4.1.

## 10. Out of scope (deferred)

| Phase | Scope |
|---|---|
| P3 | Chunked/resumable CSV import, credential download, bulk actions, server-side roster query |
| P4 | **SQL/RPC aggregation pushdown + the token-summary SQL sum**, trainer/admin permission split, replacing poll-everything refresh. No tenant boundary (SNEC-only, locked) |
| P5 | Visual/motion/a11y rebuild of all charts, keyboard-navigable tables, focus trap, responsive |
| Later | Side-by-side discipline comparison (P2 is filter-only, D2) |
