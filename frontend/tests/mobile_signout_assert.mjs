/* Sign-out must be reachable on every RAIL-BEARING route on a phone.

   `.aurora-rail-foot { display: none }` at <=860px hid the profile AND the sign-out, and
   the only other logout (EyeconMenu) is rendered solely by Dashboard.tsx — so a trainee on
   /cases, /leaderboard or /admin had NO way to end their session. On a shared
   institutional device that is a real problem, not a cosmetic one.

   /chat and /flashcards are deliberately EXCLUDED: they are immersive and rail-less on a
   phone by design (aurora.css `.aurora-shell-immersive .aurora-rail { display: none }`) —
   each owns its own exit affordance and its own complete lockup. That exclusion is not
   taken on trust; part 3 asserts it, so if a rail ever appears there (or their lockup
   disappears) this test says so rather than silently passing.

   Run: node frontend/tests/mobile_signout_assert.mjs [base] */
import { chromium } from "playwright";
import { student, admin, seededContext } from "./_mocks.mjs";
import { VIEWPORTS } from "./_viewports.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const ok = (m) => console.log("PASS:", m);
const die = (m) => { console.error("FAIL:", m); process.exit(1); };
const b = await chromium.launch();
const ROUTES = ["/homepage", "/cases", "/leaderboard"];
const IMMERSIVE = ["/chat", "/flashcards"];

/* 1. The account button exists and is a real target on every route, at every phone size. */
for (const v of VIEWPORTS) {
  const ctx = await seededContext(b, base, student, { width: v.width, height: v.height }, { hasTouch: true, isMobile: true });
  for (const route of ROUTES) {
    const p = await ctx.newPage();
    await p.goto(base + route, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1400);
    const r = await p.evaluate(() => {
      const btn = document.querySelector(".aurora-rail-account");
      if (!btn) return { missing: true };
      const b = btn.getBoundingClientRect();
      const cs = getComputedStyle(btn);
      // Nothing may sit on top of it: the bar is the topmost chrome.
      const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return {
        w: b.width, h: b.height, x: b.x, right: b.right, bottom: b.bottom,
        vw: window.innerWidth, vh: window.innerHeight,
        display: cs.display, name: btn.getAttribute("aria-label"),
        covered: !(hit === btn || btn.contains(hit)),
      };
    });
    if (r.missing) die(`${v.tag} ${route}: no .aurora-rail-account — no sign-out reachable on a phone`);
    if (r.display === "none") die(`${v.tag} ${route}: account button is display:none`);
    if (r.w < 44 || r.h < 44) die(`${v.tag} ${route}: account button ${r.w}x${r.h} — under the 44px touch minimum`);
    if (r.right > r.vw + 1 || r.x < -1 || r.bottom > r.vh + 1) die(`${v.tag} ${route}: account button clipped (x=${r.x} right=${r.right} bottom=${r.bottom})`);
    if (r.covered) die(`${v.tag} ${route}: account button is covered by another element`);
    if (!r.name) die(`${v.tag} ${route}: account button has no accessible name`);
    await p.close();
  }
  ok(`${v.tag}: account button present, >=44x44 and unobstructed on all ${ROUTES.length} routes`);
  await ctx.close();
}

