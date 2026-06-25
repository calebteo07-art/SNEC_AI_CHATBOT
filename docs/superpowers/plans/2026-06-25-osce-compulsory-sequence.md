# Compulsory In-Sequence OSCE Checklist — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Guided OSCE Station checklist compulsory to complete in clinical order — steps unlock one at a time; later steps + exam-tray chips are locked until their turn.

**Architecture:** Frontend-only "gate". A single pure helper module derives the gate (= first un-ticked step in clinical order) and reconciles every completion source (auto-examiner, exam-tray, manual tap) into strict in-order ticking. The checklist + exam-tray render current/locked/done states; talking to the patient and submit/scoring are untouched (order is guaranteed upstream). The backend `/observe` and `tools/cases/*` are unchanged.

**Tech Stack:** Next.js (App Router) + React + TypeScript; CSS in `frontend/src/aurora/aurora.css`; Playwright harness `frontend/tests/station_assert.mjs` (the only frontend test mechanism — no unit runner installed).

**Spec:** `docs/superpowers/specs/2026-06-25-osce-station-compulsory-sequence-design.md`

---

## File structure

- **Create** `frontend/src/aurora/lib/stationGate.ts` — pure gate logic (`gateIndex`, `currentStep`, `advance`). No React, no I/O.
- **Modify** `frontend/src/aurora/screens/CaseSession.tsx` — use the helpers in `addAuto` (observer + exam-tray) and `toggleStep` (manual fallback / single-step-back); derive `gateStep`; pass it to the two child components.
- **Modify** `frontend/src/aurora/components/StationChecklist.tsx` — add `current` prop; render current/locked/done rows (🔒 glyph, disabled locked rows, `aria-current`); add the in-order help caption.
- **Modify** `frontend/src/aurora/components/ActionPalette.tsx` — add `current` prop; lock chips whose turn hasn't come (dim + disabled + 🔒 glyph + tooltip).
- **Modify** `frontend/src/aurora/aurora.css` — `data-current` / `data-locked` row styles, locked-chip style, help-caption style, reduced-motion entry.
- **Modify** `frontend/tests/station_assert.mjs` — adjust the 5a flow (step 3 is now locked at load) and add gating assertions.

**Convention notes for the implementer (this codebase):**
- `phases.flatMap(p => p.steps)` reproduces the true clinical order — gate by **position in that flat list**, never by assuming `step_number` is globally contiguous.
- All tick state is owned by `CaseSession`; the child components are presentational.
- `tickedRef` / `messagesRef` mirror state for use inside callbacks; follow that pattern for `orderRef`.
- The harness mocks every `/api/**` route and runs against a built+served app (no live backend).

---

## Task 1: Pure gate helpers

**Files:**
- Create: `frontend/src/aurora/lib/stationGate.ts`

- [ ] **Step 1: Write the pure module**

```ts
// frontend/src/aurora/lib/stationGate.ts
/* Pure gate logic for the compulsory in-sequence OSCE checklist.
   The "gate" is the first step (in clinical order) not yet ticked; only that step
   is unlockable. These helpers reconcile any completion source (auto-examiner,
   exam-tray, manual tap) into strict in-order ticking. No React, no I/O.
   `order` is the list of step_numbers in clinical order (phases.flatMap → step_number). */

/** Index of the first ordered step not yet ticked (= count of leading done steps).
    Equals order.length when every step is done. Assumes the in-order invariant
    (everything before the gate is ticked), which the gated tick paths preserve. */
export function gateIndex(order: number[], ticked: ReadonlySet<number>): number {
  let i = 0;
  while (i < order.length && ticked.has(order[i])) i++;
  return i;
}

/** The step_number currently unlockable, or null when all steps are done. */
export function currentStep(order: number[], ticked: ReadonlySet<number>): number | null {
  const i = gateIndex(order, ticked);
  return i < order.length ? order[i] : null;
}

/** Return a NEW ticked set extended by the longest in-order run, starting at the
    gate, of steps present in `satisfied`. Out-of-order / far-ahead numbers are
    ignored until their predecessors are done (they tick later once the gate
    reaches them). Idempotent: returns an equal-size set when nothing unlocks. */
export function advance(order: number[], ticked: ReadonlySet<number>, satisfied: Iterable<number>): Set<number> {
  const sat = satisfied instanceof Set ? (satisfied as Set<number>) : new Set<number>(satisfied);
  const next = new Set(ticked);
  let i = gateIndex(order, next);
  while (i < order.length && sat.has(order[i])) {
    next.add(order[i]);
    i++;
  }
  return next;
}
```

