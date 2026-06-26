# Tangible, Adaptive OSCE Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the OSCE Station-100 score adaptive and tangible — rename the three buckets to plain-English item-traceable labels, redefine Technique as procedure-execution only, and drop it (reweighting 50/50) on conversation-only cases that have no manual procedures.

**Architecture:** A pure scoring function (`compute_station_score`) gains a `has_manual` flag that switches the bucket caps between 40/30/30 (manual) and 50/0/50 (conversation-only) and reports the caps + an `technique_applies` flag back. The submit endpoint derives `has_manual` from the same manual/verbal action classification that already governs whether the action panel renders, and passes the new fields through to the client. The results UI becomes data-driven so it relabels the buckets and hides the Technique card when it does not apply.

**Tech Stack:** Python 3.12 (pytest, FastAPI/Pydantic), Next.js 16 / React 19 / TypeScript.

Spec: [docs/superpowers/specs/2026-06-26-tangible-osce-scoring-design.md](../specs/2026-06-26-tangible-osce-scoring-design.md)

---

### Task 1: Adaptive bucket scoring in `compute_station_score`

**Files:**
- Modify: `tools/cases/station_score.py`
- Test: `tests/cases/test_station_score.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/cases/test_station_score.py`:

```python
def test_conversation_only_drops_technique_and_reweights_50_50():
    s = compute_station_score(FULL, STEPS, performed=[1, 2, 3, 4], has_manual=False)
    assert s["technique_applies"] is False
    assert s["technique"] == 0
    assert s["technique_max"] == 0
    assert s["thoroughness_max"] == 50
    assert s["judgment_max"] == 50
    assert s["thoroughness"] == 50
    assert s["judgment"] == 50
    assert s["score_100"] == 100


def test_conversation_only_coverage_alone_caps_at_50():
    zero = {"history": 0, "investigations": 0, "diagnosis": 0, "management": 0}
    s = compute_station_score(zero, STEPS, performed=[1, 2, 3, 4], has_manual=False)
    assert s["score_100"] == 50  # thoroughness reweighted to /50, no technique/judgment


def test_technique_tracks_investigations_not_history():
    domains = {"history": 0, "investigations": 10, "diagnosis": 0, "management": 0}
    s = compute_station_score(domains, STEPS, performed=[1, 2, 3, 4], has_manual=True)
    assert s["thoroughness"] == 40
    assert s["technique"] == 30
    assert s["judgment"] == 0
    assert s["score_100"] == 70


def test_manual_case_exposes_default_maxes():
    s = compute_station_score(FULL, STEPS, performed=[1, 2, 3, 4])  # has_manual defaults True
    assert s["technique_applies"] is True
    assert (s["thoroughness_max"], s["technique_max"], s["judgment_max"]) == (40, 30, 30)
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `python -m pytest tests/cases/test_station_score.py -q -k "conversation_only or investigations_not_history or default_maxes"`
Expected: FAIL — `KeyError: 'technique_applies'` (and `compute_station_score()` got an unexpected keyword argument `has_manual`).

- [ ] **Step 3: Rewrite `compute_station_score` to be adaptive**

In `tools/cases/station_score.py`, replace the whole `compute_station_score` function body. The signature gains `has_manual: bool = True`; the bucket caps become variables; `technique` drops the `history` term and tracks `investigations` only; four new keys are returned.

Replace this exact block:

```python
def compute_station_score(domain_scores: dict, steps: list[dict], performed) -> dict:
    """Return the Station-100 score dict from LLM domain scores + checklist coverage.

    Args:
        domain_scores: {"history","investigations","diagnosis","management"} each 0-10.
        steps:         resolved checklist steps ({step_number, action, critical}).
        performed:     step numbers the student ticked.
    """
    performed_set = {int(n) for n in (performed or [])}
```

with:

```python
def compute_station_score(domain_scores: dict, steps: list[dict], performed,
                          has_manual: bool = True) -> dict:
    """Return the Station-100 score dict from LLM domain scores + checklist coverage.

    Args:
        domain_scores: {"history","investigations","diagnosis","management"} each 0-10.
        steps:         resolved checklist steps ({step_number, action, critical}).
        performed:     step numbers the student ticked.
        has_manual:    True if the case has hands-on procedures. When False the
                       Technique bucket is removed and its 30 points split 50/50
                       across Steps-completed and Judgement & safety.
    """
    performed_set = {int(n) for n in (performed or [])}
```

Then replace this exact block:

```python
    thoroughness = round(40 * earned / possible) if possible else 0

    h = int(domain_scores.get("history", 0))
    inv = int(domain_scores.get("investigations", 0))
    technique = round(30 * (h + inv) / 20)

    dia = int(domain_scores.get("diagnosis", 0))
    mng = int(domain_scores.get("management", 0))
    safe = not missed_critical
    gate = 1.0 if safe else SAFETY_CAP
    judgment = round(30 * (dia + mng) / 20 * gate)
