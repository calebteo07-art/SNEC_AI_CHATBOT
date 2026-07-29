// frontend/src/aurora/lib/stationTimer.ts
/* Station countdown. Pure — no React, no timers, no Date.now(): the caller supplies `now`,
   which is what makes it unit-testable.

   Branda (2026-07-29): "There is no time limit for completing each case." Every case
   already carries estimated_minutes. This turns that into exam pace WITHOUT a hard stop —
   a learning tool that deletes a student's work on a timer is worse than no timer, and the
   leave-forfeit rules already own the "don't abandon it" incentive. */

export type TimerTone = "none" | "calm" | "warn" | "over";

export interface TimerState {
  elapsedMs: number;
  /** Signed: negative once the student has run over. */
  remainingMs: number;
  tone: TimerTone;
  label: string;
  /** 0→1 fraction of the estimate SPENT, clamped. The header bar renders its complement,
      so the bar drains to match the "Time left" it sits under. */
  progress: number;
}

const WARN_MS = 2 * 60_000;

export function timerState(startedAtMs: number, nowMs: number, estimatedMinutes: number): TimerState {
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  // No estimate ⇒ no timer at all, rather than one that reads "over" from the first second.
  if (!estimatedMinutes || estimatedMinutes <= 0) {
    return { elapsedMs, remainingMs: 0, tone: "none", label: "", progress: 0 };
  }
  const totalMs = estimatedMinutes * 60_000;
  const remainingMs = totalMs - elapsedMs;
  const tone: TimerTone = remainingMs <= 0 ? "over" : remainingMs <= WARN_MS ? "warn" : "calm";
  return { elapsedMs, remainingMs, tone, label: formatClock(remainingMs), progress: Math.min(1, elapsedMs / totalMs) };
}

/** m:ss, negative when over-run ("-1:30"). */
export function formatClock(ms: number): string {
  const neg = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${neg ? "-" : ""}${mins}:${String(secs).padStart(2, "0")}`;
}
