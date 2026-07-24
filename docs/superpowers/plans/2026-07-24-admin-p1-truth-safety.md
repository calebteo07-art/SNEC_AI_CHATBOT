# Admin Console P1 — Truth & Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the EyeBot admin console honest — every displayed figure traces to real data, every backend failure renders as an error rather than a zero, and every destructive or unbounded action is gated.

**Architecture:** Six independent slices against the existing FastAPI + Next.js admin surface. The backend stops emitting presentation-only strings and starts emitting structured numbers; the frontend stops swallowing errors and stops inventing chart magnitudes. No new capability, no schema change — migrations 010/011 were applied 2026-07-14, so the dead OSCE panels are a plain bug, not a blocked feature.

**Tech Stack:** FastAPI (Python 3.12, async), pytest + `unittest.mock.patch`/`AsyncMock` + `fastapi.testclient`, Next.js 16 App Router, React 19, TanStack Query, Tailwind 4.

**Design spec:** `docs/superpowers/specs/2026-07-24-admin-p1-truth-safety-design.md`

---

## Critical context for the implementer

**Work in the origin/main worktree.** The main checkout's `main` is 178 commits behind `origin/main` and 68 ahead on a divergent line. Shipping from it reverts production. Verify before starting:

```bash
git rev-parse --short HEAD && git rev-parse --short origin/main
```

**Two preconditions already verified — do not re-litigate:**
- `db.get_all_case_progress()` uses `select("*")` (`tools/shared/db.py:402`), so the migration-011 columns (`score_100`, `safe`, `missed_critical`) already flow through. Task 1 needs no DB change.
- `tests/conftest.py` resets `limiter._storage` between tests, so rate-limit tests are safe to write behaviorally.

**Known bug deliberately deferred to P2:** `db.get_all_sessions()` defaults to `limit=500`, so `/api/admin/token-summary` silently under-reports once a cohort exceeds 500 sessions. Real, but out of P1 scope. Do not fix it here.

**Frontend test fixtures — reconcile on EVERY endpoint-shape change (learned in Task 4).** The CI-gated aurora harness mocks all `/api/*` calls from two files: `frontend/tests/aurora_assert.mjs` and `frontend/tests/_mocks.mjs`. `tsc`/`build` do NOT type-check these `.mjs` fixtures, so a stale mock shape passes typecheck+build and only fails at render time in the harness. Any task that changes an admin/supervisor endpoint's response shape, or adds a new endpoint, MUST update the corresponding mock in BOTH files to the new shape (realistic values, internally consistent — e.g. an OSCE `safe: true` item pairs with `missed_critical: []`). This applies to Tasks 6, 7 and 8 below. Verify with `bash scripts/start-harness.sh aurora`.

**Stop the harness server before any build (project trap).** `scripts/start-harness.sh` leaves `node .next/standalone/server.js` running on :3000; it holds a lock on `.next/standalone` and the next `next build` dies with `EBUSY`. Always `bash scripts/start-harness.sh stop` (or kill the node PID) before building.

## File structure

| File | Responsibility | Change |
|---|---|---|
| `tools/api/routers/admin.py` | Admin endpoints | Modify: structured feed fields, new trend endpoint, write-endpoint rate limits |
| `tools/api/routers/supervisor.py` | Supervisor endpoints | Modify: `WeakTopic` model, insights context string, digest allow-list |
| `tools/supervisor/cohort_summary.py` | Cohort aggregation | Modify: return topic counts |
| `tools/shared/db.py` | Supabase access | Modify: add two windowed read helpers |
| `frontend/src/hooks/useAdmin.ts` | Admin data layer | Modify: throwing fetcher, `useActivityTrend` |
| `frontend/src/aurora/components/admin/PanelState.tsx` | Shared load/error affordances | **Create** |
| `frontend/src/aurora/screens/AdminCohort.tsx` | Cohort band | Modify: real magnitudes, structured KPIs, panel states |
| `frontend/src/aurora/screens/AdminProvisioning.tsx` | Provisioning | Modify: confirm-on-remove |
| `frontend/src/aurora/screens/AdminStudentDetail.tsx` | Drill-down modal | Modify: adopt `useStudentDetail` |
| `frontend/src/aurora/screens/Admin.tsx` | Shell | Modify: remove false pool sentence |
| `frontend/src/aurora/screens/AdminAccounts.tsx` | — | **Delete** (dead) |
| `frontend/src/aurora/aurora.css` | Styles | Modify: skeleton + panel-error classes |
| `tests/api/test_admin_activity_fields.py` | Feed contract | **Create** |
| `tests/api/test_admin_activity_trend.py` | Trend endpoint | **Create** |
| `tests/api/test_admin_write_ratelimit.py` | Write-endpoint caps | **Create** |
| `tests/supervisor/test_cohort_summary_counts.py` | Topic counts | **Create** |
| `tests/supervisor/test_cohort_summary.py` | Pre-existing cohort tests | Modify: one assertion to the new shape |
| `tests/api/test_supervisor_digest_allowlist.py` | Digest allow-list | **Create** |

---

## Task 1: Structured case fields on the activity feed

The feed emits only a formatted display string, so `AdminCohort` regex-scrapes `"32/40"` out of it and the two Tier-2 OSCE panels — which filter on `typeof f.safe === "boolean"` — are always empty.

