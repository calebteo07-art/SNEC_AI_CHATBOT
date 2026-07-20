/* First-login order — pure model. No React, no DOM: unit-tested directly
   (frontend/tests/onboarding_order_test.mjs) and read by both CheckInGuard and
   TourProvider. The order a brand-new student meets the gates in lives HERE and nowhere
   else: password → tour → Eyecon Studio → daily check-in → app.
   See docs/superpowers/specs/2026-07-17-first-login-order-design.md. */

export type Stage = "loading" | "password" | "tour" | "studio" | "checkin" | "app";

export interface StageInput {
  /** The account still holds an admin-issued temp password (`must_change`). */
  mustChangePassword: boolean;
  /** Server truth from GET /api/avatar — the per-account first-run signal.
      undefined = still loading. */
  customized: boolean | undefined;
  /** Device-local: the first-run tour ran to completion. Splits tour-vs-Studio WITHIN a
      first run; never used to detect one (a new device would look fresh). */
  tourSeen: boolean;
  /** Device-local, per calendar day. */
  isCheckInDone: boolean;
}

/** Map the avatar query's state onto `StageInput.customized`. In flight ⇒ undefined (wait).
    Settled ⇒ the flag — but a MISSING field or a failed fetch defaults to `true`, failing
    OPEN to the returning-student path. Absence is not evidence of a first run, and treating
    it as "still loading" would strand the student on a spinner forever: `data.customized`
    reads undefined both while pending AND when the response simply has no such field. */
export function resolveCustomized(isPending: boolean, customized: boolean | undefined): boolean | undefined {
  if (isPending) return undefined;
  return customized ?? true;
}

/** The one gate the student is standing at right now. */
export function onboardingStage(i: StageInput): Stage {
  if (i.mustChangePassword) return "password";
  // `customized` is the only per-account first-run signal, so nothing below it can be
  // decided without it. Guessing "returning" here is exactly what puts a brand-new
  // student on the check-in first — the bug this ordering exists to fix.
  if (i.customized === undefined) return "loading";
  if (i.customized === false) return i.tourSeen ? "studio" : "tour";
  if (!i.isCheckInDone) return "checkin";
  return "app";
}

/** The welcome-Studio "always re-show" dev override — STRICTLY opt-in. It fires only when a
    device sets localStorage.eyebot_always_studio = "1". It no longer auto-enables outside
    production, so `next dev` (and any non-prod build) matches production's show-once flow: a
    genuinely new student sees the welcome Studio once, gated on server truth (customized), and
    never again after they Save. Set the flag to "1" to iterate on the welcome screen; "0" or
    absent = off. (Was: on by default whenever NODE_ENV !== "production", which re-forced the
    Studio on every reload in dev.) */
export function wantsAlwaysStudio(flag: string | null | undefined): boolean {
  return flag === "1";
}
