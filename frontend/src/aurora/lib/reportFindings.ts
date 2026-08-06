/* The ranked findings engine.

   A trainer opens a report to learn something they could not get from the console's
   numbers. So this does not summarise the payload — it makes CLAIMS, each one carrying the
   evidence it rests on and the action it implies, ranked so the first thing read is the
   thing most worth acting on.

   Pure and HTML-free: both documents render the same conclusions from it, and it is tested
   as data rather than by scraping markup.

   The bar for emitting a finding is deliberately high. Silence is a valid output — a
   report that invents six observations about a student who did four flashcards is exactly
   the "telling me what I already know" this rebuild exists to end. Anything derived from a
   `thin` cell, a null cohort baseline, or an `insufficient` trajectory is NOT a finding; it
   is an honest state, and the document renders those as words in their own section.

   The ".ts" suffix is required, not stylistic: a .mjs harness loads this module through Node's
   type-stripping, which resolves specifiers at runtime and cannot guess the extension.
   tsconfig sets `allowImportingTsExtensions` so tsc accepts it too. */
import { INDIVIDUAL_GAP, type Offender, type StudentInsight, type TopicRow } from "./insight.ts";

export type FindingKind =
  | "critical_safety" | "knows_cant_do" | "declining" | "cohort_gap"
  | "repeat_step" | "consistent_gap" | "mark_concentration" | "rote";

export interface Finding {
  kind: FindingKind;
  /** Lower sorts first. */
  rank: number;
  /** "" for findings that are not about one topic. */
  topic: string;
  claim: string;
  evidence: string;
  action: string;
}

/** Severity order. Safety first, then the gaps teaching can close, then the diagnostics. */
const RANK: Record<FindingKind, number> = {
  critical_safety: 0, knows_cant_do: 1, declining: 2, cohort_gap: 3,
  repeat_step: 4, consistent_gap: 5, mark_concentration: 6, rote: 7,
};

/** One bucket has to carry this much of the total loss before it means anything. Below it,
    the three buckets are just where marks live, which the table already shows. */
const CONCENTRATION = 55.0;

const pct = (v: number) => `${Math.round(v)}%`;
const nice = (t: string) => t.replace(/_/g, " ");

/** "9 of 12 attempts that included it", or "3 attempts" when there is no denominator.
    `appeared` is null on the critical path, and a fabricated denominator there is exactly
    the defect the P1 offender fix removed. */
function offenderEvidence(o: Offender): string {
  return o.appeared == null
    ? `Missed in ${o.missed} attempts.`
    : `Missed in ${o.missed} of ${o.appeared} attempts that included this step.`;
}

/** Every repeatedly-missed critical step, from BOTH sources, each reported exactly once.
 *
 * The two lists have different coverage AND different evidence. `criticalOffenders` reads
 * `missed_critical` (migration 011), so it reaches attempts that predate the ledger — but it
 * carries no denominator. `offenders` reads the migration-019 per-step ledger, so it knows how
 * many attempts actually contained the step. Where both name the same action the ledger wins:
 * "missed in 9 of 12 attempts that included it" is a fact a trainer can act on, "missed in 9
 * attempts" is not.
 *
 * Merged rather than assumed: `stepFindings` skips criticals on the grounds that this function
 * reports them, so a critical reaching only the ledger would otherwise drop the single
 * highest-severity finding in the document — and drop the better-evidenced copy at that.
 */
function safetyFindings(insight: StudentInsight): Finding[] {
  const byAction = new Map<string, Offender>();
  for (const o of insight.criticalOffenders) byAction.set(o.action.trim().toLowerCase(), o);
  // Ledger entries overwrite by design — same action, strictly better evidence.
  for (const o of insight.offenders) {
    if (o.critical) byAction.set(o.action.trim().toLowerCase(), o);
  }
  return [...byAction.values()].map((o) => ({
    kind: "critical_safety" as const, rank: RANK.critical_safety, topic: "",
    claim: `A safety-critical step is being missed repeatedly: ${o.action}`,
    evidence: offenderEvidence(o),
    action: "Treat as a competency block, not a knowledge gap — observe this step directly before signing off any further station.",
  }));
}