**Files:**
- Modify: `tools/api/routers/admin.py` (the `for c in cases[:50]` loop in `admin_activity`)
- Test: `tests/api/test_admin_activity_fields.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_admin_activity_fields.py
"""The activity feed must carry structured case-grade fields, not just a display string.

AdminCohort previously regex-parsed "32/40" back out of `detail` for its avg-OSCE KPI,
and its two Tier-2 OSCE panels filtered on a `safe` field the feed never emitted — so
they permanently rendered a placeholder blaming migration 011, which has been applied
since 2026-07-14. The data is in case_progress; the endpoint just never sent it.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _admin_cookie():
    return {"eyebot_token": create_access_token("stu_feed_fields", "admin", "OA")}


def _patches(cases):
    consent = [{"student_id": "act1", "student_name": "Active Ann"}]
    active = [{"student_id": "act1", "role": "OA"}]
    return (
        patch("tools.shared.db.get_all_sessions", new=AsyncMock(return_value=[])),
        patch("tools.shared.db.get_all_case_progress", new=AsyncMock(return_value=cases)),
        patch("tools.shared.db.get_all_consent", new=AsyncMock(return_value=consent)),
        patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=active)),
    )


def test_activity_feed_emits_case_grade_fields():
    cases = [{
        "student_id": "act1", "case_id": "case_ot_001", "total_score": 32,
        "passed": True, "completed_at": "2026-07-20T10:00:00Z",
        "score_100": 82, "safe": False, "missed_critical": ["Did not check IOP"],
    }]
    p1, p2, p3, p4 = _patches(cases)
    with p1, p2, p3, p4:
        r = client.get("/api/admin/activity", cookies=_admin_cookie())
    assert r.status_code == 200
    item = next(i for i in r.json()["feed"] if i["type"] == "case")
    assert item["case_id"] == "case_ot_001"
    assert item["total_score"] == 32
    assert item["passed"] is True
    assert item["score_100"] == 82
    assert item["safe"] is False
    assert item["missed_critical"] == ["Did not check IOP"]


def test_activity_feed_omits_grade_fields_when_ungraded():
    """A pre-Tier-2 row has no rich columns — omit the keys rather than inventing zeros,
    so the frontend can distinguish 'ungraded' from 'scored 0'."""
    cases = [{
        "student_id": "act1", "case_id": "case_oa_002", "total_score": 28,
        "passed": True, "completed_at": "2026-07-20T10:00:00Z",
    }]
    p1, p2, p3, p4 = _patches(cases)
    with p1, p2, p3, p4:
        r = client.get("/api/admin/activity", cookies=_admin_cookie())
    assert r.status_code == 200
    item = next(i for i in r.json()["feed"] if i["type"] == "case")
    assert "score_100" not in item
    assert "safe" not in item
    assert item["total_score"] == 28


def test_activity_feed_keeps_display_detail_string():
    """`detail` still drives the human-readable feed row — additive change only."""
    cases = [{
        "student_id": "act1", "case_id": "case_ot_001", "total_score": 32,
        "passed": True, "completed_at": "2026-07-20T10:00:00Z",
    }]
    p1, p2, p3, p4 = _patches(cases)
    with p1, p2, p3, p4:
        r = client.get("/api/admin/activity", cookies=_admin_cookie())
    item = next(i for i in r.json()["feed"] if i["type"] == "case")
    assert item["detail"] == "case_ot_001 ✓ · 32/40"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/api/test_admin_activity_fields.py -v`
Expected: FAIL — `KeyError: 'case_id'` on the first test (the feed item has no `case_id` key).

- [ ] **Step 3: Write minimal implementation**

In `tools/api/routers/admin.py`, replace the `for c in cases[:50]:` block inside `admin_activity` with:

```python
    for c in cases[:50]:
        sid = str(c.get("student_id", ""))
        if sid not in active_ids:
            continue
        passed = bool(c.get("passed", False))
        case_id = str(c.get("case_id", ""))
        total_score = int(c.get("total_score") or 0)
        item = {
            "type": "case",
            "student_id": sid,
            "name": name_map.get(sid, sid[:8]),
            # Human-readable row text (unchanged) — the structured fields below are what
            # the cohort KPIs and OSCE panels read. Never parse numbers back out of this.
            "detail": case_id + (" ✓" if passed else " ✗") + " · " + str(total_score) + "/40",
            "timestamp": str(c.get("completed_at", "")),
            "case_id": case_id,
            "total_score": total_score,
            "passed": passed,
        }
        # Migration-011 rich grade columns. Omitted when absent so the frontend can tell
        # "not graded under Tier-2" apart from "graded zero". Use `is not None`, never a
        # truthy check: `safe = not missed_critical`, so every SAFE attempt has
        # missed_critical == [] and a truthy check would drop the key for exactly those
        # rows, making a safe graded attempt look ungraded on the wire.
        if c.get("score_100") is not None:
            item["score_100"] = int(c["score_100"])
        if c.get("safe") is not None:
            item["safe"] = bool(c["safe"])
        if c.get("missed_critical") is not None:
            item["missed_critical"] = [str(m) for m in c["missed_critical"]]
        feed.append(item)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/api/test_admin_activity_fields.py tests/api/test_admin_endpoints.py -v`
Expected: PASS — all three new tests, and the existing `test_admin_activity_excludes_removed_student` still green.

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/admin.py tests/api/test_admin_activity_fields.py
git commit -m "fix(admin): emit structured case-grade fields on the activity feed"
```

---

## Task 2: Consume the structured fields in the cohort band

**Files:**
- Modify: `frontend/src/hooks/useAdmin.ts` (the `FeedItem` interface)
- Modify: `frontend/src/aurora/screens/AdminCohort.tsx`

- [ ] **Step 1: Widen the `FeedItem` interface**

In `frontend/src/hooks/useAdmin.ts`, replace the `FeedItem` interface with:

```ts
export interface FeedItem {
  type: string; student_id: string; name: string; detail: string; timestamp: string;
  token_count?: number;
  // Structured case fields — the cohort KPIs and OSCE panels read these, never `detail`.
  case_id?: string; total_score?: number; passed?: boolean;
  score_100?: number; safe?: boolean; missed_critical?: string[];
}
```

- [ ] **Step 2: Delete the regex parser and compute the KPI from real fields**

In `frontend/src/aurora/screens/AdminCohort.tsx`, delete this function entirely:

```ts
/* Parse "C123 ✓ · 32/40" (admin activity feed) → the /40 score, or null. */
function parseCaseScore(detail: string): number | null {
  const m = detail.match(/(\d+)\s*\/\s*40/);
  return m ? Number(m[1]) : null;
}
```

Then replace the `caseScores` / `avgOsce` lines with:

```ts
  // Prefer the Tier-2 Station-100 score; fall back to the base /40 total. Both are real
  // numeric fields from the feed — never parsed out of the display string.
  const caseScores = caseItems
    .map((f) =>
      typeof f.score_100 === "number" ? f.score_100
      : typeof f.total_score === "number" ? (f.total_score / 40) * 100
      : null,
    )
    .filter((x): x is number => x !== null);
  const avgOsce = caseScores.length
    ? Math.round(caseScores.reduce((a, b) => a + b, 0) / caseScores.length)
    : null;
```

- [ ] **Step 3: Replace the two misleading OSCE placeholders**

Both panels currently blame an unapplied migration. In `AdminCohort.tsx`, change the safety-rate fallback text from:

```tsx
            <p className="aurora-unavail">Available once the OSCE-grade migration is applied — per-attempt safety isn’t recorded yet.</p>
```

to:

```tsx
            <p className="aurora-unavail">No graded station attempts in the recent activity window yet.</p>
```

and the most-missed fallback from:

```tsx
            <p className="aurora-unavail">Available once the OSCE-grade migration records missed-critical steps.</p>
```

to:

```tsx
            <p className="aurora-unavail">No missed critical steps recorded in the recent activity window.</p>
```

- [ ] **Step 4: Verify typecheck and build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useAdmin.ts frontend/src/aurora/screens/AdminCohort.tsx
git commit -m "fix(admin): cohort KPIs read structured case fields, not a parsed string"
```

---

## Task 3: Cohort summary returns real topic counts

The chart invents bar lengths because the backend returns bare strings with no magnitude.

**Files:**
- Modify: `tools/supervisor/cohort_summary.py:69`
- Modify: `tools/api/routers/supervisor.py` (`CohortSummaryResponse`, insights context)
- Test: `tests/supervisor/test_cohort_summary_counts.py`

