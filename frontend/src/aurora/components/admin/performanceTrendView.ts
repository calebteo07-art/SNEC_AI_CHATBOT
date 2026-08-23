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

/* ── the WINDOW figures (hero + pass-rate card) ─────────────────────────────────
   Everything above describes the CHART, one bucket at a time. Everything below is the
   single reading a card claims for the whole window, and the two are different numbers:
   latestReading walks back to the newest non-null BUCKET, and at days=90 a bucket is one
   WEEK. The server pools the raw rows; these only project. */

export type WindowKey = "avg_score" | "pass_rate";

const NOUN: Record<WindowKey, string> = { avg_score: "scored", pass_rate: "graded" };

/** The window figure, rounded. Already 0-100 — no multiply. Em-dash when the server
    nulled it, which covers BOTH "no denominator" and "below the confidence floor". */
export function windowPct(data: PerformanceTrend | undefined, key: WindowKey): string {
  const v = data?.window?.[key];
  return v === undefined || v === null ? NO_DATA : `${Math.round(v)}%`;
}

/** The denominator line that has to sit beside every window figure. With the figure
    nulled server-side this is the ONLY thing separating "not enough evidence yet" from
    "the read failed" — an unexplained em-dash reads as a broken panel. Never emits a
    percentage, so it can never become the 0% this pass exists to stop rendering. */
export function windowBasis(data: PerformanceTrend | undefined, key: WindowKey): string {
  if (!data?.window) return "";
  const w = data.window;
  const n = key === "avg_score" ? w.scored_n : w.graded_n;
  const noun = NOUN[key];
  if (n === 0) {
    // The 2026-08-04 rescale is the FIRST thing to say here, not the last. This used to
    // return before mentioning it at all — so a 90-day window whose attempts all predate
    // the rescale reported "No graded attempts in the window" while the hero beside it
    // read "12 station attempts" and the safety card read "1 of 11 graded attempt(s)".
    // Three figures on one screen, contradicting each other, because the one number that
    // reconciled them was computed, sent, and then dropped on the floor.
    if (w.legacy_excluded > 0) {
      const s = w.legacy_excluded === 1 ? "" : "s";
      const all = w.legacy_excluded >= w.attempts;
      return all
        ? `All ${w.legacy_excluded} attempt${s} predate the 4 Aug rescale — not comparable`
        : `No ${noun} attempts yet · ${w.legacy_excluded} pre-rescale attempt${s} excluded`;
    }
    return `No ${noun} attempts in the window`;
  }
  const head = `${n} ${noun} attempt${n === 1 ? "" : "s"}`;
  if (w[key] === null) {
    return `${head} from ${w.students} student${w.students === 1 ? "" : "s"}`
      + ` — below the ${w.min_attempts}/${w.min_students} floor`;
  }
  // The 2026-08-04 rescale clips the graded window below the caption. Saying nothing
  // would read as "nobody was graded for eleven weeks".
  const clipped = w.legacy_excluded > 0
    ? ` · ${w.legacy_excluded} pre-rescale attempt${w.legacy_excluded === 1 ? "" : "s"} excluded`
    : "";
  return `${head} · ${w.students} student${w.students === 1 ? "" : "s"}${clipped}`;
}

/** The direction printed under the hero. Pooled halves of the scored rows, computed
    server-side — deltaNote() above compares the first and last chart BUCKETS, which is
    right when describing the drawn line and wrong as a headline claim, because those are
    single-bucket means and routinely n=1. undefined below the 4-score minimum: one dot is
    a measurement, not a trend. */
export function windowDelta(data: PerformanceTrend | undefined): string | undefined {
  const t = data?.window?.trajectory;
  if (!t || t.band === "insufficient" || t.delta === null) return undefined;
  const basis = `${t.n} scored attempts`;
  if (t.band === "steady") return `steady across the window (${basis})`;
  return `${t.delta > 0 ? "up" : "down"} ${Math.abs(t.delta)} points,`
    + ` first half to second (${basis})`;
}

/** Non-null only when the server's paged read was truncated. */
export function truncationNote(data: PerformanceTrend): string | null {
  if (data.complete) return null;
  return `This read hit its page cap, so the OLDEST ${data.period === "week" ? "weeks" : "days"} `
    + `are missing. Treat the left-hand end as incomplete, not as a quiet period.`;
}