```

with:

```python
    # Adaptive caps: Technique (procedure execution) only applies when the case
    # has manual procedures; otherwise its 30 points split 50/50 across the other
    # two buckets (Steps completed -> 50, Judgement & safety -> 50).
    if has_manual:
        thoroughness_max, technique_max, judgment_max = 40, 30, 30
    else:
        thoroughness_max, technique_max, judgment_max = 50, 0, 50

    thoroughness = round(thoroughness_max * earned / possible) if possible else 0

    # Technique = procedure-execution quality only (the investigations domain).
    # History-taking quality lives in Steps-completed (the questions are ticked
    # steps) + Judgement, so it is no longer blended into Technique here.
    inv = int(domain_scores.get("investigations", 0))
    technique = round(technique_max * inv / 10) if technique_max else 0

    dia = int(domain_scores.get("diagnosis", 0))
    mng = int(domain_scores.get("management", 0))
    safe = not missed_critical
    gate = 1.0 if safe else SAFETY_CAP
    judgment = round(judgment_max * (dia + mng) / 20 * gate)
```

Finally, replace this exact block (the return dict tail):

```python
        "total_score": round(score_100 * 0.4),
        "critical_hit": crit_done,
        "critical_total": crit_total,
    }
```

with:

```python
        "total_score": round(score_100 * 0.4),
        "critical_hit": crit_done,
        "critical_total": crit_total,
        "technique_applies": has_manual,
        "thoroughness_max": thoroughness_max,
        "technique_max": technique_max,
        "judgment_max": judgment_max,
    }
```

- [ ] **Step 4: Run the full scoring test file to verify pass (new + existing)**

Run: `python -m pytest tests/cases/test_station_score.py -q`
Expected: PASS — all tests, including the unchanged `test_perfect_score_is_100_and_exam_ready`, `test_safety_gate_caps_judgment_and_flags_missed_critical`, and `test_pass_line_60_maps_to_24_over_40` (these use the `has_manual=True` default and all-10 or all-0 domains, so their assertions are unaffected by dropping the `history` term from Technique).

- [ ] **Step 5: Commit**

```bash
git add tools/cases/station_score.py tests/cases/test_station_score.py
git commit -m "feat(osce): adaptive Station-100 buckets (technique conditional on manual procedures)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `has_manual_actions` helper

**Files:**
- Modify: `tools/cases/examination_actions.py`
- Test: `tests/cases/test_examination_actions.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/cases/test_examination_actions.py` (ensure `has_manual_actions` is imported — add it to the existing `from tools.cases.examination_actions import ...` line):

```python
def test_has_manual_actions_true_for_procedure_steps():
    steps = [
        {"step_number": 1, "action": "Introduce yourself to the patient", "critical": False},
        {"step_number": 2, "action": "Measure IOP with the non-contact tonometer", "critical": True},
    ]
    assert has_manual_actions({}, steps) is True


def test_has_manual_actions_false_for_all_verbal_steps():
    steps = [
        {"step_number": 1, "action": "Introduce yourself to the patient", "critical": True},
        {"step_number": 2, "action": "Ask the patient about onset and duration", "critical": False},
        {"step_number": 3, "action": "Take consent before proceeding", "critical": False},
    ]
    assert has_manual_actions({}, steps) is False
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `python -m pytest tests/cases/test_examination_actions.py -q -k has_manual`
Expected: FAIL — `ImportError: cannot import name 'has_manual_actions'`.

- [ ] **Step 3: Add the helper**

In `tools/cases/examination_actions.py`, add this function at the end of the file (after `build_actions`):

```python
def has_manual_actions(examination_findings: dict, steps: list[dict]) -> bool:
    """True if any resolved checklist step is a hands-on (manual) procedure.

    Reuses build_actions' manual/verbal classification, so "no action panel" and
    "no Technique bucket" stay perfectly in sync.
    """
    return any(a["kind"] == "manual" for a in build_actions(examination_findings, steps))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest tests/cases/test_examination_actions.py -q`
Expected: PASS — the new tests plus all existing examination-action tests.

- [ ] **Step 5: Commit**

```bash
git add tools/cases/examination_actions.py tests/cases/test_examination_actions.py
git commit -m "feat(osce): has_manual_actions helper (procedure vs conversation-only)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wire `has_manual` through the submit endpoint

**Files:**
- Modify: `tools/api/routers/cases.py`
- Test: `tests/cases/test_station_endpoints.py` (existing; must stay green)

- [ ] **Step 1: Import the helper**

In `tools/api/routers/cases.py`, change the existing import line:

```python
from tools.cases.examination_actions import build_actions
```

