/* No text in this app may render in the browser's default serif.
 *
 * This shipped, and shipped silently: on production, 184 of 222 visible text elements on
 * a phone (83%) computed to literally "Times New Roman" — including the whole OSCE rotate
 * gate and the EyeBot wordmark.
 *
 * The mechanism is a CSS trap worth knowing. `styles/fonts.css` is a relic of the retired
 * PHOTOPIC type stack and declares:
 *
 *     --font-body: var(--font-dm-sans), 'DM Sans', system-ui, sans-serif;
 *     body { font-family: var(--font-body); }
 *
 * `--font-dm-sans` no longer exists — layout.tsx ships Inter/Outfit/Manrope/Bricolage/
 * JetBrains/Playfair/Bungee under different names. A custom property whose value contains
 * an unresolvable var() becomes GUARANTEED-INVALID at computed-value time. It does not
 * fall back to the rest of the list: the ENTIRE declaration is void, so
 * `font-family: var(--font-body)` is invalid and font-family reverts to its initial value
 * — the browser default serif. The `'DM Sans', system-ui, sans-serif` tail is decoration;
 * it can never be reached.
 *
 * Worse, fonts.css is imported AFTER tokens.css, whose `body { font-family: var(--font-sans) }`
 * is correct — so the broken rule won purely on cascade order, and fonts.css's equally
 * invalid `--font-mono` clobbered the valid one from tokens.css for all 5 of its consumers.
 *
 * Nothing caught it because every check we had asks "is the text there?", never "is it in
 * the right typeface?" — and Times is perfectly legible, so screenshots look merely "a bit
 * off" rather than broken. That is exactly the phrasing in the original bug report.
 */
import { chromium } from "playwright";
import { student, admin, seededContext } from "./_mocks.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const ok = (m) => console.log("PASS:", m);
const fails = [];
const b = await chromium.launch();

const ROUTES = [
  ["/dashboard", student], ["/chat", student], ["/cases", student],
  ["/cases/C001", student], ["/flashcards", student], ["/leaderboard", student],
  ["/analytics", admin],
];

for (const [path, who] of ROUTES) {
  for (const vp of [{ w: 390, h: 844, touch: true }, { w: 1440, h: 900, touch: false }]) {
    const ctx = await seededContext(b, base, who, { width: vp.w, height: vp.h },
      vp.touch ? { hasTouch: true, isMobile: true } : {});
    const p = await ctx.newPage();
    try {
      await p.goto(base + path, { waitUntil: "domcontentloaded", timeout: 30000 });
      await p.waitForSelector(".aurora-shell, .flash-root", { timeout: 25000 });
      await p.waitForTimeout(2500);
      const r = await p.evaluate(() => {
        // The fallback resolves to the bare family with NO chain — that exactness is what
        // distinguishes it from a legitimate serif (Playfair/Instrument are authored
        // choices and always arrive as part of a var()-resolved list).
        const isFallback = (ff) => ff === '"Times New Roman"' || ff === "Times New Roman";
        let bad = 0; const ex = [];
        for (const el of document.querySelectorAll("body *")) {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3)
            .map((n) => n.textContent.trim()).join("");
          if (!own) continue;
          if (isFallback(cs.fontFamily)) { bad++; if (ex.length < 3) ex.push(own.slice(0, 24)); }
        }
        return { bad, ex, body: getComputedStyle(document.body).fontFamily };
      });
      const tag = `${path} @ ${vp.w}x${vp.h}`;
      if (isBadBody(r.body)) {
        fails.push(`${tag}: body computes to ${r.body} — a var() chain went guaranteed-invalid`);
      } else if (r.bad > 0) {
        fails.push(`${tag}: ${r.bad} text element(s) render in the default serif, e.g. ${r.ex.map((e) => `"${e}"`).join(", ")}`);
      } else {
        ok(`${tag}: no default-serif fallback (body = ${r.body.slice(0, 34)})`);
      }
    } catch (e) {
      fails.push(`${path} @ ${vp.w}x${vp.h}: ${String(e.message).split("\n")[0].slice(0, 80)}`);
    }
    await ctx.close();
  }
}
function isBadBody(ff) { return ff === '"Times New Roman"' || ff === "Times New Roman"; }

await b.close();
if (fails.length) { console.error("\n" + fails.map((f) => "FAIL: " + f).join("\n")); process.exit(1); }
console.log("\nALL FONT-FALLBACK ASSERTIONS PASSED");
