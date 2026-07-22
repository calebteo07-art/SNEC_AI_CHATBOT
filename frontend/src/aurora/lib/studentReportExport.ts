// frontend/src/aurora/lib/studentReportExport.ts
/* Pure builder for the per-student report (the Admin drill-down's
   "Download report" action). Clones sessionExport.ts: turns already-loaded per-student
   data into ONE self-contained, print-friendly (→ "Save as PDF"), fully HTML-escaped
   document — vitals, per-topic retention + flashcard accuracy vs cohort, OSCE results,
   weak topics, missed findings, the lecturer note, and a recent-activity summary.
   Dependency-free so it runs under Node's type-stripping in the test harness and never
   touches React/DOM. The caller (AdminStudentDetail) maps its live data into this plain
   model; this module only renders it. */

export interface StudentReportData {
  meta: {
    studentId: string; fullName: string; email: string; role: string; dateStr: string;
  };
  vitals: {
    sessions: number; streak: number; lastActive: string; velocity: string;
    cases: number; tokens: string;
  };
  topics: {
    topic: string; retentionPct: number;
    flashcardPct: number | null; cohortPct: number | null;
  }[];
  osce: {
    caseId: string; totalScore: number; scoreMax: number; passed: boolean;
    score100: number | null; safe: boolean | null; missedCritical: string[]; dateStr: string;
  }[];
  weakTopics: string[];
  missedFindings: string[];
  note: string;
  activity: { dateStr: string; topic: string }[];
  // Cross-feature findings (tutor + flashcards + virtual patients) + optional AI narrative.
  findings: { feature: string; text: string }[];
  narrative: string;
}

