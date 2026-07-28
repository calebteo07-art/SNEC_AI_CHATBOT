"use client";
/* Admin — cohort-analytics panels. Renders ONE /api/admin/cohort-analytics payload
   as per-discipline sections: weakest topics, and OSCE vs flashcards.

   NOT the safety callout or most-missed steps: those are cohort-wide and belong to
   AdminCohort (§5.5 re-points them there). A second per-section copy would put two
   different safety rates on one screen — the exact defect §5.5 exists to remove.
   safetyPanel/missedPanel stay exported from cohortAnalyticsView for that owner.

   Presentational on purpose. The panel-local discipline switcher (D11) owns the
   query, the window and the caption and passes the result down, so there is exactly
   one fetch behind these panels and one place the discipline lives.

   Chart budget (§5.4, D3): no new chart component and no new CSS class — BarSeries
   and DonutGauge reuse only, over .aurora-panel / .aurora-bar-* / .aurora-unavail.
   Bars are aria-hidden and every panel pairs them with the text summary that
   carries the real numbers and their denominators; full a11y is P5. */
import { BarSeries } from "@/aurora/components/charts/BarSeries";
import { PanelSkeleton, PanelError } from "@/aurora/components/admin/PanelState";
import type { CohortAnalytics } from "@/hooks/useAdmin";
import {
  sectionsFor, flashcardOk, weakestPanel, comparisonPanel,
  type BarPanel,
} from "@/aurora/components/admin/cohortAnalyticsView";
/* safetyPanel / missedPanel stay EXPORTED and harness-covered but are deliberately not
   rendered here: §5.5 re-points the cohort-wide safety donut and most-missed bars in
   AdminCohort, and a second per-section copy would put two different safety rates on one
   screen — the exact defect §5.5 removes. (noUnusedLocals means they must not be
   imported into this file at all.) */

/* The D3 pairing written once instead of three times. Not a chart component —
   BarSeries still does every bit of the drawing, so the "no new chart component"
   budget holds. An empty panel renders its summary ALONE: an empty track next to a
   heading reads as a measured zero. */
function BarPanelBody({ panel }: { panel: BarPanel }) {
  return (
    <>
      {panel.rows.length > 0 && (
        <div aria-hidden>
          <BarSeries rows={panel.rows} max={panel.max} />
        </div>
      )}
      <p className="aurora-unavail" style={{ marginTop: panel.rows.length ? 8 : 0 }}>{panel.summary}</p>
    </>
  );
}

export function CohortAnalyticsPanels({ data, isLoading, isError, onRetry }: {
  data: CohortAnalytics | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  // One query feeds every panel, so the load/error affordance is decided once.
  // `!data` counts as failure, not as an empty cohort: rendering a board of zeros
  // for a fetch that never resolved is the exact defect P1 removed from here.
  if (isLoading) {
    return (
      <section className="aurora-panel">
        <p className="aurora-panel-head">Cohort performance</p>
        <PanelSkeleton rows={4} />
      </section>
    );
  }
  if (isError || !data) {
    return (
      <section className="aurora-panel">
        <p className="aurora-panel-head">Cohort performance</p>
        <PanelError onRetry={onRetry} label="Couldn’t load cohort performance." />
      </section>
    );
  }

  const secs = sectionsFor(data);
  const flash = flashcardOk(data);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {secs.map((sec) => {
        const weakest = weakestPanel(sec.topics);
        const comparison = comparisonPanel(sec.topics, flash);
        return (
          <div key={sec.pool}>
            {/* discipline=all is TWO labelled sections (D2), each its own grid — one
                blended ranking would compare OA/PSA topics against OT topics that no
                OA student can even see. */}
            {secs.length > 1 && (
              <p className="aurora-panel-head" style={{ marginBottom: 10 }}>{sec.title}</p>
            )}
            <div className="aurora-admin-grid">
              <section className="aurora-panel">
                <p className="aurora-panel-head">Weakest topics · performance</p>
                <BarPanelBody panel={weakest} />
              </section>

              <section className="aurora-panel">
                <p className="aurora-panel-head">OSCE vs flashcards</p>
                <BarPanelBody panel={comparison} />
              </section>
            </div>
          </div>
        );
      })}
    </div>
  );
}
