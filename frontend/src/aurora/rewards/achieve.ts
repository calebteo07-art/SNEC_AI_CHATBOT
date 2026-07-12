import { loadAch, saveAch } from "./store";
import { ACHIEVEMENTS, achievementArt } from "./catalog";
import type { Reward } from "./types";

/** Grant named achievements once each (deduped via the per-student set) and return the
 *  Rewards to enqueue. `lumens` (optional) is attached to the first new reward, so an
 *  OSCE station can show its Lumen award on the banner. */
export function grantAchievements(studentId: string, ids: string[], lumens?: number): Reward[] {
  const have = loadAch(studentId);
  const out: Reward[] = [];
  for (const id of ids) {
    const def = ACHIEVEMENTS[id];
    if (!def || have.includes(id)) continue;
    have.push(id);
    out.push({
      id: `achievement:${id}`, kind: "achievement",
      title: def.title, subtitle: def.subtitle, art: achievementArt(def.feature),
      lumens: out.length === 0 ? lumens : undefined,
    });
  }
  saveAch(studentId, have);
  return out;
}
