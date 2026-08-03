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

/** Attempts on the CURRENT step before the way-out is offered, per channel. Typing another
    line is cheap; opening a procedure and backing out of it is not — a student doing that
    twice is telling you they don't know the technique, so the action pane offers it sooner. */
export const SKIP_AFTER: Record<"patient" | "eyebot", number> = { patient: 3, eyebot: 2 };

/**
 * Whether to offer "unable to complete this checklist item" right now.
 * @param attempts tries on the CURRENT step only — the caller resets it when the gate moves.
 */
export function canSkip(turn: Turn, attempts: number, hasResult: boolean): boolean {
  if (hasResult || turn === null || turn === "handover") return false;
  return attempts >= SKIP_AFTER[turn];
}
