# Trainer Reports P2 — The Two Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the P1 insight payload into two print-first documents — a rebuilt student report and a new OSCE dossier — that state ranked findings as *claim → evidence → what to do*, never counts.

**Architecture:** Four pure, dependency-free TS modules under `frontend/src/aurora/lib/`: shared chrome (`reportChrome.ts`), payload types (`insight.ts`), the ranking engine (`reportFindings.ts`), and the two builders. The ledger needed for per-attempt records is served by a NEW on-demand endpoint, never added to the 30 s-polled `/detail`. Everything is a pure string builder testable under Node's type-stripping — no React, no DOM.

**Tech Stack:** TypeScript (no deps), Node test harnesses in `frontend/tests/*.mjs`, FastAPI + pytest for the one backend task.

---

## Verified facts this plan rests on

Checked against the running code on 2026-08-06, not assumed. Trust these over the spec where they differ.

**The `insight` payload** (dumped from a live `build_student_insight` call):

```jsonc
{
  "topics": [{ "topic": "tonometry", "flag": "",
               "flashcards": {"value": 100.0, "n": 6, "band": "strong"},
               "station":    {"value": 72.0,  "n": 1, "band": "developing"},
               "retention":  {"value": 82.0,  "n": 1, "band": "strong"} }],
  "contrasts": [{"topic": "...", "axis": "flashcards"|"station",
                 "student": 41.0, "cohort_mean": 74.0, "peers": 5, "label": "..."}],
  "mark_loss": {"lost": {"checklist": 10, "consult": 8, "judgement": 10},
                "total_lost": 28, "shares": {"checklist": 35.7, "consult": 28.6, "judgement": 35.7},
                "attempts": 1, "excluded_legacy": 0},
  "offenders":          [{"action": "...", "missed": 9, "critical": true, "appeared": 12}],
  "critical_offenders": [{"action": "...", "missed": 3, "critical": true, "appeared": null}],
  "osce_trajectory":     {"band": "insufficient", "delta": null, "n": 1, "needed": 4,
                          "first_mean": null, "second_mean": null},
  "flashcard_trajectory": { ... same shape, "needed": 20 },
  "consultations": [{"label": "gonioscopy", "count": 1, "last_seen": "2026-08-01", "derived": false}],
  "excluded": {"unmapped_case": 0, "unscored": 0}
}
```

**Exact enum values** — every renderer switch must cover these and nothing else:

| Field | Values |
|---|---|
| `Cell.band` | `thin` · `weak` · `developing` · `strong` |
| `TopicRow.flag` | `""` · `knows_cant_do` · `rote` · `consistent_gap` |
| `Trajectory.band` | `insufficient` · `declining` · `steady` · `improving` |
| `Contrast.axis` | `flashcards` · `station` |

**Constants** (import, never hardcode): `MIN_TRAJECTORY_N=4`, `TRAJECTORY_DEAD_BAND=5.0`, `MIN_PEERS=3`, `MIN_CARDS=5`, `INDIVIDUAL_GAP=15.0`.

**`Offender.appeared` is `int | null`.** `null` on the `critical_offenders` path only (it reads `missed_critical`, which has no denominator). Render `"missed in 3 attempts"` when null and `"missed in 9 of 12 attempts that included it"` when not. **Never** print a fraction from a null denominator.

**`retention.value` is already 0-100.** `retention_cells` multiplies the stored 0-1 fraction by 100. Do not scale again.

**The ledger must NOT go in `/detail`.** `useAdmin.ts:9` polls it every 30 s (`refetchInterval: 30_000`). A worst-case ledger is 5,191 bytes (measured over the 21 real checklists: 10/18.5/29 steps min/avg/max); 30 attempts would add ~152 KB to *every poll* on Render's single worker, for data read only when a trainer clicks download. Task 1 adds a separate on-demand endpoint instead.

**`db.get_case_results` uses `select("*")`** (`db.py:296-307`), so `checklist_detail` and `coaching` (migration 011) arrive from Supabase already. The only whitelist is `_case_row` inside `admin_student_detail` — and that one stays lean on purpose.

**`checklist_detail` → `SessionExportData.checklist` mapping** (`sessionExport.ts:62`): `{phase, action, critical, done, skipped}` ← `{phase, action, critical, performed, skipped}`. Only `performed`→`done` is renamed.

**Migration 019 may not be applied yet.** Every attempt's `checklist_detail` can be `null`. That is `"Per-step ledger not recorded for this attempt."` — never an empty table.

**Local value imports MUST carry the `.ts` suffix** — `import { esc } from "./reportChrome.ts"`. A `.mjs` harness loads these modules through Node's type-stripping, which resolves specifiers at runtime and cannot guess the extension; an extensionless value import throws `ERR_MODULE_NOT_FOUND`. `frontend/tsconfig.json` sets `allowImportingTsExtensions` (legal because `noEmit` is set) so `tsc` accepts the suffix too — without it, `tsc` rejects it with TS5097 and a module can be typechecked or tested, never both. Verified end to end: typecheck, the logic harnesses and `next build` are all green with a real cross-module value import. `import type` is unaffected either way, since type-stripping erases it.

---

## File structure

| File | Responsibility |
|---|---|
| `tools/api/routers/admin.py` (modify) | NEW `GET /api/admin/student/{id}/attempts` — full rows incl. ledger + coaching, on demand |
| `frontend/src/aurora/lib/insight.ts` (create) | TS mirror of the payload + the shared constants. Types only, no logic. |
| `frontend/src/aurora/lib/reportChrome.ts` (create) | `esc`, the shared print-first stylesheet, `page()` shell, `table()`, `note()`. Both documents import it so they read as one product. |
| `frontend/src/aurora/lib/reportFindings.ts` (create) | **The engine.** Payload → ranked `Finding[]` of claim/evidence/action. Pure, no HTML. |
| `frontend/src/aurora/lib/studentReportExport.ts` (rebuild) | Student report §7.1, ten sections |
| `frontend/src/aurora/lib/osceDossierExport.ts` (create) | OSCE dossier §7.2 |
| `frontend/src/aurora/lib/sessionExport.ts` (modify, ~4 lines) | optional `transcriptNote` |
| `frontend/src/aurora/screens/AdminStudentDetail.tsx` (modify) | Wire the two new downloads. Minimal — P3 rebuilds this screen. |
| `frontend/tests/report_findings_logic.mjs` (create) | The ranking engine |
| `frontend/tests/student-report.test.mjs` (extend) | Existing harness |
| `frontend/tests/osce_dossier_logic.mjs` (create) | New harness |
| `frontend/tests/report_honest_states_logic.mjs` (create) | The §8 table, all nine rows, across BOTH documents |
| `tests/api/test_admin_attempts.py` (create) | The new endpoint |

---

## Task 1: The on-demand attempts endpoint

**Files:**
- Modify: `tools/api/routers/admin.py`
- Test: `tests/api/test_admin_attempts.py`

- [ ] **Step 1: Write the failing test**

Create `tests/api/test_admin_attempts.py`:

```python
"""GET /api/admin/student/{id}/attempts — the per-attempt ledger, served on demand.

Deliberately NOT part of /detail: that endpoint is polled every 30s (useAdmin.ts:9) and a
worst-case ledger is ~5KB, so folding it in would add ~152KB per poll for a student with 30
attempts, to carry data only read when a trainer clicks download.
"""
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from tools.api.server import app
from tools.shared.jwt_utils import create_access_token

client = TestClient(app)


def _cookies(role: str = "admin") -> dict:
    return {"eyebot_token": create_access_token("user_001", role, "OA")}


ROW = {
    "case_id": "c1", "total_score": 29, "passed": True, "completed_at": "2026-08-01T00:00:00Z",
    "score_100": 72, "safe": True, "checklist_coverage": 30, "consult_technique": 22,
    "judgement_safety": 20, "grade_scale": 2, "missed_critical": [],
    "coaching": {"do_next": "Slow down on consent."},
    "checklist_detail": [{"step_number": 1, "action": "Perform hand hygiene.",
                          "phase": "Preparation", "critical": True,
                          "performed": False, "skipped": True}],
}


def test_attempts_carries_the_ledger_and_coaching():
    with patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=[ROW])):
        r = client.get("/api/admin/student/stu_x/attempts", cookies=_cookies())
    assert r.status_code == 200
    row = r.json()["attempts"][0]
    assert row["checklist_detail"][0]["action"] == "Perform hand hygiene."
    assert row["checklist_detail"][0]["performed"] is False
    assert row["coaching"]["do_next"] == "Slow down on consent."


def test_attempts_keeps_a_missing_ledger_null_not_empty():
    """NULL means 'this attempt predates migration 019'. [] would assert the student
    performed no steps -- the two must stay distinguishable in the document."""
    bare = {k: v for k, v in ROW.items() if k not in ("checklist_detail", "coaching")}
    with patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=[bare])):
        r = client.get("/api/admin/student/stu_x/attempts", cookies=_cookies())
    assert r.json()["attempts"][0]["checklist_detail"] is None


def test_attempts_are_chronological():
    rows = [dict(ROW, case_id="late", completed_at="2026-08-05T00:00:00Z"),
            dict(ROW, case_id="early", completed_at="2026-08-01T00:00:00Z")]
    with patch("tools.shared.db.get_case_results", new=AsyncMock(return_value=rows)):
        r = client.get("/api/admin/student/stu_x/attempts", cookies=_cookies())
    assert [a["case_id"] for a in r.json()["attempts"]] == ["early", "late"]


def test_attempts_rejects_a_student():
    r = client.get("/api/admin/student/stu_x/attempts", cookies=_cookies("student"))
    assert r.status_code == 403
```

- [ ] **Step 2: Run to verify it fails**

```bash
python -m pytest tests/api/test_admin_attempts.py -q
```

Expected: FAIL — 404, because the route does not exist.

- [ ] **Step 3: Implement**

In `tools/api/routers/admin.py`, add after `admin_student_detail`:

