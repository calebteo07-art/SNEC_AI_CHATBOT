/**
 * The ranked findings engine — the answer to "don't tell me what I already know".
 *
 * Asserts ORDER (safety outranks everything), that every finding carries evidence and an
 * action, and that a finding never fires off data too thin to support it.
 */
import assert from "node:assert";
import { rankFindings } from "../src/aurora/lib/reportFindings.ts";

const cell = (value, n, band) => ({ value, n, band });
const EMPTY = {
  topics: [], contrasts: [],
  markLoss: { lost: { checklist: 0, consult: 0, judgement: 0 }, totalLost: 0,
              shares: { checklist: 0, consult: 0, judgement: 0 }, attempts: 0, excludedLegacy: 0 },
  offenders: [], criticalOffenders: [],
  osceTrajectory: { band: "insufficient", delta: null, n: 0, needed: 4, firstMean: null, secondMean: null },
  flashcardTrajectory: { band: "insufficient", delta: null, n: 0, needed: 20, firstMean: null, secondMean: null },
  consultations: [], excluded: { unmappedCase: 0, unscored: 0 },
};
const insight = (over) => ({ ...EMPTY, ...over });

// 1 — a student with nothing produces no findings, not an empty-looking one
assert.deepEqual(rankFindings(EMPTY), [], "no data must yield no findings");

// 2 — safety outranks every other signal
{
  const out = rankFindings(insight({
    criticalOffenders: [{ action: "Perform hand hygiene.", missed: 3, critical: true, appeared: null }],
    osceTrajectory: { band: "declining", delta: -20, n: 6, needed: 4, firstMean: 70, secondMean: 50 },
  }));
  assert.equal(out[0].kind, "critical_safety", "a repeated critical miss must rank first");
  assert.ok(out.length >= 2, "the decline must still be reported, just lower");
}

// 3 — every finding carries all three parts; none is empty
{
  const out = rankFindings(insight({
    topics: [{ topic: "tonometry", flag: "knows_cant_do",
               flashcards: cell(92, 20, "strong"), station: cell(41, 5, "weak"), retention: cell(88, 1, "strong") }],
  }));
  for (const f of out) {
    assert.ok(f.claim && f.claim.length > 10, `claim missing: ${JSON.stringify(f)}`);
    assert.ok(f.evidence && /\d/.test(f.evidence), `evidence must cite numbers: ${JSON.stringify(f)}`);
    assert.ok(f.action && f.action.length > 10, `action missing: ${JSON.stringify(f)}`);
  }
}

// 4 — the signature insight is named in words a trainer can act on
{
  const out = rankFindings(insight({
    topics: [{ topic: "tonometry", flag: "knows_cant_do",
               flashcards: cell(92, 20, "strong"), station: cell(41, 5, "weak"), retention: cell(88, 1, "strong") }],
  }));
  const f = out.find((x) => x.kind === "knows_cant_do");
  assert.ok(f, "a knows_cant_do flag must produce a finding");
  assert.ok(/tonometry/i.test(f.claim), "the claim must name the topic");
  assert.ok(/92/.test(f.evidence) && /41/.test(f.evidence), "evidence must cite BOTH sides of the gap");
}

// 5 — a null denominator never becomes a fraction
{
  const out = rankFindings(insight({
    criticalOffenders: [{ action: "Check allergy status", missed: 3, critical: true, appeared: null }],
  }));
  const f = out.find((x) => x.kind === "critical_safety");
  assert.ok(/3 attempts/.test(f.evidence), "should say 'in 3 attempts'");
  assert.ok(!/\bof\s+\d/.test(f.evidence), `must not invent a denominator: ${f.evidence}`);
}

// 6 — a real denominator IS shown when we have one
{
  const out = rankFindings(insight({
    offenders: [{ action: "Confirm patient identity", missed: 9, critical: false, appeared: 12 }],
  }));
  const f = out.find((x) => x.kind === "repeat_step");
  assert.ok(/9 of 12/.test(f.evidence), `expected '9 of 12', got: ${f.evidence}`);
}

