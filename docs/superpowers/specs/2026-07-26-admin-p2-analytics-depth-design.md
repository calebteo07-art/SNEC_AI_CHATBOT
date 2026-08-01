# Admin console rebuild — P2: Analytics Depth — Design

**Date:** 2026-07-26 · **Revised** 2026-07-26 after a code-verification + adversarial-review pass
**Status:** Approved design → ready for implementation plan
**Audit basis:** full read of the admin analytics surface at `origin/main` (`c5ea4da`), in an
isolated worktree, plus a 10-agent verification pass (6 code verifiers, 3 adversarial lenses)
and a read-only production row probe. Follows P1 (Truth & Safety), shipped `bcd6e0e`.

## 1. Goal

P1 made the console **honest**. P2 makes it **deep**: cohort figures come from real
performance events, staff can slice by discipline, "at-risk" explains *why*, a student's
mastery is shown against the cohort, and trends cover performance over time — not just
activity counts.

The depth layer is specced here in full, but ships as **three staged plans** (A → B → C) on
a shared data foundation, each independently verifiable — the discipline that made P1 safe.

## 2. Why — the audit

Every cohort-level metric today aggregates denormalized **profile snapshots**, never the raw
performance events:

- `cohort_summary()` ranks "weakest topics" with a bare `Counter` over each profile's
  `weak_topics` list — a proxy with no performance signal behind it.
- `at_risk.py` flags on one binary rule: `days_inactive >= 5 AND len(weak_topics) >= 2`.
  No score, no reason, no OSCE/flashcard signal.
- `cohort_benchmarks.py` averages the profile `retention_scores` dict — still a snapshot,
  and it ignores OSCE and flashcard performance entirely.
- `/api/admin/token-summary` reads `db.get_all_sessions()`, which **defaults `limit=500`**,
  so token totals silently under-report past 500 sessions.

The real truth sits unused in `case_progress` (`score_100`, `safe`, `missed_critical`,
migration-011) and `flashcard_attempts` (migration-010). P2 re-grounds analytics on those
events.

### 2.1 Verified production state (read-only probe, 2026-07-26)

| Table | Server count | Rows returned |
|---|---|---|
| `case_progress` | 24 | 24 |
| `flashcard_attempts` | **0** | 0 |
| `chat_sessions` | 25 | 25 |
| `student_profiles` | 10 | 10 |

- **`flashcard_attempts` is empty** — see §3.0, a live bug this plan fixes first.
- **11 of 24** `case_progress` rows have `score_100`/`safe` non-NULL. Over half are
  pre-Tier-2. **Per-metric denominators are mandatory** (§5.3).
- **No truncation observed**, but the cohort is far too small to disprove a PostgREST row
  cap. No `.range()` call exists anywhere in `tools/`, and `get_all_case_progress()` is
  `ORDER BY completed_at DESC`, so a cap would silently drop the **oldest** rows. Treated as
  defensive work (§4.3), not an emergency.
- **Volume reality:** ~24 OSCE attempts across 21 topic groups ≈ 1 attempt per group. At
  today's scale most panels are legitimately empty. **Honest empty and low-confidence states
  are the primary UX, not an edge case** (§5.3, §5.4).

