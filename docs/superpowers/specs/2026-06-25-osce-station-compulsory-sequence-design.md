# OSCE Station — Compulsory In-Sequence Checklist

**Date:** 2026-06-25
**Status:** Approved design → ready for implementation plan
**Scope:** Frontend-only. No backend, DB, scoring, or Python changes.

## Problem

In the Guided OSCE Station (virtual patient), the checklist steps carry a clinical
order (`step_number`, grouped into 3 ordered phases), but **nothing enforces that
order**. A student can tick/perform steps in any sequence — manually, via the
exam-tray, or via the auto-examiner that reads the consult. Real OSCE procedures
require steps in a defined order (e.g. identify patient → explain → anaesthetic
drop → tonometry → document). We want completing the checklist **in the correct
sequence to be compulsory**.

## Decisions (locked with the user)

1. **Enforcement strength: strict — block everything.** No step (history questions
   included) can be ticked until every earlier step is done. This is the most
   literal reading of "compulsory".
2. **Advancing: auto-detect + manual fallback.** The auto-examiner ticks the
   current step when it sees it covered in the consult. If it misses, the student
   can tap **only the current step** to mark it done and move on. Later steps stay
   locked. No deadlocks; keeps the fill-in-as-you-go feel.
3. **Enforcement location: frontend-only.** Backend `/observe` and scoring already
   work on a coverage basis; once the UI guarantees in-order ticking, correct
   sequence holds *by construction*. Server-enforced gating was considered and
   rejected as YAGNI for a personal practice tool (clean follow-up if graded
   assessment ever needs tamper-proofing).

## Current architecture (as found)

- `GET /api/cases/{id}/station` returns the case, a phased checklist
  (`phases: [{phase, name, steps: [{step_number, action, critical, ...}]}]`), and
  `examination_actions` (exam-tray chips, each with `satisfies_steps: number[]`).
