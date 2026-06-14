/* Clinical-progression rank titles mapped from the gamification level. Levels are
 * floor(xp / 500) + 1; ranks give those levels meaning (Trainee → Consultant).
 * Deterministic, no backend needed — derived purely from the level. */

interface RankTier { title: string; min: number; }

/* Ordered by ascending minimum level. */
const RANKS: RankTier[] = [
  { title: "Trainee", min: 1 },
  { title: "Junior Practitioner", min: 3 },
  { title: "Practitioner", min: 5 },
  { title: "Senior Practitioner", min: 8 },
  { title: "Specialist", min: 11 },
  { title: "Senior Specialist", min: 15 },
  { title: "Consultant", min: 20 },
];

export interface RankInfo {
  title: string;
  /** The next rank up, or null at the top tier. */
  nextTitle: string | null;
  /** Levels remaining until the next rank, or null at the top tier. */
  levelsToNext: number | null;
}

export function rankForLevel(level: number): RankInfo {
  const lvl = Math.max(1, Math.floor(level || 1));
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (lvl >= RANKS[i].min) idx = i;
  }
  const next = RANKS[idx + 1] ?? null;
  return {
    title: RANKS[idx].title,
    nextTitle: next ? next.title : null,
    levelsToNext: next ? next.min - lvl : null,
  };
}