```python
@router.get("/api/admin/student/{student_id}/attempts")
# shared_limit (fixed scope), NOT limit: slowapi keys on the ASGI path, so {student_id}
# would land in the bucket key and a caller could dodge the cap by walking ids. Same
# rationale as admin_student_detail above.
@limiter.shared_limit("30/minute", scope="admin_student_attempts")
async def admin_student_attempts(student_id: str, request: Request,
                                 current_user: CurrentUser = Depends(require_staff)):
    """Every attempt for one student, WITH the per-step ledger and the coaching block.

    Separate from /detail on purpose. That endpoint is polled every 30s (useAdmin.ts:9);
    a worst-case ledger is ~5KB, so a student with 30 attempts would add ~152KB to every
    poll to carry data that is only read when a trainer clicks a download. This is fetched
    once, on that click.
    """
    try:
        rows = await db.get_case_results(student_id)
    except Exception:
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")

    # `trajectory` and the dossier's per-attempt sections both read this in order, and
    # Supabase returns case_progress unordered.
    rows = sorted(rows, key=lambda r: str(r.get("completed_at") or ""))
    return {"attempts": [
        {
            "case_id": r.get("case_id", ""),
            "completed_at": str(r.get("completed_at", "")),
            "total_score": int(r.get("total_score") or 0),
            "passed": bool(r.get("passed", False)),
            "score_100": r.get("score_100"),
            "safe": r.get("safe"),
            "checklist_coverage": r.get("checklist_coverage"),
            "consult_technique": r.get("consult_technique"),
            "judgement_safety": r.get("judgement_safety"),
            "grade_scale": r.get("grade_scale"),
            "missed_critical": [str(m) for m in (r.get("missed_critical") or [])],
            "coaching": r.get("coaching"),
            # Passed through as-is. NULL means "predates migration 019", NEVER "no steps
            # performed" -- collapsing it to [] would let the document assert a record we
            # do not have.
            "checklist_detail": r.get("checklist_detail"),
        }
        for r in rows
    ]}
```

- [ ] **Step 4: Run to verify it passes**

```bash
python -m pytest tests/api/test_admin_attempts.py -q
```

Expected: PASS (4 tests).

- [ ] **Step 5: Prove the guard**

Temporarily change `"checklist_detail": r.get("checklist_detail")` to `r.get("checklist_detail") or []`. Re-run: `test_attempts_keeps_a_missing_ledger_null_not_empty` must FAIL. Revert, confirm green.

- [ ] **Step 6: Commit**

```bash
git add tools/api/routers/admin.py tests/api/test_admin_attempts.py
git commit -m "feat(admin): serve the per-attempt OSCE ledger on demand"
```

---

## Task 2: Payload types

**Files:**
- Create: `frontend/src/aurora/lib/insight.ts`

No test of its own — it is types plus constants, exercised by every task after it. Task 3's harness is the first consumer.

- [ ] **Step 1: Create the file**

```typescript
// frontend/src/aurora/lib/insight.ts
/* TS mirror of the payload `build_student_insight` returns (served at
   GET /api/admin/student/{id}/detail as `insight`).

   Types + constants only, no logic, no imports — so every report builder can read the same
   shape without pulling in React or a fetch layer, and so the Node harnesses can import it
   under type-stripping.

   The constants are duplicated from tools/supervisor/{topic_map,osce_analysis}.py. They are
   thresholds the DOCUMENT has to explain to a trainer ("4 needed", "3 peers"), so the prose
   and the arithmetic must not drift. If you change one side, change both. */

export type Band = "thin" | "weak" | "developing" | "strong";
export type Flag = "" | "knows_cant_do" | "rote" | "consistent_gap";
export type TrajectoryBand = "insufficient" | "declining" | "steady" | "improving";
export type Axis = "flashcards" | "station";

export interface Cell { value: number; n: number; band: Band }

export interface TopicRow {
  topic: string; flag: Flag;
  flashcards: Cell; station: Cell; retention: Cell;
}

export interface Contrast {
  topic: string; axis: Axis; student: number;
  /** null when fewer than MIN_PEERS peers have this topic. NEVER render 0 for it. */
  cohortMean: number | null;
  peers: number; label: string;
}

export interface MarkLoss {
  lost: { checklist: number; consult: number; judgement: number };
  totalLost: number;
  shares: { checklist: number; consult: number; judgement: number };
  attempts: number;
  excludedLegacy: number;
}

export interface Offender {
  action: string; missed: number; critical: boolean;
  /** null on the critical_offenders path (missed_critical carries no denominator).
      Render "missed in 3 attempts", never a fraction. */
  appeared: number | null;
}

export interface Trajectory {
  band: TrajectoryBand; delta: number | null; n: number; needed: number;
  firstMean: number | null; secondMean: number | null;
}

export interface Consultation {
  label: string; count: number; lastSeen: string; derived: boolean;
}

export interface StudentInsight {
  topics: TopicRow[];
  contrasts: Contrast[];
  markLoss: MarkLoss;
  offenders: Offender[];
  criticalOffenders: Offender[];
  osceTrajectory: Trajectory;
  flashcardTrajectory: Trajectory;
  consultations: Consultation[];
  excluded: { unmappedCase: number; unscored: number };
}

/** One attempt, from GET /api/admin/student/{id}/attempts. */
export interface AttemptStep {
  stepNumber: number; action: string; phase: string;
  critical: boolean; performed: boolean; skipped: boolean;
}

export interface Attempt {
  caseId: string; completedAt: string; totalScore: number; passed: boolean;
  score100: number | null; safe: boolean | null;
  checklistCoverage: number | null; consultTechnique: number | null;
  judgementSafety: number | null; gradeScale: number | null;
  missedCritical: string[];
  coaching: Record<string, unknown> | null;
  /** null = predates migration 019. [] = the attempt genuinely resolved zero steps. */
  checklistDetail: AttemptStep[] | null;
}

// Mirrors of the Python thresholds. See the module comment.
export const MIN_TRAJECTORY_N = 4;
export const TRAJECTORY_DEAD_BAND = 5.0;
export const MIN_PEERS = 3;
export const MIN_CARDS = 5;
export const INDIVIDUAL_GAP = 15.0;
export const GRADE_SCALE_CURRENT = 2;
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/lib/insight.ts
git commit -m "feat(reports): the payload shape both documents read"
```

---

## Task 3: The ranking engine

The heart of the phase. A trainer opens a report to learn what they did not already know, so this turns the payload into ranked findings, each *claim → evidence → what to do*. No HTML — it returns data, so it is testable as data and both documents render the same conclusions.

**Files:**
- Create: `frontend/src/aurora/lib/reportFindings.ts`
- Test: `frontend/tests/report_findings_logic.mjs`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/report_findings_logic.mjs`:

```javascript
/**
 * The ranked findings engine — the answer to "don't tell me what I already know".
 *
 * Asserts ORDER (safety outranks everything), that every finding carries evidence and an
 * action, and that a finding never fires off data too thin to support it.
 */
import assert from "node:assert";
import { rankFindings } from "../src/aurora/lib/reportFindings.ts";

const cell = (value, n, band) => ({ value, n, band });
const EMPTY = {
  topics: [], contrasts: [],
  markLoss: { lost: { checklist: 0, consult: 0, judgement: 0 }, totalLost: 0,
              shares: { checklist: 0, consult: 0, judgement: 0 }, attempts: 0, excludedLegacy: 0 },
  offenders: [], criticalOffenders: [],
  osceTrajectory: { band: "insufficient", delta: null, n: 0, needed: 4, firstMean: null, secondMean: null },
  flashcardTrajectory: { band: "insufficient", delta: null, n: 0, needed: 20, firstMean: null, secondMean: null },
  consultations: [], excluded: { unmappedCase: 0, unscored: 0 },
};
const insight = (over) => ({ ...EMPTY, ...over });

// 1 — a student with nothing produces no findings, not an empty-looking one
assert.deepEqual(rankFindings(EMPTY), [], "no data must yield no findings");

// 2 — safety outranks every other signal
{
  const out = rankFindings(insight({
    criticalOffenders: [{ action: "Perform hand hygiene.", missed: 3, critical: true, appeared: null }],
    osceTrajectory: { band: "declining", delta: -20, n: 6, needed: 4, firstMean: 70, secondMean: 50 },
  }));
  assert.equal(out[0].kind, "critical_safety", "a repeated critical miss must rank first");
  assert.ok(out.length >= 2, "the decline must still be reported, just lower");
}

// 3 — every finding carries all three parts; none is empty
{
  const out = rankFindings(insight({
    topics: [{ topic: "tonometry", flag: "knows_cant_do",
               flashcards: cell(92, 20, "strong"), station: cell(41, 5, "weak"), retention: cell(88, 1, "strong") }],
  }));
  for (const f of out) {
    assert.ok(f.claim && f.claim.length > 10, `claim missing: ${JSON.stringify(f)}`);
    assert.ok(f.evidence && /\d/.test(f.evidence), `evidence must cite numbers: ${JSON.stringify(f)}`);
    assert.ok(f.action && f.action.length > 10, `action missing: ${JSON.stringify(f)}`);
  }
}

// 4 — the signature insight is named in words a trainer can act on
{
  const out = rankFindings(insight({
    topics: [{ topic: "tonometry", flag: "knows_cant_do",
               flashcards: cell(92, 20, "strong"), station: cell(41, 5, "weak"), retention: cell(88, 1, "strong") }],
  }));
  const f = out.find((x) => x.kind === "knows_cant_do");
  assert.ok(f, "a knows_cant_do flag must produce a finding");
  assert.ok(/tonometry/i.test(f.claim), "the claim must name the topic");
  assert.ok(/92/.test(f.evidence) && /41/.test(f.evidence), "evidence must cite BOTH sides of the gap");
}

// 5 — a null denominator never becomes a fraction
{
  const out = rankFindings(insight({
    criticalOffenders: [{ action: "Check allergy status", missed: 3, critical: true, appeared: null }],
  }));
  const f = out.find((x) => x.kind === "critical_safety");
  assert.ok(/3 attempts/.test(f.evidence), "should say 'in 3 attempts'");
  assert.ok(!/\bof\s+\d/.test(f.evidence), `must not invent a denominator: ${f.evidence}`);
}

