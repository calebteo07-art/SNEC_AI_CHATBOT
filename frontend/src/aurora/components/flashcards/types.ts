/* Shared flashcard primitives — one source for the orchestrator and the
   presentational pieces. MCQ model with instant deterministic grading. */
export type Difficulty = "easy" | "medium" | "hard";
export type QType = "single" | "multi";

/** Hard cap on a typed reasoning answer — keeps it concise and bounds grader tokens. */
export const MAX_REASON_CHARS = 300;

/** Per-card base points, scaled by difficulty — harder cards are worth more (the deck's
 *  tier is chosen at setup; a mixed deck scores each card by its own difficulty). Tuned so
 *  a perfect deck lands BELOW a same-tier OSCE station's reward: OSCE (a long, graded
 *  clinical encounter) stays the premium earner. Blank/free-text falls back to the medium base. */
export const CARD_BASE: Record<Difficulty, number> = { easy: 4, medium: 6, hard: 8 };
export function cardBase(difficulty: Difficulty | ""): number {
  return CARD_BASE[difficulty as Difficulty] ?? CARD_BASE.medium;
}

/** Consolation for an honest miss — small and encouraging; a wrong answer NEVER deducts. */
export const XP_ATTEMPT = 2;

/** Consecutive-correct streak → points multiplier. The multiplier applies to the
 *  card that ACHIEVES the streak (your 2nd-in-a-row correct earns ×2 on itself).
 *  Tiers: ×1 (0–1), ×2 (2–4), ×3 (5+, capped) — one source for the orchestrator's
 *  award and the card's points display so they never disagree. */
export function comboMultiplier(combo: number): number {
  if (combo >= 5) return 3;
  if (combo >= 2) return 2;
  return 1;
}

/** Points a graded card is worth: base (by difficulty) × combo when correct, a flat
 *  consolation on a miss. THE one source of truth for both the awarded XP (orchestrator)
 *  and the card's HUD/Payoff display, so the number shown always equals the number banked. */
export function cardPoints(difficulty: Difficulty | "", correct: boolean, combo: number): number {
  return correct ? cardBase(difficulty) * comboMultiplier(combo) : XP_ATTEMPT;
}

/** Deck-completion bonus, scaled by accuracy (0..1). A strong finish is rewarded; a poor
 *  one earns little — finishing a deck is no longer a flat, unconditional payout. */
export const SESSION_BONUS_MAX = 40;
export function sessionBonus(accuracy: number): number {
  return Math.round(SESSION_BONUS_MAX * Math.max(0, Math.min(1, accuracy)));
}

/** Game-phrased combo callout for the loud gamification popup (ricoe B3). Returns
 *  null below the first multiplier tier (combo < 2); escalates with the streak and
 *  the top phrase repeats past the ×4 cap. Kept in one place so the burst word and the
 *  multiplier can never disagree with comboMultiplier. */
export function comboCallout(combo: number): { word: string; sub: string } | null {
  if (combo >= 10) return { word: "GODLIKE", sub: `${combo} in a row` };
  if (combo >= 6) return { word: "UNSTOPPABLE", sub: `${combo} in a row` };
  if (combo >= 4) return { word: "ON FIRE", sub: `${combo} in a row` };
  if (combo >= 2) return { word: "DOUBLE UP", sub: `${combo} in a row` };
  return null;
}

/** One-line topic blurbs for the pre-deck intro card (ricoe B5). Keyed by topic_key
 *  (the selectable set key); an unknown key falls back to a generic line. Kept concise
 *  and clinically accurate — this is the last thing a learner reads before Q1. */
