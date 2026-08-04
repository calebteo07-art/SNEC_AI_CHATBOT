// frontend/src/aurora/lib/stationMask.ts
/* Progressive reveal for the OSCE checklist. Pure — no React, no DOM.

   A fully-visible checklist is a script: students follow the listed items instead of
   recalling their own history-taking questions (Branda, 2026-07-29). So only what the
   student has EARNED is readable — completed steps (they need to review them) and the
   current step (so a lost student never stalls). Everything ahead is masked to a glyph
   run that preserves the row's rhythm without leaking the words.

   `skipped` is a step the student said they could not complete (the skip valve): it counts
   for the gate so the session can continue, but it must never render as a clean ✓ — the
   debrief, the grade and the export all stay honest. */

export type StepDisplay = "done" | "current" | "masked" | "skipped";

/** The display state of one checklist row. `current` is the gate step (stationGate.currentStep). */
export function stepDisplay(
  stepNumber: number,
  ticked: ReadonlySet<number>,
  skipped: ReadonlySet<number>,
  current: number | null,
): StepDisplay {
  if (ticked.has(stepNumber)) return skipped.has(stepNumber) ? "skipped" : "done";
  if (current !== null && stepNumber === current) return "current";
  return "masked";
}

/** Whether this state's action text may be printed. The ONE predicate the UI consults —
    so "don't leak future steps" is a single decision, not a condition repeated per call site. */
export function isRevealed(display: StepDisplay): boolean {
  return display !== "masked";
}

/** The row's glyph + tone. Lives here, not inline in the component, so "a step you could not
    finish reads as a failure" is one testable rule shared by the checklist and the export.
    A skipped step used to render a small grey ✗ that scanned as decoration; it is now the
    same alarm the report uses (user-directed 2026-08-04). The glyph — never the colour
    alone — is what carries it in a mono print or to anyone who can't separate the two reds. */
export function stepMark(display: StepDisplay): { glyph: string; tone: string } {
  switch (display) {
    case "done": return { glyph: "✓", tone: "done" };
    case "skipped": return { glyph: "!", tone: "miss" };
    case "masked": return { glyph: "🔒", tone: "locked" };
    default: return { glyph: "", tone: "current" }; // the gate step is marked by its ring
  }
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
