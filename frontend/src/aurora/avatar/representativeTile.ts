/* Pick the most prominent non-default axis for a config so a saved Eyecon still looks
   customized before/without the AI portrait render. Priority = most visually dominant. */
import type { AvatarConfig } from "./axes.generated";
import { DEFAULT_AVATAR } from "./axes.generated";
import { tileSrc } from "./tiles";

const PRIORITY = ["topper", "outfit", "glasses", "accessory", "lashes", "eyeShape", "mouth"] as const;

/** Returns a tile URL for the most prominent chosen feature, or null if the config is all
 *  defaults on the tile-bearing axes (colour-only customization has no tile). */
export function representativeTileSrc(config?: Partial<AvatarConfig> | null): string | null {
  if (!config) return null;
  for (const axis of PRIORITY) {
    const v = config[axis];
    if (v && v !== "none" && v !== DEFAULT_AVATAR[axis]) return tileSrc(axis, v);
  }
  return null;
}
