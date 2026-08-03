// frontend/src/aurora/lib/submitError.ts
/* What a student is told when submitting a handover fails. Pure — no React, no DOM.

   Branda (2026-08-03): "'Could not evaluate. Please try again' is not pertaining to the
   handover content." One blanket string covered every failure and named the wrong culprit
   — the grader never received the handover in any of these cases, so nothing about it was
   evaluated. A student fifteen minutes into a station read that as a verdict on their work.

   HARD RULE: a message here explains why the SUBMISSION did not land, never what the
   student wrote. Enforced by station_submit_error_logic.mjs. */

/**
 * @param status HTTP status of the failed submit, or null when the request never reached
 *               the server (offline, DNS, proxy down — `fetch` itself threw).
 */
export function submitErrorMessage(status: number | null): string {
  if (status === null) {
    return "Network issue — your handover didn't reach us. Nothing is lost: check your connection and submit again.";
  }
  if (status === 401 || status === 403) {
    return "Your session expired while you were in the station. Sign in again, then submit — everything you typed is still here.";
  }
  if (status === 429) {
    return "That was too fast for the grader. Wait a moment and submit again — nothing is lost.";
  }
  return "The grader didn't answer — that's on our end, not your handover. Nothing is lost: submit again.";
}
