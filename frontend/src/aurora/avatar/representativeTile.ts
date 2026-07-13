/* Pick the most prominent non-default feature of a config so a saved Eyecon still looks
   customized before (or without) the AI portrait render — the paid render never runs in
   keyless environments, so this is what makes the home button + leaderboard + nav chip
   read as "customized" everywhere. Priority = most visually dominant axis first. Colour
   axes (body/iris/blush) have no tile art, so a colour-only customization returns null
   and the caller falls back to the default mascot. */
import type { AvatarConfig } from "./axes.generated";
import { DEFAULT_AVATAR } from "./axes.generated";
import { tileSrc } from "./tiles";

const PRIORITY = ["topper", "outfit", "glasses", "accessory", "lashes", "eyeShape", "mouth"] as const;

/** Tile URL for the most prominent chosen feature, or null when the config is all
 *  defaults on the tile-bearing axes. */
export function representativeTileSrc(config?: Partial<AvatarConfig> | null): string | null {
  if (!config) return null;
  for (const axis of PRIORITY) {
    const v = config[axis];
    if (v && v !== "none" && v !== DEFAULT_AVATAR[axis]) return tileSrc(axis, v);
  }
  return null;
}
