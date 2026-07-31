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
check("the peer count is never rendered as n=", rows.every((r) => !r.cohortLabel.includes("n=")));

const ret = rows.find((r) => r.key === "retention_mastery");
check("solo cohort says there is no cohort", ret.cohortLabel.toLowerCase().includes("no cohort"));
// A student WITH a value and no peers still has nobody to compare to — the delta must
// stay a dash, not become the 0 that "level with peers" is reserved for.
check("solo cohort has no delta and no tone", ret.deltaLabel === "—" && ret.tone === "none");

// --- defensive ------------------------------------------------------------
check("null block is an empty list", masteryRows(null).length === 0);
check("missing scale is skipped, not crashed", masteryRows({ osce_mastery: null }).length === 0);
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
