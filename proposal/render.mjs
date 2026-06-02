import puppeteer from "puppeteer-core";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

import { existsSync } from "fs";
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error("No Chrome/Edge found.");
  process.exit(1);
}

const htmlPath = join(__dirname, "proposal.html");
const fileUrl = "file:///" + htmlPath.replace(/\\/g, "/");
const previewDir = join(__dirname, "previews");
mkdirSync(previewDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--force-color-profile=srgb"],
});

const page = await browser.newPage();
await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
await page.goto(fileUrl, { waitUntil: "networkidle0", timeout: 60000 });
await page.evaluate(async () => {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
});
// settle a beat for any gradient/filter compositing
await new Promise((r) => setTimeout(r, 400));

// Full multi-page PDF
await page.pdf({
  path: join(__dirname, "SNEC_EyeBot_Proposal.pdf"),
  printBackground: true,
  preferCSSPageSize: true,
});

// Per-page PNG previews for visual verification
const handles = await page.$$(".page");
console.log("pages:", handles.length);
for (let i = 0; i < handles.length; i++) {
  await handles[i].screenshot({ path: join(previewDir, `page-${i + 1}.png`) });
}

await browser.close();
console.log("done");
