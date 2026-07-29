/* Pure unit test for stationTimer.
   Run: node --experimental-strip-types frontend/tests/station_timer_logic.mjs

   Branda: "There is no time limit for completing each case." Every case already carries
   estimated_minutes; this turns it into OSCE pace WITHOUT ever destroying work — the tone
   escalates, the countdown goes negative, and nothing auto-submits. */
import assert from "node:assert";
import { timerState, formatClock } from "../src/aurora/lib/stationTimer.ts";

const MIN = 60_000;
const at = (elapsedMs, mins = 10) => timerState(0, elapsedMs, mins);

// Tone thresholds. WARN_MS is 2 minutes remaining.
assert.strictEqual(at(0).tone, "calm", "fresh start is calm");
assert.strictEqual(at(7 * MIN).tone, "calm", "3 min left is still calm");
assert.strictEqual(at(8 * MIN).tone, "warn", "exactly 2 min left → warn");
assert.strictEqual(at(9 * MIN).tone, "warn", "1 min left → warn");
assert.strictEqual(at(10 * MIN).tone, "over", "exactly 0 left → over");
assert.strictEqual(at(12 * MIN).tone, "over", "past the limit stays over");

// Remaining time is signed, so the UI can show how far over they ran.
assert.strictEqual(at(4 * MIN).remainingMs, 6 * MIN);
assert.strictEqual(at(13 * MIN).remainingMs, -3 * MIN);

// Elapsed is what the debrief and the export record.
assert.strictEqual(at(4 * MIN).elapsedMs, 4 * MIN);

// A missing/zero estimate must not produce a timer that is instantly "over".
assert.strictEqual(timerState(0, 5 * MIN, 0).tone, "none", "no estimate → no timer");
assert.strictEqual(timerState(0, 5 * MIN, 0).label, "", "no estimate → no label");

// A clock never runs backwards, even if the caller hands us a stale `now`.
assert.strictEqual(timerState(1000, 0, 10).elapsedMs, 0, "negative elapsed is clamped to 0");

// Clock formatting, including over-run.
assert.strictEqual(formatClock(9 * MIN + 5_000), "9:05");
assert.strictEqual(formatClock(0), "0:00");
assert.strictEqual(formatClock(-90_000), "-1:30", "over-run reads as negative");
assert.strictEqual(formatClock(-1_000), "-0:01");

console.log("station_timer_logic: all assertions passed");
