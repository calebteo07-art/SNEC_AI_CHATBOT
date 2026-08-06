/* The OSCE dossier (P2 §7.2) — every station attempt for one student, in one document.

   The student report summarises; this reconstructs. It exists because migration 019 finally
   persists the per-step ledger, which until now was built at grading time and thrown away —
   so no trainer could ever see WHICH steps a student missed, only how many.

   A missing ledger and an empty one are different facts and render differently: NULL means
   the attempt predates the column, [] means the case genuinely resolved no checklist. The
   same distinction runs through the whole file — an absence is stated in words, never
   rendered as a zero or left as a blank a trainer would read as "none" (spec §8).

   Sibling of studentReportExport.ts: same chrome, same findings engine, same honest states,
   so the two read as one product.

   Dependency-free so it runs under Node's type-stripping in the harness. The ".ts" suffix on
   the value imports is required for that: type-stripping resolves specifiers at runtime and
   cannot guess the extension. */
import type { Attempt, AttemptStep, Offender, StudentInsight } from "./insight.ts";
import { rankFindings } from "./reportFindings.ts";
import { absent, esc, findingsHtml, page, section } from "./reportChrome.ts";

export interface OsceDossierData {
  meta: { studentId: string; fullName: string; email: string; role: string; dateStr: string };
  insight: StudentInsight;
  /** Fetched on demand, so [] means either "attempted nothing" or "the fetch failed". The
      insight's own counts tell those apart — see `known` below. */
  attempts: Attempt[];
}

const pct = (v: number) => `${Math.round(v)}%`;

/** Every attempt mark_loss saw. Each case row increments exactly one of the two counters
    (osce_analysis.py::mark_loss), so the sum is the real total — and it is still there when
    the on-demand ledger fetch came back empty. */
const attemptsKnown = (insight: StudentInsight): number =>
  insight.markLoss.attempts + insight.markLoss.excludedLegacy;

function offenderRows(list: Offender[]): string {
  return list.map((o) => `<tr>
    <td class="${o.critical ? "flagged" : ""}">${esc(o.action)}</td>
    <td class="num">${o.missed}</td>
    <td>${o.appeared == null
        ? '<span class="absent">no denominator recorded</span>'
        : `of ${o.appeared} attempts that included it`}</td>
  </tr>`).join("");
}

function ledger(steps: AttemptStep[] | null): string {
  if (steps == null) return absent("Per-step ledger not recorded for this attempt.");
  if (!steps.length) return absent("This attempt resolved no checklist steps.");
  const done = steps.filter((s) => s.performed).length;
  const rows = steps.map((s) => `<tr>
      <td class="ph">${s.stepNumber}</td>
      <td class="${s.critical ? "flagged" : ""}">${esc(s.action)}</td>
      <td class="ph">${esc(s.phase)}</td>
      <td>${s.performed ? "performed" : s.skipped ? "skipped" : "not performed"}</td>
    </tr>`).join("");
  return `<p class="lede">${done} of ${steps.length} steps performed.</p>
    <table><tr><th>#</th><th>Step</th><th>Phase</th><th>State</th></tr>${rows}</table>`;
}

function attemptSection(a: Attempt, index: number): string {
  // Two eras, two gates — and deliberately not the same column.
  //   grade_scale (migration 017) stamps the current 40/30/30 era; NULL is the retired x50
  //   era, which 017 chose not to backfill. Its sub-scores are out of 50, so neither they
  //   nor a /100 headline may be printed for such a row.
  //   score_100 (migration 011) landed in the SAME statement as missed_critical, so a row
  //   without score_100 has no critical-step record at all. The endpoint maps that NULL to
  //   [], and an empty list rendered as silence would read as "none were missed".
  const retiredScale = a.score100 == null || a.gradeScale == null;
  const noCriticalRecord = a.score100 == null;
  const score = retiredScale
    ? `${a.totalScore} <span class="ph">(retired ×50 scale — not comparable)</span>`
    : `<b>${a.score100} / 100</b>`;
  const buckets = retiredScale ? "" : `<table>
      <tr><th>Bucket</th><th class="num">Score</th><th class="num">Max</th></tr>
      <tr><td>Checklist coverage</td><td class="num">${a.checklistCoverage ?? "—"}</td><td class="num">40</td></tr>
      <tr><td>Consultation technique</td><td class="num">${a.consultTechnique ?? "—"}</td><td class="num">30</td></tr>
      <tr><td>Clinical judgement &amp; safety</td><td class="num">${a.judgementSafety ?? "—"}</td><td class="num">30</td></tr>
    </table>`;
  const missed = a.missedCritical.length
    ? `<p class="flagged">Critical steps missed: ${esc(a.missedCritical.join("; "))}</p>`
    : noCriticalRecord
      ? absent("Critical-step record not kept for this attempt.")
      : "<p>No critical steps missed.</p>";
  const coach = a.coaching && typeof a.coaching === "object" && Object.keys(a.coaching).length
    ? `<div class="note">${Object.entries(a.coaching)
        .map(([k, v]) => `<b>${esc(k.replace(/_/g, " "))}:</b> ${esc(String(v))}`).join("<br>")}</div>`
    : "";
  return `<div class="attempt">
    <h3>${index + 1}. ${esc(a.caseId)} <span class="ph">· ${esc(a.completedAt.slice(0, 10))}</span></h3>
    <p>${score} · <span class="pill ${a.passed ? "ok" : "no"}">${a.passed ? "Pass" : "Fail"}</span>
       ${a.safe === false ? '<span class="weak">! unsafe</span>' : ""}</p>
    ${buckets}${missed}${coach}${ledger(a.checklistDetail)}
  </div>`;
}

