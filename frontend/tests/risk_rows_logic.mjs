/* Pure unit test for the at-risk row view-model. No React, no DOM — the module is
   deliberately free of both so this runs under Node's type stripping, mirroring
   cohort_panels_logic.mjs:
     node --experimental-strip-types frontend/tests/risk_rows_logic.mjs

   What these assertions defend, in the order a trainer would be misled:
     1. the worst band stays on top — the list is polled every 30s, so a tie that
        reorders between polls makes rows jump under the cursor;
     2. a zero-weight signal is never shown as a REASON — a healthy 9-day streak is
        not why anyone is flagged;
     3. a null risk_score renders "—", never "0", which reads as "lowest risk in the
        cohort";
     4. a payload shape we do not understand degrades to an empty/ignored row rather
        than throwing, which would blank the whole panel. */
import { riskRows, BAND_ORDER } from "../src/aurora/components/admin/riskRowView.ts";

let failures = 0;
const check = (name, cond) => {
  if (cond) { console.log(`  PASS  ${name}`); }
  else { console.log(`  FAIL  ${name}`); failures++; }
};

const row = (over = {}) => ({
  student_id: "stu_abcdef123456", risk_score: 72, band: "high",
  reasons: [
    { factor: "inactivity", weight: 25.0, detail: "No activity for 20 days" },
    { factor: "osce_failure", weight: 18.5, detail: "Failed 9 of 12 graded OSCE attempts" },
    { factor: "safety", weight: 12.0, detail: "Safety fail on 3 of 12 gradable attempts" },
    { factor: "flashcard", weight: 9.0, detail: "Flashcard accuracy 41% over 88 answers" },
  ],
  last_active: "2026-04-20", days_inactive: 20, weak_topics: ["a"], weak_count: 1,
  ...over,
});

// --- ordering -------------------------------------------------------------
const mixed = riskRows([row({ student_id: "m", band: "medium", risk_score: 40 }), row()]);
check("high sorts above medium", mixed[0].band === "high");
check("band order is high then medium", BAND_ORDER.indexOf("high") < BAND_ORDER.indexOf("medium"));

// --- reasons --------------------------------------------------------------
const [r] = riskRows([row()]);
check("caps reasons at three", r.reasons.length === 3);
check("keeps the heaviest reason first", r.reasons[0].detail.startsWith("No activity"));
check("drops a zero-weight reason", riskRows([row({
  reasons: [{ factor: "streak_broken", weight: 0, detail: "Check-in streak of 9 days" }],
})])[0].reasons.length === 0);

// --- defensive ------------------------------------------------------------
check("survives a missing reasons array", riskRows([row({ reasons: undefined })])[0].reasons.length === 0);
check("survives a null risk_score", riskRows([row({ risk_score: null })])[0].scoreLabel === "—");
check("clamps an out-of-range score", riskRows([row({ risk_score: 140 })])[0].scorePct === 100);
check("ignores an unknown band instead of throwing", riskRows([row({ band: "weird" })]).length === 1);
check("empty input is an empty list", riskRows([]).length === 0);
check("survives a null payload", riskRows(null).length === 0);

// --- labels ---------------------------------------------------------------
check("shortens the student id", r.idLabel.length <= 13);
// Production ids are often short ("S001"). An unconditional ellipsis would claim a
// truncation that never happened, i.e. show a trainer a partial id that is actually whole.
check("does not fake an ellipsis on a short id", riskRows([row({ student_id: "S001" })])[0].idLabel === "S001");
check("does ellipsise an id that was really cut", r.idLabel.endsWith("…"));
check("score label is the number", r.scoreLabel === "72");

console.log(failures === 0 ? "\nrisk_rows_logic: all passed" : `\nrisk_rows_logic: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
