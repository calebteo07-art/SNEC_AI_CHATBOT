// AUTO-GENERATED from tools/avatar/parts.py by tools/avatar/export_axes.py.
// Do not edit by hand — run `python tools/avatar/export_axes.py` and commit.
// Selena is Iris: a one-eyed mascot; these ids map to sprite parts (RICOE D9/D10).

export const CONFIG_VERSION = 2 as const;

export const AVATAR_AXES = {
  bodyColor: ["porcelain", "light", "warm", "tan", "brown", "deep", "rich", "ebony", "peach", "coral", "rose", "butter", "mint", "sage", "sky", "periwinkle", "lavender", "slate", "bubblegum", "aqua"],
  irisColor: ["darkBrown", "brown", "hazel", "amber", "green", "blue", "gray", "violet", "teal", "rose", "gold", "galaxy"],
  eyeShape: ["round", "wide", "almond", "sleepy", "upturned", "sparkle", "starry"],
  lashes: ["none", "natural", "glam", "cyber"],
  mouth: ["smile", "grin", "soft", "open", "smirk", "ooh", "tongue"],
  blush: ["none", "rose", "coral", "peach", "plum", "berry", "sky", "mint", "gold", "grape", "teal", "stars", "freckles"],
  glasses: ["none", "round", "square", "catEye", "monocle", "reading", "goggles", "heart", "visor"],
  topper: ["none", "sprout", "bow", "cap", "beanie", "halo", "clip", "flower", "antenna", "crown", "horns", "flame"],
  accessory: ["none", "headphones", "earmuffs", "bandage", "sticker", "sparkles"],
  outfit: ["none", "scarf", "bowtie", "collar", "lanyard", "hoodie", "labcoat", "turtleneck", "overalls", "cape"],
  background: ["mist", "blush", "sky", "mint", "lilac", "sun", "graphite", "gemini", "galaxy", "confetti", "sunset", "ocean", "forest"],
} as const;

export type AvatarAxis = keyof typeof AVATAR_AXES;

export const DEFAULT_AVATAR = {
  version: 2,
  bodyColor: "peach",
  irisColor: "blue",
  eyeShape: "round",
  lashes: "none",
  mouth: "smile",
  blush: "peach",
  glasses: "none",
  topper: "none",
  accessory: "none",
  outfit: "none",
  background: "mist",
} as const;

export type AvatarConfig = { version: number } & Record<AvatarAxis, string>;
