/* Pure unit test for the mastery-block view-model. No React, no DOM — the module is
   deliberately free of both so this runs under Node's type stripping, mirroring
   risk_rows_logic.mjs:
     node --experimental-strip-types frontend/tests/mastery_view_logic.mjs

   Every scale literal below is a state tools/supervisor/mastery.py::mastery_block can
   actually emit. The rule it obeys: peers_n === cohort_n - 1 when the student HAS a
   value, === cohort_n when they do not; cohort_avg and delta are null iff peers_n === 0;
   delta === value - cohort_avg.

   What these assertions defend, in the order a trainer would be misled:
     1. a missing value renders "—", never "0" — a zero reads as the worst score in
        the cohort rather than "this student has not done any";
     2. the delta is SIGNED and toned, so "40 below the cohort" cannot render as the
        same bar as "40 above";
     3. the peer count shown is peers_n — the number cohort_avg is actually the mean
        of — never cohort_n, which counts this student too;
     4. a solo student says "no cohort", never a 0 delta, which reads as "exactly
        average" when there is nobody to be average against. */
import { masteryRows } from "../src/aurora/components/admin/masteryView.ts";

let failures = 0;
const check = (name, cond) => {
  if (cond) { console.log(`  PASS  ${name}`); }
  else { console.log(`  FAIL  ${name}`); failures++; }
};

const block = (over = {}) => ({
  osce_mastery: { value: 90, cohort_avg: 45, delta: 45, cohort_n: 3, peers_n: 2 },
  flashcard_mastery: { value: null, cohort_avg: 100, delta: null, cohort_n: 1, peers_n: 1 },
  retention_mastery: { value: 60, cohort_avg: null, delta: null, cohort_n: 1, peers_n: 0 },
  ...over,
});

const rows = masteryRows(block());
check("renders all three scales", rows.length === 3);
check("names each scale", rows.every((r) => r.label && r.label !== r.key));

const osce = rows.find((r) => r.key === "osce_mastery");
check("shows the value", osce.valueLabel === "90");
check("shows a signed delta", osce.deltaLabel === "+45");
check("marks an above-cohort delta", osce.tone === "above");
check("names the peer count, not the cohort count", osce.cohortLabel === "Cohort 45 (2 peers)");

const fc = rows.find((r) => r.key === "flashcard_mastery");
check("null value renders a dash, not a zero", fc.valueLabel === "—");
check("null delta renders a dash", fc.deltaLabel === "—");
check("null delta is toned neutral", fc.tone === "none");
check("still reports the cohort", fc.cohortLabel.includes("100"));
// The whole reason peers_n exists: cohort_n is 1 here too, and "n=1" beside an average
// of 100 reads as "the cohort", when it is one classmate. Singular, and never "n=".
check("a one-peer cohort says '1 peer', not 'n=1'", fc.cohortLabel === "Cohort 100 (1 peer)");

const ret = rows.find((r) => r.key === "retention_mastery");
check("solo cohort says there is no cohort", ret.cohortLabel.toLowerCase().includes("no cohort"));
// A student WITH a value and no peers still has nobody to compare to — the delta must
// stay a dash, not become the 0 that "level with peers" is reserved for.
check("solo cohort has no delta and no tone", ret.deltaLabel === "—" && ret.tone === "none");

// --- the bar --------------------------------------------------------------
// deltaPct sizes DivergingBar and nothing else asserts it, yet the component exists only
// because BarSeries cannot draw a signed delta. It must be the MAGNITUDE — direction lives
// in `tone` — so a negative would size the bar backwards, and an unclamped one overflow it.
check("bar size is the delta magnitude", osce.deltaPct === 45);
check("a below-cohort bar is sized positive, not negative", (() => {
  const r = masteryRows(block({ osce_mastery: { value: 20, cohort_avg: 60, delta: -40, cohort_n: 3, peers_n: 2 } }))
    .find((x) => x.key === "osce_mastery");
  return r.deltaPct === 40 && r.tone === "below";
})());
check("no delta means no bar", fc.deltaPct === 0);

// A student who genuinely scored 0 is the one a trainer most needs to see, and 0 is falsy.
// Any `s.value ? …` in here renders their score as "—" (no data) and their delta with it.
// The same blind spot survived the backend module's first suite; it is easy to leave open.
check("a real zero renders as 0, not as no-data", (() => {
  const r = masteryRows(block({ osce_mastery: { value: 0, cohort_avg: 55, delta: -55, cohort_n: 3, peers_n: 2 } }))
    .find((x) => x.key === "osce_mastery");
  return r.valueLabel === "0" && r.deltaLabel === "−55" && r.tone === "below";
})());

// --- rounding -------------------------------------------------------------
// All three figures are 1dp floats, so rounding them independently lets one row visibly
// contradict itself: 78.5 / 61.4 / 17.1 would print "79 … +17 … Cohort 61", and 79-61=18.
check("the displayed numbers agree with each other", (() => {
  const r = masteryRows(block({ osce_mastery: { value: 78.5, cohort_avg: 61.4, delta: 17.1, cohort_n: 8, peers_n: 7 } }))
    .find((x) => x.key === "osce_mastery");
  return r.valueLabel === "79" && r.deltaLabel === "+18" && r.cohortLabel === "Cohort 61 (7 peers)";
})());
// A delta under half a point used to render "−0" in alarm red with an invisible bar.
check("a sub-half delta is level, not a red minus-zero", (() => {
  const r = masteryRows(block({ osce_mastery: { value: 61.3, cohort_avg: 61.4, delta: -0.1, cohort_n: 3, peers_n: 2 } }))
    .find((x) => x.key === "osce_mastery");
  return r.deltaLabel === "0" && r.tone === "level";
})());

// --- defensive ------------------------------------------------------------
check("null block is an empty list", masteryRows(null).length === 0);
// A scale is SKIPPED while its siblings still render — the old fixture nulled the only
// member, so "skipped" and "empty block" were indistinguishable.
check("one missing scale does not take the others with it", (() => {
  const r = masteryRows(block({ osce_mastery: null }));
  return r.length === 2 && !r.some((x) => x.key === "osce_mastery");
})());
check("negative delta is signed and toned", (() => {
  const r = masteryRows(block({ osce_mastery: { value: 20, cohort_avg: 60, delta: -40, cohort_n: 3, peers_n: 2 } }))
    .find((x) => x.key === "osce_mastery");
  return r.deltaLabel === "−40" && r.tone === "below";
})());
check("zero delta is neither above nor below", (() => {
  const r = masteryRows(block({ osce_mastery: { value: 45, cohort_avg: 45, delta: 0, cohort_n: 3, peers_n: 2 } }))
    .find((x) => x.key === "osce_mastery");
  return r.tone === "level";
})());

console.log(failures === 0 ? "\nmastery_view_logic: all passed" : `\nmastery_view_logic: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