- [ ] **Step 2: Type-check the module**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: no errors introduced (pre-existing baseline unchanged).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/lib/stationGate.ts
git commit -m "feat(osce): pure gate helpers for in-sequence checklist"
```

---

## Task 2: Gate the tick paths in CaseSession

**Files:**
- Modify: `frontend/src/aurora/screens/CaseSession.tsx`

**Context:** Today `addAuto` adds any step numbers to `ticked` + `autoSteps`; `toggleStep` toggles any step freely. We replace both with gated versions and add an `orderRef` (mirroring the existing `tickedRef` pattern) plus a derived `gateStep`.

- [ ] **Step 1: Import the helpers**

In the import block near the top (after the `ActionPalette` import, ~line 15), add:

```ts
import { advance, gateIndex, currentStep } from "@/aurora/lib/stationGate";
```

- [ ] **Step 2: Add `orderRef` and keep it in sync**

Below `const tickedRef = useRef<Set<number>>(new Set());` (~line 74), add:

```ts
  const orderRef = useRef<number[]>([]);
```

And below the existing `useEffect(() => { tickedRef.current = ticked; }, [ticked]);` (~line 78), add:

```ts
  useEffect(() => {
    orderRef.current = (station?.checklist.phases ?? []).flatMap((p) => p.steps).map((s) => s.step_number);
  }, [station]);
```

- [ ] **Step 3: Replace `addAuto` with the gated version**

Replace the whole `addAuto` callback (current lines ~94-98) with:

```ts
  // Apply any examiner / exam-tray completions through the gate: only the longest
  // in-order run starting at the current step is ticked. Newly-ticked steps are
  // marked auto (for the ✦ badge). Out-of-order detections are ignored until their
  // predecessors are done — the examiner re-sends the whole transcript, so they tick
  // once the gate reaches them.
  const addAuto = useCallback((stepNumbers: number[]) => {
    if (!stepNumbers.length) return;
    const prev = tickedRef.current;
    const next = advance(orderRef.current, prev, stepNumbers);
    if (next.size === prev.size) return; // nothing unlocked
    setTicked(next);
    setAutoSteps((a) => {
      const b = new Set(a);
      for (const s of next) if (!prev.has(s)) b.add(s);
      return b;
    });
  }, []);
```

- [ ] **Step 4: Replace `toggleStep` with the gated manual fallback**

Replace the whole `toggleStep` function (current lines ~136-145) with:

```ts
  // Manual control under strict gating: tapping the CURRENT row completes it (the
  // escape hatch when the examiner misses a step); tapping the most-recent done row
  // steps back one (recover a mis-tap). Locked / earlier-done rows are no-ops.
  const toggleStep = (n: number) => {
    const order = orderRef.current;
    const prev = tickedRef.current;
    const gi = gateIndex(order, prev);
    const cur = gi < order.length ? order[gi] : null;
    const lastDone = gi > 0 ? order[gi - 1] : null;
    if (n === cur) {
      setTicked((p) => { const x = new Set(p); x.add(n); return x; });
    } else if (n === lastDone && prev.has(n)) {
      setTicked((p) => { const x = new Set(p); x.delete(n); return x; });
      setAutoSteps((a) => { const b = new Set(a); b.delete(n); return b; });
    }
  };
```

- [ ] **Step 5: Derive `gateStep` and pass it to the children**

Find the derived block (~line 254):

```ts
  const phases = station?.checklist.phases ?? [];
  const allSteps: StationStep[] = phases.flatMap((p) => p.steps);
  const criticalSteps = allSteps.filter((s) => s.critical);
  const uncheckedCritical = criticalSteps.filter((s) => !ticked.has(s.step_number));
```

Add, immediately after it:

```ts
  const gateStep = currentStep(allSteps.map((s) => s.step_number), ticked); // current unlockable step, or null
