/* Pure unit test for the Virtual-Patients topic filter logic (spec 2026-07-19 + /ship-check).
   caseFilter.ts is dependency-free (region matcher injected, so no React pulled in). Run under
   Node type stripping:
     node --experimental-strip-types frontend/tests/caseFilter_logic.mjs

   Covers the state invariant (ONE lens at a time: topic and eye-region are mutually exclusive),
   the list filter's two branches, and the topic-chip list (hide-zero, done flag, graceful
   fallback when /api/cases/topics is unavailable). */
import assert from "node:assert";
import {
  ALL_LENS, toggleTopic, toggleRegion, filterCases, topicChips, journeySections, searchCases,
} from "../src/aurora/lib/caseFilter.ts";

// ── ONE lens at a time (the state invariant /ship-check guards) ───────────────
// Picking a topic clears any active eye-region.
assert.deepStrictEqual(
  toggleTopic({ region: "cornea", topic: null }, "visual_fields"),
  { region: "all", topic: "visual_fields" },
  "topic pick clears the eye-region",
);
// Picking an eye-region clears any active topic.
assert.deepStrictEqual(
  toggleRegion({ region: "all", topic: "visual_fields" }, "cornea"),
  { region: "cornea", topic: null },
  "region pick clears the topic",
);
// Re-tapping the active topic toggles back to the whole library.
assert.deepStrictEqual(
  toggleTopic({ region: "all", topic: "visual_fields" }, "visual_fields"),
  ALL_LENS,
  "re-tap active topic → whole library",
);
// Re-tapping the active region toggles back (matches the existing pin toggle).
assert.deepStrictEqual(
  toggleRegion({ region: "cornea", topic: null }, "cornea"),
  ALL_LENS,
  "re-tap active region → whole library",
);
// From ANY start, the two never end up engaged together.
for (const start of [ALL_LENS, { region: "macula", topic: null }, { region: "all", topic: "oct_imaging" }]) {
  const t = toggleTopic(start, "oct_imaging");
  assert.ok(!(t.region !== "all" && t.topic), "topic action never leaves region+topic both set");
  const r = toggleRegion(start, "macula");
  assert.ok(!(r.region !== "all" && r.topic), "region action never leaves region+topic both set");
}

// ── filterCases — the two branches (region matcher injected) ─────────────────
const CASES = [
  { case_id: "a", topic: "humphrey_visual_field", title: "HVF", set_key: "visual_fields", set_label: "Visual Field Testing" },
  { case_id: "b", topic: "cirrus_oct_macular", title: "OCT", set_key: "oct_imaging", set_label: "OCT Imaging" },
  { case_id: "c", topic: "history_taking", title: "History", set_key: "history_taking", set_label: "History Taking" },
];
const fakeRegion = (text, region) => region === "all" || text.includes(region);
// Topic lens filters strictly by set_key and ignores the region matcher.
assert.deepStrictEqual(
  filterCases(CASES, { region: "all", topic: "oct_imaging" }, fakeRegion).map((c) => c.case_id),
  ["b"],
  "topic lens filters by set_key",
);
// Whole-library lens returns everything.
assert.strictEqual(filterCases(CASES, ALL_LENS, fakeRegion).length, 3, "all lens → whole list");
// Region lens delegates to the injected matcher.
assert.deepStrictEqual(
  filterCases(CASES, { region: "humphrey", topic: null }, fakeRegion).map((c) => c.case_id),
  ["a"],
  "region lens delegates to regionMatch",
);

// ── topicChips — canonical path: hide zero-count, mark fully-completed ────────
const api = [
  { set_key: "oct_imaging", label: "OCT Imaging", total: 4, completed: 4 },
  { set_key: "visual_fields", label: "Visual Field Testing", total: 5, completed: 2 },
  { set_key: "empty", label: "Empty Set", total: 0, completed: 0 },
];
const chips = topicChips(api, CASES);
assert.deepStrictEqual(chips.map((c) => c.key), ["oct_imaging", "visual_fields"], "hides zero-total sets, keeps canonical order");
assert.deepStrictEqual([chips[0].total, chips[1].total], [4, 5], "carries per-set totals");
assert.strictEqual(chips[0].done, true, "fully-completed set → done");
assert.strictEqual(chips[1].done, false, "partially-complete set → not done");

// ── topicChips — graceful fallback when the topics fetch failed ──────────────
const fb = topicChips(null, CASES);
assert.deepStrictEqual(fb.map((c) => c.key), ["visual_fields", "oct_imaging", "history_taking"], "fallback: unique sets from loaded cases, first-seen order");
assert.deepStrictEqual(fb.map((c) => c.label), ["Visual Field Testing", "OCT Imaging", "History Taking"], "fallback uses set_label");
assert.strictEqual(fb[0].total, undefined, "fallback chips carry no counts");
// Empty topics array is treated the same as a failed fetch.
assert.strictEqual(topicChips([], CASES).length, 3, "empty api array → fallback to cases");
// Label defaults to the key when set_label is missing.
assert.deepStrictEqual(topicChips(null, [{ set_key: "screening" }]).map((c) => c.label), ["screening"], "fallback label defaults to key");

console.log("caseFilter_logic: all assertions passed");