to:

```python
from tools.cases.examination_actions import build_actions, has_manual_actions
```

- [ ] **Step 2: Add the four new fields to the `DomainScore` response model**

In `tools/api/routers/cases.py`, find the `DomainScore` model and the block ending:

```python
    safe: bool = True
    missed_critical: list[str] = []
    thoroughness_detail: str = ""
```

Append the four new fields immediately after `thoroughness_detail`:

```python
    safe: bool = True
    missed_critical: list[str] = []
    thoroughness_detail: str = ""
    technique_applies: bool = True
    thoroughness_max: int = 40
    technique_max: int = 30
    judgment_max: int = 30
```

- [ ] **Step 3: Compute `has_manual` and pass it into the scorer**

In `case_submit`, find this exact call:

```python
    score = compute_station_score(
        {
            "history": raw_result.get("history_score", 0),
            "investigations": raw_result.get("investigations_score", 0),
            "diagnosis": raw_result.get("diagnosis_score", 0),
            "management": raw_result.get("management_score", 0),
        },
        _cl_compare.get("steps", []),
        body.performed_steps,
    )
```

Replace it with:

```python
    # The Technique bucket only applies when the case has manual procedures — use
    # the same classification that decides whether the action panel renders.
    has_manual = has_manual_actions(
        case.get("examination_findings", {}), _cl_compare.get("steps", [])
    )
    score = compute_station_score(
        {
            "history": raw_result.get("history_score", 0),
            "investigations": raw_result.get("investigations_score", 0),
            "diagnosis": raw_result.get("diagnosis_score", 0),
            "management": raw_result.get("management_score", 0),
        },
        _cl_compare.get("steps", []),
        body.performed_steps,
        has_manual,
    )
```

- [ ] **Step 4: Surface the new fields in the response**

In `case_submit`, find the `domain_fields.update({...})` block and add the four keys to it. Locate:

```python
        "missed_critical": score["missed_critical"],
        "thoroughness_detail": score["thoroughness_detail"],
        "critical_hit": score["critical_hit"],
        "critical_total": score["critical_total"],
    })
```

Replace with:

```python
        "missed_critical": score["missed_critical"],
        "thoroughness_detail": score["thoroughness_detail"],
        "critical_hit": score["critical_hit"],
        "critical_total": score["critical_total"],
        "technique_applies": score["technique_applies"],
        "thoroughness_max": score["thoroughness_max"],
        "technique_max": score["technique_max"],
        "judgment_max": score["judgment_max"],
    })
```

- [ ] **Step 5: Run the endpoint + submit tests to verify they pass**

Run: `python -m pytest tests/cases/test_station_endpoints.py tests/cases/test_submit_per_phase.py -q`
Expected: PASS — submit still returns a valid `DomainScore`; the new fields carry defaults/computed values and break nothing.

- [ ] **Step 6: Run the full backend suite (CI parity)**

Run: `python -m pytest -q`
Expected: PASS — full suite green (`MOCK_MODE` auto-enabled with no `GEMINI_API_KEY`).

- [ ] **Step 7: Commit**

```bash
git add tools/api/routers/cases.py
git commit -m "feat(osce): submit derives has_manual and returns adaptive bucket caps

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Data-driven, relabeled results UI

**Files:**
- Modify: `frontend/src/aurora/screens/CaseSession.tsx`
- Modify: `frontend/tests/station_assert.mjs` (mock parity)

- [ ] **Step 1: Extend the `DomainResult` type**

In `frontend/src/aurora/screens/CaseSession.tsx`, find:

```tsx
  score_100: number; verdict: string; thoroughness: number; technique: number; judgment: number;
  safe: boolean; missed_critical: string[]; thoroughness_detail: string;
}
```

Replace with:

```tsx
  score_100: number; verdict: string; thoroughness: number; technique: number; judgment: number;
  safe: boolean; missed_critical: string[]; thoroughness_detail: string;
  technique_applies: boolean; thoroughness_max: number; technique_max: number; judgment_max: number;
}
```

- [ ] **Step 2: Remove the hardcoded `COMPONENTS` array**

Find and delete this exact block:

```tsx
const COMPONENTS: { key: "thoroughness" | "technique" | "judgment"; label: string; max: number; sub: string }[] = [
  { key: "thoroughness", label: "Thoroughness", max: 40, sub: "Steps completed" },
  { key: "technique", label: "Technique", max: 30, sub: "History & examination" },
  { key: "judgment", label: "Judgment & safety", max: 30, sub: "Recognition & escalation" },
];
```

(Leave the `VERDICT_TONE` constant directly above it untouched.)

- [ ] **Step 3: Build the component list inside `StationResult` and render from it**

In `StationResult`, find:

```tsx
  const { ref, display } = useCountUp<HTMLSpanElement>(result.score_100, { format: (n) => String(Math.round(n)) });
  const tone = VERDICT_TONE[result.verdict] ?? "ok";
  const missedOne = result.missed_critical[0];
