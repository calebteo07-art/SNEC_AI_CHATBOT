/* Pure unit test for the one-time OSCE session export. Run with Node's type stripping
   (sessionExport.ts is dependency-free, mirrors flashcards_forfeit_logic.mjs):
     node --experimental-strip-types frontend/tests/session_export_logic.mjs

   buildSessionHtml turns the finished session (grade, pace, AI summary, checklist, both
   transcripts) into ONE self-contained, print-friendly, HTML-escaped document.

   Reported 2026-08-04: a student who performed 15 of 16 steps was told they had completed
   every step, with an empty "Missed or lacking" column. The report is a record — it may not
   assert what its own ledger contradicts, and it may not go quiet on the one column the
   student came for. Both are pinned below. */
import assert from "node:assert";
import { buildSessionHtml } from "../src/aurora/lib/sessionExport.ts";
import { paceRead } from "../src/aurora/lib/stationTimer.ts";

const MIN = 60_000;

/* 16 steps: 14 done, 1 given up on, 1 never reached — the reported 15-of-16 shape, with
   both kinds of failure present so they can be told apart. */
const checklist = [
  ...Array.from({ length: 14 }, (_, i) => ({
    phase: i < 5 ? "Preparation & Identification" : "Clinical Assessment",
    action: `Step ${i + 1} — a real checklist action`,
    critical: i === 0,
    done: true,
  })),
  { phase: "Clinical Assessment", action: "Measure IOP with the non-contact tonometer",
    critical: true, done: false, skipped: true },
  { phase: "Documentation & Follow-up", action: "Record the readings in the patient record",
    critical: false, done: false },
];

const data = {
  meta: {
    caseId: "C001", caseTitle: "Routine glaucoma follow-up", patientName: "Mr Rajasekaran",
    patientAge: 55, topic: "Glaucoma", difficulty: "intermediate",
    studentName: "Test Student", dateStr: "2026-07-13 14:30",
  },
  // The pace RULE lives in stationTimer; the caller computes it and the report renders it,
  // so the debrief and the download can never disagree about what the clock meant.
  pace: paceRead(8 * MIN + 42_000, 10, 14, 16),
  score: {
    score100: 78, verdict: "Solid", safe: true, missedCritical: [],
    buckets: [
      { label: "Consultation & Technique", pts: 40, max: 50,
        sub: "History-taking and how well you performed the examination(s)",
        parts: [{ label: "History-taking", pts: 8, max: 10 }],
        notes: ["Asked onset and laterality early."] },
      { label: "Clinical Judgement & Safety", pts: 38, max: 50,
        sub: "Spotting the problem, triage, escalation & handover",
        parts: [{ label: "Recognition", pts: 8, max: 10 }] },
    ],
  },
  summary: {
    highlights: ["Confirmed identity early"],
    didWrong: ["Skipped the second IOP reading"],
    missed: ["Did not check allergy status"],
    focus: "Always record a baseline acuity first.",
  },
  checklist,
  patientTranscript: [
    { who: "Student", text: "Good morning, can I confirm your name?" },
    { who: "Mr Rajasekaran", text: "I'm here for my review." },
  ],
  actionTranscript: [
    { who: "You", text: "Examination performed · Measure IOP · Result: R 18 mmHg" },
  ],
};

const html = buildSessionHtml(data);

// ── 1) A complete, standalone, printable document.
assert.ok(typeof html === "string" && html.toLowerCase().includes("<!doctype html>"), "must be a full HTML doc");
assert.ok(/<\/html>\s*$/i.test(html.trim()), "must close the html document");
assert.ok(html.includes("@page"), "a report you print to PDF needs a page box");
assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(html.replace(/&[a-z]+;/g, "")),
  "self-contained: no external asset may be fetched when the file is opened offline");

// ── 2) Header / meta present.
for (const bit of ["Routine glaucoma follow-up", "Mr Rajasekaran", "Glaucoma", "Test Student", "2026-07-13 14:30"]) {
  assert.ok(html.includes(bit), `meta missing: ${bit}`);
}