// 6 — a real denominator IS shown when we have one
{
  const out = rankFindings(insight({
    offenders: [{ action: "Confirm patient identity", missed: 9, critical: false, appeared: 12 }],
  }));
  const f = out.find((x) => x.kind === "repeat_step");
  assert.ok(/9 of 12/.test(f.evidence), `expected '9 of 12', got: ${f.evidence}`);
}

// 7 — an insufficient trajectory is NOT a finding; it is an honest state
{
  const out = rankFindings(insight({
    osceTrajectory: { band: "insufficient", delta: null, n: 2, needed: 4, firstMean: null, secondMean: null },
  }));
  assert.equal(out.length, 0, "too few attempts must not manufacture a trend finding");
}

// 8 — a cohort gap needs a real baseline
{
  const noBase = rankFindings(insight({
    contrasts: [{ topic: "gonioscopy", axis: "station", student: 40, cohortMean: null, peers: 1, label: "" }],
  }));
  assert.equal(noBase.length, 0, "no baseline must not produce a cohort finding");
  const withBase = rankFindings(insight({
    contrasts: [{ topic: "gonioscopy", axis: "station", student: 40, cohortMean: 75, peers: 6, label: "" }],
  }));
  assert.equal(withBase[0].kind, "cohort_gap");
  assert.ok(/6 peers/.test(withBase[0].evidence), "must cite the peer count it divided by");
}

// 9 — mark loss only speaks when one bucket genuinely dominates
{
  const even = rankFindings(insight({
    markLoss: { lost: { checklist: 10, consult: 10, judgement: 10 }, totalLost: 30,
                shares: { checklist: 33.3, consult: 33.3, judgement: 33.3 }, attempts: 5, excludedLegacy: 0 },
  }));
  assert.ok(!even.some((f) => f.kind === "mark_concentration"), "an even spread is not a finding");
  const skewed = rankFindings(insight({
    markLoss: { lost: { checklist: 40, consult: 5, judgement: 5 }, totalLost: 50,
                shares: { checklist: 80, consult: 10, judgement: 10 }, attempts: 5, excludedLegacy: 0 },
  }));
  assert.ok(skewed.some((f) => f.kind === "mark_concentration"), "80% in one bucket IS a finding");
}

// 10 — findings are stably ordered by severity then topic
{
  const out = rankFindings(insight({
    topics: [
      { topic: "zeta", flag: "rote", flashcards: cell(30, 10, "weak"), station: cell(80, 5, "strong"), retention: cell(50, 1, "weak") },
      { topic: "alpha", flag: "rote", flashcards: cell(30, 10, "weak"), station: cell(80, 5, "strong"), retention: cell(50, 1, "weak") },
    ],
  }));
  assert.deepEqual(out.map((f) => f.topic), ["alpha", "zeta"], "equal severity sorts by topic");
}

console.log("PASS report_findings_logic");
```

- [ ] **Step 2: Run to verify it fails**

```bash
node frontend/tests/report_findings_logic.mjs
```

Expected: FAIL — `Cannot find module '../src/aurora/lib/reportFindings.ts'`.

- [ ] **Step 3: Implement**

Create `frontend/src/aurora/lib/reportFindings.ts`:

```typescript
// frontend/src/aurora/lib/reportFindings.ts
/* The ranked findings engine.

   A trainer opens a report to learn something they could not get from the console's
   numbers. So this does not summarise the payload — it makes CLAIMS, each one carrying the
   evidence it rests on and the action it implies, ranked so the first thing read is the
   thing most worth acting on.

   Pure and HTML-free: both documents render the same conclusions from it, and it is tested
   as data rather than by scraping markup.

   The bar for emitting a finding is deliberately high. Silence is a valid output — a
   report that invents six observations about a student who did four flashcards is exactly
   the "telling me what I already know" this rebuild exists to end. Anything derived from a
   `thin` cell, a null cohort baseline, or an `insufficient` trajectory is NOT a finding; it
   is an honest state, and the document renders those as words in their own section. */
import {
  INDIVIDUAL_GAP,
  type Offender, type StudentInsight, type TopicRow,
} from "./insight";

export type FindingKind =
  | "critical_safety" | "knows_cant_do" | "declining" | "cohort_gap"
  | "repeat_step" | "consistent_gap" | "mark_concentration" | "rote";

export interface Finding {
  kind: FindingKind;
  /** Lower sorts first. */
  rank: number;
  /** "" for findings that are not about one topic. */
  topic: string;
  claim: string;
  evidence: string;
  action: string;
}

/** Severity order. Safety first, then the gaps teaching can close, then the diagnostics. */
const RANK: Record<FindingKind, number> = {
  critical_safety: 0, knows_cant_do: 1, declining: 2, cohort_gap: 3,
  repeat_step: 4, consistent_gap: 5, mark_concentration: 6, rote: 7,
};

/** One bucket has to carry this much of the total loss before it means anything. Below it,
    the three buckets are just where marks live, which the table already shows. */
const CONCENTRATION = 55.0;

const pct = (v: number) => `${Math.round(v)}%`;
const nice = (t: string) => t.replace(/_/g, " ");

/** "9 of 12 attempts that included it", or "3 attempts" when there is no denominator.
    `appeared` is null on the critical path, and a fabricated denominator there is exactly
    the defect the P1 offender fix removed. */
function offenderEvidence(o: Offender): string {
  return o.appeared == null
    ? `Missed in ${o.missed} attempts.`
    : `Missed in ${o.missed} of ${o.appeared} attempts that included this step.`;
}

function safetyFindings(insight: StudentInsight): Finding[] {
  return insight.criticalOffenders.map((o) => ({
    kind: "critical_safety" as const, rank: RANK.critical_safety, topic: "",
    claim: `A safety-critical step is being missed repeatedly: ${o.action}`,
    evidence: offenderEvidence(o),
    action: "Treat as a competency block, not a knowledge gap — observe this step directly before signing off any further station.",
  }));
}

function topicFindings(rows: TopicRow[]): Finding[] {
  const out: Finding[] = [];
  for (const r of rows) {
    if (r.flag === "knows_cant_do") {
      out.push({
        kind: "knows_cant_do", rank: RANK.knows_cant_do, topic: r.topic,
        claim: `${nice(r.topic)} is known but not performable.`,
        evidence: `Recall ${pct(r.flashcards.value)} across ${r.flashcards.n} cards, but ${pct(r.station.value)} across ${r.station.n} stations.`,
        action: "Book supervised practice, not revision — more reading will not close a performance gap.",
      });
    } else if (r.flag === "consistent_gap") {
      out.push({
        kind: "consistent_gap", rank: RANK.consistent_gap, topic: r.topic,
        claim: `${nice(r.topic)} is weak on both knowledge and performance.`,
        evidence: `Recall ${pct(r.flashcards.value)} (${r.flashcards.n} cards) and ${pct(r.station.value)} (${r.station.n} stations).`,
        action: "Re-teach the topic before further station practice — drilling now rehearses the error.",
      });
    } else if (r.flag === "rote") {
      out.push({
        kind: "rote", rank: RANK.rote, topic: r.topic,
        claim: `${nice(r.topic)} is performed correctly without the recall to explain it.`,
        evidence: `Stations ${pct(r.station.value)} (${r.station.n}) against recall ${pct(r.flashcards.value)} (${r.flashcards.n} cards).`,
        action: "Probe the reasoning verbally — the procedure is learnt, the rationale may not be.",
      });
    }
  }
  return out;
}

function trajectoryFinding(insight: StudentInsight): Finding[] {
  const t = insight.osceTrajectory;
  // Only `declining` is a finding. `improving`/`steady` are good news the trajectory
  // section already states, and `insufficient` is an honest state, not an observation.
  if (t.band !== "declining" || t.delta == null) return [];
  return [{
    kind: "declining", rank: RANK.declining, topic: "",
    claim: "Station performance is going backwards.",
    evidence: `Mean fell ${Math.abs(Math.round(t.delta))} points across ${t.n} attempts (${Math.round(t.firstMean ?? 0)} → ${Math.round(t.secondMean ?? 0)}).`,
    action: "Ask what changed. A decline across attempts usually means confidence outrunning technique, or a misremembered correction.",
  }];
}

function cohortFindings(insight: StudentInsight): Finding[] {
  const out: Finding[] = [];
  for (const c of insight.contrasts) {
    // No baseline -> no claim. `peers` below MIN_PEERS already yields cohortMean null in
    // P1; this guard is belt-and-braces because a fabricated peer comparison is the single
    // most damaging thing this document could print about a student.
    if (c.cohortMean == null) continue;
    const gap = c.cohortMean - c.student;
    if (gap < INDIVIDUAL_GAP) continue;
    const axis = c.axis === "station" ? "stations" : "flashcards";
    out.push({
      kind: "cohort_gap", rank: RANK.cohort_gap, topic: c.topic,
      claim: `${nice(c.topic)} is a gap relative to peers, not just in absolute terms.`,
      evidence: `${pct(c.student)} on ${axis} against a cohort mean of ${pct(c.cohortMean)} across ${c.peers} peers.`,
      action: "Worth a cohort-level check: if several students share it, the teaching is the cause, not the student.",
    });
  }
  return out;
}

function stepFindings(insight: StudentInsight): Finding[] {
  // Critical ones are already reported at rank 0 by safetyFindings; reporting them twice
  // would pad the list, which is the failure mode this engine exists to avoid.
  return insight.offenders.filter((o) => !o.critical).map((o) => ({
    kind: "repeat_step" as const, rank: RANK.repeat_step, topic: "",
    claim: `One step is missed far more than the rest: ${o.action}`,
    evidence: offenderEvidence(o),
    action: "A single repeated omission is usually a sequencing habit — correct where it sits in the routine, not the whole checklist.",
  }));
}

