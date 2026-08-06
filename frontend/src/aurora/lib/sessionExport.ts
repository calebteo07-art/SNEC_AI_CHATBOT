// frontend/src/aurora/lib/sessionExport.ts
/* Pure builder for the one-time OSCE session export. Turns the finished session into ONE
   self-contained, print-friendly (→ "Save as PDF") document. Dependency-free apart from the
   pace rule so it runs under Node's type-stripping in the test harness and never touches
   React/DOM. The caller (CaseSession) maps its live state — including decoding the
   action-channel messages — into this plain data model; this module only renders it.

   Two rules the 2026-08-04 rebuild exists to enforce, both from a real report:

   1. THE LEDGER OUTRANKS THE PROSE. A student who performed 15 of 16 steps was told they
      had completed every step, because the AI coach block is free text that nothing checked.
      So the counts are computed here, from the data, and printed in the most prominent block
      on the page — above any sentence a model wrote.
   2. NOTHING GOES QUIET. "Missed or lacking" is the column the student came for; rendering
      "— none —" there says "you missed nothing", which is a claim, not an absence. When the
      coach supplies nothing, a line is derived from the ledger instead.

   And one constraint that shapes the whole stylesheet: a student printing this with
   background graphics off must lose nothing that matters. Every state is carried by a glyph
   and by words as well as by colour. */

// Type-only: the pace RULE lives with the timer that owns it (stationTimer.paceRead) and the
// caller passes the computed read in. `import type` is erased, so this module stays free of
// any runtime dependency and keeps running under Node's type-stripping in the harness.
import type { PaceRead } from "./stationTimer";

/** One bucket of the grade. The scheme is the backend's to change — two /50 at the time of
    writing, three at 40/30/30 in flight — so the report renders whatever list it is given
    and hardcodes no weighting of its own. */
export interface ScoreBucket {
  label: string;
  pts: number;
  max: number;
  /** One line of what this bucket measures. */
  sub?: string;
  /** The sub-scores behind the total, so every figure is traceable to an input. */
  parts?: { label: string; pts: number; max: number }[];
  /** Set when a cap fired (e.g. the safety gate), explaining it where it applied. */
  capReason?: string;
  /** The examiner's own per-domain notes for this bucket. */
  notes?: string[];
}

export interface SessionExportData {
  meta: {
    caseId: string; caseTitle: string; patientName: string; patientAge: number | string;
    topic: string; difficulty: string; studentName: string; dateStr: string;
    /** Legacy pre-formatted "m:ss", superseded by `pace`. */
    timeTaken?: string;
  };
  /** What the clock MEANT (stationTimer.paceRead). Absent → the report prints the bare
      elapsed time and makes no claim about the pace, rather than inventing a verdict. */
  pace?: PaceRead;
  score: {
    score100: number; verdict: string; safe: boolean; missedCritical: string[];
    /** Preferred. When absent the legacy two-scheme pair below is used instead. */
    buckets?: ScoreBucket[];
    consult?: number; consultMax?: number; judgement?: number; judgementMax?: number;
  };
  summary: { highlights: string[]; didWrong: string[]; missed: string[]; focus: string };
  /** `skipped` = the student said they couldn't complete it, so `done` is false for it too. */
  checklist: { phase: string; action: string; critical: boolean; done: boolean; skipped?: boolean }[];
  patientTranscript: { who: string; text: string }[];
  actionTranscript: { who: string; text: string }[];
  /** Why the transcript appendices are empty, when they are. Absent for a student's own
      save (their transcript really is the whole conversation); the trainer's per-attempt
      record passes a reason, because chat_sessions retains no messages and "— no messages —"
      would assert that nothing was said. */
  transcriptNote?: string;
}

const PASS_MARK = 60;

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

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Normalise the grade into buckets, so the renderer below sees one shape whatever the
    caller sends. The legacy branch goes away once every caller passes `buckets`. */
