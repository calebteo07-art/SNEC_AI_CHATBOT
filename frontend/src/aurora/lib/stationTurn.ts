// frontend/src/aurora/lib/stationTurn.ts
/* Whose turn is it? Pure — no React, no DOM.

   Students reported not knowing how to use the station. The fix separates MECHANICS
   (which pane do I act in — make this loud) from CLINICAL CONTENT (what do I ask —
   make this earned, see stationMask.ts). This module owns the mechanics half: one
   value that drives `data-turn` on the grid, and one badge line.

   HARD RULE: the badge names the CHANNEL, never the step. "Your turn — talk to the
   patient", never "ask about pain and discharge". Enforced by station_turn_logic.mjs. */

import type { DualHalf } from "./dualStep";

export type Turn = "patient" | "eyebot" | "both" | "handover" | null;

export interface TurnState {
  turn: Turn;
  /** Badge copy for the active pane. Empty when there is no turn. */
  badge: string;
  /** Lock the patient composer — this step can ONLY be done in the action panel.
      Never true on a dual step: asking the patient is half of it. */
  lockComposer: boolean;
}

export interface TurnContext {
  /** The station payload has arrived. */
  loaded: boolean;
  /** The station is graded — the debrief owns the screen now. */
  hasResult: boolean;
  /** This case has manual procedures, so the action pane is rendered. */
  hasEyebot: boolean;
}

/** Where the gate step stands if it is a DUAL-SOURCE step (see lib/dualStep).
    `null` when the gate step is an ordinary single-channel step. */
export interface DualGate {
  /** Which half is already in: "record" = the panel half, "asked" = the consult half,
      "none" = neither yet. */
  half: DualHalf;
}

/**
 * @param gateStep      the current unlockable step (stationGate.currentStep), null when all done
 * @param manualSteps   step numbers that can only be completed in the action panel
 * @param dualGate      set when the gate step needs BOTH channels, else null
 */
export function stationTurn(
  gateStep: number | null,
  manualSteps: ReadonlySet<number>,
  ctx: TurnContext,
  dualGate: DualGate | null = null,
): TurnState {
  if (!ctx.loaded || ctx.hasResult) return { turn: null, badge: "", lockComposer: false };
  if (gateStep === null) {
    return { turn: "handover", badge: "All steps done — submit your handover", lockComposer: false };
  }
  // A DUAL step needs both panes, so pointing at one and dimming the other was wrong in
  // both directions at once (user-reported: "the spotlight to convo panel and manual panel
  // is not accurate or responsive"). manualSteps deliberately excludes dual steps, so the
  // old code fell through to "talk to the patient" and left the EyeBot pane — which holds
  // the chip they still owe — dimmed and desaturated for the whole step. And because that
  // answer never depended on either half, doing one of them changed nothing on screen.
  // Now the outstanding half picks the pane, so finishing either one MOVES the spotlight.
  if (ctx.hasEyebot && dualGate) {
    if (dualGate.half === "record") {
      return { turn: "patient", badge: "Half done — now talk to the patient", lockComposer: false };
    }
    if (dualGate.half === "asked") {
      // The composer stays LIVE: the examiner's credit for the asking is a judgement, and a
      // student who thinks it misread them must be able to say it again.
      return { turn: "eyebot", badge: "Half done — now finish in EyeBot", lockComposer: false };
    }
    return { turn: "both", badge: "Your turn — this step needs both panels", lockComposer: false };
  }
  if (ctx.hasEyebot && manualSteps.has(gateStep)) {
    return { turn: "eyebot", badge: "Your turn — perform in EyeBot", lockComposer: true };
  }
  return { turn: "patient", badge: "Your turn — talk to the patient", lockComposer: false };
}

/** Attempts on the CURRENT step before the way-out is offered, per channel. Typing another
    line is cheap; opening a procedure and backing out of it is not — a student doing that
    twice is telling you they don't know the technique, so the action pane offers it sooner.
    "both" is a dual step, where attempts can accrue in either pane: it takes the more
    generous count. A missing entry here would make canSkip permanently false and strand the
    student on the one step shape that has two ways to go wrong. */
export const SKIP_AFTER: Record<"patient" | "eyebot" | "both", number> = {
  patient: 3, eyebot: 2, both: 3,
};

/**
 * Whether to offer "unable to complete this checklist item" right now.
 * @param attempts tries on the CURRENT step only — the caller resets it when the gate moves.
 */
export function canSkip(turn: Turn, attempts: number, hasResult: boolean): boolean {
  if (hasResult || turn === null || turn === "handover") return false;
  return attempts >= SKIP_AFTER[turn];
}
