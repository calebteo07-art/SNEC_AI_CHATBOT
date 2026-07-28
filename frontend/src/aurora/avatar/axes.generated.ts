// AUTO-GENERATED from tools/avatar/parts.py by tools/avatar/export_axes.py.
// Do not edit by hand — run `python tools/avatar/export_axes.py` and commit.
// Selena is Iris: a one-eyed mascot; these ids drive her portrait render + Studio option tiles.

export const CONFIG_VERSION = 2 as const;

export const AVATAR_AXES = {
  bodyColor: ["porcelain", "light", "warm", "tan", "brown", "deep", "rich", "ebony", "peach", "coral", "rose", "butter", "mint", "sage", "sky", "periwinkle", "lavender", "slate", "bubblegum", "aqua", "gold", "silver", "midnight", "watermelon"],
  irisColor: ["darkBrown", "brown", "hazel", "amber", "green", "blue", "gray", "violet", "teal", "rose", "gold", "galaxy", "lava", "ice", "rainbow"],
  eyeShape: ["round", "wide", "almond", "sleepy", "upturned", "sparkle", "starry", "heart", "dizzy", "laser", "pixel", "rainbow"],
  topper: ["none", "sprout", "bow", "cap", "beanie", "halo", "clip", "flower", "antenna", "crown", "horns", "flame", "wizardHat", "propeller", "trafficCone", "rubberDuck", "croissant", "vikingHelm", "pirateHat", "cowboyHat", "chefToque", "discoBall", "catEars", "mushroom"],
  accessory: ["none", "headphones", "earmuffs", "bandage", "sticker", "fairyDust", "snorkel", "bobaTea", "magicWand", "balloon", "goldChain", "mustache", "fannyPack", "petSnail", "jetpack", "umbrella"],
  outfit: ["none", "scarf", "bowtie", "collar", "lanyard", "hoodie", "labcoat", "turtleneck", "overalls", "cape", "dinoOnesie", "astronaut", "tuxedo", "bananaSuit", "bubbleWrap", "hawaiian", "knightArmor", "chefApron", "pufferJacket", "superSuit"],
  background: ["mist", "blush", "sky", "mint", "lilac", "sun", "graphite", "gemini", "galaxy", "confetti", "sunset", "ocean", "forest", "aurora", "lavaLamp", "arcade", "rainyWindow", "candy", "sakura"],
} as const;

export type AvatarAxis = keyof typeof AVATAR_AXES;

export const DEFAULT_AVATAR = {
  version: 2,
  bodyColor: "peach",
  irisColor: "blue",
  eyeShape: "round",
  topper: "none",
  accessory: "none",
  outfit: "none",
  background: "mist",
} as const;

// Pre-rendered full-Eyecon library tiles (category -> option ids). A saved
// config may carry portrait: "<category>/<id>", rendered as one baked image.
export const PORTRAIT_TILES = {
  outfit: ["astronaut", "bananaSuit", "bowtie", "bubbleWrap", "cape", "chefApron", "collar", "dinoOnesie", "hawaiian", "hoodie", "knightArmor", "labcoat", "lanyard", "overalls", "pufferJacket", "scarf", "superSuit", "turtleneck", "tuxedo"],
  topper: ["antenna", "beanie", "bow", "cap", "catEars", "chefToque", "clip", "cowboyHat", "croissant", "crown", "discoBall", "flame", "flower", "halo", "horns", "mushroom", "pirateHat", "propeller", "rubberDuck", "sprout", "trafficCone", "vikingHelm", "wizardHat"],
  mouth: ["catSmile", "chomp", "evilGrin", "grin", "open", "pout", "shocked", "smile", "smirk", "soft", "tongue", "whistle"],
  eyeShape: ["almond", "dizzy", "heart", "laser", "pixel", "rainbow", "round", "sleepy", "sparkle", "starry", "upturned", "wide"],
  lashes: ["butterfly", "feathery"],
  accessory: ["balloon", "bandage", "bobaTea", "earmuffs", "fairyDust", "fannyPack", "goldChain", "headphones", "jetpack", "magicWand", "mustache", "petSnail", "snorkel", "sticker", "umbrella"],
} as const;

export type PortraitCategory = keyof typeof PORTRAIT_TILES;

export type AvatarConfig = { version: number; portrait?: string } & Record<AvatarAxis, string>;