function resolveBuckets(score: SessionExportData["score"]): ScoreBucket[] {
  if (score.buckets?.length) return score.buckets;
  const legacy: ScoreBucket[] = [];
  if (score.consultMax) {
    legacy.push({ label: "Consultation & Technique", pts: score.consult ?? 0, max: score.consultMax,
      sub: "History-taking and how well you performed the examination(s)" });
  }
  if (score.judgementMax) {
    legacy.push({ label: "Clinical Judgement & Safety", pts: score.judgement ?? 0, max: score.judgementMax,
      sub: "Spotting the problem, triage, escalation & handover" });
  }
  return legacy;
}

function bulletList(items: string[]): string {
  if (!items.length) return '<p class="muted">— none —</p>';
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

/* The derived "Missed or lacking" line, used only when the coach block came back empty. It
   is deliberately NOT a restatement of an unticked row — the ledger below already prints
   every one of those, and repeating one is not feedback. It names what the shortfall means
   for where the student should spend their next hour. */
function derivedMiss(outstanding: number, unfinishedPhases: string[]): string {
  if (outstanding <= 0) {
    return "Nothing was left undone, so what is still missing is depth, not breadth — "
      + "the examiner's notes above say where.";
  }
  const where = unfinishedPhases.length === 1
    ? `, all of them in ${unfinishedPhases[0]} — which makes this a routine problem, not a knowledge one`
    : "";
  return `${plural(outstanding, "step")} left outstanding${where}. Those are the fastest marks to `
    + "recover on a retry: nothing new to learn, they simply didn't happen.";
}

function transcript(rows: { who: string; text: string }[], note?: string): string {
  if (!rows.length) return `<p class="muted">${note ? esc(note) : "— no messages —"}</p>`;
  return rows
    .map((r) => `<div class="msg"><span class="who">${esc(r.who)}</span><span class="txt">${esc(r.text)}</span></div>`)
    .join("");
}

/** The score ring. Inline SVG rather than a conic-gradient because SVG survives a print with
    background graphics switched off, and a gradient does not. */
function scoreRing(score100: number): string {
  const pct = Math.max(0, Math.min(100, Number(score100) || 0));
  const circumference = 2 * Math.PI * 52;
  const offset = (circumference * (1 - pct / 100)).toFixed(1);
  return `<svg class="ring" viewBox="0 0 120 120" width="112" height="112" role="img" aria-label="Score ${pct} out of 100">
    <circle cx="60" cy="60" r="52" fill="none" stroke="#e6e3f0" stroke-width="9" />
    <circle cx="60" cy="60" r="52" fill="none" stroke="#5b3fd6" stroke-width="9" stroke-linecap="round"
            stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset}" transform="rotate(-90 60 60)" />
    <text x="60" y="63" text-anchor="middle" font-size="31" font-weight="700" fill="#14142b">${pct}</text>
    <text x="60" y="80" text-anchor="middle" font-size="11" fill="#6b6880">of 100</text>
  </svg>`;
}

/* The pace track. An over-run clamped to a full bar just reads as a rule, so once the guide
   is passed the track becomes the ELAPSED time: the guide takes its true share and the
   overrun is the rest, in a different colour with a key. Under the guide it is an ordinary
   fill against the guide. */
function paceTrack(ratio: number): string {
  const over = ratio > 1;
  const within = over ? 100 / ratio : Math.max(0, ratio) * 100;
  return `<div class="pace-track"><i class="within" style="width:${within.toFixed(1)}%"></i>${
    over ? `<i class="over" style="width:${(100 - within).toFixed(1)}%"></i>` : ""
  }</div>${
    over
      ? '<p class="pace-key"><span class="k k-within"></span>inside the guide<span class="k k-over"></span>past the guide</p>'
      : ""
  }`;
}

function bucketCard(b: ScoreBucket): string {
  const pct = b.max ? Math.max(0, Math.min(100, (b.pts / b.max) * 100)) : 0;
  const maths = b.parts?.length
    ? `<p class="maths">${b.parts.map((p) => `${esc(p.label)} ${esc(p.pts)}/${esc(p.max)}`).join(" · ")} → <b>${esc(b.pts)}/${esc(b.max)}</b></p>`
    : "";
  const cap = b.capReason ? `<p class="cap">⚠ ${esc(b.capReason)}</p>` : "";
  const notes = (b.notes ?? []).filter(Boolean).map((n) => `<p class="note">${esc(n)}</p>`).join("");
  return `<div class="bucket">
    <div class="bucket-top"><span>${esc(b.label)}</span><b>${esc(b.pts)}<small>/${esc(b.max)}</small></b></div>
    <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
    ${b.sub ? `<p class="bucket-sub">${esc(b.sub)}</p>` : ""}
    ${maths}${cap}${notes}
  </div>`;
}

export function buildSessionHtml(data: SessionExportData): string {
  const { meta, score, summary, checklist, patientTranscript, actionTranscript, pace, transcriptNote } = data;

  const total = checklist.length;
  const done = checklist.filter((s) => s.done).length;
  const outstanding = total - done;
  const skippedCount = checklist.filter((s) => s.skipped).length;
  const unfinishedPhases = [...new Set(checklist.filter((s) => !s.done).map((s) => s.phase))];

  const takenLabel = pace?.taken || meta.timeTaken || "—";

  const buckets = resolveBuckets(score);
  const passed = Number(score.score100) >= PASS_MARK;
  const safetyLine = score.safe
    ? "Safety check passed — no critical step was missed."
    : `Critical step missed: ${esc(score.missedCritical[0] ?? "a must-do safety step")}.`;

  // Checklist ledger, grouped the way the station grouped it. A row that is not done is red
  // and carries "!" whether it was given up on or never reached — both are the same thing on
  // the day, and the tag below tells them apart for anyone reviewing the session.
  const phases = [...new Set(checklist.map((s) => s.phase))];
  const ledgerBody = phases.map((phase) => {
    const rows = checklist.filter((s) => s.phase === phase);
    const phaseDone = rows.filter((s) => s.done).length;
    const short = rows.length - phaseDone;
    // colspan, so the phase name can never widen the tick column beneath it.
    const head = `<tr class="phase-row"><td colspan="2"><span class="pc${short ? " is-short" : ""}">${phaseDone}/${rows.length}</span>${esc(phase)}</td></tr>`;
    // The phase is on the group header — repeating it per row is noise, not information.
    const body = rows.map((s) => {
      const mark = s.done ? "✓" : "!";
      const tag = s.done
        ? ""
        : s.skipped
          ? ' <span class="tag">unable to complete</span>'
          : ' <span class="tag">not performed</span>';
      return `<tr data-done="${s.done}"${s.skipped ? ' data-skipped="true"' : ""}>
        <td class="mark ${s.done ? "ok" : "no"}">${mark}</td>
        <td class="act">${esc(s.action)}${s.critical ? ' <span class="crit">CRITICAL</span>' : ""}${tag}</td>
      </tr>`;
    }).join("");
    return head + body;
  }).join("");

  const missItems = summary.missed.length
    ? bulletList(summary.missed)
    : `<ul><li>${esc(derivedMiss(outstanding, unfinishedPhases))}</li></ul>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>EyeBot OSCE Session — ${esc(meta.caseTitle)}</title>
<style>
  /* Pin the stack explicitly: an undefined font var falls back to Times and the whole
     document changes character. */
  :root {
    color-scheme: light;
    --ink: #14142b; --ink-2: #45415c; --muted: #6b6880;
    --line: #e6e3f0; --hair: #f0eef8;
    --accent: #5b3fd6; --accent-soft: #f5f2ff;
    --ok: #17784a; --ok-soft: #eaf6ef;
    --warn: #b26a00;
    --bad: #c0392b; --bad-soft: #fdeeec;
    --font: ui-sans-serif, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font: 13.5px/1.6 var(--font); color: var(--ink); background: #fff;
    margin: 0 auto; padding: 0 26px 48px; max-width: 880px;
    font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased;
  }

  /* ── Masthead ─────────────────────────────────────────────────────── */
  .mast { display: flex; align-items: center; justify-content: space-between; gap: 26px;
          padding: 30px 0 20px; border-bottom: 2px solid var(--ink); }
  .mast-id { min-width: 0; }
  .brand { font-size: 10.5px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase;
           color: var(--accent); margin: 0 0 7px; }
  h1 { font-size: 27px; line-height: 1.2; letter-spacing: -.018em; margin: 0 0 9px; font-weight: 700; }
  .mast dl { display: flex; flex-wrap: wrap; gap: 3px 18px; margin: 0; font-size: 12.5px; color: var(--muted); }
  .mast dl div { display: flex; gap: 6px; }
  .mast dt { color: #9895ab; }
  .mast dd { margin: 0; color: var(--ink-2); font-weight: 500; }
  .ring { flex: none; }

  /* ── At a glance — the ledger. Deliberately the first thing on the page: every
        figure here is computed from the record, so it outranks any sentence below. ── */
  .glance { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 20px 0 0; }
  .tile { border: 1px solid var(--line); border-radius: 11px; padding: 11px 13px; background: #fdfdff; }
  .tile .tk { display: block; font-size: 10px; font-weight: 700; letter-spacing: .1em;
              text-transform: uppercase; color: var(--muted); margin-bottom: 5px; }
  .tile b { display: block; font-size: 21px; font-weight: 700; line-height: 1.15; letter-spacing: -.01em; }
  .tile b small { font-size: 13px; font-weight: 500; color: var(--muted); }
  .tile .tn { display: block; margin-top: 3px; font-size: 11.5px; line-height: 1.4; color: var(--ink-2); }
  .tile.is-bad { border-color: #f2c9c3; background: var(--bad-soft); }
  .tile.is-bad b, .tile.is-bad .tn { color: var(--bad); }
  .tile.is-ok b { color: var(--ok); }

  h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .13em;
       color: var(--accent); margin: 30px 0 12px; padding-bottom: 7px; border-bottom: 1px solid var(--line); }

  /* ── Grade buckets ────────────────────────────────────────────────── */
  .verdict-row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin: 0 0 14px; }
  .verdict { font-size: 17px; font-weight: 700; }
  .passline { font-size: 12.5px; color: var(--muted); }
  .passline b { color: var(--ink-2); }
  .buckets { display: grid; gap: 10px; }
  .bucket { border: 1px solid var(--line); border-radius: 11px; padding: 12px 14px; }
  .bucket-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
                font-weight: 600; font-size: 14px; }
  .bucket-top b { font-size: 19px; font-weight: 700; white-space: nowrap; }
  .bucket-top b small { font-size: 12.5px; font-weight: 500; color: var(--muted); }
  .bar { height: 6px; border-radius: 999px; background: var(--hair); margin: 9px 0 8px;
         border: 1px solid var(--line); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); }
  .bucket-sub { margin: 0; font-size: 12.5px; color: var(--muted); }
  .maths { margin: 6px 0 0; font-size: 12px; color: var(--ink-2); }
  .cap { margin: 6px 0 0; font-size: 12px; font-weight: 600; color: var(--bad); }
  .note { margin: 7px 0 0; padding-left: 11px; border-left: 2px solid var(--line);
          font-size: 12.5px; color: var(--ink-2); }
  .safety { margin: 12px 0 0; padding: 10px 13px; border-radius: 9px; font-weight: 600; font-size: 13px;
            border: 1px solid ${score.safe ? "#bfe3ce" : "#f2c9c3"};
            background: ${score.safe ? "var(--ok-soft)" : "var(--bad-soft)"};
            color: ${score.safe ? "var(--ok)" : "var(--bad)"}; }

  /* ── Pace ─────────────────────────────────────────────────────────── */
  .pace-head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
  .pace-clock { font-size: 30px; font-weight: 700; letter-spacing: -.02em; line-height: 1; }
  .pace-guide { font-size: 12.5px; color: var(--muted); }
  .pace-band { font-size: 13px; font-weight: 700; color: var(--accent); }
  .pace-track { display: flex; height: 8px; border: 1px solid var(--line); border-radius: 999px;
                background: var(--hair); margin: 11px 0 7px; overflow: hidden; }
  .pace-track i { display: block; height: 100%; background: var(--accent); }
  .pace-track i.over { background: var(--warn); }
  .pace-key { display: flex; align-items: center; gap: 6px; margin: 0 0 9px; font-size: 11px; color: var(--muted); }
  .pace-key .k { width: 9px; height: 9px; border-radius: 3px; background: var(--accent); }
  .pace-key .k-over { background: var(--warn); margin-left: 12px; }
  .pace-mean { margin: 0; font-size: 13px; color: var(--ink-2); max-width: 68ch; }

  /* ── Coach ────────────────────────────────────────────────────────── */
  .coach { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .col { border: 1px solid var(--line); border-radius: 11px; padding: 11px 13px; min-width: 0; }
  .col h3 { margin: 0 0 6px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
  .col.good { border-top: 3px solid var(--ok); } .col.good h3 { color: var(--ok); }
  .col.wrong { border-top: 3px solid var(--warn); } .col.wrong h3 { color: var(--warn); }
  .col.miss { border-top: 3px solid var(--bad); } .col.miss h3 { color: var(--bad); }
  .col ul { margin: 0; padding-left: 16px; } .col li { margin: 3px 0; font-size: 12.5px; }
  .focus { margin: 11px 0 0; padding: 12px 14px; border-radius: 9px; background: var(--accent-soft);
           border: 1px solid #e0d8fb; font-size: 13.5px; }

  /* ── Checklist ledger ─────────────────────────────────────────────── */
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  td { border-bottom: 1px solid var(--hair); padding: 7px 9px; vertical-align: top; }
  .phase-row td { background: #faf9fe; font-size: 10.5px; font-weight: 700; letter-spacing: .1em;
                  text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--line); }
  .phase-row .pc { float: right; letter-spacing: 0; font-size: 11.5px; color: var(--ink-2); }
  .phase-row .pc.is-short { color: var(--bad); }
  .mark { width: 30px; text-align: center; font-weight: 800; font-size: 15px; }
  .mark.ok { color: var(--ok); }
  .mark.no { color: var(--bad); }
  /* A step that did not happen is loud, and never by colour alone — the "!" and the tag
     both survive a mono print (user-directed 2026-08-04). */
  tr[data-done="false"] td { background: var(--bad-soft); color: var(--bad); }
  tr[data-done="false"] td.act { font-weight: 600; }
  tr[data-done="false"] td:first-child { box-shadow: inset 3px 0 0 var(--bad); }
  .tag { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
         color: var(--bad); border: 1px solid #eab8b0; border-radius: 4px; padding: 1px 5px;
         white-space: nowrap; }
  .crit { font-size: 10px; font-weight: 800; letter-spacing: .05em; color: #fff; background: var(--bad);
          border-radius: 4px; padding: 1px 5px; }
  .ph { color: var(--muted); font-size: 11.5px; white-space: nowrap; text-align: right; }

  /* ── Transcript appendix ──────────────────────────────────────────── */
  .msg { padding: 6px 0; border-bottom: 1px solid var(--hair); }
  .who { display: inline-block; min-width: 118px; font-weight: 700; color: var(--accent);
         vertical-align: top; font-size: 12px; }
  .txt { display: inline-block; max-width: 660px; white-space: pre-wrap; font-size: 12.5px; }
  .muted { color: var(--muted); font-style: italic; }
  .foot { margin: 34px 0 0; padding-top: 12px; border-top: 1px solid var(--line);
          font-size: 11px; color: var(--muted); }

  @media (max-width: 640px) {
    .glance { grid-template-columns: repeat(2, 1fr); }
    .coach { grid-template-columns: 1fr; }
    .mast { flex-direction: column; align-items: flex-start; }
  }

  @page { size: A4; margin: 13mm 11mm 15mm; }
  @media print {
    body { padding: 0; max-width: none; font-size: 10.5pt; }
    h2 { break-after: avoid; }
    .bucket, .col, .tile, .msg, tr, .focus, .pace-head { break-inside: avoid; }
    .appendix { break-before: page; }
    .glance { grid-template-columns: repeat(4, 1fr); }
  }
</style>
</head>
<body>
  <header class="mast">
    <div class="mast-id">
      <p class="brand">EyeBot · Virtual-patient station record</p>
      <h1>${esc(meta.caseTitle)}</h1>
      <dl>
        <div><dt>Patient</dt><dd>${esc(meta.patientName)}, ${esc(meta.patientAge)}</dd></div>
        <div><dt>Topic</dt><dd>${esc(meta.topic)}</dd></div>
        <div><dt>Tier</dt><dd>${esc(meta.difficulty)}</dd></div>
        <div><dt>Student</dt><dd>${esc(meta.studentName)}</dd></div>
        <div><dt>Date</dt><dd>${esc(meta.dateStr)}</dd></div>
        <div><dt>Case</dt><dd>${esc(meta.caseId)}</dd></div>
      </dl>
    </div>
    ${scoreRing(Number(score.score100))}
  </header>

  <section class="glance">
    <div class="tile ${passed ? "is-ok" : "is-bad"}">
      <span class="tk">Result</span>
      <b>${esc(score.verdict)}</b>
      <span class="tn">${esc(score.score100)}/100 · ${passed ? `passed, pass line ${PASS_MARK}` : `${PASS_MARK - Number(score.score100)} short of the ${PASS_MARK} pass line`}</span>
    </div>
    <div class="tile ${outstanding ? "is-bad" : "is-ok"}" data-testid="ledger-checklist">
      <span class="tk">Checklist</span>
      <b>${done}<small>/${total}</small></b>
      <span class="tn">${outstanding
        ? `${plural(outstanding, "step")} not completed${skippedCount ? `, ${skippedCount} given up on` : ""}`
        : "nothing left undone"}</span>
    </div>
    <div class="tile">
      <span class="tk">Time taken</span>
      <b>${esc(takenLabel)}</b>
      <span class="tn">${pace?.guide ? `guide ${esc(pace.guide)} · ${esc(pace.headline.toLowerCase())}` : "no time guide for this case"}</span>
    </div>
    <div class="tile ${score.safe ? "is-ok" : "is-bad"}">
      <span class="tk">Safety</span>
      <b>${score.safe ? "Passed" : "Flagged"}</b>
      <span class="tn">${score.safe ? "no critical step missed" : esc(score.missedCritical[0] ?? "a critical step was missed")}</span>
    </div>
  </section>

  <h2>How the grade was built</h2>
  <div class="verdict-row">
    <span class="verdict">${esc(score.verdict)}</span>
    <span class="passline"><b>${esc(score.score100)}</b> of 100 · pass line ${PASS_MARK} · ${passed ? "passed" : "not yet passed"}</span>
  </div>
  <div class="buckets">${buckets.map(bucketCard).join("")}</div>
  <div class="safety">${score.safe ? "🛡 " : "⚠ "}${safetyLine}</div>

  ${pace ? `<h2>Pace — and what it means</h2>
  <section data-testid="pace">
    <div class="pace-head">
      <span class="pace-clock">${esc(pace.taken)}</span>
      ${pace.guide ? `<span class="pace-guide">against a ${esc(pace.guide)} guide for this case</span>` : ""}
      <span class="pace-band">${esc(pace.headline)}</span>
    </div>
    ${pace.guide ? paceTrack(pace.ratio) : ""}
    <p class="pace-mean">${esc(pace.meaning)}</p>
  </section>` : ""}

  <h2>Coach's debrief</h2>
  <div class="coach">
    <div class="col good"><h3>✓ What you did well</h3>${bulletList(summary.highlights)}</div>
    <div class="col wrong"><h3>△ Done wrong or only partially</h3>${bulletList(summary.didWrong)}</div>
    <div class="col miss"><h3>! Missed or lacking</h3>${missItems}</div>
  </div>
  ${summary.focus ? `<p class="focus"><b>One thing for next time:</b> ${esc(summary.focus)}</p>` : ""}

  <h2>Checklist — ${done} of ${total} performed</h2>
  <table>${ledgerBody || '<tr><td class="muted">— no checklist —</td></tr>'}</table>

  <div class="appendix">
    <h2>Appendix A · Patient consultation</h2>
    ${transcript(patientTranscript, transcriptNote)}

    <h2>Appendix B · Action panel</h2>
    ${transcript(actionTranscript, transcriptNote)}
  </div>

  <p class="foot">Generated by EyeBot for ${esc(meta.studentName)} · ${esc(meta.dateStr)} · case ${esc(meta.caseId)}. This is a training record, not a clinical document.</p>
</body>
</html>`;
}
