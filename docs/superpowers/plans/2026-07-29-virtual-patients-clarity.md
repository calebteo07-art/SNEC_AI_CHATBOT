# Virtual Patients — Clarity, Recall & Transparency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the OSCE station impossible to be confused by, and stop it handing students the answers — while making every number in the debrief traceable.

**Architecture:** One state value, `data-turn` on `.aurora-station-grid` (`patient | eyebot | handover`), drives all attentional CSS. Four new **pure** modules (`stationTurn`, `stationMask`, `stationTimer`, `stationHelp`) hold every decision, unit-tested directly with `node --experimental-strip-types` like the existing `stationGate.ts`. React components stay presentational. The backend gains a `focus_step` hint on `/observe`, a `self_advanced` field on submit, and a `breakdown` block emitted by the function that already owns the scoring formula.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, plain CSS in `frontend/src/aurora/aurora.css`, FastAPI + Pydantic v2 (Python 3.12), Playwright harnesses, `node:assert` logic tests, pytest.

**Spec:** `docs/superpowers/specs/2026-07-29-virtual-patients-clarity-design.md`

---

## File Structure

### Phase 1 — anti-spoiler + orientation

| File | Responsibility |
|---|---|
| `frontend/src/aurora/lib/stationMask.ts` | **Create.** The single rule for what checklist text is visible. |
| `frontend/src/aurora/lib/stationTurn.ts` | **Create.** Whose turn it is + the badge copy. Absorbs today's inline `patientLocked`. |
| `frontend/src/aurora/lib/stationHelp.ts` | **Create.** Help + coach-mark content for both surfaces. One vocabulary. |
| `frontend/src/aurora/components/HelpButton.tsx` | **Create.** `?` button + focus-trapped modal (one file — they are never used apart). |
| `frontend/src/aurora/components/StationCoach.tsx` | **Create.** First-run 3-beat coach-mark. |
| `frontend/src/aurora/components/StationChecklist.tsx` | **Modify.** Read-only rows + progressive mask. |
| `frontend/src/aurora/components/PatientChat.tsx` | **Modify.** Turn badge + stuck-valve slot. |
| `frontend/src/aurora/components/EyeBotPanel.tsx` | **Modify.** Turn badge. |
| `frontend/src/aurora/screens/CaseSession.tsx` | **Modify.** Wire turn, mask, self-marks, stuck-valve, help, coach. |
| `frontend/src/aurora/screens/Cases.tsx` | **Modify.** Help button. |
| `frontend/src/aurora/aurora.css` | **Modify.** Spotlight, mask, badge, help modal. |
| `tools/cases/observe_steps.py` | **Modify.** `focus_step` lenient re-check. |
| `tools/api/routers/cases.py` | **Modify.** `ObserveRequest.focus_step`, `CaseSubmitRequest.self_advanced`. |
| `frontend/tests/station_mask_logic.mjs`, `station_turn_logic.mjs`, `station_help_logic.mjs` | **Create.** |
| `frontend/tests/station_assert.mjs` | **Modify.** Currently advances the gate by clicking rows — the affordance being deleted. |
| `.github/workflows/ci.yml`, `docs/design-locks.md` | **Modify.** |

### Phase 2 — realism, fairness, transparency

| File | Responsibility |
|---|---|
| `frontend/src/aurora/lib/stationTimer.ts` | **Create.** Countdown state + tone. |
| `tools/api/shared.py` | **Modify.** `PATIENT_SYSTEM` brevity rules. |
| `tools/cases/station_score.py` | **Modify.** Emit `breakdown`. |
| `tools/api/routers/cases.py` | **Modify.** `ScoreBreakdown` models, `max_tokens`, rate limit. |
| `frontend/src/aurora/screens/CaseSession.tsx` | **Modify.** Timer, rationale, chat errors, handover copy. |
| `frontend/src/aurora/lib/sessionExport.ts` | **Modify.** Time taken + self-marked steps. |
| `frontend/tests/station_timer_logic.mjs`, `tests/test_station_score_breakdown.py`, `tests/test_patient_prompt.py` | **Create.** |

---

# PHASE 1

## Task 1: `stationMask.ts` — the reveal rule

**Files:**
- Create: `frontend/src/aurora/lib/stationMask.ts`
- Test: `frontend/tests/station_mask_logic.mjs`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/station_mask_logic.mjs`:

```js
/* Pure unit test for stationMask — the progressive-reveal rule for the OSCE checklist.
   Run: node --experimental-strip-types frontend/tests/station_mask_logic.mjs

   Branda's feedback: a fully-visible checklist is a script students read off instead of
   recalling their own history-taking questions. Done steps stay readable (you must be able
   to review what you did), the CURRENT step is named (so nobody stalls), everything ahead
   is masked. Self-marked steps are a distinct state — they were never examiner-verified. */
import assert from "node:assert";
import { stepDisplay, maskFor, isRevealed } from "../src/aurora/lib/stationMask.ts";

const S = (...xs) => new Set(xs);
const none = S();

// Done vs self-marked — both ticked, but they must never render alike.
assert.strictEqual(stepDisplay(1, S(1), none, 2), "done", "ticked + not self → done");
assert.strictEqual(stepDisplay(1, S(1), S(1), 2), "self", "ticked + self-marked → self");

// The current step is named; everything else unticked is masked.
assert.strictEqual(stepDisplay(2, S(1), none, 2), "current", "gate step → current");
assert.strictEqual(stepDisplay(3, S(1), none, 2), "masked", "future step → masked");
assert.strictEqual(stepDisplay(9, S(1), none, 2), "masked", "far future → masked");

// All steps done (current === null) → nothing is left to mask.
assert.strictEqual(stepDisplay(3, S(1, 2, 3), none, null), "done", "all done, current null");
assert.strictEqual(stepDisplay(3, S(1, 2), none, null), "masked", "unticked with null gate stays masked");

// isRevealed is the one predicate the UI uses to decide whether to print action text.
assert.strictEqual(isRevealed("done"), true);
assert.strictEqual(isRevealed("self"), true);
assert.strictEqual(isRevealed("current"), true);
assert.strictEqual(isRevealed("masked"), false, "masked text must never be printed");

// The mask tracks the row's natural width without leaking length precisely enough to guess.
assert.match(maskFor("Identify patient — name + NRIC"), /^▨+$/, "mask is glyphs only");
assert.ok(maskFor("Short").length >= 6, "floor keeps short rows from collapsing");
assert.ok(maskFor("x".repeat(400)).length <= 22, "ceiling keeps long rows from wrapping");
assert.ok(
  maskFor("A much longer checklist action here").length > maskFor("Short").length,
  "longer actions get a longer mask so the list keeps its rhythm",
);

console.log("station_mask_logic: all assertions passed");
```

- [ ] **Step 2: Run it to verify it fails**

Run from the repo root:
```bash
node --experimental-strip-types frontend/tests/station_mask_logic.mjs
```
Expected: `ERR_MODULE_NOT_FOUND` — `stationMask.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/aurora/lib/stationMask.ts`:

```ts
// frontend/src/aurora/lib/stationMask.ts
/* Progressive reveal for the OSCE checklist. Pure — no React, no DOM.

   A fully-visible checklist is a script: students follow the listed items instead of
   recalling their own history-taking questions (Branda, 2026-07-29). So only what the
   student has EARNED is readable — completed steps (they need to review them) and the
   current step (so a lost student never stalls). Everything ahead is masked to a glyph
   run that preserves the row's rhythm without leaking the words.

   `self` is ticked-but-not-examiner-verified (the stuck-valve): it counts for the gate,
   but it must never render as a clean ✓ — the debrief and the export stay honest. */

export type StepDisplay = "done" | "current" | "masked" | "self";

/** The display state of one checklist row. `current` is the gate step (stationGate.currentStep). */
export function stepDisplay(
  stepNumber: number,
  ticked: ReadonlySet<number>,
  selfMarked: ReadonlySet<number>,
  current: number | null,
): StepDisplay {
  if (ticked.has(stepNumber)) return selfMarked.has(stepNumber) ? "self" : "done";
  if (current !== null && stepNumber === current) return "current";
  return "masked";
}

/** Whether this state's action text may be printed. The ONE predicate the UI consults —
    so "don't leak future steps" is a single decision, not a condition repeated per call site. */
export function isRevealed(display: StepDisplay): boolean {
  return display !== "masked";
}

const MASK_MIN = 6;
const MASK_MAX = 22;

/** The glyph run standing in for a hidden action. Length tracks the real action (÷3, clamped)
    so the list keeps its visual rhythm and rows don't all collapse to one width — but it is
    far too coarse to reverse-engineer the wording. */
