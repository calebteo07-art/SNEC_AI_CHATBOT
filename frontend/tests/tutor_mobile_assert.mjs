#!/usr/bin/env node
/* Tutor on a phone.
 *
 * 1. The 5 SUGGESTIONS chips (Tutor.tsx:32-38) wrap to 3-4 rows above the composer on a
 *    390px screen and crowd out the thread. The user asked for them gone on mobile
 *    ("i want to remove the shortcut questions in tutor for mobile", 2026-07-17).
 *    DESKTOP KEEPS THEM — that half of the assertion is what makes this a refit rather
 *    than a deletion, and it is why the fix is CSS (`.aurora-chat-followups{display:none}`
 *    at the phone tiers) and not a JS `isMobile` branch: a hydration branch would have to
 *    guess the viewport during SSR and would flash the wrong markup.
 * 2. `.aurora-chat-back` is a 32x32 tap target in LANDSCAPE (measured 32x32 at 844x390
 *    and 932x430; portrait was already 44 via the max-width:700px block — that block is
 *    width-gated, and a landscape phone is 844-932px WIDE, so it never matched).
 *
 * Usage: node --unhandled-rejections=warn tests/tutor_mobile_assert.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { student, seededContext } from "./_mocks.mjs";
import { VIEWPORTS, DESKTOP } from "./_viewports.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const ok = (m) => console.log("PASS:", m);
const die = (m) => { console.error("FAIL:", m); process.exit(1); };
const b = await chromium.launch();

/* /chat opens on the greeting LANDING; the followups + the back arrow only exist once
   you're in the conversation, so every case has to actually start one. */
async function openConversation(p) {
  await p.goto(base + "/chat", { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".aurora-composer-field", { timeout: 20000 });
  await p.locator(".aurora-composer-field").first().fill("What is the cup-to-disc ratio?");
  await p.locator(".aurora-composer-field").first().press("Enter");
  await p.waitForSelector(".aurora-chat-convo", { timeout: 15000 });
  await p.waitForTimeout(1200); // phase leaving -> chat (460ms) + entrance
}

for (const v of [...VIEWPORTS, DESKTOP]) {
  const ctx = await seededContext(
    b, base, student,
    { width: v.width, height: v.height },
    v.touch ? { hasTouch: true, isMobile: true } : {},
  );
  const p = await ctx.newPage();
  await openConversation(p);

  const r = await p.evaluate(() => {
    const f = document.querySelector(".aurora-chat-followups");
    const back = document.querySelector(".aurora-chat-back");
    const bb = back?.getBoundingClientRect();
    return {
      followupsExist: !!f,
      followupsDisplay: f ? getComputedStyle(f).display : null,
      chipCount: f ? f.querySelectorAll("button").length : 0,
      chipsPainted: f ? [...f.querySelectorAll("button")].filter((c) => c.getBoundingClientRect().height > 0).length : 0,
      back: bb ? { w: Math.round(bb.width), h: Math.round(bb.height) } : null,
    };
  });

  if (v.touch) {
    // The chips must be GONE — not merely transparent. A 0-height painted chip still
    // steals the composer's space, which is the actual complaint.
    if (r.followupsDisplay !== "none") {
      die(`${v.tag}: suggestion chips still shown (display=${r.followupsDisplay}, ${r.chipsPainted} chips painted)`);
    }
    ok(`${v.tag}: suggestion chips removed on mobile`);
  } else {
    // Desktop is untouched — this is the control.
    if (!r.followupsExist || r.followupsDisplay === "none" || r.chipsPainted !== 5) {
      die(`${v.tag}: DESKTOP must keep all 5 suggestion chips (display=${r.followupsDisplay}, painted=${r.chipsPainted})`);
    }
    ok(`${v.tag}: desktop keeps all 5 suggestion chips`);
  }

  if (v.touch) {
    if (!r.back) die(`${v.tag}: .aurora-chat-back missing`);
    if (r.back.w < 44 || r.back.h < 44) die(`${v.tag}: .aurora-chat-back is ${r.back.w}x${r.back.h} — under the 44x44 touch target`);
    ok(`${v.tag}: .aurora-chat-back is ${r.back.w}x${r.back.h}`);
  }

  await ctx.close();
}

console.log("ALL TUTOR-MOBILE ASSERTIONS PASSED");
await b.close();
