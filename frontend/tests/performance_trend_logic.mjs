/* Pure unit test for the performance-trend panel view-model. No React, no DOM — the
   module is deliberately free of both so this runs under Node's type stripping,
   mirroring cohort_panels_logic.mjs:
     node --experimental-strip-types frontend/tests/performance_trend_logic.mjs

   What these assertions defend, in the order a trainer would be misled:
     1. a bucket with no attempts stays NULL all the way to the chart — the endpoint
        returns null instead of 0 precisely so no cliff to the floor gets drawn, and
        mapping it to 0 one layer above the decision would quietly undo it;
     2. a "direction" is never claimed off a single reading, and gaps between the two
        ends never become the ends;
     3. a window whose attempts are all ungraded says so, rather than rendering a 0%
        average that reads as a cohort scoring zero;
     4. a truncated read is announced — a trend is read for its SHAPE, so silently
        losing the oldest buckets is worse than losing the whole chart. */
import assert from "node:assert";
import {
  METRICS, NO_DATA, deltaNote, latestReading, pct, trendSeries, trendSummary, truncationNote,
} from "../src/aurora/components/admin/performanceTrendView.ts";

const P = (over = {}) => ({
  date: "2026-07-31", n: 0, avg_score: null, pass_rate: null, safety_fail_rate: null, ...over,
});
const T = (points, over = {}) => ({
  discipline: "all", period: "day", points, complete: true, ...over,
});

// ── 1. nulls survive the trip to the chart ───────────────────────────────────
const s = trendSeries([P(), P({ n: 2, avg_score: 80, pass_rate: 50, safety_fail_rate: 25 })]);
assert.strictEqual(s.length, METRICS.length, "one series per metric");
assert.deepStrictEqual(s[0].values, [null, 80], "an empty bucket is a gap, not a zero");
assert.deepStrictEqual(s[2].values, [null, 25], "the safety series is the UNSAFE share");
assert.deepStrictEqual(s.map((x) => x.label), ["Avg score", "Pass rate", "Safety failures"]);
assert.strictEqual(new Set(s.map((x) => x.tone)).size, 3, "each series is separable by colour");
assert.strictEqual(pct(null), NO_DATA, "no denominator renders an em-dash, never 0%");
assert.strictEqual(pct(0), "0%", "a real measured zero still renders as zero");

// The legend readout is the newest REAL reading, not points[last] — the newest bucket is
// routinely a quiet day, and "—" beside every series on a busy cohort looks like an outage.
assert.deepStrictEqual(s.map((x) => x.readout), ["80%", "50%", "25%"]);
assert.deepStrictEqual(
  trendSeries([P({ n: 2, avg_score: 80, pass_rate: 50, safety_fail_rate: 25 }), P()]).map((x) => x.readout),
  ["80%", "50%", "25%"], "a trailing quiet day does not blank the legend");
assert.strictEqual(trendSeries([P()])[0].readout, NO_DATA);

// ── 2. a direction needs two real readings ───────────────────────────────────
assert.strictEqual(deltaNote([P({ avg_score: 70 })], "avg_score"), null, "one dot is not a trend");
assert.strictEqual(deltaNote([P(), P()], "avg_score"), null);
assert.ok(deltaNote([P({ avg_score: 60 }), P({ avg_score: 72 })], "avg_score").startsWith("up 12"));
assert.ok(deltaNote([P({ avg_score: 72 }), P({ avg_score: 60 })], "avg_score").startsWith("down 12"));
assert.ok(deltaNote([P({ avg_score: 60 }), P({ avg_score: 60 })], "avg_score").startsWith("level"));
// A quiet fortnight in the middle must not be mistaken for an endpoint.
assert.ok(deltaNote([P({ avg_score: 60 }), P(), P({ avg_score: 72 })], "avg_score").startsWith("up 12"),
  "gaps between the ends are not the ends");

assert.strictEqual(latestReading([P({ avg_score: 80 }), P()], "avg_score"), 80,
  "a trailing quiet day does not erase the last real reading");
assert.strictEqual(latestReading([P(), P()], "avg_score"), null);

// ── 3. the text carries the figures (the svg is aria-hidden) ─────────────────
assert.strictEqual(trendSummary(T([P(), P()])), "No station attempts in this window.");

const ungraded = trendSummary(T([P({ n: 3 })]));
assert.ok(ungraded.includes("3 station attempts"), ungraded);
assert.ok(ungraded.includes("no score to trend"), ungraded);
assert.ok(!ungraded.includes("0%"), "an ungraded window must never render a 0% average");

const normal = trendSummary(T([P({ n: 2, avg_score: 60 }), P({ n: 4, avg_score: 72 })]));
assert.ok(normal.includes("6 station attempts"), normal);
assert.ok(normal.includes("Latest average 72%"), normal);
assert.ok(normal.includes("up 12 points"), normal);

assert.ok(trendSummary(T([P({ n: 1, avg_score: 50 })])).includes("1 station attempt across 1 active day"),
  "singular reads as English, not as '1 attempts across 1 days'");
assert.ok(trendSummary(T([P({ n: 1, avg_score: 50 })], { period: "week" })).includes("active week"),
  "a weekly rollup says week, not day");

// ── 4. a truncated read is announced ─────────────────────────────────────────
assert.strictEqual(truncationNote(T([])), null, "a complete read is silent");
assert.ok(truncationNote(T([], { complete: false })).includes("OLDEST days"));
assert.ok(truncationNote(T([], { complete: false, period: "week" })).includes("OLDEST weeks"));

console.log("performance_trend_logic: all assertions passed");
