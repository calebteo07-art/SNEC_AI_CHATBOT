import puppeteer from "puppeteer-core";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, writeFileSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) { console.error("No Chrome/Edge found."); process.exit(1); }

const htmlPath = join(__dirname, "proposal.html");
const fileUrl = "file:///" + htmlPath.replace(/\\/g, "/");
const previewDir = join(__dirname, "previews");
const bgDir = join(__dirname, "backgrounds");
mkdirSync(previewDir, { recursive: true });
mkdirSync(bgDir, { recursive: true });

// Text blocks that should become EDITABLE text in the .pptx (everything else
// stays baked into the page background image — still pixel-perfect, just not editable).
const SELECTORS = [
  ".cover-title", ".cover-sub", ".cover-foot .col b", ".cover-foot .col span",
  "h2.section", ".lead", "p.body", ".pull",
  ".stat .big", ".stat .cap",
  ".pain h3", ".pain p",
  ".mode h3", ".mode p",
  ".pillar h3", ".pillar p",
  ".prin h3", ".prin p",
  ".cnode h4", ".cnode p",
  ".pl h4", ".pl p",
  ".iela td.attr", ".iela td.how",
  ".pcard p",
  ".stop h3", ".stop p",
];

const browser = await puppeteer.launch({
  executablePath, headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--force-color-profile=srgb"],
});
const page = await browser.newPage();
await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
await page.goto(fileUrl, { waitUntil: "networkidle0", timeout: 60000 });
await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
await new Promise((r) => setTimeout(r, 400));

// 1) Multi-page PDF (final deliverable)
await page.pdf({
  path: join(__dirname, "SNEC_EyeBot_Proposal.pdf"),
  printBackground: true, preferCSSPageSize: true,
});

// 2) Per-page previews (with text) for visual QA
let handles = await page.$$(".page");
const pageCount = handles.length;
for (let i = 0; i < handles.length; i++)
  await handles[i].screenshot({ path: join(previewDir, `page-${i + 1}.png`) });

// 3) Extract editable-text layout for the .pptx
const layout = await page.evaluate((SELECTORS) => {
  const rgb = (s) => { const m = s.match(/\d+(\.\d+)?/g); return m ? [Math.round(+m[0]), Math.round(+m[1]), Math.round(+m[2])] : [0, 0, 0]; };
  const fam = (cs) => cs.fontFamily.split(",")[0].replace(/["']/g, "").trim();
  const runsOf = (el) => {
    const cs = getComputedStyle(el);
    const base = rgb(cs.color), bBold = parseInt(cs.fontWeight) >= 600, bIt = cs.fontStyle === "italic";
    const runs = [];
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) { if (/\S/.test(n.textContent)) runs.push({ text: n.textContent.replace(/\s+/g, " "), color: base, bold: bBold, italic: bIt }); }
      else if (n.nodeType === 1) {
        if (n.tagName === "BR") runs.push({ text: "\n" });
        else { const c = getComputedStyle(n); if (c.display === "block") runs.push({ text: "\n" }); runs.push({ text: (n.innerText || n.textContent).replace(/\s+/g, " "), color: rgb(c.color), bold: parseInt(c.fontWeight) >= 600, italic: c.fontStyle === "italic" }); }
      }
    });
    if (!runs.length) runs.push({ text: (el.innerText || el.textContent).replace(/\s+/g, " "), color: base, bold: bBold, italic: bIt });
    return runs;
  };
  const pages = [];
  document.querySelectorAll(".page").forEach((pg) => {
    const pr = pg.getBoundingClientRect();
    const els = [];
    SELECTORS.forEach((sel) => {
      pg.querySelectorAll(sel).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        const cs = getComputedStyle(el);
        els.push({
          x: r.left - pr.left, y: r.top - pr.top, w: r.width, h: r.height,
          font: fam(cs), sizePt: parseFloat(cs.fontSize) * 0.75,
          align: cs.textAlign, linePt: (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3) * 0.75,
          runs: runsOf(el),
        });
      });
    });
    pages.push(els);
  });
  return pages;
}, SELECTORS);
writeFileSync(join(__dirname, "layout.json"), JSON.stringify(layout));

// 4) Text-less backgrounds at 2x for crisp .pptx slides
await page.addStyleTag({ content: SELECTORS.join(",") + "{visibility:hidden !important;}" });
await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
handles = await page.$$(".page");
for (let i = 0; i < handles.length; i++)
  await handles[i].screenshot({ path: join(bgDir, `bg-${i + 1}.png`) });

await browser.close();
console.log("pages:", pageCount, "— pdf + previews + backgrounds + layout.json written");
