/* Pure view-model for the cohort performance-trend panel (P2 §7, "Slice 2c"):
   PerformanceTrend -> the three chart series + the text the aria-hidden chart is paired
   with. No React and no DOM imports, so the Node harness can type-strip and unit-test it
   (mirrors cohortAnalyticsView.ts).

   Every rule worth pinning here is a DATA rule, not a rendering one: a null bucket stays
   a gap and never becomes a zero, a "direction" is only claimed between two REAL
   readings, and a truncated window says so out loud. The .tsx is a dumb projection of
   what this returns.

   Both type imports are erased before Node ever resolves them. */
import type { PerformanceTrend, TrendPoint } from "@/hooks/useAdmin";
import type { Series } from "@/aurora/components/charts/TrendChart";

export type MetricKey = "avg_score" | "pass_rate" | "safety_fail_rate";

/** Em-dash for "this metric has no denominator", never "0" — a 0% safety figure on a
    clinical board is the most dangerous wrong number this panel can show. */
export const NO_DATA = "—";

export const METRICS: { key: MetricKey; label: string; tone: Series["tone"] }[] = [
  { key: "avg_score", label: "Avg score", tone: "blue" },
  { key: "pass_rate", label: "Pass rate", tone: "green" },
  // Rose because it is the one series where UP is bad; the legend colour is the only
  // cue a reader gets before they read the axis.
  { key: "safety_fail_rate", label: "Safety failures", tone: "rose" },
];

/** All three metrics share one 0–100 frame — they are all percentages, and the point of
    stacking them is to compare slopes. Nulls pass straight through: the chart draws them
    as gaps, which is the whole reason the endpoint returns null instead of 0 (D13). */
export function trendSeries(points: TrendPoint[]): Series[] {
  return METRICS.map((m) => ({
    values: points.map((p) => p[m.key]),
    tone: m.tone,
    label: m.label,
    // The newest REAL reading, not points[last] — the newest bucket is routinely a quiet
    // day, and reading "—" beside every series on a busy cohort looks like an outage.
    readout: pct(latestReading(points, m.key)),
  }));
}

export function pct(v: number | null): string {
  return v === null ? NO_DATA : `${v}%`;
}

/** The newest bucket carrying a real reading for `key`, or null. */
export function latestReading(points: TrendPoint[], key: MetricKey): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const v = points[i][key];
    if (v !== null) return v;
  }
  return null;
}

/** Direction between the OLDEST and NEWEST real readings, or null.
    Null on fewer than two readings on purpose: one dot is a measurement, not a trend,
    and "up 12 points" off a single bucket is a sentence the data cannot support. */
export function deltaNote(points: TrendPoint[], key: MetricKey): string | null {
  const seen = points.map((p) => p[key]).filter((v): v is number => v !== null);
  if (seen.length < 2) return null;
  const d = Math.round((seen[seen.length - 1] - seen[0]) * 10) / 10;
  if (d === 0) return "level across the window";
  return `${d > 0 ? "up" : "down"} ${Math.abs(d)} points across the window`;
}

/** The sentence under the chart. The svg is aria-hidden, so this is the ONLY reading a
    screen reader gets — it has to carry the figures, not just describe the picture. */
export function trendSummary(data: PerformanceTrend): string {
  const pts = data.points;
  const attempts = pts.reduce((s, p) => s + p.n, 0);
  const unit = data.period === "week" ? "week" : "day";
  const active = pts.filter((p) => p.n > 0).length;

  if (attempts === 0) return `No station attempts in this window.`;

  const head = `${attempts} station attempt${attempts === 1 ? "" : "s"} across `
    + `${active} active ${unit}${active === 1 ? "" : "s"}.`;
  const latest = latestReading(pts, "avg_score");
  if (latest === null) {
    // Attempts exist but carry no grades — the pre-Tier-2 rows, which are still over half
    // of production. Saying "average —" without saying why reads as a broken panel.
    return `${head} None of them carry a grade yet, so there is no score to trend.`;
  }
  const dir = deltaNote(pts, "avg_score");
  return `${head} Latest average ${pct(latest)}${dir ? `, ${dir}` : ""}.`;
}

/** Non-null only when the server's paged read was truncated. */
export function truncationNote(data: PerformanceTrend): string | null {
  if (data.complete) return null;
  return `This read hit its page cap, so the OLDEST ${data.period === "week" ? "weeks" : "days"} `
    + `are missing. Treat the left-hand end as incomplete, not as a quiet period.`;
}
