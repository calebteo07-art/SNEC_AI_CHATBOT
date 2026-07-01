/* Pure, dependency-free greeting engine — the ever-changing, eye-care-flavoured
   teasing hello on the home dashboard. No React/imports so it stays unit-testable
   via Node type-stripping (see frontend/tests/greeting_assert.mjs).

   `pickGreeting(ctx, seed)` returns a line chosen by context (streak, goal, time of
   day, …) then rotated by `seed`. The Dashboard bumps the seed on "Surprise me".
   Every line's `emphasis` is a literal substring of its `title` (the accent word). */

export type Track = "OA" | "OT" | "PSA";

export interface GreetingCtx {
  firstName: string;
  track: Track;
  hour: number;            // 0..23, local
  streak: number;          // current streak (days)
  doneToday: boolean;
  missedYesterday: boolean;
  xpToNext: number;        // XP remaining to the next level
  goalMet: boolean;        // hit today's XP goal
  bestStreak: number;
}

export type Bucket =
  | "goalMet" | "comeback" | "streakMilestone" | "nearLevelUp" | "timeOfDay" | "generic";

export interface Greeting {
  bucket: Bucket;
  eyebrow: string;
  title: string;
  emphasis: string;
  sub: string;
}

interface Line { title: string; emphasis: string; sub: string }

const MILESTONES = [3, 5, 7, 10, 14, 20, 30, 50, 75, 100];
const TRACK_LABEL: Record<Track, string> = {
  OA: "Ophthalmic Assistant",
  OT: "Ophthalmic Technician",
  PSA: "Patient Service Associate",
};

export const GREETING_BANK: Record<Bucket, (c: GreetingCtx) => Line[]> = {
  goalMet: (c) => [
    { title: `Goal smashed, ${c.firstName}.`, emphasis: "smashed",
      sub: "Iris is doing a little victory dance. Come back tomorrow and do it again." },
    { title: `Daily goal: done.`, emphasis: "done",
      sub: "That is what mastery looks like. The retina salutes you." },
  ],
  comeback: (c) => [
    { title: `The streak forgives, ${c.firstName}.`, emphasis: "forgives",
      sub: "Iris remembers, though. Two minutes today rebuilds it — let's go." },
    { title: `Welcome back.`, emphasis: "back",
      sub: "Missed a day, no drama. The cornea kept your seat warm." },
  ],
  streakMilestone: (c) => [
    { title: `${c.streak} days straight, ${c.firstName}.`, emphasis: `${c.streak} days`,
      sub: "Even the optic nerve is impressed. Don't cool it now." },
    { title: `${c.streak}-day streak. Hot.`, emphasis: "Hot",
      sub: "That's hotter than a slit-lamp bulb. Keep the fire going." },
  ],
  nearLevelUp: (c) => [
    { title: `${c.xpToNext} XP from levelling up.`, emphasis: `${c.xpToNext} XP`,
      sub: "That's three flashcards and a coffee. You've got this." },
    { title: `So close, ${c.firstName}.`, emphasis: "close",
      sub: `Just ${c.xpToNext} XP stands between you and the next level.` },
  ],
  timeOfDay: (c) => {
    const t = c.hour < 12 ? "Morning" : c.hour < 18 ? "Afternoon" : "Evening";
    return [
      { title: `Back already, ${c.firstName}? The retina missed you.`, emphasis: "retina",
        sub: "Pick up where you left off — your streak's waiting." },
      { title: `${t}, ${c.firstName}.`, emphasis: c.firstName,
        sub: "The cornea is watching. Best not to keep it waiting." },
      { title: `Skipping today? Bold.`, emphasis: "Bold",
        sub: "The optic nerve sees everything. One quick deck, maybe?" },
    ];
  },
  generic: (c) => [
    { title: `Ready when you are, ${c.firstName}.`, emphasis: "Ready",
      sub: "Those flashcards won't grade themselves." },
  ],
};

function bucketFor(c: GreetingCtx): Bucket {
  if (c.goalMet) return "goalMet";
  if (c.missedYesterday && c.streak === 0) return "comeback";
  if (MILESTONES.includes(c.streak)) return "streakMilestone";
  if (c.xpToNext > 0 && c.xpToNext <= 80) return "nearLevelUp";
  return "timeOfDay";
}

function timeGreeting(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function pickGreeting(c: GreetingCtx, seed: number): Greeting {
  const bucket = bucketFor(c);
  const lines = GREETING_BANK[bucket](c);
  const idx = ((Math.trunc(seed) % lines.length) + lines.length) % lines.length;
  const line = lines[idx];
  const eyebrow = `${TRACK_LABEL[c.track]} · ${timeGreeting(c.hour)}`;
  return { bucket, eyebrow, title: line.title, emphasis: line.emphasis, sub: line.sub };
}
