/* The per-student report (P2 §7.1) — the document a trainer downloads from the console.

   Rebuilt onto the P1 insight payload. The old version listed what the console already
   showed; this one leads with ranked CLAIMS (reportFindings.ts) and backs each with the
   evidence it rests on. Tables come after the argument, not instead of it.

   Every section states an honest absence in words rather than rendering a zero or a blank
   (spec §8) — "No cohort baseline for this topic (1 peer with data)" is information; an
   empty cell is a bug a trainer cannot distinguish from a real zero.

   Two facts the previous version recorded and this one still obeys:
   - `session_count` over-counts (spec §8.4). The old document labelled its tile "Activity
     events" to stay honest about it; the rebuild drops the vitals row entirely, because a
     number nobody can interpret is the "telling me what I already know" this replaces.
   - A per-scale cohort average must never be repeated down a per-topic table. The map below
     therefore carries NO cohort column; the only cohort comparison is `contrastBlock`, and
     it renders the per-topic baseline P1 actually computed — or says there isn't one.

   Dependency-free so it runs under Node's type-stripping in the harness. The ".ts" suffix on
   the value imports is required for that: type-stripping resolves specifiers at runtime and
   cannot guess the extension. */
import { MIN_CARDS, type Attempt, type Cell, type StudentInsight, type TopicRow } from "./insight.ts";
import { rankFindings } from "./reportFindings.ts";
import { absent, esc, findingsHtml, page, section } from "./reportChrome.ts";

export interface StudentReportData {
  meta: { studentId: string; fullName: string; email: string; role: string; dateStr: string };
  insight: StudentInsight;
  /** Present when the trainer had the attempts loaded; the stations section says so rather
      than claiming none were attempted when the on-demand fetch came back empty. */
  attempts: Attempt[];
  note: string;
}

const pct = (v: number) => `${Math.round(v)}%`;
const nice = (t: string) => esc(t.replace(/_/g, " "));

const FLAG_PROSE: Record<string, string> = {
  knows_cant_do: "known but not performable",
  rote: "performed without the recall to explain it",
  consistent_gap: "weak on both knowledge and performance",
};

/** A cell as text. A `thin` cell carries its n and is never dressed as a solid figure —
    100% off two cards is not 100%. */
function cellText(c: Cell): string {
  if (!c || !c.n) return `<span class="absent">—</span>`;
  if (c.band === "thin") return `${pct(c.value)} <span class="ph">(n=${c.n}, thin)</span>`;
  const weak = c.band === "weak" ? ' class="weak"' : "";
  return `<span${weak}>${pct(c.value)}</span> <span class="ph">(n=${c.n})</span>`;
}

function mapTable(rows: TopicRow[]): string {
  if (!rows.length) return "";
  const body = rows.map((r) => `<tr>
      <td class="${r.flag ? "flagged" : ""}">${nice(r.topic)}</td>
      <td class="num">${cellText(r.flashcards)}</td>
      <td class="num">${cellText(r.station)}</td>
      <td class="num">${cellText(r.retention)}</td>
      <td>${r.flag ? esc(FLAG_PROSE[r.flag] ?? r.flag) : ""}</td>
    </tr>`).join("");
  return `<p class="lede">Recall against performance, per topic. A topic is only flagged when both
    sides carry enough data to compare — ${MIN_CARDS}+ cards and at least one scored station.</p>
    <table>
      <tr><th>Topic</th><th class="num">Flashcards</th><th class="num">Stations</th>
          <th class="num">Retention</th><th>Reading</th></tr>
      ${body}
    </table>`;
}

