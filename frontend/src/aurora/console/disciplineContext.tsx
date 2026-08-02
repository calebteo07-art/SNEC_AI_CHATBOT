"use client";
/* Console-global discipline state.

   ONLY useCohortAnalytics and usePerformanceTrend accept the parameter — useCohort,
   useAtRisk, useTokenSummary, useRoster and useAudit are cohort-wide and cannot be
   re-scoped without backend work the spec excludes.

   Decision D11 rejected a console-global control for exactly that reason: it would
   silently leave those figures unmoved while looking like it had re-scoped the board.
   The resolution here is MARKING, not hiding — any surface this cannot scope renders
   <AllDisciplines /> on its face, so a trainer flipping to OT can see at a glance which
   numbers followed and which did not. A figure is never left ambiguous.

   Spec: docs/superpowers/specs/2026-08-02-admin-console-redesign-design.md §4. */
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Discipline } from "@/hooks/useAdmin";

const Ctx = createContext<{ discipline: Discipline; setDiscipline: (d: Discipline) => void }>({
  discipline: "all",
  setDiscipline: () => {},
});

export const DISCIPLINES: { key: Discipline; label: string }[] = [
  { key: "all", label: "All" },
  { key: "oa_psa", label: "OA & PSA" },
  { key: "ot", label: "OT" },
];

export function DisciplineProvider({ children }: { children: ReactNode }) {
  const [discipline, setDiscipline] = useState<Discipline>("all");
  return <Ctx.Provider value={{ discipline, setDiscipline }}>{children}</Ctx.Provider>;
}

export function useDiscipline() {
  return useContext(Ctx);
}

/** Renders on every figure the segment cannot re-scope. Never omit it — an unmarked
    figure that ignores the control is the defect D11 was written to prevent. */
export function AllDisciplines() {
  return (
    <span
      className="cs-allmark"
      data-testid="cs-allmark"
      title="This figure covers every discipline — the switcher does not re-scope it."
    >
      All disciplines
    </span>
  );
}