```

Insert the component list immediately after `const missedOne = ...`:

```tsx
  // Data-driven cards: Technique appears only when the case has manual procedures,
  // and each denominator comes from the score so the 40/30/30 (manual) vs
  // 50/–/50 (conversation-only) split renders correctly.
  const comps: { label: string; pts: number; max: number; sub: string }[] = [
    { label: "Steps completed", pts: result.thoroughness, max: result.thoroughness_max, sub: result.thoroughness_detail },
    ...(result.technique_applies
      ? [{ label: "Technique", pts: result.technique, max: result.technique_max, sub: "How well you performed the procedure(s)" }]
      : []),
    { label: "Clinical judgement & safety", pts: result.judgment, max: result.judgment_max, sub: "Spotting the problem, triage, escalation & handover" },
  ];
```

Then find the rendering block:

```tsx
      <div className="aurora-s100-comps">
        {COMPONENTS.map((c) => {
          const pts = result[c.key];
          return (
            <div key={c.key} className="aurora-s100-comp">
              <div className="aurora-s100-comp-top"><span>{c.label}</span><b>{pts}<small>/{c.max}</small></b></div>
              <div className="aurora-s100-bar"><div style={{ width: `${(pts / c.max) * 100}%` }} /></div>
              <span className="aurora-s100-comp-sub">{c.key === "thoroughness" ? result.thoroughness_detail : c.sub}</span>
            </div>
          );
        })}
      </div>
```

Replace with:

```tsx
      <div className="aurora-s100-comps">
        {comps.map((c) => (
          <div key={c.label} className="aurora-s100-comp">
            <div className="aurora-s100-comp-top"><span>{c.label}</span><b>{c.pts}<small>/{c.max}</small></b></div>
            <div className="aurora-s100-bar"><div style={{ width: `${c.max ? (c.pts / c.max) * 100 : 0}%` }} /></div>
            <span className="aurora-s100-comp-sub">{c.sub}</span>
          </div>
        ))}
      </div>
```

- [ ] **Step 4: Update the test-harness mock for field parity**

In `frontend/tests/station_assert.mjs`, find the mocked submit body:

```js
    score_100: 78, verdict: "Solid", thoroughness: 31, technique: 24, judgment: 23,
    safe: true, missed_critical: [], thoroughness_detail: "5 of 6 steps · all 2 critical done",
```

Replace with (C001 is a manual-procedure case, so Technique applies):

```js
    score_100: 78, verdict: "Solid", thoroughness: 31, technique: 24, judgment: 23,
    safe: true, missed_critical: [], thoroughness_detail: "5 of 6 steps · all 2 critical done",
    technique_applies: true, thoroughness_max: 40, technique_max: 30, judgment_max: 30,
```

- [ ] **Step 5: Typecheck and build to verify**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS — no TypeScript errors; production build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/aurora/screens/CaseSession.tsx frontend/tests/station_assert.mjs
git commit -m "feat(osce): relabeled, data-driven result cards; Technique hidden when N/A

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Full verification + station harness

**Files:** none (verification only)

- [ ] **Step 1: Full backend suite (CI parity)**

Run: `python -m pytest -q`
Expected: PASS — all backend tests green.

- [ ] **Step 2: Frontend gate**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Station visual harness (optional but recommended)**

Per the harness note in CLAUDE.md / memory: build the standalone server, copy `.next/static` + `public` into `.next/standalone`, run `node .next/standalone/server.js`, warm the dynamic `/case/...` route with an authed request, then:

Run: `node frontend/tests/station_assert.mjs`
Expected: PASS — the result panel still shows the verdict and (for the manual C001 mock) the relabeled "Steps completed" / "Technique" / "Clinical judgement & safety" cards.

- [ ] **Step 4: Final review against the spec**

Confirm: Technique disappears on conversation-only cases (verified by Task 1 tests + the `technique_applies` flag), the action panel is unchanged (already conditional), no DB migration was introduced, and pass-line/verdict behavior is intact.

---

## Notes for the implementer

- **Why existing scoring tests still pass:** they use either all-10 or all-0 domain scores with the default `has_manual=True`. Dropping the `history` term from Technique only changes results when `history != investigations`, which none of the existing assertions exercise.
- **No grader/prompt changes:** `evaluate_case` and the rubric prompts still produce all four domain scores + feedback; only the recombination in `station_score.py` changed. History feedback is still generated for coaching.
- **Do not delete the `StationChecklist` pane or touch `ActionPalette`** — the action panel already returns `null` when there are no manual chips, and the checklist pane is the source of the Steps-completed bucket.