export function maskFor(action: string): string {
  const n = Math.min(MASK_MAX, Math.max(MASK_MIN, Math.round((action || "").length / 3)));
  return "▨".repeat(n);
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
node --experimental-strip-types frontend/tests/station_mask_logic.mjs
```
Expected: `station_mask_logic: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/lib/stationMask.ts frontend/tests/station_mask_logic.mjs
git commit -m "feat(station): progressive-reveal rule for the OSCE checklist"
```

---

## Task 2: `stationTurn.ts` — whose turn it is

**Files:**
- Create: `frontend/src/aurora/lib/stationTurn.ts`
- Test: `frontend/tests/station_turn_logic.mjs`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/station_turn_logic.mjs`:

```js
/* Pure unit test for stationTurn — which pane the student must act in right now.
   Run: node --experimental-strip-types frontend/tests/station_turn_logic.mjs

   Students couldn't tell where to act. This is the single source of truth for the
   spotlight, and it absorbs the `patientLocked` expression that used to live inline in
   CaseSession. CRITICAL: the badge names the CHANNEL, never the clinical content of the
   step — telling them "ask about pain" is exactly the spoon-feeding we removed. */
import assert from "node:assert";
import { stationTurn } from "../src/aurora/lib/stationTurn.ts";

const S = (...xs) => new Set(xs);
const loaded = { loaded: true, hasResult: false, hasEyebot: true };

// A verbal gate step → the patient pane.
assert.strictEqual(stationTurn(1, S(3, 4), loaded).turn, "patient", "verbal step → patient");
// A manual gate step → the action pane.
assert.strictEqual(stationTurn(3, S(3, 4), loaded).turn, "eyebot", "manual step → eyebot");
// Every step done → the handover is the only thing left.
assert.strictEqual(stationTurn(null, S(3, 4), loaded).turn, "handover", "no gate → handover");

// A conversation-only case has no action pane, so a turn can never point at one.
const noEyebot = { loaded: true, hasResult: false, hasEyebot: false };
assert.strictEqual(stationTurn(3, S(3), noEyebot).turn, "patient", "no eyebot pane → never eyebot");

// Not loaded / already graded → no spotlight at all (nothing to do, or nothing left to do).
assert.strictEqual(stationTurn(1, S(), { ...loaded, loaded: false }).turn, null, "unloaded → null");
assert.strictEqual(stationTurn(1, S(), { ...loaded, hasResult: true }).turn, null, "graded → null");

// Badges name the channel and nothing else.
assert.match(stationTurn(1, S(3), loaded).badge, /talk to the patient/i);
assert.match(stationTurn(3, S(3), loaded).badge, /EyeBot/);
assert.match(stationTurn(null, S(3), loaded).badge, /handover/i);
assert.strictEqual(stationTurn(1, S(), { ...loaded, loaded: false }).badge, "", "no turn → no badge");

// The anti-spoiler guarantee, asserted rather than trusted: no badge may carry step text.
for (const gate of [1, 3, null]) {
  const { badge } = stationTurn(gate, S(3, 4), loaded);
  assert.ok(!/\d/.test(badge), `badge must not leak a step number: "${badge}"`);
}

console.log("station_turn_logic: all assertions passed");
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node --experimental-strip-types frontend/tests/station_turn_logic.mjs
```
Expected: `ERR_MODULE_NOT_FOUND` — `stationTurn.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/aurora/lib/stationTurn.ts`:

```ts
// frontend/src/aurora/lib/stationTurn.ts
/* Whose turn is it? Pure — no React, no DOM.

   Students reported not knowing how to use the station. The fix separates MECHANICS
   (which pane do I act in — make this loud) from CLINICAL CONTENT (what do I ask —
   make this earned, see stationMask.ts). This module owns the mechanics half: one
   value that drives `data-turn` on the grid, and one badge line.

   HARD RULE: the badge names the CHANNEL, never the step. "Your turn — talk to the
   patient", never "ask about pain and discharge". Enforced by station_turn_logic.mjs. */

export type Turn = "patient" | "eyebot" | "handover" | null;

export interface TurnState {
  turn: Turn;
  /** Badge copy for the active pane. Empty when there is no turn. */
  badge: string;
}

export interface TurnContext {
  /** The station payload has arrived. */
  loaded: boolean;
  /** The station is graded — the debrief owns the screen now. */
  hasResult: boolean;
  /** This case has manual procedures, so the action pane is rendered. */
  hasEyebot: boolean;
}

/**
 * @param gateStep      the current unlockable step (stationGate.currentStep), null when all done
 * @param manualSteps   step numbers that can only be completed in the action panel
 */
export function stationTurn(
  gateStep: number | null,
  manualSteps: ReadonlySet<number>,
  ctx: TurnContext,
): TurnState {
  if (!ctx.loaded || ctx.hasResult) return { turn: null, badge: "" };
  if (gateStep === null) return { turn: "handover", badge: "All steps done — submit your handover" };
  if (ctx.hasEyebot && manualSteps.has(gateStep)) {
    return { turn: "eyebot", badge: "Your turn — perform in EyeBot" };
  }
  return { turn: "patient", badge: "Your turn — talk to the patient" };
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
node --experimental-strip-types frontend/tests/station_turn_logic.mjs
```
Expected: `station_turn_logic: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/lib/stationTurn.ts frontend/tests/station_turn_logic.mjs
git commit -m "feat(station): pure turn-state module for the pane spotlight"
```

---

## Task 3: Checklist becomes read-only + progressively revealed

**Files:**
- Modify: `frontend/src/aurora/components/StationChecklist.tsx` (full rewrite of the render body)
- Modify: `frontend/src/aurora/screens/CaseSession.tsx`

This is the change students asked for and Branda argued for. `onToggle` is removed **and**
the rows stop being `<button>` — the affordance disappears, not just the handler, so there
is nothing to hover, tab to, or discover.

- [ ] **Step 1: Rewrite `StationChecklist.tsx`**

Replace the whole file with:

```tsx
"use client";
/* StationChecklist — the auto-tracked OSCE checklist for the Guided OSCE Station.
   READ-ONLY by design (2026-07-29): steps tick from the consult (/observe) or the action
   panel, never from a tap. Two things drove that — students were ticking rows instead of
   doing the work, and a fully-visible list is a script they read off instead of recalling
   their own history-taking questions (Branda). So rows are <li>, not <button>, and only
   earned text is printed: done + current are readable, everything ahead is masked
   (stationMask.ts). A 3-segment phase rail and per-phase counters keep progress legible —
   the student always knows HOW FAR they are, just not WHAT'S NEXT.
   Presentational — all state is owned by the parent. */
import { useEffect, useRef } from "react";
import { stepDisplay, isRevealed, maskFor } from "@/aurora/lib/stationMask";

export interface StationStep {
  step_number: number;
  action: string;
  critical: boolean;
  category: string;
  notes: string | null;
}
export interface StationPhase {
  phase: number;
  name: string;
  steps: StationStep[];
}

const PHASE_CLASS: Record<number, string> = { 1: "p1", 2: "p2", 3: "p3" };

export function StationChecklist({
  procedureName,
  phases,
  ticked,
  autoSteps,
  selfMarked,
  current,
}: {
  procedureName: string;
  phases: StationPhase[];
  totalSteps: number; // kept for call-site compatibility
  ticked: Set<number>;
  autoSteps: Set<number>;
  /** Ticked via the stuck-valve, not examiner-verified — rendered distinctly, never as ✓. */
  selfMarked: Set<number>;
  current: number | null;
}) {
  // Keep the step you're on in view as the gate advances (ricoe C8). `block:"nearest"`
  // scrolls only the checklist's scroll container, minimally, and does nothing if the
  // current step is already visible — so no distracting jump on every auto-tick.
  const curRef = useRef<HTMLLIElement>(null);
  useEffect(() => { curRef.current?.scrollIntoView({ block: "nearest" }); }, [current]);

  const doneCounts = phases.map((p) => p.steps.filter((s) => ticked.has(s.step_number)).length);
  const totalSteps = phases.reduce((n, p) => n + p.steps.length, 0);
  const doneTotal = doneCounts.reduce((n, d) => n + d, 0);
  // "current" phase = first phase not yet fully complete; -1 once all are done.
  const currentIdx = doneCounts.findIndex((done, i) => done < phases[i].steps.length);
  const anyAuto = phases.some((p) => p.steps.some((s) => autoSteps.has(s.step_number)));
  const anySelf = selfMarked.size > 0;

  return (
    <div>
      <div className="aurora-station-rail" role="list" aria-label="OSCE phases">
        {phases.map((p, i) => {
          const done = doneCounts[i] === p.steps.length;
          const now = i === currentIdx;
          const cls = done ? "is-done" : now ? "is-now" : "is-todo";
          return (
            <div key={p.phase} className={`aurora-station-rl ${cls}`} role="listitem">
              <b>{`①②③`[i] ?? p.phase} {shortPhase(p.name)}</b>
              {doneCounts[i]}/{p.steps.length}
            </div>
          );
        })}
      </div>

      <p className="aurora-station-cl-label" title={procedureName}>
        Checklist · {doneTotal} of {totalSteps} done
      </p>
      <p className="aurora-station-cl-help">
        Steps tick themselves as you work — talk to the patient, or use the EyeBot panel.
      </p>

      {phases.map((p, i) => {
        const done = doneCounts[i] === p.steps.length;
        const now = i === currentIdx;
        return (
          <div key={p.phase} className={`aurora-station-phase ${PHASE_CLASS[p.phase] ?? "p2"}${done ? " is-done" : ""}${now ? " is-now" : ""}`}>
            <div className="aurora-station-phase-h">
              <span className="aurora-station-node" aria-hidden />
              <span className="aurora-station-phase-t">{p.name}</span>
              <span className="aurora-station-phase-n" aria-hidden>{doneCounts[i]}/{p.steps.length}</span>
            </div>
            <ul className="aurora-station-steps">
              {p.steps.map((s) => {
                const display = stepDisplay(s.step_number, ticked, selfMarked, current);
                const revealed = isRevealed(display);
                const glyph = display === "done" ? "✓" : display === "self" ? "—" : display === "masked" ? "🔒" : "";
                return (
                  <li
                    key={s.step_number}
                    ref={display === "current" ? curRef : undefined}
                    className="aurora-station-step"
                    data-display={display}
                    data-ticked={display === "done" || display === "self" ? "true" : "false"}
                    data-current={display === "current" ? "true" : "false"}
                    data-locked={display === "masked" ? "true" : "false"}
                    aria-current={display === "current" ? "step" : undefined}
                    title={display === "masked" ? "Unlocks as you complete the steps above" : undefined}
                  >
                    <span className="bx" aria-hidden>{glyph}</span>
                    {revealed ? (
                      <span>{s.action}</span>
                    ) : (
                      <>
                        <span className="mask" aria-hidden>{maskFor(s.action)}</span>
                        <span className="sr-only">Upcoming step, hidden until it is your turn</span>
                      </>
                    )}
                    {revealed && s.critical && <span className="crit">CRIT</span>}
                    {display === "done" && autoSteps.has(s.step_number) && (
                      <span className="au" title="Auto-detected from your consult" aria-label="auto-detected">✦</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <p className="aurora-station-cl-legend">
        {anyAuto ? <><span className="au">✦</span> ticked automatically from your conversation · </> : null}
        {anySelf ? <>— self-marked (not examiner-verified) · </> : null}
        upcoming steps stay hidden so you recall them yourself
      </p>
    </div>
  );
}

/* Short rail caption: first 1–2 meaningful words of the phase name. */
function shortPhase(name: string): string {
  const map: Record<string, string> = {
    "Preparation & Identification": "Prep & ID",
    "Clinical Assessment": "Assessment",
    "Documentation & Follow-up": "Documentation",
  };
  return map[name] ?? name;
}
```

Note: `CRIT` is only shown on revealed rows — a masked row announcing itself as critical is a hint.

- [ ] **Step 2: Delete `toggleStep` from `CaseSession.tsx` and add `selfMarked`**

In `frontend/src/aurora/screens/CaseSession.tsx`, delete the entire `toggleStep` function
(the block starting `// Manual control under strict gating:` and ending with its closing `};`).

Add next to the other tick state (after the `autoSteps` line):

```tsx
  // Steps advanced by the stuck-valve rather than examiner-verified (see unstick()).
  const [selfMarked, setSelfMarked] = useState<Set<number>>(new Set());
```

Update the render call:

```tsx
              <StationChecklist
                procedureName={station.checklist.procedure_name}
                phases={phases}
                totalSteps={station.checklist.total_steps}
                ticked={ticked}
                autoSteps={autoSteps}
                selfMarked={selfMarked}
                current={gateStep}
              />
```

- [ ] **Step 3: Add the read-only CSS**

Append to `frontend/src/aurora/aurora.css`, immediately after the
`.aurora-station-cl-legend .au { ... }` rule:

```css
/* Read-only checklist (2026-07-29): rows are <li>, so reset the list chrome the old
   <button> never needed. No cursor, no hover, no focus ring — there is nothing to click. */
.aurora-station-steps { list-style: none; margin: 0; padding: 0; }
.aurora-station-step { cursor: default; }
/* Masked (not-yet-earned) step: the glyph run stands in for the action text so the row
   keeps its rhythm without leaking the words the student should be recalling. */
.aurora-station-step[data-display="masked"] .mask {
  letter-spacing: .06em; color: var(--ink-3); opacity: .45; user-select: none;
}
/* Self-marked via the stuck-valve — deliberately NOT a ✓, so the record stays honest. */
.aurora-station-step[data-display="self"] .bx { color: var(--ink-3); font-weight: 700; }
```

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: clean. If it reports `onToggle` is still passed, remove the stale prop at the call site.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/components/StationChecklist.tsx frontend/src/aurora/screens/CaseSession.tsx frontend/src/aurora/aurora.css
git commit -m "feat(station): checklist is read-only and progressively revealed"
```

---

## Task 4: Turn-spotlight

**Files:**
- Modify: `frontend/src/aurora/screens/CaseSession.tsx`
- Modify: `frontend/src/aurora/components/PatientChat.tsx`
- Modify: `frontend/src/aurora/components/EyeBotPanel.tsx`
- Modify: `frontend/src/aurora/aurora.css`

- [ ] **Step 1: Derive the turn in `CaseSession.tsx`**

Add the import beside the other lib imports:

```tsx
import { stationTurn } from "@/aurora/lib/stationTurn";
```

Replace the `patientLocked` derivation with the turn state. Find:

```tsx
  const manualStepNumbers = new Set(manualActions.flatMap((a) => a.satisfies_steps));
  const patientLocked = gateStep !== null && manualStepNumbers.has(gateStep);
```

and replace with:

```tsx
  const manualStepNumbers = new Set(manualActions.flatMap((a) => a.satisfies_steps));
  // One source of truth for "where do I act now" — drives the pane spotlight, the badges
  // and the patient-composer lock that used to be computed separately here.
  const { turn, badge } = stationTurn(gateStep, manualStepNumbers, {
    loaded: !!station, hasResult: !!result, hasEyebot,
  });
  const patientLocked = turn === "eyebot";
```

- [ ] **Step 2: Put `data-turn` on the grid**

Find `<div className="aurora-station-grid" data-eyebot={hasEyebot ? "true" : "false"}>` and replace with:

```tsx
      <div className="aurora-station-grid" data-eyebot={hasEyebot ? "true" : "false"} data-turn={turn ?? "none"}>
```

- [ ] **Step 3: Pass the badge to both panes**

On `<PatientChat ... />` add:

```tsx
          active={turn === "patient"}
          turnBadge={turn === "patient" ? badge : ""}
```

On `<EyeBotPanel ... />` add:

```tsx
            active={turn === "eyebot"}
            turnBadge={turn === "eyebot" ? badge : ""}
```

- [ ] **Step 4: Render the badge in `PatientChat.tsx`**

Add to its props type, after `locked: boolean;`:

```tsx
  /** This pane is where the student must act right now. */
  active: boolean;
  /** Badge copy — names the CHANNEL, never the clinical step. Empty when not active. */
  turnBadge: string;
```

Add `active, turnBadge,` to the destructured parameter list, and inside the
`.aurora-pane-head` block, immediately after the closing `</div>` of the name/meta
`<div>`, insert:

```tsx
        {active && turnBadge && (
          <span className="aurora-pane-turn" data-testid="turn-badge">{turnBadge}</span>
        )}
```

- [ ] **Step 5: Render the badge in `EyeBotPanel.tsx`**

Add the same two props to its props type and destructuring, and insert the identical
badge markup after the name/meta `<div>` inside its `.aurora-pane-head`.

- [ ] **Step 6: Add the spotlight CSS**

Append to `frontend/src/aurora/aurora.css`, after the `.aurora-station-locknote` rule:

```css
/* ── Turn-spotlight (2026-07-29) ──────────────────────────────────────────────
   Students couldn't tell where to act. `data-turn` on the grid says which pane is live;
   the inactive one recedes. Pure CSS off one attribute, so it needs no measurement and
   works unchanged in the stacked (<=880px) and landscape-phone tiers. Dimmed, never
   hidden: the inactive pane's text stays legible so its scrollback is still readable. */
.aurora-station-grid[data-turn="patient"] .aurora-eyebot,
.aurora-station-grid[data-turn="eyebot"] .aurora-patient {
  opacity: .72; filter: saturate(.6);
}
.aurora-station-grid[data-turn] .aurora-patient,
.aurora-station-grid[data-turn] .aurora-eyebot {
  transition: opacity .28s var(--st-ease, ease), filter .28s var(--st-ease, ease),
              box-shadow .28s var(--st-ease, ease);
}
.aurora-station-grid[data-turn="patient"] .aurora-patient {
  box-shadow: 0 1px 1px rgba(45,35,85,.05), 0 20px 40px -22px rgba(45,35,85,.32),
              inset 0 1px 0 rgba(255,255,255,.72), 0 0 0 2px rgba(217,101,112,.55);
}
.aurora-station-grid[data-turn="eyebot"] .aurora-eyebot {
  box-shadow: 0 1px 1px rgba(45,35,85,.05), 0 20px 40px -22px rgba(45,35,85,.32),
              inset 0 1px 0 rgba(255,255,255,.72), 0 0 0 2px rgba(44,107,224,.55);
}
/* "All steps done" — the handover button takes the emphasis instead of either pane. */
.aurora-station-grid[data-turn="handover"] ~ * .aurora-station-submit-toggle,
.aurora-station-grid[data-turn="handover"] .aurora-station-submit-toggle {
  box-shadow: 0 0 0 2px rgba(96,214,115,.6);
}
.aurora-pane-turn {
  margin-left: auto; align-self: center; white-space: nowrap;
  font-size: 12px; font-weight: 700; letter-spacing: .01em;
  padding: 5px 10px; border-radius: 999px;
  background: rgba(31,31,31,.06); color: var(--ink-2);
}
.aurora-patient .aurora-pane-turn { background: rgba(217,101,112,.14); color: #8c3a43; }
.aurora-eyebot .aurora-pane-turn { background: rgba(44,107,224,.13); color: #1f4fa8; }
/* Landscape phone: the badge is the first thing to cost a line — keep it, shrink it. */
@media (max-height: 480px) and (pointer: coarse) {
  .aurora-pane-turn { font-size: 11px; padding: 3px 7px; }
}
@media (prefers-reduced-motion: reduce) {
  .aurora-station-grid[data-turn] .aurora-patient,
  .aurora-station-grid[data-turn] .aurora-eyebot { transition: none; }
}
```

- [ ] **Step 7: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/aurora/screens/CaseSession.tsx frontend/src/aurora/components/PatientChat.tsx frontend/src/aurora/components/EyeBotPanel.tsx frontend/src/aurora/aurora.css
git commit -m "feat(station): spotlight the pane whose turn it is"
```

---

## Task 5: Stop the station leaking the diagnosis

**Files:**
- Modify: `frontend/src/aurora/screens/CaseSession.tsx`

`case_oa_009` has `topic: subconjunctival_haemorrhage`. The station prints it twice before
the student has asked a single question.

- [ ] **Step 1: Replace topic with the procedure in the HUD**

Find the HUD block and replace the topic span so it shows the resolved procedure — a skill
name, not an answer:

```tsx
            <div className="aurora-station-hud">
              <span>{caseInfo.patient.age} yr</span>
              <span className="aurora-station-hud-sep">·</span>
              {/* The case TOPIC is the diagnosis on many cases (e.g. subconjunctival_haemorrhage)
                  — showing it here hands the student the answer before they start (Branda,
                  2026-07-29). The procedure is the honest label; the topic returns in the debrief. */}
              <span>{station?.checklist.procedure_name ?? "OSCE station"}</span>
              <span className="aurora-station-hud-sep">·</span>
              <span className="aurora-station-tier">{tierLabel(caseInfo.difficulty)}</span>
            </div>
```

- [ ] **Step 2: Replace topic in the aside (the "sidebar" from the feedback)**

Find `<div className="aurora-station-mt">{caseInfo.patient.age} years · {caseInfo.topic}</div>`
and replace with:

```tsx
                  <div className="aurora-station-mt">{caseInfo.patient.age} years · {caseInfo.patient.presenting_complaint ? "walk-in" : "appointment"}</div>
```

Simpler and truthful — drop the second clause entirely if the presenting complaint already
sits directly below it:

```tsx
                  <div className="aurora-station-mt">{caseInfo.patient.age} years</div>
```

Use the second form. The presenting complaint renders immediately below in
`.aurora-station-cc`, so a second metadata clause is noise.

- [ ] **Step 3: Reveal the topic in the debrief**

In `StationResult`, the topic is now safe to show. Add a `topic` prop to its signature:

```tsx
function StationResult({ result, coaching, topic, saved, onSave, onMore, onDash }: {
  result: DomainResult; coaching: Coaching | null; topic: string; saved: boolean;
  onSave: () => void; onMore: () => void; onDash: () => void;
}) {
```

Inside `.aurora-s100-head`, under the eyebrow, add:

```tsx
          <p className="aurora-eyebrow">Station complete{topic ? ` · ${topic.replace(/_/g, " ")}` : ""}</p>
```

replacing the existing `<p className="aurora-eyebrow">Station complete</p>`, and pass it at
the call site:

```tsx
              <StationResult result={result} coaching={coaching} topic={caseInfo?.topic ?? ""} saved={saved} onSave={handleSave} onMore={() => router.push("/cases")} onDash={() => router.push("/homepage")} />
```

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/screens/CaseSession.tsx
git commit -m "fix(station): stop the case topic revealing the diagnosis mid-station"
```

---

## Task 6: Stuck-valve

**Files:**
- Modify: `tools/cases/observe_steps.py`
- Modify: `tools/api/routers/cases.py`
- Modify: `frontend/src/aurora/screens/CaseSession.tsx`
- Modify: `frontend/src/aurora/components/PatientChat.tsx`
- Modify: `frontend/src/aurora/aurora.css`
- Test: `tests/test_observe_focus_step.py`

Removing the tap makes `/observe` load-bearing. Without this, one missed detection freezes
the gate and every later manual chip stays locked forever.

- [ ] **Step 1: Write the failing backend test**

Create `tests/test_observe_focus_step.py`:

```python
"""The stuck-valve's first stage: a lenient re-check of ONE step.

Removing manual ticking made /observe load-bearing — a missed detection used to be
recoverable with a tap. `focus_step` lets the student say "you missed this one" and get a
second, step-specific read of the transcript before anything is self-marked.
"""
from unittest.mock import patch

import tools.cases.observe_steps as obs

STEPS = [
    {"step_number": 1, "action": "Identify patient — name + NRIC", "critical": True},
    {"step_number": 2, "action": "Explain purpose & procedure", "critical": False},
]
MESSAGES = [{"role": "user", "content": "Morning, can I confirm your name and NRIC?"}]


def _capture(focus):
    """Run observe() with the model stubbed, returning the prompt it would have sent."""
    seen = {}

    def fake_ask(**kwargs):
        seen["prompt"] = kwargs["messages"][0]["content"]
        return "[]"

    with patch.object(obs, "MOCK_MODE", False), patch.object(obs, "ask", fake_ask):
        obs.observe(STEPS, MESSAGES, [], None, focus)
    return seen["prompt"]


def test_focus_step_adds_a_lenient_recheck_for_that_step():
    prompt = _capture(2)
    assert "step 2" in prompt
    assert "believes" in prompt.lower()


def test_no_focus_step_leaves_the_prompt_unchanged():
    assert "believes" not in _capture(None).lower()


def test_focus_step_that_is_already_ticked_or_unknown_is_ignored():
    # 99 is not a step in this checklist — never invent a focus note for it.
    assert "step 99" not in _capture(99)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python -m pytest tests/test_observe_focus_step.py -q
```
Expected: FAIL — `observe() takes 3 to 4 positional arguments but 5 were given`.

- [ ] **Step 3: Add `focus_step` to `observe()`**

In `tools/cases/observe_steps.py`, change the signature:

```python
def observe(checklist_steps: list[dict], messages: list[dict], already_ticked: list[int],
            exclude_steps=None, focus_step: int | None = None) -> list[int]:
    """Return newly-satisfied step numbers (excluding already-ticked and excluded steps).

    exclude_steps: step numbers the conversational examiner must never tick — the case's
    hands-on (manual) procedures, which tick only via the action panel. They are hidden
    from the model AND filtered from its output, so the consult can never auto-tick them.

    focus_step: the student has explicitly claimed they already did this step (the station's
    stuck-valve). Ask for one lenient re-read of THAT step only — strictness everywhere else
    is unchanged, so this can't become a way to tick the whole list.
    """
```

Then, immediately before the `prompt = (` assignment, add:

```python
    focus_note = ""
    if focus_step is not None and int(focus_step) in {int(s.get("step_number", 0)) for s in remaining}:
        focus_note = (
            f"\n\nNOTE: the student believes they have already completed step {int(focus_step)}. "
            "Re-read the WHOLE transcript for that step specifically and include it if their own "
            "words reasonably cover it, even if indirectly. Your strictness for every OTHER step "
            "is unchanged."
        )
```

and append `{focus_note}` to the prompt's final line:

```python
        f"Which step numbers has the student now satisfied? JSON array only.{focus_note}"
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
python -m pytest tests/test_observe_focus_step.py -q
```
Expected: 3 passed.

- [ ] **Step 5: Thread `focus_step` and `self_advanced` through the API**

In `tools/api/routers/cases.py`:

```python
class ObserveRequest(BaseModel):
    messages: list[ChatMessage] = Field(max_length=100)
    already_ticked: list[int] = []
    # Stuck-valve: the student claims they already did this step — re-check it leniently.
    focus_step: int | None = None
```

```python
class CaseSubmitRequest(BaseModel):
    messages: list[ChatMessage] = Field(max_length=100)
    # Allied-health (OA\OT\PSA) handover, not a doctor's diagnosis\treatment:
    # what the student found + what they recommend (triage/escalate/advise).
    findings: str
    recommendation: str
    performed_steps: list[int] = []
    # Subset of performed_steps advanced by the stuck-valve, NOT examiner-verified.
    # Included in performed_steps (student's favour) but named to the debrief coach.
    self_advanced: list[int] = []
```

In `observe_case`, pass it through:

```python
    newly = await asyncio.to_thread(
        observe, cl["steps"], messages, body.already_ticked, manual_steps, body.focus_step
    )
```

In `case_submit`, immediately after the `missed_actions = [...]` line, add:

```python
    # Steps the student self-marked when the examiner missed them. They count for the grade
    # (after 3 genuine attempts the likeliest truth is the examiner missed it), but the coach
    # is told so the debrief never claims verification it doesn't have.
    self_named = [c.action for c in checklist_comparison if c.step_number in set(body.self_advanced)]
```

and append to the `coaching_messages` content string, after the "Checklist steps NOT performed" line:

```python
            f"Steps the student SELF-MARKED (not examiner-verified — if the transcript does not "
            f"support them, say so): {', '.join(self_named) or 'none'}\n\n"
```

- [ ] **Step 6: Wire the valve in `CaseSession.tsx`**

Add state beside `selfMarked`:

```tsx
  // Messages sent since the gate last moved. Three with no tick ⇒ offer the stuck-valve.
  const [sinceAdvance, setSinceAdvance] = useState(0);
  const [unsticking, setUnsticking] = useState(false);
```

Reset it whenever the gate moves — add after the other effects:

```tsx
  // The gate moved (or the station loaded) → the student isn't stuck any more.
  useEffect(() => { setSinceAdvance(0); }, [gateStep]);
```

In `sendMessage`'s `finally` block, immediately before `scheduleObserve()`, add:

```tsx
      setSinceAdvance((n) => n + 1);
```

Add the handler after `scheduleObserve`:

```tsx
  // Stuck-valve. Removing the manual tap made /observe load-bearing: a step it never
  // recognises would freeze the gate and leave every later manual chip locked forever.
  // One press, two stages — ask the examiner to re-read THIS step leniently, and only
  // self-mark if that still finds nothing. Self-marks are recorded, not hidden.
  const unstick = useCallback(async () => {
    const step = currentStep(orderRef.current, tickedRef.current);
    if (step === null || unsticking) return;
    setUnsticking(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/observe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: toApi(messagesRef.current.slice(-100)),
          already_ticked: Array.from(tickedRef.current),
          focus_step: step,
        }),
      });
      const data = res.ok ? ((await res.json()) as { newly_satisfied?: number[] }) : { newly_satisfied: [] };
      if (data.newly_satisfied?.length) { addAuto(data.newly_satisfied); return; }
    } catch { /* fall through to the self-mark — the valve must never fail closed */ }
    // Stage 2: the examiner still can't see it. Advance, and record that we did.
    setTicked((prev) => { const x = new Set(prev); x.add(step); return x; });
    setSelfMarked((prev) => { const x = new Set(prev); x.add(step); return x; });
  }, [caseId, unsticking, addAuto]);