export function buildOsceDossierHtml(data: OsceDossierData): string {
  const { meta, insight, attempts } = data;
  const t = insight.osceTrajectory;
  const known = attemptsKnown(insight);

  const arc = t.band === "insufficient"
    ? absent(`Not enough attempts to call a trend (${t.n} so far, ${t.needed} needed).`)
    : `<p>Across ${t.n} attempts, performance is <b>${esc(t.band === "declining" ? "going backwards" : t.band)}</b>` +
      `${t.delta == null ? "" : ` — mean moved ${t.delta > 0 ? "+" : ""}${Math.round(t.delta)} points`}.</p>`;

  const m = insight.markLoss;
  const marks = m.attempts && m.totalLost
    ? `<table><tr><th>Bucket</th><th class="num">Lost</th><th class="num">Share</th></tr>
        <tr><td>Checklist coverage</td><td class="num">${m.lost.checklist}</td><td class="num">${pct(m.shares.checklist)}</td></tr>
        <tr><td>Consultation technique</td><td class="num">${m.lost.consult}</td><td class="num">${pct(m.shares.consult)}</td></tr>
        <tr><td>Clinical judgement &amp; safety</td><td class="num">${m.lost.judgement}</td><td class="num">${pct(m.shares.judgement)}</td></tr>
      </table>`
    : "";
  // Three distinguishable facts, not one hedge: marks lost none, nothing on this scale at
  // all, or everything on the retired one. A trainer acts differently on each.
  const marksAbsent = m.attempts
    ? `No marks lost across ${m.attempts} attempts on the current scale.`
    : m.excludedLegacy
      ? `${m.excludedLegacy} attempts, all on the retired ×50 scale — not comparable to current marks.`
      : "No stations attempted on the current marking scale.";

  const offenders = insight.offenders.length
    ? `<table><tr><th>Step</th><th class="num">Missed</th><th>Denominator</th></tr>${offenderRows(insight.offenders)}</table>`
    : "";
  const safety = insight.criticalOffenders.length
    ? `<table><tr><th>Critical step</th><th class="num">Missed</th><th>Denominator</th></tr>${offenderRows(insight.criticalOffenders)}</table>`
    : "";

  // The whole body of this document is per-attempt sections, so an empty `attempts` is the
  // one absence it cannot afford to get wrong: the console fetches them separately and falls
  // back to [] on failure, and "No stations attempted" for a student with six of them is a
  // false claim about a real person.
  const noAttempts = known
    ? `${known} station attempts are counted in the sections above, but their per-attempt detail could not be loaded into this document.`
    : "No stations attempted.";

  const body = [
    section("Findings", findingsHtml(rankFindings(insight)),
      "No findings — not enough evidence yet to say anything actionable."),
    section("The arc", arc),
    section("Where the marks go", marks, marksAbsent),
    section("Repeated omissions", offenders, "No step has been missed often enough to call it a pattern."),
    section("Safety record", safety, "No critical step has been missed more than once."),
    section("Every attempt", attempts.map(attemptSection).join("\n"), noAttempts),
  ].join("\n");

  const count = attempts.length
    ? `${attempts.length} attempt${attempts.length === 1 ? "" : "s"}`
    : known
      ? `${known} attempts counted — per-attempt detail not loaded`
      : "No attempts";

  return page({
    title: `EyeBot — OSCE dossier — ${meta.fullName}`,
    kicker: "EyeBot · OSCE dossier",
    heading: meta.fullName,
    meta: [`${meta.email} · ${meta.role} · Student ${meta.studentId}`,
           `${count} · Generated ${meta.dateStr}`],
    body,
  });
}
