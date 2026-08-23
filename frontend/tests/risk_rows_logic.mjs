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
// The panel's core ordering promise: worst first WITHIN a band, not just across bands.
const sameBand = riskRows([
  row({ student_id: "mild", risk_score: 55 }),
  row({ student_id: "worst", risk_score: 91 }),
  row({ student_id: "mid", risk_score: 70 }),
]);
check("worst sorts first within a band", sameBand.map((x) => x.studentId).join() === "worst,mid,mild");
// A null score sorts last within its band — "we know nothing" is not "worst".
check("a null score does not outrank a real one", riskRows([
  row({ student_id: "unknown", risk_score: null }), row({ student_id: "known", risk_score: 30 }),
]).map((x) => x.studentId).join() === "known,unknown");

// --- reasons --------------------------------------------------------------
const [r] = riskRows([row()]);
check("caps reasons at three", r.reasons.length === 3);
check("keeps the heaviest reason first", r.reasons[0].detail.startsWith("No activity"));
// Truncation is this module's one destructive act. If it slices in wire order, an
// upstream reorder silently drops the safety fail and leaves three trivia on screen.
const unsorted = riskRows([row({ reasons: [
  { factor: "weak_breadth", weight: 0.1, detail: "TINY" },
  { factor: "streak_broken", weight: 2, detail: "SMALL" },
  { factor: "inactivity", weight: 3, detail: "MID" },
  { factor: "safety", weight: 40, detail: "HEAVIEST" },
] })])[0].reasons;
check("sorts by weight before truncating", unsorted[0].detail === "HEAVIEST");
check("drops the lightest, not the heaviest", unsorted.map((x) => x.detail).join() === "HEAVIEST,MID,SMALL");
check("drops a zero-weight reason", riskRows([row({
  reasons: [{ factor: "streak_broken", weight: 0, detail: "Check-in streak of 9 days" }],
})])[0].reasons.length === 0);

// --- defensive ------------------------------------------------------------
check("survives a missing reasons array", riskRows([row({ reasons: undefined })])[0].reasons.length === 0);
check("survives a null risk_score", riskRows([row({ risk_score: null })])[0].scoreLabel === "—");
check("clamps an out-of-range sort key", riskRows([row({ risk_score: 140 })])[0].sortScore === 100);
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

// --- identity -------------------------------------------------------------
// THE POINT OF THE PANEL. Reported from production: every row read "6393d988-0b6…",
// so a trainer could see that thirteen students needed attention and not one name to
// act on. A flag nobody can act on is decoration.
check("shows the student's name", riskRows([row({ full_name: "Caleb Teo" })])[0].nameLabel === "Caleb Teo");
// Falls back to the id rather than blank: an unnamed row must still be traceable.
check("falls back to the id when there is no name", riskRows([row({ full_name: "" })])[0].nameLabel === r.idLabel);
check("falls back to the id when the field is absent", riskRows([row()])[0].nameLabel === r.idLabel);
// Staff and un-consented accounts seed student_name to the EMAIL, so the address is a
// real value that reaches this panel — the same defect display_name_assert.mjs pins.
check("never renders an email address as a name",
  !riskRows([row({ full_name: "snec.tne.edu@gmail.com" })])[0].nameLabel.includes("@"));
check("humanises an email into a name",
  riskRows([row({ full_name: "caleb.teo07@snec.com.sg" })])[0].nameLabel === "Caleb Teo");
// The id stays available as the secondary label — it is what the drill-down keys on.
check("keeps the id alongside the name", riskRows([row({ full_name: "Caleb Teo" })])[0].idLabel.length > 0);

// A dormant cohort scores EVERY student identically (an inactive student with no
// performance rows is 80/100 by arithmetic, not by coincidence), so score is not a
// tiebreak at all and the visible order fell back to raw UUID — unscannable. Name.
const tied = riskRows([
  row({ student_id: "u3", full_name: "Wei Ling" }),
  row({ student_id: "u1", full_name: "Aisha Rahman" }),
  row({ student_id: "u2", full_name: "Marcus Tan" }),
]);
check("breaks a score tie alphabetically by name",
  tied.map((x) => x.nameLabel).join() === "Aisha Rahman,Marcus Tan,Wei Ling");
// Ordering by score still wins over name — the tiebreak must not become the sort.
check("name never outranks a worse score", riskRows([
  row({ student_id: "a", full_name: "Aisha Rahman", risk_score: 51 }),
  row({ student_id: "z", full_name: "Zane Lim", risk_score: 88 }),
]).map((x) => x.nameLabel).join() === "Zane Lim,Aisha Rahman");

console.log(failures === 0 ? "\nrisk_rows_logic: all passed" : `\nrisk_rows_logic: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
