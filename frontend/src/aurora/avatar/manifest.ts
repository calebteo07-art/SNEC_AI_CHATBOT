// Selena sprite/part manifest — the runtime side of RICOE D10.
//
// Selena is Iris: a one-eyed mascot composited from layered parts. This file is
// the single place that maps every option id (from the generated registry mirror)
// to how it renders. Colour axes map an id -> hex; shape axes are handled by the
// typed part registries in renderSelena.ts. Both are typed as Record<IdUnion, ...>
// derived from AVATAR_AXES, so `npm run typecheck` fails if any id is unmapped —
// a compile-time parity guard against the backend registry (no drift possible).
//
// Scaffold note (RICOE D11): parts currently render as free placeholder SVG. The
// curated 3D sprite library (Nano Banana) swaps in later, on explicit go-ahead —
// a localized change to the part renderers, not this contract.
import { AVATAR_AXES } from "./axes.generated";

export type BodyColor = (typeof AVATAR_AXES)["bodyColor"][number];
export type IrisColor = (typeof AVATAR_AXES)["irisColor"][number];
export type EyeShape = (typeof AVATAR_AXES)["eyeShape"][number];
export type Lashes = (typeof AVATAR_AXES)["lashes"][number];
export type Mouth = (typeof AVATAR_AXES)["mouth"][number];
export type Blush = (typeof AVATAR_AXES)["blush"][number];
export type Glasses = (typeof AVATAR_AXES)["glasses"][number];
export type Topper = (typeof AVATAR_AXES)["topper"][number];
export type Accessory = (typeof AVATAR_AXES)["accessory"][number];
export type Outfit = (typeof AVATAR_AXES)["outfit"][number];
export type Background = (typeof AVATAR_AXES)["background"][number];

// Draw order, back to front. Colour axes tint the base body/eye/bg shapes; shape
// axes overlay on top.
export const LAYER_ORDER = [
  "background",
  "body",
  "blush",
  "eye",
  "lashes",
  "mouth",
  "glasses",
  "outfit",
  "accessory",
  "topper",
] as const;

export const BODY_COLORS: Record<BodyColor, string> = {
  porcelain: "#FCE7DA", light: "#FAD7BD", warm: "#EFC29A", tan: "#DBA472",
  brown: "#B87C4E", deep: "#955E37", rich: "#6E4A34", ebony: "#4A2C18",
  peach: "#F4C4A0", coral: "#F2A184", rose: "#F1B4C4", butter: "#F6DA86",
  mint: "#A6E0C6", sage: "#B6D6A6", sky: "#A6CCEE", periwinkle: "#B7BCF0",
  lavender: "#CDB6EC", slate: "#9FB0C4", bubblegum: "#F3A6D0", aqua: "#8FD8D2",
};

export const IRIS_COLORS: Record<IrisColor, string> = {
  darkBrown: "#3E2C1E", brown: "#6E4A2A", hazel: "#8C6A38", amber: "#C0862C",
  green: "#3E8A57", blue: "#3F73C4", gray: "#8791A0", violet: "#8A5FC0",
  teal: "#2E9C9A", rose: "#C85E86", gold: "#D6A32E", galaxy: "#6E4AB8",
};

// null = no blush. "stars"/"freckles" reuse a tone but draw a pattern (renderer).
export const BLUSH_COLORS: Record<Blush, string | null> = {
  none: null, rose: "#F28C9A", coral: "#F5936B", peach: "#F7C09B", plum: "#C77FC0",
  berry: "#E5638C", sky: "#6FB8E8", mint: "#6FD3B0", gold: "#F0C043", grape: "#9B7BE8",
  teal: "#4FC6C0", stars: "#F0A0C0", freckles: "#C98A5E",
};

// Base fill for the background; gradient/pattern ids are elaborated in the renderer.
export const BG_COLORS: Record<Background, string> = {
  mist: "#EAECEF", blush: "#FBE3EB", sky: "#E2F1FC", mint: "#E3F5EC", lilac: "#EEE6FB",
  sun: "#FEF2D4", graphite: "#2B2E33", gemini: "#EAE6FB", galaxy: "#241B3C",
  confetti: "#FBF0F4", sunset: "#FBDCC4", ocean: "#D8EEF6", forest: "#DCEED8",
};
