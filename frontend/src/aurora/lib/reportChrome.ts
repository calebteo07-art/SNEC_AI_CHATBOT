/* Shared print-first chrome for both staff documents.

   One stylesheet, one escaper, one page shell — so the student report and the OSCE dossier
   read as one product rather than two builders that drifted. Dependency-free so both run
   under Node's type-stripping in the harnesses and never touch React or the DOM.

   Print-first is the point: a trainer's output is a PDF via the browser's print dialog, so
   A4 @page, tabular numerals for column alignment, and break-inside: avoid on every row,
   card and section — a finding split across a page break loses its evidence line. */

/** Escape the five HTML-significant characters. Every value interpolated into these
    documents goes through here — topic names, step actions and the lecturer note are all
    free text a student or trainer can type. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** An honest state: the reason a section is empty, in words. Never a blank, never a zero. */
export function absent(reason: string): string {
  return `<p class="absent">${esc(reason)}</p>`;
}

/** A section that renders its heading ONLY when it has something to say, so a document
    never carries a heading over a blank. Pass `whenEmpty` to state why instead. */
export function section(title: string, body: string, whenEmpty?: string): string {
  if (!body.trim()) {
    if (!whenEmpty) return "";
    return `<h2>${esc(title)}</h2>${absent(whenEmpty)}`;
  }
  return `<h2>${esc(title)}</h2>${body}`;
}

export const CHROME_CSS = `
  :root { color-scheme: light; --ink:#1a1a2e; --line:#e7e4f0; --accent:#6d3bd6;
          --weak:#c0392b; --ok:#1a8f4c; --dim:#8a86a0; }
  * { box-sizing:border-box; }
  body { font:14px/1.55 -apple-system,"Segoe UI",Roboto,Arial,sans-serif; color:var(--ink);
         background:#fff; margin:0; padding:0 32px 40px; max-width:920px; }
  .band { margin:0 -32px 4px; padding:26px 32px 20px;
          background:linear-gradient(120deg,#f3efff,#eaf1ff); border-bottom:3px solid var(--accent); }
  h1 { font-size:23px; margin:0 0 4px; letter-spacing:-.01em; }
  h1 small { font-weight:600; color:var(--accent); font-size:13px; text-transform:uppercase;
             letter-spacing:.08em; display:block; margin-bottom:4px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--accent);
       padding-bottom:6px; margin:30px 0 12px; border-bottom:1px solid var(--line); }
  h3 { font-size:14px; margin:18px 0 6px; }
  .meta { color:#5a5a72; font-size:13px; }
  .lede { color:#5a5a72; font-size:12.5px; margin:0 0 10px; }
  table { border-collapse:collapse; width:100%; }
  th,td { border-bottom:1px solid #efedf6; padding:6px 9px; vertical-align:top; text-align:left; }
  th { font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--dim); }
  tr:nth-child(even) td { background:#fbfaff; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  .weak { color:var(--weak); font-weight:700; }
  .ph { color:var(--dim); font-size:12px; white-space:nowrap; }
  .absent { color:#767391; font-style:italic; margin:4px 0; }
  .pill { padding:2px 9px; border-radius:999px; font-size:11px; font-weight:700; }
  .pill.ok { background:#e9f7ef; color:var(--ok); } .pill.no { background:#fdecec; color:var(--weak); }
  .note { background:#f4f0ff; padding:10px 13px; border-radius:8px; white-space:pre-wrap; }
  /* A finding is the unit that must never break across a page — the claim without its
     evidence is an assertion a trainer cannot check. */
  .finding { border-left:3px solid var(--accent); padding:8px 0 8px 12px; margin:0 0 12px; }
  .finding .claim { font-weight:700; }
  .finding .ev, .finding .act { font-size:12.5px; color:#4a4a63; margin-top:2px; }
  .finding .act::before { content:"→ "; color:var(--accent); font-weight:700; }
  .finding.sev0 { border-left-color:var(--weak); }
  .finding.sev0 .claim { color:var(--weak); }
  /* Glyph + word, never colour alone: these print in greyscale and are read by people who
     do not all see hue the same way. */
  .flagged::before { content:"! "; font-weight:800; color:var(--weak); }
  @page { size:A4; margin:14mm; }
  @media print {
    body { padding:0 20px 20px; } .band { margin:0 -20px 4px; }
    h2 { break-after:avoid; } tr,.finding,.tile,.attempt { break-inside:avoid; }
    .attempt { break-before:auto; }
  }
`;

/** The full self-contained document. Both builders end by calling this. */
export function page(opts: { title: string; kicker: string; heading: string;
                             meta: string[]; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(opts.title)}</title>
<style>${CHROME_CSS}</style>
</head>
<body>
  <div class="band">
    <h1><small>${esc(opts.kicker)}</small>${esc(opts.heading)}</h1>
    ${opts.meta.map((m) => `<div class="meta">${esc(m)}</div>`).join("")}
  </div>
  ${opts.body}
</body>
</html>`;
}

/** Findings as the document's opening argument. `sev0` reddens rank-0 safety findings. */
export function findingsHtml(findings: { rank: number; claim: string; evidence: string; action: string }[]): string {
  return findings.map((f) => `<div class="finding${f.rank === 0 ? " sev0" : ""}">
    <div class="claim">${esc(f.claim)}</div>
    <div class="ev">${esc(f.evidence)}</div>
    <div class="act">${esc(f.action)}</div>
  </div>`).join("");
}
