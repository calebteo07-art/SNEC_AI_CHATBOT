/* Pure unit test for the OSCE sub-score denominators (/ship-check).

   The staff Sub-scores column rendered `consult·judgement` bare. Those two persist as
   plain INTEGERs and the grade was rescaled on 2026-08-04 from two schemes ×50 to three
   buckets 40/30/30, so a student's older attempts read "40·38" and their newer ones
   "22·26" — a trainer saw a collapse that was only a change of denominator.

   caseGrade.ts is dependency-free (no React), so run it under Node type stripping:
     node --experimental-strip-types frontend/tests/case_grade_scale_logic.mjs

   Covers: both eras get their own denominators, an unstamped row IS the legacy era, a
   genuine zero survives, and an unmapped future scale never invents a denominator. */
import assert from "node:assert";
import { subScoreParts, subScoreText, subScoreTitle } from "../src/aurora/lib/caseGrade.ts";

// ── Current era (grade_scale 2) — three buckets, 40/30/30 ────────────────────
const NEW = {
  score_100: 80, grade_scale: 2,
  checklist_coverage: 32, consult_technique: 24, judgement_safety: 24,
};
assert.deepStrictEqual(
  subScoreParts(NEW),
  [
    { label: "Checklist", pts: 32, max: 40 },
    { label: "Consult & technique", pts: 24, max: 30 },
    { label: "Judgement & safety", pts: 24, max: 30 },
  ],
  "scale 2 → all three buckets on 40/30/30",
);
assert.strictEqual(subScoreText(NEW), "32/40 · 24/30 · 24/30", "scale 2 renders its denominators");

// ── Legacy era — no stamp at all, which IS the ×50 scheme ────────────────────
// The checklist scored nothing then, so there is no third bucket to show, and inventing
// a 0/40 would read as a student who performed no steps.
const OLD = { score_100: 78, consult_technique: 40, judgement_safety: 38 };
assert.deepStrictEqual(
  subScoreParts(OLD),
  [
    { label: "Consult & technique", pts: 40, max: 50 },
    { label: "Judgement & safety", pts: 38, max: 50 },
  ],
  "unstamped row → the ×50 era, and no checklist bucket",
);
assert.strictEqual(subScoreText(OLD), "40/50 · 38/50", "legacy row renders /50");
assert.match(subScoreTitle(OLD), /earlier/i, "legacy title says the attempt predates the rescale");

// The whole point: the SAME underlying performance no longer reads as a drop. Both eras
// scale consult from (history+investigations)/20, so equal ratios must render as equal
// ratios once the denominator is right.
const oldRatio = subScoreParts(OLD)[0].pts / subScoreParts(OLD)[0].max;
const newSame = subScoreParts({ grade_scale: 2, consult_technique: 24, judgement_safety: 24 })[0];
assert.strictEqual(newSame.pts / newSame.max, 0.8, "24/30 is 0.8");
assert.strictEqual(oldRatio, 0.8, "40/50 is the same 0.8 — no apparent drop across the rescale");

// ── A real zero is not a missing column ──────────────────────────────────────
// The row that rules out inferring the era from `consult + judgement === score_100`:
// here that holds (22+26 === 48) yet the row is current, and its stamp must win.
const ZERO = {
  score_100: 48, grade_scale: 2,
  checklist_coverage: 0, consult_technique: 22, judgement_safety: 26,
};
assert.strictEqual(subScoreText(ZERO), "0/40 · 22/30 · 26/30", "coverage 0 shows as 0/40, on the /30 scale");

// ── Degenerate rows ──────────────────────────────────────────────────────────
assert.deepStrictEqual(subScoreParts({}), [], "no sub-scores at all → nothing to show");
assert.strictEqual(subScoreText({}), "—", "no sub-scores → em dash");
// Stamped but the checklist column never landed (a row written between the code and the
// migration): show what exists rather than dropping the row's other two buckets.
assert.strictEqual(
  subScoreText({ grade_scale: 2, consult_technique: 24, judgement_safety: 24 }),
  "24/30 · 24/30",
  "stamped row missing the checklist column still renders its /30 buckets",
);

// ── A future scheme nobody mapped here yet ───────────────────────────────────
// Bumping GRADE_SCALE in station_score.py without adding the entry below must NOT silently
// print the previous scheme's denominators — that is the exact bug this file exists to end.
const FUTURE = { grade_scale: 3, consult_technique: 11, judgement_safety: 12 };
assert.deepStrictEqual(
  subScoreParts(FUTURE),
  [
    { label: "Consult & technique", pts: 11, max: 0 },
    { label: "Judgement & safety", pts: 12, max: 0 },
  ],
  "unmapped scale → max 0, meaning 'denominator unknown'",
);
assert.strictEqual(subScoreText(FUTURE), "11 · 12", "unmapped scale prints raw, never a wrong denominator");
assert.match(subScoreTitle(FUTURE), /unrecognised|unknown/i, "unmapped scale says so in the tooltip");

console.log("case_grade_scale_logic: all assertions passed");
