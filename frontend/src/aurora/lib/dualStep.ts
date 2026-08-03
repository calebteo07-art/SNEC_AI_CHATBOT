// frontend/src/aurora/lib/dualStep.ts
/* A checklist step that names TWO sources needs both of them. Pure — no React, no I/O.

   The reported bug: "Check that the patient is not allergic to the selected eye drops by
   verifying with the patient's medical record/EMR and by asking the patient" is ONE
   CRITICAL step, and one click of the Check-allergy chip ticked it — the student never had
   to ask. The backend marks such a chip `also_ask` (examination_actions.is_dual_step); this
   module owns the AND so it lives in one tested place instead of spread through
   CaseSession's tick paths.

   The two halves come from different channels and can arrive in EITHER order:
     - the CHART half — clicking the chip in the action panel (recorded client-side),
     - the ASKED half — the /observe examiner seeing the patient asked in the consult.
   Whichever lands first waits for the other. A dual step is therefore NOT hidden from the
   examiner the way other manual steps are, and its step number is left out of the set that
   locks the patient composer — otherwise the student could never ask. */

/** What `admit` decided about a batch of candidate step numbers. */
export interface Admission {
  /** May tick now (in the order given). */
  tick: number[];
  /** Dual steps still missing their chart half — remember them and re-admit later. */
  hold: number[];
}

/**
 * Split candidate steps into those that may tick now and those still waiting on a half.
 * @param candidates step numbers something just satisfied (examiner hits, chip clicks)
 * @param dual       step numbers whose chip is `also_ask`
 * @param chartDone  dual steps whose chart half the student has done in the action panel
 */
export function admit(
  candidates: Iterable<number>,
  dual: ReadonlySet<number>,
  chartDone: ReadonlySet<number>,
): Admission {
  const tick: number[] = [];
  const hold: number[] = [];
  for (const n of candidates) {
    if (dual.has(n) && !chartDone.has(n)) hold.push(n);
    else tick.push(n);
  }
  return { tick, hold };
}

/** Which half of a dual step is outstanding — "none" when there is nothing to say. */
export type DualHalf = "none" | "record" | "asked";

/**
 * The half-done state of one step, for the chip affordance and the hint line. A critical
 * step that silently refuses to tick is what makes the station feel broken, so the UI has
 * to name the missing half.
 * @param asked dual steps the examiner has already credited, held pending the chart half
 */
export function dualHalf(
  step: number,
  dual: ReadonlySet<number>,
  chartDone: ReadonlySet<number>,
  asked: ReadonlySet<number>,
  ticked: ReadonlySet<number>,
): DualHalf {
  if (!dual.has(step) || ticked.has(step)) return "none";
  const chart = chartDone.has(step);
  const patient = asked.has(step);
  if (chart === patient) return "none";   // neither half yet, or both (about to tick)
  return chart ? "record" : "asked";
}

/**
 * The one line shown while a dual step is half done. Copy lives here, next to the rule it
 * explains, and is pinned by station_dual_logic.mjs — it must name the OUTSTANDING half
 * (the whole failure being fixed is a critical step quietly refusing to tick), the CHANNEL
 * and not the clinical content, and stay inside the station's help-density ceiling.
 */
export function dualHint(half: DualHalf): string {
  if (half === "record") return "Record checked — now ask the patient to complete this step.";
  if (half === "asked") return "Patient asked — now check the record in EyeBot to complete this step.";
  return "";
}
