"use client";
/* Admin — cohort performance over time (P2 §7, "Slice 2c"). The SIBLING of the activity
   trend beside it: that panel counts VOLUME, this one measures QUALITY — average score,
   pass rate and safety-failure rate, all percentages, all on one 0–100 frame so their
   slopes are actually comparable.

   The switcher is PANEL-LOCAL for the same reason AdminTopicAnalytics's is (D11): only
   the P2 endpoints accept `discipline`, so a console-top control would re-scope these two
   panels and leave the KPI tiles, benchmarks and token usage untouched — the exact false
   promise P1 deleted from the Admin shell. The caption says the scope out loud instead of
   leaving a trainer to infer it from numbers that don't move.

   The window toggle is not decoration: the endpoint rolls up to WEEKLY buckets above 31
   days, so 30 and 90 are genuinely different readings, and the caption tracks which. */
import { useState } from "react";
import { usePerformanceTrend, type Discipline } from "@/hooks/useAdmin";
import { TrendChart } from "@/aurora/components/charts/TrendChart";
import { PanelSkeleton, PanelError } from "@/aurora/components/admin/PanelState";
import { trendSeries, trendSummary, truncationNote } from "@/aurora/components/admin/performanceTrendView";

const DISCIPLINES: { key: Discipline; label: string }[] = [
  { key: "all", label: "All" },
  { key: "oa_psa", label: "OA & PSA" },
  { key: "ot", label: "OT" },
];
/* 30 stays daily, 90 rolls up weekly — the two sides of period_for(). */
const WINDOWS = [30, 90];

export function AdminPerformanceTrend() {
  const [discipline, setDiscipline] = useState<Discipline>("all");
  const [days, setDays] = useState(30);
  const q = usePerformanceTrend(days, discipline);

  const data = q.data;
  const points = data?.points ?? [];
  // "Nothing happened", not "the newest bucket is empty" — every bucket in the window is
  // returned even when empty, so points.length is the window, never the evidence.
  const anyAttempts = points.some((p) => p.n > 0);
  const bucket = data?.period === "week" ? "week" : "day";
  const truncated = data ? truncationNote(data) : null;

  return (
    <section className="aurora-panel" data-testid="performance-trend">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <p className="aurora-panel-head" style={{ margin: 0 }}>Performance over time</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div className="console-segment" role="group" aria-label="Trend window" data-testid="trend-window">
            {WINDOWS.map((d) => (
              <button
                key={d}
                type="button"
                data-days={d}
                data-active={days === d}
                aria-pressed={days === d}
                onClick={() => setDays(d)}
              >
                {d}d
              </button>
            ))}
          </div>
          <div className="console-segment" role="group" aria-label="Discipline filter" data-testid="trend-discipline">
            {DISCIPLINES.map((x) => (
              <button
                key={x.key}
                type="button"
                data-discipline={x.key}
                data-active={discipline === x.key}
                aria-pressed={discipline === x.key}
                onClick={() => setDiscipline(x.key)}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* The gap rule is stated because it is counter-intuitive: every other line on this
          board touches the floor when it means zero. */}
      <p className="aurora-unavail" data-testid="trend-caption" style={{ marginTop: 8 }}>
        Per {bucket}, on the Singapore calendar — a {bucket} with no attempts is a gap in the line, not a zero.
        Filters this panel only; cohort totals and token usage cover all disciplines.
      </p>

      {q.isLoading ? (
        <PanelSkeleton />
      ) : q.isError ? (
        // A failed read is an error, never a 0% safety-failure rate. The endpoint 500s
        // rather than degrading to an empty series, so isError is the whole outage story.
        <PanelError onRetry={() => q.refetch()} label="Couldn’t load cohort performance over time." />
      ) : !anyAttempts ? (
        <p className="aurora-unavail">
          No station attempts for this discipline in the last {days} days.
        </p>
      ) : (
        <>
          {/* max=100 pins the honest percentage frame. Autoscaling to whatever this
              window happened to reach would make a 45% pass rate fill the panel. */}
          <TrendChart series={trendSeries(points)} max={100} />
          <p className="aurora-unavail" style={{ marginTop: 8 }} data-testid="trend-summary">
            {trendSummary(data!)}
          </p>
          {truncated && (
            <p className="aurora-unavail" data-testid="trend-truncated" data-tone="amber" style={{ marginTop: 6 }}>
              {truncated}
            </p>
          )}
        </>
      )}
    </section>
  );
}