## 3. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Scope | Full depth layer, one spec, three staged plans (A/B/C) |
| D2 | Discipline dimension | **Filter / switcher**, `oa_psa` \| `ot` \| `all`; no side-by-side compare in P2. `all` renders as **two labelled sections**, never one blended ranking — the curricula are disjoint |
| D3 | Chart quality bar | **Function now, polish in P5** — legible, themed to the dark `.aurora-admin` shell; no bespoke motion/branding. New charts stay `aria-hidden` paired with a text summary (a11y is P5) |
| D4 | Aggregation engine | **Python over bounded reads**, isolated pure modules; no migration; clean seam so P4 can push to SQL behind the same contract |
| D5 | Topic granularity | Aggregate at case **set_key** groups (21: 11 CLINICAL + 10 OT) via `topic_sets.resolve_set` — not the 155 raw per-case topics |
| D6 | Cohort endpoint | **New** `GET /api/admin/cohort-analytics`; the live `/api/supervisor/cohort` contract is untouched |
| D7 | At-risk model | Deterministic **scored** model, documented weight rubric, no AI in the scoring path. The old binary rule becomes one input |
| D8 | Migrations | **None.** 010/011 applied 2026-07-14; all new work is pure code |
| **D9** | **Retakes** | Attainment metrics (`avg_score`, `pass_rate`, mastery, `weakness_score`) use the **best `score_100` per `(student_id, case_id)`**. Volume counts and the §7 time-series use **all raw attempts**. `safety_fail_rate` is over **raw attempts** — a safety fail is an event, not an attainment level. Matches the existing per-case high-water reward in the points economy |
| **D10** | **Population** | All P2 aggregation reads **`db.get_active_profiles()`** (student-only). **Never** `get_active_leaderboard_profiles()`, which deliberately adds trainers/admins — its docstring says so explicitly. Reserve that one for P1's feed/token endpoints |
| **D11** | **Switcher placement** | **Panel-local** on the cohort-analytics section, with a caption naming its scope. A console-top control would move 1 of 11 surfaces and leave the rest frozen — resurrecting the false promise P1 deleted. Global scoping is **P4** |
| **D12** | **At-risk row set** | `get_at_risk()` returns only `band in {high, medium}`. `low`/`no_data` are computed but omitted, preserving all four existing consumers unchanged. Field superset; **row set intentionally redefined** |
| **D13** | **Nulls, not zeros** | Every rate/mean is `float \| None`, null when its denominator is 0. P1 zero-fills *counts* on the activity trend; copying that to a *mean* is wrong — a day with no attempts has no average |

## 3.0 Prerequisite — a live bug that blocks half of P2

**`flashcard_attempts` receives zero rows in production.** Verified in code and by the probe
above.

- The backend writer filters `for r in body.results if r.topic_tag`
  (`tools/api/routers/student.py:468`), shipped in `def4f0e`.
- The frontend never sends it: `CompleteCardResult` declares only
  `card_id, correct, repetitions, easiness, interval_days`
  (`frontend/src/hooks/useFlashcards.ts:26-29`), and the push site sends exactly those
  (`frontend/src/aurora/screens/Flashcards.tsx:156-159`) — though the card's topic is used on
  the very next line.
- The model defaults to `topic_tag: str | None = None` (`student.py:420`), so there is no
  422; the request succeeds and every row is silently discarded.
- The same filter kills the per-topic **`retention_scores`** write (`student.py:479`), which
  falls through to the XP-only branch.

**Fix ships as Plan A task 0.1**, before any aggregation work. Consequence: flashcard data
accrues only from that ship date, so **every flashcard surface must degrade on a thin or
empty table** — `flashcard: null`, never `{accuracy: 0.0}`.

## 4. Slice 0 — Data foundation (the shared seam)

### 4.1 Case index — `tools/supervisor/case_index.py` (new)

`case_progress` rows carry `case_id` but no topic or discipline. Build
`case_id → {topic, role, set_key, label, difficulty}` from `load_case` /
`list_available_cases` (155 files).