/** Escape the five HTML-significant characters so any free text (lecturer note, missed
    findings, topic names) renders as literal text — never interpreted as markup. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bulletList(items: string[]): string {
  if (!items.length) return '<p class="muted">— none —</p>';
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

function topicRows(topics: StudentReportData["topics"]): string {
  if (!topics.length) return '<tr><td class="muted">— no topic data —</td></tr>';
  return topics
    .map((t) => {
      const fc = t.flashcardPct == null ? "—" : `${esc(t.flashcardPct)}%`;
      const co = t.cohortPct == null ? "—" : `${esc(t.cohortPct)}%`;
      return `<tr>
        <td>${esc(t.topic.replace(/_/g, " "))}</td>
        <td class="num ${t.retentionPct < 65 ? "weak" : ""}">${esc(t.retentionPct)}%</td>
        <td class="num">${fc}</td>
        <td class="num muted">${co}</td>
      </tr>`;
    })
    .join("");
}

function osceRows(osce: StudentReportData["osce"]): string {
  if (!osce.length) return '<tr><td class="muted">— no case attempts —</td></tr>';
  return osce
    .map((c) => {
      const score = c.score100 == null ? `${esc(c.totalScore)} / ${esc(c.scoreMax)}` : `${esc(c.score100)} / 100`;
      const safety = c.safe == null ? "—" : c.safe ? "🛡 safe" : "⚠ unsafe";
      const missed = c.missedCritical.length ? esc(c.missedCritical.join("; ")) : "—";
      return `<tr>
        <td>${esc(c.caseId)}</td>
        <td class="num">${score}</td>
        <td><span class="pill ${c.passed ? "ok" : "no"}">${c.passed ? "Pass" : "Fail"}</span></td>
        <td class="${c.safe === false ? "weak" : ""}">${safety}</td>
        <td>${missed}</td>
        <td class="ph">${esc(c.dateStr)}</td>
      </tr>`;
    })
    .join("");
}

function activityRows(activity: StudentReportData["activity"]): string {
  if (!activity.length) return '<p class="muted">— no recent activity —</p>';
  return `<table>${activity
    .map((a) => `<tr><td class="ph">${esc(a.dateStr)}</td><td>${esc(a.topic || "—")}</td></tr>`)
    .join("")}</table>`;
}

function findingsBlock(findings: StudentReportData["findings"], narrative: string): string {
  findings = findings ?? [];
  narrative = narrative ?? "";
  if (!findings.length && !narrative) return '<p class="muted">— no findings yet —</p>';
  const rows = findings
    .map((f) => `<div class="finding"><span class="feat">${esc(f.feature)}</span><span>${esc(f.text)}</span></div>`)
    .join("");
  const narr = narrative
    ? `<p class="narrative"><b>AI teaching insight:</b> ${esc(narrative)}</p>`
    : "";
  return rows + narr;
}

export function buildStudentReportHtml(data: StudentReportData): string {
  const { meta, vitals, topics, osce, weakTopics, missedFindings, note, activity, findings, narrative } = data;

  // session_count over-counts (spec §8.4) — label it "activity events", not "sessions".
  const vitalTiles = [
    { label: "Activity events", val: vitals.sessions },
    { label: "Streak", val: `${vitals.streak}d` },
    { label: "Cases", val: vitals.cases },
    { label: "Tokens", val: vitals.tokens },
    { label: "Velocity", val: vitals.velocity },
    { label: "Last active", val: vitals.lastActive || "—" },
  ]
    .map((t) => `<div class="tile"><div class="tv">${esc(t.val)}</div><div class="tl">${esc(t.label)}</div></div>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>EyeBot — Student Report — ${esc(meta.fullName)}</title>
<style>
  :root { color-scheme: light; --ink: #1a1a2e; --line: #e7e4f0; --accent: #6d3bd6; }
  * { box-sizing: border-box; }
  body { font: 14px/1.55 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: var(--ink); background: #fff; margin: 0; padding: 0 32px 40px; max-width: 920px; }
  .band { margin: 0 -32px 4px; padding: 26px 32px 20px; background: linear-gradient(120deg, #f3efff, #eaf1ff); border-bottom: 3px solid var(--accent); }
  h1 { font-size: 23px; margin: 0 0 4px; letter-spacing: -.01em; }
  h1 small { font-weight: 600; color: var(--accent); font-size: 13px; text-transform: uppercase; letter-spacing: .08em; display: block; margin-bottom: 4px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--accent); padding-bottom: 6px; margin: 30px 0 12px; border-bottom: 1px solid var(--line); }
  .meta { color: #5a5a72; font-size: 13px; }
  .tiles { display: flex; flex-wrap: wrap; gap: 10px; margin: 14px 0 0; }
  .tile { border: 1px solid var(--line); border-radius: 10px; padding: 9px 15px; min-width: 108px; background: #faf9fe; }
  .tv { font-size: 21px; font-weight: 800; }
  .tl { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: #8a86a0; margin-top: 1px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border-bottom: 1px solid #efedf6; padding: 6px 9px; vertical-align: top; text-align: left; }
  th { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: #8a86a0; }
  tr:nth-child(even) td { background: #fbfaff; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .weak { color: #c0392b; font-weight: 700; }
  .ph { color: #8a86a0; font-size: 12px; white-space: nowrap; }
  .pill { padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .pill.ok { background: #e9f7ef; color: #1a8f4c; } .pill.no { background: #fdecec; color: #c0392b; }
  ul { margin: 4px 0 4px 18px; padding: 0; } li { margin: 2px 0; }
  .muted { color: #999; font-style: italic; }
  .note { background: #f4f0ff; padding: 10px 13px; border-radius: 8px; white-space: pre-wrap; }
  .finding { display: flex; gap: 10px; align-items: baseline; padding: 6px 0; border-bottom: 1px solid #f3f1fa; }
  .finding .feat { flex: none; min-width: 118px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: var(--accent); }
  .narrative { background: #f4f0ff; padding: 11px 13px; border-radius: 8px; margin: 10px 0 0; line-height: 1.55; }
  @media print { body { padding: 0 20px 20px; } .band { margin: 0 -20px 4px; } h2 { break-after: avoid; } tr, .tile, .finding { break-inside: avoid; } }
</style>
</head>
<body>
  <div class="band">
    <h1><small>EyeBot · Student report</small>${esc(meta.fullName)}</h1>
    <div class="meta">${esc(meta.email)} · ${esc(meta.role)} · Student ${esc(meta.studentId)}</div>
    <div class="meta">Generated ${esc(meta.dateStr)}</div>
  </div>

  <h2>Vitals</h2>
  <div class="tiles">${vitalTiles}</div>

  <h2>Findings &amp; insights · all features</h2>
  ${findingsBlock(findings, narrative)}

  <h2>Per-topic retention &amp; flashcard accuracy</h2>
  <table>
    <tr><th>Topic</th><th class="num">Retention</th><th class="num">Flashcards</th><th class="num">Cohort avg</th></tr>
    ${topicRows(topics)}
  </table>

  <h2>Virtual-patient results</h2>
  <table>
    <tr><th>Case</th><th class="num">Score</th><th>Result</th><th>Safety</th><th>Missed critical</th><th>Date</th></tr>
    ${osceRows(osce)}
  </table>

  <h2>Weak topics</h2>
  ${bulletList(weakTopics)}

  <h2>Consistently missed findings</h2>
  ${bulletList(missedFindings)}

  <h2>Lecturer note</h2>
  ${note.trim() ? `<div class="note">${esc(note)}</div>` : '<p class="muted">— none —</p>'}

  <h2>Recent activity</h2>
  ${activityRows(activity)}
</body>
</html>`;
}
