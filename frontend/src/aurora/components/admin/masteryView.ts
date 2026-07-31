/** Pure view-model for the mastery block — no React, so it is Node-testable. */
import type { Mastery, MasteryScale } from "@/hooks/useAdmin";

const LABELS: Record<keyof Mastery, string> = {
  osce_mastery: "OSCE attainment",
  flashcard_mastery: "Flashcard recall",
  retention_mastery: "Topic retention",
};

export type MasteryTone = "above" | "below" | "level" | "none";

export interface MasteryRow {
  key: string;
  label: string;
  /** "—" when null. A "0" would read as the worst score in the cohort. */
  valueLabel: string;
  deltaLabel: string;
  /** Bar width, 0-100. Magnitude only — `tone` carries the direction. */
  deltaPct: number;
  tone: MasteryTone;
  cohortLabel: string;
}

export function masteryRows(mastery: Mastery | null | undefined): MasteryRow[] {
  if (!mastery) return [];
  // The scales are declared non-null on StudentDetail, but getJSON casts the response
  // without validating it, so a scale is still filtered rather than trusted.
  return (Object.keys(LABELS) as (keyof Mastery)[])
    .filter((key) => !!mastery[key])
    .map((key) => {
      const s = mastery[key];
      // Round FIRST, then subtract. Each figure is a 1dp float, so rounding the three
      // independently lets a row visibly fail its own arithmetic: value 78.5, cohort
      // 61.4, delta 17.1 renders as "79 … +17 … Cohort 61", and 79 − 61 is 18. On an
      // assessment surface a reader who spots that stops trusting the other numbers.
      // The backend `delta` still decides WHETHER there is one; it just isn't the number
      // shown. This also removes the "−0" a sub-half delta used to render, and the
      // asymmetry in Math.abs(Math.round(x)), which rounded −1.5 to 1 but +1.5 to 2.
      const value = typeof s.value === "number" ? Math.round(s.value) : null;
      const avg = typeof s.cohort_avg === "number" ? Math.round(s.cohort_avg) : null;
      const delta = s.delta === null || value === null || avg === null ? null : value - avg;
      return {
        key,
        label: LABELS[key],
        valueLabel: value === null ? "—" : String(value),
        // U+2212 minus, not a hyphen — it aligns with digits in tabular figures.
        deltaLabel: delta === null
          ? "—"
          : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}`,
        deltaPct: clamp(Math.abs(delta ?? 0)),
        tone: delta === null ? "none" : delta > 0 ? "above" : delta < 0 ? "below" : "level",
        cohortLabel: cohortLabel(s),
      };
    });
}

function cohortLabel(s: MasteryScale): string {
  // peers_n, never cohort_n: cohort_n counts this student too, so a solo student would
  // read "1 peer" when there is nobody to compare against. cohort_avg is the mean over
  // peers_n students and that is the only count a trainer should see.
  if (s.cohort_avg === null || s.peers_n < 1) return "No cohort to compare yet";
  return `Cohort ${Math.round(s.cohort_avg)} (${s.peers_n} peer${s.peers_n === 1 ? "" : "s"})`;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
