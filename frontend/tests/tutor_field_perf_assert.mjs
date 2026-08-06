/* The Tutor's constellation must never starve the page it decorates.
 *
 * ChatField drives a vanilla rAF loop behind /chat. It used to reschedule itself
 * unconditionally and compare every point pair with Math.hypot — ~7,750 pairs a frame at
 * 1440x900. On a developer box that fits inside one vsync and looks free; on a GPU-less,
 * CPU-contended CI runner one frame took the better part of a second, and because the loop
 * re-armed immediately the renderer main thread never came back. Playwright runs its
 * actionability check AND the text insertion INSIDE that renderer, so the tutor composer's
 * `fill()` queued behind the constellation and blew the 30s budget — the call log showed a
 * single "attempting fill action" with no "element is not visible" and no retry, i.e. the
 * injected call never returned at all. The field was never disabled; the thread was gone.
 * (aurora_assert.mjs:435, intermittently red on unrelated commits.)
 *
 * The invariant is therefore about main-thread OCCUPANCY, not about frame rate: a
 * background decoration may not multiply the page's input latency.
 *
 * Measuring that portably is the trap this harness exists to avoid:
 *   - An absolute frame-time budget is meaningless. rAF is vsync-capped, so on any healthy
 *     machine the broken and the fixed build BOTH read ~17ms and the assertion proves
 *     nothing; pick a threshold low enough to discriminate and it goes red on whichever
 *     runner happens to be slow that morning — trading one flake for another.
 * So we A/B the SAME page on the SAME machine in the SAME run: once with the loop live, once
 * with it neutralised (ChatField bails when getContext returns null), and assert the loop's
 * cost stays within a small multiple of the page without it. That ratio is self-calibrating
 * — a slow runner slows both arms — which is exactly what an absolute budget cannot be.
 * CPU throttling is still needed to lift the signal off the vsync floor: unthrottled, both
 * arms sit at the 60Hz cap and the ratio is 1 no matter how heavy the loop is.
 */
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:3000";
const THROTTLE = 16;   // amplifies main-thread cost; both arms pay it, so the ratio holds
const SAMPLE_MS = 1200;
const SAMPLES = 3;
/* Take the MIN of the samples, not the mean. The noise here is one-sided — a background
   process steals the thread and inflates a sample; nothing makes a frame cheaper than it is
   — so the minimum is the robust estimate of true cost and the mean just imports whatever
   else the runner was doing. It matters because the denominator is small (tens of ms) and
   the ratio amplifies its jitter: single 2.5s samples put the fixed build anywhere in
   0.7x-3.3x, which would have made THIS harness the next intermittent failure.
   Calibrated by running BOTH builds through this statistic, not by reasoning about it:
   fixed 0.7x-2.8x, and the pre-fix ChatField (restored and rebuilt) 6.3x-7.0x. 5x is the
   empty middle. */
const MAX_RATIO = 5;

const studentUser = {
  full_name: "Test Student", email: "student@snec.com.sg", student_id: "S001",
  role: "student", student_role: "OA", must_change: false,
};
const JSON_OK = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

// CI runs chromium-headless-shell on a runner with no GPU, so the canvas rasterises on the
// CPU. Force the same path locally or the defect simply does not show up.
const b = await chromium.launch({ args: ["--disable-gpu", "--disable-gpu-compositing"] });

async function frameCost(neutralised) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  if (neutralised) {
    // ChatField's effect returns early when it cannot get a 2d context, so this removes the
    // loop and nothing else — every CSS animation on /chat still runs in both arms.
    await ctx.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...a) {
        if (this.classList.contains("aurora-chat-field")) return null;
        return orig.apply(this, a);
      };
    });
  }
  await ctx.addInitScript((u) => {
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
    localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
    localStorage.setItem("eyebot_checkin_date", new Date().toLocaleDateString("en-CA"));
    localStorage.setItem("eyebot_tour_seen", "true");
  }, studentUser);
  await ctx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: new URL(base).hostname, path: "/" }]);
  await ctx.route("**/api/**", (r) => r.fulfill(JSON_OK({})));
  await ctx.route("**/api/auth/me", (r) => r.fulfill(JSON_OK(studentUser)));

  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });

  await p.goto(base + "/chat", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".aurora-composer-field", { timeout: 90000 });
  await p.waitForTimeout(1200); // let the landing settle before sampling

  const sample = () => p.evaluate((ms) => new Promise((resolve) => {
    const f = []; let last = performance.now(); let stop = false;
    const tick = () => { const n = performance.now(); f.push(n - last); last = n; if (!stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    setTimeout(() => { stop = true; f.sort((x, y) => x - y); resolve(Math.round(f[Math.floor(f.length / 2)] || 0)); }, ms);
  }), SAMPLE_MS);

  const taken = [];
  for (let i = 0; i < SAMPLES; i++) taken.push(await sample());
  const median = Math.min(...taken);

  // The behavioural half: the very call that goes red in CI must still land promptly.
  const t0 = Date.now();
  await p.locator(".aurora-composer-field").fill("Tell me about the optic disc", { timeout: 30000 });
  const fillMs = Date.now() - t0;

  await ctx.close();
  return { median, fillMs };
}

const off = await frameCost(true);
const on = await frameCost(false);
const ratio = on.median / Math.max(off.median, 1);

console.log(`constellation off: frame ${off.median}ms, fill ${off.fillMs}ms`);
console.log(`constellation on : frame ${on.median}ms, fill ${on.fillMs}ms  (ratio ${ratio.toFixed(1)}x)`);

if (ratio > MAX_RATIO) {
  console.error(`FAIL: the ChatField constellation costs ${ratio.toFixed(1)}x the main thread of the same page without it (budget ${MAX_RATIO}x) — an unthrottled decoration starves the tutor composer, which is what makes aurora_assert's fill() time out on a slow runner`);
  process.exit(1);
}
console.log(`PASS: ChatField stays within ${MAX_RATIO}x of the page's own main-thread cost — the tutor composer keeps its input latency`);
await b.close();
