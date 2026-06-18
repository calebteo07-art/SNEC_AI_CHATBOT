"use client";
/* TopicGlyph — a small monochrome line glyph per flashcard topic. A curated set of
   primitives is mapped from topic_key (see TOPIC_GLYPH); unknown keys fall back to
   the eye. All glyphs inherit currentColor and share a 24×24 box. */

type GlyphName =
  | "eye" | "retina" | "drop" | "gauge" | "dots" | "grid" | "scan" | "plot"
  | "cornea" | "pupil" | "alert" | "clipboard" | "acuity" | "ruler" | "topo" | "cross" | "mixed";

const box = {
  width: 22, height: 22, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.7,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

const GLYPHS: Record<GlyphName, React.ReactNode> = {
  eye: (<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>),
  retina: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>),
  drop: (<path d="M12 3s6 6.5 6 10.5A6 6 0 1 1 6 13.5C6 9.5 12 3 12 3Z" />),
  gauge: (<><path d="M4 18a8 8 0 0 1 16 0" /><path d="M12 18l4-5" /><circle cx="12" cy="18" r="1.2" /></>),
  dots: (<><circle cx="8" cy="9" r="1.4" /><circle cx="13" cy="7.5" r="1.4" /><circle cx="16" cy="11" r="1.4" /><circle cx="9.5" cy="14" r="1.4" /><circle cx="14.5" cy="15" r="1.4" /></>),
  grid: (<><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M12 4v16M4 12h16" /></>),
  scan: (<><path d="M3 14c3 0 3-4 6-4s3 4 6 4 3-4 6-4" /><path d="M3 9h18" opacity="0.5" /></>),
  plot: (<><circle cx="12" cy="12" r="9" /><path d="M12 6v12M6 12h12" opacity="0.5" /><circle cx="9" cy="10" r="1" /><circle cx="15" cy="14" r="1" /></>),
  cornea: (<><path d="M3 12a9 9 0 0 1 18 0" /><path d="M5 12a7 7 0 0 1 14 0" opacity="0.6" /><path d="M7 12a5 5 0 0 1 10 0" opacity="0.35" /></>),
  pupil: (<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.4" /></>),
  alert: (<><path d="M12 4 3 19h18L12 4Z" /><path d="M12 10v4M12 17h.01" /></>),
  clipboard: (<><rect x="6" y="4" width="12" height="16" rx="1.6" /><path d="M9 4h6v2H9zM8.5 10h7M8.5 14h5" /></>),
  acuity: (<><path d="M7 5h10M7 5v14M7 12h6M7 19h10" /></>),
  ruler: (<><rect x="3" y="8" width="18" height="8" rx="1.2" /><path d="M7 8v3M11 8v4M15 8v3M19 8v4" /></>),
  topo: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.5" opacity="0.6" /><circle cx="12" cy="12" r="2" opacity="0.35" /></>),
  cross: (<><path d="M12 4v16M4 12h16" /><circle cx="12" cy="12" r="9" opacity="0.5" /></>),
  mixed: (<><circle cx="9" cy="9" r="4" /><circle cx="15" cy="15" r="4" opacity="0.6" /></>),
};

/** topic_key → glyph. Keys come from tools/flashcards/flashcard_sets.py (CLINICAL + OT). */
const TOPIC_GLYPH: Record<string, GlyphName> = {
  // CLINICAL
  ocular_emergencies: "alert", red_eye: "eye", triage: "alert", history_taking: "clipboard",
  distance_va: "acuity", near_vision: "acuity", pinhole: "pupil", iop_nct: "gauge",
  eye_drops: "drop", pupil_dilation: "pupil", colour_vision: "dots", amsler_macula: "grid",
  fall_risk: "alert", perioperative: "cross", abbreviations: "clipboard",
  // OT
  oct_macula: "scan", oct_rnfl: "retina", hvf: "plot", gvf: "plot", ascan_biometry: "ruler",
  optical_biometry: "ruler", endothelial: "cornea", asoct: "scan", flare: "dots",
  corneal_topography: "topo", pam: "acuity", hrt: "retina", orthoptics: "eye",
  dayward_theatre: "cross", auto_refraction: "ruler",
};

export function TopicGlyph({ topicKey }: { topicKey: string }) {
  const name: GlyphName = topicKey === "__mixed" ? "mixed" : (TOPIC_GLYPH[topicKey] ?? "eye");
  return (<svg {...box} aria-hidden>{GLYPHS[name]}</svg>);
}
