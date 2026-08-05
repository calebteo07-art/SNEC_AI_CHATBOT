/* The Home HUD's pure decisions. No React, no DOM, no network — so every rule that
   could lie to a student is unit-testable (frontend/tests/hud_logic.mjs).

   The recurring rule here: an UNKNOWN is never a ZERO. A failed read renders as
   "couldn't load", never as "0/3 quests" or "no streak" — Home painting a failure as
   fact is a bug this app has already shipped once. */

/** SGT is UTC+8 with no DST, so the day boundary is arithmetic, not a locale lookup.
 *  Deliberately NOT the device's local midnight: a student travelling, or a laptop on
 *  the wrong timezone, must still be told when SNEC's day ends. */
const SGT_OFFSET_MS = 8 * 60 * 60_000;

export interface ChestState { claimed: boolean; key: string; label: string }
export interface QuestRow {
  kind: string; title: string; target: number; reward_xp: number;
  progress: number; complete: boolean; claimed: boolean;
}

/** How much of the chest the DOM is allowed to know.
 *
 *  GET /api/home returns `key` and `label` even when the chest is sealed — the roll is
 *  a pure function of (student_id, date), so the endpoint computes it either way. That
 *  is harmless as data and fatal as UI: rendering the label on a sealed chest spoils
 *  the one ceremony the app has. Everything downstream reads THIS, never `chest.label`. */
export function chestReveal(
  chest: ChestState | null | undefined,
  justClaimedThisSession: boolean,
): { sealed: boolean; label: string | null } {
  if (!chest) return { sealed: true, label: null };
  const open = chest.claimed || justClaimedThisSession;
  return open ? { sealed: false, label: chest.label } : { sealed: true, label: null };
}

/** Milliseconds until the next SGT midnight — half-open on (0, 86_400_000]: at the
 *  instant of SGT midnight itself this returns a full day, not 0, so a countdown
 *  resets rather than flashing an expired deadline. */
export function sgtMsToMidnight(nowMs: number): number {
  const sinceSgtDayStart = (nowMs + SGT_OFFSET_MS) % 86_400_000;
  return 86_400_000 - sinceSgtDayStart;
}

/** The loss-aversion this feature chose instead of hearts: a deadline, not a lockout.
 *  `doneToday` undefined means the progress read failed — which is NOT a reason to
 *  raise an alarm. Silence is the honest state for an unknown. */
export function streakRisk(
  doneToday: boolean | undefined,
  nowMs: number,
): { atRisk: boolean; msLeft: number } {
  const msLeft = sgtMsToMidnight(nowMs);
  return { atRisk: doneToday === false, msLeft };
}

/** Milliseconds of XP boost left. Clamped at 0 — an expired or unparseable stamp is
 *  "no boost", never a negative clock. */
export function boostRemaining(until: string | null | undefined, nowMs: number): number {
  if (!until) return 0;
  const end = Date.parse(until);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, end - nowMs);
}

/** "1h 04m" over an hour, "M:SS" under it. Never negative. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** null means UNKNOWN — render "couldn't load", never "0/3".
 *  An empty array is also unknown: the backend always generates exactly three quests,
 *  so zero of them means the read degraded, not that the student has no work. */
export function questRollup(
  quests: Pick<QuestRow, "complete" | "claimed">[] | null | undefined,
): { done: number; total: number; claimable: number } | null {
  if (!quests || quests.length === 0) return null;
  return {
    done: quests.filter((q) => q.complete).length,
    total: quests.length,
    claimable: quests.filter((q) => q.complete && !q.claimed).length,
  };
}
