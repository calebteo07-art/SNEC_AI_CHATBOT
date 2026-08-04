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

export type PaceBand = "none" | "under" | "on" | "just-over" | "over";

export interface PaceRead {
  /** Wall-clock the student took, "m:ss". */
  taken: string;
  /** The case's own guide, "m:ss" — empty when the case carries no estimate. */
  guide: string;
  /** elapsed ÷ guide; 0 when there is no guide. */
  ratio: number;
  band: PaceBand;
  /** Three or four words — the verdict on the clock. */
  headline: string;
  /** One sentence: what that clock MEANT for this student, on this station. */
  meaning: string;
}

/* How the downloaded report reads the clock. A number alone is not feedback — six minutes
   is excellent on a full checklist and damning with four steps outstanding — so the read is
   time CROSSED WITH coverage, and the same elapsed time gets opposite meanings. There is
   still no hard stop (Branda: "There is no time limit"); this only names the pace after the
   fact, where naming it costs the student nothing. */
export function paceRead(
  elapsedMs: number,
  estimatedMinutes: number,
  stepsDone: number,
  stepsTotal: number,
): PaceRead {
  const taken = formatClock(Math.max(0, elapsedMs));
  const outstanding = Math.max(0, (stepsTotal || 0) - (stepsDone || 0));
  const finished = outstanding === 0;

  if (!estimatedMinutes || estimatedMinutes <= 0) {
    return {
      taken, guide: "", ratio: 0, band: "none",
      headline: "No time guide for this case",
      meaning: finished
        ? `You took ${taken} and finished the checklist. Nothing to measure that against here — use it as your own baseline for the next run.`
        : `You took ${taken} with ${outstanding} step${outstanding === 1 ? "" : "s"} outstanding. Time was not what stopped you.`,
    };
  }

  const totalMs = estimatedMinutes * 60_000;
  const ratio = Math.max(0, elapsedMs) / totalMs;
  const guide = formatClock(totalMs);
  const over = formatClock(Math.max(0, elapsedMs - totalMs));
  const left = `${outstanding} step${outstanding === 1 ? "" : "s"}`;

  if (ratio <= 0.5) {
    return { taken, guide, ratio, band: "under", headline: "Well under the guide",
      meaning: finished
        ? `You covered the whole checklist in half the time allowed. Fast is a strength only if it wasn't thin — read the examiner's notes before you bank it as one.`
        : `Finishing early with ${left} outstanding isn't speed, it's an unfinished station. The clock was never the constraint.` };
  }
  if (ratio <= 1) {
    return { taken, guide, ratio, band: "on", headline: "On station pace",
      meaning: finished
        ? `Full checklist inside the guide — this is the pace a real station is written for. Hold it under exam pressure and the timing looks after itself.`
        : `Comfortable on the clock, but ${left} never happened. What's costing you is the routine, not the time.` };
  }
  if (ratio <= 1.25) {
    return { taken, guide, ratio, band: "just-over", headline: "Just over the guide",
      meaning: `You ran ${over} past the guide${finished ? "" : ` with ${left} outstanding`}. In a timed station the bell goes during your closing — practise the order, not the speed.` };
  }
  return { taken, guide, ratio, band: "over", headline: "Well over the guide",
    meaning: `${over} past a ${guide} guide${finished ? "" : `, still ${left} short`}. Past the bell nothing scores, so the marks lost here are sequence, rarely knowledge.` };
}

/** m:ss, negative when over-run ("-1:30"). */
export function formatClock(ms: number): string {
  const neg = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${neg ? "-" : ""}${mins}:${String(secs).padStart(2, "0")}`;
}
