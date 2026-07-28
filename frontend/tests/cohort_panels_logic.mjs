/* Pure unit test for the cohort-analytics panel view-model. No React, no DOM —
   the module is deliberately free of both so this runs under Node's type stripping,
   mirroring charts_logic.mjs:
     node --experimental-strip-types frontend/tests/cohort_panels_logic.mjs

   What these assertions defend, in the order a trainer would be misled:
     1. a 3-attempt group cannot top the weakness ranking just because its one bad
        attempt scored worst — low-confidence groups sort BELOW confident ones;
     2. discipline=all never blends OA/PSA and OT into one ranking (D2) — the
        curricula are disjoint, so a blended row compares topics an OA student
        cannot even see;
     3. no null metric is ever drawn as a zero — a missing average renders "—" and
        drops its bar segment, because a 0% bar reads as catastrophic performance;
     4. the cohort safety rate is POOLED (sum of fails / sum of gradable attempts),
        not the mean of per-group rates, which would weight a 2-attempt group the
        same as a 20-attempt one;
     5. every readout carries its own denominator (§5.3);
     6. the tag-drift counter is only readable when the flashcard source is ok — it
        is counted during the flashcard pass, so a failed read reports a confident 0. */
import assert from "node:assert";
import {
  NO_DATA,
  rankTopics,
  sectionsFor,
  flashcardOk,
  driftNote,
  weakestPanel,
  comparisonPanel,
  safetyPanel,
  missedPanel,
} from "../src/aurora/components/admin/cohortAnalyticsView.ts";

/* A TopicGroupRow at its emptiest — every metric null, every denominator 0. That
   is the REALISTIC shape at today's volume, so it is the default here and each
   test opts into the data it needs.

   ONE RULE governs every fixture below, and it is the endpoint's, not this file's
   (tools/supervisor/cohort_analytics.py): a signal exists only when its metric is
   non-null AND its own denominator is positive (:271-299), and a group with no
   signal at all is emitted as {weakness_score: null, low_confidence: TRUE,
   signals_present: []} (:378). So `weakness_score: null` NEVER travels with
   `low_confidence: false`, and never travels with a positive denominator either —
   a row carrying safety_gradable_n or missed_top has a safety signal by
   construction and therefore has a score. Every deviation is a fixture pinning a
   state the wire cannot produce; this plan has already shipped three of those. */
const g = (label, over = {}, osce = {}) => ({
  topic_group: label.toLowerCase().replace(/ /g, "_"),
  label,
  pool: "CLINICAL",
  osce: {
    attempts: 0, students: 0, avg_score: null, scored_n: 0, pass_rate: null, graded_n: 0,
    safety_fail_rate: null, safety_gradable_n: 0, missed_top: [],
    by_difficulty: { beginner: 0, intermediate: 0, advanced: 0 },
    ...osce,
  },
  flashcard: null,
  weakness_score: null,
  // TRUE, not false: the no-signal row is the only one the default describes, and the
  // endpoint always marks it low-confidence. A scored row must say so explicitly, and
  // must say which side of the 3-student / 5-attempt floor its own denominators fall.
  low_confidence: true,
  signals_present: [],
  ...over,
});

const payload = (over = {}) => ({
  discipline: "all",
  days: 90,
  topics: [],
  totals: {
    students_in_pool: 0, students_with_osce_data: 0, students_with_flashcard_data: 0,
    osce_attempts: 0, osce_students: 0, unclassified_students: 0, unclassified_attempts: 0,
    staff_excluded: 0, unknown_tag_attempts: 0,
  },
  sources: { osce: "ok", flashcard: "ok" },
  // `rubric` (see the Task 9 blocks) is deliberately absent: this view-model has no
  // consumer for it. Add it here the moment one appears, and type it at the same time —
  // a fixture that has drifted from the real payload is how Task 10 nearly shipped a
  // panel built on fields the endpoint does not emit.
  ...over,
});

