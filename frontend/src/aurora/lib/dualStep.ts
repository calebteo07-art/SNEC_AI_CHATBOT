// frontend/src/aurora/lib/dualStep.ts
/* A checklist step that needs TWO channels needs both of them. Pure — no React, no I/O.

   The reported bug: "Check that the patient is not allergic to the selected eye drops by
   verifying with the patient's medical record/EMR and by asking the patient" is ONE
   CRITICAL step, and one click of the Check-allergy chip ticked it — the student never had
   to ask. Sweeping the other checklists found a second shape: "Perform hand hygiene and
   confirm the patient's identity…" (Amsler #1, Ishihara #1, also critical). The backend
   marks the affected STEPS `also_ask_steps` with a `dual_kind` (examination_actions.
   dual_kind); this module owns the AND so it lives in one tested place instead of spread
   through CaseSession's tick paths.

   The two halves come from different channels and can arrive in EITHER order:
     - the PANEL half — finishing the chip in the action panel (recorded client-side): one
       click for a quick chip, the confirmed typed technique for an assessed one,
     - the CONSULT half — the /observe examiner seeing the patient asked / identified.
   Whichever lands first waits for the other. A dual step is therefore NOT hidden from the
   examiner the way other manual steps are, and its step number is left out of the set that
   locks the patient composer — otherwise the student could never ask. Everything here is
   per STEP: chips merge by label, so one chip can hold a dual step AND an ordinary one. */

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
 * @param dual       step numbers in any chip's `also_ask_steps`
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

/** What finishing a chip should do about the steps it covers. */
export interface ChipOutcome {
  /** Dual steps whose PANEL half this just completed — remember them, do not tick. */
  charted: number[];
  /** Steps that may go to the gate now. */
  tick: number[];
}

/**
 * Split what finishing a chip does. Only the step the chip STANDS ON can be a panel half:
 * the palette unlocks a chip only while its earliest unticked step is the gate, so that is
 * the one step this click can satisfy. Everything else stays whole, which is what keeps a
 * merged chip's ordinary steps (hand hygiene at step 13) ticking on their own.
 * @param steps the chip's satisfies_steps
 * @param asked dual steps the examiner already credited, held pending the panel half
 */
export function chipOutcome(
  steps: number[],
  ticked: ReadonlySet<number>,
  dual: ReadonlySet<number>,
  chartDone: ReadonlySet<number>,
  asked: ReadonlySet<number>,
): ChipOutcome {
  const standing = steps.find((n) => !ticked.has(n));
  if (standing === undefined || !dual.has(standing) || chartDone.has(standing)) {
    return { charted: [], tick: steps };
  }
  // The consult half may already be in — then both halves are in and it ticks now.
  return { charted: [standing], tick: asked.has(standing) ? [standing] : [] };
}

/** Which CHANNEL of a dual step is outstanding — "none" when there is nothing to say.
 *  "record" means the panel half is in (whatever that half was), "asked" the consult half. */
export type DualHalf = "none" | "record" | "asked";

/** Which patient-facing half a dual step still owes — the backend's `dual_kind`. */
export type DualKind = "ask" | "identity";

/** Just enough of an examination action to apply the dual rule to it. */
interface DualActionish {
  kind: string;
  satisfies_steps: number[];
  also_ask_steps?: number[];
}

/**
 * Steps ONLY the action panel can tick — the set that locks the patient composer, and the
 * mirror of the backend's examiner_excluded_steps. A dual step is left out: asking the
 * patient is half of it, so locking the composer there made the step impossible. Per STEP,
 * so a merged chip's ordinary steps still lock (step 13 of hand hygiene is hands-on only).
 */
export function panelOnlySteps(actions: DualActionish[]): Set<number> {
  const out = new Set<number>();
  for (const a of actions) {
    if (a.kind !== "manual") continue;
    const dual = new Set(a.also_ask_steps ?? []);
    for (const n of a.satisfies_steps) if (!dual.has(n)) out.add(n);
  }
  return out;
}

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
 * and not the clinical content, and stay inside the station's help-density ceiling. The
 * kind decides WHICH half: "now ask the patient" on a hygiene step would send the student
 * looking for a question that isn't there.
 */
export function dualHint(half: DualHalf, kind: DualKind = "ask"): string {
  if (kind === "identity") {
    if (half === "record") return "Done in EyeBot — now confirm the patient's identity to complete this step.";
    if (half === "asked") return "Identity confirmed — now complete this step in EyeBot.";
    return "";
  }
  if (half === "record") return "Record checked — now ask the patient to complete this step.";
  if (half === "asked") return "Patient asked — now check the record in EyeBot to complete this step.";
  return "";
}
