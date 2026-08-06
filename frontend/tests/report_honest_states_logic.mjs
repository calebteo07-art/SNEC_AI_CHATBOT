/**
 * Spec §8, both documents: "A zero is never printed where the truth is 'not measured'."
 *
 * P1 shipped this defect FIVE times (a 0.0 cohort baseline, a dropped whitespace tag, a
 * NULL/[] conflation, a reversed sort, and two offender denominators). It is the failure
 * mode of this feature, so it gets its own sweep rather than living as scattered asserts.
 *
 * Every assertion here anchors FIRST on the thing it needs to find, as its own line. An
 * assertion that quietly tolerates a missing anchor stops being a test the moment something
 * is renamed, and passes forever after — which is how a defect class survives five fixes.
 *
 * Run with Node's type stripping:
 *   node --experimental-strip-types frontend/tests/report_honest_states_logic.mjs
 */
import assert from "node:assert";
import { buildStudentReportHtml } from "../src/aurora/lib/studentReportExport.ts";
import { buildOsceDossierHtml } from "../src/aurora/lib/osceDossierExport.ts";

const EMPTY_INSIGHT = {
  topics: [], contrasts: [],
  markLoss: { lost: { checklist: 0, consult: 0, judgement: 0 }, totalLost: 0,
              shares: { checklist: 0, consult: 0, judgement: 0 }, attempts: 0, excludedLegacy: 0 },
  offenders: [], criticalOffenders: [],
  osceTrajectory: { band: "insufficient", delta: null, n: 0, needed: 4, firstMean: null, secondMean: null },
  flashcardTrajectory: { band: "insufficient", delta: null, n: 0, needed: 20, firstMean: null, secondMean: null },
  consultations: [], excluded: { unmappedCase: 0, unscored: 0 },
};
const meta = { studentId: "s", fullName: "A", email: "e", role: "OA", dateStr: "d" };
const ins = (over) => ({ ...EMPTY_INSIGHT, ...over });
const marks = (over) => ({ ...EMPTY_INSIGHT.markLoss, ...over });

const attempt = (over = {}) => ({
  caseId: "case_tonometry_01", completedAt: "2026-08-01T00:00:00Z", totalScore: 29, passed: true,
  score100: 72, safe: true, checklistCoverage: 30, consultTechnique: 22, judgementSafety: 20,
  gradeScale: 2, missedCritical: [], coaching: null, checklistDetail: null, ...over,
});

const REPORT = "student report";
const DOSSIER = "OSCE dossier";
const BOTH = [REPORT, DOSSIER];

/** Both documents from one payload, keyed by name so a failure says which one broke. */
function both(insight, attempts = []) {
  return {
    [REPORT]: buildStudentReportHtml({ meta, insight, attempts, note: "" }),
    [DOSSIER]: buildOsceDossierHtml({ meta, insight, attempts }),
  };
}

// Anchor for everything below: `both` must really return TWO documents. Point both keys at
// one builder by accident and every cross-document assertion here still passes, having
// checked the same document twice.
{
  const built = both(ins({}), []);
  assert.ok(/Student report/i.test(built[REPORT]), "the student report must identify itself");
  assert.ok(/OSCE dossier/i.test(built[DOSSIER]), "the OSCE dossier must identify itself");
}

/* §8's table, row by row, against the documents that own the section. A row lists only the
   documents REQUIRED to state it: the dossier carries no cohort or tutor section, and the
   report carries no per-attempt ledger prose, so demanding every state of every document
   would force one of them to print a section it has no business printing. */
const CASES = [
  ["no attempts at all",
    ins({}), [], /No stations attempted/i, BOTH],

  ["attempts, all on the retired ×50 scale",
    ins({ markLoss: marks({ excludedLegacy: 6 }) }), [], /6 attempts, all on the retired/i, BOTH],

  ["the per-step ledger was never recorded",
    ins({ markLoss: marks({ attempts: 1 }) }), [attempt({ checklistDetail: null })], /not recorded/i, BOTH],

  ["fewer than four attempts, so no trend",
    ins({ osceTrajectory: { band: "insufficient", delta: null, n: 2, needed: 4, firstMean: null, secondMean: null } }),
    [], /\(2 so far, 4 needed\)/, BOTH],

  ["no marks lost",
    ins({ markLoss: marks({ attempts: 5 }) }), [], /No marks lost across 5 attempts/i, BOTH],

  ["fewer than three peers, so no cohort baseline",
    ins({ contrasts: [{ topic: "t", axis: "station", student: 40, cohortMean: null, peers: 1, label: "" }] }),
    [], /No cohort baseline for this topic \(1 peer with data\)/i, [REPORT]],

  ["the tutor label could not be derived",
    ins({ consultations: [{ label: "", count: 4, lastSeen: "2026-08-01", derived: false }] }),
    [], /Topic not recorded/i, [REPORT]],
];

for (const [name, insight, attempts, expect, docs] of CASES) {
  const built = both(insight, attempts);
  for (const doc of docs) {
    assert.ok(expect.test(built[doc]), `the ${doc} must state: ${name}`);
  }
}

/* §8 row 4: flashcards n < 5 on a topic — the value, marked thin, with its n. Only the
   student report carries the knowledge × performance map. */
{
  const thin = ins({ topics: [{ topic: "gonioscopy", flag: "",
    flashcards: { value: 100, n: 2, band: "thin" },
    station: { value: 0, n: 0, band: "thin" },
    retention: { value: 0, n: 0, band: "thin" } }] });
  const report = both(thin, [])[REPORT];
  assert.ok(/gonioscopy/i.test(report), "anchor: the thin topic must reach the map at all");
  assert.ok(/n\s*=\s*2[^)]*thin/i.test(report),
    "a thin cell must carry its n AND be named thin — 100% off two cards is not 100%");
}

/* §8 row 7, student outside the cohort, is NOT asserted here: it is the console's existing
   `mastery: null` treatment (the whole section omitted), which lives in AdminStudentDetail
   and never reaches either builder. Stated rather than faked with a passing assertion. */

/* Not in §8's table, but the same defect and newer than it: `attempts` is fetched separately
   from `insight`, and the console falls back to [] when that fetch fails. So [] is NOT proof
   the student attempted nothing — mark_loss counted every row either way, and both documents
   must use that evidence rather than assert a student did nothing. */
{
  const counted = ins({ markLoss: marks({ attempts: 4, excludedLegacy: 2 }) });
  const built = both(counted, []);
  for (const doc of BOTH) {
    assert.ok(/6 station attempts are counted/.test(built[doc]),
      `the ${doc} must name the 6 attempts it knows about`);
    assert.ok(!/No stations attempted/i.test(built[doc]),
      `…and the ${doc} must never report those 6 as none attempted`);
  }
}

/* The blanket rule. With NOTHING recorded, neither document may print a bare 0 or 0%. */
for (const doc of BOTH) {
  const html = both(ins({}), [])[doc];
  const stripped = html.replace(/<style>[\s\S]*?<\/style>/g, "");
  // Anchor first: a real document, whose stylesheet really was found and removed. Without
  // this, an empty or malformed build satisfies the negative check below by having nothing
  // in it at all.
  assert.ok(stripped.includes("</body>") && stripped !== html,
    `${doc}: expected a rendered document with a stylesheet to strip`);
  assert.ok(!/>\s*0\s*%?\s*</.test(stripped),
    `a bare zero leaked into the empty ${doc}: ${stripped.match(/.{0,80}>\s*0\s*%?\s*<.{0,80}/)?.[0] ?? ""}`);
}

console.log("PASS report_honest_states_logic");
