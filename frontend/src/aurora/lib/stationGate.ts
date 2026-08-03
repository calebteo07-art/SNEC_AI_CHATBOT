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

/** What the student actually DID, for the grade and the record. `ticked` means "the gate
    moved past this", which is NOT the same as "the student did this" — the skip valve
    advances steps the student said they could not complete. Those come back out here, so
    giving up never earns credit. Sorted, so the same station submits the same payload. */
export function performedOnly(ticked: ReadonlySet<number>, skipped: ReadonlySet<number>): number[] {
  return [...ticked].filter((n) => !skipped.has(n)).sort((a, b) => a - b);
}

/** Whether firing /observe can still tick anything. The conversational examiner only ticks
    NON-MANUAL steps, and the backend returns [] once none of those remain — so the round-trip
    (which, for intermediate/advanced cases, also costs an access-check DB read) is worth making
    only while at least one observable step is still un-ticked. `observable` is the list of
    non-manual step_numbers; an empty list — station not yet loaded, or an all-manual station —
    returns true so a needed pass is never suppressed (the backend still no-ops correctly). */
export function observeCanTick(observable: number[], ticked: ReadonlySet<number>): boolean {
  if (observable.length === 0) return true;
  return observable.some((n) => !ticked.has(n));
}
