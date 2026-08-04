/* The grade's buckets — 40/30/30, checklist first because it is the largest and because
   completing the procedure IS the allied-health competency.

   Defined ONCE: the debrief cards and the saved report both render this, so the report can
   never omit a bucket the student saw on screen. Every value, max and remark comes from the
   backend, which owns the formula — this hardcodes no weighting of its own.

   Lives in lib/ rather than inside CaseSession so the mapping can be unit-tested without a
   browser: which remark belongs to which bucket is exactly what was wrong (see
   frontend/tests/scoreBuckets_logic.mjs). */
import type { ScoreBucket } from "./sessionExport";

export interface ScorePart { label: string; pts: number; max: number }
export interface SchemeBreakdown {
  parts: ScorePart[];
  total: number;
  max: number;
  capped: boolean;
  cap_reason: string;
  /** A bucket whose points are deterministic has no examiner paragraph; the backend
      writes its remark here instead. */
  note?: string;
}
export interface ScoreBreakdown {
  checklist: SchemeBreakdown;
  consult: SchemeBreakdown;
  judgement: SchemeBreakdown;
}

/** The fields of the graded result this mapping reads. */
export interface BucketSource {
  history_feedback: string;
  investigations_feedback: string;
  diagnosis_feedback: string;
  management_feedback: string;
  checklist_coverage: number; checklist_coverage_max: number;
  consult_technique: number; consult_technique_max: number;
  judgement_safety: number; judgement_safety_max: number;
  /** Optional: an older backend during a deploy window simply omits it. */
  breakdown?: ScoreBreakdown;
}

export function scoreBuckets(result: BucketSource): ScoreBucket[] {
  const b = result.breakdown;
  // `parts` is the authority on what actually scored in this bucket. When the case has no
  // manual procedures, station_score blends history ALONE into Consultation & Technique and
  // drops the "Examination technique" part — so the examination paragraph must go too.
  // Printing it left the student reading a critique of technique that earned no points and
  // that the sub-score list directly above it did not mention. With no breakdown at all
  // (older backend) we cannot tell, so we keep both rather than hide a real remark.
  const examScored = !b?.consult.parts || b.consult.parts.length > 1;
  return [
    {
      label: "Checklist coverage",
      pts: result.checklist_coverage, max: result.checklist_coverage_max,
      sub: "How much of the procedure you actually completed",
      parts: b?.checklist.parts,
      // The 40-point bucket is graded deterministically, so it has no examiner paragraph.
      // It used to carry no remark at all — the biggest number on the page, uncommented.
      notes: b?.checklist.note ? [b.checklist.note] : undefined,
    },
    {
      label: "Consultation & Technique",
      pts: result.consult_technique, max: result.consult_technique_max,
      sub: "History-taking and how well you performed the examination(s)",
      parts: b?.consult.parts,
      notes: [result.history_feedback, examScored ? result.investigations_feedback : ""]
        .filter(Boolean),
    },
    {
      label: "Clinical Judgement & Safety",
      pts: result.judgement_safety, max: result.judgement_safety_max,
      sub: "Spotting the problem, triage, escalation & handover",
      parts: b?.judgement.parts,
      capReason: b?.judgement.capped ? b.judgement.cap_reason : undefined,
      notes: [result.diagnosis_feedback, result.management_feedback].filter(Boolean),
    },
  ];
}