- [ ] **Step 1: Find every consumer before changing the type**

Run: `grep -rn "weakest_topics" tools/ frontend/src/ tests/`

Expected consumers: `cohort_summary.py` (producer), `supervisor.py` (response model + insights string), `useAdmin.ts` (`Cohort` interface), `AdminCohort.tsx` (`weakRows`), and **the existing test `tests/supervisor/test_cohort_summary.py:50`, which asserts `result["weakest_topics"][0] == "glaucoma"` and will fail until updated in Step 6.** **If the grep surfaces any consumer not in that list — e.g. in `weekly_digest.py` or `generate_report.py` — update it in this task too.**

- [ ] **Step 2: Write the failing test**

```python
# tests/supervisor/test_cohort_summary_counts.py
"""weakest_topics must carry real counts.

It previously returned bare strings from most_common(3), so the cohort chart had no
magnitude to plot and fabricated bar lengths from the list index
(`0.9 - i * 0.12`) — a chart whose lengths meant nothing to a clinical educator.
"""
from unittest.mock import AsyncMock, patch

import pytest

from tools.supervisor.cohort_summary import cohort_summary


def _profile(sid: str, weak: list[str]) -> dict:
    return {"student_id": sid, "last_active": "2026-07-24", "weak_topics": weak}


@pytest.mark.asyncio
async def test_weakest_topics_carry_counts_sorted_desc():
    profiles = [
        _profile("s1", ["tonometry", "refraction"]),
        _profile("s2", ["tonometry"]),
        _profile("s3", ["tonometry", "refraction"]),
    ]
    with patch("tools.shared.db.get_active_profiles", new=AsyncMock(return_value=profiles)):
        out = await cohort_summary()
    assert out["weakest_topics"][0] == {"topic": "tonometry", "count": 3}
    assert out["weakest_topics"][1] == {"topic": "refraction", "count": 2}


@pytest.mark.asyncio
async def test_weakest_topics_capped_at_eight():
    """The UI slices 6; return 8 so the cap is the UI's choice, not an invisible 3."""
    profiles = [_profile("s1", [f"topic_{i}" for i in range(12)])]
    with patch("tools.shared.db.get_active_profiles", new=AsyncMock(return_value=profiles)):
        out = await cohort_summary()
    assert len(out["weakest_topics"]) == 8


@pytest.mark.asyncio
async def test_weakest_topics_empty_when_no_weak_topics():
    profiles = [_profile("s1", [])]
    with patch("tools.shared.db.get_active_profiles", new=AsyncMock(return_value=profiles)):
        out = await cohort_summary()
    assert out["weakest_topics"] == []
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m pytest tests/supervisor/test_cohort_summary_counts.py -v`
Expected: FAIL — `assert 'tonometry' == {'topic': 'tonometry', 'count': 3}`.

- [ ] **Step 4: Change the producer**

In `tools/supervisor/cohort_summary.py`, change the return value's `weakest_topics` line from:

```python
        "weakest_topics": [t for t, _ in topic_counter.most_common(3)],
```

to:

```python
        "weakest_topics": [
            {"topic": t, "count": n} for t, n in topic_counter.most_common(8)
        ],
```

Also update the docstring's shape comment from `"weakest_topics": list[str],` to `"weakest_topics": list[{"topic": str, "count": int}],`, and update the early-return error dict — its `"weakest_topics": []` is already correct, leave it.

- [ ] **Step 5: Update the pre-existing cohort-summary test**

`tests/supervisor/test_cohort_summary.py` predates this change and asserts the old string
shape. Update the one assertion at line 50 from:

```python
    assert result["weakest_topics"][0] == "glaucoma"  # appears in 2 profiles
```

to:

```python
    assert result["weakest_topics"][0] == {"topic": "glaucoma", "count": 2}  # appears in 2 profiles
```

Leave the rest of that file alone.

- [ ] **Step 6: Update the API response model and the insights prompt**

In `tools/api/routers/supervisor.py`, add above `CohortSummaryResponse`:

```python
class WeakTopic(BaseModel):
    topic: str
    count: int
```

and change the field:

```python
    weakest_topics: list[WeakTopic]
```

Then fix the insights context string, which joins the list as if it were strings:

```python
        f"Weakest topics: {', '.join(t['topic'] for t in cohort.get('weakest_topics', [])) or 'none recorded'}\n"
```

- [ ] **Step 7: Run the full backend suite**

Run: `python -m pytest -q`
Expected: PASS — including the updated `tests/supervisor/test_cohort_summary.py`. The supervisor cohort endpoint must still return 200; a model mismatch surfaces here as a pydantic `ResponseValidationError`.

- [ ] **Step 8: Commit**

```bash
git add tools/supervisor/cohort_summary.py tools/api/routers/supervisor.py tests/supervisor/test_cohort_summary_counts.py tests/supervisor/test_cohort_summary.py
git commit -m "fix(admin): cohort weakest_topics carry real counts instead of bare strings"
```

---

## Task 4: Weakest-topic bars use the real counts

**Files:**
- Modify: `frontend/src/hooks/useAdmin.ts` (`Cohort` interface)
- Modify: `frontend/src/aurora/screens/AdminCohort.tsx` (`weakRows`)

- [ ] **Step 1: Update the `Cohort` interface**

In `frontend/src/hooks/useAdmin.ts`:

```ts
export interface WeakTopic { topic: string; count: number }
export interface Cohort {
  total: number; active_this_week: number; at_risk_count: number;
  weakest_topics: WeakTopic[];
  inactive_7_plus_days: { student_id: string; days_inactive: number }[];
}
```

- [ ] **Step 2: Plot the real magnitudes**

In `frontend/src/aurora/screens/AdminCohort.tsx`, replace the fabricated `weakRows` block:

```ts
  const weakRows: BarRow[] = (c?.weakest_topics ?? []).slice(0, 6).map((t, i) => ({
    label: t.replace(/_/g, " "),
    segments: [{ value: Math.max(0.2, 0.9 - i * 0.12), tone: "rose" }],
    weak: true,
  }));
```

with:

```ts
  // Bar length is the real student count, normalised to the largest. The previous
  // `0.9 - i * 0.12` derived length from list position — a fabricated magnitude.
  const weakTopics = c?.weakest_topics ?? [];
  const weakMax = weakTopics.length ? Math.max(...weakTopics.map((w) => w.count)) : 1;
  const weakRows: BarRow[] = weakTopics.slice(0, 6).map((w) => ({
    label: w.topic.replace(/_/g, " "),
    segments: [{ value: w.count / weakMax, tone: "rose" }],
    readout: String(w.count),
    weak: true,
  }));
```

