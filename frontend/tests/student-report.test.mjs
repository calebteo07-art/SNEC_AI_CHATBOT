/**
 * The rebuilt student report (P2 §7.1). Run with Node's type stripping:
 *   node --experimental-strip-types frontend/tests/student-report.test.mjs
 *
 * Asserts the document makes CLAIMS and states honest absences as words. Every check here
 * is about meaning, not markup — a test that pins class names would break on any restyle
 * and catch none of the defects that matter.
 */
import assert from "node:assert";
import { buildStudentReportHtml } from "../src/aurora/lib/studentReportExport.ts";

const cell = (value, n, band) => ({ value, n, band });
const EMPTY_INSIGHT = {
  topics: [], contrasts: [],
  markLoss: { lost: { checklist: 0, consult: 0, judgement: 0 }, totalLost: 0,
              shares: { checklist: 0, consult: 0, judgement: 0 }, attempts: 0, excludedLegacy: 0 },
  offenders: [], criticalOffenders: [],
  osceTrajectory: { band: "insufficient", delta: null, n: 0, needed: 4, firstMean: null, secondMean: null },
  flashcardTrajectory: { band: "insufficient", delta: null, n: 0, needed: 20, firstMean: null, secondMean: null },
  consultations: [], excluded: { unmappedCase: 0, unscored: 0 },
};

const base = (over = {}) => ({
  meta: { studentId: "stu_x", fullName: "Alice Tan", email: "a@t.com", role: "OA", dateStr: "2026-08-06" },
  insight: EMPTY_INSIGHT,
  attempts: [],
  note: "",
  ...over,
});

// 1 — identity and escaping
{
  const html = buildStudentReportHtml(base({ meta: { studentId: "s", fullName: "<script>x</script>", email: "e", role: "OA", dateStr: "d" } }));
  assert.ok(!/<script>x<\/script>/.test(html), "free text must be escaped");
  assert.ok(/&lt;script&gt;/.test(html), "and escaped visibly");
}

// 2 — a brand-new student gets words, never zeros
{
  const html = buildStudentReportHtml(base());
  assert.ok(/No stations attempted/i.test(html), "must say so in words");
  assert.ok(!/>0%</.test(html), `a bare 0% must never appear for missing data: ${html.match(/.{0,60}>0%<.{0,60}/) ?? ""}`);
}

// 3 — the trajectory states its own threshold rather than going quiet
{
  const html = buildStudentReportHtml(base({
    insight: { ...EMPTY_INSIGHT, osceTrajectory: { band: "insufficient", delta: null, n: 2, needed: 4, firstMean: null, secondMean: null } },
  }));
  assert.ok(/2 so far/.test(html) && /4 needed/.test(html),
    "an insufficient trajectory must state both counts");
}

// 4 — the map renders a flagged cell with a word, not just colour
{
  const html = buildStudentReportHtml(base({
    insight: { ...EMPTY_INSIGHT, topics: [{ topic: "tonometry", flag: "knows_cant_do",
      flashcards: cell(92, 20, "strong"), station: cell(41, 5, "weak"), retention: cell(88, 1, "strong") }] },
  }));
  assert.ok(/tonometry/i.test(html));
  assert.ok(/known but not performable/i.test(html), "the flag must be explained in prose");
}

// 5 — a thin cell shows its n and is not banded as if it were solid
{
  const html = buildStudentReportHtml(base({
    insight: { ...EMPTY_INSIGHT, topics: [{ topic: "gonioscopy", flag: "",
      flashcards: cell(100, 2, "thin"), station: cell(0, 0, "thin"), retention: cell(0, 0, "thin") }] },
  }));
  assert.ok(/n\s*=\s*2/.test(html), "a thin cell must carry its count");
}

// 6 — a null cohort baseline says so; it never prints 0
{
  const html = buildStudentReportHtml(base({
    insight: { ...EMPTY_INSIGHT, contrasts: [{ topic: "gonioscopy", axis: "station", student: 40, cohortMean: null, peers: 1, label: "" }] },
  }));
  assert.ok(/No cohort baseline/i.test(html), "must name the absence");
  assert.ok(/1 peer/.test(html), "and say how many peers it had");
}

// 7 — an unrecorded consultation label is words, not blank
{
  const html = buildStudentReportHtml(base({
    insight: { ...EMPTY_INSIGHT, consultations: [{ label: "", count: 4, lastSeen: "2026-08-01", derived: false }] },
  }));
  assert.ok(/Topic not recorded/i.test(html));
  assert.ok(/4/.test(html), "the count is still real and still shown");
}

// 8 — a derived label is marked as inferred, so a trainer knows not to fully trust it
{
  const html = buildStudentReportHtml(base({
    insight: { ...EMPTY_INSIGHT, consultations: [{ label: "gonioscopy", count: 2, lastSeen: "2026-08-01", derived: true }] },
  }));
  assert.ok(/inferred/i.test(html), "a derived label must be flagged as inferred");
}

// 9 — all-legacy attempts are called out, not silently blended
{
  const html = buildStudentReportHtml(base({
    insight: { ...EMPTY_INSIGHT, markLoss: { lost: { checklist: 0, consult: 0, judgement: 0 }, totalLost: 0,
      shares: { checklist: 0, consult: 0, judgement: 0 }, attempts: 0, excludedLegacy: 6 } },
  }));
  assert.ok(/retired/i.test(html) && /6/.test(html),
    "6 legacy attempts must be named as not comparable");
}

// 10 — findings lead the document
{
  const html = buildStudentReportHtml(base({
    insight: { ...EMPTY_INSIGHT, criticalOffenders: [{ action: "Perform hand hygiene.", missed: 3, critical: true, appeared: null }] },
  }));
  const findingsAt = html.indexOf("Perform hand hygiene.");
  const mapAt = html.search(/Knowledge\s*(&amp;|×|x)\s*performance/i);
  // Both anchors must EXIST before their order means anything. An earlier version tolerated
  // `mapAt < 0`, so a renamed heading silently disabled the check instead of failing it —
  // the assertion passed while comparing nothing.
  assert.ok(mapAt > 0, "the map heading must be found, or this test proves nothing");
  assert.ok(findingsAt > 0 && findingsAt < mapAt,
    "the ranked findings must appear before the tables");
}

// 11 — an empty `attempts` array is not proof the student attempted nothing. The console
//      fetches it separately and falls back to [] when that fails, so the document must
//      distinguish "none" from "not loaded" — mark_loss counted them either way.
{
  const counted = { ...EMPTY_INSIGHT, markLoss: { ...EMPTY_INSIGHT.markLoss, attempts: 4, excludedLegacy: 2 } };
  const html = buildStudentReportHtml(base({ insight: counted, attempts: [] }));
  assert.ok(!/No stations attempted\./.test(html),
    "6 counted attempts must never be reported as none attempted");
  assert.ok(/could not be loaded/i.test(html), "…and the document must say why they are not listed");
}

console.log("PASS student-report");
