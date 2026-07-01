/* Unit test for the pure greeting engine. Run with Node's type stripping:
 *   node --experimental-strip-types frontend/tests/greeting_assert.mjs
 * (greeting.ts is dependency-free so it imports in isolation.) */
import assert from "node:assert";
import { pickGreeting } from "../src/aurora/lib/greeting.ts";

const base = {
  firstName: "Caleb", track: "OA", hour: 20, streak: 12, doneToday: false,
  missedYesterday: false, xpToNext: 60, goalMet: false, bestStreak: 12,
};

// 1) emphasis is always a literal substring of the title, and titles stay short
for (let s = 0; s < 40; s++) {
  const g = pickGreeting(base, s);
  assert.ok(g.title.includes(g.emphasis), `emphasis '${g.emphasis}' not in title '${g.title}'`);
  assert.ok(g.title.length <= 90, `title too long (${g.title.length}): ${g.title}`);
  assert.ok(g.sub && g.sub.length > 0, "sub must be non-empty");
}

// 2) stable for a fixed seed
assert.deepStrictEqual(pickGreeting(base, 7), pickGreeting(base, 7));

// 3) "Surprise me" (seed + 1) changes the line
assert.notStrictEqual(pickGreeting(base, 7).title, pickGreeting(base, 8).title);

// 4) every bucket is reachable with the right precedence
assert.strictEqual(pickGreeting({ ...base, goalMet: true }, 0).bucket, "goalMet");
assert.strictEqual(pickGreeting({ ...base, missedYesterday: true, streak: 0 }, 0).bucket, "comeback");
assert.strictEqual(pickGreeting({ ...base, streak: 10 }, 0).bucket, "streakMilestone");
assert.strictEqual(pickGreeting({ ...base, streak: 2, xpToNext: 40 }, 0).bucket, "nearLevelUp");
assert.strictEqual(pickGreeting({ ...base, streak: 2, xpToNext: 400, hour: 9 }, 0).bucket, "timeOfDay");

// 5) eyebrow reflects track + time of day
assert.ok(pickGreeting({ ...base, hour: 9 }, 0).eyebrow.includes("Good morning"));
assert.ok(pickGreeting({ ...base, track: "OT" }, 0).eyebrow.includes("Ophthalmic Technician"));

console.log("PASS: greeting engine");
