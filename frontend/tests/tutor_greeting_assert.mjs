/* Unit test for the pure tutor-greeting engine. Run with Node's type stripping:
 *   node --experimental-strip-types frontend/tests/tutor_greeting_assert.mjs
 * (tutorGreeting.ts is dependency-free so it imports in isolation.) */
import assert from "node:assert";
import { OPENERS, SUBS, nextIndex, pickTutorGreeting } from "../src/aurora/lib/tutorGreeting.ts";

// 1) banks are non-empty; every opener keeps a name slot; subs stay short
assert.ok(OPENERS.length > 1, "OPENERS must have several entries");
assert.ok(SUBS.length > 1, "SUBS must have several entries");
for (const o of OPENERS) assert.ok(o.before && o.before.length > 0, `opener missing name slot: ${JSON.stringify(o)}`);
for (const s of SUBS) assert.ok(s.length > 0 && s.length <= 120, `sub bad length (${s.length}): ${s}`);

// 2) pickTutorGreeting is stable for fixed seeds and changes when a seed increments
assert.deepStrictEqual(pickTutorGreeting(3, 5), pickTutorGreeting(3, 5));
assert.notStrictEqual(pickTutorGreeting(3, 5).sub, pickTutorGreeting(3, 6).sub);
assert.notStrictEqual(pickTutorGreeting(3, 5).before, pickTutorGreeting(4, 5).before);

// 3) nextIndex stays in range and never repeats a valid `last` when there is a choice
for (let i = 0; i < 1000; i++) {
  const r = i / 1000;
  for (const len of [1, 2, 5, OPENERS.length, SUBS.length]) {
    for (const last of [0, 1, len - 1]) {
      const idx = nextIndex(len, last, r);
      assert.ok(idx >= 0 && idx < len, `nextIndex out of range: ${idx} (len=${len})`);
      if (len > 1) assert.notStrictEqual(idx, last, `nextIndex repeated last=${last} (len=${len}, r=${r})`);
    }
  }
}

// 4) with no valid `last` (-1) the full range is reachable
const seen = new Set();
for (let i = 0; i < 1000; i++) seen.add(nextIndex(5, -1, i / 1000));
assert.ok(seen.has(0) && seen.has(4), "nextIndex(len,-1) must reach the full range");

// 5) clamp boundary (r >= 1) + invalid `last` still stay in range and honour no-repeat
for (const len of [2, 5, OPENERS.length, SUBS.length]) {
  for (const r of [1, 1.5, 2, -0.1]) {
    for (const last of [0, len - 1]) {
      const idx = nextIndex(len, last, r);
      assert.ok(idx >= 0 && idx < len, `clamp out of range: ${idx} (len=${len}, r=${r})`);
      assert.notStrictEqual(idx, last, `clamp repeated last=${last} (len=${len}, r=${r})`);
    }
  }
  // non-integer / out-of-band `last` = "no constraint"; result must still be in range
  for (const last of [1.5, len, -3]) {
    const idx = nextIndex(len, last, 0.5);
    assert.ok(idx >= 0 && idx < len, `invalid-last out of range: ${idx} (len=${len}, last=${last})`);
  }
}

console.log("PASS: tutor greeting engine");