- Phases are **contiguous spans** of the source-ordered step list
  (`tools/cases/phase_split.py`), so on the frontend
  `phases.flatMap(p => p.steps)` reproduces the true clinical order. **Gate by
  position in that flat list**, not by raw `step_number` values (robust even if the
  numbers aren't globally contiguous).
- Steps tick three ways in `frontend/src/aurora/screens/CaseSession.tsx`:
  - **Auto-examiner**: `POST /observe` → `observe()` (`tools/cases/observe_steps.py`)
    returns *all* satisfied step numbers from the whole transcript; the client calls
    `addAuto(newly)`. It can report steps out of order / in batches.
  - **Exam-tray**: click a manual chip → type technique → `confirmProcedure()` →
    `addAuto(a.satisfies_steps)`.
  - **Manual tap**: `toggleStep(n)` toggles any row freely.
- Scoring (`tools/cases/station_score.py`) is pure coverage — `earned/possible`,
  critical-weighted. **Order is ignored** (and will remain so — order is now
  guaranteed upstream).

## The design

### Core concept — the gate

- `orderedSteps = phases.flatMap(p => p.steps)` — canonical clinical order.
- **gate** = the first step in `orderedSteps` whose `step_number` is not in `ticked`.
  Under strict gating the invariant "all steps before the gate are ticked" always
  holds, because we never tick out of order.
- Each step is exactly one of:
  - **done** — position `< gateIndex`
  - **current** — position `=== gateIndex` (the only newly-unlockable step)
  - **locked** — position `> gateIndex`
- When all steps are done, `gateIndex === orderedSteps.length` (no current step).

### The one ticking rule — `advanceGate(satisfied: Set<number>)`

Starting at `gateIndex`, while `orderedSteps[i].step_number ∈ satisfied`, tick that
step and advance `i`. Stop at the first ordered step **not** in `satisfied`.

- Examiner reports a batch `{1,2,3}` → all three tick in order.
- Examiner reports `{5}` while gate is at step 2 → **no-op**; 5 ticks later once the
  gate reaches it (the examiner re-reads the whole transcript each turn, so the
  evidence persists).

Callers:

| Tick source | Behavior |
|---|---|
| Auto-examiner (`/observe` result) | feed `union(ticked, newly)` through `advanceGate`; backend unchanged |
| Exam-tray confirm | chip is **locked** unless its earliest unsatisfied step is the current one; confirm runs `advanceGate(union(ticked, satisfies_steps))` |
| Manual tap on current row | tick exactly the current step (advance gate by 1) — the always-available escape hatch for a missed detection |
| Tap on a locked row | no-op (optional subtle hint/shake) |
| Un-tap | allowed **only** on the last-done step (`gateIndex - 1`) to recover a mis-tap |

### Auto-examiner reconciliation

`runObserve()` replaces `addAuto(data.newly_satisfied)` with
`advanceGate(union(tickedRef.current, data.newly_satisfied))`. The backend `/observe`
endpoint and `observe_steps.py` are **unchanged** — the client gates application.
The whole transcript keeps being sent so a step covered early ticks once the gate
reaches it.

### Exam tray (`ActionPalette.tsx`)

Chip states:
- **done** — all `satisfies_steps` ticked (as today).
- **available** — its earliest not-yet-ticked step `=== current gate step`.
- **locked** — otherwise. Rendered dimmed + `disabled` + lock glyph, tooltip
  *"Finish the steps above first."*

Merged chips satisfy consecutive steps, so "earliest unsatisfied step === gate"
makes them available exactly when their run is next; confirming advances through the
run via `advanceGate`.

New props from parent: the **current gate step number** (and/or the ticked set,
which the component already receives) so the chip can compute its state.

### Checklist UI (`StationChecklist.tsx`) — with help text

- **Current step**: highlighted + gentle pulse, tappable, `aria-current="step"`.
- **Locked steps**: dimmed, 🔒 glyph in place of the empty checkbox, `disabled`,
  `aria-disabled`, tooltip *"Unlocks after the step above."*
- **Done steps**: ✓ as today; the immediately-previous step keeps an un-tap
  affordance.
- **Help caption** under the checklist: *"Steps unlock in order — complete the
  current step to continue."* (satisfies the standing in-UI-explanation rule).
- Phase rail unchanged; "current phase" = the phase containing the gate step (the
  existing `currentIdx` logic already derives this from per-phase done counts and
  stays correct).

New prop from parent: the **current gate step number** so the component can mark
current vs locked rows. Tick state ownership stays in the parent.

### Deliberately NOT gated

- **Talking to the patient** stays always-open. Strict locking governs *which tick
  lands / progress*, not the ability to converse — you cannot block a conversation,
  and gating history-taking input would break natural consults.
- **Submit / scoring** unchanged. A student may submit at any point; partial
  in-order completion scores via the existing coverage logic. Order is guaranteed
  upstream, so **no new "sequence" score component**. The existing "N critical steps
  not yet done" warning stays (it now implicitly means "you didn't get far enough in
  order").

### Edge cases

- **Rubric-fallback checklists** — still an ordered step list → gating identical.
- **Examiner flakiness / miss** — manual current-step tap is the always-available
  escape hatch; no deadlock.
- **Empty / zero-step checklist** — gate never engages; nothing to lock.
- **Examiner over-eagerly reports a far-ahead step** — ignored by `advanceGate`.
- **Mis-tap recovery** — un-tap allowed only on the last-done step.

## Testing

`frontend/tests/station_assert.mjs`:

- **Update** step 5a: it currently clicks "Measure IOP" (step 3) cold — now locked
  until steps 1–2 are done. Advance the gate in order first (the `/observe` mock
  already ticks `[1]`; complete step 2 via the current-row tap, then step 3 unlocks).
- **Add assertions**:
  1. A later exam-tray chip (e.g. "Document results") is `disabled`/locked initially.
  2. Locked checklist rows are `disabled` / not tickable.
  3. Tapping the current row advances the gate by exactly one (the next row becomes
     current).
  4. After completing steps in order, the previously-locked chip becomes available.
  5. The help caption text is present.
- **Keep green**: one h1, 3 phases, 6 rows, no merge-drop, independent scroll,
  palette-manual-only, streaming reply, overlay debrief (Findings / Next steps),
  no horizontal overflow at 390px, no console errors.

No backend tests change (backend untouched); the Python pytest suite is unaffected.

## Files touched

- `frontend/src/aurora/screens/CaseSession.tsx` — gate derivation, `advanceGate`,
  gated observer / exam-tray / manual handlers, pass current-gate prop down.
- `frontend/src/aurora/components/StationChecklist.tsx` — current/locked/done row
  states, lock glyph, help caption, `current` prop.
- `frontend/src/aurora/components/ActionPalette.tsx` — locked chip state + tooltip,
  `current` prop.
- Station CSS (`frontend/src/aurora/aurora.css` or the station style block) —
  locked/current row + chip styles.
- `frontend/tests/station_assert.mjs` — updated flow + new gate assertions.

**No backend / Python / DB changes.**

## Out of scope (possible follow-ups)

- Server-enforced gating for tamper-proof graded assessment.
- Rewarding *quality* of sequencing in the score (e.g. penalising heavy reliance on
  the manual fallback, or timing). Order itself is now compulsory; grading its
  finesse is a separate enhancement.
