// frontend/src/app/utils/trackColors.ts
import type { Track } from "./curriculum";

export type TrackOrCore = Track | "core";

interface TrackTokens {
  primary: string;
  light: string;
  shadow: string;
  /** CSS gradient string for node/button backgrounds */
  gradient: string;
  /** Translucent fill for card backgrounds */
  cardBg: string;
  /** Border colour for cards */
  cardBorder: string;
  /** Tailwind-compatible rgba for glow */
  glow: string;
}

const TOKENS: Record<TrackOrCore, TrackTokens> = {
  OA: {
    primary:    "#58CC02",
    light:      "#72E010",
    shadow:     "#267800",
    gradient:   "linear-gradient(145deg, #72E010, #58CC02, #3EA000)",
    cardBg:     "rgba(88,204,2,0.1)",
    cardBorder: "rgba(88,204,2,0.2)",
    glow:       "rgba(88,204,2,0.3)",
  },
  OT: {
    primary:    "#1CB0F6",
    light:      "#4DC8FF",
    shadow:     "#0068AA",
    gradient:   "linear-gradient(145deg, #4DC8FF, #1CB0F6, #0090DD)",
    cardBg:     "rgba(28,176,246,0.1)",
    cardBorder: "rgba(28,176,246,0.2)",
    glow:       "rgba(28,176,246,0.35)",
  },
  PSA: {
    primary:    "#FF9600",
    light:      "#FFB340",
    shadow:     "#AA5500",
    gradient:   "linear-gradient(145deg, #FFB340, #FF9600, #DD7400)",
    cardBg:     "rgba(255,150,0,0.1)",
    cardBorder: "rgba(255,150,0,0.2)",
    glow:       "rgba(255,150,0,0.3)",
  },
  core: {
    primary:    "#B44FFF",
    light:      "#CC70FF",
    shadow:     "#6A1FAA",
    gradient:   "linear-gradient(145deg, #CC70FF, #B44FFF, #8A30CC)",
    cardBg:     "rgba(180,80,255,0.1)",
    cardBorder: "rgba(180,80,255,0.2)",
    glow:       "rgba(180,80,255,0.3)",
  },
};

export function trackTokens(track: TrackOrCore): TrackTokens {
  return TOKENS[track];
}

/** Returns the CSS class suffix for btn- and track-glow- utilities */
export function trackClass(track: TrackOrCore): string {
  return track.toLowerCase();
}

/** Anatomy image path for a given track */
export function trackAnatomyImage(track: TrackOrCore): string {
  const map: Record<TrackOrCore, string> = {
    OA:   "/anatomy/eye-fundus.png",
    OT:   "/anatomy/eye-oct.png",
    PSA:  "/anatomy/eye-anterior.png",
    core: "/anatomy/eye-scan.png",
  };
  return map[track];
}