// ── 1) Ranking: confident first, limited-data next, no-signal last ──────────────
// All three tiers are represented on purpose: without a confident row AND a
// low-confidence row AND a no-signal row, "tier beats magnitude" is vacuous — every
// order would satisfy it.
const ranked = rankTopics([
  g("No signal"),
  g("Thin", { weakness_score: 0.91, low_confidence: true }),
  g("Solid", { weakness_score: 0.4, low_confidence: false }),
  g("Worst", { weakness_score: 0.72, low_confidence: false }),
]);
assert.deepStrictEqual(
  ranked.map((t) => t.label),
  ["Worst", "Solid", "Thin", "No signal"],
  "a 0.91 low-confidence group must NOT outrank a 0.72 confident one",
);
assert.deepStrictEqual(
  // Same tier and same score, so the tiebreak is the only thing that can order them.
  rankTopics([
    g("Beta", { weakness_score: 0.5, low_confidence: false }),
    g("Alpha", { weakness_score: 0.5, low_confidence: false }),
  ]).map((t) => t.label),
  ["Alpha", "Beta"],
  "ties break on label so the order is stable between polls",
);

// ── 2) discipline=all renders two labelled sections, in a fixed order ───────────
const both = payload({ topics: [g("Uvea & retina"), g("Orthoptics", { pool: "OT" })] });
const secs = sectionsFor(both);
assert.deepStrictEqual(secs.map((s) => s.title), ["OA & PSA", "OT"]);
assert.deepStrictEqual(secs.map((s) => s.topics.map((t) => t.label)), [["Uvea & retina"], ["Orthoptics"]]);

const otOnly = sectionsFor(payload({ discipline: "ot", topics: [g("Orthoptics", { pool: "OT" })] }));
assert.strictEqual(otOnly.length, 1);
assert.strictEqual(otOnly[0].title, "OT");

// An empty pool still gets its section, so a discipline never silently disappears
// from the board on a thin week.
const lopsided = sectionsFor(payload({ topics: [g("Uvea & retina")] }));
assert.strictEqual(lopsided.length, 2);
assert.deepStrictEqual(lopsided[1].topics, []);

// ── 3) Weakest topics: markers, denominators, and no fabricated zeros ──────────
const wp = weakestPanel([
  // 9 attempts by 4 students clears both floors, so the endpoint marks it confident.
  g("Worst", { weakness_score: 0.72, low_confidence: false, signals_present: ["osce_score", "osce_pass"] }, { attempts: 9, students: 4 }),
  g("Thin", { weakness_score: 0.91, low_confidence: true, signals_present: ["osce_score"] }, { attempts: 2, students: 1 }),
  g("Silent"),
]);
assert.deepStrictEqual(wp.rows.map((r) => r.label), ["Worst", "Thin · limited data"]);
assert.strictEqual(wp.rows[0].readout, "72 (9)", "weakness index plus the attempts it was measured over");
assert.strictEqual(wp.rows[0].weak, true);
assert.strictEqual(wp.rows[1].weak, false, "a limited-data group must not wear the alarm gradient");
assert.strictEqual(wp.rows[1].segments[0].tone, "purple");
assert.strictEqual(wp.max, 1, "weakness_score is already normalised 0-1");
assert.ok(wp.summary.includes("Worst"));
assert.ok(wp.summary.includes("9 OSCE attempt"));
assert.ok(wp.summary.includes("1 group(s) marked"));
assert.ok(wp.summary.includes("1 group(s) have no performance signal"));
assert.ok(!wp.rows.some((r) => r.label.startsWith("Silent")), "a null score is unranked, not ranked at zero");

const wpEmpty = weakestPanel([g("Silent"), g("Also silent")]);
assert.deepStrictEqual(wpEmpty.rows, []);
assert.ok(wpEmpty.summary.startsWith("No topic group has enough performance data"));

