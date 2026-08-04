/* Pure unit test for scoreBuckets — which remark belongs to which bucket of the 40/30/30.
   Run: node --experimental-strip-types frontend/tests/scoreBuckets_logic.mjs

   Reported 2026-08-04: "osce report not accurate in terms of the 40/30/30 remarks/comments."
   Two defects lived in this mapping:

     1. Checklist coverage — 40 of the 100, the largest bucket — was given no `notes` at all,
        so the biggest number on the page was the only one with nothing said about it.
     2. When a case has no manual procedures, station_score blends history ALONE into
        Consultation & Technique and its `parts` list drops "Examination technique". The
        report still printed the examination-technique paragraph under that bucket — a
        remark worth zero points, contradicting the sub-score list right above it. */
import assert from "node:assert";
import { scoreBuckets } from "../src/aurora/lib/scoreBuckets.ts";

const RESULT = {
  history_feedback: "Clear, well-ordered history.",
  investigations_feedback: "Tonometry technique was rushed.",
  diagnosis_feedback: "Read the picture correctly.",
  management_feedback: "Handover was clear.",
  checklist_coverage: 30, checklist_coverage_max: 40,
  consult_technique: 21, consult_technique_max: 30,
  judgement_safety: 24, judgement_safety_max: 30,
};

const HIST = { label: "History-taking", pts: 7, max: 10 };
const EXAM = { label: "Examination technique", pts: 7, max: 10 };

const breakdown = (consultParts, note = "3 of 4 steps performed. Not done: Wipe the occluder.") => ({
  checklist: { parts: [{ label: "Steps performed", pts: 3, max: 4 }], total: 30, max: 40, capped: false, cap_reason: "", note },
  consult: { parts: consultParts, total: 21, max: 30, capped: false, cap_reason: "", note: "" },
  judgement: { parts: [{ label: "Recognition", pts: 8, max: 10 }], total: 24, max: 30, capped: false, cap_reason: "", note: "" },
});

const byLabel = (buckets, label) => buckets.find((b) => b.label === label);

// ── 1. The 40-point bucket carries its remark ────────────────────────────────
{
  const buckets = scoreBuckets({ ...RESULT, breakdown: breakdown([HIST, EXAM]) });
  const checklist = byLabel(buckets, "Checklist coverage");
  assert.ok(checklist.notes?.length, "the 40-point bucket must carry a remark");
  assert.match(checklist.notes[0], /Wipe the occluder/, "the backend's note must reach the report");
}

// An empty note is an absence, not a blank bubble.
{
  const buckets = scoreBuckets({ ...RESULT, breakdown: breakdown([HIST, EXAM], "") });
  assert.strictEqual(byLabel(buckets, "Checklist coverage").notes, undefined,
    "no note ⇒ no empty notes array");
}

// ── 2. A remark may not outlive the sub-score behind it ──────────────────────
{
  // Manual case: examination technique scored, so its paragraph belongs.
  const withExam = scoreBuckets({ ...RESULT, breakdown: breakdown([HIST, EXAM]) });
  const consult = byLabel(withExam, "Consultation & Technique");
  assert.deepStrictEqual(consult.notes,
    [RESULT.history_feedback, RESULT.investigations_feedback],
    "a case WITH manual procedures keeps both paragraphs");
}
{
  // Non-manual case: `parts` has history alone, so the examination paragraph must go.
  const noExam = scoreBuckets({ ...RESULT, breakdown: breakdown([HIST]) });
  const consult = byLabel(noExam, "Consultation & Technique");
  assert.deepStrictEqual(consult.notes, [RESULT.history_feedback],
    "examination feedback must not appear under a bucket that did not score it");
  assert.ok(!consult.notes.includes(RESULT.investigations_feedback));
  // The remark list and the sub-score list must agree on what is in this bucket.
  assert.strictEqual(consult.notes.length, consult.parts.length,
    "one remark per sub-score — the two lists must not disagree");
}

// ── 3. Degrading without a breakdown ─────────────────────────────────────────
{
  // An older backend during a deploy window sends no breakdown: we cannot tell whether the
  // examination scored, so keep the real remark rather than silently drop it.
  const buckets = scoreBuckets(RESULT);
  assert.deepStrictEqual(byLabel(buckets, "Consultation & Technique").notes,
    [RESULT.history_feedback, RESULT.investigations_feedback]);
  assert.strictEqual(byLabel(buckets, "Checklist coverage").notes, undefined);
}

// ── 4. The other bucket is untouched ─────────────────────────────────────────
{
  const buckets = scoreBuckets({ ...RESULT, breakdown: breakdown([HIST, EXAM]) });
  assert.deepStrictEqual(byLabel(buckets, "Clinical Judgement & Safety").notes,
    [RESULT.diagnosis_feedback, RESULT.management_feedback]);
  assert.strictEqual(buckets.length, 3, "still exactly three buckets");
  assert.deepStrictEqual(buckets.map((b) => b.max), [40, 30, 30], "still 40/30/30");
}

// ── 5. The safety cap still explains itself ──────────────────────────────────
{
  const b = breakdown([HIST, EXAM]);
  b.judgement = { ...b.judgement, capped: true, cap_reason: "×0.6 safety cap — critical step missed: hand hygiene" };
  const buckets = scoreBuckets({ ...RESULT, breakdown: b });
  assert.match(byLabel(buckets, "Clinical Judgement & Safety").capReason, /safety cap/);
}

console.log("PASS: scoreBuckets — every bucket carries a remark, and no remark outlives its sub-score");