Grouping **must** use production's precedence, `c.get("topic_set") or resolve_set(role,
c.get("topic",""))` (`tools/api/routers/cases.py:334,397`), or trainers see different
groupings than students.

Constraints, each a real hazard:

- `load_case` and `list_available_cases` are **synchronous and uncached**, and the latter
  re-globs every call. Build in a **sync** function, invoked as
  `await asyncio.wait_for(asyncio.to_thread(_build_case_index), timeout=10.0)` — blocking
  I/O on the single prod worker is invariant #1.
- Warm it in the existing fail-open `tools/api/server.py::_warmup()`.
- **Single-flight** via a module-level `asyncio.Lock`: build into a *local* dict and publish
  with one whole-dict rebind. A partially-populated map would silently mis-bucket attempts.
- **Do not alias `tools.api.shared._case_cache`** — it is lazily *partial* by construction
  and is cleared at runtime by `PATCH /api/profile/role` (`student.py:154`).
- Docstring must state the invariant-#2 carve-out: a per-worker idempotent read cache over
  immutable case files; no counters, no cross-request semantics.
- Add `resolve_set_strict(role, topic) -> str | None` — `resolve_set` **never** returns
  "no match", it silently falls back to `_DEFAULT`. Unmatched cases go to an explicit
  unclassified bucket (fail closed), never into `history_taking`/`screening`.

### 4.2 Flashcard ↔ case crosswalk — `tools/supervisor/topic_crosswalk.py` (new)

**The spec's original premise was wrong and is corrected here.** `flashcard_attempts.topic_tag`
holds *flashcard* topic keys (45, `tools/flashcards/flashcard_sets.py:26-79`); case set_keys
are a *different* 21-key namespace (`topic_sets.py:20-68`). They are **disjoint** — passing a
flashcard tag to `resolve_set` collapses whole families into `history_taking`/`screening`
via `_DEFAULT`. There is also no `set_key` symbol in `topic_sets.py`; the producer is
`resolve_set(role, topic)`.

Therefore: an **explicit** `FLASHCARD_TO_SET: dict[str, str]`, derived by reading both real
key lists at implementation time. All FOUNDATIONS topics plus `abbreviations`/`general` route
to one `knowledge_foundations` pseudo-group with `osce: null`. Strip any `__difficulty`
suffix before matching (flashcards use `"<topic>__<difficulty>"` set keys — a third, unrelated
meaning of "set key").

Guard with a coverage test over **every** `FLASHCARD_TOPICS` key and **every** `SET_LABELS`
key: a new content topic must **fail CI**, not silently vanish into a bucket.

### 4.3 Bounded bulk reads — `tools/shared/db.py`

One generic paginator `_fetch_all(table, columns, *, page=1000, max_pages=50, **filters)`
using `.range()`, returning `(rows, complete: bool)`, wrapped in `asyncio.wait_for`. Applied
to all three bulk reads.

- New `get_all_flashcard_attempts()` — projects `student_id, topic_tag, correct, ts` only.
- New `get_all_session_tokens()` — projects `student_id, token_count` only. **Never widen or
  uncap `get_all_sessions()`**, which `/api/admin/activity` shares and which selects `*`
  including free-text `summary`.
- Narrow the `case_progress` projection too — `select("*")` drags the `coaching` JSONB per row.
- On a cap hit, return `complete: false` so the endpoint can surface
  `total_tokens_at_least` and the UI reads "≥ 48.2k" rather than a confident wrong number.

### 4.4 Discipline filter

**Never call `case_pool()` on a student role** — it returns `CLINICAL` for `None`, `""`,
`trainer`, `admin` and typos, so staff and unknowns would silently land in `oa_psa`. Use an
explicit map: `{OA, PSA} → oa_psa`, `{OT} → ot`, anything else **excluded** and counted in
`totals.unclassified_students`. The query literals (`oa_psa`/`ot`/`all`) translate to the
code literals (`CLINICAL`/`OT`); unknown values → 400.

Resolve an attempt's pool from the **student**, not the case, so a future `role: "any"` case
counts correctly in both pools.

## 5. Slice 2a — Real cohort aggregation *(Plan A)*

### 5.1 Aggregation modules — `tools/supervisor/cohort_analytics.py` (new, pure)

Pure functions over `(rows, case_index, student_pools)`, no I/O:

- **`osce_by_group`** — attempts, distinct students, pass rate, avg score, safety-fail rate,
  top missed-critical steps, `by_difficulty`. Best-per-`(student, case)` for attainment (D9).
- **`flashcard_by_group`** — accuracy and n, bucketed through the crosswalk.
- **`weakness_scores`** — the real replacement for the `Counter` proxy.

**Seam constraint:** every aggregator returns `dict[topic_group, {...}]`; the endpoint is a
thin ranking/projection over that dict, and §6.2's `cohort_avg` reads the same dict filtered
to the student's pool. This is what preserves D4's SQL-swap promise, so it is enforced by a
test in Plan A *before* Plan B exists.

### 5.2 Endpoint

```
GET /api/admin/cohort-analytics?discipline=oa_psa|ot|all&days=90
    require_staff · @limiter.limit("30/minute") + request: Request
→ {
    "discipline": str, "days": int | "all",
    "topics": [{"topic_group", "label", "pool",
                "osce": {"attempts", "students", "avg_score", "scored_n",
                         "pass_rate", "graded_n", "safety_fail_rate",
                         "safety_gradable_n", "missed_top", "by_difficulty"},
                "flashcard": {"accuracy", "n", "students"} | null,
                "weakness_score": float | null, "low_confidence": bool,
                "signals_present": [str]}],
    "totals": {"students_in_pool", "students_with_osce_data",
               "students_with_flashcard_data", "osce_attempts", "osce_students",
               "unclassified_students", "unclassified_attempts"},
    "sources": {"osce": "ok"|"unavailable", "flashcard": "ok"|"unavailable"}
  }
