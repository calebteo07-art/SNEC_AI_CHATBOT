"use client";
/* Admin — cohort band. The top-of-page situational picture: KPI tiles, the AI cohort
   insight, an activity trend, cohort-benchmark bars, a topic-mastery heatmap, and the
   two cohort-wide OSCE panels (safety-failure rate + most-missed steps).

   Those two panels read /api/admin/cohort-analytics, NOT the /api/admin/activity feed:
   that feed is capped at 80 items server-side (tools/api/routers/admin.py:234), so
   anything derived from it describes only the most recent slice of the cohort and
   contradicts the uncapped topic panel beside it. Pinned to discipline "all" — the KPI
   row and these safety panels are cohort-wide; the panel-local switcher scopes the
   topic panels only. The pooling itself lives in cohortAnalyticsView, which exports
   safetyPanel/missedPanel for exactly this owner, so the console has ONE implementation
   of the cohort safety rate rather than two that can drift apart. */
import { StatCard } from "@/aurora/components/StatCard";
import { Heatmap } from "@/aurora/components/Heatmap";
import { TrendChart } from "@/aurora/components/charts/TrendChart";
import { DonutGauge } from "@/aurora/components/charts/DonutGauge";
import { BarSeries, type BarRow } from "@/aurora/components/charts/BarSeries";
import { fmtTokens } from "@/screens/adminShared";
import { useCohort, useAtRisk, useBenchmarks, useActivityTrend, useTokenSummary, useCohortInsight, useCohortAnalytics } from "@/hooks/useAdmin";
import { PanelSkeleton, PanelError } from "@/aurora/components/admin/PanelState";
import { safetyPanel, missedPanel } from "@/aurora/components/admin/cohortAnalyticsView";
import { AdminTopicAnalytics } from "@/aurora/screens/AdminTopicAnalytics";

