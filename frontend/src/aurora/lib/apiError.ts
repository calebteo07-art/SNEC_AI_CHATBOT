// frontend/src/aurora/lib/apiError.ts
/* What a student is told when a call to our API fails, anywhere in the app. Pure — no
   React, no DOM.

   Caleb (2026-08-04): "if got api error for all app features, tell student to reload page."
   Before this, every feature invented its own dead end — "Please try again", "check your
   connection", "keep going" — and Home and the League had no error state at all, so a
   failed read painted zeros and an empty ladder. None of them named the move that actually
   clears the common causes (an expired cookie held in memory, a stale TanStack cache, a
   dropped SSE proxy): reload the page.

   HARD RULE: a message built here names the failed READ, then instructs the reload.
   Enforced by frontend/tests/api_error_logic.mjs.

   NOT for the OSCE handover submit — see submitError.ts. A reload there discards the
   handover the student just typed, so that surface keeps its own "nothing is lost, submit
   again" copy on purpose. */

/** The one sentence. Every API-failure message in the student app ends with it. */
export const RELOAD_INSTRUCTION = "Reload the page to try again.";

/** Used when a surface can't name what broke — an instruction with no subject reads as a
 *  fragment, and a bare instruction never says whose fault it was. */
const GENERIC_CAUSE = "Something went wrong on our end.";

/** Strip a trailing instruction so wrapping an already-wrapped message is a no-op. */
const TRAILING_INSTRUCTION = /\s*Reload the page to try again\.?\s*$/i;

/**
 * @param cause One sentence naming the read that failed ("Could not load patients").
 *              Blank/omitted falls back to a generic — never an empty string.
 */
export function apiErrorMessage(cause?: string | null): string {
  const body = (cause ?? "").replace(TRAILING_INSTRUCTION, "").trim().replace(/\.{2,}$/, ".")
    || GENERIC_CAUSE;
  const punctuated = /[.!?…]$/.test(body) ? body : `${body}.`;
  return `${punctuated} ${RELOAD_INSTRUCTION}`;
}
