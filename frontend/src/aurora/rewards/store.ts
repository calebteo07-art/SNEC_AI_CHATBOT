/* Per-student reward memory (localStorage), split into two keys:
   - tier high-water mark (level / streak tier / lumen tier) — the watcher's baseline
   - achievements set — moment-based one-time unlocks
   Keyed by studentId so accounts never bleed on a shared device. */

export interface TierMark { level: number; streakTier: number; lumenTier: number; }

const tierKey = (sid: string) => `eyebot_rw_tiers_${sid || "anon"}`;
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
