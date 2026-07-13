// frontend/src/aurora/lib/sessionExport.ts
/* Pure builder for the one-time OSCE session export. Turns the finished session into ONE
   self-contained, print-friendly (→ "Save as PDF"), fully HTML-escaped document: the two-
   scheme grade, the AI point-form summary, the checklist (each step ✓/✗ + critical flag),
   and both transcripts (patient consult + action panel). Dependency-free so it runs under
   Node's type-stripping in the test harness and never touches React/DOM. The caller
   (CaseSession) maps its live state — including decoding the action-channel messages — into
   this plain data model; this module only renders it. */

export interface SessionExportData {
  meta: {
    caseId: string; caseTitle: string; patientName: string; patientAge: number | string;
    topic: string; difficulty: string; studentName: string; dateStr: string;
  };
  score: {
    score100: number; verdict: string; safe: boolean; missedCritical: string[];
    consult: number; consultMax: number; judgement: number; judgementMax: number;
  };
  summary: { highlights: string[]; didWrong: string[]; missed: string[]; focus: string };
  checklist: { phase: string; action: string; critical: boolean; done: boolean }[];
  patientTranscript: { who: string; text: string }[];
  actionTranscript: { who: string; text: string }[];
}

/** Escape the five HTML-significant characters so any student/patient/AI free text is
    rendered as literal text — never interpreted as markup. */
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

function transcript(rows: { who: string; text: string }[]): string {
  if (!rows.length) return '<p class="muted">— no messages —</p>';
  return rows
    .map((r) => `<div class="msg"><span class="who">${esc(r.who)}</span><span class="txt">${esc(r.text)}</span></div>`)
    .join("");
}

export function buildSessionHtml(data: SessionExportData): string {
  const { meta, score, summary, checklist, patientTranscript, actionTranscript } = data;

  const safetyLine = score.safe
    ? "Safety check passed — no critical steps missed."
    : `Critical step missed: ${esc(score.missedCritical[0] ?? "a must-do safety step")}.`;

  const checklistRows = checklist
    .map(
      (s) =>
        `<tr>
          <td class="mark ${s.done ? "ok" : "no"}">${s.done ? "✓" : "✗"}</td>
          <td>${esc(s.action)}${s.critical ? ' <span class="crit">CRITICAL</span>' : ""}</td>
          <td class="ph">${esc(s.phase)}</td>
        </tr>`,
    )
    .join("");

  const done = checklist.filter((s) => s.done).length;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>EyeBot OSCE Session — ${esc(meta.caseTitle)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a1a; background: #fff; margin: 0; padding: 32px; max-width: 900px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .04em; color: #555; border-bottom: 1px solid #e2e2e2; padding-bottom: 6px; margin: 28px 0 12px; }
  .meta { color: #555; font-size: 13px; margin-bottom: 4px; }
  .grade { display: flex; align-items: baseline; gap: 12px; margin: 8px 0; }
  .score { font-size: 40px; font-weight: 700; }
  .score small { font-size: 18px; font-weight: 400; color: #888; }
  .verdict { font-size: 16px; font-weight: 600; }
  .schemes { display: flex; gap: 16px; flex-wrap: wrap; margin: 10px 0; }
  .scheme { border: 1px solid #e2e2e2; border-radius: 8px; padding: 10px 14px; min-width: 220px; }
  .scheme b { font-size: 18px; }
  .safety { padding: 8px 12px; border-radius: 6px; margin: 10px 0; background: ${score.safe ? "#e9f7ef" : "#fdecec"}; }
  table { border-collapse: collapse; width: 100%; }
  td { border-bottom: 1px solid #eee; padding: 5px 8px; vertical-align: top; }
  .mark { width: 24px; text-align: center; font-weight: 700; }
  .mark.ok { color: #1a8f4c; } .mark.no { color: #c0392b; }
  .crit { color: #c0392b; font-size: 11px; font-weight: 700; }
  .ph { color: #888; font-size: 12px; white-space: nowrap; }
  ul { margin: 4px 0 4px 18px; padding: 0; } li { margin: 2px 0; }
  .muted { color: #999; font-style: italic; }
  .focus { background: #f4f0ff; padding: 8px 12px; border-radius: 6px; }
  .msg { padding: 4px 0; border-bottom: 1px solid #f2f2f2; }
  .who { display: inline-block; min-width: 120px; font-weight: 600; color: #444; vertical-align: top; }
  .txt { display: inline-block; max-width: 720px; white-space: pre-wrap; }
  @media print { body { padding: 0; } h2 { break-after: avoid; } .msg, tr { break-inside: avoid; } }
</style>
</head>
<body>
  <h1>EyeBot — OSCE Session Record</h1>
  <div class="meta">${esc(meta.caseTitle)} · <b>${esc(meta.patientName)}</b>, ${esc(meta.patientAge)} · ${esc(meta.topic)} · ${esc(meta.difficulty)}</div>
  <div class="meta">Student: ${esc(meta.studentName)} · ${esc(meta.dateStr)} · Case ${esc(meta.caseId)}</div>

  <h2>Final grade</h2>
  <div class="grade">
    <span class="score">${esc(score.score100)}<small>/100</small></span>
    <span class="verdict">${esc(score.verdict)}</span>
    <span class="meta">${Number(score.score100) >= 60 ? "Passed (pass line 60)" : "Below pass line 60"}</span>
  </div>
  <div class="schemes">
    <div class="scheme">Consultation &amp; Technique<br /><b>${esc(score.consult)} / ${esc(score.consultMax)}</b></div>
    <div class="scheme">Clinical Judgement &amp; Safety<br /><b>${esc(score.judgement)} / ${esc(score.judgementMax)}</b></div>
  </div>
  <div class="safety">${score.safe ? "🛡 " : "⚠ "}${safetyLine}</div>

  <h2>Coach's summary</h2>
  <p><b>What you did well</b></p>
  ${bulletList(summary.highlights)}
  <p><b>Done wrong or only partially</b></p>
  ${bulletList(summary.didWrong)}
  <p><b>Missed or lacking</b></p>
  ${bulletList(summary.missed)}
  ${summary.focus ? `<p class="focus"><b>One thing for next time:</b> ${esc(summary.focus)}</p>` : ""}

  <h2>Checklist (${done} of ${checklist.length} performed · not scored)</h2>
  <table>${checklistRows || '<tr><td class="muted">— no checklist —</td></tr>'}</table>

  <h2>Patient consultation</h2>
  ${transcript(patientTranscript)}

  <h2>Action panel</h2>
  ${transcript(actionTranscript)}
</body>
</html>`;
}