```

Send the self-marks on submit — in `handleSubmit`'s body, extend the JSON:

```tsx
        body: JSON.stringify({ messages: toApi(messages), findings: findings.trim(), recommendation: recommendation.trim(), performed_steps: Array.from(ticked), self_advanced: Array.from(selfMarked) }),
```

Pass the valve to the patient pane:

```tsx
          canUnstick={turn === "patient" && sinceAdvance >= 3 && !result}
          unsticking={unsticking}
          onUnstick={() => void unstick()}
```

- [ ] **Step 7: Render the valve in `PatientChat.tsx`**

Add to the props type:

```tsx
  /** Three messages on the same step with no tick — offer the stuck-valve. */
  canUnstick: boolean;
  unsticking: boolean;
  onUnstick: () => void;
```

Add `canUnstick, unsticking, onUnstick,` to the destructuring, and insert immediately
before the `{!hasResult && !locked && (` composer block:

```tsx
      {!hasResult && !locked && canUnstick && (
        <button
          type="button"
          className="aurora-station-unstick"
          data-testid="station-unstick"
          onClick={onUnstick}
          disabled={unsticking}
        >
          {unsticking ? "Re-checking your consult…" : "Examiner didn't catch that?"}
        </button>
      )}
```

- [ ] **Step 8: Style it**

Append to `frontend/src/aurora/aurora.css`:

```css
/* Stuck-valve — deliberately quiet. It is the recovery path when the examiner misses a
   step, not a shortcut, so it never competes with the composer for attention. */
.aurora-station-unstick {
  display: block; margin: 8px auto 0; padding: 5px 12px; border-radius: 999px;
  border: 1px dashed var(--hairline); background: none;
  color: var(--ink-3); font-size: 12.5px; cursor: pointer;
  transition: color .15s var(--st-ease, ease), background .15s var(--st-ease, ease);
}
.aurora-station-unstick:hover:not(:disabled) { color: var(--ink-2); background: rgba(31,31,31,.04); }
.aurora-station-unstick:disabled { opacity: .6; cursor: default; }
```

- [ ] **Step 9: Verify**

```bash
python -m pytest tests/test_observe_focus_step.py -q
```
Expected: 3 passed.

```bash
cd frontend && npm run typecheck
```
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add tools/cases/observe_steps.py tools/api/routers/cases.py tests/test_observe_focus_step.py frontend/src/aurora/screens/CaseSession.tsx frontend/src/aurora/components/PatientChat.tsx frontend/src/aurora/aurora.css
git commit -m "feat(station): stuck-valve so a missed detection can never dead-end a student"
```

---

## Task 7: `?` help on both surfaces

**Files:**
- Create: `frontend/src/aurora/lib/stationHelp.ts`
- Create: `frontend/src/aurora/components/HelpButton.tsx`
- Modify: `frontend/src/aurora/screens/CaseSession.tsx`, `frontend/src/aurora/screens/Cases.tsx`, `frontend/src/aurora/aurora.css`
- Test: `frontend/tests/station_help_logic.mjs`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/station_help_logic.mjs`:

```js
/* Pure unit test for stationHelp — the help + coach-mark content model.
   Run: node --experimental-strip-types frontend/tests/station_help_logic.mjs

   Students said the whole feature was confusing. The `?` modal and the first-run coach-mark
   read from ONE model so they can never describe the system differently. This test pins the
   contract the UI relies on, and guards the anti-spoiler rule: help explains MECHANICS, so
   no beat may name a clinical action. */
import assert from "node:assert";
import { HELP, COACH_BEATS, helpFor } from "../src/aurora/lib/stationHelp.ts";

// Both surfaces have content, and every section is renderable.
for (const surface of ["cases", "station"]) {
  const help = helpFor(surface);
  assert.ok(help, `${surface} must have help content`);
  assert.ok(help.title.length > 0, `${surface} help needs a title`);
  assert.ok(help.sections.length >= 3, `${surface} help needs real substance`);
  for (const s of help.sections) {
    assert.ok(s.heading.length > 0, `${surface}: every section needs a heading`);
    assert.ok(s.body.length > 20, `${surface}: section "${s.heading}" is too thin to help`);
  }
}

// Unknown surfaces fall back rather than crashing a screen.
assert.strictEqual(helpFor("nonsense"), HELP.station, "unknown surface falls back to station help");

// The coach-mark: exactly three beats, each anchored to a selector that exists in the DOM.
assert.strictEqual(COACH_BEATS.length, 3, "three beats — more is a tour, not a coach-mark");
for (const b of COACH_BEATS) {
  assert.ok(b.id && b.title && b.body, `beat ${b.id} is incomplete`);
  assert.match(b.target, /^[.[]/, `beat ${b.id} needs a CSS selector, got "${b.target}"`);
}
assert.strictEqual(COACH_BEATS[2].requiresEyebot, true, "the EyeBot beat must be skippable");
assert.ok(!COACH_BEATS[0].requiresEyebot, "the checklist beat always shows");

// The checklist beat must state the read-only rule — it is the single biggest change.
assert.match(COACH_BEATS[0].body, /tick/i, "beat 1 must explain that ticking is automatic");

console.log("station_help_logic: all assertions passed");
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node --experimental-strip-types frontend/tests/station_help_logic.mjs
```
Expected: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write the content model**

Create `frontend/src/aurora/lib/stationHelp.ts`:

```ts
// frontend/src/aurora/lib/stationHelp.ts
/* Help + coach-mark content for Virtual Patients. Pure data — no React, no DOM.

   Students reported the whole feature was confusing (2026-07-29). The `?` modal and the
   first-run coach-mark both read from here, so the system can never be described two
   different ways. Copy lives in one file for the same reason tourSteps.ts does.

   ANTI-SPOILER RULE: this explains MECHANICS (which pane, how steps tick, how scoring
   works). It never names a clinical action — that is the student's to recall. */

export interface HelpSection { heading: string; body: string }
export interface HelpContent { title: string; sections: HelpSection[] }

export const HELP: Record<"cases" | "station", HelpContent> = {
  cases: {
    title: "How Virtual Patients works",
    sections: [
      { heading: "What this is",
        body: "Each virtual patient is a full OSCE station. You take a history, run the checks you'd really run, then write a handover — and get a scored debrief with specific feedback." },
      { heading: "Choosing a patient",
        body: "Filter by clicking a region of the eye, or by picking a topic chip. One lens at a time — choosing a topic clears the eye region, and vice-versa." },
      { heading: "The three tiers",
        body: "Foundational, Developing and Advanced. Work through a topic's Foundational patients to unlock the harder ones in that topic." },
      { heading: "What it costs",
        body: "Nothing to start. But once you're in a station, leaving before you submit your handover forfeits Lumens — so start one when you have time to finish it." },
    ],
  },
  station: {
    title: "How to use this station",
    sections: [
      { heading: "The checklist tracks you — you don't tick it",
        body: "Steps tick themselves as you work: talk to the patient and the examiner marks off what you genuinely covered; perform a procedure in the EyeBot panel and it ticks there. Upcoming steps stay hidden on purpose, so you recall what to ask instead of reading it off a list." },
      { heading: "Whose turn is it",
        body: "The live pane is highlighted and says so. When it's the patient's turn, talk to them. When a hands-on procedure is next, the patient composer locks and you work in the EyeBot panel instead." },
      { heading: "Talking to the patient",
        body: "Ask like you would in clinic — one thing at a time. They answer only what you ask, in their own words. If you're sure you covered a step and it hasn't ticked, use “Examiner didn't catch that?” under the composer." },
      { heading: "Hands-on procedures",
        body: "Pick a procedure chip, then type how you'd actually perform it. EyeBot returns the reading and grades your technique against the model answer straight away. A few mechanical steps just tick on one click." },
      { heading: "Time",
        body: "Each case shows a countdown from its expected length. It turns amber near the end and red when it runs out, but it never cuts you off — it's there to build exam pace." },
      { heading: "The handover",
        body: "Write what you found and what you'd do next, within your role — you don't diagnose or prescribe. If nothing is urgent, say so: “routine, patient follows appointment time” is a complete answer." },
      { heading: "How you're scored",
        body: "Two schemes out of 50: Consultation & Technique, and Clinical Judgement & Safety. The debrief shows the sub-scores behind each one and why. Missing a critical safety step caps the judgement half." },
    ],
  },
};

/** Help for a surface; unknown surfaces fall back to the station rather than blanking a screen. */
export function helpFor(surface: string): HelpContent {
  return HELP[surface as "cases" | "station"] ?? HELP.station;
}

export interface CoachBeat {
  id: string;
  /** CSS selector to spotlight. */
  target: string;
  title: string;
  body: string;
  /** Skip this beat on conversation-only cases, where the pane doesn't exist. */
  requiresEyebot?: boolean;
}

/** First-run coach-mark: three beats, one per pane. More than three is a tour, not a
    coach-mark — and the account-level grand tour already exists (tourSteps.ts). */
export const COACH_BEATS: CoachBeat[] = [
  { id: "checklist", target: ".aurora-station-clscroll",
    title: "This tracks itself",
    body: "You can't tick these — do the work and they tick. Steps you haven't reached stay hidden so you recall them yourself." },
  { id: "patient", target: '[data-testid="patient-pane"]',
    title: "Talk to your patient here",
    body: "History, consent, explanations — ask one thing at a time, like you would in clinic." },
  { id: "eyebot", target: '[data-testid="eyebot-pane"]', requiresEyebot: true,
    title: "Hands-on procedures happen here",
    body: "When a procedure is next, this panel lights up. Pick it, then type how you'd perform it." },
];
```

- [ ] **Step 4: Run it to verify it passes**

```bash
node --experimental-strip-types frontend/tests/station_help_logic.mjs
```
Expected: `station_help_logic: all assertions passed`

- [ ] **Step 5: Build the component**

Create `frontend/src/aurora/components/HelpButton.tsx`:

```tsx
"use client";
/* HelpButton — the "?" affordance and its modal. One component, two surfaces (/cases and
   the station), content from stationHelp.ts so the vocabulary can never drift.
   Reuses the station overlay scrim/card so it lands inside the locked visual language. */
import { useEffect, useRef, useState } from "react";
import { helpFor } from "@/aurora/lib/stationHelp";

export function HelpButton({ surface, label = "How this works" }: { surface: "cases" | "station"; label?: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const content = helpFor(surface);

  // Focus into the dialog on open, back to the button on close, Esc closes, Tab is trapped.
  useEffect(() => {
    if (!open) return;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
      else if (e.key === "Tab") { e.preventDefault(); cardRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => { setOpen(false); btnRef.current?.focus(); };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="aurora-help-btn"
        data-testid={`help-${surface}`}
        aria-label={label}
        title={label}
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open && (
        <div className="aurora-station-overlay" role="dialog" aria-modal="true" aria-label={content.title} data-testid="help-modal">
          <div className="aurora-station-overlay-scrim" onClick={close} aria-hidden />
          <div ref={cardRef} tabIndex={-1} className="aurora-station-overlay-card aurora-help-card">
            <button type="button" className="aurora-station-overlay-x" onClick={close} aria-label="Close">✕</button>
            <p className="aurora-eyebrow">{content.title}</p>
            <dl className="aurora-help-list">
              {content.sections.map((s) => (
                <div key={s.heading}>
                  <dt>{s.heading}</dt>
                  <dd>{s.body}</dd>
                </div>
              ))}
            </dl>
            <button type="button" className="aurora-station-submit-go" onClick={close}>Got it</button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 6: Mount it on both screens**

In `frontend/src/aurora/screens/Cases.tsx`, add the import:

```tsx
import { HelpButton } from "@/aurora/components/HelpButton";
```

and inside `.aurora-cases-head`, after the closing `</div>` of `.aurora-cases-head-text`:

```tsx
        <HelpButton surface="cases" />
```

In `frontend/src/aurora/screens/CaseSession.tsx`, add the import and place it in the header,
after the closing `</div>` of the title block inside `<header className="aurora-station-head">`:

```tsx
        <HelpButton surface="station" />
```

- [ ] **Step 7: Style it**

Append to `frontend/src/aurora/aurora.css`:

```css
/* "?" help — quiet until wanted, reachable from both Virtual Patients surfaces. */
.aurora-help-btn {
  margin-left: auto; flex: none; width: 32px; height: 32px; border-radius: 50%;
  border: 1px solid var(--hairline); background: var(--paper);
  color: var(--ink-2); font-size: 15px; font-weight: 700; cursor: pointer; line-height: 1;
  transition: background .15s var(--st-ease, ease), color .15s var(--st-ease, ease);
}
.aurora-help-btn:hover { background: rgba(155,114,203,.12); color: var(--ink); }
.aurora-cases-head, .aurora-station-head { display: flex; align-items: flex-start; gap: 12px; }
.aurora-help-card { max-width: 620px; text-align: left; }
.aurora-help-list { margin: 10px 0 18px; display: flex; flex-direction: column; gap: 13px; }
.aurora-help-list dt { font-weight: 700; font-size: 15px; color: var(--ink); margin-bottom: 2px; }
.aurora-help-list dd { margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--ink-2); }
```

If `.aurora-cases-head` or `.aurora-station-head` already declare `display`, edit the
existing rule rather than adding a second one — search for them first and reconcile.

- [ ] **Step 8: Verify**

```bash
cd frontend && npm run typecheck
```
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/aurora/lib/stationHelp.ts frontend/src/aurora/components/HelpButton.tsx frontend/tests/station_help_logic.mjs frontend/src/aurora/screens/Cases.tsx frontend/src/aurora/screens/CaseSession.tsx frontend/src/aurora/aurora.css
git commit -m "feat(cases): '?' help explaining the whole Virtual Patients flow"
```

---

## Task 8: First-run coach-mark

**Files:**
- Create: `frontend/src/aurora/components/StationCoach.tsx`
- Modify: `frontend/src/aurora/screens/CaseSession.tsx`, `frontend/src/aurora/aurora.css`

- [ ] **Step 1: Build the component**

Create `frontend/src/aurora/components/StationCoach.tsx`:

```tsx
"use client";
/* StationCoach — the first time a student ever opens a station, three spotlighted beats
   naming what each pane is for. Reuses the grand tour's anchor helpers (waitForElement /
   useAnchorRect) but keeps its OWN storage key: the grand tour is account-first-run, this
   is feature-first-run, and neither may gate the other. Re-openable forever from "?". */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { waitForElement, useAnchorRect } from "@/aurora/tour/useTourAnchor";
import { COACH_BEATS } from "@/aurora/lib/stationHelp";

export const STATION_COACH_KEY = "eyebot_station_coach_seen";

const PAD = 10;
const CARD_W = 320;
const GAP = 14;

export function StationCoach({ hasEyebot, onDone }: { hasEyebot: boolean; onDone: () => void }) {
  const beats = COACH_BEATS.filter((b) => !b.requiresEyebot || hasEyebot);
  const [index, setIndex] = useState(0);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const beat = beats[index];

  useEffect(() => {
    let cancelled = false;
    setAnchorEl(null);
    if (!beat) return;
    waitForElement([beat.target], 4000).then((el) => { if (!cancelled) setAnchorEl(el); });
    return () => { cancelled = true; };
  }, [beat]);

  const rect = useAnchorRect(anchorEl);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onDone(); }
      else if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((i) => (i + 1 < beats.length ? i + 1 : (onDone(), i)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [beats.length, onDone]);

  if (!beat || typeof document === "undefined") return null;

  const spot = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null;
  // Card sits under the spotlight when it fits, else above; clamped to the viewport. No
  // anchor (a pane that never rendered) ⇒ centred card, so a missing target never traps.
  const style = spot
    ? {
        top: Math.min(spot.top + spot.height + GAP, window.innerHeight - 190),
        left: Math.max(GAP, Math.min(spot.left + spot.width / 2 - CARD_W / 2, window.innerWidth - CARD_W - GAP)),
      }
    : { top: "50%", left: `calc(50% - ${CARD_W / 2}px)` };

  const last = index === beats.length - 1;

  return createPortal(
    <div className="tour-scrim" data-testid="station-coach" data-beat={beat.id}>
      {spot && <div className="tour-spot" style={spot} aria-hidden />}
      <div className="tour-card aurora-coach-card" style={style} role="dialog" aria-modal="true" aria-label={beat.title}>
        <h2 className="tour-title">{beat.title}</h2>
        <p className="tour-body">{beat.body}</p>
        <div className="tour-foot">
          <div className="tour-dots" aria-hidden>
            {beats.map((b, i) => <i key={b.id} className={i === index ? "on" : ""} />)}
          </div>
          <button
            type="button"
            className="tour-next"
            data-testid="coach-next"
            onClick={() => (last ? onDone() : setIndex((i) => i + 1))}
          >
            {last ? "Start" : "Next →"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Mount it in `CaseSession.tsx`**

Add the imports:

```tsx
import { StationCoach, STATION_COACH_KEY } from "@/aurora/components/StationCoach";
```

Add state (initialised lazily so it reads `localStorage` once, on the client):

```tsx
  // First station ever → the 3-beat coach-mark. Separate key from the grand tour.
  const [showCoach, setShowCoach] = useState(false);
  useEffect(() => {
    if (!station) return;
    try { if (!localStorage.getItem(STATION_COACH_KEY)) setShowCoach(true); } catch { /* private mode */ }
  }, [station]);
  const dismissCoach = useCallback(() => {
    setShowCoach(false);
    try { localStorage.setItem(STATION_COACH_KEY, "true"); } catch { /* private mode */ }
  }, []);
```

Render it just before the closing `</div>` of `.aurora-station`, after the leave-confirm block:

```tsx
      {showCoach && station && !result && (
        <StationCoach hasEyebot={hasEyebot} onDone={dismissCoach} />
      )}
```

- [ ] **Step 3: Style the card**

Append to `frontend/src/aurora/aurora.css`:

```css
/* Coach-mark card — the tour's card material at station scale. */
.aurora-coach-card { width: 320px; }
```

- [ ] **Step 4: Verify**

```bash
cd frontend && npm run typecheck
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/components/StationCoach.tsx frontend/src/aurora/screens/CaseSession.tsx frontend/src/aurora/aurora.css
git commit -m "feat(station): 3-beat first-run coach-mark"
```

---

## Task 9: Rewrite the station harness + close out Phase 1

**Files:**
- Modify: `frontend/tests/station_assert.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/design-locks.md`

The harness currently advances the gate by clicking checklist rows — the exact affordance
Task 3 deleted. It must advance the way a student now does.

- [ ] **Step 1: Make `/observe` progressive**

In `frontend/tests/station_assert.mjs`, replace the fixed observe route:

```js
await ctx.route("**/api/cases/C001/observe", (r) => r.fulfill(J({ newly_satisfied: [1] })));
```

with a stateful mock that ticks the next verbal step each call — the student now advances
by talking, so the mock must model an examiner that actually recognises things:

```js
// The examiner ticks the next VERBAL step on each pass (3-5 are manual/action-panel only).
// Progressive, because the read-only checklist means /observe is now the only way steps 1-2
// can advance — clicking rows is gone.
let observed = 0;
const VERBAL_ORDER = [1, 2, 6];
await ctx.route("**/api/cases/C001/observe", async (r) => {
  const body = JSON.parse(r.request().postData() || "{}");
  const ticked = new Set(body.already_ticked || []);
  const next = VERBAL_ORDER.find((n) => !ticked.has(n));
  observed += 1;
  await r.fulfill(J({ newly_satisfied: next === undefined ? [] : [next] }));
});
```

- [ ] **Step 2: Replace the row-clicking assertions**

Delete the block under the `// 5h.` comment (the two
`await p.locator('.aurora-station-step[data-current="true"]').click();` lines and their
assertions) and replace it with:

```js
// 5h. The checklist is READ-ONLY (2026-07-29): rows are not buttons and clicking one does
//     nothing. This is a state invariant — students were ticking rows instead of doing the
//     work, so the affordance must never come back.
const firstRow = p.locator('.aurora-station-step').first();
if ((await firstRow.evaluate((el) => el.tagName)) !== "LI") die("checklist rows must not be buttons");
const beforeClick = await p.locator('.aurora-station-step[data-ticked="true"]').count();
await firstRow.click({ force: true });
await p.waitForTimeout(150);
if ((await p.locator('.aurora-station-step[data-ticked="true"]').count()) !== beforeClick) {
  die("clicking a checklist row must not tick it");
}
ok("checklist is read-only — clicking a row does nothing");

// 5i. Progressive reveal: future steps are masked, and their action text is NOWHERE in the
//     DOM. Branda's point — a fully-visible list is a script students read off instead of
//     recalling their own history-taking questions.
if (!(await p.locator('.aurora-station-step[data-display="masked"]').count())) die("future steps must be masked");
const clText = await p.locator(".aurora-station-clscroll").innerText();
if (clText.includes("Advise on follow-up")) die("a future step's action text leaked into the DOM");
if (!clText.includes("Identify patient")) die("the current step must still be named");
ok("future steps masked, current step named");

// 5j. Talking advances the gate — the only path now for verbal steps.
await p.locator(".aurora-station-composer-input").fill("Good morning, can I confirm your name and NRIC?");
await p.locator(".aurora-station-composer-send").click();
await p.waitForFunction(() => document.querySelector(".aurora-station-thread")?.textContent?.includes("Good morning, doctor."), null, { timeout: 8000 });
await p.waitForSelector('.aurora-station-step[data-current="true"]:has-text("Explain purpose")', { timeout: 8000 });
await p.locator(".aurora-station-composer-input").fill("I'll explain what the test involves before we start.");
await p.locator(".aurora-station-composer-send").click();
await p.waitForSelector('.aurora-station-step[data-current="true"]:has-text("Measure IOP")', { timeout: 8000 });
if (await p.locator('.aurora-pchip[data-locked="true"]:has-text("Measure IOP")').count()) die("Measure IOP must unlock once steps 1-2 are done");
ok("consult advances the gate in order and unlocks the next chip");
```

- [ ] **Step 3: Add the new-surface assertions**

Insert after the `// 5m.` patient-lock block:

```js
// 5n. Turn-spotlight: the grid names the live pane, and the badge names the CHANNEL only.
const turnNow = await p.getAttribute(".aurora-station-grid", "data-turn");
if (turnNow !== "eyebot") die(`data-turn should be "eyebot" on a manual gate step, got "${turnNow}"`);
const badge = await p.locator('[data-testid="turn-badge"]').innerText();
if (!/EyeBot/.test(badge)) die(`turn badge must name the pane, got "${badge}"`);
if (/\d/.test(badge)) die(`turn badge must not leak a step number: "${badge}"`);
const dimmed = await p.evaluate(() => Number(getComputedStyle(document.querySelector(".aurora-patient")).opacity));
if (dimmed > 0.85) die(`inactive pane should be dimmed, opacity=${dimmed}`);
ok("turn-spotlight: data-turn set, badge names the channel, inactive pane dimmed");

// 5o. The case TOPIC must not appear in the station — it is the diagnosis on many cases.
const stationText = await p.locator(".aurora-station").innerText();
if (/glaucoma/i.test(stationText)) die("the case topic leaked into the station (spoils the diagnosis)");
ok("case topic absent from the station");

// 5p2. "?" help opens, is labelled, and closes.
await p.locator('[data-testid="help-station"]').click();
await p.waitForSelector('[data-testid="help-modal"]', { timeout: 4000 });
const helpText = await p.locator('[data-testid="help-modal"]').innerText();
if (!/tick/i.test(helpText)) die("station help must explain that the checklist ticks itself");
await p.keyboard.press("Escape");
if (await p.locator('[data-testid="help-modal"]').count()) die("Escape must close the help modal");
ok("'?' help opens, explains the checklist, closes on Escape");
```

The `data-testid="station-coach"` overlay will be up on first load — dismiss it right after
the station appears. Insert immediately after the existing
`await p.waitForSelector('[data-testid="station"]', ...)` on the **first** `goto`:

```js
// The first-run coach-mark is up on a fresh profile — walk it, which also proves it renders.
if (await p.locator('[data-testid="station-coach"]').count()) {
  for (let i = 0; i < 3 && (await p.locator('[data-testid="coach-next"]').count()); i++) {
    await p.locator('[data-testid="coach-next"]').click();
  }
  ok("first-run coach-mark renders and completes");
}
```

- [ ] **Step 4: Run the harness**

```bash
bash scripts/start-harness.sh station
```
Expected: `ALL STATION ASSERTIONS PASSED`. If the build is stale, the harness rebuilds;
never run two sweeps at once.

- [ ] **Step 5: Wire the new logic tests into CI**

In `.github/workflows/ci.yml`, after the `station_gate_logic.mjs` line, add:

```yaml
          node --experimental-strip-types tests/station_mask_logic.mjs
          node --experimental-strip-types tests/station_turn_logic.mjs
          node --experimental-strip-types tests/station_help_logic.mjs
```

- [ ] **Step 6: Record the lock amendment**

In `docs/design-locks.md`, append to the
`## Virtual Patients / OSCE Station — LOCKED 2026-06-25` section:

```markdown
- **Clarity, recall & transparency (2026-07-29, user-directed + Branda feedback)** — criteria
  changed: *(1) checklist interactivity — tap-to-tick REMOVED, the checklist is a read-only
  instrument; (2) information disclosure — upcoming steps and the case topic are progressively
  revealed rather than shown at load; (3) attentional state — panes carry an explicit
  active/inactive treatment driven by `data-turn`.* Drivers: students were ticking rows
  instead of doing the work and could not tell where to act; Branda reported the sidebar
  revealed the diagnosis and the tick-boxes replaced recall. Mechanics are made LOUD (turn
  spotlight, `?` help, first-run coach-mark, stuck-valve); clinical content is made EARNED
  (masked future steps, no topic). **Acceptance when refining**: checklist rows are never
  interactive; no future step's action text appears in the DOM; `data-turn` matches the gate
  step; turn badges never contain a step number or clinical action; the case topic never
  renders inside `.aurora-station` before the debrief; 390px no-overflow preserved; station +
  rotate-gate + aurora asserts green. **Out of scope**: gating order, the triptych structure,
  the warm/cool identity, the handover flow, the two-scheme grade.
```

- [ ] **Step 7: Full Phase 1 gate**

```bash
python -m pytest -q
```
Expected: all pass.

```bash
cd frontend && npm run typecheck && npm run build
```
Expected: clean build.

- [ ] **Step 8: Commit and push Phase 1**

```bash
git add frontend/tests/station_assert.mjs .github/workflows/ci.yml docs/design-locks.md
git commit -m "test(station): harness advances by consulting, not by clicking rows"
git fetch origin main && git status
git push origin main
```

---

# PHASE 2

## Task 10: Case timer

**Files:**
- Create: `frontend/src/aurora/lib/stationTimer.ts`
- Test: `frontend/tests/station_timer_logic.mjs`
- Modify: `frontend/src/aurora/screens/CaseSession.tsx`, `frontend/src/aurora/aurora.css`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/station_timer_logic.mjs`:

```js
/* Pure unit test for stationTimer.
   Run: node --experimental-strip-types frontend/tests/station_timer_logic.mjs

   Branda: "There is no time limit for completing each case." Every case already carries
   estimated_minutes; this turns it into OSCE pace WITHOUT ever destroying work — the tone
   escalates, the countdown goes negative, and nothing auto-submits. */
import assert from "node:assert";
import { timerState, formatClock } from "../src/aurora/lib/stationTimer.ts";

const MIN = 60_000;
const at = (elapsedMs, mins = 10) => timerState(0, elapsedMs, mins);

// Tone thresholds. WARN_MS is 2 minutes remaining.
assert.strictEqual(at(0).tone, "calm", "fresh start is calm");
assert.strictEqual(at(7 * MIN).tone, "calm", "3 min left is still calm");
assert.strictEqual(at(8 * MIN).tone, "warn", "exactly 2 min left → warn");
assert.strictEqual(at(9 * MIN).tone, "warn", "1 min left → warn");
assert.strictEqual(at(10 * MIN).tone, "over", "exactly 0 left → over");
assert.strictEqual(at(12 * MIN).tone, "over", "past the limit stays over");

// Remaining time is signed, so the UI can show how far over they ran.
assert.strictEqual(at(4 * MIN).remainingMs, 6 * MIN);
assert.strictEqual(at(13 * MIN).remainingMs, -3 * MIN);

// Elapsed is what the debrief and the export record.
assert.strictEqual(at(4 * MIN).elapsedMs, 4 * MIN);

// A missing/zero estimate must not produce a timer that is instantly "over".
assert.strictEqual(timerState(0, 5 * MIN, 0).tone, "none", "no estimate → no timer");
assert.strictEqual(timerState(0, 5 * MIN, 0).label, "", "no estimate → no label");

// Clock formatting, including over-run.
assert.strictEqual(formatClock(9 * MIN + 5_000), "9:05");
assert.strictEqual(formatClock(0), "0:00");
assert.strictEqual(formatClock(-90_000), "-1:30", "over-run reads as negative");
assert.strictEqual(formatClock(-1_000), "-0:01");

console.log("station_timer_logic: all assertions passed");
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node --experimental-strip-types frontend/tests/station_timer_logic.mjs
```
Expected: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/aurora/lib/stationTimer.ts`:

```ts
// frontend/src/aurora/lib/stationTimer.ts
/* Station countdown. Pure — no React, no timers, no Date.now(): the caller supplies `now`,
   which is what makes it unit-testable.

   Branda (2026-07-29): "There is no time limit for completing each case." Every case
   already carries estimated_minutes. This turns that into exam pace WITHOUT a hard stop —
   a learning tool that deletes a student's work on a timer is worse than no timer, and the
   leave-forfeit rules already own the "don't abandon it" incentive. */

export type TimerTone = "none" | "calm" | "warn" | "over";

export interface TimerState {
  elapsedMs: number;
  /** Signed: negative once the student has run over. */
  remainingMs: number;
  tone: TimerTone;
  label: string;
}

const WARN_MS = 2 * 60_000;

export function timerState(startedAtMs: number, nowMs: number, estimatedMinutes: number): TimerState {
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  // No estimate ⇒ no timer at all, rather than one that reads "over" from the first second.
  if (!estimatedMinutes || estimatedMinutes <= 0) {
    return { elapsedMs, remainingMs: 0, tone: "none", label: "" };
  }
  const remainingMs = estimatedMinutes * 60_000 - elapsedMs;
  const tone: TimerTone = remainingMs <= 0 ? "over" : remainingMs <= WARN_MS ? "warn" : "calm";
  return { elapsedMs, remainingMs, tone, label: formatClock(remainingMs) };
}

/** m:ss, negative when over-run ("-1:30"). */
export function formatClock(ms: number): string {
  const neg = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${neg ? "-" : ""}${mins}:${String(secs).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
node --experimental-strip-types frontend/tests/station_timer_logic.mjs
```
Expected: `station_timer_logic: all assertions passed`

- [ ] **Step 5: Wire it into `CaseSession.tsx`**

Add the import:

```tsx
import { timerState } from "@/aurora/lib/stationTimer";
```

Add state — the start is a ref so a re-render can never reset the clock:

```tsx
  // Case clock. startedAt is a ref (a re-render must never restart it); `nowMs` ticks once
  // a second only while the station is live, so a graded station stops costing renders.
  const startedAt = useRef<number>(Date.now());
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!station || result) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [station, result]);
  const clock = timerState(startedAt.current, nowMs, caseInfo?.estimated_minutes ?? 0);
```

Render the chip in the HUD, after the tier span:

```tsx
              {clock.tone !== "none" && (
                <>
                  <span className="aurora-station-hud-sep">·</span>
                  <span className="aurora-station-clock" data-tone={clock.tone} data-testid="station-clock">
                    {clock.tone === "over" ? "Time's up" : clock.label}
                  </span>
                </>
              )}
```

And a persistent, non-modal prompt — insert immediately after the `<div className="aurora-station-grid" ...>` block closes, before the submit overlay:

```tsx
      {clock.tone === "over" && !result && (
        <p className="aurora-station-overtime" data-testid="station-overtime">
          Time's up — write your handover now. Nothing is lost; the clock is for pace only.
        </p>
      )}
```

- [ ] **Step 6: Style it**

Append to `frontend/src/aurora/aurora.css`:

```css
/* Case clock — OSCE pace, never a guillotine. */
.aurora-station-clock { font-variant-numeric: tabular-nums; font-weight: 700; }
.aurora-station-clock[data-tone="warn"] { color: #b26a00; }
.aurora-station-clock[data-tone="over"] { color: #b3261e; }
.aurora-station-overtime {
  margin: 6px 0 0; padding: 8px 12px; border-radius: 12px; text-align: center;
  font-size: 13.5px; color: #b3261e; background: rgba(179,38,30,.08);
  border: 1px solid rgba(179,38,30,.2);
}
```

- [ ] **Step 7: Verify and commit**

```bash
node --experimental-strip-types frontend/tests/station_timer_logic.mjs
cd frontend && npm run typecheck
```
Expected: assertions pass, typecheck clean.

```bash
git add frontend/src/aurora/lib/stationTimer.ts frontend/tests/station_timer_logic.mjs frontend/src/aurora/screens/CaseSession.tsx frontend/src/aurora/aurora.css
git commit -m "feat(station): soft case countdown from the case's own estimated_minutes"
```

---

## Task 11: Patient answers like a real patient

**Files:**
- Modify: `tools/api/shared.py`
- Modify: `tools/api/routers/cases.py`
- Test: `tests/test_patient_prompt.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_patient_prompt.py`:

```python
"""The virtual patient must talk like a patient, not like a case file.

Branda (2026-07-29): "The patient responses do not feel very realistic. In actual practice,
patients would typically provide shorter, less structured answers rather than a complete
history all at once." The old prompt forbade volunteering but never constrained LENGTH or
REGISTER, and max_tokens=1536 left room for an essay.
"""
import re

from tools.api.shared import PATIENT_SYSTEM


def test_prompt_caps_the_answer_length():
    assert re.search(r"one or two short sentences", PATIENT_SYSTEM, re.I)


def test_prompt_forbids_delivering_a_structured_history():
    assert re.search(r"never .*(whole|full|complete|structured) (story|history)", PATIENT_SYSTEM, re.I)


def test_prompt_asks_for_lay_vagueness():
    # A real patient says "maybe Tuesday?", not "3 days of progressive blurring".
    assert re.search(r"vague|unsure|approximate", PATIENT_SYSTEM, re.I)


def test_prompt_still_forbids_revealing_the_diagnosis():
    # Pre-existing guarantee — brevity edits must not drop it.
    assert "Do NOT reveal the diagnosis" in PATIENT_SYSTEM


def test_chat_max_tokens_is_a_structural_backstop():
    """Prompt drift alone must not be able to bring the essay back."""
    src = (__import__("pathlib").Path("tools/api/routers/cases.py")).read_text(encoding="utf-8")
    chat = src.split("def case_chat(")[1].split("def ")[0]
    caps = [int(n) for n in re.findall(r"max_tokens=(\d+)", chat)]
    assert caps and max(caps) <= 320, f"case chat max_tokens too high: {caps}"
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python -m pytest tests/test_patient_prompt.py -q
```
Expected: 4 failures (the diagnosis test already passes).

- [ ] **Step 3: Rewrite the prompt rules**

In `tools/api/shared.py`, replace the `IMPORTANT RULES:` block of `PATIENT_SYSTEM` with:

```python
PATIENT_SYSTEM = """You are playing the role of a patient in a clinical case simulation for ophthalmic professionals.

IMPORTANT RULES:
- Answer ONLY what the student directly asks. Do not volunteer extra information.
- Reply in one or two short sentences. This is a conversation, not a statement.
- NEVER deliver your whole story at once. If asked something broad ("tell me what happened"),
  give only the headline and let the student ask follow-up questions to get the rest.
- Stay in character as the patient — use lay language, not medical terminology.
- Real patients are vague and unsure about detail. Approximate dates and hedge when it is
  natural to ("a few days ago, maybe Tuesday?") instead of reciting precise clinical timelines.
- Show the mood the case describes — worried, rushed, embarrassed — in how you answer.
- If the student asks to verify your identity, give your name, NRIC, date of birth,
  address or contact number EXACTLY as recorded in the case details below. Do not
  invent identity details and do not volunteer them unless asked.
- If the student asks for examination findings or investigation results, provide them as an examiner would.
- If the student asks to examine you, describe findings from the case.
- When the student says they are ready to give a diagnosis or management plan, acknowledge it.
- Do NOT reveal the diagnosis or correct answers — wait for the student to conclude.

Case details for your reference (do not reveal unless asked):
{case_json}"""
```

- [ ] **Step 4: Lower the ceiling**

In `tools/api/routers/cases.py`, inside `case_chat`'s `sse_stream`, replace:

```python
                # A patient turn is a few lay-language sentences — 1536 is a safe ceiling.
                max_tokens=1536,
```

with:

```python
                # A patient turn is one or two short sentences (PATIENT_SYSTEM). 320 is a
                # STRUCTURAL backstop: prompt drift alone must not bring the essay back.
                max_tokens=320,
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
python -m pytest tests/test_patient_prompt.py -q
```
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add tools/api/shared.py tools/api/routers/cases.py tests/test_patient_prompt.py
git commit -m "fix(cases): virtual patient answers briefly, vaguely, one thing at a time"
```

---

## Task 12: Scoring breakdown from the function that owns the formula

**Files:**
- Modify: `tools/cases/station_score.py`
- Modify: `tools/api/routers/cases.py`
- Test: `tests/test_station_score_breakdown.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_station_score_breakdown.py`:

```python
"""Every number in the debrief must be traceable to an input.

Branda (2026-07-29): "it is not clear why specific scores are awarded for domains such as
Consultation & Technique, Clinical Judgment, and Safety."

The breakdown is emitted by compute_station_score — the function that already owns the
formula — so the frontend renders it rather than recomputing it. That is the whole point:
a duplicated formula in TypeScript would drift the first time the weighting changed.
"""
from tools.cases.station_score import compute_station_score

STEPS = [
    {"step_number": 1, "action": "Identify patient", "critical": True},
    {"step_number": 2, "action": "Explain procedure", "critical": False},
]
GOOD = {"history": 8, "investigations": 7, "diagnosis": 9, "management": 6}


def test_parts_explain_the_consult_total():
    out = compute_station_score(GOOD, STEPS, [1, 2], has_manual=True)
    consult = out["breakdown"]["consult"]
    assert [p["label"] for p in consult["parts"]] == ["History-taking", "Examination technique"]
    assert [p["pts"] for p in consult["parts"]] == [8, 7]
    assert consult["total"] == out["consult_technique"]
    assert consult["max"] == 50
    assert consult["capped"] is False


def test_conversation_only_cases_show_history_alone():
    """No procedures ⇒ no phantom technique score in the explanation."""
    out = compute_station_score(GOOD, STEPS, [1, 2], has_manual=False)
    parts = out["breakdown"]["consult"]["parts"]
    assert [p["label"] for p in parts] == ["History-taking"]
    assert out["breakdown"]["consult"]["total"] == out["consult_technique"]


def test_judgement_parts_explain_its_total_when_safe():
    out = compute_station_score(GOOD, STEPS, [1, 2], has_manual=True)
    judgement = out["breakdown"]["judgement"]
    assert [p["label"] for p in judgement["parts"]] == ["Recognition", "Handover & escalation"]
    assert judgement["total"] == out["judgement_safety"]
    assert judgement["capped"] is False
    assert judgement["cap_reason"] == ""


def test_safety_cap_is_explained_and_names_the_missed_step():
    """Step 1 is critical and was NOT performed."""
    out = compute_station_score(GOOD, STEPS, [2], has_manual=True)
    judgement = out["breakdown"]["judgement"]
    assert out["safe"] is False
    assert judgement["capped"] is True
    assert "Identify patient" in judgement["cap_reason"]
    assert "0.6" in judgement["cap_reason"]
    assert judgement["total"] == out["judgement_safety"]


def test_breakdown_totals_always_match_the_headline_score():
    for performed in ([], [1], [1, 2]):
        for has_manual in (True, False):
            out = compute_station_score(GOOD, STEPS, performed, has_manual=has_manual)
            b = out["breakdown"]
            assert b["consult"]["total"] + b["judgement"]["total"] == out["score_100"]
```

- [ ] **Step 2: Run it to verify it fails**

```bash
python -m pytest tests/test_station_score_breakdown.py -q
```
Expected: 5 failures — `KeyError: 'breakdown'`.

- [ ] **Step 3: Emit the breakdown**

In `tools/cases/station_score.py`, immediately before the `return {` statement, add:

```python
    # The explanation of the two schemes, emitted HERE because this function owns the
    # formula — a duplicate in the frontend would drift the first time weighting changed.
    # Branda (2026-07-29): students couldn't tell why each domain scored what it did.
    consult_parts = [{"label": "History-taking", "pts": hist, "max": 10}]
    if has_manual:
        consult_parts.append({"label": "Examination technique", "pts": inv, "max": 10})
    cap_reason = (
        f"×{SAFETY_CAP} safety cap — critical step missed: {missed_critical[0]}"
        if missed_critical else ""
    )
    breakdown = {
        "consult": {
            "parts": consult_parts, "total": consult_technique, "max": 50,
            "capped": False, "cap_reason": "",
        },
        "judgement": {
            "parts": [
                {"label": "Recognition", "pts": dia, "max": 10},
                {"label": "Handover & escalation", "pts": mng, "max": 10},
            ],
            "total": judgement_safety, "max": 50,
            "capped": not safe, "cap_reason": cap_reason,
        },
    }
```

and add `"breakdown": breakdown,` to the returned dict, after `"critical_total": crit_total,`.

Update the module docstring's closing line to mention it:

```python
The legacy /40 (total_score) is kept for difficulty progression and staff dashboards.
`breakdown` explains both schemes to the student — the sub-scores behind each total and the
safety cap when it fires — so every number in the debrief is traceable to an input.
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
python -m pytest tests/test_station_score_breakdown.py -q
```
Expected: 5 passed.

- [ ] **Step 5: Put it on the wire**

In `tools/api/routers/cases.py`, add these models immediately **above** `class DomainScore(BaseModel):`:

```python
class ScorePart(BaseModel):
    label: str
    pts: int
    max: int


class SchemeBreakdown(BaseModel):
    parts: list[ScorePart] = []
    total: int = 0
    max: int = 50
    capped: bool = False
    cap_reason: str = ""


class ScoreBreakdown(BaseModel):
    consult: SchemeBreakdown = SchemeBreakdown()
    judgement: SchemeBreakdown = SchemeBreakdown()
```

Add to `DomainScore`, after `missed_critical: list[str] = []`:

```python
    # Why each scheme scored what it did — sub-scores + the safety cap. Additive with a
    # default, so an older frontend during a deploy window simply ignores it.
    breakdown: ScoreBreakdown = ScoreBreakdown()
```

In `case_submit`, add to the `domain_fields.update({...})` block, after `"critical_total": score["critical_total"],`:

```python
        "breakdown": score["breakdown"],
```

- [ ] **Step 6: Verify the whole suite**

```bash
python -m pytest -q
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add tools/cases/station_score.py tools/api/routers/cases.py tests/test_station_score_breakdown.py
git commit -m "feat(station): emit the scoring breakdown behind both schemes"
```

---

## Task 13: Render the rationale in the debrief

**Files:**
- Modify: `frontend/src/aurora/screens/CaseSession.tsx`, `frontend/src/aurora/aurora.css`

The per-domain feedback has been arriving from the API and being discarded this whole time.

- [ ] **Step 1: Extend the frontend types**

In `CaseSession.tsx`, add above `interface DomainResult`:

```tsx
interface ScorePart { label: string; pts: number; max: number }
interface SchemeBreakdown { parts: ScorePart[]; total: number; max: number; capped: boolean; cap_reason: string }
interface ScoreBreakdown { consult: SchemeBreakdown; judgement: SchemeBreakdown }
```

and add to `DomainResult`:

```tsx
  breakdown?: ScoreBreakdown;
```

- [ ] **Step 2: Rewrite the component cards**

In `StationResult`, replace the `comps` array and the `.aurora-s100-comps` block with:

```tsx
  // Branda (2026-07-29): students couldn't tell why each scheme scored what it did. The
  // sub-scores come from the backend (it owns the formula) and the per-domain feedback has
  // been on the wire all along — the UI just never rendered it.
  const comps = [
    {
      label: "Consultation & Technique",
      pts: result.consult_technique, max: result.consult_technique_max,
      sub: "History-taking and how well you performed the examination(s)",
      breakdown: result.breakdown?.consult,
      notes: [result.history_feedback, result.investigations_feedback].filter(Boolean),
    },
    {
      label: "Clinical Judgement & Safety",
      pts: result.judgement_safety, max: result.judgement_safety_max,
      sub: "Spotting the problem, triage, escalation & handover",
      breakdown: result.breakdown?.judgement,
      notes: [result.diagnosis_feedback, result.management_feedback].filter(Boolean),
    },
  ];
```

```tsx
      <div className="aurora-s100-comps">
        {comps.map((c) => (
          <div key={c.label} className="aurora-s100-comp">
            <div className="aurora-s100-comp-top"><span>{c.label}</span><b>{c.pts}<small>/{c.max}</small></b></div>
            <div className="aurora-s100-bar"><div style={{ width: `${c.max ? (c.pts / c.max) * 100 : 0}%` }} /></div>
            <span className="aurora-s100-comp-sub">{c.sub}</span>
            {c.breakdown && c.breakdown.parts.length > 0 && (
              <p className="aurora-s100-maths" data-testid="score-maths">
                {c.breakdown.parts.map((p) => `${p.label} ${p.pts}/${p.max}`).join(" · ")}
                {" → "}
                <b>{c.breakdown.total}/{c.breakdown.max}</b>
              </p>
            )}
            {c.breakdown?.capped && c.breakdown.cap_reason && (
              <p className="aurora-s100-cap" data-testid="score-cap">⚠ {c.breakdown.cap_reason}</p>
            )}
            {c.notes.map((n, i) => <p key={i} className="aurora-s100-why">{n}</p>)}
          </div>
        ))}
      </div>
```

- [ ] **Step 3: Style it**

Append to `frontend/src/aurora/aurora.css`:

```css
/* Score rationale — the arithmetic behind each scheme, plus the grader's own words. */
.aurora-s100-maths {
  margin: 7px 0 0; font-size: 12.5px; color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
.aurora-s100-maths b { color: var(--ink-2); }
.aurora-s100-cap {
  margin: 5px 0 0; font-size: 12.5px; color: #b3261e;
}
.aurora-s100-why {
  margin: 6px 0 0; font-size: 13.5px; line-height: 1.5; color: var(--ink-2);
}
```

- [ ] **Step 4: Verify and commit**

```bash
cd frontend && npm run typecheck
```
Expected: clean.

```bash
git add frontend/src/aurora/screens/CaseSession.tsx frontend/src/aurora/aurora.css
git commit -m "feat(station): debrief explains why each scheme scored what it did"
```

---

## Task 14: Chat continuity, handover copy, export — and the final gate

**Files:**
- Modify: `frontend/src/aurora/screens/CaseSession.tsx`
- Modify: `frontend/src/aurora/lib/sessionExport.ts`
- Modify: `tools/api/routers/cases.py`
- Modify: `frontend/tests/station_assert.mjs`

- [ ] **Step 1: Make chat failures legible**

In `CaseSession.tsx`'s `sendMessage`, replace:

```tsx
      if (!res.ok || !res.body) throw new Error("Stream unavailable");
```

with:

```tsx
      // Branda (2026-07-29): "after multiple queries the AI is unable to continue". Every
      // non-OK response used to collapse into one dead string, so a rate-limit was
      // indistinguishable from a crash and the consult looked broken. Name the cause.
      if (res.status === 429) throw new Error("rate");
      if (!res.ok || !res.body) throw new Error("down");
```

and replace the `catch` block's fallback with:

```tsx
    } catch (err) {
      const fb = (err as Error)?.message === "rate"
        ? "(You're sending faster than the patient can answer — give it a moment, then continue.)"
        : "(I'm having trouble reaching the service right now.)";
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant" && last.channel === "patient")
          return [...prev.slice(0, -1), { ...last, content: fb }];
        return [...prev, { role: "assistant", content: fb, channel: "patient" }];
      });
    } finally {
```

- [ ] **Step 2: Raise the station chat ceiling**

In `tools/api/routers/cases.py`, change the chat limiter:

```python
@router.post("/api/cases/{case_id}/chat")
# /observe fires on every turn too, so a real consult costs two calls per message — 30 was
# tighter than it looked and read to students as "the AI stopped working" (Branda).
@limiter.limit("60/minute")
```

- [ ] **Step 3: Soften the handover copy**

In the handover form, replace the hint and the recommendation placeholder:

```tsx
                <p className="aurora-station-form-hint">You're documenting a handover — what you found and what you recommend, within your role. You don't make a medical diagnosis or prescribe treatment; that's for the doctor. Not every case needs escalation: if nothing is urgent, say so — "routine, patient follows appointment time" is a complete answer.</p>
```

```tsx
                <textarea className="aurora-input" data-field="recommendation" value={recommendation} onChange={(e) => setRecommendation(e.target.value)} placeholder="What happens next — continue as routine, or escalate/refer (say who, and how urgently), plus what you'd advise the patient…" rows={3} />
```

- [ ] **Step 4: Put time and self-marks in the saved record**

In `frontend/src/aurora/lib/sessionExport.ts`, extend the interface:

```ts
  meta: {
    caseId: string; caseTitle: string; patientName: string; patientAge: number | string;
    topic: string; difficulty: string; studentName: string; dateStr: string;
    /** Wall-clock time the student took, "m:ss". Empty when the case had no estimate. */
    timeTaken?: string;
  };
  checklist: { phase: string; action: string; critical: boolean; done: boolean; selfMarked?: boolean }[];
```

Find where `meta.dateStr` is rendered in the HTML template and add the time beside it, e.g.:

```ts
      ${esc(data.meta.dateStr)}${data.meta.timeTaken ? ` · took ${esc(data.meta.timeTaken)}` : ""}
```

Find where a checklist row's done state is rendered and mark self-marked rows honestly —
they were never examiner-verified:

```ts
        ${row.done ? (row.selfMarked ? "— self-marked" : "✓ done") : "○ not done"}
```

In `CaseSession.tsx`'s `handleSave`, supply both:

```tsx
    const checklist = station.checklist.phases.flatMap((p) =>
      p.steps.map((s) => ({
        phase: p.name, action: s.action, critical: s.critical,
        done: ticked.has(s.step_number), selfMarked: selfMarked.has(s.step_number),
      })),
    );
```

and add to `meta`:

```tsx
        studentName: displayName(user?.fullName, "Student"), dateStr: new Date().toLocaleString(),
        timeTaken: formatClock(clock.elapsedMs),
```

importing `formatClock` alongside `timerState`.

- [ ] **Step 5: Add the Phase 2 harness assertions**

In `frontend/tests/station_assert.mjs`, after the existing debrief assertions
(`ok("debrief: 2 scheme cards /50, ...")`), add:

```js
// 7d. The debrief explains itself: the arithmetic behind each scheme plus the grader's own
//     per-domain words, which the UI used to receive and throw away.
if ((await p.locator('[data-testid="score-maths"]').count()) !== 2) die("both schemes must show their sub-scores");
const maths = await p.locator('[data-testid="score-maths"]').first().innerText();
if (!/\d+\/10/.test(maths)) die(`score maths must show sub-scores out of 10, got "${maths}"`);
const debriefText = await p.locator(".aurora-station-result").innerText();
if (!debriefText.includes("Thorough.")) die("per-domain feedback (history) not rendered");
if (!debriefText.includes("Reasonable.")) die("per-domain feedback (management) not rendered");
ok("debrief shows the scoring rationale + per-domain feedback");

// 7e. The topic is safe to reveal now the station is over.
if (!/glaucoma/i.test(debriefText)) die("the debrief should finally name the topic");
ok("topic revealed in the debrief");
```

Add the `breakdown` to the mocked submit response so those assertions have data — inside the
`result` object of the `**/api/cases/C001/submit` route:

```js
    breakdown: {
      consult: { parts: [{ label: "History-taking", pts: 8, max: 10 }, { label: "Examination technique", pts: 7, max: 10 }], total: 38, max: 50, capped: false, cap_reason: "" },
      judgement: { parts: [{ label: "Recognition", pts: 9, max: 10 }, { label: "Handover & escalation", pts: 6, max: 10 }], total: 40, max: 50, capped: false, cap_reason: "" },
    },
```

And assert the timer, after the station loads on C001:

```js
// 5t. The case clock renders and counts down from the case's estimated_minutes.
if (!(await p.locator('[data-testid="station-clock"]').count())) die("station must show the case clock");
ok("case clock renders");
```

- [ ] **Step 6: Full gate**

```bash
python -m pytest -q
```
Expected: all pass.

```bash
cd frontend && npm run typecheck && npm run build
```
Expected: clean build.

```bash
bash scripts/start-harness.sh station
```
Expected: `ALL STATION ASSERTIONS PASSED`.

```bash
bash scripts/start-harness.sh aurora
```
Expected: `ALL AURORA ASSERTIONS PASSED` — `/cases` gained a help button, so this must
confirm the selection page is unbroken.

- [ ] **Step 7: Commit and push Phase 2**

```bash
git add frontend/src/aurora/screens/CaseSession.tsx frontend/src/aurora/lib/sessionExport.ts tools/api/routers/cases.py frontend/tests/station_assert.mjs
git commit -m "fix(cases): legible chat limits, scenario-fair handover, richer session record"
git fetch origin main && git status
git push origin main
```

---

## Self-Review

**Spec coverage:** P1.1→T3, P1.2→T5, P1.3→T2+T4, P1.4→T6, P1.5→T7, P1.6→T8,
P2.1→T11, P2.2→T10, P2.3→T14, P2.4→T14, P2.5→T12+T13. Testing section→T1/T2/T7/T10/T11/T12
(unit) + T9/T14 (harness). Design-lock amendment→T9. No spec section is unimplemented.

**Placeholders:** none — every code step carries complete code, every command carries an
expected result.

**Type consistency:** `stepDisplay`/`isRevealed`/`maskFor` (T1) are consumed with those exact
names in T3. `stationTurn` returns `{turn, badge}` (T2), destructured as such in T4.
`selfMarked: Set<number>` is created in T3, written in T6, read in T3/T14.
`ScoreBreakdown.consult|judgement` (T12) matches the frontend interface and the harness mock
(T13/T14). `timerState`/`formatClock` (T10) are both imported in T14.

**One risk carried deliberately:** Task 3 deletes the manual tick before Task 6 adds the
stuck-valve, so a checkout between those two commits has no recovery path if `/observe`
misses a step. They are adjacent and both land in the Phase 1 push, so `main` is never in
that state — but do not push between them.
