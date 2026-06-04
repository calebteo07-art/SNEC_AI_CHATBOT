import type { Track } from "./curriculum";

export type TrackOrCore = Track | "core";

export interface TrackTokens {
  primary:    string;
  deep:       string;
  shadow:     string;
  gradient:   string;
  bg:         string;
  muted:      string;
  glow:       string;
  cardBg:     string;
  cardBorder: string;
  /** CSS var name for the primary colour (matches duolingo.css) */
  cssVar:     string;
}

const TOKENS: Record<TrackOrCore, TrackTokens> = {
  OA: {
    primary:    "#0891b2",
    deep:       "#0e7490",
    shadow:     "#164e63",
    gradient:   "linear-gradient(145deg, #06b6d4, #0891b2, #0e7490)",
    bg:         "#ecfeff",
    muted:      "rgba(8,145,178,0.10)",
    glow:       "rgba(8,145,178,0.28)",
    cardBg:     "rgba(8,145,178,0.08)",
    cardBorder: "rgba(8,145,178,0.20)",
    cssVar:     "var(--teal)",
  },
  OT: {
    primary:    "#7c3aed",
    deep:       "#6d28d9",
    shadow:     "#4c1d95",
    gradient:   "linear-gradient(145deg, #8b5cf6, #7c3aed, #6d28d9)",
    bg:         "#f5f3ff",
    muted:      "rgba(124,58,237,0.10)",
    glow:       "rgba(124,58,237,0.28)",
    cardBg:     "rgba(124,58,237,0.08)",
    cardBorder: "rgba(124,58,237,0.20)",
    cssVar:     "var(--purple)",
  },
  PSA: {
    primary:    "#059669",
    deep:       "#047857",
    shadow:     "#064e3b",
    gradient:   "linear-gradient(145deg, #10b981, #059669, #047857)",
    bg:         "#ecfdf5",
    muted:      "rgba(5,150,105,0.10)",
    glow:       "rgba(5,150,105,0.28)",
    cardBg:     "rgba(5,150,105,0.08)",
    cardBorder: "rgba(5,150,105,0.20)",
    cssVar:     "var(--emerald)",
  },
  core: {
    primary:    "#d97706",
    deep:       "#b45309",
    shadow:     "#92400e",
    gradient:   "linear-gradient(145deg, #f59e0b, #d97706, #b45309)",
    bg:         "#fffbeb",
    muted:      "rgba(217,119,6,0.10)",
    glow:       "rgba(217,119,6,0.28)",
    cardBg:     "rgba(217,119,6,0.08)",
    cardBorder: "rgba(217,119,6,0.20)",
    cssVar:     "var(--gold)",
  },
};

export function trackTokens(track: TrackOrCore): TrackTokens {
  return TOKENS[track];
}

export function trackClass(track: TrackOrCore): string {
  const map: Record<TrackOrCore, string> = { OA: "oa", OT: "ot", PSA: "psa", core: "core" };
  return map[track];
}

export function trackAnatomyImage(track: TrackOrCore): string {
  const map: Record<TrackOrCore, string> = {
    OA:   "/anatomy/eye-fundus.png",
    OT:   "/anatomy/eye-oct.png",
    PSA:  "/anatomy/eye-anterior.png",
    core: "/anatomy/eye-scan.png",
  };
  return map[track];
}

/** Maps a topic id to the anatomy hero image for its NodeTooltip */
export function topicHeroImage(topicId: string): string {
  const map: Record<string, string> = {
    "oa-anatomy":    "/anatomy/eye-scan.png",
    "oa-slitlamp":   "/anatomy/clinic-slitlamp.png",
    "oa-iop":        "/anatomy/eye-scan.png",
    "oa-dilation":   "/anatomy/eye-anterior.png",
    "ot-slitlamp":   "/anatomy/clinic-slitlamp.png",
    "ot-oct":        "/anatomy/eye-oct.png",
    "ot-hvf":        "/anatomy/eye-innovation.png",
    "ot-biometry":   "/anatomy/eye-innovation.png",
    "psa-eyedrops":  "/anatomy/eye-anterior.png",
    "psa-nct":       "/anatomy/eye-scan.png",
    "psa-logmar":    "/anatomy/eye-hero.png",
    "psa-pfaer":     "/anatomy/eye-nerve.png",
    "fundamentals":  "/anatomy/eye-fundus.png",
  };
  return map[topicId] ?? "/anatomy/eye-hero.png";
}