export const TOPIC_BLURBS: Record<string, string> = {
  // Foundations — shared knowledge, every role
  anatomy_physiology: "How the eye is built and how each part earns its keep — cornea to cortex.",
  microbiology_infection: "The bugs that threaten the eye, and the sterile technique that keeps them out.",
  pharmacology: "Ocular drugs — what they do, how they're given, and what to warn patients about.",
  ocular_emergencies: "The can't-miss, sight-threatening presentations and how fast they move.",
  professional_ethics: "Consent, confidentiality, chaperoning and scope — practising safely and well.",
  disorders_eyelid_lacrimal_orbit: "Lids, tear drainage and the orbit — from styes to the watery eye.",
  disorders_cornea_conjunctiva: "The ocular surface — red eyes, dry eyes, ulcers and the clear front window.",
  disorders_lens_cataract: "The lens and its clouding — cataract types, symptoms and the road to surgery.",
  disorders_uvea_retina: "Inside the eye — uveitis, retinal disease and the threats to central vision.",
  glaucoma: "The pressure-and-nerve disease that steals sight silently — detection and monitoring.",
  neuro_strabismus: "When eyes and nerves misfire — squints, double vision and telling pupil signs.",
  systemic_disease: "How diabetes, hypertension and thyroid disease show up first in the eye.",
  // Clinical — OA / PSA procedures
  red_eye: "Sorting the harmless red eye from the sight-threatening one.",
  triage: "Deciding who is seen now, soon or routinely — safe prioritising.",
  history_taking: "Asking the right questions to frame every clinical picture.",
  distance_va: "Measuring distance vision accurately, the SNEC way.",
  near_vision: "Testing reading vision and near tasks reliably.",
  pinhole: "The quick test that separates refractive blur from real pathology.",
  iop_nct: "Measuring eye pressure with non-contact tonometry.",
  eye_drops: "Instilling drops safely, cleanly and in the right order.",
  pupil_dilation: "Dilating safely — the drugs, the checks and the cautions.",
  colour_vision: "Screening colour vision with the Ishihara plates.",
  amsler_macula: "Checking the macula for distortion with the Amsler grid.",
  fall_risk: "Spotting and managing patients at risk of a fall.",
  perioperative: "Preparing patients before surgery and caring for them after.",
  abbreviations: "The shorthand of the eye clinic, decoded.",
  // OT — ophthalmic investigations / imaging
  oct_macula: "Cross-sectioning the macula to reveal fluid, layers and disease.",
  oct_rnfl: "Measuring the nerve-fibre layer to track glaucoma.",
  hvf: "Automated visual fields — mapping where sight is lost.",
  gvf: "Manual kinetic perimetry across the whole field of vision.",
  ascan_biometry: "Ultrasound axial length for choosing the right lens implant.",
  optical_biometry: "Optical measurement of the eye for cataract-surgery planning.",
  endothelial: "Counting the cornea's pump cells before surgery.",
  asoct: "Imaging the front of the eye — angles, cornea and more.",
  flare: "Quantifying inflammation in the anterior chamber.",
  corneal_topography: "Mapping the cornea's curvature and shape.",
  pam: "Estimating the vision a cataract patient could regain.",
  hrt: "Laser-scanning the optic nerve head in glaucoma.",
  orthoptics: "Assessing eye alignment, movement and binocular vision.",
  dayward_theatre: "The flow of day surgery — from ward to theatre and back.",
  auto_refraction: "Automated refraction and keratometry as a starting point.",
  aberrometry: "Measuring the higher-order optical errors of the eye.",
  lens_meter: "Reading a spectacle prescription off the lens (focimetry).",
  retinal_imaging: "Photographing the retina to document and screen.",
  dr_grading: "Grading diabetic retinopathy by the SORC scheme.",
};

/** topic_key → its one-line intro blurb, with graceful fallbacks for Mixed and any
 *  unmapped key so the intro card always has something to say. */
export function topicBlurb(topicKey: string): string {
  if (!topicKey || topicKey === "__mixed")
    return "A mixed deck spanning every topic you study — a broad warm-up.";
  return TOPIC_BLURBS[topicKey] ?? "A focused 10-card deck to sharpen this topic.";
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
