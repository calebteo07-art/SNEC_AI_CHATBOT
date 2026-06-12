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
  /** CSS var name for the primary colour */
  cssVar:     string;
}

/* PHOTOPIC track identities (chinita --track-* values):
 * OA = cyan, OT = violet, PSA = emerald, core = amber — all deepened a step
 * where used as text/fills on paper surfaces. */
const TOKENS: Record<TrackOrCore, TrackTokens> = {
  OA: {
    primary:    "#06b6d4",
    deep:       "#0891b2",
    shadow:     "#0e7490",
    gradient:   "linear-gradient(145deg, #67e8f9, #22d3ee, #0891b2)",
    bg:         "rgba(34,211,238,0.12)",
    muted:      "rgba(34,211,238,0.12)",
    glow:       "rgba(34,211,238,0.28)",
    cardBg:     "rgba(34,211,238,0.08)",
    cardBorder: "rgba(34,211,238,0.30)",
    cssVar:     "var(--cyan)",
  },
  OT: {
    primary:    "#8b5cf6",
    deep:       "#7c3aed",
    shadow:     "#5b21b6",
    gradient:   "linear-gradient(145deg, #c4b5fd, #a78bfa, #7c3aed)",
    bg:         "rgba(167,139,250,0.12)",
    muted:      "rgba(167,139,250,0.12)",
    glow:       "rgba(167,139,250,0.28)",
    cardBg:     "rgba(167,139,250,0.08)",
    cardBorder: "rgba(167,139,250,0.30)",
    cssVar:     "var(--purple)",
  },
  PSA: {
    primary:    "#10b981",
    deep:       "#059669",
    shadow:     "#047857",
    gradient:   "linear-gradient(145deg, #6ee7b7, #34d399, #059669)",
    bg:         "rgba(52,211,153,0.12)",
    muted:      "rgba(52,211,153,0.12)",
    glow:       "rgba(52,211,153,0.28)",
    cardBg:     "rgba(52,211,153,0.08)",
    cardBorder: "rgba(52,211,153,0.30)",
    cssVar:     "var(--emerald)",
  },
  core: {
    primary:    "#d97706",
    deep:       "#b45309",
    shadow:     "#92400e",
    gradient:   "linear-gradient(145deg, #fcd34d, #f59e0b, #d97706)",
    bg:         "rgba(217,119,6,0.10)",
    muted:      "rgba(217,119,6,0.10)",
    glow:       "rgba(217,119,6,0.25)",
    cardBg:     "rgba(217,119,6,0.08)",
    cardBorder: "rgba(217,119,6,0.28)",
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