// ── 4) OSCE vs flashcards: two rows per group, both normalised to 0-1 ──────────
// Uvea clears both confidence floors (15 scored attempts by 6 students); Glaucoma
// clears neither (4 by 2) and the endpoint marks it low-confidence accordingly. The
// two therefore also sit in different tiers, which is why Uvea leads regardless of
// how close the two weakness scores get.
const mixed = [
  g("Uvea", { weakness_score: 0.6, low_confidence: false, flashcard: { accuracy: 84, n: 120, students: 7 } },
    { attempts: 15, students: 6, avg_score: 78.4, scored_n: 15 }),
  g("Glaucoma", { weakness_score: 0.3, low_confidence: true },
    { attempts: 4, students: 2, avg_score: 91, scored_n: 4 }),
];
const cp = comparisonPanel(mixed, true);
assert.deepStrictEqual(cp.rows.map((r) => r.label), [
  "Uvea · OSCE", "Uvea · flashcards", "Glaucoma · OSCE", "Glaucoma · flashcards",
]);
// avg_score AND accuracy both arrive on 0-100; the shared BarSeries track is 0-1.
// Plotting either un-normalised is the 100x scale bug §5.3 warns about.
assert.ok(Math.abs(cp.rows[0].segments[0].value - 0.784) < 1e-9);
assert.strictEqual(cp.rows[0].readout, "78% (15)");
assert.ok(Math.abs(cp.rows[1].segments[0].value - 0.84) < 1e-9);
assert.strictEqual(cp.rows[1].readout, "84% (120)");
// Glaucoma has no flashcard row at all -> empty track + em-dash, never a 0% bar.
assert.deepStrictEqual(cp.rows[3].segments, []);
assert.strictEqual(cp.rows[3].readout, NO_DATA);
assert.strictEqual(NO_DATA, "—");

const cpNoFlash = comparisonPanel(mixed, false);
assert.deepStrictEqual(cpNoFlash.rows.map((r) => r.label), ["Uvea · OSCE", "Glaucoma · OSCE"]);
assert.ok(cpNoFlash.summary.includes("No flashcard data yet"));
assert.ok(!cpNoFlash.summary.includes("0%"));

// A group can qualify on FLASHCARDS ALONE — cards answered before any station attempt,
// or attempts that exist but none scored yet (avg_score null, scored_n 0). Its OSCE row
// is then the only place scoreReadout's null branch is reachable, and without this
// fixture the whole "— never 0%" rule on that side is untested: a scoreReadout that
// returned "0% (0)" would put a confident zero beside an empty track and every other
// assertion here would still pass.
const flashOnly = comparisonPanel(
  // Its ONLY signal is the flashcard one (40 answers by 5 students, both floors
  // cleared → confident); the 3 station attempts produced no grade at all.
  [g("Ocular pharmacology",
     { weakness_score: 0.5, low_confidence: false, signals_present: ["flashcard"],
       flashcard: { accuracy: 62, n: 40, students: 5 } },
     { attempts: 3, students: 2 })],
  true,
);
assert.deepStrictEqual(flashOnly.rows.map((r) => r.label), [
  "Ocular pharmacology · OSCE", "Ocular pharmacology · flashcards",
]);
assert.deepStrictEqual(flashOnly.rows[0].segments, [], "no scored attempt draws no bar");
assert.strictEqual(flashOnly.rows[0].readout, NO_DATA, "a null mean reads the em-dash, never '0% (0)'");
assert.strictEqual(flashOnly.rows[1].readout, "62% (40)");

const cpEmpty = comparisonPanel([g("Silent")], true);
assert.deepStrictEqual(cpEmpty.rows, []);
assert.ok(cpEmpty.summary.startsWith("No topic group has a graded OSCE attempt"));

// flashcardOk gates the whole flashcard half: an unavailable source and a merely
// empty table both mean "not yet", never 0%.
assert.strictEqual(flashcardOk(payload({ topics: mixed })), true);
assert.strictEqual(
  flashcardOk(payload({ topics: mixed, sources: { osce: "ok", flashcard: "unavailable" } })),
  false,
);
assert.strictEqual(
  flashcardOk(payload({ topics: [g("Empty", { flashcard: { accuracy: null, n: 0, students: 0 } })] })),
  false,
);

// ── 5) Safety callout: pooled, not the mean of rates ───────────────────────────
// A and B carry a safety signal, so neither can have a null weakness_score — a
// positive safety_gradable_n IS a present signal (cohort_analytics.py:286). Only C,
// with nothing gradable, is the no-signal row the default describes.
const sp = safetyPanel([
  g("A", { weakness_score: 0.5, low_confidence: true, signals_present: ["safety"] },
    { attempts: 2, students: 2, safety_fail_rate: 0.5, safety_gradable_n: 2 }),
  g("B", { weakness_score: 0.1, low_confidence: false, signals_present: ["safety"] },
    { attempts: 20, students: 8, safety_fail_rate: 0.1, safety_gradable_n: 20 }),
  g("C", {}, { safety_fail_rate: null, safety_gradable_n: 0 }),
]);
assert.strictEqual(sp.rate, 3 / 22);
assert.strictEqual(sp.summary, "3 of 22 graded attempt(s) missed a critical safety step.");
assert.ok(Math.abs(sp.rate - 0.3) > 0.1, "the mean of per-group rates would read 30% — 2x the pooled truth");

