// Eyecon colour manifest — the swatch maps for the colour axes (body/iris)
// plus the background base tints consumed by backdrops.ts. Typed Record<IdUnion,
// string> derived from the generated registry, so `npm run typecheck` fails if an
// id is unmapped. Shape/prop axes have NO client-side art: they render only inside
// the one AI portrait (seamless-custom spec) and as static tiles in the Studio.
import { AVATAR_AXES } from "./axes.generated";

export type BodyColor = (typeof AVATAR_AXES)["bodyColor"][number];
export type IrisColor = (typeof AVATAR_AXES)["irisColor"][number];
export type Background = (typeof AVATAR_AXES)["background"][number];

export const BODY_COLORS: Record<BodyColor, string> = {
  porcelain: "#FCE7DA", light: "#FAD7BD", warm: "#EFC29A", tan: "#DBA472",
  brown: "#B87C4E", deep: "#955E37", rich: "#6E4A34", ebony: "#4A2C18",
  peach: "#F4C4A0", coral: "#F2A184", rose: "#F1B4C4", butter: "#F6DA86",
  mint: "#A6E0C6", sage: "#B6D6A6", sky: "#A6CCEE", periwinkle: "#B7BCF0",
  lavender: "#CDB6EC", slate: "#9FB0C4", bubblegum: "#F3A6D0", aqua: "#8FD8D2",
  gold: "#EFC75E", silver: "#CDD3DC", midnight: "#3A3F55", watermelon: "#F58A7E",
};

export const IRIS_COLORS: Record<IrisColor, string> = {
  darkBrown: "#3E2C1E", brown: "#6E4A2A", hazel: "#8C6A38", amber: "#C0862C",
  green: "#3E8A57", blue: "#3F73C4", gray: "#8791A0", violet: "#8A5FC0",
  teal: "#2E9C9A", rose: "#C85E86", gold: "#D6A32E", galaxy: "#6E4AB8",
  lava: "#E0522E", ice: "#BFE4F2", rainbow: "#B76BD9",
};

// Base fill for the background; gradient/pattern ids are elaborated in the renderer.
export const BG_COLORS: Record<Background, string> = {
  mist: "#EAECEF", blush: "#FBE3EB", sky: "#E2F1FC", mint: "#E3F5EC", lilac: "#EEE6FB",
  sun: "#FEF2D4", graphite: "#2B2E33", gemini: "#EAE6FB", galaxy: "#241B3C",
  confetti: "#FBF0F4", sunset: "#FBDCC4", ocean: "#D8EEF6", forest: "#DCEED8",
  aurora: "#DFF3EE", lavaLamp: "#F8E0EE", arcade: "#1E2340", rainyWindow: "#DCE7EE",
  candy: "#FDEBF3", sakura: "#FBE7EC",
};
