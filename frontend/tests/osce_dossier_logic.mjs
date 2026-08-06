/**
 * The OSCE dossier (P2 §7.2) — every attempt for one student in one document.
 *
 * Run with Node's type stripping:
 *   node --experimental-strip-types frontend/tests/osce_dossier_logic.mjs
 */
import assert from "node:assert";
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
const meta = { studentId: "stu_x", fullName: "Alice Tan", email: "a@t.com", role: "OA", dateStr: "2026-08-06" };

const attempt = (over = {}) => ({
  caseId: "c1", completedAt: "2026-08-01T00:00:00Z", totalScore: 29, passed: true,
  score100: 72, safe: true, checklistCoverage: 30, consultTechnique: 22, judgementSafety: 20,
  gradeScale: 2, missedCritical: [], coaching: null, checklistDetail: null, ...over,
});

// 1 — no attempts at all
{
  const html = buildOsceDossierHtml({ meta, insight: EMPTY_INSIGHT, attempts: [] });
  assert.ok(/No stations attempted/i.test(html));
}

// 2 — a NULL ledger says it was not recorded; it never renders an empty step table
{
  const html = buildOsceDossierHtml({ meta, insight: EMPTY_INSIGHT, attempts: [attempt()] });
  assert.ok(/Per-step ledger not recorded for this attempt/i.test(html));
}

// 3 — an EMPTY ledger is different from a missing one
{
  const html = buildOsceDossierHtml({ meta, insight: EMPTY_INSIGHT, attempts: [attempt({ checklistDetail: [] })] });
  assert.ok(/resolved no checklist steps/i.test(html),
    "[] means the case had no checklist, which is not the same as 'not recorded'");
  assert.ok(!/not recorded for this attempt/i.test(html));
}

// 4 — a real ledger renders every step with its state, and marks the critical ones
{
  const html = buildOsceDossierHtml({ meta, insight: EMPTY_INSIGHT, attempts: [attempt({
    checklistDetail: [
      { stepNumber: 1, action: "Perform hand hygiene.", phase: "Preparation", critical: true, performed: false, skipped: true },
      { stepNumber: 2, action: "Greet the patient.", phase: "Preparation", critical: false, performed: true, skipped: false },
    ] })] });
  assert.ok(/Perform hand hygiene\./.test(html) && /Greet the patient\./.test(html));
  assert.ok(/1 of 2/.test(html), "the per-attempt ledger must carry its own denominator");
}

// 5 — a legacy-scale attempt is labelled, never shown as if it were /100
{
  const html = buildOsceDossierHtml({ meta, insight: EMPTY_INSIGHT,
    attempts: [attempt({ score100: null, gradeScale: null, totalScore: 31 })] });
  assert.ok(/retired/i.test(html) || /legacy/i.test(html), "a pre-017 attempt must be marked");
  assert.ok(!/31\s*\/\s*100/.test(html), "and must not be printed on the current scale");
}

// 6 — escaping
{
  const html = buildOsceDossierHtml({ meta, insight: EMPTY_INSIGHT, attempts: [attempt({
    checklistDetail: [{ stepNumber: 1, action: "<img src=x onerror=1>", phase: "P", critical: false, performed: true, skipped: false }] })] });
  assert.ok(!/<img src=x/.test(html), "step text must be escaped");
}

// 7 — the safety record leads with critical misses
{
  const html = buildOsceDossierHtml({ meta,
    insight: { ...EMPTY_INSIGHT, criticalOffenders: [{ action: "Perform hand hygiene.", missed: 3, critical: true, appeared: null }] },
    attempts: [attempt()] });
  assert.ok(/Perform hand hygiene\./.test(html));
  assert.ok(!/\bof\s+\d+\s+attempts that included/.test(html),
    "a null denominator must not become a fraction");
}

// 8 — an EMPTY missedCritical is TWO different facts, and the era decides which.
//     migration 011 added missed_critical and score_100 in the same statement, and the
//     /attempts endpoint maps a NULL missed_critical to []. So on a pre-011 row the empty
//     list means "no record", and printing nothing there would read as "none missed".
{
  const current = buildOsceDossierHtml({ meta, insight: EMPTY_INSIGHT,
    attempts: [attempt({ missedCritical: [] })] });
  assert.ok(/No critical steps missed/i.test(current),
    "a current-era attempt with an empty list genuinely missed none, and must say so");

  const pre011 = buildOsceDossierHtml({ meta, insight: EMPTY_INSIGHT,
    attempts: [attempt({ score100: null, gradeScale: null, missedCritical: [] })] });
  assert.ok(/Critical-step record not kept/i.test(pre011),
    "a pre-011 attempt has no critical-step record, and the absence must be stated in words");
  assert.ok(!/No critical steps missed/i.test(pre011),
    "…and it must never be reported as none missed");
}

// 9 — an empty `attempts` array is not proof the student attempted nothing. The console
//     fetches it separately and falls back to [] when that fails, so the dossier — whose
//     whole body is per-attempt sections — must distinguish "none" from "not loaded".
//     mark_loss counted every row either way: attempts + excludedLegacy is the total.
{
  const counted = { ...EMPTY_INSIGHT,
    markLoss: { ...EMPTY_INSIGHT.markLoss, attempts: 4, excludedLegacy: 2 } };
  const html = buildOsceDossierHtml({ meta, insight: counted, attempts: [] });
  assert.ok(/could not be loaded/i.test(html),
    "6 counted attempts with no detail must say why the sections are empty");
  assert.ok(!/No stations attempted/i.test(html),
    "…and must never be reported as none attempted");
  assert.ok(/6 attempts counted/.test(html),
    "the masthead count must be the real one, not the length of an empty fetch");
}

console.log("PASS osce_dossier_logic");