const spNone = safetyPanel([g("A"), g("B")]);
assert.strictEqual(spNone.rate, null, "null must reach the panel, not DonutGauge, which would render 0%");
assert.ok(spNone.summary.includes("no safety rate to report"));

// ── 6) Most-missed steps: ranked by miss count, read as "3 of 40" ──────────────
// A missed_top entry only exists because some attempt recorded missed_critical, and
// the writer sets safe = not missed_critical — so a group with missed steps always
// has a safety denominator, hence a safety signal, hence a weakness score. A fixture
// with missed_top and a null score describes a row the endpoint cannot emit.
const mp = missedPanel([
  g("Uvea", { weakness_score: 0.44, low_confidence: false, signals_present: ["safety"] }, {
    attempts: 52, students: 40, safety_fail_rate: 0.173, safety_gradable_n: 52,
    missed_top: [
      { step: "Did not check IOP", count: 7, students: 3 },
      { step: "No red flag screen", count: 2, students: 2 },
    ],
  }),
  g("Glaucoma", { weakness_score: 0.61, low_confidence: false, signals_present: ["safety"] }, {
    attempts: 14, students: 12, safety_fail_rate: 0.643, safety_gradable_n: 14,
    missed_top: [{ step: "Missed disc assessment", count: 9, students: 5 }],
  }),
]);
assert.deepStrictEqual(mp.rows.map((r) => r.label), [
  "Missed disc assessment", "Did not check IOP", "No red flag screen",
]);
assert.strictEqual(mp.max, 9, "bars scale to the largest miss count, not to 1");
assert.strictEqual(mp.rows[1].readout, "3/40");
assert.ok(mp.summary.includes("5 of 12 students"));

const mpEmpty = missedPanel([g("Uvea")]);
assert.deepStrictEqual(mpEmpty.rows, []);
assert.strictEqual(mpEmpty.max, 1);
assert.ok(mpEmpty.summary.includes("No critical step"));

// ── 7) Cross-cutting: none of these fixtures may produce a drawn zero ──────────
// Every metric in them is either a real number or null, and a null metric drops
// its segment rather than drawing a 0-length bar that reads as a measured zero.
for (const panel of [wp, cp, cpNoFlash, flashOnly, mp]) {
  for (const row of panel.rows) {
    assert.ok(!row.segments.some((s) => s.value === 0), `${row.label}: absent metric drew a zero segment`);
    assert.notStrictEqual(row.readout, "0%", `${row.label}: absent metric read as 0%`);
  }
}

// ── 8) Tag drift is only readable while the flashcard source is ok ─────────────
// unknown_tag_attempts is counted during the flashcard pass, so a FAILED read reports
// a confident 0 — the same "0 that means no-data" class as a 0% bar, and the reason
// Task 9's amendment forbids rendering the counter bare. It is also VIEW-scoped, unlike
// the population-wide unclassified/staff counters it renders beside, so its copy has to
// say which scope it is in.
const drifted = (n, flashcard = "ok") =>
  payload({
    totals: { ...payload().totals, unknown_tag_attempts: n },
    sources: { osce: "ok", flashcard },
  });
assert.strictEqual(driftNote(drifted(0)), null, "no drift is silence, not a reassuring zero");
assert.strictEqual(
  driftNote(drifted(3, "unavailable")),
  null,
  "a failed flashcard read reports unknown_tag_attempts: 0 — the counter must not render at all",
);
const note = driftNote(drifted(3));
assert.ok(note.includes("3 flashcard answers"), "the count travels with the prose");
assert.ok(note.includes("this discipline view"), "the counter is view-scoped, not population-wide");
assert.ok(driftNote(drifted(1)).includes("1 flashcard answer "), "singular reads as one answer");

console.log("cohort_panels_logic: all assertions passed");
