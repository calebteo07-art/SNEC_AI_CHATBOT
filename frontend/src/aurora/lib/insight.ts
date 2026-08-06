/* TS mirror of the payload `build_student_insight` returns (served at
   GET /api/admin/student/{id}/detail as `insight`).

   Types + constants only, no logic, no imports — so every report builder can read the same
   shape without pulling in React or a fetch layer, and so the Node harnesses can import it
   under type-stripping.

   The constants are duplicated from tools/supervisor/{topic_map,osce_analysis}.py. They are
   thresholds the DOCUMENT has to explain to a trainer ("4 needed", "3 peers"), so the prose
   and the arithmetic must not drift. If you change one side, change both. */

/** All FIVE values `topic_map.py::band_for` can return — "absent" included. It is the
    `Cell()` default, handed to any topic missing from one axis (topic_map.py:212), and
    omitting it from this union would promise a `switch` an exhaustiveness it does not have. */
export type Band = "thin" | "weak" | "developing" | "strong" | "absent";
export type Flag = "" | "knows_cant_do" | "rote" | "consistent_gap";
export type TrajectoryBand = "insufficient" | "declining" | "steady" | "improving";
export type Axis = "flashcards" | "station";

/** `band === "absent"` iff `n === 0` — the three real construction sites (topic_map.py:91,
    121, 146) all pass a real value AND a real n, so the only way to get "absent" is the
    default `Cell()`, which carries n=0. Every renderer guards on `n` before reading `value`,
    which is why `value` is typed non-null here: it is unreadable when it would be null. */
export interface Cell { value: number; n: number; band: Band }

export interface TopicRow {
  topic: string; flag: Flag;
  flashcards: Cell; station: Cell; retention: Cell;
}

export interface Contrast {
  topic: string; axis: Axis; student: number;
  /** null when fewer than MIN_PEERS peers have this topic. NEVER render 0 for it. */
  cohortMean: number | null;
  peers: number; label: string;
}

export interface MarkLoss {
  lost: { checklist: number; consult: number; judgement: number };
  totalLost: number;
  shares: { checklist: number; consult: number; judgement: number };
  attempts: number;
  excludedLegacy: number;
}

export interface Offender {
  action: string; missed: number; critical: boolean;
  /** null on the critical_offenders path (missed_critical carries no denominator).
      Render "missed in 3 attempts", never a fraction. */
  appeared: number | null;
}

export interface Trajectory {
  band: TrajectoryBand; delta: number | null; n: number; needed: number;
  firstMean: number | null; secondMean: number | null;
}

export interface Consultation {
  label: string; count: number; lastSeen: string; derived: boolean;
}

export interface StudentInsight {
  topics: TopicRow[];
  contrasts: Contrast[];
  markLoss: MarkLoss;
  offenders: Offender[];
  criticalOffenders: Offender[];
  osceTrajectory: Trajectory;
  flashcardTrajectory: Trajectory;
  consultations: Consultation[];
  excluded: { unmappedCase: number; unscored: number };
}

/** One attempt, from GET /api/admin/student/{id}/attempts. */
export interface AttemptStep {
  stepNumber: number; action: string; phase: string;
  critical: boolean; performed: boolean; skipped: boolean;
}

export interface Attempt {
  caseId: string; completedAt: string; totalScore: number; passed: boolean;
  score100: number | null; safe: boolean | null;
  checklistCoverage: number | null; consultTechnique: number | null;
  judgementSafety: number | null; gradeScale: number | null;
  missedCritical: string[];
  coaching: Record<string, unknown> | null;
  /** null = predates migration 019. [] = the attempt genuinely resolved zero steps. */
  checklistDetail: AttemptStep[] | null;
}

// Mirrors of the Python thresholds. See the module comment.
export const MIN_TRAJECTORY_N = 4;
export const TRAJECTORY_DEAD_BAND = 5.0;
export const MIN_PEERS = 3;
export const MIN_CARDS = 5;
export const INDIVIDUAL_GAP = 15.0;
export const GRADE_SCALE_CURRENT = 2;
