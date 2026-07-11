/* Pure, dependency-free tutor-greeting engine — the ever-changing, learning-flavoured
   hello + tease on the /chat landing. No React/imports so it stays unit-testable via
   Node type-stripping (see frontend/tests/tutor_greeting_assert.mjs).

   The student's name renders as a Gemini-gradient <em> between an opener's `before` and
   `after` (ricoe A2). `pickTutorGreeting(openerSeed, subSeed)` is deterministic per seed;
   the landing picks fresh, non-repeating seeds after mount so the greeting differs every
   visit. Humour is about *learning* (studying, memory, exams) with a light eye-care wink. */

export interface Opener {
  before: string; // text before the emphasised name (always non-empty)
  after: string;  // text after the name (usually punctuation)
}

export const OPENERS: Opener[] = [
  { before: "Back for more, ", after: "?" },
  { before: "Round two, ", after: "." },
  { before: "Look who's revising, ", after: "." },
  { before: "Brain warmed up, ", after: "?" },
  { before: "Let's get a little smarter, ", after: "." },
  { before: "Ready to learn something sneaky, ", after: "?" },
  { before: "The textbooks missed you, ", after: "." },
  { before: "Curiosity calling, ", after: "?" },
  { before: "Study mode: engaged, ", after: "." },
  { before: "Here to outsmart yesterday's you, ", after: "?" },
  { before: "Fancy a little revision, ", after: "?" },
  { before: "New day, new neurons, ", after: "." },
  { before: "Let's make it stick, ", after: "." },
  { before: "Good to think with you, ", after: "." },
];

export const SUBS: string[] = [
  "Learning sticks better when you laugh — so let's have some fun with it.",
  "Your brain grows every time you get something wrong. Let's grow it a lot today.",
  "Cramming is a myth; curiosity is the cheat code. Ask away.",
  "The best students ask the 'silly' questions first. Go on, I'm ready.",
  "Spaced repetition, but make it fun. What are we drilling today?",
  "Every expert was once a beginner squinting at a slit lamp. Your turn.",
  "Forgot something from last time? Perfect — that's exactly what we'll lock in.",
  "Ask me the thing you're secretly unsure about. That's where the growth is.",
  "Mistakes are just data. Bring me a good one.",
  "Ten minutes of real thinking beats an hour of highlighting. Let's think.",
  "I don't do lectures — I do 'oh, THAT'S why'. What shall we unlock?",
  "Your future self, mid-exam, will thank you for this. Let's begin.",
  "No such thing as a silly question — only a cornea we haven't cracked yet.",
  "Confused is the feeling of about-to-understand. Lean into it.",
  "Teach it back to me and it's yours forever. Want to try?",
  "Small questions, big gains. What's on your mind?",
];

/* An index in [0, len) that never equals a valid `last` when there is a real choice.
   `r` is a random float in [0, 1). A `last` outside [0, len) means "no constraint" —
   the full range is used. With len <= 1 the sole index (0) is returned. */
export function nextIndex(len: number, last: number, r: number): number {
  if (len <= 1) return 0;
  const clampR = r < 0 ? 0 : r >= 1 ? 0.999999 : r;
  const hasLast = Number.isInteger(last) && last >= 0 && last < len;
  if (!hasLast) return Math.floor(clampR * len);
  const pick = Math.floor(clampR * (len - 1)); // [0, len-2] over the non-`last` slots
  return pick < last ? pick : pick + 1;
}

export function pickTutorGreeting(openerSeed: number, subSeed: number): {
  before: string; after: string; sub: string;
} {
  const oi = ((Math.trunc(openerSeed) % OPENERS.length) + OPENERS.length) % OPENERS.length;
  const si = ((Math.trunc(subSeed) % SUBS.length) + SUBS.length) % SUBS.length;
  return { before: OPENERS[oi].before, after: OPENERS[oi].after, sub: SUBS[si] };
}
