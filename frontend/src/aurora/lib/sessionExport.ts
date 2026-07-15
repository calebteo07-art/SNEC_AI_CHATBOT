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
  :root { color-scheme: light; --ink: #1a1a2e; --line: #e7e4f0; --accent: #6d3bd6; }
  * { box-sizing: border-box; }
  body { font: 14px/1.55 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: var(--ink); background: #fff; margin: 0; padding: 0 32px 40px; max-width: 900px; }
  .band { margin: 0 -32px 4px; padding: 26px 32px 20px; background: linear-gradient(120deg, #f3efff, #eaf1ff); border-bottom: 3px solid var(--accent); }
  h1 { font-size: 23px; margin: 0 0 4px; letter-spacing: -.01em; }
  h1 small { font-weight: 600; color: var(--accent); font-size: 13px; text-transform: uppercase; letter-spacing: .08em; display: block; margin-bottom: 4px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--accent); border-bottom: 1px solid var(--line); padding-bottom: 6px; margin: 30px 0 12px; }
  .meta { color: #5a5a72; font-size: 13px; }
  .grade { display: flex; align-items: baseline; gap: 14px; margin: 14px 0 0; }
  .score { font-size: 44px; font-weight: 800; line-height: 1; }
  .score small { font-size: 18px; font-weight: 500; color: #8a86a0; }
  .verdict { font-size: 16px; font-weight: 700; color: var(--accent); }
  .schemes { display: flex; gap: 12px; flex-wrap: wrap; margin: 14px 0 0; }
  .scheme { border: 1px solid var(--line); border-radius: 10px; padding: 10px 15px; min-width: 220px; background: #faf9fe; }
  .scheme b { font-size: 19px; display: block; margin-top: 3px; }
  .safety { padding: 10px 13px; border-radius: 8px; margin: 12px 0 0; font-weight: 600; background: ${score.safe ? "#e9f7ef" : "#fdecec"}; color: ${score.safe ? "#1a8f4c" : "#c0392b"}; }
  table { border-collapse: collapse; width: 100%; }
  td { border-bottom: 1px solid #efedf6; padding: 6px 9px; vertical-align: top; }
  tr:nth-child(even) td { background: #fbfaff; }
  .mark { width: 26px; text-align: center; font-weight: 800; }
  .mark.ok { color: #1a8f4c; } .mark.no { color: #c0392b; }
  .crit { color: #c0392b; font-size: 10.5px; font-weight: 800; }
  .ph { color: #8a86a0; font-size: 12px; white-space: nowrap; }
  ul { margin: 4px 0 4px 18px; padding: 0; } li { margin: 2px 0; }
  .muted { color: #999; font-style: italic; }
  .coach { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .coach .col { border: 1px solid var(--line); border-radius: 10px; padding: 10px 13px; background: #faf9fe; }
  .coach .col h3 { margin: 0 0 5px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  .col.good h3 { color: #1a8f4c; } .col.wrong h3 { color: #c77700; } .col.miss h3 { color: #c0392b; }
  .focus { background: #f4f0ff; padding: 11px 13px; border-radius: 8px; margin-top: 12px; }
  .msg { padding: 5px 0; border-bottom: 1px solid #f3f1fa; }
  .who { display: inline-block; min-width: 120px; font-weight: 700; color: var(--accent); vertical-align: top; }
  .txt { display: inline-block; max-width: 700px; white-space: pre-wrap; }
  @media print { body { padding: 0 20px 20px; } .band { margin: 0 -20px 4px; } h2 { break-after: avoid; } .msg, tr, .coach .col { break-inside: avoid; } }
</style>
</head>
<body>
  <div class="band">
    <h1><small>EyeBot · Virtual-patient session</small>${esc(meta.caseTitle)}</h1>
    <div class="meta"><b>${esc(meta.patientName)}</b>, ${esc(meta.patientAge)} · ${esc(meta.topic)} · ${esc(meta.difficulty)}</div>
    <div class="meta">Student: ${esc(meta.studentName)} · ${esc(meta.dateStr)} · Case ${esc(meta.caseId)}</div>
  </div>

  <h2>Final grade</h2>
  <div class="grade">
    <span class="score">${esc(score.score100)}<small>/100</small></span>
    <span class="verdict">${esc(score.verdict)}</span>
    <span class="meta">${Number(score.score100) >= 60 ? "Passed (pass line 60)" : "Below pass line 60"}</span>
  </div>
  <div class="schemes">
    <div class="scheme">Consultation &amp; Technique<b>${esc(score.consult)} / ${esc(score.consultMax)}</b></div>
    <div class="scheme">Clinical Judgement &amp; Safety<b>${esc(score.judgement)} / ${esc(score.judgementMax)}</b></div>
  </div>
  <div class="safety">${score.safe ? "🛡 " : "⚠ "}${safetyLine}</div>

  <h2>Coach's summary</h2>
  <div class="coach">
    <div class="col good"><h3>✓ What you did well</h3>${bulletList(summary.highlights)}</div>
    <div class="col wrong"><h3>✗ Done wrong or only partially</h3>${bulletList(summary.didWrong)}</div>
    <div class="col miss"><h3>○ Missed or lacking</h3>${bulletList(summary.missed)}</div>
  </div>
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
