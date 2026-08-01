/* The privacy opt-out — the states AFTER the switch is flipped.

   `league_assert.mjs` proves the switch is reachable and POSTs. This covers what happens
   next, which is where a consent control actually fails:
     · a hidden student is told where they stand — they have NO row on the ladder, not even
       their own copy, so without this the opt-out costs them sight of their own progress
       and the control's own copy ("you'll still see where you stand") is a lie;
     · a FAILED save is reported — the switch snaps back to the server's value on error, so
       a silent failure leaves a student believing they are hidden when their supervisor can
       still see them;
     · the state survives a reload — it is a server column, and a localStorage-backed toggle
       would pass every in-page check and still fail this one;
     · the controls are tappable on a phone.

   The regression behind all of it: commit 214ab7f (2026-07-14) deleted the settings strip in
   a declutter sweep. `useSetLeaderboardPrefs` and the header's `settings` slot both survived,
   so nothing failed to compile and no backend test went red — the API was never broken, only
   unreachable. Reachability and consequences both need a browser to prove.

   Run:  node frontend/tests/leaderboard_privacy_assert.mjs [base]
*/
import { chromium } from "playwright";
import { student, seededContext, J } from "./_mocks.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
let failed = 0;
const ok = (m) => console.log("PASS:", m);
const bad = (m) => { console.error("FAIL:", m); failed++; };

/* "You" sits mid-ladder, so hiding visibly changes the board rather than trimming an end —
   a hidden student at either extreme would leave the visible order unchanged and could pass
   a leak check by luck. */
const ROWS = [
  { name: "Aisha R.",  role: "OT", xp: 12480, xp_total: 12480, level: 24, streak_days: 31 },
  { name: "You",       role: "OA", xp: 9200,  xp_total: 9200,  level: 19, streak_days: 9, is_you: true },
  { name: "Marcus L.", role: "OT", xp: 7635,  xp_total: 7635,  level: 17, streak_days: 6 },
  { name: "Siti N.",   role: "OA", xp: 6120,  xp_total: 6120,  level: 15, streak_days: 22 },
].map((e, i) => ({
  rank: i + 1, avatar_config: null, is_you: false, division: 2, rank_delta: null, ...e,
}));

const BASE_BOARD = { roles: ["OA", "OT"], division: 2, division_name: "Silver", promote_count: 2 };
const VISIBLE = {
  ...BASE_BOARD, entries: ROWS, you_hidden: false, display_name: null,
  you_would_be_rank: null, pool_size: 4,
};
/* What the server really returns once hidden: `rank_entries` drops the row entirely and the
   ranks close up, so there is no `is_you` anywhere — the would-be rank arrives instead, and
   pool_size falls because a hidden student holds no promotion slot. */
const HIDDEN = {
  ...BASE_BOARD,
  entries: ROWS.filter((e) => !e.is_you).map((e, i) => ({ ...e, rank: i + 1 })),
  you_hidden: true, display_name: null, you_would_be_rank: 2, pool_size: 3,
};

async function boardCtx(b, { board, prefsStatus = 200, state = null, touch = false } = {}) {
  const ctx = await seededContext(b, base, student,
    { width: touch ? 390 : 1280, height: touch ? 844 : 900 },
    touch ? { hasTouch: true, isMobile: true } : {});
  const posts = [];
  // General first, specific last: Playwright matches the LAST registered route, and
  // `**/api/leaderboard**` also matches `/api/leaderboard/prefs` — registering the board
  // route second would swallow every POST and silently fake a working toggle.
  await ctx.route("**/api/leaderboard**", (r) =>
    r.fulfill(J(state ? (state.hidden ? HIDDEN : VISIBLE) : board)));
  await ctx.route("**/api/leaderboard/prefs", async (r) => {
    posts.push(JSON.parse(r.request().postData() || "{}"));
    if (prefsStatus !== 200) return r.fulfill(J({ detail: "not available yet" }, prefsStatus));
    if (state) state.hidden = true;
    await r.fulfill(J({ ok: true }));
  });
  // No ceremony: a full-screen overlay would swallow every click here.
  await ctx.route("**/api/league/result", (r) => r.fulfill(J({ result: null })));
  return { ctx, posts };
}

async function openBoard(ctx) {
  const p = await ctx.newPage();
  await p.goto(base + "/leaderboard", { waitUntil: "domcontentloaded" });
  await p.waitForSelector('[data-testid="leaderboard-root"]', { timeout: 20000 });
  await p.waitForSelector('[data-testid="lb-hide-switch"]', { timeout: 20000 }).catch(() => {});
  // Measure SETTLED. The board's entrance animations (`lb-rise`, `bm-rise`) scale and
  // translate their subtrees, so a control read mid-flight measures fractionally short —
  // a 44px switch reads 43.7 and a tap-target check fails against CSS that is correct.
  // Infinite animations (the star drift) are excluded: they never finish.
  await p.waitForFunction(() => {
    const finite = document.getAnimations().filter((a) => {
      const t = a.effect?.getComputedTiming?.();
      return typeof a.animationName === "string" && (!t || t.iterations !== Infinity);
    });
    return finite.every((a) => a.playState === "finished" || a.playState === "idle");
  }, null, { timeout: 15000 }).catch(() => {});
  return p;
}

/* Driving a missing switch throws a 30s timeout and kills the run with a stack trace instead
   of a readable list — and a missing switch IS the regression, so it must report, not crash. */
async function requireSwitch(p) {
  const sw = p.locator('[data-testid="lb-hide-switch"]');
  if (await sw.count() === 0) {
    bad("the hide-me switch is not on the board — students cannot opt out (this is 214ab7f)");
    return null;
  }
  return sw;
}