```

`days` clamps to `[1, 365]` with an explicit `all` sentinel, default 90 — rolling SNEC intakes
mean an all-time average is a slow-moving constant that barely responds to this term's
teaching. The resolved window is echoed so the UI can label it. A per-worker 30–60s TTL cache
keyed on `(discipline, days)` holds only the derived aggregate (the read-cache carve-out of
invariant #2; tests set TTL=0).

### 5.3 Denominators, nulls and small-n — non-negotiable

54% of production `case_progress` rows have NULL grades (§2.1), and 21 topic groups share ~24
attempts. Without these guards the console would confidently rank noise:

- Each metric carries **its own denominator**: `{avg_score, scored_n}`,
  `{pass_rate, graded_n}`, `{safety_fail_rate, safety_gradable_n}`, `{accuracy, n}`.
- Every rate/mean is `float | None`, null at n=0 (D13).
- **Normalise every `weakness_score` component to 0–1** before weighting — inputs arrive on
  0–100 (`score_100`), 0–1 (rates) and 0–100 (`get_topic_accuracy` `pct`), so a naive sum
  lets OSCE dominate 100×. Assert the range in a test.
- **Renormalise weights over the signals actually present.** A component with n=0 is dropped
  from the denominator, never zero-filled — otherwise trainers are sent to the *emptiest*
  topics rather than the worst. Emit `signals_present` and per-component n.
- **Confidence floor:** a component contributes only at ≥3 distinct students **and** ≥5
  attempts; apply shrinkage `w = n/(n+5)`. Emit `low_confidence` and sort those groups below
  confident ones. (6 of 21 groups have ≤5 cases in the library; OT `orthoptics` has 3.)
- **Safety denominator:** `safe = not missed_critical`, and `missed_critical` only fills for
  steps flagged critical, so an attempt on a checklist with no critical step yields
  `safe=True` carrying no safety signal. Preferred: extend the index with `has_critical` and
  require it. If that proves too costly at build time, fall back to `safe IS NOT NULL` and
  **document the confound in the §6.3 rubric block** — do not ship the naive version silently.
  Exclude the safety term from `weakness_score` (never zero it) when `safety_gradable_n == 0`.
- **`missed_top`:** cap at 3 per group, truncate each step to 80 chars, require ≥2 distinct
  students, and return `distinct_students` + denominator so a trainer reads "3 of 40".

### 5.4 Frontend

- **Panel-local** discipline switcher (D11) with the caption: *"Discipline: All · OA & PSA ·
  OT — filters the topic panels below; cohort totals and token usage cover all disciplines."*
  Harness-assert the caption (standing "explain to users" rule).
- `useCohortAnalytics(discipline, days)`; keys `["admin","cohort-analytics", discipline]` —
  trailing param elements, safe under the existing `["admin"]` prefix invalidation.
- **Chart budget:** weakest-topics and OSCE-vs-flashcard render as `BarSeries` reuse (two rows
  per group); the safety callout is `DonutGauge` reuse. `BarSeries` stacks one flex track and
  clamps negatives, so it cannot express grouped or diverging bars — the only genuinely new
  component in P2 is `DivergingBar` (§6.2), plus one additive `TrendChart` `series` prop (§7).
  No new CSS classes; reuse `.aurora-bar-*`, `.aurora-trend`, `.aurora-panel`.
- Panels use the P1 `PanelSkeleton`/`PanelError` pattern; a thin/empty flashcard table renders
  "no flashcard data yet", never a 0% bar.

### 5.5 Retire the superseded panels

`AdminCohort.tsx` derives `avgOsce`, `graded`/`unsafe`/`safetyRate` and `missCounts`/
`mostMissed` from `useActivity`, whose feed is **hard-capped at 80 items** — the exact defect
P1 fixed for the trend. Leaving them beside the new panel puts two disagreeing numbers on one
screen. Enumerate consumers first, then re-point the safety donut and most-missed bars at the
new endpoint and delete the feed-derived KPIs. `cohort_summary.weakest_topics` **stays on the
backend** (it feeds the insights prompt and the weekly digest); only the panel retires.

### 5.6 token-summary correctness

Point `/api/admin/token-summary` at `get_all_session_tokens()`, surface `complete`, and drop
it off the 30s poll to a longer `staleTime`. Ships standalone — it is a P1 leftover with zero
coupling to the depth layer.

## 6. Slice 2b — Explainable at-risk + mastery *(Plan B)*

### 6.1 Explainable at-risk — rewrite `tools/supervisor/at_risk.py`

```python
{"student_id", "risk_score": int,          # 0–100, higher = more at risk
 "band": "high"|"medium"|"low"|"no_data",
 "reasons": [{"factor", "detail", "weight"}],   # desc by weight
 "last_active", "days_inactive", "weak_topics", "weak_count"}   # back-compat
