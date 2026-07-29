/* Pure unit test for the flashcards 5-deck ladder captions (/ship-check).
   deckLadder.ts is dependency-free (no React). Run under Node type stripping:
     node --experimental-strip-types frontend/tests/flashcards_deckladder_logic.mjs

   Covers the fan caption's three states, the rung wording, the next-rung
   calculation, the cleared predicate, and — the reason this file exists — the
   degraded shapes a stale persisted query cache or an older server hands back. */
import assert from "node:assert";
import {
  deckProgress, rungWord, nextLevel, isLadderCleared,
} from "../src/aurora/lib/deckLadder.ts";

// ── the fan caption's three states ───────────────────────────────────────────
assert.strictEqual(deckProgress(0, 5), "5 decks", "untouched topic advertises its size");
assert.strictEqual(deckProgress(1, 5), "1/5 decks", "the counter the student asked for");
assert.strictEqual(deckProgress(4, 5), "4/5 decks", "part-way up the ladder");
assert.strictEqual(deckProgress(5, 5), "all 5 decks done", "cleared reads as done, not 5/5");

// ── degraded shapes must not render "undefined/undefined decks" ──────────────
assert.strictEqual(deckProgress(undefined, undefined), "", "no data → no caption");
assert.strictEqual(deckProgress(undefined, 5), "5 decks", "missing progress → untouched");
assert.strictEqual(deckProgress(2, 0), "", "a zero-deck topic has nothing to say");

// ── clamping: progress can never overshoot or go negative ───────────────────
assert.strictEqual(deckProgress(9, 5), "all 5 decks done", "overshoot clamps to done");
assert.strictEqual(deckProgress(-3, 5), "5 decks", "negative clamps to untouched");

// ── rung wording ────────────────────────────────────────────────────────────
assert.strictEqual(rungWord(1), "warm-up", "deck 1 is the warm-up");
assert.strictEqual(rungWord(5), "hardest", "deck 5 is the hardest");
assert.strictEqual(rungWord(0), "mixed difficulty", "off-ladder (Mixed) has no rung");
assert.strictEqual(rungWord(99), "mixed difficulty", "out-of-range never throws");

// ── which rung comes next ───────────────────────────────────────────────────
assert.strictEqual(nextLevel(0, 5), 1, "a new student starts at deck 1");
assert.strictEqual(nextLevel(2, 5), 3, "two cleared → deck 3 next");
assert.strictEqual(nextLevel(5, 5), 5, "a cleared ladder stays on the last rung");
assert.strictEqual(nextLevel(undefined, 5), 1, "missing progress starts at deck 1");

// ── the Lumens cap predicate ────────────────────────────────────────────────
assert.strictEqual(isLadderCleared(4, 5), false, "one rung left → still earning");
assert.strictEqual(isLadderCleared(5, 5), true, "all rungs cleared → practice only");
assert.strictEqual(isLadderCleared(undefined, 5), false,
  "unknown progress must NOT read as cleared — that would mute Lumens wrongly");

console.log("PASS: flashcards deck-ladder captions (13 assertions)");
