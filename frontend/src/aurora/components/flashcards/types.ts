/* Shared flashcard primitives — one source for the orchestrator and the
   presentational pieces. MCQ model with instant deterministic grading. */
export type Difficulty = "easy" | "medium" | "hard";
export type QType = "single" | "multi";

/** Hard cap on a typed reasoning answer — keeps it concise and bounds grader tokens. */
export const MAX_REASON_CHARS = 300;

/** Session-length presets (Quick / Standard / Deep). */
export const LENGTHS: { n: number; label: string }[] = [
  { n: 5, label: "Quick" },
  { n: 10, label: "Standard" },
  { n: 20, label: "Deep" },
];

/** Fixed, encouraging XP: full marks for a correct card, a consolation for an honest miss. */
export const XP_CORRECT = 10;
export const XP_ATTEMPT = 3;

/** Consecutive-correct streak → points multiplier. The multiplier applies to the
 *  card that ACHIEVES the streak (your 2nd-in-a-row correct earns x2 on itself).
 *  Tiers: x1 (0–1), x2 (2–3), x3 (4–5), x4 (6+, capped). One source for the
 *  orchestrator's XP award and the card's points display so they never disagree. */
export function comboMultiplier(combo: number): number {
  if (combo >= 6) return 4;
  if (combo >= 4) return 3;
  if (combo >= 2) return 2;
  return 1;
}

export interface Flashcard {
  id: number;
  stem: string;
  options: string[];
  correct: number[];
  qtype: QType;
  kind: "theory" | "practical" | "situational";
  explanation: string;
  requiresExplanation: boolean;
  tag: string;
  difficulty: Difficulty | "";
  /** Present only for free-text tutor-seeded cards (no options) → flip-to-reveal path. */
  freeText?: boolean;
  card_id?: string; repetitions?: number; easiness?: number; interval_days?: number;
}

/** A card is only renderable if the study UI can present it without crashing:
 *  free-text cards flip to a reveal (no options needed); every MCQ card MUST carry
 *  an `options` array (McqCard does `options.map(...)`). Guards malformed or
 *  stale-shaped data — e.g. a pre-MCQ {front,back} card rehydrated from the offline
 *  cache — from reaching McqCard and white-screening the page. */
export function isRenderableCard(c: Flashcard): boolean {
  return c.freeText === true || Array.isArray(c.options);
}

/** Deterministic, instant MCQ grading. All-or-nothing for multi-select. */
export function gradeSelection(card: Flashcard, selected: number[]): boolean {
  const a = [...selected].sort((x, y) => x - y);
  const b = [...card.correct].sort((x, y) => x - y);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Cards handed in from a Tutor session via sessionStorage → free-text reveal cards. */
export function loadSessionCards(): Flashcard[] {
  try {
    const s = JSON.parse(sessionStorage.getItem("eyebot_session") || "{}");
    if (Array.isArray(s.cards) && s.cards.length > 0) {
      return s.cards.map((c: { front: string; back: string; topic_tag: string }, i: number) => ({
        id: i + 1, stem: c.front, options: [], correct: [], qtype: "single" as QType,
        kind: "theory" as const, explanation: c.back, requiresExplanation: false,
        tag: c.topic_tag, difficulty: "" as const, freeText: true,
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

/** Per-topic hue for the STUDY activity — deliberately confined to a COOL arc
 *  (cyan → blue → indigo, ~188–256°). The study flow is the "Gemini graphite"
 *  world, so every deck must stay cool: warm hues (the old pink/rose/coral end of
 *  the wheel) read as flashy against the graphite canvas. 12 evenly-spaced cool
 *  hues keep topics distinguishable while never straying warm. White text/chip
 *  contrast holds across this whole band at the lightnesses the card uses. */
const TOPIC_HUES = [188, 194, 200, 206, 212, 218, 224, 230, 236, 242, 248, 256];

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

/** Full-wheel palette for the DARK topic tiles in the step-2 gallery, ordered so any two
 *  consecutive tiles differ by ≥120° — maximally distinct, not harmonious (the tiles are
 *  dark enough for white text at every hue, so the contrast-safe arc above doesn't apply).
 *  Assigned by tile index so a set's colours are always spread, never clustered. */
const GALLERY_HUES = [210, 30, 270, 90, 330, 150, 0, 240, 120, 300, 60, 180];

/** Tile index → a vivid, maximally-distinct hue for the gallery (and the setup accent it
 *  adopts on selection). Starts on brand blue; cycles past 12 topics (rare). */
export function galleryHue(index: number): number {
  return GALLERY_HUES[((index % GALLERY_HUES.length) + GALLERY_HUES.length) % GALLERY_HUES.length];
}