```

In the `<StationChecklist ... />` element (~line 309-316) add the prop:

```tsx
                current={gateStep}
```

In the `<ActionPalette ... />` element (~line 367) add the prop:

```tsx
              current={gateStep}
```

- [ ] **Step 6: Type-check**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: errors only about `current` not existing on `StationChecklist`/`ActionPalette` props (fixed in Tasks 3 & 4). No other new errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/aurora/screens/CaseSession.tsx
git commit -m "feat(osce): gate the tick paths (observer/exam/manual) in CaseSession"
```

---

## Task 3: Current / locked / done rows + help caption in StationChecklist

**Files:**
- Modify: `frontend/src/aurora/components/StationChecklist.tsx`

- [ ] **Step 1: Add the `current` prop**

In the component signature (the destructured props object, ~lines 24-37), add `current` after `procedureName`:

```tsx
export function StationChecklist({
  procedureName,
  phases,
  ticked,
  autoSteps,
  current,
  onToggle,
}: {
  procedureName: string;
  phases: StationPhase[];
  totalSteps: number; // kept for call-site compatibility
  ticked: Set<number>;
  autoSteps: Set<number>;
  current: number | null;
  onToggle: (stepNumber: number) => void;
}) {
```

- [ ] **Step 2: Render current/locked/done state per row**

Replace the per-step `<button>` block (current lines ~75-93) with:

```tsx
            {p.steps.map((s) => {
              const isDone = ticked.has(s.step_number);
              const isAuto = isDone && autoSteps.has(s.step_number);
              const isCurrent = !isDone && s.step_number === current;
              const isLocked = !isDone && !isCurrent;
              return (
                <button
                  key={s.step_number}
                  type="button"
                  className="aurora-station-step"
                  data-ticked={isDone ? "true" : "false"}
                  data-current={isCurrent ? "true" : "false"}
                  data-locked={isLocked ? "true" : "false"}
                  disabled={isLocked}
                  onClick={() => onToggle(s.step_number)}
                  aria-pressed={isDone}
                  aria-current={isCurrent ? "step" : undefined}
                  title={isLocked ? "Unlocks after the step above" : undefined}
                >
                  <span className="bx" aria-hidden>{isDone ? "✓" : isLocked ? "🔒" : ""}</span>
                  <span>{s.action}</span>
                  {s.critical && <span className="crit">CRIT</span>}
                  {isAuto && <span className="au" title="Auto-detected from your consult" aria-label="auto-detected">✦</span>}
                </button>
              );
            })}
```

- [ ] **Step 3: Add the in-order help caption**

Immediately after the `<p className="aurora-station-cl-label" ...>` element (current lines ~61-63), add:

```tsx
      <p className="aurora-station-cl-help">Steps unlock in order — complete the current step to continue.</p>
```

