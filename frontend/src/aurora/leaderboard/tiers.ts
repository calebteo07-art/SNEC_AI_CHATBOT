/* Leaderboard tier + standings math — dependency-free (no imports) so it unit-tests
   under Node's type stripping and stays pure. Consumed by the leaderboard screen. */

export type TierId = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface Tier {
  id: TierId;
  name: string;
  min: number; // inclusive XP floor
  c1: string; // light facet
  c2: string; // deep facet / ring
  ink: string; // legible text on a light tint of this tier
}

/** Minimal shape the math needs; LeaderboardEntry is structurally compatible. */
export interface EntryLike { rank: number; name: string; xp: number; is_you: boolean; }

export interface RivalGap { name: string; rank: number; gap: number; }
export interface Rivals { above: RivalGap | null; below: RivalGap | null; }

export const TIERS: Tier[] = [
  { id: "bronze", name: "Bronze", min: 0, c1: "#E8A06A", c2: "#C97B4A", ink: "#7A4A2B" },
  { id: "silver", name: "Silver", min: 2000, c1: "#CBD5E1", c2: "#94A3B8", ink: "#475569" },
  { id: "gold", name: "Gold", min: 4500, c1: "#FCD34D", c2: "#F59E0B", ink: "#B45309" },
  { id: "platinum", name: "Platinum", min: 7000, c1: "#7FD6E6", c2: "#38BDC9", ink: "#0C6E7A" },
  { id: "diamond", name: "Diamond", min: 10000, c1: "#A78BFA", c2: "#7C5CF6", ink: "#6D28D9" },
];

/** Highest tier whose floor the XP has reached. */
export function tierForXp(xp: number): Tier {
  let t = TIERS[0];
  for (const tier of TIERS) if (xp >= tier.min) t = tier;
  return t;
}

/** The person directly above (to overtake) and below (chasing you). Null when the
    viewer is hidden or not present in this (possibly role-filtered) view. */
export function computeRivals(entries: EntryLike[], you?: EntryLike | null): Rivals | null {
  if (!you) return null;
  const i = entries.findIndex((e) => e.is_you);
  if (i < 0) return null;
  const a = entries[i - 1];
  const b = entries[i + 1];
  return {
    above: a ? { name: a.name, rank: a.rank, gap: Math.max(0, a.xp - entries[i].xp) } : null,
    below: b ? { name: b.name, rank: b.rank, gap: Math.max(0, entries[i].xp - b.xp) } : null,
  };
}

/** Top 3 → podium, the rest → the ranked list. Safe for < 3 entries. */
export function splitPodium<T>(entries: T[]): { podium: T[]; rest: T[] } {
  return { podium: entries.slice(0, 3), rest: entries.slice(3) };
}

/** Group contiguous rows into tier bands, preserving rank order. */
export function bandRows<T extends { xp: number }>(rows: T[]): { tier: Tier; rows: T[] }[] {
  const out: { tier: Tier; rows: T[] }[] = [];
  for (const row of rows) {
    const tier = tierForXp(row.xp);
    const last = out[out.length - 1];
    if (last && last.tier.id === tier.id) last.rows.push(row);
    else out.push({ tier, rows: [row] });
  }
  return out;
}
