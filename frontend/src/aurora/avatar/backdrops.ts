/* Canonical background-axis → CSS map. v2 portraits are transparent cutouts, so
   the `background` choice renders as a CSS layer BEHIND the image — instant to
   switch, free, and never forces a re-render. Typed Record<Background, …> so
   `npm run typecheck` fails if the registry gains an id without a backdrop. */
import { BG_COLORS, type Background } from "./manifest";

const GRADIENTS: Partial<Record<Background, string>> = {
  gemini: "linear-gradient(135deg,#c9c2f5,#eae6fb 55%,#f6d9c4)",
  galaxy: "radial-gradient(circle at 32% 26%,#3a2b63,#241b3c 72%)",
  sunset: "linear-gradient(160deg,#fbdcc4,#f4ad86)",
  ocean: "linear-gradient(160deg,#d8eef6,#bfe0ef)",
  confetti: "radial-gradient(circle at 30% 20%,#fbe3eb,#fbf0f4)",
  sun: "linear-gradient(160deg,#fef2d4,#fbe6b0)",
  forest: "linear-gradient(160deg,#dceed8,#b9d9af)",
  aurora: "linear-gradient(160deg,#d8f3ec,#bfe7dc 45%,#cfd8f2)",
  lavaLamp: "linear-gradient(180deg,#fbe0ef,#f6c9e2 40%,#e9d1f5)",
  arcade: "radial-gradient(circle at 50% 20%,#2c3466,#1e2340 70%)",
  sakura: "linear-gradient(160deg,#fdeef2,#f9d9e2)",
};

/** Full backdrop CSS for a background id ("transparent" when unset/unknown). */
export function backdropCss(id?: string): string {
  if (id && id in GRADIENTS) return GRADIENTS[id as Background]!;
  if (id && id in BG_COLORS) return BG_COLORS[id as Background];
  return "transparent";
}

/** A soft tint for glow/halo effects derived from the same choice. */
export function backdropGlow(id?: string): string {
  return id && id in BG_COLORS ? BG_COLORS[id as Background] : "#f2e2d0";
}
