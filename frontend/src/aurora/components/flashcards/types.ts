/* Shared flashcard primitives — one source for the orchestrator and the
   presentational pieces. Logic is unchanged from the original screen. */
export type Difficulty = "easy" | "medium";

/** Hard cap on a typed recall answer — keeps answers concise and bounds grader tokens. */
export const MAX_ANSWER_CHARS = 300;

/** Session-length presets (Quick / Standard / Deep). */
export const LENGTHS: { n: number; label: string }[] = [
  { n: 5, label: "Quick" },
  { n: 10, label: "Standard" },
  { n: 20, label: "Deep" },
];

/** A weak answer (graded below this) is re-queued once for a second attempt. */
export const RETRY_THRESHOLD = 40;

export interface Flashcard {
  id: number; question: string; answer: string; tag: string;
  card_id?: string; repetitions?: number; easiness?: number; interval_days?: number;
}
export interface AiFeedback { feedback: string; score: number; }

/** AI's 0-100 grade → XP on the original 5-35 per-card scale (floor of 5). */
export function xpForScore(score: number): number {
  const s = Math.max(0, Math.min(100, score));
  return Math.max(5, Math.round((s / 100) * 35));
}

/** Cards handed in from a Tutor session via sessionStorage. */
export function loadSessionCards(): Flashcard[] {
  try {
    const s = JSON.parse(sessionStorage.getItem("eyebot_session") || "{}");
    if (Array.isArray(s.cards) && s.cards.length > 0) {
      return s.cards.map((c: { front: string; back: string; topic_tag: string }, i: number) => ({
        id: i + 1, question: c.front, answer: c.back, tag: c.topic_tag,
      }));
    }
  } catch { /* fall through */ }
  return [];
}

/** Score tiers drive both the reveal color and the coach copy. */
export type ScoreTier = "high" | "good" | "fair" | "low";

export function scoreTier(score: number): ScoreTier {
  const s = Math.max(0, Math.min(100, score));
  if (s >= 85) return "high";
  if (s >= 60) return "good";
  if (s >= 40) return "fair";
  return "low";
}

/** Score → HSL hue (unitless degrees) for the reveal's --flash-score-hue:
 *  high = green, good = blue, fair = amber, low = cool indigo. */
export function scoreHue(score: number): number {
  switch (scoreTier(score)) {
    case "high": return 145;
    case "good": return 212;
    case "fair": return 38;
    default: return 255;
  }
}

/** Curated, on-brand hue arc for per-topic color. Brand blues → violet → magenta →
 *  coral → amber → teal → green, deliberately skipping the muddy yellow-green band
 *  (~50–110°). Each reads well at the fixed lightness used for --flash-topic-c. */
const TOPIC_HUES = [212, 232, 258, 286, 322, 350, 14, 32, 174, 190, 152, 128];

/** Stable, non-negative string hash (djb2). */
function hashKey(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** topic_key → HSL hue (unitless degrees) for --flash-topic-hue. Deterministic
 *  (a topic is always the same color) and visually distinct: the hash selects a
 *  base hue from the curated arc, and a small deterministic jitter separates keys
 *  that land on the same base. `__mixed`/empty → brand blue (used pre-card only). */
export function topicHue(topicKey: string): number {
  if (!topicKey || topicKey === "__mixed") return 212;
  const h = hashKey(topicKey);
  const base = TOPIC_HUES[h % TOPIC_HUES.length];
  const jitter = ((h >> 4) % 9) - 4; // -4..+4°, stays clear of the muddy band
  return base + jitter;
}
