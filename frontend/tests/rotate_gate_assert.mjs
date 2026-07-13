/* OSCE landscape gate — regression harness. The three-pane station is unusable on a
   portrait phone, so a touch device held in portrait must get a full-screen "rotate to
   landscape" takeover, and turning to landscape must reveal the station. A desktop
   (fine pointer) narrow window must never be nagged. */
import { chromium } from "playwright";
import { student, seededContext } from "./_mocks.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3000";
const ok = (m) => console.log("PASS:", m);
const die = (m) => { console.error("FAIL:", m); process.exit(1); };

const b = await chromium.launch();

// 1. Touch phone in portrait → the rotate gate takes over.
const phone = await seededContext(b, base, student, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
const p = await phone.newPage();
await p.goto(base + "/cases/C001", { waitUntil: "domcontentloaded" });
await p.waitForSelector(".rotate-gate", { timeout: 15000 });
if (!(await p.locator(".rotate-gate").isVisible())) die("rotate gate must be visible on a touch phone in portrait");
const box = await p.locator(".rotate-gate").boundingBox();
if (!box || box.width < 380 || box.height < 800) die(`rotate gate must cover the full viewport, got ${JSON.stringify(box)}`);
ok("portrait touch phone → rotate gate covers the station");

// 2. Turn to landscape → gate hides, station usable.
await p.setViewportSize({ width: 844, height: 390 });
await p.waitForTimeout(300);
if (await p.locator(".rotate-gate").isVisible()) die("rotate gate must hide when the phone is turned to landscape");
await p.waitForSelector('[data-testid="station"]', { timeout: 15000 });
if (!(await p.locator('[data-testid="station"]').isVisible())) die("station must be usable in landscape");
ok("landscape → rotate gate hidden, station usable");
await phone.close();

// 3. Desktop (fine pointer) in a narrow portrait window → never nagged.
const desk = await seededContext(b, base, student, { width: 560, height: 900 });
const d = await desk.newPage();
await d.goto(base + "/cases/C001", { waitUntil: "domcontentloaded" });
await d.waitForSelector('[data-testid="station"]', { timeout: 15000 });
await d.waitForTimeout(300);
if (await d.locator(".rotate-gate").isVisible()) die("rotate gate must NOT show on a desktop (fine pointer), even in a narrow window");
ok("desktop narrow portrait → no rotate gate (fine pointer)");
await desk.close();

console.log("ALL ROTATE-GATE ASSERTIONS PASSED");
await b.close();