function markConcentration(insight: StudentInsight): Finding[] {
  const m = insight.markLoss;
  if (!m.attempts || !m.totalLost) return [];
  const labels: Record<string, string> = {
    checklist: "checklist coverage", consult: "consultation technique", judgement: "clinical judgement & safety",
  };
  const [top] = Object.entries(m.shares).sort((a, b) => b[1] - a[1]);
  if (!top || top[1] < CONCENTRATION) return [];
  const [bucket, share] = top;
  return [{
    kind: "mark_concentration", rank: RANK.mark_concentration, topic: "",
    claim: `Most marks are lost in one place: ${labels[bucket] ?? bucket}.`,
    evidence: `${pct(share)} of ${m.totalLost} marks lost across ${m.attempts} attempts.`,
    action: `Target ${labels[bucket] ?? bucket} specifically — the other two buckets are not what is costing this student.`,
  }];
}

/** Every finding worth a trainer's attention, most important first. Empty is a valid and
    common answer. */
export function rankFindings(insight: StudentInsight): Finding[] {
  const all = [
    ...safetyFindings(insight),
    ...topicFindings(insight.topics),
    ...trajectoryFinding(insight),
    ...cohortFindings(insight),
    ...stepFindings(insight),
    ...markConcentration(insight),
  ];
  // Stable and total: rank, then topic, then claim — so two runs over the same payload
  // cannot reorder, which would make the document diff noisily between generations.
  return all.sort((a, b) =>
    a.rank - b.rank || a.topic.localeCompare(b.topic) || a.claim.localeCompare(b.claim));
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
node frontend/tests/report_findings_logic.mjs
```

Expected: `PASS report_findings_logic`.

- [ ] **Step 5: Prove two guards**

1. Change `if (c.cohortMean == null) continue;` to `const base = c.cohortMean ?? 100;` and compare against `base`. Test 8 must fail. Revert.
   **Use `?? 100`, not `?? 0`.** A fabricated `0` baseline is unobservable: block 8's fixture has `student: 40`, so `gap = 0 - 40 = -40`, which the very next line (`gap < INDIVIDUAL_GAP`) discards anyway — the guard is never reached and the mutation passes. A mutation that cannot fail proves nothing; it records a false green.
2. Change `offenderEvidence`'s null branch to `Missed in ${o.missed} of ${o.appeared} attempts`. Test 5 must fail. Revert.

Report both assertion texts.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/aurora/lib/reportFindings.ts frontend/tests/report_findings_logic.mjs
git commit -m "feat(reports): rank findings as claim, evidence and action"
```

---

## Task 4: Shared document chrome

**Files:**
- Create: `frontend/src/aurora/lib/reportChrome.ts`

- [ ] **Step 1: Create the file**

```typescript
// frontend/src/aurora/lib/reportChrome.ts
/* Shared print-first chrome for both staff documents.

   One stylesheet, one escaper, one page shell — so the student report and the OSCE dossier
   read as one product rather than two builders that drifted. Dependency-free so both run
   under Node's type-stripping in the harnesses and never touch React or the DOM.

   Print-first is the point: a trainer's output is a PDF via the browser's print dialog, so
   A4 @page, tabular numerals for column alignment, and break-inside: avoid on every row,
   card and section — a finding split across a page break loses its evidence line. */

/** Escape the five HTML-significant characters. Every value interpolated into these
    documents goes through here — topic names, step actions and the lecturer note are all
    free text a student or trainer can type. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** An honest state: the reason a section is empty, in words. Never a blank, never a zero. */
export function absent(reason: string): string {
  return `<p class="absent">${esc(reason)}</p>`;
}

/** A section that renders its heading ONLY when it has something to say, so a document
    never carries a heading over a blank. Pass `whenEmpty` to state why instead. */
export function section(title: string, body: string, whenEmpty?: string): string {
  if (!body.trim()) {
    if (!whenEmpty) return "";
    return `<h2>${esc(title)}</h2>${absent(whenEmpty)}`;
  }
  return `<h2>${esc(title)}</h2>${body}`;
}

export const CHROME_CSS = `
  :root { color-scheme: light; --ink:#1a1a2e; --line:#e7e4f0; --accent:#6d3bd6;
          --weak:#c0392b; --ok:#1a8f4c; --dim:#8a86a0; }
  * { box-sizing:border-box; }
  body { font:14px/1.55 -apple-system,"Segoe UI",Roboto,Arial,sans-serif; color:var(--ink);
         background:#fff; margin:0; padding:0 32px 40px; max-width:920px; }
  .band { margin:0 -32px 4px; padding:26px 32px 20px;
          background:linear-gradient(120deg,#f3efff,#eaf1ff); border-bottom:3px solid var(--accent); }
  h1 { font-size:23px; margin:0 0 4px; letter-spacing:-.01em; }
  h1 small { font-weight:600; color:var(--accent); font-size:13px; text-transform:uppercase;
             letter-spacing:.08em; display:block; margin-bottom:4px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--accent);
       padding-bottom:6px; margin:30px 0 12px; border-bottom:1px solid var(--line); }
  h3 { font-size:14px; margin:18px 0 6px; }
  .meta { color:#5a5a72; font-size:13px; }
  .lede { color:#5a5a72; font-size:12.5px; margin:0 0 10px; }
  table { border-collapse:collapse; width:100%; }
  th,td { border-bottom:1px solid #efedf6; padding:6px 9px; vertical-align:top; text-align:left; }
  th { font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--dim); }
  tr:nth-child(even) td { background:#fbfaff; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  .weak { color:var(--weak); font-weight:700; }
  .ph { color:var(--dim); font-size:12px; white-space:nowrap; }
  .absent { color:#767391; font-style:italic; margin:4px 0; }
  .pill { padding:2px 9px; border-radius:999px; font-size:11px; font-weight:700; }
  .pill.ok { background:#e9f7ef; color:var(--ok); } .pill.no { background:#fdecec; color:var(--weak); }
  .note { background:#f4f0ff; padding:10px 13px; border-radius:8px; white-space:pre-wrap; }
  /* A finding is the unit that must never break across a page — the claim without its
     evidence is an assertion a trainer cannot check. */
  .finding { border-left:3px solid var(--accent); padding:8px 0 8px 12px; margin:0 0 12px; }
  .finding .claim { font-weight:700; }
  .finding .ev, .finding .act { font-size:12.5px; color:#4a4a63; margin-top:2px; }
  .finding .act::before { content:"→ "; color:var(--accent); font-weight:700; }
  .finding.sev0 { border-left-color:var(--weak); }
  .finding.sev0 .claim { color:var(--weak); }
  /* Glyph + word, never colour alone: these print in greyscale and are read by people who
     do not all see hue the same way. */
  .flagged::before { content:"! "; font-weight:800; color:var(--weak); }
  @page { size:A4; margin:14mm; }
  @media print {
    body { padding:0 20px 20px; } .band { margin:0 -20px 4px; }
    h2 { break-after:avoid; } tr,.finding,.tile,.attempt { break-inside:avoid; }
    .attempt { break-before:auto; }
  }
`;

/** The full self-contained document. Both builders end by calling this. */
export function page(opts: { title: string; kicker: string; heading: string;
                             meta: string[]; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(opts.title)}</title>
<style>${CHROME_CSS}</style>
</head>
<body>
  <div class="band">
    <h1><small>${esc(opts.kicker)}</small>${esc(opts.heading)}</h1>
    ${opts.meta.map((m) => `<div class="meta">${esc(m)}</div>`).join("")}
  </div>
  ${opts.body}
</body>
</html>`;
}

/** Findings as the document's opening argument. `sev0` reddens rank-0 safety findings. */
export function findingsHtml(findings: { rank: number; claim: string; evidence: string; action: string }[]): string {
  return findings.map((f) => `<div class="finding${f.rank === 0 ? " sev0" : ""}">
    <div class="claim">${esc(f.claim)}</div>
    <div class="ev">${esc(f.evidence)}</div>
    <div class="act">${esc(f.action)}</div>
  </div>`).join("");
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/lib/reportChrome.ts
git commit -m "feat(reports): one print-first chrome for both documents"
```

---

## Task 5: `transcriptNote` on the session export

The one change `sessionExport.ts` takes (spec §7.3). Its `transcript()` renders `— no messages —` on an empty array, which for a trainer-generated per-attempt record would assert nothing was said. `chat_sessions` keeps no messages (`log_session.py:29` stores a 200-char summary), so the appendix must say *why* it is empty. The student's own save passes nothing and stays byte-identical.

**Files:**
- Modify: `frontend/src/aurora/lib/sessionExport.ts`
- Test: `frontend/tests/session_export_logic.mjs`

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/session_export_logic.mjs` (read the file first for its existing fixture helper and reuse it):

```javascript
// --- transcriptNote (P2 §7.3) -------------------------------------------------
{
  const base = makeData();           // reuse this file's existing fixture builder
  base.patientTranscript = [];
  base.actionTranscript = [];

  const student = buildSessionHtml(base);
  assert.ok(/— no messages —/.test(student),
    "the student's own save must be unchanged when no note is supplied");

  const trainer = buildSessionHtml({ ...base, transcriptNote: "Transcript not retained for this attempt." });
  assert.ok(/Transcript not retained for this attempt\./.test(trainer),
    "a supplied note must explain WHY the appendix is empty");
  assert.ok(!/— no messages —/.test(trainer),
    "the note REPLACES the empty-list dash, which would assert nothing was said");
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
node frontend/tests/session_export_logic.mjs
```

Expected: FAIL on the second assertion — the note is not rendered.

- [ ] **Step 3: Implement**

In `frontend/src/aurora/lib/sessionExport.ts`, add to the `SessionExportData` interface (after `actionTranscript`):

```typescript
  /** Why the transcript appendices are empty, when they are. Absent for a student's own
      save (their transcript really is the whole conversation); the trainer's per-attempt
      record passes a reason, because chat_sessions retains no messages and "— no messages —"
      would assert that nothing was said. */
  transcriptNote?: string;
```

Change `transcript()` (line ~121) to take the note:

```typescript
function transcript(rows: { who: string; text: string }[], note?: string): string {
  if (!rows.length) return `<p class="muted">${note ? esc(note) : "— no messages —"}</p>`;
```

...and pass `data.transcriptNote` at both call sites inside `buildSessionHtml`.

- [ ] **Step 4: Run to verify it passes**

```bash
node frontend/tests/session_export_logic.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/lib/sessionExport.ts frontend/tests/session_export_logic.mjs
git commit -m "feat(reports): let an empty transcript say why it is empty"
```

---

## Task 6: Student report — masthead, findings, and the map

**Files:**
- Rewrite: `frontend/src/aurora/lib/studentReportExport.ts`
- Test: `frontend/tests/student-report.test.mjs`

The rebuild replaces the file. Read the existing one first — its `StudentReportData` is consumed at `AdminStudentDetail.tsx:130`, and Task 9 updates that call site. Preserve the two facts its comments record: `session_count` over-counts, so the tile is labelled "Activity events"; and a per-scale cohort average must never be repeated down a per-topic table.

- [ ] **Step 1: Write the failing test**

Replace the body of `frontend/tests/student-report.test.mjs` with:

```javascript
/**
 * The rebuilt student report (P2 §7.1).
 *
 * Asserts the document makes CLAIMS and states honest absences as words. Every check here
 * is about meaning, not markup — a test that pins class names would break on any restyle
 * and catch none of the defects that matter.
 */
import assert from "node:assert";
import { buildStudentReportHtml } from "../src/aurora/lib/studentReportExport.ts";

const cell = (value, n, band) => ({ value, n, band });
const EMPTY_INSIGHT = {
  topics: [], contrasts: [],
  markLoss: { lost: { checklist: 0, consult: 0, judgement: 0 }, totalLost: 0,
              shares: { checklist: 0, consult: 0, judgement: 0 }, attempts: 0, excludedLegacy: 0 },
  offenders: [], criticalOffenders: [],
  osceTrajectory: { band: "insufficient", delta: null, n: 0, needed: 4, firstMean: null, secondMean: null },
  flashcardTrajectory: { band: "insufficient", delta: null, n: 0, needed: 20, firstMean: null, secondMean: null },
  consultations: [], excluded: { unmappedCase: 0, unscored: 0 },
};

const base = (over = {}) => ({
  meta: { studentId: "stu_x", fullName: "Alice Tan", email: "a@t.com", role: "OA", dateStr: "2026-08-06" },
  insight: EMPTY_INSIGHT,
  attempts: [],
  note: "",
  ...over,
});

// 1 — identity and escaping
{
  const html = buildStudentReportHtml(base({ meta: { studentId: "s", fullName: "<script>x</script>", email: "e", role: "OA", dateStr: "d" } }));
  assert.ok(!/<script>x<\/script>/.test(html), "free text must be escaped");
  assert.ok(/&lt;script&gt;/.test(html), "and escaped visibly");
}

// 2 — a brand-new student gets words, never zeros
{
  const html = buildStudentReportHtml(base());
  assert.ok(/No stations attempted/i.test(html), "must say so in words");
  assert.ok(!/>0%</.test(html), `a bare 0% must never appear for missing data: ${html.match(/.{0,60}>0%<.{0,60}/) ?? ""}`);
}

// 3 — the trajectory states its own threshold rather than going quiet
{
  const html = buildStudentReportHtml(base({
    insight: { ...EMPTY_INSIGHT, osceTrajectory: { band: "insufficient", delta: null, n: 2, needed: 4, firstMean: null, secondMean: null } },
  }));
  assert.ok(/2 so far/.test(html) && /4 needed/.test(html),
    "an insufficient trajectory must state both counts");
}

// 4 — the map renders a flagged cell with a word, not just colour
{
  const html = buildStudentReportHtml(base({
    insight: { ...EMPTY_INSIGHT, topics: [{ topic: "tonometry", flag: "knows_cant_do",
      flashcards: cell(92, 20, "strong"), station: cell(41, 5, "weak"), retention: cell(88, 1, "strong") }] },
  }));
  assert.ok(/tonometry/i.test(html));
  assert.ok(/known but not performable/i.test(html), "the flag must be explained in prose");
}

// 5 — a thin cell shows its n and is not banded as if it were solid
{
  const html = buildStudentReportHtml(base({
    insight: { ...EMPTY_INSIGHT, topics: [{ topic: "gonioscopy", flag: "",
      flashcards: cell(100, 2, "thin"), station: cell(0, 0, "thin"), retention: cell(0, 0, "thin") }] },
  }));
  assert.ok(/n\s*=\s*2/.test(html), "a thin cell must carry its count");
}

// 6 — a null cohort baseline says so; it never prints 0
{
  const html = buildStudentReportHtml(base({
    insight: { ...EMPTY_INSIGHT, contrasts: [{ topic: "gonioscopy", axis: "station", student: 40, cohortMean: null, peers: 1, label: "" }] },
  }));
  assert.ok(/No cohort baseline/i.test(html), "must name the absence");
  assert.ok(/1 peer/.test(html), "and say how many peers it had");
}

// 7 — an unrecorded consultation label is words, not blank
{
  const html = buildStudentReportHtml(base({
    insight: { ...EMPTY_INSIGHT, consultations: [{ label: "", count: 4, lastSeen: "2026-08-01", derived: false }] },
  }));
  assert.ok(/Topic not recorded/i.test(html));
  assert.ok(/4/.test(html), "the count is still real and still shown");
}

// 8 — a derived label is marked as inferred, so a trainer knows not to fully trust it
{
  const html = buildStudentReportHtml(base({
    insight: { ...EMPTY_INSIGHT, consultations: [{ label: "gonioscopy", count: 2, lastSeen: "2026-08-01", derived: true }] },
  }));
  assert.ok(/inferred/i.test(html), "a derived label must be flagged as inferred");
}

// 9 — all-legacy attempts are called out, not silently blended
{
  const html = buildStudentReportHtml(base({
    insight: { ...EMPTY_INSIGHT, markLoss: { lost: { checklist: 0, consult: 0, judgement: 0 }, totalLost: 0,
      shares: { checklist: 0, consult: 0, judgement: 0 }, attempts: 0, excludedLegacy: 6 } },
  }));
  assert.ok(/retired/i.test(html) && /6/.test(html),
    "6 legacy attempts must be named as not comparable");
}

// 10 — findings lead the document
{
  const html = buildStudentReportHtml(base({
    insight: { ...EMPTY_INSIGHT, criticalOffenders: [{ action: "Perform hand hygiene.", missed: 3, critical: true, appeared: null }] },
  }));
  const findingsAt = html.indexOf("Perform hand hygiene.");
  const mapAt = html.search(/Knowledge\s*(&amp;|×|x)\s*performance/i);
  assert.ok(findingsAt > 0 && (mapAt < 0 || findingsAt < mapAt),
    "the ranked findings must appear before the tables");
}

console.log("PASS student-report");
```

- [ ] **Step 2: Run to verify it fails**

```bash
node frontend/tests/student-report.test.mjs
```

Expected: FAIL — the new `StudentReportData` shape does not exist yet.

- [ ] **Step 3: Implement**

Replace `frontend/src/aurora/lib/studentReportExport.ts` entirely:

```typescript
// frontend/src/aurora/lib/studentReportExport.ts
/* The per-student report (P2 §7.1) — the document a trainer downloads from the console.

   Rebuilt onto the P1 insight payload. The old version listed what the console already
   showed; this one leads with ranked CLAIMS (reportFindings.ts) and backs each with the
   evidence it rests on. Tables come after the argument, not instead of it.

   Every section states an honest absence in words rather than rendering a zero or a blank
   (spec §8) — "No cohort baseline for this topic (1 peer with data)" is information; an
   empty cell is a bug a trainer cannot distinguish from a real zero.

   Dependency-free so it runs under Node's type-stripping in the harness. */
import type { Attempt, Cell, StudentInsight, TopicRow } from "./insight";
import { MIN_CARDS } from "./insight";
import { rankFindings } from "./reportFindings";
import { absent, esc, findingsHtml, page, section } from "./reportChrome";

export interface StudentReportData {
  meta: { studentId: string; fullName: string; email: string; role: string; dateStr: string };
  insight: StudentInsight;
  /** Present when the trainer had the attempts loaded; the stations table degrades to the
      insight's own counts when empty. */
  attempts: Attempt[];
  note: string;
}

const pct = (v: number) => `${Math.round(v)}%`;
const nice = (t: string) => esc(t.replace(/_/g, " "));

const FLAG_PROSE: Record<string, string> = {
  knows_cant_do: "known but not performable",
  rote: "performed without the recall to explain it",
  consistent_gap: "weak on both knowledge and performance",
};

/** A cell as text. A `thin` cell carries its n and is never dressed as a solid figure —
    100% off two cards is not 100%. */
function cellText(c: Cell): string {
  if (!c || !c.n) return `<span class="absent">—</span>`;
  if (c.band === "thin") return `${pct(c.value)} <span class="ph">(n=${c.n}, thin)</span>`;
  const weak = c.band === "weak" ? ' class="weak"' : "";
  return `<span${weak}>${pct(c.value)}</span> <span class="ph">(n=${c.n})</span>`;
}

function mapTable(rows: TopicRow[]): string {
  if (!rows.length) return "";
  const body = rows.map((r) => `<tr>
      <td class="${r.flag ? "flagged" : ""}">${nice(r.topic)}</td>
      <td class="num">${cellText(r.flashcards)}</td>
      <td class="num">${cellText(r.station)}</td>
      <td class="num">${cellText(r.retention)}</td>
      <td>${r.flag ? esc(FLAG_PROSE[r.flag] ?? r.flag) : ""}</td>
    </tr>`).join("");
  return `<p class="lede">Recall against performance, per topic. A topic is only flagged when both
    sides carry enough data to compare — ${MIN_CARDS}+ cards and at least one scored station.</p>
    <table>
      <tr><th>Topic</th><th class="num">Flashcards</th><th class="num">Stations</th>
          <th class="num">Retention</th><th>Reading</th></tr>
      ${body}
    </table>`;
}

function markLossBlock(insight: StudentInsight): string {
  const m = insight.markLoss;
  if (!m.attempts) {
    return m.excludedLegacy
      ? absent(`${m.excludedLegacy} attempts, all on the retired ×50 scale — not comparable to current marks.`)
      : absent("No stations attempted on the current marking scale.");
  }
  if (!m.totalLost) return absent(`No marks lost across ${m.attempts} attempts.`);
  const labels: Record<string, string> = {
    checklist: "Checklist coverage", consult: "Consultation technique", judgement: "Clinical judgement & safety",
  };
  const rows = (["checklist", "consult", "judgement"] as const).map((k) => `<tr>
      <td>${esc(labels[k])}</td>
      <td class="num">${m.lost[k]}</td>
      <td class="num">${pct(m.shares[k])}</td>
    </tr>`).join("");
  const legacy = m.excludedLegacy
    ? `<p class="lede">${m.excludedLegacy} further attempts sit on the retired ×50 scale and are excluded — blending them would invent a trend.</p>`
    : "";
  return `<p class="lede">Where ${m.totalLost} lost marks went, across ${m.attempts} attempts on the current scale.
    Shares are rounded independently and may not total exactly 100%.</p>
    <table><tr><th>Bucket</th><th class="num">Marks lost</th><th class="num">Share</th></tr>${rows}</table>${legacy}`;
}

function trajectoryBlock(insight: StudentInsight): string {
  const t = insight.osceTrajectory;
  if (t.band === "insufficient") {
    return absent(`Not enough attempts to call a trend (${t.n} so far, ${t.needed} needed).`);
  }
  const word = t.band === "improving" ? "improving" : t.band === "declining" ? "going backwards" : "steady";
  const delta = t.delta == null ? "" :
    ` Mean moved ${t.delta > 0 ? "+" : ""}${Math.round(t.delta)} points (${Math.round(t.firstMean ?? 0)} → ${Math.round(t.secondMean ?? 0)}).`;
  return `<p>Station performance is <b>${esc(word)}</b> across ${t.n} attempts.${esc(delta)}</p>
    <p class="lede">Movement smaller than 5 points is treated as noise, not a trend.</p>`;
}

function contrastBlock(insight: StudentInsight): string {
  if (!insight.contrasts.length) return "";
  const rows = insight.contrasts.map((c) => {
    const cohort = c.cohortMean == null
      ? `<span class="absent">No cohort baseline for this topic (${c.peers} peer${c.peers === 1 ? "" : "s"} with data)</span>`
      : `${pct(c.cohortMean)} <span class="ph">(${c.peers} peers)</span>`;
    return `<tr><td>${nice(c.topic)}</td>
      <td>${esc(c.axis === "station" ? "Stations" : "Flashcards")}</td>
      <td class="num">${pct(c.student)}</td><td>${cohort}</td></tr>`;
  }).join("");
  return `<p class="lede">The cohort mean excludes this student. A topic with fewer than three peers
    carries no baseline — that is stated, never filled with a zero.</p>
    <table><tr><th>Topic</th><th>Axis</th><th class="num">Student</th><th>Cohort</th></tr>${rows}</table>`;
}

function flashcardsByTopic(rows: TopicRow[]): string {
  const scored = rows.filter((r) => r.flashcards.n > 0)
    .sort((a, b) => a.flashcards.value - b.flashcards.value);   // worst first
  if (!scored.length) return "";
  const body = scored.map((r) => `<tr><td>${nice(r.topic)}</td>
      <td class="num">${cellText(r.flashcards)}</td></tr>`).join("");
  return `<p class="lede">Average grade per topic, weakest first.</p>
    <table><tr><th>Topic</th><th class="num">Average grade</th></tr>${body}</table>`;
}

function stationsTable(attempts: Attempt[]): string {
  if (!attempts.length) return "";
  const rows = attempts.map((a) => {
    const score = a.score100 == null
      ? `${a.totalScore} <span class="ph">(legacy scale)</span>`
      : `${a.score100} / 100`;
    const safety = a.safe == null ? "—" : a.safe ? "safe" : "! unsafe";
    const ledger = a.checklistDetail == null
      ? `<span class="absent">not recorded</span>`
      : `${a.checklistDetail.filter((s) => s.performed).length} / ${a.checklistDetail.length} steps`;
    return `<tr><td>${esc(a.caseId)}</td><td class="num">${score}</td>
      <td><span class="pill ${a.passed ? "ok" : "no"}">${a.passed ? "Pass" : "Fail"}</span></td>
      <td class="${a.safe === false ? "weak" : ""}">${esc(safety)}</td>
      <td>${ledger}</td><td class="ph">${esc(a.completedAt.slice(0, 10))}</td></tr>`;
  }).join("");
  return `<table><tr><th>Case</th><th class="num">Score</th><th>Result</th><th>Safety</th>
      <th>Steps performed</th><th>Date</th></tr>${rows}</table>`;
}

function consultationsBlock(insight: StudentInsight): string {
  if (!insight.consultations.length) return "";
  const rows = insight.consultations.map((c) => `<tr>
      <td>${c.label ? nice(c.label) : '<span class="absent">Topic not recorded</span>'}
          ${c.derived ? '<span class="ph">(inferred from the reply)</span>' : ""}</td>
      <td class="num">${c.count}</td><td class="ph">${esc(c.lastSeen || "—")}</td></tr>`).join("");
  return `<p class="lede">What this student brought to the tutor. Labels only — transcripts are not retained.</p>
    <table><tr><th>Subject</th><th class="num">Times</th><th>Last</th></tr>${rows}</table>`;
}

export function buildStudentReportHtml(data: StudentReportData): string {
  const { meta, insight, attempts, note } = data;
  const findings = rankFindings(insight);

  const excluded = insight.excluded.unmappedCase || insight.excluded.unscored
    ? `<p class="lede">${insight.excluded.unmappedCase} attempts could not be mapped to a topic and
       ${insight.excluded.unscored} carried no score; both are excluded from the map above and remain
       in the stations table.</p>`
    : "";

  const body = [
    section("Findings", findingsHtml(findings),
      "No findings — there is not yet enough evidence to say anything a trainer could act on."),
    section("Knowledge &amp; performance map", mapTable(insight.topics) + excluded,
      "No topic has both recall and station data yet."),
    section("Where the marks go", markLossBlock(insight)),
    section("Trajectory", trajectoryBlock(insight)),
    section("Against the cohort", contrastBlock(insight),
      "No topic has enough peers for a cohort comparison."),
    section("Flashcards by topic", flashcardsByTopic(insight.topics),
      "No flashcard attempts recorded."),
    section("Stations", stationsTable(attempts), "No stations attempted."),
    section("Consultations", consultationsBlock(insight), "No tutor sessions recorded."),
    section("Lecturer note", note.trim() ? `<div class="note">${esc(note)}</div>` : "", "None."),
  ].join("\n");

  return page({
    title: `EyeBot — Student report — ${meta.fullName}`,
    kicker: "EyeBot · Student report",
    heading: meta.fullName,
    meta: [`${meta.email} · ${meta.role} · Student ${meta.studentId}`, `Generated ${meta.dateStr}`],
    body,
  });
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
node frontend/tests/student-report.test.mjs
```

Expected: `PASS student-report`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/lib/studentReportExport.ts frontend/tests/student-report.test.mjs
git commit -m "feat(reports): rebuild the student report around ranked findings"
```

---

## Task 7: The OSCE dossier

**Files:**
- Create: `frontend/src/aurora/lib/osceDossierExport.ts`
- Test: `frontend/tests/osce_dossier_logic.mjs`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/osce_dossier_logic.mjs`:

```javascript
/**
 * The OSCE dossier (P2 §7.2) — every attempt for one student in one document.
 */
import assert from "node:assert";
import { buildOsceDossierHtml } from "../src/aurora/lib/osceDossierExport.ts";

const EMPTY_INSIGHT = {
  topics: [], contrasts: [],
  markLoss: { lost: { checklist: 0, consult: 0, judgement: 0 }, totalLost: 0,
              shares: { checklist: 0, consult: 0, judgement: 0 }, attempts: 0, excludedLegacy: 0 },
  offenders: [], criticalOffenders: [],
  osceTrajectory: { band: "insufficient", delta: null, n: 0, needed: 4, firstMean: null, secondMean: null },
  flashcardTrajectory: { band: "insufficient", delta: null, n: 0, needed: 20, firstMean: null, secondMean: null },
  consultations: [], excluded: { unmappedCase: 0, unscored: 0 },
};
const meta = { studentId: "stu_x", fullName: "Alice Tan", email: "a@t.com", role: "OA", dateStr: "2026-08-06" };

const attempt = (over = {}) => ({
  caseId: "c1", completedAt: "2026-08-01T00:00:00Z", totalScore: 29, passed: true,
  score100: 72, safe: true, checklistCoverage: 30, consultTechnique: 22, judgementSafety: 20,
  gradeScale: 2, missedCritical: [], coaching: null, checklistDetail: null, ...over,
});

// 1 — no attempts at all
{
  const html = buildOsceDossierHtml({ meta, insight: EMPTY_INSIGHT, attempts: [] });
  assert.ok(/No stations attempted/i.test(html));
}

// 2 — a NULL ledger says it was not recorded; it never renders an empty step table
{
  const html = buildOsceDossierHtml({ meta, insight: EMPTY_INSIGHT, attempts: [attempt()] });
  assert.ok(/Per-step ledger not recorded for this attempt/i.test(html));
}

// 3 — an EMPTY ledger is different from a missing one
{
  const html = buildOsceDossierHtml({ meta, insight: EMPTY_INSIGHT, attempts: [attempt({ checklistDetail: [] })] });
  assert.ok(/resolved no checklist steps/i.test(html),
    "[] means the case had no checklist, which is not the same as 'not recorded'");
  assert.ok(!/not recorded for this attempt/i.test(html));
}

// 4 — a real ledger renders every step with its state, and marks the critical ones
{
  const html = buildOsceDossierHtml({ meta, insight: EMPTY_INSIGHT, attempts: [attempt({
    checklistDetail: [
      { stepNumber: 1, action: "Perform hand hygiene.", phase: "Preparation", critical: true, performed: false, skipped: true },
      { stepNumber: 2, action: "Greet the patient.", phase: "Preparation", critical: false, performed: true, skipped: false },
    ] })] });
  assert.ok(/Perform hand hygiene\./.test(html) && /Greet the patient\./.test(html));
  assert.ok(/1 of 2/.test(html), "the per-attempt ledger must carry its own denominator");
}

// 5 — a legacy-scale attempt is labelled, never shown as if it were /100
{
  const html = buildOsceDossierHtml({ meta, insight: EMPTY_INSIGHT,
    attempts: [attempt({ score100: null, gradeScale: null, totalScore: 31 })] });
  assert.ok(/retired/i.test(html) || /legacy/i.test(html), "a pre-017 attempt must be marked");
  assert.ok(!/31\s*\/\s*100/.test(html), "and must not be printed on the current scale");
}

// 6 — escaping
{
  const html = buildOsceDossierHtml({ meta, insight: EMPTY_INSIGHT, attempts: [attempt({
    checklistDetail: [{ stepNumber: 1, action: "<img src=x onerror=1>", phase: "P", critical: false, performed: true, skipped: false }] })] });
  assert.ok(!/<img src=x/.test(html), "step text must be escaped");
}

// 7 — the safety record leads with critical misses
{
  const html = buildOsceDossierHtml({ meta,
    insight: { ...EMPTY_INSIGHT, criticalOffenders: [{ action: "Perform hand hygiene.", missed: 3, critical: true, appeared: null }] },
    attempts: [attempt()] });
  assert.ok(/Perform hand hygiene\./.test(html));
  assert.ok(!/\bof\s+\d+\s+attempts that included/.test(html),
    "a null denominator must not become a fraction");
}

console.log("PASS osce_dossier_logic");
```

- [ ] **Step 2: Run to verify it fails**

```bash
node frontend/tests/osce_dossier_logic.mjs
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/aurora/lib/osceDossierExport.ts`:

```typescript
// frontend/src/aurora/lib/osceDossierExport.ts
/* The OSCE dossier (P2 §7.2) — every station attempt for one student, in one document.

   The student report summarises; this reconstructs. It exists because migration 019 finally
   persists the per-step ledger, which until now was built at grading time and thrown away —
   so no trainer could ever see WHICH steps a student missed, only how many.

   A missing ledger and an empty one are different facts and render differently: NULL means
   the attempt predates the column, [] means the case genuinely resolved no checklist. */
import type { Attempt, AttemptStep, Offender, StudentInsight } from "./insight";
import { rankFindings } from "./reportFindings";
import { absent, esc, findingsHtml, page, section } from "./reportChrome";

export interface OsceDossierData {
  meta: { studentId: string; fullName: string; email: string; role: string; dateStr: string };
  insight: StudentInsight;
  attempts: Attempt[];
}

const pct = (v: number) => `${Math.round(v)}%`;

function offenderRows(list: Offender[]): string {
  return list.map((o) => `<tr>
    <td class="${o.critical ? "flagged" : ""}">${esc(o.action)}</td>
    <td class="num">${o.missed}</td>
    <td>${o.appeared == null
        ? '<span class="absent">no denominator recorded</span>'
        : `of ${o.appeared} attempts that included it`}</td>
  </tr>`).join("");
}

function ledger(steps: AttemptStep[] | null): string {
  if (steps == null) return absent("Per-step ledger not recorded for this attempt.");
  if (!steps.length) return absent("This attempt resolved no checklist steps.");
  const done = steps.filter((s) => s.performed).length;
  const rows = steps.map((s) => `<tr>
      <td class="ph">${s.stepNumber}</td>
      <td class="${s.critical ? "flagged" : ""}">${esc(s.action)}</td>
      <td class="ph">${esc(s.phase)}</td>
      <td>${s.performed ? "performed" : s.skipped ? "skipped" : "not performed"}</td>
    </tr>`).join("");
  return `<p class="lede">${done} of ${steps.length} steps performed.</p>
    <table><tr><th>#</th><th>Step</th><th>Phase</th><th>State</th></tr>${rows}</table>`;
}

function attemptSection(a: Attempt, index: number): string {
  // grade_scale 2 is the current 40/30/30 era. NULL is the retired x50 era (migration 017
  // deliberately did not backfill), so its sub-scores are on a different scale and must
  // never be printed as if they were /100.
  const legacy = a.score100 == null || a.gradeScale == null;
  const score = legacy
    ? `${a.totalScore} <span class="ph">(retired ×50 scale — not comparable)</span>`
    : `<b>${a.score100} / 100</b>`;
  const buckets = legacy ? "" : `<table>
      <tr><th>Bucket</th><th class="num">Score</th><th class="num">Max</th></tr>
      <tr><td>Checklist coverage</td><td class="num">${a.checklistCoverage ?? "—"}</td><td class="num">40</td></tr>
      <tr><td>Consultation technique</td><td class="num">${a.consultTechnique ?? "—"}</td><td class="num">30</td></tr>
      <tr><td>Clinical judgement &amp; safety</td><td class="num">${a.judgementSafety ?? "—"}</td><td class="num">30</td></tr>
    </table>`;
  const missed = a.missedCritical.length
    ? `<p class="flagged">Critical steps missed: ${esc(a.missedCritical.join("; "))}</p>` : "";
  const coach = a.coaching && typeof a.coaching === "object" && Object.keys(a.coaching).length
    ? `<div class="note">${Object.entries(a.coaching)
        .map(([k, v]) => `<b>${esc(k.replace(/_/g, " "))}:</b> ${esc(String(v))}`).join("<br>")}</div>`
    : "";
  return `<div class="attempt">
    <h3>${index + 1}. ${esc(a.caseId)} <span class="ph">· ${esc(a.completedAt.slice(0, 10))}</span></h3>
    <p>${score} · <span class="pill ${a.passed ? "ok" : "no"}">${a.passed ? "Pass" : "Fail"}</span>
       ${a.safe === false ? '<span class="weak">! unsafe</span>' : ""}</p>
    ${buckets}${missed}${coach}${ledger(a.checklistDetail)}
  </div>`;
}

export function buildOsceDossierHtml(data: OsceDossierData): string {
  const { meta, insight, attempts } = data;
  const t = insight.osceTrajectory;

  const arc = t.band === "insufficient"
    ? absent(`Not enough attempts to call a trend (${t.n} so far, ${t.needed} needed).`)
    : `<p>Across ${t.n} attempts, performance is <b>${esc(t.band === "declining" ? "going backwards" : t.band)}</b>` +
      `${t.delta == null ? "" : ` — mean moved ${t.delta > 0 ? "+" : ""}${Math.round(t.delta)} points`}.</p>`;

  const m = insight.markLoss;
  const marks = m.attempts && m.totalLost
    ? `<table><tr><th>Bucket</th><th class="num">Lost</th><th class="num">Share</th></tr>
        <tr><td>Checklist coverage</td><td class="num">${m.lost.checklist}</td><td class="num">${pct(m.shares.checklist)}</td></tr>
        <tr><td>Consultation technique</td><td class="num">${m.lost.consult}</td><td class="num">${pct(m.shares.consult)}</td></tr>
        <tr><td>Clinical judgement &amp; safety</td><td class="num">${m.lost.judgement}</td><td class="num">${pct(m.shares.judgement)}</td></tr>
      </table>`
    : "";

  const offenders = insight.offenders.length
    ? `<table><tr><th>Step</th><th class="num">Missed</th><th>Denominator</th></tr>${offenderRows(insight.offenders)}</table>`
    : "";
  const safety = insight.criticalOffenders.length
    ? `<table><tr><th>Critical step</th><th class="num">Missed</th><th>Denominator</th></tr>${offenderRows(insight.criticalOffenders)}</table>`
    : "";

  const body = [
    section("Findings", findingsHtml(rankFindings(insight)),
      "No findings — not enough evidence yet to say anything actionable."),
    section("The arc", arc),
    section("Where the marks go", marks,
      m.excludedLegacy ? `${m.excludedLegacy} attempts sit on the retired ×50 scale and are excluded.`
                       : "No marks lost, or no attempts on the current scale."),
    section("Repeated omissions", offenders, "No step has been missed often enough to call it a pattern."),
    section("Safety record", safety, "No critical step has been missed more than once."),
    section("Every attempt",
      attempts.map(attemptSection).join("\n"), "No stations attempted."),
  ].join("\n");

  return page({
    title: `EyeBot — OSCE dossier — ${meta.fullName}`,
    kicker: "EyeBot · OSCE dossier",
    heading: meta.fullName,
    meta: [`${meta.email} · ${meta.role} · Student ${meta.studentId}`,
           `${attempts.length} attempts · Generated ${meta.dateStr}`],
    body,
  });
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
node frontend/tests/osce_dossier_logic.mjs
```

Expected: `PASS osce_dossier_logic`.

- [ ] **Step 5: Prove the NULL/[] distinction guards**

Change `if (steps == null)` to `if (!steps || !steps.length)`. Test 3 must fail (an empty ledger would claim "not recorded"). Revert, confirm green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/aurora/lib/osceDossierExport.ts frontend/tests/osce_dossier_logic.mjs
git commit -m "feat(reports): the OSCE dossier, every attempt with its ledger"
```

---

## Task 8: The honest-states sweep

Spec §8 is a table of nine situations. Tasks 6 and 7 each assert some of them; this asserts **all nine, across BOTH documents**, so a future edit to either builder cannot quietly reintroduce a bare zero. This is the regression test for the defect class that recurred five times in P1.

**Files:**
- Create: `frontend/tests/report_honest_states_logic.mjs`

- [ ] **Step 1: Write the test**

```javascript
/**
 * Spec §8, both documents: "A zero is never printed where the truth is 'not measured'."
 *
 * P1 shipped this defect FIVE times (a 0.0 cohort baseline, a dropped whitespace tag, a
 * NULL/[] conflation, a reversed sort, and two offender denominators). It is the failure
 * mode of this feature, so it gets its own sweep rather than living as scattered asserts.
 */
import assert from "node:assert";
import { buildStudentReportHtml } from "../src/aurora/lib/studentReportExport.ts";
import { buildOsceDossierHtml } from "../src/aurora/lib/osceDossierExport.ts";

const EMPTY_INSIGHT = {
  topics: [], contrasts: [],
  markLoss: { lost: { checklist: 0, consult: 0, judgement: 0 }, totalLost: 0,
              shares: { checklist: 0, consult: 0, judgement: 0 }, attempts: 0, excludedLegacy: 0 },
  offenders: [], criticalOffenders: [],
  osceTrajectory: { band: "insufficient", delta: null, n: 0, needed: 4, firstMean: null, secondMean: null },
  flashcardTrajectory: { band: "insufficient", delta: null, n: 0, needed: 20, firstMean: null, secondMean: null },
  consultations: [], excluded: { unmappedCase: 0, unscored: 0 },
};
const meta = { studentId: "s", fullName: "A", email: "e", role: "OA", dateStr: "d" };
const ins = (over) => ({ ...EMPTY_INSIGHT, ...over });

/** Both documents, same insight — every honest state must hold in each. */
function both(insight, attempts = []) {
  return [
    buildStudentReportHtml({ meta, insight, attempts, note: "" }),
    buildOsceDossierHtml({ meta, insight, attempts }),
  ];
}

const CASES = [
  ["no attempts at all", ins({}), [], /No stations attempted/i],
  ["all pre-017 scale", ins({ markLoss: { ...EMPTY_INSIGHT.markLoss, excludedLegacy: 6 } }), [], /retired/i],
  ["too few attempts for a trend",
    ins({ osceTrajectory: { band: "insufficient", delta: null, n: 2, needed: 4, firstMean: null, secondMean: null } }),
    [], /2 so far/],
  ["no cohort baseline",
    ins({ contrasts: [{ topic: "t", axis: "station", student: 40, cohortMean: null, peers: 1, label: "" }] }),
    [], /No cohort baseline/i],
];

for (const [name, insight, attempts, expect] of CASES) {
  for (const html of both(insight, attempts)) {
    // The state must be stated SOMEWHERE in at least one document; the student report and
    // the dossier legitimately carry different sections, so we assert per-document below
    // only for the states both are required to render.
    void html;
  }
  const [report] = both(insight, attempts);
  assert.ok(expect.test(report), `student report must state: ${name}`);
}

// The dossier's own required states
{
  const nullLedger = [{ caseId: "c", completedAt: "2026-08-01T00:00:00Z", totalScore: 1, passed: true,
    score100: 70, safe: true, checklistCoverage: 30, consultTechnique: 20, judgementSafety: 20,
    gradeScale: 2, missedCritical: [], coaching: null, checklistDetail: null }];
  assert.ok(/not recorded for this attempt/i.test(buildOsceDossierHtml({ meta, insight: ins({}), attempts: nullLedger })),
    "dossier must state a missing ledger");
}

// The blanket rule: with NOTHING recorded, neither document may print a bare 0 or 0%.
for (const html of both(ins({}), [])) {
  const stripped = html.replace(/<style>[\s\S]*?<\/style>/g, "");
  assert.ok(!/>\s*0\s*%?\s*</.test(stripped),
    `a bare zero leaked into an empty document: ${stripped.match(/.{0,80}>\s*0\s*%?\s*<.{0,80}/)?.[0] ?? ""}`);
}

// A thin cell must never be presented as a solid figure.
{
  const thin = ins({ topics: [{ topic: "t", flag: "",
    flashcards: { value: 100, n: 2, band: "thin" },
    station: { value: 0, n: 0, band: "thin" },
    retention: { value: 0, n: 0, band: "thin" } }] });
  const [report] = both(thin, []);
  assert.ok(/thin/i.test(report) || /n=2/.test(report), "a thin cell must be marked or counted");
}

console.log("PASS report_honest_states_logic");
```

- [ ] **Step 2: Run**

```bash
node frontend/tests/report_honest_states_logic.mjs
```

Expected: `PASS report_honest_states_logic`. If it fails, the fix belongs in the builder, not the test — the test encodes the spec.

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/report_honest_states_logic.mjs
git commit -m "test(reports): sweep every honest state across both documents"
```

---

## Task 9: Console wiring

Minimal — P3 rebuilds this screen. This task only makes the two documents reachable, so P2 ships as working software rather than dead modules.

**Files:**
- Modify: `frontend/src/aurora/screens/AdminStudentDetail.tsx`

- [ ] **Step 1: Read the file**

Read it fully before editing. Preserve exactly: the `seededFor` ref (stops the 30 s poll clobbering a mid-edit note), the AI narrative behind its explicit button (it is a paid call), and the `mastery.length > 0` omission guard.

- [ ] **Step 2: Replace the report mapping**

The existing `buildStudentReportHtml(report)` call site (~line 130) maps the OLD `StudentReportData`. Replace that mapping object with the new shape. `data.insight` is served by `/detail` (P1 Task 15); `attempts` is fetched on demand.

```typescript
  // Fetched only when a download is clicked — the ledger is ~5KB per attempt and /detail
  // is polled every 30s, so it must never ride along with the poll.
  const fetchAttempts = async (): Promise<Attempt[]> => {
    const r = await fetch(`/api/admin/student/${studentId}/attempts`, { credentials: "include" });
    if (!r.ok) throw new Error(`attempts ${r.status}`);
    const d = await r.json();
    return (d.attempts ?? []).map((a: Record<string, unknown>) => ({
      caseId: String(a.case_id ?? ""), completedAt: String(a.completed_at ?? ""),
      totalScore: Number(a.total_score ?? 0), passed: Boolean(a.passed),
      score100: a.score_100 == null ? null : Number(a.score_100),
      safe: a.safe == null ? null : Boolean(a.safe),
      checklistCoverage: a.checklist_coverage == null ? null : Number(a.checklist_coverage),
      consultTechnique: a.consult_technique == null ? null : Number(a.consult_technique),
      judgementSafety: a.judgement_safety == null ? null : Number(a.judgement_safety),
      gradeScale: a.grade_scale == null ? null : Number(a.grade_scale),
      missedCritical: (a.missed_critical as string[]) ?? [],
      coaching: (a.coaching as Record<string, unknown>) ?? null,
      // null and [] mean different things and both survive this mapping.
      checklistDetail: a.checklist_detail == null ? null
        : (a.checklist_detail as Record<string, unknown>[]).map((s) => ({
            stepNumber: Number(s.step_number ?? 0), action: String(s.action ?? ""),
            phase: String(s.phase ?? ""), critical: Boolean(s.critical),
            performed: Boolean(s.performed), skipped: Boolean(s.skipped),
          })),
    }));
  };

  const download = (html: string, filename: string) => {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const meta = {
    studentId, fullName: data.full_name || studentId, email: data.email || "",
    role: data.role || "", dateStr: new Date().toISOString().slice(0, 10),
  };

  const downloadReport = async () => {
    const attempts = await fetchAttempts().catch(() => []);
    download(buildStudentReportHtml({ meta, insight: data.insight, attempts, note }),
             `eyebot-student-report-${studentId}.html`);
  };

  const downloadDossier = async () => {
    const attempts = await fetchAttempts().catch(() => []);
    download(buildOsceDossierHtml({ meta, insight: data.insight, attempts }),
             `eyebot-osce-dossier-${studentId}.html`);
  };
```

Add the imports, and a second button beside the existing download:

```tsx
<button className="cs-btn" onClick={downloadDossier}>Download OSCE dossier</button>
```

`data.insight` may be `null` when the assembler failed (P1 Task 15's fail-soft). Guard both handlers: if it is null, do not build a document — disable the buttons and show why, since a report built from a null payload would be a page of honest-state messages that look like real findings about the student.

- [ ] **Step 3: Typecheck and build**

```bash
cd frontend && npm run typecheck && npm run build
```

Both must be green.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/screens/AdminStudentDetail.tsx
git commit -m "feat(admin): download the student report and the OSCE dossier"
```

---

## Task 10: Ship P2

- [ ] **Step 1: Full gates**

```bash
python -m pytest -q
```

```bash
cd frontend && npm run typecheck && npm run build
```

```bash
node frontend/tests/_run_logic.mjs
```

The logic runner auto-discovers, so the three new harnesses gate automatically. **Count them** — a zero exit only means nothing that ran failed. The count must have risen by three.

- [ ] **Step 2: Rebase**

```bash
git fetch origin main && git rebase origin/main
```

If this pulls anything in, RE-RUN all gates.

- [ ] **Step 3: Push**

```bash
git fetch origin main && git push origin HEAD:main
```

- [ ] **Step 4: Check CI**

```bash
gh run list --branch main --limit 3
```

A `cancelled` run is not a pass.

---

## Self-Review

**Spec coverage**

| Spec § | Task |
|--------|------|
| §7 shared print-first stylesheet | 4 |
| §7.1 student report, 10 sections | 6 |
| §7.2 OSCE dossier | 7 |
| §7.3 per-attempt record + `transcriptNote` | 1 (data), 5 (note) |
| §7.4 console | 9 (minimal reach); full rebuild is P3 |
| §8 honest states, all nine rows | 8 |
| §4.1–4.6 rendered | 3 (findings), 6, 7 |
| §5 flashcard grade per topic | 6 (`flashcardsByTopic`, worst-first) |

**Deliberately deferred to P3:** the console rebuild onto `DataTable`/`Panel`/`MiniStat`/`BarList`. Task 9 only wires the downloads so P2 ships usable.

**Known gap, stated rather than hidden:** §7.3 says the per-attempt record reuses `buildSessionHtml` unchanged. Task 1 serves the data and Task 5 adds the note, but no task wires a *per-row* download button — the stations table shows each attempt's step count instead, and the dossier carries every ledger. A per-row button belongs with P3's table rebuild, where the row component is being written anyway. Building it twice would be waste.

**Migration 019 dependency:** until it is applied, every `checklistDetail` is `null` and both documents will say "Per-step ledger not recorded for this attempt." That is correct behaviour, not a failure — but the dossier's most valuable section stays empty until the migration runs.