// ── 3) The ledger states the truth, in the report's most prominent block. This is what the
//       AI prose is checked against — and what the student reads first.
const ledger = html.match(/data-testid="ledger-checklist"[\s\S]*?<\/div>/)?.[0] ?? "";
assert.ok(ledger, "the at-a-glance ledger must carry a checklist tile");
assert.ok(ledger.includes("14") && ledger.includes("16"),
  `the ledger must state performed-of-total, got: ${ledger}`);
assert.ok(/2\b/.test(ledger), "the ledger must name the shortfall, not just the total");

// ── 4) The grade renders whatever buckets it is given — the scheme is the backend's to
//       change (two /50 today, three 40/30/30 in flight), and the report must not hardcode it.
assert.ok(html.includes("78") && html.includes("/100"), "missing score /100");
assert.ok(html.includes("Solid"), "missing verdict");
assert.ok(html.includes("Consultation &amp; Technique") || html.includes("Consultation & Technique"), "missing bucket 1");
assert.ok(/40\s*<small>\s*\/\s*50/.test(html) || /40\s*\/\s*50/.test(html), "missing bucket 1 value");
assert.ok(/38\s*\/\s*50/.test(html), "missing bucket 2 value");
assert.ok(html.includes("History-taking 8/10"), "the sub-score maths must be traceable");
assert.ok(html.includes("Asked onset and laterality early."), "the examiner's own notes belong in the record");

const three = buildSessionHtml({
  ...data,
  score: {
    ...data.score,
    buckets: [
      { label: "Checklist coverage", pts: 34, max: 40 },
      { label: "Consultation & Technique", pts: 22, max: 30 },
      { label: "Clinical Judgement & Safety", pts: 22, max: 30, capReason: "×0.6 safety cap" },
    ],
  },
});
assert.ok(three.includes("Checklist coverage") && /34\s*\/\s*40|34<small>\s*\/\s*40/.test(three.replace(/\s+/g, " ")),
  "a third bucket must render without a code change");
assert.ok(three.includes("×0.6 safety cap"), "a cap that fired must be explained where it fired");

// ── 5) THE REPORTED BUG. 14 of 16 performed: nothing in the document may read as full
//       coverage, whatever the coach block was handed.
assert.ok(!/\b(all|every|each)\s+(the\s+)?(\w+\s+){0,2}(checklist\s+)?steps?\b(?![^<]*outstanding)/i.test(
  html.replace(/<style[\s\S]*?<\/style>/i, "")),
  "an unfinished station must never read as a completed checklist");
assert.ok(!html.includes("not scored"),
  "the report must not assert how the checklist is weighted — the grade owns that");

// ── 6) Every not-done step is red + '!' — given up on or never reached alike (user-directed
//       2026-08-04). Colour is never the only carrier: the glyph survives a mono print.
const rows = [...html.matchAll(/<tr[^>]*data-done="false"[^>]*>[\s\S]*?<\/tr>/g)].map((m) => m[0]);
assert.strictEqual(rows.length, 2, "both not-done steps must be marked, not just the skipped one");
for (const row of rows) {
  assert.ok(row.includes("!"), `a not-done row must carry the '!' glyph: ${row}`);
  assert.ok(/class="[^"]*\bno\b/.test(row), "a not-done row must carry the alarm class");
}
const skippedRow = rows.find((r) => r.includes('data-skipped="true"'));
assert.ok(skippedRow, "a step the student gave up on must be identifiable as such");
assert.match(skippedRow, /unable to complete/i, "…and say so in words, not colour alone");
assert.ok(rows.some((r) => !r.includes('data-skipped="true"')), "a never-reached step is still a miss");

// ── 7) "Missed or lacking" is never empty. An empty column reads as "nothing was missing",
//       which is the same false reassurance as the completion claim.
const blank = buildSessionHtml({
  ...data,
  summary: { ...data.summary, missed: [] },
});
assert.ok(!blank.includes("— none —"),
  "the column the student came for must never be blank — derive a line from the ledger");
