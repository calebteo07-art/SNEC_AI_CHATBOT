/* The per-topic 5-deck difficulty ladder — the pure bits, shared by the topic card's
   corner sticker and the pre-deck intro. Dependency-free (no React) so frontend/tests
   can run it directly under node --experimental-strip-types.

   Every function tolerates a missing count: an older server, or a persisted query
   cache from before the ladder shipped, hands back `undefined` here, and a sticker
   reading "undefined/undefined" is worse than no sticker at all. */

/** The corner sticker on a topic card: the same progress as numerals, because a disc
 *  has room for a count and not a sentence. `state` drives its colour — neutral while
 *  untouched, a topic-hue sweep while climbing, coin-gold once the ladder is cleared.
 *  `null` means "draw no sticker" (Mixed, a zero-deck topic, a pre-ladder cache). */
export function deckSticker(done: number, of: number): {
  text: string; done: number; of: number; state: "fresh" | "climbing" | "cleared";
} | null {
  if (!Number.isFinite(of) || of <= 0) return null;
  const cleared = Number.isFinite(done) ? Math.max(0, Math.min(done, of)) : 0;
  const state = cleared >= of ? "cleared" : cleared > 0 ? "climbing" : "fresh";
  return { text: `${cleared}/${of}`, done: cleared, of, state };
}

/** What a rung feels like, so "Deck 3 of 5" reads as a difficulty step rather than
 *  an arbitrary number. Index = level - 1. */
const RUNG_WORD = ["warm-up", "steady", "stretch", "tough", "hardest"];

export function rungWord(level: number): string {
  return RUNG_WORD[level - 1] ?? "mixed difficulty";
}

/** The rung a student is due next. Used only to label the intro before the deck
 *  arrives — the served deck carries the authoritative level from the server. */
export function nextLevel(decksCompleted: number, deckCount: number): number {
  if (!Number.isFinite(deckCount) || deckCount <= 0) return 1;
  const done = Number.isFinite(decksCompleted) ? Math.max(0, decksCompleted) : 0;
  return Math.min(done + 1, deckCount);
}

/** A topic is retired from Lumens once every rung is cleared. Mirrors the server
 *  rule in tools/api/routers/student.py — the server is authoritative; this only
 *  decides whether to explain the state in the UI. */
export function isLadderCleared(decksCompleted: number, deckCount: number): boolean {
  return Number.isFinite(deckCount) && deckCount > 0
    && Number.isFinite(decksCompleted) && decksCompleted >= deckCount;
}
