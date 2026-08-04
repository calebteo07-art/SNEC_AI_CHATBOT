/* Pure unit test for stationTimer.
   Run: node --experimental-strip-types frontend/tests/station_timer_logic.mjs

   Branda: "There is no time limit for completing each case." Every case already carries
   estimated_minutes; this turns it into OSCE pace WITHOUT ever destroying work — the tone
   escalates, the countdown goes negative, and nothing auto-submits. */
import assert from "node:assert";
import { timerState, formatClock, paceRead } from "../src/aurora/lib/stationTimer.ts";

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

// `progress` drives the draining bar in the header clock: fraction of the estimate spent,
// clamped at 1 so an over-run never paints a bar wider than its track.
assert.strictEqual(at(0).progress, 0, "fresh start is empty");
assert.strictEqual(at(5 * MIN).progress, 0.5, "half the estimate spent");
assert.strictEqual(at(10 * MIN).progress, 1, "exactly spent");
assert.strictEqual(at(30 * MIN).progress, 1, "over-run clamps at full");
assert.strictEqual(timerState(0, 5 * MIN, 0).progress, 0, "no estimate → no bar");

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

/* paceRead — the downloaded report has to say what the elapsed time MEANT, not just print
   it (user-directed 2026-08-04). The number alone is not feedback: 6 minutes is excellent
   on a full checklist and damning with four steps outstanding, so the read is time CROSSED
   WITH coverage. Pure, so the report and the debrief can never disagree about it. */
const pace = (elapsedMs, mins, done, total) => paceRead(elapsedMs, mins, done, total);

// Bands, against the case's own guide.
assert.strictEqual(pace(4 * MIN, 10, 16, 16).band, "under", "40% of the guide → under");
assert.strictEqual(pace(5 * MIN, 10, 16, 16).band, "under", "exactly half → still under");
assert.strictEqual(pace(8 * MIN, 10, 16, 16).band, "on", "inside the guide → on pace");
assert.strictEqual(pace(10 * MIN, 10, 16, 16).band, "on", "exactly the guide → on pace");
assert.strictEqual(pace(11 * MIN, 10, 16, 16).band, "just-over", "a little over");
assert.strictEqual(pace(20 * MIN, 10, 16, 16).band, "over", "double the guide → over");

// No estimate is a real state (some cases carry none) — it must not read as instantly over.
assert.strictEqual(pace(9 * MIN, 0, 16, 16).band, "none", "no guide → no verdict");
assert.ok(pace(9 * MIN, 0, 16, 16).taken, "the elapsed time still prints without a guide");
assert.strictEqual(pace(9 * MIN, 0, 16, 16).guide, "", "no guide → nothing to compare against");

// The insight: fast is only a virtue if the station was finished. Same clock, opposite read.
const fastComplete = pace(4 * MIN, 10, 16, 16);
const fastIncomplete = pace(4 * MIN, 10, 12, 16);
assert.strictEqual(fastComplete.band, fastIncomplete.band, "same band — the clock is identical");
assert.notStrictEqual(fastComplete.meaning, fastIncomplete.meaning,
  "finishing early with steps outstanding must NOT read as being fast");
assert.match(fastIncomplete.meaning, /\b4\b/, "it names how many steps were left outstanding");

// Every band says something, and says it in one sentence a student can act on.
for (const b of [pace(4 * MIN, 10, 16, 16), pace(8 * MIN, 10, 16, 16), pace(11 * MIN, 10, 14, 16),
                 pace(20 * MIN, 10, 9, 16), pace(9 * MIN, 0, 16, 16)]) {
  assert.ok(b.headline && b.meaning, `band ${b.band} must carry a headline and a meaning`);
  assert.ok(b.meaning.length <= 190, `band ${b.band} meaning is a sentence, not a paragraph`);
}

// A checklist-less case must not divide by zero into a "0 outstanding" lie or a NaN.
assert.ok(pace(5 * MIN, 10, 0, 0).meaning, "no checklist → still a usable read");
assert.ok(Number.isFinite(pace(5 * MIN, 10, 0, 0).ratio));

console.log("station_timer_logic: all assertions passed");
