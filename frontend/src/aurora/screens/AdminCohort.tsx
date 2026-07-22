"use client";
/* Admin — cohort band. The top-of-page situational picture: KPI tiles, the
   AI cohort insight, an activity trend, weak-topic + cohort-benchmark bars, a
   topic-mastery heatmap, and the Tier-2 OSCE panels (safety-failure rate +
   most-missed steps) which light up once the OSCE-grade migration is applied. */
import { StatCard } from "@/aurora/components/StatCard";
import { Heatmap } from "@/aurora/components/Heatmap";
import { TrendChart } from "@/aurora/components/charts/TrendChart";
import { DonutGauge } from "@/aurora/components/charts/DonutGauge";
import { BarSeries, type BarRow } from "@/aurora/components/charts/BarSeries";
import { fmtTokens } from "@/screens/adminShared";
import { useCohort, useAtRisk, useBenchmarks, useActivity, useTokenSummary, useCohortInsight } from "@/hooks/useAdmin";

/* Bucket activity-feed timestamps into a per-day count over the last `days`. */
function dailyCounts(timestamps: string[], days = 21): number[] {
  const counts = Array(days).fill(0) as number[];
  const now = Date.now();
  for (const ts of timestamps) {
    const t = new Date(ts).getTime();
    if (Number.isNaN(t)) continue;
    const diff = Math.floor((now - t) / 86_400_000);
    if (diff >= 0 && diff < days) counts[days - 1 - diff]++;
  }
  return counts;
}

/* Parse "C123 ✓ · 32/40" (admin activity feed) → the /40 score, or null. */
function parseCaseScore(detail: string): number | null {
  const m = detail.match(/(\d+)\s*\/\s*40/);
  return m ? Number(m[1]) : null;
}

export function AdminCohort() {
  const cohort = useCohort();
  const atRisk = useAtRisk();
  const benchmarks = useBenchmarks();
  const activity = useActivity();
  const tokens = useTokenSummary();
  const insight = useCohortInsight();

  const c = cohort.data;
  const total = c?.total ?? 0;
  const active = c?.active_this_week ?? 0;
  const atRiskCount = c?.at_risk_count ?? atRisk.data?.length ?? 0;

  const bench = benchmarks.data ?? [];
  const avgMastery = bench.length
    ? Math.round((bench.reduce((s, b) => s + b.avg_score, 0) / bench.length) * 100)
    : null;

  const feed = activity.data ?? [];
  const caseItems = feed.filter((f) => f.type === "case");
  const caseScores = caseItems.map((f) => parseCaseScore(f.detail)).filter((x): x is number => x !== null);
  const avgOsce = caseScores.length
    ? Math.round((caseScores.reduce((a, b) => a + b, 0) / caseScores.length / 40) * 100)
    : null;

  const trend = dailyCounts(feed.map((f) => f.timestamp));

  const weakRows: BarRow[] = (c?.weakest_topics ?? []).slice(0, 6).map((t, i) => ({
    label: t.replace(/_/g, " "),
    segments: [{ value: Math.max(0.2, 0.9 - i * 0.12), tone: "rose" }],
    weak: true,
  }));
  const benchRows: BarRow[] = [...bench].sort((a, b) => a.avg_score - b.avg_score).slice(0, 8).map((b) => ({
    label: b.topic.replace(/_/g, " "),
    segments: [{ value: b.avg_score, tone: b.avg_score < 0.65 ? "rose" : "blue" }],
    readout: `${Math.round(b.avg_score * 100)}%`,
    weak: b.avg_score < 0.65,
  }));
  const heat = bench.map((b) => b.avg_score);

  // Tier-2 OSCE — only compute from the extended grade fields if present.
  const graded = caseItems.filter((f) => typeof f.safe === "boolean");
  const unsafe = graded.filter((f) => f.safe === false).length;
  const safetyRate = graded.length ? unsafe / graded.length : null;
  const missCounts = new Map<string, number>();
  for (const f of caseItems) for (const m of f.missed_critical ?? []) missCounts.set(m, (missCounts.get(m) ?? 0) + 1);
  const mostMissed = [...missCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const missMax = mostMissed.length ? mostMissed[0][1] : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="aurora-kpis">
        <StatCard tone="blue" label="Total students" value={total} />
        <StatCard tone="green" label="Active this week" value={active} />
        <StatCard tone="rose" label="At risk" value={atRiskCount} />
        <StatCard tone="purple" label="Avg mastery" value={avgMastery === null ? "—" : `${avgMastery}%`} />
        <StatCard tone="blue" label="Avg OSCE" value={avgOsce === null ? "—" : `${avgOsce}%`} />
        <StatCard tone="purple" label="AI tokens" value={fmtTokens(tokens.data?.total_tokens ?? 0)} />
      </div>

      {insight.data && <div className="aurora-insight"><p>“{insight.data}”</p></div>}

      <div className="aurora-admin-grid">
        <section className="aurora-panel">
          <p className="aurora-panel-head">Activity · last 3 weeks</p>
          <TrendChart values={trend} tone="blue" />
          <p className="aurora-unavail" style={{ marginTop: 8 }}>
            {feed.length ? `${feed.length} recent activity events across the cohort.` : "No recent activity events."}
          </p>
        </section>

        <section className="aurora-panel">
          <p className="aurora-panel-head">Cohort mastery by topic</p>
          {heat.length ? (
            <>
              <Heatmap values={heat} columns={Math.min(10, heat.length)} />
              <p className="aurora-unavail" style={{ marginTop: 8 }}>{bench.length} topics benchmarked · avg {avgMastery}%.</p>
            </>
          ) : <p className="aurora-unavail">No benchmark data yet.</p>}
        </section>

        <section className="aurora-panel">
          <p className="aurora-panel-head">Weakest topics (cohort)</p>
          <BarSeries rows={weakRows} />
        </section>

        <section className="aurora-panel">
          <p className="aurora-panel-head">Topic benchmarks (lowest first)</p>
          <BarSeries rows={benchRows} />
        </section>

        <section className="aurora-panel">
          <p className="aurora-panel-head">OSCE safety-failure rate</p>
          {safetyRate === null ? (
            <p className="aurora-unavail">Available once the OSCE-grade migration is applied — per-attempt safety isn’t recorded yet.</p>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <DonutGauge value={safetyRate} label="unsafe" tone="rose" size={120} />
              <p className="aurora-unavail">{unsafe} of {graded.length} recent attempts missed a critical safety step.</p>
            </div>
          )}
        </section>

        <section className="aurora-panel">
          <p className="aurora-panel-head">Most-missed OSCE steps</p>
          {mostMissed.length ? (
            <BarSeries max={missMax} rows={mostMissed.map(([step, n]) => ({ label: step, segments: [{ value: n, tone: "rose" }], readout: String(n), weak: true }))} />
          ) : (
            <p className="aurora-unavail">Available once the OSCE-grade migration records missed-critical steps.</p>
          )}
        </section>
      </div>
    </div>
  );
}
