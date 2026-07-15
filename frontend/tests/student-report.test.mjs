/* Pure unit test for the per-student analytics report export. Run with Node's type
   stripping (studentReportExport.ts is dependency-free, mirrors session_export_logic.mjs):
     node --experimental-strip-types frontend/tests/student-report.test.mjs

   buildStudentReportHtml turns already-loaded per-student analytics data into ONE
   self-contained, print-friendly, fully HTML-escaped document. */
import assert from "node:assert";
import { buildStudentReportHtml } from "../src/aurora/lib/studentReportExport.ts";

const data = {
  meta: {
    studentId: "abcd1234ef567890", fullName: "Test Student", email: "test@snec.edu",
    role: "OA", dateStr: "2026-07-13 14:30",
  },
  vitals: {
    sessions: 42, streak: 5, lastActive: "2026-07-12", velocity: "steady",
    cases: 3, tokens: "12.4k",
  },
  topics: [
    { topic: "glaucoma", retentionPct: 82, flashcardPct: 74, cohortPct: 68 },
    { topic: "refraction", retentionPct: 55, flashcardPct: null, cohortPct: null },
  ],
  osce: [
    { caseId: "C001", totalScore: 32, scoreMax: 40, passed: true, score100: 80, safe: true, missedCritical: [], dateStr: "2026-07-10" },
    { caseId: "C002", totalScore: 18, scoreMax: 40, passed: false, score100: 45, safe: false, missedCritical: ["Did not check IOP"], dateStr: "2026-07-11" },
  ],
  weakTopics: ["refraction"],
  missedFindings: ["Allergy status not confirmed"],
  note: "Good progress overall.",
  activity: [{ dateStr: "2026-07-12", topic: "Glaucoma" }],
  findings: [
    { feature: "AI Tutor", text: "5 tutor conversation(s); recent focus: glaucoma." },
    { feature: "Flashcards", text: "74% accuracy over 40 card(s); weakest: refraction." },
    { feature: "Virtual Patients", text: "2 station(s), 1 passed, avg 62/100; 1 unsafe run(s)." },
  ],
  narrative: "Reinforce refraction fundamentals and safety-critical IOP checks.",
};

const html = buildStudentReportHtml(data);

// 1) A complete, standalone HTML document.
assert.ok(typeof html === "string", "must return a string");
assert.ok(html.trim().toLowerCase().startsWith("<!doctype html>"), "must start with <!doctype html>");
assert.ok(/<\/html>\s*$/i.test(html.trim()), "must close the html document");

// 2) Fully self-contained — no external resources of any kind.
assert.ok(!/\b(src|href)\s*=\s*["']https?:/i.test(html), "must not reference external http(s) src/href");
assert.ok(!/<link\b/i.test(html), "must not use <link> to external stylesheets");
assert.ok(!/<script\b[^>]*\bsrc\b/i.test(html), "must not load external scripts");

// 3) Title + identity + vitals + topics + OSCE render.
assert.ok(html.includes("EyeBot — Student Report — Test Student"), "missing report <title>");
for (const bit of ["Test Student", "test@snec.edu", "glaucoma", "refraction", "82%", "C001", "Did not check IOP", "Good progress overall."]) {
  assert.ok(html.includes(bit), `content missing: ${bit}`);
}

// 4) The @media print rules are present (print → Save as PDF).
assert.ok(/@media\s+print/i.test(html), "missing @media print block");
assert.ok(html.includes("break-inside"), "missing break-inside print rule");

// 4b) Cross-feature findings + AI narrative + the OSCE→Virtual-patient rename all render.
for (const bit of ["Findings &amp; insights", "AI Tutor", "Flashcards", "Virtual Patients",
                   "Reinforce refraction fundamentals", "Virtual-patient results"]) {
  assert.ok(html.includes(bit), `insights content missing: ${bit}`);
}
assert.ok(!html.includes("OSCE results"), "must rename OSCE → Virtual-patient results");

// 5) HTML-escaping: injected markup in the free-text note must be neutralised.
const hostile = buildStudentReportHtml({ ...data, note: "<script>alert(1)</script> & <b>x</b>" });
assert.ok(hostile.includes("&lt;script&gt;"), "must escape angle brackets in the note");
assert.ok(hostile.includes("&amp;"), "must escape ampersands in the note");
assert.ok(!hostile.includes("<script>alert(1)</script>"), "must not emit a raw script tag");

console.log("student-report.test: all assertions passed");