// 7 — an insufficient trajectory is NOT a finding; it is an honest state
{
  const out = rankFindings(insight({
    osceTrajectory: { band: "insufficient", delta: null, n: 2, needed: 4, firstMean: null, secondMean: null },
  }));
  assert.equal(out.length, 0, "too few attempts must not manufacture a trend finding");
}

// 8 — a cohort gap needs a real baseline
{
  const noBase = rankFindings(insight({
    contrasts: [{ topic: "gonioscopy", axis: "station", student: 40, cohortMean: null, peers: 1, label: "" }],
  }));
  assert.equal(noBase.length, 0, "no baseline must not produce a cohort finding");
  const withBase = rankFindings(insight({
    contrasts: [{ topic: "gonioscopy", axis: "station", student: 40, cohortMean: 75, peers: 6, label: "" }],
  }));
  assert.equal(withBase[0].kind, "cohort_gap");
  assert.ok(/6 peers/.test(withBase[0].evidence), "must cite the peer count it divided by");
}

// 9 — mark loss only speaks when one bucket genuinely dominates
{
  const even = rankFindings(insight({
    markLoss: { lost: { checklist: 10, consult: 10, judgement: 10 }, totalLost: 30,
                shares: { checklist: 33.3, consult: 33.3, judgement: 33.3 }, attempts: 5, excludedLegacy: 0 },
  }));
  assert.ok(!even.some((f) => f.kind === "mark_concentration"), "an even spread is not a finding");
  const skewed = rankFindings(insight({
    markLoss: { lost: { checklist: 40, consult: 5, judgement: 5 }, totalLost: 50,
                shares: { checklist: 80, consult: 10, judgement: 10 }, attempts: 5, excludedLegacy: 0 },
  }));
  assert.ok(skewed.some((f) => f.kind === "mark_concentration"), "80% in one bucket IS a finding");
}

// 10 — findings are stably ordered by severity then topic
{
  const out = rankFindings(insight({
    topics: [
      { topic: "zeta", flag: "rote", flashcards: cell(30, 10, "weak"), station: cell(80, 5, "strong"), retention: cell(50, 1, "weak") },
      { topic: "alpha", flag: "rote", flashcards: cell(30, 10, "weak"), station: cell(80, 5, "strong"), retention: cell(50, 1, "weak") },
    ],
  }));
  assert.deepEqual(out.map((f) => f.topic), ["alpha", "zeta"], "equal severity sorts by topic");
}

// 11 — a critical step known ONLY to the ledger must not vanish.
// `stepFindings` skips criticals because `safetyFindings` is supposed to cover them, but the
// two lists come from different columns: criticalOffenders reads missed_critical (migration
// 011), offenders reads the checklist_detail ledger (migration 019). If a critical reaches
// only the ledger, assuming coverage drops the document's highest-severity finding.
{
  const out = rankFindings(insight({
    offenders: [{ action: "Perform hand hygiene.", missed: 9, critical: true, appeared: 12 }],
    criticalOffenders: [],
  }));
  const f = out.find((x) => x.kind === "critical_safety");
  assert.ok(f, "a critical step present only in the ledger must still be reported");
  assert.ok(/9 of 12/.test(f.evidence), `and must keep the ledger's real denominator: ${f?.evidence}`);
}

// 12 — the same action in both sources is ONE finding, carrying the better evidence
{
  const out = rankFindings(insight({
    offenders: [{ action: "Perform hand hygiene.", missed: 9, critical: true, appeared: 12 }],
    criticalOffenders: [{ action: "Perform hand hygiene.", missed: 9, critical: true, appeared: null }],
  }));
  const crit = out.filter((x) => x.kind === "critical_safety");
  assert.equal(crit.length, 1, "one action must not be reported twice");
  assert.ok(/9 of 12/.test(crit[0].evidence),
    `the ledger's denominator must win over the bare count: ${crit[0].evidence}`);
}

console.log("PASS report_findings_logic");