- [ ] **Step 3: Verify typecheck and build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useAdmin.ts frontend/src/aurora/screens/AdminCohort.tsx
git commit -m "fix(admin): weakest-topic bars plot real counts, not list position"
```

---

## Task 5: Windowed DB read helpers

The trend endpoint needs a `since` filter. Implementing it as `get_all_sessions()` filtered in Python would worsen the existing full-scan load on a single Render worker.

**Files:**
- Modify: `tools/shared/db.py` (next to `get_all_sessions` / `get_all_case_progress`, ~line 400)

- [ ] **Step 1: Add the two helpers**

In `tools/shared/db.py`, immediately after `get_all_case_progress`:

```python
async def get_sessions_since(since_iso: str) -> list[dict]:
    """Sessions created at/after `since_iso` (ISO date or timestamp), all students.

    Windowed at the DB so the activity-trend endpoint never pulls the full table onto
    the single prod worker. Selects only the two columns the trend needs."""
    client = await _get_client()
    result = (
        await client.table("chat_sessions")
        .select("student_id, created_at")
        .gte("created_at", since_iso)
        .execute()
    )
    return result.data or []


async def get_case_progress_since(since_iso: str) -> list[dict]:
    """Case completions at/after `since_iso`, all students. See get_sessions_since."""
    client = await _get_client()
    result = (
        await client.table("case_progress")
        .select("student_id, completed_at")
        .gte("completed_at", since_iso)
        .execute()
    )
    return result.data or []