// ── journeySections — completed patients sink to the bottom (2026-08-06) ──────
// User-directed: "when student finish the virtual patient case, make sure that it is
// listed at the bottom/last with a tick badge and grey off … make sure student does not
// access the completed cases unless they scroll out of their way".
const TIERS3 = [
  { key: "beginner", label: "Foundational", hint: "" },
  { key: "intermediate", label: "Developing", hint: "" },
  { key: "advanced", label: "Advanced", hint: "" },
];
const mk = (case_id, difficulty, extra = {}) => ({ case_id, difficulty, ...extra });

{
  const secs = journeySections([
    mk("a", "beginner"),
    mk("b", "beginner", { completed: true }),
    mk("c", "advanced", { completed: true }),
    mk("d", "advanced"),
  ], TIERS3);
  // The completed section is LAST, whatever tier its patients came from.
  assert.strictEqual(secs[secs.length - 1].key, "completed", "completed section sorts last");
  assert.strictEqual(secs[secs.length - 1].done, true);
  assert.deepStrictEqual(secs[secs.length - 1].items.map((c) => c.case_id), ["b", "c"]);
  // …and they are pulled OUT of their difficulty tiers, not greyed in place.
  const tierIds = secs.filter((s) => s.key !== "completed").flatMap((s) => s.items.map((c) => c.case_id));
  assert.deepStrictEqual(tierIds, ["a", "d"], "a completed patient must not also sit in its tier");
}

{
  // Nothing completed → no completed section at all (no empty header).
  const secs = journeySections([mk("a", "beginner")], TIERS3);
  assert.ok(!secs.some((s) => s.key === "completed"), "no completed patients → no section");
}

{
  // Nothing is ever dropped: an unknown tier still lands in "More patients", and the
  // completed section comes after even that.
  const secs = journeySections([
    mk("a", "beginner"),
    mk("x", "mystery"),
    mk("b", "beginner", { completed: true }),
  ], TIERS3);
  assert.deepStrictEqual(secs.map((s) => s.key), ["beginner", "more", "completed"]);
  const all = secs.flatMap((s) => s.items.map((c) => c.case_id)).sort();
  assert.deepStrictEqual(all, ["a", "b", "x"], "no patient may be lost by the regrouping");
}

{
  // A LOCKED patient is never "completed" — it has not been passed, and sinking it would
  // hide the prerequisite the student is supposed to see.
  const secs = journeySections([mk("l", "advanced", { locked: true, completed: true })], TIERS3);
  assert.ok(!secs.some((s) => s.key === "completed"), "locked beats completed");
  assert.strictEqual(secs[0].items[0].case_id, "l");
}


// ── searchCases — the way in when there are 101 patients and 12 chips ─────────
// The selection screen had no text input at all, and the command palette only filters
// static nav destinations. An OA student's whole library was reachable only by an eye
// plate and a chip strip that shows three or four of its twelve chips.
{
  const LIB = [
    { case_id: "c1", title: "Splashed at the Workshop", topic: "chemical_injury_irrigation",
      set_label: "Triage & Emergencies",
      patient: { name: "Mr Rahim", presenting_complaint: "chemical splash to both eyes" } },
    { case_id: "c2", title: "A Curtain Coming Down", topic: "retinal_detachment_symptoms",
      set_label: "Triage & Emergencies",
      patient: { name: "Mdm Goh", presenting_complaint: "shadow across the vision" } },
    { case_id: "c3", title: "Sticky Red Eyes", topic: "red_eye_conjunctivitis",
      set_label: "History Taking", patient: { name: "Mr Tan", presenting_complaint: "red, sticky eyes" } },
  ];
  const ids = (q) => searchCases(LIB, q).map((c) => c.case_id);

  // A blank query is a NO-OP and returns the same reference, so a memoised caller is free
  // to run it unconditionally.
  assert.strictEqual(searchCases(LIB, ""), LIB);
  assert.strictEqual(searchCases(LIB, "   "), LIB);

  assert.deepStrictEqual(ids("curtain"), ["c2"], "title");
  assert.deepStrictEqual(ids("Mdm Goh"), ["c2"], "patient name");
  assert.deepStrictEqual(ids("splash"), ["c1"], "presenting complaint");
  assert.deepStrictEqual(ids("history taking"), ["c3"], "set label");

  // A topic SLUG is searchable in the words a student would actually type: underscores and
  // hyphens are spaces, so "red eye" finds `red_eye_conjunctivitis`.
  assert.deepStrictEqual(ids("red eye"), ["c3"], "underscores read as spaces");
  assert.deepStrictEqual(ids("RED EYE"), ["c3"], "case-insensitive");

  // Terms are ANDed — typing more must NARROW, never widen.
  assert.deepStrictEqual(ids("triage"), ["c1", "c2"]);
  assert.deepStrictEqual(ids("triage curtain"), ["c2"]);
  assert.deepStrictEqual(ids("triage nonsense"), []);

  // A miss is an empty list, not a crash or the whole library.
  assert.deepStrictEqual(ids("zzzzz"), []);

  // Missing optional fields must not throw — /api/cases omits `patient` on some payloads.
  assert.deepStrictEqual(
    searchCases([{ case_id: "x", title: "Bare", topic: "t" }], "bare").map((c) => c.case_id),
    ["x"], "a case with no patient block is still searchable");
}

console.log("caseFilter_logic: search assertions passed");