function markLossBlock(insight: StudentInsight): string {
  const m = insight.markLoss;
  if (!m.attempts) {
    return m.excludedLegacy
      ? absent(`${m.excludedLegacy} attempts, all on the retired ×50 scale — not comparable to current marks.`)
      : absent("No stations attempted on the current marking scale.");
  }
  if (!m.totalLost) return absent(`No marks lost across ${m.attempts} attempts.`);
  const labels: Record<string, string> = {
    checklist: "Checklist coverage", consult: "Consultation technique", judgement: "Clinical judgement & safety",
  };
  const rows = (["checklist", "consult", "judgement"] as const).map((k) => `<tr>
      <td>${esc(labels[k])}</td>
      <td class="num">${m.lost[k]}</td>
      <td class="num">${pct(m.shares[k])}</td>
    </tr>`).join("");
  const legacy = m.excludedLegacy
    ? `<p class="lede">${m.excludedLegacy} further attempts sit on the retired ×50 scale and are excluded — blending them would invent a trend.</p>`
    : "";
  return `<p class="lede">Where ${m.totalLost} lost marks went, across ${m.attempts} attempts on the current scale.
    Shares are rounded independently and may not total exactly 100%.</p>
    <table><tr><th>Bucket</th><th class="num">Marks lost</th><th class="num">Share</th></tr>${rows}</table>${legacy}`;
}

function trajectoryBlock(insight: StudentInsight): string {
  const t = insight.osceTrajectory;
  if (t.band === "insufficient") {
    return absent(`Not enough attempts to call a trend (${t.n} so far, ${t.needed} needed).`);
  }
  const word = t.band === "improving" ? "improving" : t.band === "declining" ? "going backwards" : "steady";
  const delta = t.delta == null ? "" :
    ` Mean moved ${t.delta > 0 ? "+" : ""}${Math.round(t.delta)} points (${Math.round(t.firstMean ?? 0)} → ${Math.round(t.secondMean ?? 0)}).`;
  return `<p>Station performance is <b>${esc(word)}</b> across ${t.n} attempts.${esc(delta)}</p>
    <p class="lede">Movement smaller than 5 points is treated as noise, not a trend.</p>`;
}

function contrastBlock(insight: StudentInsight): string {
  if (!insight.contrasts.length) return "";
  const rows = insight.contrasts.map((c) => {
    const cohort = c.cohortMean == null
      ? `<span class="absent">No cohort baseline for this topic (${c.peers} peer${c.peers === 1 ? "" : "s"} with data)</span>`
      : `${pct(c.cohortMean)} <span class="ph">(${c.peers} peers)</span>`;
    return `<tr><td>${nice(c.topic)}</td>
      <td>${esc(c.axis === "station" ? "Stations" : "Flashcards")}</td>
      <td class="num">${pct(c.student)}</td><td>${cohort}</td></tr>`;
  }).join("");
  return `<p class="lede">The cohort mean excludes this student. A topic with fewer than three peers
    carries no baseline — that is stated, never filled with a zero.</p>
    <table><tr><th>Topic</th><th>Axis</th><th class="num">Student</th><th>Cohort</th></tr>${rows}</table>`;
}

function flashcardsByTopic(rows: TopicRow[]): string {
  const scored = rows.filter((r) => r.flashcards.n > 0)
    .sort((a, b) => a.flashcards.value - b.flashcards.value);   // worst first
  if (!scored.length) return "";
  const body = scored.map((r) => `<tr><td>${nice(r.topic)}</td>
      <td class="num">${cellText(r.flashcards)}</td></tr>`).join("");
  return `<p class="lede">Average grade per topic, weakest first.</p>
    <table><tr><th>Topic</th><th class="num">Average grade</th></tr>${body}</table>`;
}

/* An empty `attempts` array is ambiguous: the student may have attempted nothing, or the
   on-demand fetch may have failed and fallen back to []. mark_loss counts attempts
   independently, so the two are distinguishable — and printing "No stations attempted" for a
   student with six of them is exactly the false assertion this rebuild exists to end. */