const b = await chromium.launch();

/* ── 1. hiding removes you from the ladder and tells you where you'd be ────── */
{
  const state = { hidden: false };
  const { ctx, posts } = await boardCtx(b, { state });
  const p = await openBoard(ctx);
  const sw = await requireSwitch(p);

  if (sw) {
    if (await sw.getAttribute("aria-checked") === "false") ok('the switch reads "not hidden" for a visible student');
    else bad("the switch does not reflect the visible state");

    await sw.click();
    await p.waitForFunction(() => !!document.querySelector('[data-testid="lb-would-be-rank"]'), null, { timeout: 10000 })
      .catch(() => {});

    if (posts.length === 1 && posts[0].hidden === true) ok("flipping the switch POSTs {hidden:true}");
    else bad(`expected one POST of {hidden:true}, got ${JSON.stringify(posts)}`);

    // The board must re-read after the mutation — a stale cache would keep showing the
    // student on a board they just left.
    const names = await p.locator(".lg-nm").allTextContents();
    if (!names.some((n) => n.trim().startsWith("You"))) ok("the viewer disappears from their own ladder once hidden");
    else bad(`"You" is still rendered on the ladder after hiding: ${JSON.stringify(names)}`);

    const note = p.locator('[data-testid="lb-would-be-rank"]');
    if (await note.count() === 1 && /#2/.test(await note.textContent() ?? "")) {
      ok("a hidden student is told where they would stand (#2)");
    } else {
      bad(`the would-be-rank line is missing or wrong: ${await note.textContent().catch(() => "absent")}`);
    }
  }
  await ctx.close();
}

/* ── 2. a visible student is never shown a would-be rank ───────────────────── */
{
  const { ctx } = await boardCtx(b, { board: VISIBLE });
  const p = await openBoard(ctx);
  // They have a real ranked row; a second number would be a conflicting source of truth.
  if (await p.locator('[data-testid="lb-would-be-rank"]').count() === 0) {
    ok("no would-be rank for a visible student (their real rank is the only one)");
  } else {
    bad("a visible student is shown a would-be rank alongside their real rank");
  }
  await ctx.close();
}

/* ── 3. THE REPEAT CASE: it survives a reload ──────────────────────────────── */
{
  // Server-side state, so a fresh load — and a fresh device — must still read hidden.
  const { ctx } = await boardCtx(b, { board: HIDDEN });
  const p = await openBoard(ctx);
  const sw = await requireSwitch(p);

  if (sw) {
    if (await sw.getAttribute("aria-checked") === "true") {
      ok("still hidden after a fresh load, and the switch can turn it back off");
    } else {
      bad("the hidden state did not survive a reload — the switch shows the wrong position");
    }
    if (await p.locator('[data-testid="lb-would-be-rank"]').count() === 1) {
      ok("the standing is still shown on a fresh load");
    } else {
      bad("a returning hidden student is not told where they stand");
    }
  }
  await ctx.close();
}

/* ── 4. a FAILED save must say so ──────────────────────────────────────────── */
{
  // /prefs 503s until migration 008's columns exist. On failure the switch just snaps back.
  // Silently. A student who reads that as "hidden" is still on a supervisor-visible board.
  const { ctx } = await boardCtx(b, { board: VISIBLE, prefsStatus: 503 });
  const p = await openBoard(ctx);
  const sw = await requireSwitch(p);

  if (sw) {
    await sw.click();
    const err = p.locator(".bs-err");
    await err.waitFor({ timeout: 10000 }).catch(() => {});

    if (await err.count() === 1) ok("a failed save is reported to the student");
    else bad("a failed save is silent — the student cannot tell the opt-out did not apply");

    if (await sw.getAttribute("aria-checked") === "false") {
      ok('the switch still reads "not hidden" after a failed save (no false confirmation)');
    } else {
      bad("the switch shows hidden after a save that failed — a false consent confirmation");
    }
    if (await p.locator('[data-testid="lb-would-be-rank"]').count() === 0) {
      ok("the board does not claim a hidden standing after a failed save");
    } else {
      bad("the board claims the student is hidden after a failed save");
    }
  }
  await ctx.close();
}

/* ── 5. the controls are tappable on a phone ───────────────────────────────── */
{
  // `hasTouch` is required: without it the page runs fine-pointer, the (pointer:coarse)
  // tier never applies, and this would pass against desktop CSS and prove nothing.
  const { ctx } = await boardCtx(b, { board: HIDDEN, touch: true });
  const p = await openBoard(ctx);

  if (await requireSwitch(p)) {
    const small = await p.evaluate(() =>
      [...document.querySelectorAll(".bs button, .bs input")]
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { cls: (el.className || "").toString().split(" ")[0], w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
        })
        .filter((t) => t.h < 44 || t.w < 44));
    if (small.length === 0) ok("every privacy control clears 44px on a touch phone");
    else bad(`sub-44px privacy control(s): ${small.map((t) => `.${t.cls} ${t.w}x${t.h}`).join(" · ")}`);

    const over = await p.evaluate(() => {
      const el = document.querySelector(".bs");
      return el ? +(el.getBoundingClientRect().right - document.documentElement.clientWidth).toFixed(1) : null;
    });
    if (over !== null && over <= 0) ok("the privacy panel stays inside the 390px viewport");
    else bad(`the privacy panel overflows the viewport by ${over}px at 390px`);
  }
  await ctx.close();
}

await b.close();
if (failed) { console.error(`\n${failed} LEADERBOARD PRIVACY ASSERTION(S) FAILED`); process.exit(1); }
console.log("\nALL LEADERBOARD PRIVACY ASSERTIONS PASSED");