```

- [ ] **Step 2: Verify nothing broke**

Run: `python -m pytest -q`
Expected: PASS (additive change, no existing caller).

- [ ] **Step 3: Commit**

```bash
git add tools/shared/db.py
git commit -m "feat(db): windowed session/case reads for the admin activity trend"
```

---

## Task 6: Honest activity-trend endpoint

"Activity · last 3 weeks" is bucketed from a feed hard-capped at 80 items, so at cohort volume it covers days, not weeks, and undercounts silently.

**Files:**
- Modify: `tools/api/routers/admin.py` (import `timedelta`; new endpoint after `admin_activity`)
- Test: `tests/api/test_admin_activity_trend.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_admin_activity_trend.py
"""The cohort activity trend must be counted server-side over a real window.

It was previously derived client-side from /api/admin/activity, whose feed is capped
at 80 items (50 sessions + 50 cases, then [:80]) — so a "last 3 weeks" chart actually
covered days at real cohort volume, and undercounted without saying so.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

TODAY = datetime.now(timezone.utc).date()
D0 = TODAY.isoformat()
D1 = (TODAY - timedelta(days=1)).isoformat()


def _staff_cookie(sub: str = "stu_trend"):
    return {"eyebot_token": create_access_token(sub, "trainer", "OA")}


def _patches(sessions, cases, active):
    return (
        patch("tools.shared.db.get_sessions_since", new=AsyncMock(return_value=sessions)),
        patch("tools.shared.db.get_case_progress_since", new=AsyncMock(return_value=cases)),
        patch("tools.shared.db.get_active_leaderboard_profiles", new=AsyncMock(return_value=active)),
    )


def test_activity_trend_buckets_counts_by_day():
    sessions = [
        {"student_id": "act1", "created_at": f"{D0}T09:00:00Z"},
        {"student_id": "act1", "created_at": f"{D1}T09:00:00Z"},
    ]
    cases = [{"student_id": "act1", "completed_at": f"{D0}T11:00:00Z"}]
    p1, p2, p3 = _patches(sessions, cases, [{"student_id": "act1"}])
    with p1, p2, p3:
        r = client.get("/api/admin/activity-trend?days=3", cookies=_staff_cookie())
    assert r.status_code == 200
    days = r.json()["days"]
    assert len(days) == 3
    by_date = {d["date"]: d for d in days}
    assert by_date[D0]["sessions"] == 1
    assert by_date[D0]["cases"] == 1
    assert by_date[D0]["total"] == 2
    assert by_date[D1]["sessions"] == 1
    assert by_date[D1]["total"] == 1


def test_activity_trend_excludes_removed_students():
    """Honors the active-members invariant, exactly like /activity and /token-summary."""
    sessions = [
        {"student_id": "act1", "created_at": f"{D0}T09:00:00Z"},
        {"student_id": "rem1", "created_at": f"{D0}T09:30:00Z"},
    ]
    p1, p2, p3 = _patches(sessions, [], [{"student_id": "act1"}])
    with p1, p2, p3:
        r = client.get("/api/admin/activity-trend?days=2", cookies=_staff_cookie("stu_trend2"))
    assert r.status_code == 200
    by_date = {d["date"]: d for d in r.json()["days"]}
    assert by_date[D0]["sessions"] == 1


def test_activity_trend_returns_contiguous_days_including_empty_ones():
    """Every day in the window is present, even with zero activity — a gap-free x-axis."""
    p1, p2, p3 = _patches([], [], [{"student_id": "act1"}])
    with p1, p2, p3:
        r = client.get("/api/admin/activity-trend?days=7", cookies=_staff_cookie("stu_trend3"))
    days = r.json()["days"]
    assert len(days) == 7
    assert all(d["total"] == 0 for d in days)
    assert [d["date"] for d in days] == sorted(d["date"] for d in days)


def test_activity_trend_clamps_days():
    p1, p2, p3 = _patches([], [], [])
    with p1, p2, p3:
        r = client.get("/api/admin/activity-trend?days=999", cookies=_staff_cookie("stu_trend4"))
    assert len(r.json()["days"]) == 90
    p1, p2, p3 = _patches([], [], [])
    with p1, p2, p3:
        r = client.get("/api/admin/activity-trend?days=0", cookies=_staff_cookie("stu_trend5"))
    assert len(r.json()["days"]) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/api/test_admin_activity_trend.py -v`
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 3: Write the implementation**

In `tools/api/routers/admin.py`, change the datetime import line to:

```python
from datetime import datetime, timedelta, timezone
```

Then add this endpoint directly after `admin_activity`:

```python
@router.get("/api/admin/activity-trend")
@limiter.limit("60/minute")
async def admin_activity_trend(request: Request, days: int = 21,
                               current_user: CurrentUser = Depends(require_staff)):
    """Per-day cohort activity counts across a real window.

    Deliberately NOT derived from /api/admin/activity: that feed is capped at 80 items,
    so a client-side 3-week bucket silently undercounted at cohort volume. Counted here
    from windowed DB reads instead. `days` clamps to [1, 90]."""
    days = max(1, min(days, 90))
    start = datetime.now(timezone.utc).date() - timedelta(days=days - 1)
    try:
        sessions = await db.get_sessions_since(start.isoformat())
        cases = await db.get_case_progress_since(start.isoformat())
        # Active members only — same invariant as /activity and /token-summary.
        active_ids = {str(p.get("student_id")) for p in await db.get_active_leaderboard_profiles()}
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")

    buckets: dict[str, dict] = {
        (start + timedelta(days=i)).isoformat(): {"sessions": 0, "cases": 0}
        for i in range(days)
    }

    def _tally(rows: list[dict], ts_key: str, bucket_key: str) -> None:
        for row in rows:
            if str(row.get("student_id", "")) not in active_ids:
                continue
            day = str(row.get(ts_key) or "")[:10]
            if day in buckets:
                buckets[day][bucket_key] += 1

    _tally(sessions, "created_at", "sessions")
    _tally(cases, "completed_at", "cases")

    return {"days": [
        {"date": d, "sessions": v["sessions"], "cases": v["cases"],
         "total": v["sessions"] + v["cases"]}
        for d, v in sorted(buckets.items())
    ]}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/api/test_admin_activity_trend.py -v`
Expected: PASS, all five.

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/admin.py tests/api/test_admin_activity_trend.py
git commit -m "feat(admin): server-side activity trend over a real window"
```

---

## Task 7: Frontend consumes the trend endpoint

**Files:**
- Modify: `frontend/src/hooks/useAdmin.ts`
- Modify: `frontend/src/aurora/screens/AdminCohort.tsx`

- [ ] **Step 1: Add the hook**

In `frontend/src/hooks/useAdmin.ts`, after `useActivity`:

```ts
export interface TrendDay { date: string; sessions: number; cases: number; total: number }
/** Server-side per-day activity counts. Replaces bucketing the (80-item capped)
    activity feed client-side, which silently undercounted at cohort volume. */
export function useActivityTrend(days = 21) {
  return useQuery<TrendDay[]>({
    queryKey: ["admin", "activity-trend", days],
    queryFn: async () =>
      (await getJSON<{ days?: TrendDay[] }>(`/api/admin/activity-trend?days=${days}`)).days ?? [],
    ...LIVE,
  });
}
```

> Note: this uses the single-argument `getJSON` introduced in Task 8. If you are doing Task 7 before Task 8, pass the fallback as the second argument (`, { }`) and remove it in Task 8.

- [ ] **Step 2: Use it in the cohort band**

In `frontend/src/aurora/screens/AdminCohort.tsx`, delete the `dailyCounts` helper entirely:

```ts
/* Bucket activity-feed timestamps into a per-day count over the last `days`. */
function dailyCounts(timestamps: string[], days = 21): number[] { /* ... */ }
```

Add `useActivityTrend` to the imports from `@/hooks/useAdmin`, call it alongside the other hooks:

```ts
  const trendQ = useActivityTrend(21);
```

replace the `trend` derivation:

```ts
  const trend = dailyCounts(feed.map((f) => f.timestamp));
```

with:

```ts
  const trend = (trendQ.data ?? []).map((d) => d.total);
```

and update the caption under the chart so it describes the window rather than the feed:

```tsx
          <p className="aurora-unavail" style={{ marginTop: 8 }}>
            {trend.length
              ? `${trend.reduce((a, b) => a + b, 0)} activity events across the cohort in the last 3 weeks.`
              : "No activity events in the last 3 weeks."}
          </p>
```

- [ ] **Step 3: Verify typecheck and build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useAdmin.ts frontend/src/aurora/screens/AdminCohort.tsx
git commit -m "fix(admin): activity trend reads the windowed endpoint, not the capped feed"
```

---

## Task 8: Failures look like failures

`getJSON` catches everything and returns a fallback, so `isError` is never true and a 500 renders as "Total students: 0 · At risk: 0". For a clinical dashboard, broken currently looks like good news. This is the most dangerous defect in the console.

**Files:**
- Modify: `frontend/src/hooks/useAdmin.ts`
- Create: `frontend/src/aurora/components/admin/PanelState.tsx`
- Modify: `frontend/src/aurora/aurora.css`
- Modify: `frontend/src/aurora/screens/AdminCohort.tsx`

- [ ] **Step 1: Make the fetcher throw**

In `frontend/src/hooks/useAdmin.ts`, replace `getJSON` with:

```ts
async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}
```

Then remove the second (fallback) argument from **every** call site in the file — `useCohort`, `useAtRisk`, `useRoster`, `useStaff`, `useApproved`, `useStudentDetail`, `useBenchmarks`, `useActivity`, `useTokenSummary`, `useAudit`, `useActivityTrend`. Each keeps its own `?? []` / `?? null` shape normalisation. For example:

```ts
export function useCohort() {
  return useQuery<Cohort>({
    queryKey: ["admin", "cohort"],
    queryFn: () => getJSON<Cohort>("/api/supervisor/cohort"),
    ...LIVE,
  });
}
```

Update the file's header comment — it currently claims "every fetch degrades to a safe fallback (never throws)", which becomes false:

```ts
/* React-Query hooks for the dark Admin dashboard. Thin wrappers over the supervisor/
   admin read endpoints. "Real-time" = fresh-on-focus + a ~30s poll. Fetches THROW on a
   non-ok response so React Query surfaces isError and the board can render a real error
   state — returning a zero-valued fallback made a broken backend indistinguishable from
   an empty cohort. Namespaced under ["admin", …] so Refresh invalidates the whole board. */
```

- [ ] **Step 2: Keep the AI insight tolerant**

The cohort narrative is a paid, quota-limited call; a 503 is an expected absence, not a fault. `useCohortInsight` must stay quiet:

```ts
export function useCohortInsight() {
  return useQuery<string>({
    queryKey: ["admin", "insight"],
    // Deliberately tolerant: a quota/AI failure is an absent narrative, not a board
    // error. Every other hook throws; this one resolves to "" and the panel hides.
    queryFn: async () => {
      try {
        const d = await getJSON<{ narrative?: string }>("/api/supervisor/insights");
        return d.narrative ?? "";
      } catch {
        return "";
      }
    },
    // The insight is a paid, rate-limited (10/min) Gemini call — do NOT poll it.
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });
}
```

- [ ] **Step 3: Create the shared panel-state components**

```tsx
// frontend/src/aurora/components/admin/PanelState.tsx
"use client";
/* Shared load/error affordances for the admin board. A failed admin fetch must LOOK
   like a failure: rendering it as 0 made a broken backend indistinguishable from an
   empty cohort, which is the worst possible failure mode for a clinical dashboard. */

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="aurora-skel" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="aurora-skel-bar" />
      ))}
    </div>
  );
}

export function PanelError({ onRetry, label = "Couldn’t load this panel." }: {
  onRetry: () => void; label?: string;
}) {
  return (
    <div className="aurora-panel-error" role="alert">
      <p className="aurora-note is-err" style={{ margin: 0 }}>{label}</p>
      <button type="button" className="aurora-btn-ghost" onClick={onRetry}>Retry</button>
    </div>
  );
}
```

- [ ] **Step 4: Add the styles**

Append to `frontend/src/aurora/aurora.css`, inside the `.aurora-admin` scope:

```css
.aurora-admin .aurora-skel { display: flex; flex-direction: column; gap: 8px; }
.aurora-admin .aurora-skel-bar {
  height: 12px; border-radius: 6px;
  background: linear-gradient(90deg, rgba(255,255,255,.06), rgba(255,255,255,.13), rgba(255,255,255,.06));
  background-size: 200% 100%;
  animation: aurora-skel-shimmer 1.4s ease-in-out infinite;
}
.aurora-admin .aurora-skel-bar:nth-child(2) { width: 82%; }
.aurora-admin .aurora-skel-bar:nth-child(3) { width: 64%; }
@keyframes aurora-skel-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.aurora-admin .aurora-panel-error {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
}
@media (prefers-reduced-motion: reduce) {
  .aurora-admin .aurora-skel-bar { animation: none; }
}
```

- [ ] **Step 5: Render the three states in the cohort band**

In `frontend/src/aurora/screens/AdminCohort.tsx`, import the components:

```ts
import { PanelSkeleton, PanelError } from "@/aurora/components/admin/PanelState";
```

Add this helper above the JSX so KPIs never show a misleading `0`:

```ts
  // A KPI must never render 0 while loading or failed — that reads as a real measurement.
  const kpi = (q: { isLoading: boolean; isError: boolean }, v: string | number) =>
    q.isLoading ? "…" : q.isError ? "—" : v;
```

and use it on each tile, e.g.:

```tsx
        <StatCard tone="blue" label="Total students" value={kpi(cohort, total)} />
        <StatCard tone="green" label="Active this week" value={kpi(cohort, active)} />
        <StatCard tone="rose" label="At risk" value={kpi(cohort, atRiskCount)} />
        <StatCard tone="purple" label="Avg mastery" value={kpi(benchmarks, avgMastery === null ? "—" : `${avgMastery}%`)} />
        <StatCard tone="blue" label="Avg OSCE" value={kpi(activity, avgOsce === null ? "—" : `${avgOsce}%`)} />
        <StatCard tone="purple" label="AI tokens" value={kpi(tokens, fmtTokens(tokens.data?.total_tokens ?? 0))} />
```

Then wrap the trend panel body as the pattern for every panel:

```tsx
        <section className="aurora-panel">
          <p className="aurora-panel-head">Activity · last 3 weeks</p>
          {trendQ.isLoading ? (
            <PanelSkeleton />
          ) : trendQ.isError ? (
            <PanelError onRetry={() => trendQ.refetch()} />
          ) : (
            <>
              <TrendChart values={trend} tone="blue" />
              <p className="aurora-unavail" style={{ marginTop: 8 }}>
                {trend.length
                  ? `${trend.reduce((a, b) => a + b, 0)} activity events across the cohort in the last 3 weeks.`
                  : "No activity events in the last 3 weeks."}
              </p>
            </>
          )}
        </section>
```

Apply the same `isLoading → PanelSkeleton` / `isError → PanelError` wrapping to the remaining panels, using the query each one reads: mastery heatmap and topic benchmarks use `benchmarks`; weakest topics uses `cohort`; both OSCE panels use `activity`.

- [ ] **Step 6: Verify typecheck and build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 7: Verify behaviorally — this is the regression guard**

Start the app, then in the browser devtools block `/api/supervisor/cohort` (or stop the backend) and reload `/admin`.
Expected: the cohort tiles show `—` and the affected panels show "Couldn't load this panel." with a working Retry. **They must not show `0`.**

- [ ] **Step 8: Commit**

```bash
git add frontend/src/hooks/useAdmin.ts frontend/src/aurora/components/admin/PanelState.tsx frontend/src/aurora/aurora.css frontend/src/aurora/screens/AdminCohort.tsx
git commit -m "fix(admin): backend failures render as errors, never as zeros"
```

---

## Task 9: Confirm before revoking an account

A single click on the bare `×` permanently unapproves an account — no dialog, no undo.

**Files:**
- Modify: `frontend/src/aurora/screens/AdminProvisioning.tsx`

- [ ] **Step 1: Add pending-confirmation state**

In `AdminProvisioning`, alongside the other `useState` calls:

```ts
  const [confirmRemove, setConfirmRemove] = useState<ApprovedStudent | null>(null);
```

- [ ] **Step 2: Route the remove button through the confirm**

Change the row's remove button from calling `handleRemove` directly:

```tsx
              <button type="button" className="aurora-acct-remove" onClick={() => handleRemove(s.email)} disabled={removing === s.email} aria-label={`Remove ${s.full_name}`}>
```

to opening the confirm:

```tsx
              <button type="button" className="aurora-acct-remove" onClick={() => setConfirmRemove(s)} disabled={removing === s.email} aria-label={`Remove ${s.full_name}`}>
```

- [ ] **Step 3: Render the confirm dialog**

Add just before the closing `</div>` of the component's root, after the `<details>` block:

```tsx
      {confirmRemove && (
        <div className="aurora-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmRemove(null); }}>
          <div className="aurora-modal" role="alertdialog" aria-modal="true" aria-label="Confirm account removal" style={{ maxWidth: 460 }}>
            <div className="aurora-modal-head">
              <div>
                <p className="aurora-modal-eyebrow">Remove access</p>
                <p className="aurora-modal-title">{confirmRemove.full_name}</p>
              </div>
            </div>
            <div className="aurora-modal-body">
              <p className="aurora-note">
                This revokes access for <strong>{confirmRemove.email}</strong>. They will no longer be
                able to sign in, and they disappear from the roster and all cohort figures.
                This cannot be undone.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                <button
                  type="button"
                  className="aurora-btn"
                  disabled={removing === confirmRemove.email}
                  onClick={() => { const email = confirmRemove.email; setConfirmRemove(null); handleRemove(email); }}
                >
                  {removing === confirmRemove.email ? "Removing…" : "Remove access"}
                </button>
                <button type="button" className="aurora-btn-ghost" onClick={() => setConfirmRemove(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Verify typecheck and build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Verify behaviorally**

Load `/admin` → Accounts as an admin, click a row's `×`.
Expected: the dialog names the person and their email; Cancel dismisses with no request fired; "Remove access" removes exactly one account.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/aurora/screens/AdminProvisioning.tsx
git commit -m "fix(admin): confirm before revoking an approved account"
```

---

## Task 10: Rate-limit the admin write endpoints

Reads were hardened upstream (`/audit` 30/min, `/insights` 20/min); the writes were not. `upload_csv` also lacks a `request: Request` parameter, which the shared limiter needs to key on the real caller.

**Files:**
- Modify: `tools/api/routers/admin.py`
- Test: `tests/api/test_admin_write_ratelimit.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_admin_write_ratelimit.py
"""Regression: admin WRITE endpoints must be rate-limited.

