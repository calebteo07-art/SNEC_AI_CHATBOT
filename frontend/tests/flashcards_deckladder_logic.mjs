/* Pure unit test for the flashcards 5-deck ladder captions (/ship-check).
   deckLadder.ts is dependency-free (no React). Run under Node type stripping:
     node --experimental-strip-types frontend/tests/flashcards_deckladder_logic.mjs

   Covers the corner sticker's three states, the rung wording, the next-rung
   calculation, the cleared predicate, and — the reason this file exists — the
   degraded shapes a stale persisted query cache or an older server hands back. */
import assert from "node:assert";
import {
  deckSticker, rungWord, nextLevel, isLadderCleared,
} from "../src/aurora/lib/deckLadder.ts";

// ── the corner STICKER's three states ───────────────────────────────────────
// The topic card's top-right sticker has room for a count, not a sentence, so a
// cleared ladder reads "5/5" rather than prose. The state drives its colour
// (neutral → topic-hue sweep → coin-gold) and `null` means "draw no sticker".
assert.deepStrictEqual(deckSticker(0, 5), { text: "0/5", done: 0, of: 5, state: "fresh" },
  "an untouched ladder still shows its size");
assert.deepStrictEqual(deckSticker(1, 5), { text: "1/5", done: 1, of: 5, state: "climbing" },
  "the 1/5 the student asked to see on the card");
assert.deepStrictEqual(deckSticker(5, 5), { text: "5/5", done: 5, of: 5, state: "cleared" },
  "a cleared ladder reads 5/5 in gold — the sticker has no room for prose");
assert.strictEqual(deckSticker(9, 5).text, "5/5", "overshoot clamps to the top rung");
assert.strictEqual(deckSticker(9, 5).state, "cleared", "overshoot is still cleared");
assert.deepStrictEqual(deckSticker(-3, 5), { text: "0/5", done: 0, of: 5, state: "fresh" },
  "negative clamps to untouched");
assert.strictEqual(deckSticker(undefined, 5).text, "0/5", "missing progress → untouched");
// No ladder ⇒ no sticker at all (Mixed, a zero-deck topic, a stale cache).
assert.strictEqual(deckSticker(2, 0), null, "a zero-deck topic gets no sticker");
assert.strictEqual(deckSticker(undefined, undefined), null, "no data → no sticker");

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

console.log("PASS: flashcards deck-ladder corner sticker + rungs (20 assertions)");