export function AdminCohort() {
  const cohort = useCohort();
  const atRisk = useAtRisk();
  const benchmarks = useBenchmarks();
  const trendQ = useActivityTrend(21);
  const tokens = useTokenSummary();
  const insight = useCohortInsight();
  // Dropping useActivity() also drops a 30s poll of /api/admin/activity, which does four
  // unwindowed table reads per call on the single prod worker. "all" + the topic panel's
  // 90-day default share the query key ["admin","cohort-analytics","all",90], so while the
  // switcher sits on All this costs no extra request.
  const analytics = useCohortAnalytics("all", 90);

  const c = cohort.data;
  const total = c?.total ?? 0;
  const active = c?.active_this_week ?? 0;
  const atRiskCount = c?.at_risk_count ?? atRisk.data?.length ?? 0;

  const bench = benchmarks.data ?? [];
  const avgMastery = bench.length
    ? Math.round((bench.reduce((s, b) => s + b.avg_score, 0) / bench.length) * 100)
    : null;

  const trend = (trendQ.data ?? []).map((d) => d.total);

  const benchRows: BarRow[] = [...bench].sort((a, b) => a.avg_score - b.avg_score).slice(0, 8).map((b) => ({
    label: b.topic.replace(/_/g, " "),
    segments: [{ value: b.avg_score, tone: b.avg_score < 0.65 ? "rose" : "blue" }],
    readout: `${Math.round(b.avg_score * 100)}%`,
    weak: b.avg_score < 0.65,
  }));
  const heat = bench.map((b) => b.avg_score);

  // Cohort-wide OSCE safety + most-missed steps, over every topic group in the uncapped
  // aggregate. safetyPanel pools fails over gradable attempts (the mean of per-group rates
  // would weight a 2-attempt group like a 20-attempt one) and returns a null rate — never
  // 0 — at a zero denominator; missedPanel keeps entries per group so each miss keeps the
  // student denominator it was measured against. osce_students is the cohort-wide
  // denominator for the ranking as a whole.
  const groups = analytics.data?.topics ?? [];
  const safety = safetyPanel(groups);
  const missed = missedPanel(groups);
  const osceStudents = analytics.data?.totals.osce_students ?? 0;

  // A KPI must never render 0 while loading or failed — that reads as a real measurement.
  const kpi = (q: { isLoading: boolean; isError: boolean }, v: string | number) =>
    q.isLoading ? "…" : q.isError ? "—" : v;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="aurora-kpis">
        <StatCard tone="blue" label="Total students" value={kpi(cohort, total)} />
        <StatCard tone="green" label="Active this week" value={kpi(cohort, active)} />
        <StatCard tone="rose" label="At risk" value={kpi(cohort, atRiskCount)} />
        <StatCard tone="purple" label="Avg mastery" value={kpi(benchmarks, avgMastery === null ? "—" : `${avgMastery}%`)} />
        <StatCard tone="purple" label="AI tokens" value={kpi(tokens, `${tokens.data?.complete === false ? "≥ " : ""}${fmtTokens(tokens.data?.total_tokens ?? 0)}`)} />
      </div>

      {insight.data && <div className="aurora-insight"><p>“{insight.data}”</p></div>}

      <AdminTopicAnalytics />

      <div className="aurora-admin-grid">
        <section className="aurora-panel">
          <p className="aurora-panel-head">Activity · last 3 weeks</p>
          {trendQ.isLoading ? (
            <PanelSkeleton />
          ) : trendQ.isError ? (
            <PanelError onRetry={() => trendQ.refetch()} />
          ) : (
            <>
              <TrendChart values={trend} tone="blue" />
              <p className="aurora-unavail" style={{ marginTop: 8 }}>
                {trend.length
                  ? `${trend.reduce((a, b) => a + b, 0)} activity events across the cohort in the last 3 weeks.`
                  : "No activity events in the last 3 weeks."}
              </p>
            </>
          )}
        </section>

        <section className="aurora-panel">
          <p className="aurora-panel-head">Cohort mastery by topic</p>
          {benchmarks.isLoading ? (
            <PanelSkeleton />
          ) : benchmarks.isError ? (
            <PanelError onRetry={() => benchmarks.refetch()} />
          ) : heat.length ? (
            <>
              <Heatmap values={heat} columns={Math.min(10, heat.length)} />
              <p className="aurora-unavail" style={{ marginTop: 8 }}>{bench.length} topics benchmarked · avg {avgMastery}%.</p>
            </>
          ) : <p className="aurora-unavail">No benchmark data yet.</p>}
        </section>

        <section className="aurora-panel">
          <p className="aurora-panel-head">Topic benchmarks (lowest first)</p>
          {benchmarks.isLoading ? (
            <PanelSkeleton />
          ) : benchmarks.isError ? (
            <PanelError onRetry={() => benchmarks.refetch()} />
          ) : (
            <BarSeries rows={benchRows} />
          )}
        </section>

        <section className="aurora-panel">
          <p className="aurora-panel-head">OSCE safety-failure rate</p>
          {analytics.isLoading ? (
            <PanelSkeleton />
          ) : analytics.isError ? (
            // A failed read is an error, never a 0% safety-failure rate — on a clinical
            // dashboard that is the most dangerous wrong number this screen can show.
            // /api/admin/cohort-analytics 500s when the OSCE read fails rather than
            // degrading (admin.py:407-411), so isError is the whole outage story here.
            <PanelError onRetry={() => analytics.refetch()} />
          ) : safety.rate === null ? (
            <p className="aurora-unavail">{safety.summary} This covers every discipline.</p>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <DonutGauge value={safety.rate} label="unsafe" tone="rose" size={120} />
              <p className="aurora-unavail">{safety.summary} Cohort-wide across every discipline — only attempts on a checklist carrying a critical step count here.</p>
            </div>
          )}
        </section>

        <section className="aurora-panel">
          <p className="aurora-panel-head">Most-missed OSCE steps</p>
          {analytics.isLoading ? (
            <PanelSkeleton />
          ) : analytics.isError ? (
            <PanelError onRetry={() => analytics.refetch()} />
          ) : (
            <>
              {/* An empty ranking renders its summary ALONE: an empty track under a heading
                  reads as a measured zero. Same pairing rule as the topic panels (D3). */}
              {missed.rows.length > 0 && <BarSeries max={missed.max} rows={missed.rows} />}
              {/* One source line — JSX strips the newline+indent beside an expression. */}
              <p className="aurora-unavail" style={{ marginTop: missed.rows.length ? 8 : 0 }}>{missed.summary} Across every discipline · {osceStudents} students have station data.</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