function stationsBlock(attempts: Attempt[], insight: StudentInsight): string {
  if (!attempts.length) {
    const known = insight.markLoss.attempts + insight.markLoss.excludedLegacy;
    return known
      ? absent(`${known} station attempts are counted in the sections above, but their per-attempt detail could not be loaded into this document.`)
      : "";
  }
  const rows = attempts.map((a) => {
    const score = a.score100 == null
      ? `${a.totalScore} <span class="ph">(legacy scale)</span>`
      : `${a.score100} / 100`;
    const safety = a.safe == null ? "—" : a.safe ? "safe" : "! unsafe";
    // null = predates migration 019, and never the same claim as "0 of 18 steps performed".
    const ledger = a.checklistDetail == null
      ? `<span class="absent">not recorded</span>`
      : `${a.checklistDetail.filter((s) => s.performed).length} / ${a.checklistDetail.length} steps`;
    return `<tr><td>${esc(a.caseId)}</td><td class="num">${score}</td>
      <td><span class="pill ${a.passed ? "ok" : "no"}">${a.passed ? "Pass" : "Fail"}</span></td>
      <td class="${a.safe === false ? "weak" : ""}">${esc(safety)}</td>
      <td>${ledger}</td><td class="ph">${esc(a.completedAt.slice(0, 10))}</td></tr>`;
  }).join("");
  return `<table><tr><th>Case</th><th class="num">Score</th><th>Result</th><th>Safety</th>
      <th>Steps performed</th><th>Date</th></tr>${rows}</table>`;
}

function consultationsBlock(insight: StudentInsight): string {
  if (!insight.consultations.length) return "";
  const rows = insight.consultations.map((c) => `<tr>
      <td>${c.label ? nice(c.label) : '<span class="absent">Topic not recorded</span>'}
          ${c.derived ? '<span class="ph">(inferred from the reply)</span>' : ""}</td>
      <td class="num">${c.count}</td><td class="ph">${esc(c.lastSeen || "—")}</td></tr>`).join("");
  return `<p class="lede">What this student brought to the tutor. Labels only — transcripts are not retained.</p>
    <table><tr><th>Subject</th><th class="num">Times</th><th>Last</th></tr>${rows}</table>`;
}

export function buildStudentReportHtml(data: StudentReportData): string {
  const { meta, insight, attempts, note } = data;
  const findings = rankFindings(insight);

  // Only the halves that actually happened are named: "0 attempts could not be mapped" is
  // noise, and a count earns its place by being non-zero, not by filling a slot.
  const excludedBits = [
    insight.excluded.unmappedCase ? `${insight.excluded.unmappedCase} attempts could not be mapped to a topic` : "",
    insight.excluded.unscored ? `${insight.excluded.unscored} attempts carried no score` : "",
  ].filter(Boolean);
  const excluded = excludedBits.length
    ? `<p class="lede">${excludedBits.join(" and ")} — excluded from the map above, and still listed under Stations.</p>`
    : "";

  const body = [
    section("Findings", findingsHtml(findings),
      "No findings — there is not yet enough evidence to say anything a trainer could act on."),
    section("Knowledge & performance map", mapTable(insight.topics) + excluded,
      "No topic has both recall and station data yet."),
    section("Where the marks go", markLossBlock(insight)),
    section("Trajectory", trajectoryBlock(insight)),
    section("Against the cohort", contrastBlock(insight),
      "No topic has enough peers for a cohort comparison."),
    section("Flashcards by topic", flashcardsByTopic(insight.topics),
      "No flashcard attempts recorded."),
    section("Stations", stationsBlock(attempts, insight), "No stations attempted."),
    section("Consultations", consultationsBlock(insight), "No tutor sessions recorded."),
    section("Lecturer note", note.trim() ? `<div class="note">${esc(note)}</div>` : "", "None."),
  ].join("\n");

  return page({
    title: `EyeBot — Student report — ${meta.fullName}`,
    kicker: "EyeBot · Student report",
    heading: meta.fullName,
    meta: [`${meta.email} · ${meta.role} · Student ${meta.studentId}`, `Generated ${meta.dateStr}`],
    body,
  });
}
