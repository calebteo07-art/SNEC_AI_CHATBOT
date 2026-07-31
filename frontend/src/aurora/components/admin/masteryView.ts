/** Pure view-model for the mastery block — no React, so it is Node-testable. */
import type { Mastery, MasteryScale } from "@/hooks/useAdmin";

const LABELS: Record<string, string> = {
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
  valuePct: number;
  deltaLabel: string;
  deltaPct: number;
  tone: MasteryTone;
  cohortLabel: string;
}

export function masteryRows(mastery: Mastery | null | undefined): MasteryRow[] {
  if (!mastery) return [];
  return Object.keys(LABELS)
    .map((key) => [key, (mastery as unknown as Record<string, MasteryScale | null>)[key]] as const)
    .filter(([, scale]) => !!scale)
    .map(([key, scale]) => {
      const s = scale as MasteryScale;
      const delta = typeof s.delta === "number" ? s.delta : null;
      return {
        key,
        label: LABELS[key],
        valueLabel: typeof s.value === "number" ? String(Math.round(s.value)) : "—",
        valuePct: clamp(s.value ?? 0),
        // U+2212 minus, not a hyphen — it aligns with digits in tabular figures.
        deltaLabel: delta === null
          ? "—"
          : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(Math.round(delta))}`,
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
