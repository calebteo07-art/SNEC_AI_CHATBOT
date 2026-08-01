"use client";
/* Admin — cohort topic performance (P2 §5.4). Per-topic-group figures aggregated from real
   OSCE + flashcard events, sliced by discipline.

   The switcher is PANEL-LOCAL by decision D11: only the P2 endpoints accept `discipline`
   (/api/admin/cohort-analytics here, /api/admin/performance-trend in the panel below, which
   carries its own switcher for the same reason), so a console-top control would re-scope
   those two and leave the KPI tiles, benchmarks and token usage untouched — the exact
   false promise P1 deleted from the Admin shell. The caption states that scope out loud
   instead of leaving a trainer to infer it from numbers that don't move. */
import { useState } from "react";
import { useCohortAnalytics, type Discipline } from "@/hooks/useAdmin";
import { PanelSkeleton, PanelError } from "@/aurora/components/admin/PanelState";
import { CohortAnalyticsPanels } from "@/aurora/components/admin/CohortAnalyticsPanels";
import { driftNote } from "@/aurora/components/admin/cohortAnalyticsView";

const DISCIPLINES: { key: Discipline; label: string }[] = [
  { key: "all", label: "All" },
  { key: "oa_psa", label: "OA & PSA" },
  { key: "ot", label: "OT" },
];

/* Rolling SNEC intakes make an all-time mean a slow-moving constant that barely responds to
   this term's teaching, so the panel asks for a term-sized window (the backend default). */
const DAYS = 90;

export function AdminTopicAnalytics() {
  const [discipline, setDiscipline] = useState<Discipline>("all");
  const q = useCohortAnalytics(discipline, DAYS);

  const topics = q.data?.topics ?? [];
  const totals = q.data?.totals;
  const flashcardGroups = topics.filter((t) => t.flashcard !== null && t.flashcard.n > 0).length;
  // Null unless the flashcard read succeeded AND drift was actually seen — see driftNote.
  const drift = q.data ? driftNote(q.data) : null;

  // Same guard as the cohort KPI tiles: a figure must never render 0 while loading or
  // failed — a 0 there is indistinguishable from a real measurement of an empty cohort.
  const kpi = (v: string | number) => (q.isLoading ? "…" : q.isError ? "—" : v);

  return (
    <section className="aurora-panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <p className="aurora-panel-head" style={{ margin: 0 }}>Topic performance</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="aurora-unavail">{kpi(totals?.students_in_pool ?? 0)} students in scope</span>
          <div className="console-segment" role="group" aria-label="Discipline filter" data-testid="cohort-discipline">
            {DISCIPLINES.map((d) => (
              <button
                key={d.key}
                type="button"
                data-discipline={d.key}
                data-active={discipline === d.key}
                aria-pressed={discipline === d.key}
                onClick={() => setDiscipline(d.key)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="aurora-unavail" data-testid="cohort-discipline-caption" style={{ marginTop: 8 }}>Discipline: All · OA &amp; PSA · OT — filters the topic panels below; cohort totals and token usage cover all disciplines.</p>

      {q.isLoading ? (
        <PanelSkeleton />
      ) : q.isError ? (
        <PanelError onRetry={() => q.refetch()} label="Couldn’t load cohort topic performance." />
      ) : topics.length === 0 ? (
        <p className="aurora-unavail">No station attempts recorded for this discipline in the last {DAYS} days.</p>
      ) : (
        <>
          {/* Kept on ONE source line: JSX strips the newline+indent between an expression and
              the text that follows it, so a wrapped line would render "4topic groups". */}
          <p className="aurora-unavail" data-testid="cohort-topics-summary">{topics.length} topic groups · {totals?.osce_attempts ?? 0} station attempts from {totals?.osce_students ?? 0} students in the last {DAYS} days.</p>
          {flashcardGroups === 0 && (
            <p className="aurora-unavail">No flashcard data yet — per-topic accuracy appears once students start answering cards.</p>
          )}
          {!!totals?.unclassified_students && (
            <p className="aurora-unavail">{totals.unclassified_students} student{totals.unclassified_students === 1 ? "" : "s"} sit outside OA/PSA/OT and are excluded from every discipline view.</p>
          )}
          {!!totals?.staff_excluded && (
            <p className="aurora-unavail">{totals.staff_excluded} staff account{totals.staff_excluded === 1 ? "" : "s"} on the student roster {totals.staff_excluded === 1 ? "is" : "are"} excluded from every figure here — a trainer’s demo run is not cohort performance.</p>
          )}
          {/* Tag drift, and ONLY when the flashcard read succeeded: the counter is
              tallied during that read, so a failure reports a confident 0 and a bare
              render would put "no drift" on screen for a read that never happened.
              driftNote() owns that gate (and the view-vs-population scope wording) so
              the rule is pinned by the logic harness rather than by this JSX. */}
          {drift && <p className="aurora-unavail">{drift}</p>}
          {/* The charts live one level down and are purely presentational: this panel
              owns the query, the window and the switcher (D11), so there is exactly ONE
              fetch behind them. isLoading/isError are false by construction here — this
              branch only runs on resolved data — but they stay on the props so the
              component never grows a second load/error affordance. */}
          <CohortAnalyticsPanels data={q.data} isLoading={false} isError={false} onRetry={() => q.refetch()} />
        </>
      )}
    </section>
  );
}
