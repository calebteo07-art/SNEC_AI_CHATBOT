# Admin console rebuild — P1: Truth & Safety — Design

**Date:** 2026-07-24
**Status:** Approved design → ready for implementation plan
**Audit basis:** full read of the admin surface at `origin/main` (`1be3a55`), in an isolated worktree

## 1. Goal

The admin console currently displays numbers it cannot justify and renders backend
failures as zeros. P1 makes the console **honest**: every figure on screen traces to
real data, every failure looks like a failure, and every destructive action is gated.

No new capability is added in P1. Depth (P2), operations (P3), access/scale (P4) and
the visual rebuild (P5) each get their own spec.

## 2. Why — the audit

An audit of all ten admin files plus `admin.py` / `supervisor.py` found the skeleton
sound (server-side authz on every endpoint, the active-profiles invariant honored,
`asyncio.to_thread` discipline correct) but the **product/data-integrity layer broken**.

A first pass was run against a local tree **178 commits behind `origin/main`** and
produced four stale findings. Re-audited at `origin/main`, these are **already fixed**
and are explicitly *not* in scope: the per-student `/insights` endpoint exists and is
well-built, `flashcard_accuracy` and `insights` are returned by `/detail`, and a durable
admin audit trail (`audit_events`, migration 014) ships with its own admin-only viewer.

**All implementation happens in a worktree at `origin/main`.** The local `main` is 178
behind and 68 ahead on a divergent line; shipping from it would clobber production.

## 3. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Fabricated chart magnitudes | **Delete.** Return real counts from the backend, or don't draw a bar |
| D2 | `getJSON` catch-all fallback | **Retire.** Failures propagate to React Query and render as errors |
| D3 | AI-insight failures | **Stay quiet** — a quota/AI failure is an empty state, not a red error |
| D4 | Activity trend source | **New server-side windowed endpoint**, never the capped feed |
| D5 | `detail` display string on feed items | **Keep** (back-compat) and add structured fields alongside |
| D6 | Scope discipline | No new analytics, no CSV rework, no visual redesign — those are P2/P3/P5 |
| D7 | Migrations | **None required.** 010 + 011 were applied 2026-07-14; P1 is pure code |

## 4. Components

### 4.1 Structured case fields on the activity feed — `admin.py::admin_activity`

The single highest-leverage change: it revives two dead panels, deletes a regex parser,
and removes a message that misleads.

Today each case feed item carries only a formatted display string, so `AdminCohort`
regex-scrapes `"32/40"` back out of it, and the Tier-2 OSCE panels — which filter on
`typeof f.safe === "boolean"` — are always empty. They therefore render *"Available once
the OSCE-grade migration is applied"*, a migration that has been live since 2026-07-14.
The data exists in `case_progress`; the endpoint simply never selects it.

Add to each `type: "case"` feed item, keeping `detail` unchanged:

```python
"case_id": str, "total_score": int, "passed": bool,
"score_100": int | None, "safe": bool | None, "missed_critical": list[str],
```

**Precondition to verify, not assume:** confirm `db.get_all_case_progress()` actually
returns the migration-011 columns (`score_100`, `safe`, `missed_critical`). If it selects
an explicit column list, widen it.

Consumers in `AdminCohort.tsx`: delete `parseCaseScore`; compute `avgOsce` from
`score_100` when present, falling back to `total_score / 40`; the safety-rate donut and
most-missed-steps bars now populate from real fields. Delete the migration-blame
placeholder text — replace with a true empty state ("no graded attempts yet").

### 4.2 Real magnitudes for weakest topics — `tools/supervisor/cohort_summary.py`

`cohort_summary()` returns `weakest_topics` as bare strings from `most_common(3)`, so the
chart has no magnitude to plot and invents one from the list index. Return the counts:

```python
"weakest_topics": [{"topic": str, "count": int}, ...]   # desc by count, max 8
```

Raise the cap from 3 to 8 (the UI already slices 6). Bar length becomes
`count / max(count)`.

**Consumers to update — enumerate and fix all before changing the type:**
`CohortSummaryResponse.weakest_topics` (`supervisor.py`), the insights context string at
`supervisor.py:208` (join `t["topic"]`), the frontend `Cohort` interface and `weakRows`,
and any use in `at_risk.py` / `weekly_digest.py` / `generate_report.py` — audit these,
do not assume they are unaffected.

### 4.3 Failures look like failures — `frontend/src/hooks/useAdmin.ts`

`getJSON(url, fallback)` catches everything and returns the fallback, so `isError` is
never true and a 500 renders as "Total students: 0 · At risk: 0". For a clinical
dashboard this is the most dangerous defect in the console: broken looks like good news.

Replace with a throwing fetcher:

```ts
async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}
```

Each hook keeps its shape normalization (`?? []`) but drops the fallback argument.
Panels then render three distinct states:

- `isLoading` → skeleton (KPIs must **never** show `0` while loading)
- `isError` → inline error with a retry that calls `refetch()`
- loaded-but-empty → an explicit empty state

**Exception (D3):** `useCohortInsight` keeps a tolerant path. The AI narrative is a paid,
quota-limited call; a 503 is an expected absence, not a fault. It resolves to `""` and
the panel simply doesn't render.