- [ ] **Step 4: Type-check**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: the `StationChecklist`-prop error from Task 2 is gone; remaining error only about `ActionPalette` `current` (fixed in Task 4).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/components/StationChecklist.tsx
git commit -m "feat(osce): current/locked/done checklist rows + in-order help caption"
```

---

## Task 4: Lock exam-tray chips until their turn

**Files:**
- Modify: `frontend/src/aurora/components/ActionPalette.tsx`

- [ ] **Step 1: Add the `current` prop**

Replace the component signature block (current lines ~22-33) with:

```tsx
export function ActionPalette({
  actions,
  ticked,
  current,
  activeKey,
  onPerform,
}: {
  actions: ExamAction[];
  ticked: Set<number>;
  current: number | null;
  activeKey: string | null;
  onPerform: (action: ExamAction) => void;
}) {
```

- [ ] **Step 2: Compute + render the locked state per chip**

Replace the `.map` body (current lines ~39-58) with:

```tsx
        {manual.map((a) => {
          const done = a.satisfies_steps.every((n) => ticked.has(n));
          const earliest = a.satisfies_steps.find((n) => !ticked.has(n));
          const locked = !done && earliest !== undefined && earliest !== current;
          const active = a.key === activeKey;
          return (
            <button
              key={a.key}
              type="button"
              className="aurora-pchip"
              data-done={done ? "true" : "false"}
              data-active={active ? "true" : "false"}
              data-locked={locked ? "true" : "false"}
              data-crit={a.critical ? "true" : "false"}
              disabled={done || locked}
              onClick={() => onPerform(a)}
              aria-label={done ? `${a.label} — done` : locked ? `${a.label} — locked` : `Perform ${a.label}`}
              title={locked ? "Finish the steps above first" : a.reveal_text || a.label}
            >
              <span className="ic" aria-hidden>{done ? "✓" : active ? "✎" : locked ? "🔒" : "+"}</span>
              {a.label}
            </button>
          );
        })}
```

Note the `done` check changes from `.some(...)` to `.every(...)`: a merged chip satisfying several steps is only "done" once **all** its steps are ticked; before that its `earliest` unsatisfied step drives the lock.

- [ ] **Step 3: Type-check**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: clean (no new errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/components/ActionPalette.tsx
git commit -m "feat(osce): lock exam-tray chips until their step is current"
```

---

## Task 5: Styles for locked / current rows + chips

**Files:**
- Modify: `frontend/src/aurora/aurora.css`

- [ ] **Step 1: Add row + caption styles**

Immediately after the `.aurora-station-step .au { ... }` rule (current line ~1217), insert:

```css
.aurora-station-step[data-current="true"] { background: rgba(91,91,255,.07); box-shadow: inset 0 0 0 1.5px rgba(91,91,255,.32); }
.aurora-station-step[data-current="true"] .bx { border-color: var(--g-blue); animation: station-currentpulse 1.9s ease-in-out infinite; }
.aurora-station-step[data-locked="true"] { color: var(--ink-3); opacity: .55; cursor: not-allowed; }
.aurora-station-step[data-locked="true"]:hover { background: none; }
.aurora-station-step[data-locked="true"] .bx { border-style: dashed; background: rgba(255,255,255,.32); color: var(--ink-3); font-size: 10px; line-height: 15px; }
.aurora-station-step[data-locked="true"] .crit { opacity: .5; }
@keyframes station-currentpulse { 0%,100% { box-shadow: 0 0 0 0 rgba(91,91,255,.30); } 50% { box-shadow: 0 0 0 4px rgba(91,91,255,0); } }
.aurora-station-cl-help { margin: 1px 2px 9px; font-size: 11px; line-height: 1.5; color: var(--ink-3); }
```

- [ ] **Step 2: Add the locked-chip style**

Immediately after the `.aurora-pchip:disabled { cursor: default; }` rule (current line ~2827), insert:

```css
.aurora-pchip[data-locked="true"] { opacity: .5; border-style: dashed; cursor: not-allowed; }
.aurora-pchip[data-locked="true"] .ic { opacity: .8; }
```

- [ ] **Step 3: Disable the current-pulse under reduced motion**

Find the reduced-motion rule listing station animations to disable (current line ~1300, the selector group ending `... .aurora-station-pbar i { animation: none !important; }`). Add `.aurora-station-step[data-current="true"] .bx` to that selector list, e.g.:

```css
  .aurora-station-reveal::after, .aurora-station-step[data-ticked="true"] .bx, .aurora-station-step[data-current="true"] .bx, .aurora-station-pbar i { animation: none !important; }
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/aurora.css
git commit -m "style(osce): locked/current checklist rows, locked chips, help caption"
```

---

## Task 6: Update + extend the Playwright harness, then verify green

**Files:**
- Modify: `frontend/tests/station_assert.mjs`

**Why the existing flow must change:** the mock checklist's "Measure IOP" is step 3. Under gating it is **locked** until steps 1–2 are done, so the current 5a (which clicks it cold) would fail. We advance the gate in order first (manual current-row taps), assert the gating behavior, then run the existing 5a.

- [ ] **Step 1: Insert gating assertions + advance the gate before 5a**

In `frontend/tests/station_assert.mjs`, find assertion block 5 (ends with `ok("palette shows manual procedures only (verbal steps stay in chat)");`, ~line 131). Immediately **after** that `ok(...)` line and **before** the `// 5a.` comment (~line 133), insert:

```js
// 5g. Gating: at load nothing is ticked → gate is step 1. Later steps + their chips
//     must be locked, and the in-order help caption present.
if (!(await p.locator('.aurora-station-cl-help:has-text("unlock in order")').count())) die("missing the in-order help caption");
if (!(await p.locator('.aurora-pchip[data-locked="true"]:has-text("Measure IOP")').count())) die("Measure IOP chip must be locked before its turn");
if (await p.locator('.aurora-pchip:has-text("Measure IOP")').first().isEnabled()) die("locked Measure IOP chip must be disabled");
const lockedRows = await p.locator('.aurora-station-step[data-locked="true"]').count();
if (lockedRows < 4) die(`expected later rows locked at load, got ${lockedRows}`);
if (!(await p.locator('.aurora-station-step[data-current="true"]:has-text("Identify patient")').count())) die("step 1 must be the current step at load");
ok("gating: later steps + chips locked, step 1 current, help caption present");

// 5h. Manual fallback advances the gate one step at a time, in order, and unlocks
//     the next chip once its predecessors are done.
await p.locator('.aurora-station-step[data-current="true"]').click(); // tick step 1
if (!(await p.locator('.aurora-station-step[data-current="true"]:has-text("Explain purpose")').count())) die("gate did not advance to step 2 after current-row tap");
await p.locator('.aurora-station-step[data-current="true"]').click(); // tick step 2
if (!(await p.locator('.aurora-station-step[data-current="true"]:has-text("Measure IOP")').count())) die("gate did not advance to step 3");
if (await p.locator('.aurora-pchip[data-locked="true"]:has-text("Measure IOP")').count()) die("Measure IOP must unlock once steps 1-2 are done");
ok("gating: current-row tap advances the gate in order and unlocks the next chip");
```

(No other harness edits are needed — 5a now finds "Measure IOP" enabled because steps 1–2 are done; the rest of the flow is unchanged.)

- [ ] **Step 2: Build the frontend**

Run (from `frontend/`): `npm run build`
Expected: build succeeds (output: standalone).

- [ ] **Step 3: Stage the standalone server and start it**

Run (from `frontend/`, Bash tool / Git Bash):

```bash
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
node .next/standalone/server.js
```

Start that server in the background (it listens on `http://127.0.0.1:3000`). Note: `next start` is flaky under `output: standalone` in this repo — use the standalone server above.

- [ ] **Step 4: Run the harness**

Run (from `frontend/`, separate shell): `node tests/station_assert.mjs http://127.0.0.1:3000`
Expected: every assertion prints `PASS:` and the run ends with `ALL STATION ASSERTIONS PASSED` — including the new `5g` / `5h` gating lines and all pre-existing assertions (one h1, 3 phases, 6 rows, no merge-drop, independent scroll, palette-manual-only, the 5a procedure-mode flow, streaming reply, overlay debrief, no horizontal overflow at 390px, no console errors).

If anything fails, debug with `superpowers:systematic-debugging` (likely culprits: a `current`/`gateStep` not threaded through a prop, or a selector text mismatch). Stop the background server before rebuilding (it locks `.next/standalone`).

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/station_assert.mjs
git commit -m "test(osce): harness asserts in-order gating (locked rows/chips + gate advance)"
```

---

## Self-review (already applied)

- **Spec coverage:** strict gate (Tasks 1–2), auto-detect + manual fallback (Task 2 `addAuto`/`toggleStep`), exam-tray locking (Task 4), checklist current/locked/done + help text (Task 3), CSS (Task 5), frontend-only / backend untouched (no backend task), testing incl. updated 5a + new gating assertions (Task 6). Submit/scoring intentionally unchanged (spec). All covered.
- **Type consistency:** prop name `current: number | null` is identical across `CaseSession` (passes `gateStep`), `StationChecklist`, and `ActionPalette`. Helper names `gateIndex` / `currentStep` / `advance` match their imports and call sites. `advance(order, ticked, satisfied)` signature is used consistently in `addAuto`.
- **Placeholder scan:** none — every step shows the full code or exact command.
- **Behavioral note:** `ActionPalette` `done` changed `.some` → `.every` so a multi-step merged chip only reads "done" when all its steps are ticked; its `earliest` unsatisfied step drives the lock until then. Verified against the gate semantics in Task 1.
