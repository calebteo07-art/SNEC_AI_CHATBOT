# OSCE Manual-Only Shortcuts + Procedure Box + Handover Popup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make only manual procedures (hand hygiene, VA, IOP, slit-lamp…) palette shortcuts that require typing the technique before they tick; keep history/verbal steps in the live chat; blend the palette into the composer; and move the handover + debrief out of the chat thread into a spring-in motion overlay with **Findings** / **Next steps** fields.

**Architecture:** Backend tags each palette action with `kind: "manual" | "verbal"` (`examination_actions.py`); the frontend renders only `manual` chips. Clicking a chip switches the bottom composer into "procedure mode" — the student types the steps/rules, Confirm posts a reveal note (technique + finding) that ticks the step and is graded via the existing transcript. The handover form + `StationResult` move from the message thread into a fixed overlay that scales/fades in. The station palette root class is renamed to stop it inheriting the unrelated command-palette modal box.

**Tech Stack:** Python (FastAPI, pytest), Next.js/React (TypeScript), Playwright harness (`station_assert.mjs`), CSS (aurora design tokens, CSS-only motion).

**Spec:** `docs/superpowers/specs/2026-06-24-osce-manual-shortcuts-handover-popup-design.md`

---

## File Structure

- `tools/cases/examination_actions.py` — add `kind` to every action (classify by resolved label).
- `tests/cases/test_examination_actions.py` — assert `kind` (verbal vs manual), keep coverage + merge.
- `tests/cases/test_station_endpoints.py` — assert `kind` on the passed-through actions.
- `frontend/src/aurora/components/ActionPalette.tsx` — render `manual` only; rename root class; quiet caption; no phase groups; `kind` + `activeKey` in the contract.
- `frontend/src/aurora/screens/CaseSession.tsx` — `activeProcedure`/`procText` state; procedure-mode composer; richer reveal renderer; handover/debrief overlay; relabel fields.
- `frontend/src/aurora/aurora.css` — quiet `.aurora-protray*` palette, `.aurora-station-proc*` composer caption, `.aurora-station-overlay*` + spring motion.
- `frontend/tests/station_assert.mjs` — manual-only palette + procedure-confirm flow + overlay handover assertions.
- `frontend/tests/_mocks.mjs` — add `kind` to the station mock actions.

---

## Task 1: Backend — tag palette actions with `kind` (manual/verbal)

**Files:**
- Modify: `tools/cases/examination_actions.py`
- Test: `tests/cases/test_examination_actions.py`, `tests/cases/test_station_endpoints.py`

- [ ] **Step 1: Rewrite `tests/cases/test_examination_actions.py` with `kind` assertions**

Replace the **entire** file contents with:

```python
from tools.cases.examination_actions import build_actions

STEPS = [
    {"step_number": 1, "action": "Introduce self to patient", "category": "patient_education", "critical": False},
    {"step_number": 2, "action": "Identify the correct patient and check identity against 2 identifiers", "category": "patient_identification", "critical": True},
    {"step_number": 3, "action": "Performing 5 moments of hand hygiene", "category": "infection_control", "critical": True},
    {"step_number": 4, "action": "Before touching a patient", "category": "infection_control", "critical": True},
    {"step_number": 5, "action": "After touching a patient", "category": "infection_control", "critical": True},
    {"step_number": 6, "action": "Measure distance visual acuity with LogMAR", "category": "clinical_assessment", "critical": False},
    {"step_number": 7, "action": "Ask about patient complaints: Any trauma to the eye?", "category": "clinical_assessment", "critical": False},
]


def test_all_steps_still_covered_nothing_dropped():
    # build_actions still emits one (merged) action per step — the FRONTEND filters
    # to manual; the backend keeps the full set so the data model loses nothing.
    actions = build_actions({}, STEPS)
    covered = set()
    for a in actions:
        covered.update(a["satisfies_steps"])
    assert covered == {1, 2, 3, 4, 5, 6, 7}


def test_history_question_is_verbal_with_prompt():
    actions = build_actions({}, STEPS)
    ask = next(a for a in actions if a["mode"] == "say")
    assert ask["kind"] == "verbal"
    assert ask["prompt_text"] == "Any trauma to the eye?"
    assert 7 in ask["satisfies_steps"]


def test_conversational_do_steps_are_verbal():
    by_label = {a["label"]: a for a in build_actions({}, STEPS)}
    assert by_label["Introduce self"]["kind"] == "verbal"
    assert by_label["Identify patient"]["kind"] == "verbal"


def test_manual_procedures_are_manual():
    by_label = {a["label"]: a for a in build_actions({}, STEPS)}
    assert by_label["Hand hygiene"]["kind"] == "manual"
    assert by_label["Test distance VA"]["kind"] == "manual"


def test_hand_hygiene_steps_merge_into_one_manual_chip():
    actions = build_actions({}, STEPS)
    hh = next(a for a in actions if a["label"] == "Hand hygiene")
    assert set(hh["satisfies_steps"]) == {3, 4, 5}
    assert hh["kind"] == "manual"


def test_exam_step_reveals_finding_and_is_manual():
    actions = build_actions({"va": {"right": "6/9", "left": "6/12"}}, STEPS)
    va = next(a for a in actions if 6 in a["satisfies_steps"])
    assert "6/9" in va["reveal_text"] and "6/12" in va["reveal_text"]
    assert va["kind"] == "manual"


def test_unknown_do_step_defaults_to_manual():
    actions = build_actions({}, [{"step_number": 9, "action": "Calibrate the widget array", "category": "equipment", "critical": False}])
    assert actions[0]["kind"] == "manual"


def test_blank_action_is_skipped():
    actions = build_actions({}, [{"step_number": 9, "action": "  ", "category": "clinical_", "critical": False}])
    assert actions == []
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/cases/test_examination_actions.py -q`
Expected: FAIL — `KeyError: 'kind'` (the actions dict has no `kind` yet).

- [ ] **Step 3: Add the `kind` classification to `examination_actions.py`**

In `tools/cases/examination_actions.py`, add this constant immediately after the `_ASK_PREFIXES` line (around line 74):

```python
# Patient-directed / verbal labels stay in the live chat (no shortcut chip). Any
# non-"say" step whose label is NOT in this set is a hands-on manual procedure and
# becomes a shortcut; unknown "do" steps therefore default to manual (still completable).
_VERBAL_LABELS = {
    "Introduce self", "Identify patient", "Confirm name", "Confirm NRIC / DOB",
    "Check allergy", "Check doctor's order", "Explain procedure", "Take consent",
    "Patient comfortable", "Listen actively", "Instruct patient", "Doctor to examine",
}
```

Then in `build_actions`, replace the per-step chip construction (the `if _is_say(action): … else: …` block, currently lines 136–145) with:

```python
        if _is_say(action):
            prompt = _say_prompt(action)
            chip = {"label": _say_label(prompt), "mode": "say", "reveal_text": "", "prompt_text": prompt, "kind": "verbal"}
        else:
            label = _do_label(action, str(s.get("category", "")))
            chip = {
                "label": label,
                "mode": "do",
                "reveal_text": _finding_for_step(action, examination_findings),
                "prompt_text": "",
                "kind": "verbal" if label in _VERBAL_LABELS else "manual",
            }
```