/* 2. It really signs out — the sheet opens, Sign out is a real target, and it logs out. */
for (const who of [{ u: student, n: "student" }, { u: admin, n: "admin" }]) {
  const ctx = await seededContext(b, base, who.u, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto(base + "/leaderboard", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1400);

  // The sheet is always in the DOM (it IS .aurora-rail-foot); CSS decides if it shows.
  const closed = await p.evaluate(() => getComputedStyle(document.querySelector(".aurora-rail-foot")).display);
  if (closed !== "none") die(`${who.n}: the account sheet is showing (display=${closed}) before it is tapped`);

  await p.click(".aurora-rail-account");
  await p.waitForTimeout(400);

  const sheet = await p.evaluate(() => {
    const s = document.querySelector(".aurora-rail-foot");
    if (getComputedStyle(s).display === "none") return { missing: true };
    const sb = s.getBoundingClientRect();
    const so = [...s.querySelectorAll("button")].find((el) => /sign out/i.test(el.textContent || ""));
    const ob = so?.getBoundingClientRect();
    // Rects ignore clipping, so hit-test: .aurora-rail-night sets overflow:hidden and
    // would clip a non-fixed sheet while the rect still read fine.
    const mid = so ? document.elementFromPoint(ob.x + ob.width / 2, ob.y + ob.height / 2) : null;
    return {
      x: sb.x, right: sb.right, top: sb.top, bottom: sb.bottom,
      vw: window.innerWidth, vh: window.innerHeight,
      signout: so ? { w: ob.width, h: ob.height, top: ob.top, bottom: ob.bottom } : null,
      signoutHittable: !!(mid && (mid === so || so.contains(mid))),
      // The lockup the rail-foot used to carry.
      hasSnec: !!s.querySelector(".aurora-snec"),
      hasEyebotMark: !!s.querySelector(".aurora-rail-lockup svg"),
    };
  });
  if (sheet.missing) die(`${who.n}: tapping the account button did not open the sheet`);
  if (!sheet.signoutHittable) die(`${who.n}: Sign out is not hit-testable — the sheet is clipped (overflow:hidden on the rail)`);
  if (sheet.x < -1 || sheet.right > sheet.vw + 1 || sheet.top < -1 || sheet.bottom > sheet.vh + 1)
    die(`${who.n}: sheet is off-screen (x=${sheet.x} right=${sheet.right} top=${sheet.top} bottom=${sheet.bottom} vw=${sheet.vw} vh=${sheet.vh})`);
  if (!sheet.signout) die(`${who.n}: sheet has no Sign out control`);
  if (sheet.signout.h < 44) die(`${who.n}: Sign out is ${sheet.signout.w}x${sheet.signout.h} — under the 44px touch minimum`);
  if (!sheet.hasSnec) die(`${who.n}: sheet carries no SNEC mark — the rail-foot lockup was not restored`);
  if (!sheet.hasEyebotMark) die(`${who.n}: sheet carries no EyeBot mark — a lone SNEC mark is never a lockup`);

  // Esc must close it (the app's popover convention).
  await p.keyboard.press("Escape");
  await p.waitForTimeout(250);
  if (await p.evaluate(() => getComputedStyle(document.querySelector(".aurora-rail-foot")).display) !== "none") die(`${who.n}: Esc did not close the sheet`);

  // And it must actually log out.
  await p.click(".aurora-rail-account");
  await p.waitForTimeout(300);
  await p.evaluate(() => [...document.querySelectorAll(".aurora-rail-foot button")].find((el) => /sign out/i.test(el.textContent || "")).click());
  await p.waitForTimeout(900);
  const gone = await p.evaluate(() => !localStorage.getItem("eyebot_user_v1"));
  if (!gone) die(`${who.n}: Sign out did not clear the session`);
  ok(`${who.n}: sheet opens, carries the EyeBot+SNEC lockup, Esc closes, Sign out (${sheet.signout.w.toFixed(0)}x${sheet.signout.h.toFixed(0)}) clears the session`);
  await ctx.close();
}

/* 3. The immersive exclusion, asserted rather than assumed: /chat and /flashcards are
      rail-less on a phone AND carry their own complete EyeBot+SNEC lockup. If either half
      of that stops being true, the routes are no longer legitimately exempt. */
{
  const ctx = await seededContext(b, base, student, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  for (const route of IMMERSIVE) {
    const p = await ctx.newPage();
    await p.goto(base + route, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1800);
    const r = await p.evaluate(() => {
      const vis = (el) => { if (!el) return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
      const rail = document.querySelector(".aurora-rail");
      return {
        railShown: !!rail && getComputedStyle(rail).display !== "none",
        snec: [...document.querySelectorAll(".aurora-snec")].some(vis),
        eyebot: [...document.querySelectorAll(".aurora-cobrand svg, .aurora-chat-name")].some(vis),
      };
    });
    if (r.railShown) die(`${route}: the rail is showing on a phone — it is immersive/rail-less by design; if this is intended it must carry a sign-out`);
    if (!r.snec || !r.eyebot) die(`${route}: rail-less surface without a complete lockup (snec=${r.snec} eyebot=${r.eyebot}) — a lone mark is never a lockup`);
    ok(`${route}: rail-less by design and carries its own EyeBot+SNEC lockup`);
    await p.close();
  }
  await ctx.close();
}

/* 4. Trainers/admins reach sign-out on their extra destination too. */
{
  const ctx = await seededContext(b, base, admin, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto(base + "/admin", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1600);
  const r = await p.evaluate(() => {
    const btn = document.querySelector(".aurora-rail-account");
    if (!btn) return { missing: true };
    const b = btn.getBoundingClientRect();
    return { w: b.width, h: b.height };
  });
  if (r.missing || r.w < 44 || r.h < 44) die(`admin /admin: account button ${r.missing ? "absent" : `${r.w}x${r.h}`}`);
  ok(`admin /admin: account button ${r.w}x${r.h}`);
  await ctx.close();
}

/* 5. Desktop must be untouched: the rail-foot keeps its own profile + sign-out, and the
      mobile account button must not appear. */
{
  const ctx = await seededContext(b, base, student, { width: 1440, height: 900 });
  const p = await ctx.newPage();
  await p.goto(base + "/homepage", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => ({
    foot: getComputedStyle(document.querySelector(".aurora-rail-foot")).display,
    signout: !!document.querySelector(".aurora-signout"),
    profile: !!document.querySelector(".aurora-profile"),
    snec: !!document.querySelector(".aurora-rail-foot .aurora-snec"),
    account: getComputedStyle(document.querySelector(".aurora-rail-account")).display,
  }));
  if (r.foot === "none") die("desktop: .aurora-rail-foot is hidden — desktop regressed");
  if (!r.signout || !r.profile || !r.snec) die(`desktop: rail-foot lost content (signout=${r.signout} profile=${r.profile} snec=${r.snec})`);
  if (r.account !== "none") die(`desktop: the mobile account button is visible (display=${r.account}) — desktop regressed`);
  ok("desktop 1440x900: rail-foot keeps profile + sign out + SNEC; mobile account button hidden");
  await ctx.close();
}

console.log("ALL MOBILE-SIGNOUT ASSERTIONS PASSED");
await b.close();