The read endpoints were capped (/audit 30/min, /insights 20/min) but the mutating ones
— approve, unapprove, promote, demote, CSV import — carried no @limiter.limit. Each
one writes to the DB, and approve/CSV additionally hash a bcrypt password and send mail,
so an unbounded loop is both a data-integrity and a cost/quota problem.

conftest resets limiter._storage between tests; each test uses a unique JWT sub so the
per-caller counter can't collide.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _admin_cookie(sub: str):
    return {"eyebot_token": create_access_token(sub, "admin", "OA")}


def test_promote_is_rate_limited_per_user():
    with patch("tools.shared.db.upsert_supervisor", new=AsyncMock()), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()):
        statuses = [
            client.post(
                "/api/admin/promote",
                json={"email": "staff@test.com", "new_role": "trainer"},
                cookies=_admin_cookie("stu_promote_rl"),
            ).status_code
            for _ in range(22)
        ]
    assert statuses[0] == 200, statuses
    assert 429 in statuses, f"expected a 429 once the per-minute cap is exceeded, got {statuses}"


def test_unapprove_is_rate_limited_per_user():
    with patch("tools.shared.db.delete_approved", new=AsyncMock(return_value=True)), \
         patch("tools.shared.db.insert_audit_event", new=AsyncMock()):
        statuses = [
            client.delete(f"/api/admin/approved/gone{i}@test.com", cookies=_admin_cookie("stu_unappr_rl"))
            .status_code
            for i in range(22)
        ]
    assert statuses[0] == 200, statuses
    assert 429 in statuses, f"expected a 429 once the per-minute cap is exceeded, got {statuses}"


