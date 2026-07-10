/* Pure unit test for the leaderboard tier + standings math. Run with Node's type
   stripping (tiers.ts is dependency-free, mirrors greeting_assert.mjs):
     node --experimental-strip-types frontend/tests/leaderboard_logic.mjs */
import assert from "node:assert";
import { tierForXp, computeRivals, splitPodium, bandRows, TIERS } from "../src/aurora/leaderboard/tiers.ts";

// 1) tier boundaries (inclusive lower bounds)
assert.strictEqual(tierForXp(0).id, "bronze");
assert.strictEqual(tierForXp(1999).id, "bronze");
assert.strictEqual(tierForXp(2000).id, "silver");
assert.strictEqual(tierForXp(4499).id, "silver");
assert.strictEqual(tierForXp(4500).id, "gold");
assert.strictEqual(tierForXp(6999).id, "gold");
assert.strictEqual(tierForXp(7000).id, "platinum");
assert.strictEqual(tierForXp(9999).id, "platinum");
assert.strictEqual(tierForXp(10000).id, "diamond");
assert.strictEqual(tierForXp(999999).id, "diamond");
assert.strictEqual(TIERS.length, 5);

// 2) computeRivals — middle of the pack sees both neighbours
const E = [
  { rank: 1, name: "A", xp: 12000, is_you: false },
  { rank: 2, name: "B", xp: 9000, is_you: false },
  { rank: 3, name: "C", xp: 7720, is_you: false },
  { rank: 4, name: "You", xp: 7660, is_you: true },
  { rank: 5, name: "D", xp: 7635, is_you: false },
];
const you = E.find((e) => e.is_you);
const rv = computeRivals(E, you);
assert.strictEqual(rv.above.gap, 60);
assert.strictEqual(rv.above.name, "C");
assert.strictEqual(rv.above.rank, 3);
assert.strictEqual(rv.below.gap, 25);
assert.strictEqual(rv.below.name, "D");

// 3) #1 has no one above; last has no one below (the viewer is located by is_you)
const T1 = [{ rank: 1, name: "You", xp: 100, is_you: true }, { rank: 2, name: "X", xp: 80, is_you: false }];
assert.strictEqual(computeRivals(T1, T1[0]).above, null);
assert.strictEqual(computeRivals(T1, T1[0]).below.gap, 20);
const T2 = [{ rank: 1, name: "X", xp: 100, is_you: false }, { rank: 2, name: "You", xp: 80, is_you: true }];
assert.strictEqual(computeRivals(T2, T2[1]).below, null);
assert.strictEqual(computeRivals(T2, T2[1]).above.gap, 20);

// 4) hidden / absent viewer → null
assert.strictEqual(computeRivals(E, null), null);
assert.strictEqual(computeRivals([{ rank: 1, name: "X", xp: 1, is_you: false }], { rank: 9, name: "You", xp: 1, is_you: true }), null);

// 5) podium split is safe for tiny cohorts
assert.strictEqual(splitPodium(E).podium.length, 3);
assert.strictEqual(splitPodium(E).rest.length, 2);
assert.strictEqual(splitPodium([{ xp: 1 }]).podium.length, 1);
assert.strictEqual(splitPodium([]).rest.length, 0);

// 6) bandRows groups contiguous rows by tier, preserving order
const bands = bandRows([{ xp: 7660 }, { xp: 7635 }, { xp: 6120 }]); // plat, plat, gold
assert.strictEqual(bands.length, 2);
assert.strictEqual(bands[0].tier.id, "platinum");
assert.strictEqual(bands[0].rows.length, 2);
assert.strictEqual(bands[1].tier.id, "gold");
assert.strictEqual(bands[1].rows.length, 1);

console.log("PASS: leaderboard tiers + standings");
