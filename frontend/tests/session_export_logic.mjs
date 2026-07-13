/* Pure unit test for the one-time OSCE session export. Run with Node's type stripping
   (sessionExport.ts is dependency-free, mirrors flashcards_forfeit_logic.mjs):
     node --experimental-strip-types frontend/tests/session_export_logic.mjs

   buildSessionHtml turns the finished session (grade, AI summary, checklist, both
   transcripts) into ONE self-contained, print-friendly, HTML-escaped document. */
import assert from "node:assert";
import { buildSessionHtml } from "../src/aurora/lib/sessionExport.ts";

const data = {
  meta: {
    caseId: "C001", caseTitle: "Routine glaucoma follow-up", patientName: "Mr Rajasekaran",
    patientAge: 55, topic: "Glaucoma", difficulty: "intermediate",
    studentName: "Test Student", dateStr: "2026-07-13 14:30",
  },
  score: {
    score100: 78, verdict: "Solid", safe: true, missedCritical: [],
    consult: 40, consultMax: 50, judgement: 38, judgementMax: 50,
  },
  summary: {
    highlights: ["Confirmed identity early"],
    didWrong: ["Skipped the second IOP reading"],
    missed: ["Did not check allergy status"],
    focus: "Always record a baseline acuity first.",
  },
  checklist: [
    { phase: "Preparation", action: "Identify patient — name + NRIC", critical: true, done: true },
    { phase: "Assessment", action: "Measure IOP", critical: true, done: false },
  ],
  patientTranscript: [
    { who: "Student", text: "Good morning, can I confirm your name?" },
    { who: "Mr Rajasekaran", text: "I'm here for my review." },
  ],
  actionTranscript: [
    { who: "You", text: "Examination performed · Measure IOP · Result: R 18 mmHg" },
  ],
};

const html = buildSessionHtml(data);

// 1) A complete, standalone HTML document.
assert.ok(typeof html === "string" && html.toLowerCase().includes("<!doctype html>"), "must be a full HTML doc");
assert.ok(/<\/html>\s*$/i.test(html.trim()), "must close the html document");

// 2) Header / meta present.
for (const bit of ["Routine glaucoma follow-up", "Mr Rajasekaran", "Glaucoma", "Test Student", "2026-07-13 14:30"]) {
  assert.ok(html.includes(bit), `meta missing: ${bit}`);
}

// 3) Grade block: score /100, verdict, both scheme labels + values.
assert.ok(html.includes("78") && html.includes("/100"), "missing score /100");
assert.ok(html.includes("Solid"), "missing verdict");
assert.ok(html.includes("Consultation &amp; Technique") || html.includes("Consultation & Technique"), "missing scheme 1 label");
assert.ok(/40\s*\/\s*50/.test(html), "missing scheme 1 value /50");
assert.ok(/38\s*\/\s*50/.test(html), "missing scheme 2 value /50");

// 4) AI summary points all render.
for (const bit of ["Confirmed identity early", "Skipped the second IOP reading", "Did not check allergy status", "Always record a baseline acuity first."]) {
  assert.ok(html.includes(bit), `summary missing: ${bit}`);
}

// 5) Checklist rows with done/not-done markers + the actions.
assert.ok(html.includes("Identify patient — name + NRIC"), "missing done step");
assert.ok(html.includes("Measure IOP"), "missing not-done step");

// 6) Both transcripts render their content.
assert.ok(html.includes("Good morning, can I confirm your name?"), "missing patient transcript");
assert.ok(html.includes("Examination performed · Measure IOP · Result: R 18 mmHg"), "missing action transcript");

// 7) HTML-escaping: hostile content must be neutralised, never emitted raw.
const hostile = buildSessionHtml({
  ...data,
  patientTranscript: [{ who: "Student", text: "<script>alert(1)</script>" }],
});
assert.ok(hostile.includes("&lt;script&gt;"), "must escape angle brackets");
assert.ok(!hostile.includes("<script>alert(1)</script>"), "must not emit a raw script tag");

console.log("session_export_logic: all assertions passed");
