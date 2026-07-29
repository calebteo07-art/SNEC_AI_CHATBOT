/* Per-student reward memory (localStorage), split into two keys:
   - tier high-water mark (level / lumen tier) — the watcher's baseline
   - achievements set — moment-based one-time unlocks
   Keyed by studentId so accounts never bleed on a shared device. */

export interface TierMark { level: number; lumenTier: number; }

/* BUMP THIS whenever a badge ladder changes shape. The mark stores tier INDICES, so a
   mark written against an old ladder is meaningless against a new one — v1 (6 Lumens
   tiers + a streak ladder) read against the 20-tier ladder would have replayed several
   "newly unlocked" banners at once for every existing student. A new key reads as
   unseeded, so the watcher re-baselines silently at the student's real tier. */
const TIER_SCHEMA = "v2";
const tierKey = (sid: string) => `eyebot_rw_tiers_${TIER_SCHEMA}_${sid || "anon"}`;
const achKey = (sid: string) => `eyebot_rw_ach_${sid || "anon"}`;

/** Returns null when unseeded on this device (so the watcher baselines silently). */
export function loadTierMark(sid: string): TierMark | null {
  try {
    const v = localStorage.getItem(tierKey(sid));
    return v ? JSON.parse(v) as TierMark : null;
  } catch { return null; }
}

export function saveTierMark(sid: string, m: TierMark): void {
  try { localStorage.setItem(tierKey(sid), JSON.stringify(m)); } catch { /* ignore */ }
}

export function loadAch(sid: string): string[] {
  try {
    const v = localStorage.getItem(achKey(sid));
    return v ? JSON.parse(v) as string[] : [];
  } catch { return []; }
}

export function saveAch(sid: string, ids: string[]): void {
  try { localStorage.setItem(achKey(sid), JSON.stringify(ids)); } catch { /* ignore */ }
}
