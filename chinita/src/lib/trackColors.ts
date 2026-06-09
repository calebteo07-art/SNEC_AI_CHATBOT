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
    primary:    "#22c55e",
    deep:       "#16a34a",
    shadow:     "#15803d",
    gradient:   "linear-gradient(145deg, #4ade80, #22c55e, #16a34a)",
    bg:         "rgba(34,197,94,0.10)",
    muted:      "rgba(34,197,94,0.10)",
    glow:       "rgba(34,197,94,0.28)",
    cardBg:     "rgba(34,197,94,0.08)",
    cardBorder: "rgba(34,197,94,0.25)",
    cssVar:     "var(--teal)",
  },
  OT: {
    primary:    "#a78bfa",
    deep:       "#7c3aed",
    shadow:     "#4c1d95",
    gradient:   "linear-gradient(145deg, #c4b5fd, #a78bfa, #7c3aed)",
    bg:         "rgba(167,139,250,0.10)",
    muted:      "rgba(167,139,250,0.10)",
    glow:       "rgba(167,139,250,0.28)",
    cardBg:     "rgba(167,139,250,0.08)",
    cardBorder: "rgba(167,139,250,0.25)",
    cssVar:     "var(--purple)",
  },
  PSA: {
    primary:    "#34d399",
    deep:       "#059669",
    shadow:     "#064e3b",
    gradient:   "linear-gradient(145deg, #6ee7b7, #34d399, #059669)",
    bg:         "rgba(52,211,153,0.10)",
    muted:      "rgba(52,211,153,0.10)",
    glow:       "rgba(52,211,153,0.28)",
    cardBg:     "rgba(52,211,153,0.08)",
    cardBorder: "rgba(52,211,153,0.25)",
    cssVar:     "var(--emerald)",
  },
  core: {
    primary:    "#fbbf24",
    deep:       "#d97706",
    shadow:     "#92400e",
    gradient:   "linear-gradient(145deg, #fde68a, #fbbf24, #f59e0b)",
    bg:         "rgba(251,191,36,0.10)",
    muted:      "rgba(251,191,36,0.10)",
    glow:       "rgba(251,191,36,0.28)",
    cardBg:     "rgba(251,191,36,0.08)",
    cardBorder: "rgba(251,191,36,0.25)",
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
