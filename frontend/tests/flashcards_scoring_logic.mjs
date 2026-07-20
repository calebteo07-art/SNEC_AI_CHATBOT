/* Pure unit test for the flashcard scoring economy (types.ts is dependency-free,
   mirrors leaderboard_logic.mjs / flashcards_forfeit_logic.mjs). Run with:
     node --experimental-strip-types frontend/tests/flashcards_scoring_logic.mjs

   Locks the "fair, difficulty-scaled, still-kind" economy: harder cards pay more, a
   combo caps at ×3, a wrong answer never deducts (small consolation), and the
   session bonus scales with accuracy so finishing a deck badly is NOT an unconditional
   payout. A perfect deck must land BELOW a same-tier OSCE station's reward. */
import assert from "node:assert";
import {
  cardBase, comboMultiplier, cardPoints, sessionBonus, XP_ATTEMPT,
} from "../src/aurora/components/flashcards/types.ts";

// 1) Difficulty scales the per-card base — harder is worth more; blank/unknown → medium.
assert.strictEqual(cardBase("easy"), 4);
assert.strictEqual(cardBase("medium"), 6);
assert.strictEqual(cardBase("hard"), 8);
assert.strictEqual(cardBase(""), 6, "blank difficulty falls back to the medium base");

// 2) Combo multiplier: ×1 (0–1), ×2 (2–4), ×3 (5+, capped) — the old ×4 tier is gone.
assert.strictEqual(comboMultiplier(0), 1);
assert.strictEqual(comboMultiplier(1), 1);
assert.strictEqual(comboMultiplier(2), 2);
assert.strictEqual(comboMultiplier(4), 2);
assert.strictEqual(comboMultiplier(5), 3);
assert.strictEqual(comboMultiplier(50), 3, "the multiplier is capped at ×3");

// 3) Per-card points: base × combo when correct; a flat consolation (never a deduction) on a miss.
assert.strictEqual(cardPoints("hard", true, 5), 24);   // 8 × ×3
assert.strictEqual(cardPoints("easy", true, 0), 4);    // 4 × ×1
assert.strictEqual(cardPoints("medium", true, 2), 12); // 6 × ×2
assert.strictEqual(cardPoints("hard", false, 9), XP_ATTEMPT, "a miss pays only the consolation");
assert.strictEqual(XP_ATTEMPT, 2);

// 4) Session bonus scales with accuracy (0..1) — a poor deck earns no completion bonus.
assert.strictEqual(sessionBonus(1), 40);
assert.strictEqual(sessionBonus(0), 0);
assert.strictEqual(sessionBonus(0.5), 20);
assert.strictEqual(sessionBonus(-1), 0, "accuracy is clamped");
assert.strictEqual(sessionBonus(2), 40, "accuracy is clamped");

// 5) Whole-deck ceilings. A perfect 10-card hard deck = Σ base×combo + full bonus.
const perfectHardDeck = (() => {
  let xp = 0;
  for (let combo = 1; combo <= 10; combo++) xp += cardPoints("hard", true, combo);
  return xp + sessionBonus(1);
})();
assert.strictEqual(perfectHardDeck, 240, "perfect hard deck tops out at 240 (below a perfect advanced OSCE = 300)");

// A deck answered entirely wrong earns only the consolations + a zero bonus — not a windfall.
const failedDeck = (() => {
  let xp = 0;
  for (let i = 0; i < 10; i++) xp += cardPoints("medium", false, 0);
  return xp + sessionBonus(0);
})();
assert.strictEqual(failedDeck, 20, "a 0%-correct deck earns a token 20, not a full-bonus payout");

console.log("flashcards_scoring_logic: all assertions passed");
