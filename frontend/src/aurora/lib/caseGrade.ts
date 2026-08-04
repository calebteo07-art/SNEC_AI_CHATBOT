/** OSCE sub-score denominators — the one place that knows which maxima a stored row used.
 *
 * `consult_technique` and `judgement_safety` persist as bare INTEGERs, and on 2026-08-04 the
 * grade moved from two AI schemes ×50 to three buckets 40/30/30 (tools/cases/station_score.py).
 * Rendered without denominators the two eras look like one scale, so a student's older
 * attempts read "40·38" against their newer "22·26" and staff saw a collapse that was
 * nothing but the rescale. `grade_scale` (migration 017) is the stamp that resolves it.
 *
 * Pure and dependency-free so frontend/tests/case_grade_scale_logic.mjs can run it directly.
 */

export interface CaseGradeRow {
  grade_scale?: number;
  checklist_coverage?: number;
  consult_technique?: number;
  judgement_safety?: number;
}

export interface SubScorePart {
  label: string;
  pts: number;
  /** The bucket's maximum, or 0 when this row's scheme isn't one we can name. */
  max: number;
}

/** Maxima per scoring scheme. Add an entry here whenever GRADE_SCALE moves in
 *  tools/cases/station_score.py — an unmapped scale deliberately renders no denominator
 *  rather than borrowing the previous scheme's. */
const SCALES: Record<number, { checklist: number | null; consult: number; judgement: number }> = {
  // Pre-2026-08-04. Two schemes ×50 that summed to the /100 on their own; coverage scored
  // nothing, so these rows have no checklist bucket to show.
  1: { checklist: null, consult: 50, judgement: 50 },
  2: { checklist: 40, consult: 30, judgement: 30 },
};

/** A row with no stamp was written before the stamp existed, which IS scheme 1. */
const scaleId = (row: CaseGradeRow) => row.grade_scale ?? 1;

export function subScoreParts(row: CaseGradeRow): SubScorePart[] {
  const scale = SCALES[scaleId(row)];
  const parts: SubScorePart[] = [];
  // `!== undefined`, never truthiness: 0 is a real score (a student who performed no steps),
  // and dropping it would misreport them as ungraded.
  if (row.checklist_coverage !== undefined && scale?.checklist != null) {
    parts.push({ label: "Checklist", pts: row.checklist_coverage, max: scale.checklist });
  }
  if (row.consult_technique !== undefined) {
    parts.push({ label: "Consult & technique", pts: row.consult_technique, max: scale?.consult ?? 0 });
  }
  if (row.judgement_safety !== undefined) {
    parts.push({ label: "Judgement & safety", pts: row.judgement_safety, max: scale?.judgement ?? 0 });
  }
  return parts;
}

/** Compact cell text, e.g. "32/40 · 24/30 · 24/30". A part with an unknown maximum prints
 *  bare rather than claiming a denominator we can't stand behind. */
export function subScoreText(row: CaseGradeRow): string {
  const parts = subScoreParts(row);
  if (parts.length === 0) return "—";
  return parts.map((p) => (p.max > 0 ? `${p.pts}/${p.max}` : `${p.pts}`)).join(" · ");
}

/** Hover explanation: what each number is, and — the point of the whole module — which
 *  scheme graded it, so a trainer comparing two attempts knows whether the scale moved. */
export function subScoreTitle(row: CaseGradeRow): string {
  const parts = subScoreParts(row);
  if (parts.length === 0) return "This attempt predates OSCE sub-scores.";
  const body = parts.map((p) => (p.max > 0 ? `${p.label} ${p.pts}/${p.max}` : `${p.label} ${p.pts}`)).join(" · ");
  const id = scaleId(row);
  if (!SCALES[id]) {
    return `${body}. Scored under an unrecognised scheme (scale ${id}), so the totals these are out of are unknown.`;
  }
  if (id === 1) {
    return `${body}. Graded on the earlier scheme, where each half was out of 50 and the checklist scored no points — compare the proportions, not the raw numbers.`;
  }
  return `${body}. Checklist 40, Consultation & Technique 30, Clinical Judgement & Safety 30 — 100 in total.`;
}
