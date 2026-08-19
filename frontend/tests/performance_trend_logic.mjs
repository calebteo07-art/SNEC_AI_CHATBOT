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
  windowBasis, windowDelta, windowPct,
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

// ── 5. the WINDOW figures are not the chart ──────────────────────────────────
//   The hero and the pass-rate card claim a 90-day window. They used to render
//   latestReading(), i.e. the newest non-null BUCKET — one WEEK at days=90. These pin
//   that the card reads `window` and never re-derives a headline from `points`.
const W = (over = {}) => ({
  attempts: 8, students: 5, avg_score: 69.4, scored_n: 8, pass_rate: 75, graded_n: 8,
  legacy_excluded: 0, min_students: 3, min_attempts: 5,
  trajectory: { band: "improving", delta: 12.7, n: 8, needed: 4 }, ...over,
});
const TW = (over = {}, pts = [P({ n: 5, avg_score: 74.2, pass_rate: 80 })]) =>
  T(pts, { window: W(over) });

// The fixture's newest bucket is 74.2 and the window is 69.4 — a hero showing 74% is
// reading the chart. This is the whole defect, in one assertion.
assert.strictEqual(windowPct(TW(), "avg_score"), "69%", "the hero reads the WINDOW, not points[last]");
assert.strictEqual(windowPct(TW(), "pass_rate"), "75%");
assert.strictEqual(windowPct(undefined, "avg_score"), NO_DATA, "no data is an em-dash, never 0%");
assert.strictEqual(windowPct(TW({ avg_score: null }), "avg_score"), NO_DATA,
  "below the confidence floor the server nulls it, and null renders as an em-dash");

// The basis line is what stops a suppressed figure reading as a broken panel.
assert.ok(windowBasis(TW(), "avg_score").includes("8 scored attempts"));
assert.ok(windowBasis(TW(), "avg_score").includes("5 students"));
assert.ok(windowBasis(TW({ avg_score: null, scored_n: 4, students: 2 }), "avg_score")
  .includes("below the 5/3 floor"), "a suppressed figure says WHY it is suppressed");
assert.strictEqual(windowBasis(TW({ scored_n: 0 }), "avg_score"), "No scored attempts in the window");
assert.ok(windowBasis(TW({ legacy_excluded: 3 }), "avg_score").includes("3 pre-rescale attempts excluded"),
  "a graded window clipped by the 2026-08-04 rescale says so, or it reads as a silent gap");
assert.ok(!windowBasis(TW({ scored_n: 0 }), "avg_score").includes("%"),
  "the basis line never emits a percentage — it cannot become the 0% we are removing");
assert.strictEqual(windowBasis(TW({ scored_n: 1 }), "avg_score").split(" ")[1], "scored");
assert.ok(windowBasis(TW({ scored_n: 1 }), "avg_score").startsWith("1 scored attempt ·"),
  "singular reads as English");

// The delta is pooled halves, carrying its own n — not the first and last buckets.
assert.ok(windowDelta(TW()).includes("up 12.7 points"));
assert.ok(windowDelta(TW()).includes("8 scored attempts"), "the direction states its own basis");
assert.ok(windowDelta(TW({ trajectory: { band: "declining", delta: -8.2, n: 9, needed: 4 } }))
  .includes("down 8.2 points"));
assert.ok(windowDelta(TW({ trajectory: { band: "steady", delta: 1.1, n: 9, needed: 4 } }))
  .startsWith("steady"), "movement inside the dead band is not a direction");
assert.strictEqual(
  windowDelta(TW({ trajectory: { band: "insufficient", delta: null, n: 2, needed: 4 } })), undefined,
  "two scores is not a trend, and the hero shows no pill at all rather than a claim");
assert.strictEqual(windowDelta(undefined), undefined);

console.log("performance_trend_logic: all assertions passed");