(The merge loop is unchanged: merged chips share a label, so they share a `kind`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest tests/cases/test_examination_actions.py -q`
Expected: PASS (8 passed).

- [ ] **Step 5: Extend the station-endpoint test to assert `kind`**

In `tests/cases/test_station_endpoints.py`, inside `test_station_returns_phases_and_actions`, after the existing line `assert iop["mode"] == "do"` (line 47), add:

```python
    assert iop["kind"] == "manual"
    ident = next(a for a in data["examination_actions"] if 1 in a["satisfies_steps"])
    assert ident["kind"] == "verbal"  # "Identify patient name NRIC" → verbal, stays in chat
```

- [ ] **Step 6: Run the station-endpoint tests**

Run: `python -m pytest tests/cases/test_station_endpoints.py -q`
Expected: PASS (3 passed).

- [ ] **Step 7: Commit**

```bash
git add tools/cases/examination_actions.py tests/cases/test_examination_actions.py tests/cases/test_station_endpoints.py
git commit -m "feat(station): tag palette actions kind=manual|verbal (history stays in chat)"
```

---

## Task 2: Frontend — manual-only quiet palette + procedure-mode composer

**Files:**
- Modify: `frontend/src/aurora/components/ActionPalette.tsx` (rewrite)
- Modify: `frontend/src/aurora/screens/CaseSession.tsx` (state, `performAction`, reveal renderer, composer area)
- Modify: `frontend/src/aurora/aurora.css` (rename palette root, add procedure-mode CSS)

> Frontend verification is the Playwright harness (Task 4) — it needs a build, so we don't run it per-step here. Use `npm run typecheck` after edits as the fast local check.

- [ ] **Step 1: Rewrite `ActionPalette.tsx` to render only manual chips, no phase groups**

Replace the **entire** file `frontend/src/aurora/components/ActionPalette.tsx` with:

```tsx
"use client";
/* ActionPalette — the quiet "manual procedures" strip above the composer. Only
   hands-on procedures (hand hygiene, VA, IOP, slit-lamp…) appear here; everything
   verbal (history, intro, consent…) is typed in the live consult and auto-ticked
   by the examiner. Clicking a chip does NOT auto-complete the step — the parent
   switches the composer into "procedure mode" where the student types the technique
   before it ticks. Presentational — all state is owned by the parent. */

export interface ExamAction {
  key: string;
  label: string;
  reveal_text: string;
  satisfies_steps: number[];
  mode: "do" | "say";
  prompt_text: string;
  phase: number;
  critical: boolean;
  step_number: number;
  kind: "manual" | "verbal";
}

export function ActionPalette({
  actions,
  ticked,
  activeKey,
  onPerform,
}: {
  actions: ExamAction[];
  ticked: Set<number>;
  activeKey: string | null;
  onPerform: (action: ExamAction) => void;
}) {
  const manual = actions.filter((a) => a.kind === "manual");
  if (manual.length === 0) return null;
  return (
    <div className="aurora-protray">
      <span className="aurora-protray-cap">Manual procedures · click one, then type your technique</span>
      <div className="aurora-protray-chips">
        {manual.map((a) => {
          const done = a.satisfies_steps.some((n) => ticked.has(n));
          const active = a.key === activeKey;
          return (
            <button
              key={a.key}
              type="button"
              className="aurora-pchip"
              data-done={done ? "true" : "false"}
              data-active={active ? "true" : "false"}
              data-crit={a.critical ? "true" : "false"}
              disabled={done}
              onClick={() => onPerform(a)}
              aria-label={done ? `${a.label} — done` : `Perform ${a.label}`}
              title={a.reveal_text || a.label}
            >
              <span className="ic" aria-hidden>{done ? "✓" : active ? "✎" : "+"}</span>
              {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add procedure-mode state to `CaseSession.tsx`**

In `frontend/src/aurora/screens/CaseSession.tsx`, after the line `const [input, setInput] = useState("");` (line 58), add:

```tsx
  const [activeProcedure, setActiveProcedure] = useState<ExamAction | null>(null);
  const [procText, setProcText] = useState("");
```

- [ ] **Step 3: Replace `performAction` with the procedure-mode entry + add confirm/cancel**

In `CaseSession.tsx`, replace the whole `performAction` function (currently lines 204–217, the comment block + function) with:

```tsx
  // Clicking a manual chip switches the bottom composer into "procedure mode": the
  // student must type the steps/rules before the step ticks. Already-ticked → no-op.
  const performAction = (a: ExamAction) => {
    if (a.satisfies_steps.some((n) => tickedRef.current.has(n))) return;
    setActiveProcedure(a);
    setProcText("");
  };

  // Confirm the typed technique: post one reveal note (technique + finding) so the
  // step ticks, the finding shows, and the grader sees the technique in the transcript.
  const confirmProcedure = () => {
    const a = activeProcedure;
    const steps = procText.trim();
    if (!a || steps.length < 12) return;
    const result = a.reveal_text ? ` · Result: ${a.reveal_text}` : "";
    setMessages((prev) => [...prev, { role: "user", content: `${EXAM_PREFIX}${a.label} → ${steps}${result}]` }]);
    addAuto(a.satisfies_steps);
    setActiveProcedure(null);
    setProcText("");
    scheduleObserve();
  };

  const cancelProcedure = () => { setActiveProcedure(null); setProcText(""); };
```

- [ ] **Step 4: Upgrade the reveal renderer to show technique + result distinctly**

In `CaseSession.tsx`, replace the `if (m.role === "user" && m.content.startsWith(EXAM_PREFIX))` block (currently lines 323–332) with:

```tsx
              if (m.role === "user" && m.content.startsWith(EXAM_PREFIX)) {
                const inner = m.content.slice(EXAM_PREFIX.length, -1); // strip prefix + trailing "]"
                const arrow = inner.indexOf(" → ");
                const label = arrow >= 0 ? inner.slice(0, arrow) : inner;
                const body = arrow >= 0 ? inner.slice(arrow + 3) : "";
                const sep = " · Result: ";
                const cut = body.indexOf(sep);
                const technique = cut >= 0 ? body.slice(0, cut) : body;
                const resultText = cut >= 0 ? body.slice(cut + sep.length) : "";
                return (
                  <div key={i} className="aurora-station-reveal">
                    <span className="rl2">Examination performed · {label}</span>
                    {technique && <div className="v">{technique}</div>}
                    {resultText && <div className="rs">Result · {resultText}</div>}
                  </div>
                );
              }
```

- [ ] **Step 5: Replace the composer block with palette + procedure-mode / chat switch**

In `CaseSession.tsx`, replace the `{station && !result && ( … )}` block that renders `<ActionPalette … />` + `<div className="aurora-station-composer">…` (currently lines 366–376) with:

```tsx
          {station && !result && (
            <>
              <ActionPalette actions={station.examination_actions} ticked={ticked} activeKey={activeProcedure?.key ?? null} onPerform={performAction} />
              {activeProcedure ? (
                <div className="aurora-station-proc">
                  <div className="aurora-station-proc-cap">
                    <span><b>{activeProcedure.label}</b> — type the steps &amp; safety rules you'd follow</span>
                    <button type="button" className="aurora-station-proc-x" onClick={cancelProcedure}>Cancel</button>
                  </div>
                  <div className="aurora-station-composer">
                    <textarea
                      className="aurora-station-composer-input aurora-station-proc-input"
                      value={procText}
                      onChange={(e) => setProcText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirmProcedure(); } }}
                      placeholder={`How you perform ${activeProcedure.label.toLowerCase()} — key steps, what you tell the patient, safety checks…`}
                      rows={2}
                      autoFocus
                    />
                    <button type="button" className="aurora-station-composer-send aurora-station-proc-go" onClick={confirmProcedure} disabled={procText.trim().length < 12} aria-label="Log procedure">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="aurora-station-composer">
                  <textarea className="aurora-station-composer-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder="Talk to your patient…" rows={1} />
                  <button type="button" className="aurora-station-composer-send" onClick={() => sendMessage()} disabled={!input.trim() || sending || isStreaming} aria-label="Send">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </button>
                </div>
              )}
            </>
          )}
```

- [ ] **Step 6: Rename the station palette CSS + add procedure-mode styles**

In `frontend/src/aurora/aurora.css`, replace the station palette block (currently lines 2649–2661, the `/* … */`-free run starting `.aurora-palette { margin-top:6px; }` through `.aurora-pchip:disabled { cursor:default; }`) with:

```css
/* Manual-procedures tray — a quiet strip that blends into the composer cluster.
   (Renamed off `.aurora-palette` so it no longer inherits the command-palette modal box.) */
.aurora-protray { margin-top: 10px; }
.aurora-protray-cap { display:block; font-size:.72rem; color:var(--ink-3); margin:0 0 6px 2px; }
.aurora-protray-chips { display:flex; flex-wrap:wrap; gap:6px; max-height:120px; overflow-y:auto; }
.aurora-pchip { display:inline-flex; align-items:center; gap:5px; font-size:.78rem; padding:5px 11px; border-radius:999px; border:1px solid rgba(120,90,170,.22); background:rgba(255,255,255,.5); color:var(--ink-2); cursor:pointer; transition:transform .12s, background .2s, border-color .2s; }
.aurora-pchip:hover:not(:disabled) { transform:translateY(-1px); border-color:rgba(155,114,203,.55); color:var(--ink); }
.aurora-pchip .ic { font-weight:700; opacity:.55; }
.aurora-pchip[data-active="true"] { border-color:var(--g-blue); background:rgba(66,133,244,.1); color:var(--ink); }
.aurora-pchip[data-active="true"] .ic { opacity:1; color:var(--g-blue); }
.aurora-pchip[data-crit="true"]:not([data-done="true"]) { border-color:rgba(242,162,175,.5); }
.aurora-pchip[data-done="true"] { background:rgba(52,168,83,.18); border-color:transparent; color:var(--on-green); cursor:default; }
.aurora-pchip[data-done="true"] .ic { opacity:1; color:var(--on-green); }
.aurora-pchip:disabled { cursor:default; }

/* Procedure mode — the composer's "type your technique" state. Shares the composer
   row so nothing new "appears"; a soft caption sits above it. */
.aurora-station-proc { margin-top: 10px; }
.aurora-station-proc-cap { display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:.8rem; color:var(--ink-2); margin:0 0 6px 2px; }
.aurora-station-proc-cap b { color:var(--ink); }
.aurora-station-proc-x { border:none; background:none; color:var(--ink-3); font-size:.78rem; cursor:pointer; padding:2px 6px; border-radius:8px; }
.aurora-station-proc-x:hover { color:var(--ink); background:rgba(120,90,170,.1); }
.aurora-station-proc-go { background:linear-gradient(135deg, #34A853, #4285F4) !important; }
.aurora-station-proc-input { border-color:rgba(66,133,244,.4) !important; }
```

- [ ] **Step 7: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors. (Confirms the `ExamAction.kind` + `activeKey` prop changes are consistent.)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/aurora/components/ActionPalette.tsx frontend/src/aurora/screens/CaseSession.tsx frontend/src/aurora/aurora.css
git commit -m "feat(station): manual-only procedure shortcuts + type-the-technique composer"
```

---

## Task 3: Frontend — handover + debrief motion overlay + relabel fields

**Files:**
- Modify: `frontend/src/aurora/screens/CaseSession.tsx` (move form + result to an overlay; relabel; open-only toggle)
- Modify: `frontend/src/aurora/aurora.css` (overlay + spring motion)

- [ ] **Step 1: Make the aside button open the overlay (not toggle inline)**

In `CaseSession.tsx`, replace the submit-toggle button (currently lines 308–312) with:

```tsx
          {station && !result && (
            <button type="button" className="aurora-station-submit-toggle" onClick={() => setShowSubmit(true)}>
              Submit handover →
            </button>
          )}
```

- [ ] **Step 2: Remove the inline handover form + inline result from the thread**

In `CaseSession.tsx`, delete the inline `{showSubmit && !result && ( … )}` form block (currently lines 345–360) **and** the inline `{result && <StationResult … />}` line (currently line 362). Leave the `{messages.length === 0 && !result && …}` hint, the message map, the `{sending && …}` typing block, and `<div ref={endRef} />` intact.

- [ ] **Step 3: Add the overlay (form → debrief) at the station root**

In `CaseSession.tsx`, add this block immediately before the final closing `</div>` of the `aurora-station` wrapper (i.e. just before the last `</div>` that closes the `return`, after `</div>` of `.aurora-station-grid`):

```tsx
      {(showSubmit || result) && (
        <div className="aurora-station-overlay" role="dialog" aria-modal="true">
          <div className="aurora-station-overlay-scrim" onClick={() => { if (!result) setShowSubmit(false); }} aria-hidden />
          <div className="aurora-station-overlay-card">
            {!result ? (
              <div className="aurora-station-form">
                <button type="button" className="aurora-station-overlay-x" onClick={() => setShowSubmit(false)} aria-label="Close">✕</button>
                <p className="aurora-eyebrow">Handover</p>
                <p className="aurora-station-form-hint">You're documenting a handover — what you found and what you recommend, within your role. You don't make a medical diagnosis or prescribe treatment; that's for the doctor.</p>
                {uncheckedCritical.length > 0 && (
                  <p className="aurora-station-warn">⚠ {uncheckedCritical.length} critical step{uncheckedCritical.length !== 1 ? "s" : ""} not yet done</p>
                )}
                <label className="aurora-eyebrow">Findings</label>
                <textarea className="aurora-input" data-field="findings" value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="What you found and recognised — key history, test results, red-flag check…" rows={3} />
                <label className="aurora-eyebrow">Next steps</label>
                <textarea className="aurora-input" data-field="recommendation" value={recommendation} onChange={(e) => setRecommendation(e.target.value)} placeholder="Triage/urgency, who you'd escalate or refer to, and what you'd advise the patient…" rows={3} />
                {submitError && <p className="aurora-station-warn">{submitError}</p>}
                <button type="button" className="aurora-station-submit-go" disabled={submitting || !findings.trim() || !recommendation.trim()} onClick={handleSubmit}>
                  {submitting ? "Evaluating…" : "Submit handover →"}
                </button>
              </div>
            ) : (
              <StationResult result={result} coaching={coaching} onMore={() => router.push("/cases")} onDash={() => router.push("/dashboard")} />
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Add overlay + spring-motion CSS**

In `frontend/src/aurora/aurora.css`, append at the end of the file:

```css
/* Station wrap-up overlay — the handover + debrief lift out of the chat thread and
   spring in over the station. Surprise reveal; CSS-only motion. */
.aurora-station-overlay { position:fixed; inset:0; z-index:120; display:grid; place-items:center; padding:24px; }
.aurora-station-overlay-scrim { position:absolute; inset:0; background:rgba(31,31,31,.34); backdrop-filter:blur(3px); animation:aurora-scrim-in .26s ease both; }
.aurora-station-overlay-card {
  position:relative; z-index:1;
  width:min(560px, calc(100vw - 36px)); max-height:88vh; overflow-y:auto;
  background:var(--surface); border:1px solid var(--hairline); border-radius:var(--radius-xl);
  box-shadow:0 30px 80px -24px rgba(31,31,31,.45);
  padding:24px;
  animation:aurora-pop-in .42s cubic-bezier(.16,1,.3,1) both;
}
.aurora-station-overlay-x { position:absolute; top:12px; right:12px; border:none; background:none; color:var(--ink-3); font-size:1rem; cursor:pointer; line-height:1; padding:6px; border-radius:8px; }
.aurora-station-overlay-x:hover { color:var(--ink); background:rgba(120,90,170,.1); }
@keyframes aurora-scrim-in { from { opacity:0; } to { opacity:1; } }
@keyframes aurora-pop-in { from { opacity:0; transform:scale(.9) translateY(14px); } to { opacity:1; transform:scale(1) translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .aurora-station-overlay-scrim, .aurora-station-overlay-card { animation:none; }
}
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/aurora/screens/CaseSession.tsx frontend/src/aurora/aurora.css
git commit -m "feat(station): handover + debrief spring-in overlay; relabel Findings / Next steps"
```

---

## Task 4: Update the Playwright harness + mocks, build, and verify

**Files:**
- Modify: `frontend/tests/station_assert.mjs`
- Modify: `frontend/tests/_mocks.mjs`

- [ ] **Step 1: Add `kind` to the harness station mock**

In `frontend/tests/station_assert.mjs`, replace the `examination_actions: [ … ]` array (lines 38–45) with (only `kind` added; manual = IOP + VA + Document, verbal = Identify/Explain/Advise):

```js
  examination_actions: [
    { key: "s1", label: "Identify patient", reveal_text: "", satisfies_steps: [1], mode: "do", prompt_text: "", phase: 1, critical: true, step_number: 1, kind: "verbal" },
    { key: "s2", label: "Explain procedure", reveal_text: "", satisfies_steps: [2], mode: "do", prompt_text: "", phase: 1, critical: false, step_number: 2, kind: "verbal" },
    { key: "s3", label: "Measure IOP", reveal_text: "IOP (NCT) · avg of 3 → R 18 mmHg · L 20 mmHg", satisfies_steps: [3], mode: "do", prompt_text: "", phase: 2, critical: true, step_number: 3, kind: "manual" },
    { key: "s4", label: "Test distance VA", reveal_text: "Distance VA → R 6/9 · L 6/12", satisfies_steps: [4], mode: "do", prompt_text: "", phase: 2, critical: false, step_number: 4, kind: "manual" },
    { key: "s5", label: "Document results", reveal_text: "", satisfies_steps: [5], mode: "do", prompt_text: "", phase: 3, critical: false, step_number: 5, kind: "manual" },
    { key: "s6", label: "Advise on follow-up", reveal_text: "", satisfies_steps: [6], mode: "do", prompt_text: "", phase: 3, critical: false, step_number: 6, kind: "verbal" },
  ],
```

- [ ] **Step 2: Replace harness assertion 5 (palette is manual-only)**

In `station_assert.mjs`, replace the block under `// 5. the palette renders a clickable chip…` (lines 127–130) with:

```js
// 5. the palette renders ONLY manual-procedure chips; verbal steps stay in the chat
if (await p.locator('.aurora-pchip:has-text("Identify patient")').count()) die("verbal step must NOT be a palette chip");
if (!(await p.locator('.aurora-pchip:has-text("Measure IOP")').count())) die("palette missing the Measure IOP manual chip");
if (await p.locator('.aurora-pchip:has-text("Explain procedure")').count()) die("verbal 'Explain procedure' must NOT be a palette chip");
ok("palette shows manual procedures only (verbal steps stay in chat)");
```

- [ ] **Step 3: Replace harness assertion 5a (procedure-mode confirm flow)**

In `station_assert.mjs`, replace the block under `// 5a. clicking a "do" exam chip reveals…` (lines 132–138) with:

```js
// 5a. clicking a manual chip opens procedure mode → typing technique + confirm logs
//     the technique, reveals the finding, ticks the step, and marks the chip done.
await p.locator('.aurora-pchip:has-text("Measure IOP")').click();
await p.waitForSelector(".aurora-station-proc", { timeout: 5000 });
await p.locator(".aurora-station-proc-input").fill("Seat patient at the tonometer, ask them to look straight ahead and not blink, take three readings and average.");
await p.locator(".aurora-station-proc-go").click();
await p.waitForSelector(".aurora-station-reveal", { timeout: 5000 });
if (!(await p.locator('.aurora-station-reveal:has-text("18 mmHg")').count())) die("reveal missing IOP result");
if (!(await p.locator('.aurora-station-reveal:has-text("Seat patient")').count())) die("reveal missing the typed technique");
if (!(await p.locator('.aurora-pchip[data-done="true"]:has-text("Measure IOP")').count())) die("chip did not become done after confirm");
if ((await p.locator('.aurora-station-step[data-ticked="true"]').count()) < 1) die("confirm did not tick the step row");
ok("manual chip → procedure mode → confirm logs technique + result + ticks step");
```

- [ ] **Step 4: Update harness assertion 7 (handover opens as an overlay)**

In `station_assert.mjs`, replace the block under `// 7. submit → Station-100 debrief…` (lines 146–158) with:

```js
// 7. submit → the handover + debrief pop up in an OVERLAY (out of the chat thread).
await p.locator('.aurora-station-submit-toggle').click();
await p.waitForSelector(".aurora-station-overlay-card", { timeout: 5000 });
// the handover form must live in the overlay, not the message thread
if (await p.locator('.aurora-station-thread .aurora-station-form').count()) die("handover form must be in the overlay, not the chat thread");
if (!(await p.locator('.aurora-station-overlay-card label:has-text("Findings")').count())) die("handover must show the relabelled 'Findings' field");
if (!(await p.locator('.aurora-station-overlay-card label:has-text("Next steps")').count())) die("handover must show the relabelled 'Next steps' field");
await p.locator('.aurora-station-overlay-card textarea[data-field="findings"]').fill("Stable IOP on repeat readings; no red flags. Routine review.");
await p.locator('.aurora-station-overlay-card textarea[data-field="recommendation"]').fill("Route as routine; document readings; advise to return if vision changes.");
await p.locator('.aurora-station-overlay-card .aurora-station-submit-go').click();
await p.waitForSelector(".aurora-station-overlay-card .aurora-station-result", { timeout: 10000 });
if (!(await p.locator('.aurora-s100-score:has-text("/100")').count())) die("result must show score out of 100");
if (!(await p.locator('.aurora-s100-verdict:has-text("Solid")').count())) die("result must show the verdict");
if ((await p.locator(".aurora-s100-comp").count()) !== 3) die("result must show 3 component cards");
if (!(await p.locator('.aurora-s100-safety.is-safe').count())) die("result must show the safety badge");
if (!(await p.locator('.aurora-s100-col.is-good li').count())) die("result must list highlights");
if (!(await p.locator('.aurora-s100-col.is-watch li').count())) die("result must list watch-outs");
ok("handover + Station-100 debrief pop up in the overlay (Findings / Next steps)");
```

- [ ] **Step 5: Add `kind` to the shared station mock in `_mocks.mjs`**

Open `frontend/tests/_mocks.mjs`, find the `**/api/cases/C001/station` route's `examination_actions` array, and add `kind: "manual"` to the IOP action (and `kind: "manual"`/`"verbal"` to any others present, matching their labels: exam/measure/hygiene → `"manual"`, intro/identify/explain/consent/advise → `"verbal"`). This keeps `visual_sweep.mjs` rendering manual chips.

- [ ] **Step 6: Build the frontend and run the station harness**

Run (per `project_harness_local_server`):
```bash
cd frontend && npm run build \
  && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/ \
  && (node .next/standalone/server.js & echo $! > /tmp/srv.pid) \
  && sleep 2 && node tests/station_assert.mjs http://127.0.0.1:3000 ; kill $(cat /tmp/srv.pid)
```
Expected: `ALL STATION ASSERTIONS PASSED`

- [ ] **Step 7: Run the aurora harness (regression — station lives in the default shell)**

With the server still built, run:
```bash
cd frontend && (node .next/standalone/server.js & echo $! > /tmp/srv.pid) \
  && sleep 2 && node tests/aurora_assert.mjs http://127.0.0.1:3000 ; kill $(cat /tmp/srv.pid)
```
Expected: all aurora assertions pass (unchanged count). If `_mocks.mjs` drift breaks it, fix the mock and re-run.

- [ ] **Step 8: Full backend test sweep (no regressions)**

Run: `python -m pytest tests/cases -q`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/tests/station_assert.mjs frontend/tests/_mocks.mjs
git commit -m "test(station): harness covers manual-only palette + procedure box + handover overlay"
```

---

## Self-Review notes

- **Spec §1 (kind split):** Task 1 (constant + classification + tests). ✓
- **Spec §2 (procedure-mode composer, record + tick, reveal):** Task 2 Steps 2–5. ✓
- **Spec §3 (blend / no sore thumb):** Task 2 Step 1 (no phase groups, quiet caption) + Step 6 (rename off `.aurora-palette` modal-box inheritance, quiet chip surface). ✓
- **Spec §4 (handover motion overlay + Findings/Next steps):** Task 3. ✓
- **Spec §5 (tests):** Tasks 1 & 4. ✓
- **Type consistency:** `ExamAction.kind` defined in Task 2 Step 1 is produced by Task 1; `activeKey` prop (Task 2 Step 1) is passed as `activeProcedure?.key ?? null` (Task 2 Step 5); `confirmProcedure`/`cancelProcedure`/`activeProcedure`/`procText` all defined in Task 2 Steps 2–3 and used in Step 5. Reveal format `{label} → {technique} · Result: {reveal}` written in Task 2 Step 3 is parsed in Task 2 Step 4 (arrow + ` · Result: ` sentinel via `indexOf`). ✓
- **Known gotcha (carried):** the `.aurora-station` height:100% chain — overlay is `position:fixed`, so it's independent of that chain and won't affect harness assertion 4b. ✓
```