```

Signals: inactivity, broken streak, OSCE failing/declining, safety fails, low flashcard
accuracy, weak-topic breadth — weights in an explicit rubric constant, never inline numbers.

- **Missing-data rule:** a factor with no data is **excluded** and remaining weights
  renormalise to 100. A student with no performance data at all gets `band: "no_data"` with
  `reasons: [{factor: "never_started"}]` — not a fabricated score. Otherwise a never-started
  student either scores *lowest* risk (inverting the feature) or every new account flags high.
- **Return only `{high, medium}`** (D12).
- **Remove the `except Exception → []` swallow** — it makes the router's 500 guard unreachable,
  so an outage reads as "0 students at risk", i.e. "everyone is fine". Same for
  `cohort_summary()`'s all-zeros return. Let failures propagate to a real 500.
- Use the SGT clock (`app_today()`), not `date.today()` — the product defines a day in SGT and
  `last_active` is written that way; today's UTC comparison can return `days_inactive == -1`.
- Keep `date` as a module-level symbol or the existing `patch("tools.supervisor.at_risk.date")`
  test hook breaks and determinism cannot be frozen.
- Reconcile `cohort_summary.at_risk_count` — an independent hardcoded copy of the binary rule
  — to `count(band != "low")` from the same rubric, or the KPI contradicts the list beneath it.
  The harness pins that KPI to a fixture, so **CI will not catch the divergence**.
- Rewrite `tests/supervisor/test_at_risk.py` in the **same commit**.

### 6.2 Mastery vs cohort — extend `GET /api/admin/student/{id}/detail`

Return **three named scales**, never one blended number — the sources have different meanings,
and `retention_scores` is itself a mixture of two namespaces (flashcard-tag-keyed and raw
case-topic-keyed). Each is 0–100, nullable, with its own `cohort_avg`, `delta`, `cohort_n`:
`osce_mastery`, `flashcard_mastery`, `retention_mastery`. Bucket retention keys before
averaging (case keys via `resolve_set_strict`, flashcard keys via the crosswalk).

**Cohort mean is leave-one-out:** `(total − student) / (n − 1)`, with `cohort_avg`/`delta`
null when `cohort_n < 2`. Including the student makes a solo student's delta exactly `0.0`,
rendering as "exactly at cohort average" when the truth is "there is no cohort" — the common
case at today's volume.

**Wire hazard:** `BenchmarkTopic(**t)` silently drops every unknown key (pydantic
`extra='ignore'`) **and** sits outside its try/except, so a shape change raises an unhandled
`ValidationError` → 500 → with P1's throwing `getJSON` that takes out three panels at once.
Widen the model with Optional fields **and** move the construction inside the try.

`mastery` **supersedes** `cohort_retention`: re-point `AdminStudentDetail` and
`studentReportExport.ts` in the same commit, then delete the old field — two competing cohort
averages on one screen, with the downloadable report on the old one, is the P1 defect class.
Declare `mastery` optional, render defensively, and bump `PERSIST_SCHEMA_VERSION` (`"6"` →
`"7"`) in the same commit — admin queries persist to IndexedDB for 24h.

Add `@limiter.shared_limit("30/minute", scope="admin_student_detail")` + `request: Request`
(path param — the shared-scope form is required here).

## 7. Slice 2c — Time-series depth *(Plan C)*

### 7.1 A sibling read, not a widen

`get_case_progress_since()`'s two-column projection is deliberate — its docstring says it
exists so the trend "never pulls the full table onto the single prod worker". Add
**`get_case_scores_since(since_iso)`** selecting `student_id, completed_at, case_id,
score_100, safe, passed`, and leave the original byte-for-byte untouched.

### 7.2 Endpoint

```
GET /api/admin/performance-trend?days=&discipline=
    require_staff · @limiter.limit("60/minute") + request: Request
→ {"discipline", "period": "day"|"week",
   "points": [{"date", "avg_score": float|None, "pass_rate": float|None,
               "safety_fail_rate": float|None, "n": int}]}