### 4.4 An honest activity trend — new endpoint

"Activity · last 3 weeks" is bucketed from a feed hard-capped at 80 events
(50 sessions + 50 cases → sorted → `[:80]`), so at real cohort volume the chart covers
days, not weeks, and undercounts silently.

```
GET /api/admin/activity-trend?days=21     (require_staff, rate-limited)
→ {"days": [{"date": "YYYY-MM-DD", "sessions": int, "cases": int, "total": int}, ...]}
```

Counted server-side across the true window, `days` clamped to `[1, 90]`. Frontend adds
`useActivityTrend`; `TrendChart` consumes `days.map(d => d.total)`; `dailyCounts` is
deleted.

**Main implementation risk:** this needs a `since`-filtered count over `sessions` and
`case_progress`. If `tools/shared/db.py` has no windowed helper, add one — do **not**
implement it as `get_all_sessions()` filtered in Python, which would make the existing
full-table-scan problem worse on a single worker.

### 4.5 Guardrails on destructive and unbounded actions

**Confirmation on removal.** `AdminProvisioning`'s bare `×` permanently unapproves an
account with no dialog and no undo. Gate it behind a confirm showing the full name and
email being revoked, with the action named explicitly ("Remove access").

**Rate limits on the write endpoints.** Reads were hardened upstream (`/audit` 30/min,
`/insights` 20/min) but writes were not. Apply `@limiter.limit` to `POST /api/admin/approved`,
`DELETE /api/admin/approved/{email}`, `POST /api/admin/promote`,
`DELETE /api/admin/promote/{email}` (20/minute each) and `POST /api/admin/upload-csv`
(5/minute). `upload_csv` has no `request: Request` parameter — add it, as the shared
limiter keys off the real caller.

**Digest recipient allow-list.** `POST /api/supervisor/send-digest` sends cohort data to
an arbitrary `body.recipient`, so any staff account can exfiltrate a digest to any
external address. Require `body.recipient` (normalized lowercase) to match an email in
the staff roster — `db.get_staff_roster()`, the same source the Staff section reads —
otherwise 400 with a non-enumerating message. If the roster lookup itself fails, fail
closed (reject), never fall through to sending.

### 4.6 Delete the dead surface

- **`frontend/src/aurora/screens/AdminAccounts.tsx`** — 286 lines, imported by nothing,
  described by its own successor as "the retired AdminAccounts"
- **`AdminStudentDetail`** adopts the existing `useStudentDetail` hook in place of its
  hand-rolled `useEffect` + `fetch`. This deletes code *and* gains caching, polling and
  `["admin"]` invalidation — the hook is currently defined but never imported
- **The false pool-filter sentence** in `Admin.tsx` ("Switch the content pool … to view a
  discipline's cohort"). No pool filtering exists anywhere in `admin.py` or
  `tools/supervisor/`. Real per-discipline filtering is P2
- **`adminShared.tsx`**: the react-router outlet-context shim (`AdminCtxProvider`,
  `useAdminOutlet`) for a router this app does not use, plus the duplicate types that
  shadow `useAdmin.ts`. Verify no importers before removing each

## 5. Testing

TDD: failing test first, watch it fail, minimal pass.

**Backend** (`pytest -q`, `MOCK_MODE`):

| Test | Asserts |
|---|---|
| `test_activity_feed_emits_case_grade_fields` | A `case_progress` row with `score_100`/`safe`/`missed_critical` surfaces those fields on the feed item |
| `test_cohort_summary_returns_topic_counts` | `weakest_topics` is `[{topic, count}]`, sorted desc, capped at 8 |
| `test_activity_trend_buckets_by_day` | N days returned, per-day counts correct, `days` clamped to `[1, 90]` |
| `test_activity_trend_ignores_removed_students` | Honors the active-profiles invariant |
| `test_send_digest_rejects_unknown_recipient` | Non-staff recipient → 400 |
| `test_admin_write_endpoints_rate_limited` | The five write endpoints carry the limiter |

**Frontend:** `npm run typecheck && npm run build`, plus a harness assertion that a
mocked 500 renders an **error state**, not zeros — this is the regression guard for the
defect most likely to silently return.

**Behavioral verify before push** (per `/ship-check`): load `/admin` against the running
app and confirm the OSCE panels show real data, the weakest-topic bars match the returned
counts, a forced backend failure shows an error rather than `0`, and removal prompts.

## 6. Rollout

No migration, no new environment variable, no coordinated setup — P1 is pure code and
safe to ship incrementally. Each of the six components is independently shippable and
independently verifiable; land them in the order above, since 4.1 alone converts three
findings.

## 7. Out of scope

| Phase | Scope |
|---|---|
| P2 | Real aggregation, time-series depth, explainable at-risk, per-discipline filtering, data-viz rebuild |
| P3 | Chunked/resumable CSV import, credential download, bulk actions, server-side roster query |
| P4 | Trainer/admin permission split, replacing poll-everything refresh. **No tenant boundary** — SNEC is the only tenant (decided 2026-07-24) |
| P5 | Visual rebuild, keyboard-navigable tables, focus trap, responsive |
