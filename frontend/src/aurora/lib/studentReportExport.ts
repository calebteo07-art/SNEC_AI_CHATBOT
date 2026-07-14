// frontend/src/aurora/lib/studentReportExport.ts
/* Pure builder for the per-student analytics report (the Analytics drill-down's
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

export function buildStudentReportHtml(data: StudentReportData): string {
  const { meta, vitals, topics, osce, weakTopics, missedFindings, note, activity } = data;

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
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a1a; background: #fff; margin: 0; padding: 32px; max-width: 900px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .04em; color: #555; border-bottom: 1px solid #e2e2e2; padding-bottom: 6px; margin: 28px 0 12px; }
  .meta { color: #555; font-size: 13px; margin-bottom: 4px; }
  .tiles { display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0; }
  .tile { border: 1px solid #e2e2e2; border-radius: 8px; padding: 8px 14px; min-width: 110px; }
  .tv { font-size: 20px; font-weight: 700; }
  .tl { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #888; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border-bottom: 1px solid #eee; padding: 5px 8px; vertical-align: top; text-align: left; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #888; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .weak { color: #c0392b; font-weight: 700; }
  .ph { color: #888; font-size: 12px; white-space: nowrap; }
  .pill { padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .pill.ok { background: #e9f7ef; color: #1a8f4c; } .pill.no { background: #fdecec; color: #c0392b; }
  ul { margin: 4px 0 4px 18px; padding: 0; } li { margin: 2px 0; }
  .muted { color: #999; font-style: italic; }
  .note { background: #f4f0ff; padding: 8px 12px; border-radius: 6px; white-space: pre-wrap; }
  @media print { body { padding: 0; } h2 { break-after: avoid; } tr, .tile { break-inside: avoid; } }
</style>
</head>
<body>
  <h1>EyeBot — Student Report</h1>
  <div class="meta"><b>${esc(meta.fullName)}</b> · ${esc(meta.email)} · ${esc(meta.role)}</div>
  <div class="meta">Student ${esc(meta.studentId)} · Generated ${esc(meta.dateStr)}</div>

  <h2>Vitals</h2>
  <div class="tiles">${vitalTiles}</div>

  <h2>Per-topic retention &amp; flashcard accuracy</h2>
  <table>
    <tr><th>Topic</th><th class="num">Retention</th><th class="num">Flashcards</th><th class="num">Cohort avg</th></tr>
    ${topicRows(topics)}
  </table>

  <h2>OSCE results</h2>
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
