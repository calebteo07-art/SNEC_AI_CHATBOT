export type Track = "OA" | "OT" | "PSA";
export type NodeState = "done" | "active" | "locked";
export type TopicIconKey =
  | "eye" | "microscope" | "drop" | "clipboard"
  | "lightbulb" | "waveform" | "camera" | "ruler" | "lock";

export interface TopicNode {
  id: string;
  label: string;
  track: Track | "core";
  icon: TopicIconKey;
  /** short description shown in the node popup */
  description: string;
}

/** All topics in display order */
export const CURRICULUM: TopicNode[] = [
  // Shared core — shown as banner, not a track column node
  {
    id: "fundamentals",
    label: "OAOT Fundamentals",
    track: "core",
    icon: "lightbulb",
    description: "Foundation module — all tracks",
  },
  // OA
  {
    id: "oa-anatomy",
    label: "Eye Anatomy",
    track: "OA",
    icon: "eye",
    description: "Ocular structures & functions",
  },
  {
    id: "oa-slitlamp",
    label: "Slit Lamp",
    track: "OA",
    icon: "microscope",
    description: "Slit-lamp examination technique",
  },
  {
    id: "oa-iop",
    label: "IOP & Tonometry",
    track: "OA",
    icon: "ruler",
    description: "Intraocular pressure measurement",
  },
  {
    id: "oa-dilation",
    label: "Dilation",
    track: "OA",
    icon: "drop",
    description: "Mydriatic instillation protocol",
  },
  // OT
  {
    id: "ot-slitlamp",
    label: "Slit Lamp",
    track: "OT",
    icon: "microscope",
    description: "Advanced slit-lamp techniques",
  },
  {
    id: "ot-oct",
    label: "OCT Imaging",
    track: "OT",
    icon: "camera",
    description: "Retinal layer identification",
  },
  {
    id: "ot-hvf",
    label: "Visual Fields",
    track: "OT",
    icon: "waveform",
    description: "Humphrey visual field interpretation",
  },
  {
    id: "ot-biometry",
    label: "Biometry",
    track: "OT",
    icon: "ruler",
    description: "A-scan & IOL calculation",
  },
  // PSA
  {
    id: "psa-eyedrops",
    label: "Eye Drops",
    track: "PSA",
    icon: "drop",
    description: "Topical medication instillation",
  },
  {
    id: "psa-nct",
    label: "NCT",
    track: "PSA",
    icon: "clipboard",
    description: "Non-contact tonometry",
  },
  {
    id: "psa-logmar",
    label: "LogMAR VA",
    track: "PSA",
    icon: "ruler",
    description: "Visual acuity measurement",
  },
  {
    id: "psa-pfaer",
    label: "PFAER & Falls",
    track: "PSA",
    icon: "clipboard",
    description: "Patient fall risk assessment",
  },
];

export const OA_TOPICS  = CURRICULUM.filter(t => t.track === "OA");
export const OT_TOPICS  = CURRICULUM.filter(t => t.track === "OT");
export const PSA_TOPICS = CURRICULUM.filter(t => t.track === "PSA");

/** Maps a topic id to its NodeState based on API progress data */
export function resolveNodeState(
  topicId: string,
  completedIds: string[],
  activeId: string | null
): NodeState {
  if (completedIds.includes(topicId)) return "done";
  if (topicId === activeId) return "active";
  // A topic is unlocked (active-eligible) only if the previous one in
  // the same track is done, or it's the first in the track.
  return "locked";
}

/** Reusable ProgressData type (mirrors /api/progress response) */
export interface ProgressData {
  session_count: number;
  streak: number;
  learning_velocity: "improving" | "stable" | "declining";
  weak_topics: string[];
  topic_performance: { topic: string; score: number }[];
  sessions: {
    session_id: string;
    timestamp: string;
    topic: string;
    summary: string;
    mode: string;
  }[];
}