function topicFindings(rows: TopicRow[]): Finding[] {
  const out: Finding[] = [];
  for (const r of rows) {
    if (r.flag === "knows_cant_do") {
      out.push({
        kind: "knows_cant_do", rank: RANK.knows_cant_do, topic: r.topic,
        claim: `${nice(r.topic)} is known but not performable.`,
        evidence: `Recall ${pct(r.flashcards.value)} across ${r.flashcards.n} cards, but ${pct(r.station.value)} across ${r.station.n} stations.`,
        action: "Book supervised practice, not revision — more reading will not close a performance gap.",
      });
    } else if (r.flag === "consistent_gap") {
      out.push({
        kind: "consistent_gap", rank: RANK.consistent_gap, topic: r.topic,
        claim: `${nice(r.topic)} is weak on both knowledge and performance.`,
        evidence: `Recall ${pct(r.flashcards.value)} (${r.flashcards.n} cards) and ${pct(r.station.value)} (${r.station.n} stations).`,
        action: "Re-teach the topic before further station practice — drilling now rehearses the error.",
      });
    } else if (r.flag === "rote") {
      out.push({
        kind: "rote", rank: RANK.rote, topic: r.topic,
        claim: `${nice(r.topic)} is performed correctly without the recall to explain it.`,
        evidence: `Stations ${pct(r.station.value)} (${r.station.n}) against recall ${pct(r.flashcards.value)} (${r.flashcards.n} cards).`,
        action: "Probe the reasoning verbally — the procedure is learnt, the rationale may not be.",
      });
    }
  }
  return out;
}

function trajectoryFinding(insight: StudentInsight): Finding[] {
  const t = insight.osceTrajectory;
  // Only `declining` is a finding. `improving`/`steady` are good news the trajectory
  // section already states, and `insufficient` is an honest state, not an observation.
  if (t.band !== "declining" || t.delta == null) return [];
  return [{
    kind: "declining", rank: RANK.declining, topic: "",
    claim: "Station performance is going backwards.",
    evidence: `Mean fell ${Math.abs(Math.round(t.delta))} points across ${t.n} attempts (${Math.round(t.firstMean ?? 0)} → ${Math.round(t.secondMean ?? 0)}).`,
    action: "Ask what changed. A decline across attempts usually means confidence outrunning technique, or a misremembered correction.",
  }];
}

function cohortFindings(insight: StudentInsight): Finding[] {
  const out: Finding[] = [];
  for (const c of insight.contrasts) {
    // No baseline -> no claim. `peers` below MIN_PEERS already yields cohortMean null in
    // P1; this guard is belt-and-braces because a fabricated peer comparison is the single
    // most damaging thing this document could print about a student.
    if (c.cohortMean == null) continue;
    const gap = c.cohortMean - c.student;
    if (gap < INDIVIDUAL_GAP) continue;
    const axis = c.axis === "station" ? "stations" : "flashcards";
    out.push({
      kind: "cohort_gap", rank: RANK.cohort_gap, topic: c.topic,
      claim: `${nice(c.topic)} is a gap relative to peers, not just in absolute terms.`,
      evidence: `${pct(c.student)} on ${axis} against a cohort mean of ${pct(c.cohortMean)} across ${c.peers} peers.`,
      action: "Worth a cohort-level check: if several students share it, the teaching is the cause, not the student.",
    });
  }
  return out;
}

function stepFindings(insight: StudentInsight): Finding[] {
  // Critical ones are already reported at rank 0 by safetyFindings; reporting them twice
  // would pad the list, which is the failure mode this engine exists to avoid.
  return insight.offenders.filter((o) => !o.critical).map((o) => ({
    kind: "repeat_step" as const, rank: RANK.repeat_step, topic: "",
    claim: `One step is missed far more than the rest: ${o.action}`,
    evidence: offenderEvidence(o),
    action: "A single repeated omission is usually a sequencing habit — correct where it sits in the routine, not the whole checklist.",
  }));
}

function markConcentration(insight: StudentInsight): Finding[] {
  const m = insight.markLoss;
  if (!m.attempts || !m.totalLost) return [];
  const labels: Record<string, string> = {
    checklist: "checklist coverage", consult: "consultation technique", judgement: "clinical judgement & safety",
  };
  const [top] = Object.entries(m.shares).sort((a, b) => b[1] - a[1]);
  if (!top || top[1] < CONCENTRATION) return [];
  const [bucket, share] = top;
  return [{
    kind: "mark_concentration", rank: RANK.mark_concentration, topic: "",
    claim: `Most marks are lost in one place: ${labels[bucket] ?? bucket}.`,
    evidence: `${pct(share)} of ${m.totalLost} marks lost across ${m.attempts} attempts.`,
    action: `Target ${labels[bucket] ?? bucket} specifically — the other two buckets are not what is costing this student.`,
  }];
}

/** Every finding worth a trainer's attention, most important first. Empty is a valid and
    common answer. */
export function rankFindings(insight: StudentInsight): Finding[] {
  const all = [
    ...safetyFindings(insight),
    ...topicFindings(insight.topics),
    ...trajectoryFinding(insight),
    ...cohortFindings(insight),
    ...stepFindings(insight),
    ...markConcentration(insight),
  ];
  // Stable and total: rank, then topic, then claim — so two runs over the same payload
  // cannot reorder, which would make the document diff noisily between generations.
  return all.sort((a, b) =>
    a.rank - b.rank || a.topic.localeCompare(b.topic) || a.claim.localeCompare(b.claim));
}