def test_upload_csv_is_rate_limited_per_user():
    """Tightest cap (5/min): each row bcrypt-hashes and sends an email."""
    csv_bytes = b"full_name,email,role\n"
    with patch("tools.shared.db.get_all_approved", new=AsyncMock(return_value=[])), \
         patch("tools.shared.db.get_consent_by_student_id", new=AsyncMock(return_value=None)):
        statuses = [
            client.post(
                "/api/admin/upload-csv",
                files={"file": ("roster.csv", csv_bytes, "text/csv")},
                cookies=_admin_cookie("stu_csv_rl"),
            ).status_code
            for _ in range(7)
        ]
    assert statuses[0] == 200, statuses
    assert 429 in statuses, f"expected a 429 once the per-minute cap is exceeded, got {statuses}"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/api/test_admin_write_ratelimit.py -v`
Expected: FAIL — no 429 in any of the three status lists.

- [ ] **Step 3: Apply the limits**

In `tools/api/routers/admin.py`, add a `@limiter.limit(...)` line directly under each route decorator. `admin_approve_student`, `admin_unapprove_student`, `admin_promote` and `admin_demote` already take `request: Request`; leave their signatures alone.

```python
@router.post("/api/admin/approved")
@limiter.limit("20/minute")
async def admin_approve_student(body: ApproveStudentRequest, request: Request, current_user: CurrentUser = Depends(require_admin)):
```

```python
@router.delete("/api/admin/approved/{email}")
@limiter.limit("20/minute")
async def admin_unapprove_student(email: str, request: Request, current_user: CurrentUser = Depends(require_admin)):
```

```python
@router.post("/api/admin/promote")
@limiter.limit("20/minute")
async def admin_promote(body: PromoteRequest, request: Request, current_user: CurrentUser = Depends(require_admin)):
```

```python
@router.delete("/api/admin/promote/{email}")
@limiter.limit("20/minute")
async def admin_demote(email: str, request: Request, current_user: CurrentUser = Depends(require_admin)):
```

`upload_csv` needs the `request` parameter added — the limiter keys off it:

```python
@router.post("/api/admin/upload-csv")
@limiter.limit("5/minute")
async def admin_upload_csv(request: Request, file: UploadFile = File(...), current_user: CurrentUser = Depends(require_admin)):
```

- [ ] **Step 4: Run the full backend suite**

Run: `python -m pytest -q`
Expected: PASS. Watch `tests/api/test_admin_endpoints.py` in particular — it exercises all five of these endpoints and would catch a broken signature.

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/admin.py tests/api/test_admin_write_ratelimit.py
git commit -m "harden(admin): rate-limit the admin write endpoints"
```

---

## Task 11: Allow-list the digest recipient

`POST /api/supervisor/send-digest` mails cohort data to an arbitrary `body.recipient`, so any staff account can send it to any external address.

**Files:**
- Modify: `tools/api/routers/supervisor.py`
- Test: `tests/api/test_supervisor_digest_allowlist.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/api/test_supervisor_digest_allowlist.py
"""Regression: the weekly digest may only be sent to a known staff address.

`recipient` came straight off the request body with no validation, so any staff token
could mail the cohort digest — student names, activity, weak topics — to an arbitrary
external address. The allow-list is the staff roster, and it fails closed.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)

STAFF = [
    {"email": "coach@snec.com.sg", "role": "trainer", "status": "active"},
    {"email": "boss@snec.com.sg", "role": "admin", "status": "active"},
]


def _staff_cookie(sub: str = "stu_digest"):
    return {"eyebot_token": create_access_token(sub, "trainer", "OA")}


def test_digest_rejects_recipient_outside_staff_roster():
    with patch("tools.shared.db.get_staff_roster", new=AsyncMock(return_value=STAFF)), \
         patch("tools.api.routers.supervisor._send_digest", new=AsyncMock()) as mock_send:
        r = client.post("/api/supervisor/send-digest",
                        json={"recipient": "attacker@evil.com"},
                        cookies=_staff_cookie())
    assert r.status_code == 400
    mock_send.assert_not_called()


def test_digest_allows_a_staff_recipient():
    with patch("tools.shared.db.get_staff_roster", new=AsyncMock(return_value=STAFF)), \
         patch("tools.api.routers.supervisor._send_digest", new=AsyncMock()) as mock_send:
        r = client.post("/api/supervisor/send-digest",
                        json={"recipient": "Coach@SNEC.com.sg"},  # case-insensitive
                        cookies=_staff_cookie("stu_digest2"))
    assert r.status_code == 200
    mock_send.assert_awaited_once()


def test_digest_fails_closed_when_roster_unavailable():
    """If the allow-list can't be read, refuse — never fall through to sending."""
    with patch("tools.shared.db.get_staff_roster", new=AsyncMock(side_effect=Exception("db down"))), \
         patch("tools.api.routers.supervisor._send_digest", new=AsyncMock()) as mock_send:
        r = client.post("/api/supervisor/send-digest",
                        json={"recipient": "coach@snec.com.sg"},
                        cookies=_staff_cookie("stu_digest3"))
    assert r.status_code == 503
    mock_send.assert_not_called()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/api/test_supervisor_digest_allowlist.py -v`
Expected: FAIL — the first test gets 200 and `_send_digest` was called.

- [ ] **Step 3: Add the allow-list**

In `tools/api/routers/supervisor.py`, replace `supervisor_send_digest` with:

