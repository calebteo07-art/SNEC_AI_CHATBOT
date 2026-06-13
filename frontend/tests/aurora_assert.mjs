import { chromium } from "playwright";
const base = process.argv[2] ?? "http://127.0.0.1:3000";
const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();

// scratch route renders the logo with a stable testid
await p.goto(base + "/aurora-scratch");
const logo = await p.locator('[data-testid="aurora-logo"]').count();
if (logo < 1) { console.error("FAIL: logo not rendered"); process.exit(1); }
console.log("PASS: logo renders");

// reduced motion (OS-level): the pure-CSS @media (prefers-reduced-motion: reduce)
// rule stops the sweep with no JS dependency — deterministic and independent of the
// legacy motion provider (removed in Phase 1) that still also writes html[data-motion].
await p.emulateMedia({ reducedMotion: "reduce" });
await p.goto(base + "/aurora-scratch");
await p.waitForSelector('[data-testid="aurora-surface"]');
const animationName = await p.locator('[data-testid="aurora-surface"]').evaluate(
  (el) => getComputedStyle(el).animationName,
);
if (animationName !== "none") {
  console.error(`FAIL: reduced motion did not stop animation (animationName=${animationName})`);
  process.exit(1);
}
console.log("PASS: reduced motion stops gradient animation");

await b.close();
