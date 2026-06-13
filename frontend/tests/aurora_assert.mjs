import { chromium } from "playwright";
const base = process.argv[2] ?? "http://127.0.0.1:3000";
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
// scratch route renders the logo with a stable testid
await p.goto(base + "/aurora-scratch");
const logo = await p.locator('[data-testid="aurora-logo"]').count();
if (logo < 1) { console.error("FAIL: logo not rendered"); process.exit(1); }
console.log("PASS: logo renders");
await b.close();