```python
@router.post("/api/supervisor/send-digest")
async def supervisor_send_digest(body: DigestRequest, current_user: CurrentUser = Depends(require_staff)):
    """Send the weekly cohort digest.

    The recipient MUST be a known staff address. It previously came straight off the
    request body, so any staff token could mail cohort data (names, activity, weak
    topics) to an arbitrary external address. Fails closed: if the roster can't be
    read, refuse rather than send."""
    recipient = body.recipient.strip().lower()
    try:
        staff = await db.get_staff_roster()
    except Exception:
        raise HTTPException(status_code=503, detail="Recipient allow-list unavailable. Please try again.")
    allowed = {(s.get("email") or "").strip().lower() for s in staff}
    if recipient not in allowed:
        # Non-enumerating: same message whether the address exists elsewhere or not.
        raise HTTPException(status_code=400, detail="Recipient must be a registered staff address.")

    try:
        await _send_digest(recipient)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Operation failed. Please try again.")
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
    return {"ok": True, "sent_to": recipient}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/api/test_supervisor_digest_allowlist.py -v`
Expected: PASS, all three.

- [ ] **Step 5: Commit**

```bash
git add tools/api/routers/supervisor.py tests/api/test_supervisor_digest_allowlist.py
git commit -m "harden(admin): weekly digest only sends to a registered staff address"
```

---

## Task 12: Delete the dead surface

**Files:**
- Delete: `frontend/src/aurora/screens/AdminAccounts.tsx`
- Modify: `frontend/src/aurora/screens/AdminStudentDetail.tsx`
- Modify: `frontend/src/aurora/screens/Admin.tsx`
- Modify: `frontend/src/screens/adminShared.tsx`

- [ ] **Step 1: Confirm `AdminAccounts` is unreferenced, then delete it**

Run: `grep -rn "AdminAccounts" frontend/src/`
Expected: only its own definition and the comment in `AdminProvisioning.tsx` calling it "the retired AdminAccounts".

```bash
git rm frontend/src/aurora/screens/AdminAccounts.tsx
```

- [ ] **Step 2: Adopt `useStudentDetail` in the drill-down modal**

`useStudentDetail` is defined but never imported, while the modal hand-rolls its own fetch — so the drill-down gets no caching, no polling and no `["admin"]` invalidation. In `frontend/src/aurora/screens/AdminStudentDetail.tsx`, add the import:

```ts
import { useStudentDetail, type StudentDetail } from "@/hooks/useAdmin";
```

Delete the local `data` / `loading` / `error` state and the fetching `useEffect`:

```ts
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
```

```ts
  useEffect(() => {
    fetch(`/api/admin/student/${studentId}/detail`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { setData(d); setNote(d.supervisor_note ?? ""); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [studentId]);
```

Replace them with the hook plus a note-seeding effect:

```ts
  const detailQ = useStudentDetail(studentId);
  const data = detailQ.data ?? null;
  const loading = detailQ.isLoading;
  const error = detailQ.isError;

  // Seed the editable note ONCE per opened student — keyed on identity, NOT on `data`.
  // useStudentDetail polls every 30s; keying the seed on `[data]` re-fires on every
  // refetch and clobbers a supervisor's in-progress edit (reproduced regression). The
  // ref guard reseeds only when the studentId changes.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (data && seededFor.current !== studentId) {
      setNote(data.supervisor_note ?? "");
      seededFor.current = studentId;
    }
  }, [data, studentId]);
```

(Add `useRef` to the React import.) A committed regression test lives in
`frontend/tests/aurora_assert.mjs` ("student-note draft survives a background poll
refetch"): it types a draft, fast-forwards Playwright's clock past the poll interval,
and asserts the draft is intact — install the fake clock BEFORE the modal mounts or the
pre-scheduled timer never advances.

Delete the now-duplicated local `DetailData`, `Session` and `CaseRow` interfaces and use the `StudentDetail` type exported by the hook. If any field the modal reads is missing from `StudentDetail` in `useAdmin.ts` (for example `cohort_retention`), add it there as an optional property rather than reintroducing a local type.

- [ ] **Step 3: Remove the false pool-filter claim**

The console tells staff to switch the content pool "to view a discipline's cohort", but no pool filtering exists in `admin.py` or `tools/supervisor/` — the numbers never change. In `frontend/src/aurora/screens/Admin.tsx`:

```tsx
      <p className="aurora-unavail" style={{ marginBottom: 18 }}>
        Live cohort and per-student insights. Data refreshes automatically on focus and every 30 seconds.
      </p>
```

- [ ] **Step 4: Remove the dead router shim and duplicate types**

In `frontend/src/screens/adminShared.tsx`, the outlet-context shim exists for react-router, which this App Router app does not use. Confirm first:

Run: `grep -rn "useAdminOutlet\|AdminCtxProvider\|AdminOutletContext" frontend/src/`
Expected: only `adminShared.tsx` itself. If so, delete `AdminCtx`, `AdminCtxProvider`, `useAdminOutlet` and the `AdminOutletContext` type, plus the now-unused `createContext`/`useContext`/`ReactNode` imports.

Then check each remaining export for use before removing it:

Run: `for s in StudentProfile CohortData AtRiskItem FeedItem RoleBadge roleBadgeClass KpiCard roleAvatarColors formatFeedTime formatDayLabel groupFeedByDate IconUsers IconActive IconRisk IconTokens IconTrend IconLogout; do echo -n "$s: "; grep -rl "$s" frontend/src/ --include=*.tsx --include=*.ts | grep -v adminShared | wc -l; done`

Delete only the exports whose count is `0`. Leave anything still referenced.

- [ ] **Step 5: Verify typecheck and build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS. A missed reference surfaces here as a module-not-found or unused-symbol error.

- [ ] **Step 6: Verify behaviorally**

Load `/admin` → Students, open a student row.
Expected: the drill-down still loads name, sessions, cases and topics; the note saves; the report still downloads. The header paragraph no longer mentions the content pool.

- [ ] **Step 7: Commit**

```bash
git add -A frontend/src/
git commit -m "refactor(admin): delete dead admin surface and adopt the shared detail hook"
```

---

## Final verification

- [ ] **Full backend suite**

Run: `python -m pytest -q`
Expected: all pass.

- [ ] **Frontend gates**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Visual harness**

Run: `bash scripts/start-harness.sh aurora`
Expected: aurora assertions pass — this guards the `.aurora-admin` styling the new panel-state classes extend.

- [ ] **Behavioral pass on the running app**

With the app running, confirm on `/admin`:
1. Cohort tiles show real numbers; forcing a backend failure shows `—` and an error panel, never `0`
2. Weakest-topic bar lengths match their printed counts
3. The OSCE panels show real data (or an honest empty state) — never the migration message
4. The activity trend covers 21 contiguous days
5. Removing an account prompts first
6. A student drill-down opens, saves a note, and downloads a report

- [ ] **Push**

```bash
git fetch origin && git merge-base --is-ancestor origin/main HEAD && git push origin HEAD:main
```

If the ancestor check fails, `origin/main` moved — rebase onto it and re-run the gates before pushing.
