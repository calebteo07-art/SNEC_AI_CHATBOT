/* Pure, dependency-free flashcards challenge copy — the ever-changing, taunting hook on
   the deck-selection screen (replaces the old fixed "Pick your challenge / Choose a deck…").
   Each entry pairs a punchy DARE (the big skewed hero title) with a sub that STILL spells out
   the game: 10 questions, graded the instant you tap, one streak to protect. The pool rotates
   and never immediately repeats, so the screen taunts you a little differently every visit.

   Kept React-free so it stays unit-testable via Node type-stripping (mirrors tutorGreeting.ts).
   `pickFlashTaunt(seed)` is deterministic per seed; StepTopic picks a fresh, non-repeating seed
   after mount via `nextIndex` (see tutorGreeting.ts). */

export interface FlashTaunt {
  title: string; // the dare — the big, skewed hero line (must stay non-racing: no "Grand Prix"/Mario)
  sub: string;   // still explains the game: 10 questions · instant scoring · one streak
}

export const TAUNTS: FlashTaunt[] = [
  { title: "Think you're ready?", sub: "10 questions, graded the second you tap. Miss one and the streak's gone." },
  { title: "Prove it.", sub: "Ten cards, instant scoring, no take-backs. How long can you keep the streak alive?" },
  { title: "Don't choke.", sub: "10 rapid questions, verdicts on the spot. Chain all ten for a flawless streak." },
  { title: "All talk?", sub: "Pick a deck: 10 questions, scored instantly, streak on the line. Back it up." },
  { title: "Streak or bust.", sub: "10 questions, instant marks, zero second chances. Beat your best streak." },
  { title: "Show me what you've got.", sub: "Ten cards, graded live as you go. Every right answer feeds the streak." },
  { title: "Scared yet?", sub: "10 questions, instant scoring, one fragile streak. Guard it to 10." },
  { title: "Big words. Now tap.", sub: "Ten questions, marked the instant you answer. Keep the streak — if you can." },
  { title: "This deck bites back.", sub: "10 questions, instant verdicts, one streak. One slip resets it." },
  { title: "No mercy.", sub: "Ten questions, scored on contact. Nail every one to run the streak to 10." },
  { title: "Feeling lucky?", sub: "10 cards, instant grading, streak on the line. Luck won't save it — you will." },
  { title: "Talk is cheap.", sub: "Ten questions, marked live, streak counting. Let your taps do the talking." },
  { title: "Beat your ghost.", sub: "10 questions, instant scoring, one streak to top your last run." },
  { title: "No warm-ups here.", sub: "Ten questions, graded on tap. Build the streak from card one." },
];

/** Deterministic per seed — the seed wraps over the pool, so any integer is valid. */
export function pickFlashTaunt(seed: number): FlashTaunt {
  const i = ((Math.trunc(seed) % TAUNTS.length) + TAUNTS.length) % TAUNTS.length;
  return TAUNTS[i];
}