assert.match(blank, /2 steps left outstanding/,
  "the derived line must be grounded in the actual shortfall");
assert.match(blank, /fastest marks to recover/,
  "…and say what the shortfall MEANS, not re-list the rows the ledger already prints");
for (const s of checklist) {
  if (!s.done) {
    const miss = blank.split('class="col miss"')[1]?.split("</div>")[0] ?? "";
    assert.ok(!miss.includes(s.action), `a bare checklist row is not an insight: ${s.action}`);
  }
}

// Full coverage has a different honest answer — depth, not breadth. Still never blank.
const clean = buildSessionHtml({
  ...data,
  summary: { ...data.summary, missed: [] },
  checklist: checklist.map((s) => ({ ...s, done: true, skipped: false })),
});
assert.ok(!clean.includes("— none —"), "a perfect checklist still owes the student a gap to work on");
assert.match(clean, /depth, not breadth/, "with nothing undone, the gap is quality");

// ── 8) Pace: the elapsed time, and what it MEANT. A number alone is not feedback.
assert.ok(html.includes("8:42"), "the time taken must appear");
assert.ok(html.includes("10"), "the case's own guide must appear to compare against");
const pace = html.match(/data-testid="pace"[\s\S]*?<\/section>/)?.[0] ?? "";
assert.ok(pace, "the report needs a pace block");
assert.ok(pace.replace(/<[^>]+>/g, "").trim().length > 60, "pace must interpret the clock, not just print it");

// A case with no time guide must degrade to the bare elapsed time, never to a false verdict.
const noGuide = buildSessionHtml({ ...data, pace: paceRead(8 * MIN + 42_000, 0, 14, 16) });
assert.ok(noGuide.includes("8:42"), "elapsed still prints without a guide");
assert.ok(!/\bguide 0:00\b/.test(noGuide), "a case with no estimate must not invent one");

// ── 9) AI summary points all render.
for (const bit of ["Confirmed identity early", "Skipped the second IOP reading", "Did not check allergy status", "Always record a baseline acuity first."]) {
  assert.ok(html.includes(bit), `summary missing: ${bit}`);
}

// ── 10) Checklist rows and both transcripts carry their content.
assert.ok(html.includes("Measure IOP with the non-contact tonometer"), "missing skipped step");
assert.ok(html.includes("Record the readings in the patient record"), "missing not-reached step");
assert.ok(html.includes("Good morning, can I confirm your name?"), "missing patient transcript");
assert.ok(html.includes("Examination performed · Measure IOP · Result: R 18 mmHg"), "missing action transcript");

// ── 11) HTML-escaping: hostile content must be neutralised, never emitted raw.
const hostile = buildSessionHtml({
  ...data,
  patientTranscript: [{ who: "Student", text: "<script>alert(1)</script>" }],
});
assert.ok(hostile.includes("&lt;script&gt;"), "must escape angle brackets");
assert.ok(!hostile.includes("<script>alert(1)</script>"), "must not emit a raw script tag");

// ── 12) An empty appendix must say WHY it is empty, when the caller knows why. The student's
//        own save doesn't: their transcript really is the whole conversation, so "— no
//        messages —" is true there and that path stays byte-identical. A trainer-generated
//        per-attempt record is the opposite — chat_sessions retains no messages, only a
//        200-char summary — so the same dash would assert that nothing was said.
{
  const bare = { ...data, patientTranscript: [], actionTranscript: [] };

  const student = buildSessionHtml(bare);
  assert.ok(/— no messages —/.test(student),
    "the student's own save must be unchanged when no note is supplied");

  const trainer = buildSessionHtml({ ...bare, transcriptNote: "Transcript not retained for this attempt." });
  assert.ok(/Transcript not retained for this attempt\./.test(trainer),
    "a supplied note must explain WHY the appendix is empty");
  assert.ok(!/— no messages —/.test(trainer),
    "the note REPLACES the empty-list dash, which would assert nothing was said");
}

console.log("session_export_logic: all assertions passed");
