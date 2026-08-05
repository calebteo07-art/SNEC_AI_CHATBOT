/* Screenshots of The League, one per division, on the mocked board league_assert uses.
   Not a gate — this is the "does it READ as vibrant" half that the ARCADE pass learned the
   numbers alone cannot make (docs/design-locks.md: "the numbers pass" and "it reads as
   vibrant" are different claims).

   Run:  node frontend/tests/_league_shot.mjs [base] [outDir]
*/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { student, seededContext, J } from "./_mocks.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3000";
const out = process.argv[3] ?? ".tmp/league-shots";
mkdirSync(out, { recursive: true });

const LADDER = [1, 1.1, 1.25, 1.5, 2];
const NAMES = ["Ember", "Volt", "Solar", "Nova", "Prism"];
const ROLES = ["OA", "OT", "PSA"];
const NICK = ["Aria", "Bek", "Chen", "Dara", "Evan", "Faye", "Gil", "Hana", "Ivo", "Jae",
  "Kit", "Lena", "Mira", "Noor", "Omar", "Pia", "Quin", "Rio", "Suri", "Tam",
  "Uma", "Vik", "Wren", "Xia", "Yaz", "Zev", "Ana"];

const entries = NICK.map((n, i) => ({
  rank: i + 1, user_id: `u${i}`, name: `${n} Tan`, xp: 7400 - i * 214,
  level: 12 - Math.floor(i / 4), streak: (i * 3) % 9, role: ROLES[i % 3],
  delta: i % 5 === 0 ? 2 : i % 5 === 1 ? -1 : i % 5 === 2 ? 0 : null,
  is_you: i === 6, avatar_config: null,
}));

const board = (division) => ({
  entries, you: { ...entries[6] }, week_start: "2026-08-03",
  closes_at: "2026-08-10T16:00:00Z", role: null,
  division, division_name: NAMES[division - 1], pool_size: 30, promote_count: 3,
  division_multiplier: LADDER[division - 1], division_multipliers: LADDER,
});

const b = await chromium.launch();
for (const vp of [{ w: 1489, h: 838, tag: "laptop" }, { w: 390, h: 844, tag: "phone", touch: true }]) {
  for (let d = 1; d <= 5; d++) {
    const ctx = await seededContext(b, base, student, { width: vp.w, height: vp.h },
      vp.touch ? { hasTouch: true, isMobile: true } : {});
    await ctx.route("**/api/leaderboard**", (r) =>
      r.request().method() === "POST" ? r.fulfill(J({ ok: true })) : r.fulfill(J(board(d))));
    await ctx.route("**/api/league/result", (r) => r.fulfill(J({ result: null })));
    await ctx.route("**/api/league/result/seen", (r) => r.fulfill(J({ ok: true })));
    const p = await ctx.newPage();
    await p.goto(base + "/leaderboard", { waitUntil: "domcontentloaded" });
    await p.waitForSelector(".lg-row", { timeout: 20000 });
    await p.waitForFunction(() => document.getAnimations()
      .filter((a) => (a.effect?.getComputedTiming().iterations ?? 1) !== Infinity)
      .every((a) => a.playState !== "running"), null, { timeout: 8000 }).catch(() => {});
    // The board scrolls itself to "you" on mount; the head is the half being judged here.
    await p.evaluate(() => { document.querySelector(".aurora-main-scroll")?.scrollTo(0, 0); });
    const f = `${out}/${vp.tag}-${d}-${NAMES[d - 1].toLowerCase()}.png`;
    await p.screenshot({ path: f });
    console.log("shot", f);
    await ctx.close();
  }
}
await b.close();