```

`days` clamps `[1, 90]`. Bucket by **SGT** — P1's `str(ts)[:10]` yields the UTC date, which
would start every SGT day at 08:00; build the range from `app_today()`. This intentionally
diverges from P1's activity-trend; either fix that endpoint with the same helper or record
the discrepancy. A zero-activity day is `{n: 0, avg_score: None}` — not `0.0` (D13).

### 7.3 Frontend

`TrendChart` gains an additive `series: {values, tone, label}[]` prop (geometry unchanged —
`points()` per series against a shared `niceCeil` max). `usePerformanceTrend(days,
discipline)`; explicit empty state on an empty window.

## 8. Testing

TDD throughout: failing test first, watch it fail, minimal pass. Every planned test carries a
literal body and the exact expected failure text, per P1's plan granularity.

Backend (`pytest -q`, MOCK_MODE) — module-level `TestClient(app)` over the real singleton,
real JWT cookies via `create_access_token`, `patch("tools.shared.db.<fn>", new=AsyncMock(...))`,
`@pytest.mark.asyncio` on every async test (no pytest config → strict mode), and **never**
`importlib.reload(tools.api.shared)`. New `require_staff` endpoints get appended to
`STAFF_READ_ENDPOINTS` to inherit the four guard-tier tests for free.

Coverage must include, beyond the obvious per-metric maths: staff excluded from every
discipline view; crosswalk covers every flashcard **and** case key; unknown `discipline` → 400;
retake dedupe (5 attempts → `students=1, attempts=5, avg_score=best`); absent signals dropped
rather than zero-filled; small-n cannot top the ranking; empty pool returns nulls not zeros;
DB failure → 500 (never `[]` or all-zeros); flashcard unavailability flagged, not rendered as
0%; pagination past a cap; index built off the event loop and single-flighted; index grouping
matches the student-facing case list; SGT day bucketing; at-risk returns only flagged bands and
`at_risk_count` agrees with the list.

**Frontend:** `npm --prefix frontend run typecheck` + `build:safe` (webpack — Turbopack rejects
the junctioned `node_modules`). Harness routes must be added to **both**
`frontend/tests/aurora_assert.mjs` and `frontend/tests/_mocks.mjs` with a **trailing `*`**
(query strings), reconciling the pre-existing cohort-fixture drift at the same time. The
"mocked 500 renders an error state" assertion has no precedent in the repo: register the 500
route *after* the catch-all (last match wins) and select on `.aurora-panel-error` /
`[role="alert"]`. A new pure-logic `.mjs` harness is **auto-discovered** — drop it in
`frontend/tests/` and `npm run test:logic` picks it up; do NOT hand-add it to
`.github/workflows/ci.yml`. (Corrected 2026-08-01: this line said the opposite, which was
true when the spec was written. `804acbe` replaced the hand-maintained list after it had
drifted to 16 of 29 — thirteen harnesses existed, passed, and gated nothing — and `632c22e`
did the same for the browser half via `gated_harnesses()` in `scripts/start-harness.sh`.
Exclusions are now opt-OUT, and `NOT_GATED` is `visual_sweep.mjs` alone.)

**Behavioral verify before push** (per `/ship-check`, each plan): load `/admin` against the
running app and confirm the switcher changes the numbers below it, weakest topics reflect real
performance, low-confidence groups sort last, at-risk rows show reasons, mastery compares to
cohort, and a forced backend failure renders an error rather than a zero.

## 9. Rollout

No migration, no new env var. Plans land A → B → C; Plan C depends only on Plan A's index and
discipline map, so B and C may be reordered. Fail-closed behaviour and the active-profiles
invariant hold throughout.

**Verify during implementation, do not assume:** the NULL fraction of grade columns will drift
as more Tier-2 attempts land; no nameable PostgREST exception type is determinable from this
tree (the aggregator must catch bare `Exception` **and** flag `sources`, never swallow into a
zero); and the `has_critical` question in §5.3 needs a real cost check before choosing branch
(a) or (b).

## 10. Out of scope (deferred)

| Phase | Scope |
|---|---|
| P3 | Chunked/resumable CSV import, credential download, bulk actions, server-side roster query |
| P4 | SQL/RPC aggregation pushdown, **console-global discipline scoping** (threading `discipline` through `/supervisor/cohort`, `/benchmarks`, `/token-summary`, `/activity-trend`), keying `missed_top` on `(procedure, step_number)`, trainer/admin permission split, replacing poll-everything refresh. No tenant boundary (SNEC-only, locked) |
| P5 | Visual/motion/a11y rebuild of all charts, keyboard-navigable tables, focus trap, responsive |
| Later | Side-by-side discipline comparison (P2 is filter-only, D2) |
