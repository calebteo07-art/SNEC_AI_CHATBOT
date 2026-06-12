#!/usr/bin/env node
/* PHOTOPIC visual sweep harness.
 * Drives every route with mocked APIs and saves screenshots to repo root.
 *
 * Usage:  node tests/visual_sweep.mjs <prefix> [baseUrl] [route ...]
 *   e.g.  node tests/visual_sweep.mjs p1
 *         node tests/visual_sweep.mjs p1-mobile http://127.0.0.1:3000 /dashboard
 *
 * Gotcha (from v1): the service worker bypasses route interception — always
 * stub navigator.serviceWorker.register before page scripts run.
 */
import { chromium } from "playwright";

const prefix = process.argv[2] ?? "sweep";
const base = process.argv[3] ?? "http://127.0.0.1:3000";
const only = process.argv.slice(4);

const J = (body, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const student = {
  full_name: "Test Student", email: "student@snec.com.sg", student_id: "S001",
  role: "student", student_role: "OA", must_change: false,
};
const admin = {
  full_name: "Site Admin", email: "admin@snec.com.sg", student_id: "A001",
  role: "admin", student_role: "", must_change: false,
};
const progress = {
  xp: 1240, hearts: 4, level: 7, streak: 6, session_count: 18,
  learning_velocity: "improving",
  weak_topics: ["Glaucoma staging", "Cataract grading"],
  topic_performance: [
    { topic: "Anterior segment", score: 8 },
    { topic: "Glaucoma", score: 5 },
    { topic: "Retina", score: 7 },
  ],
  sessions: [
    { session_id: "sess-1", timestamp: new Date(Date.now() - 86400000).toISOString(), topic: "Cornea", summary: "Reviewed keratometry basics and corneal layers.", mode: "chat" },
    { session_id: "sess-2", timestamp: new Date(Date.now() - 3600000).toISOString(), topic: "Glaucoma", summary: "Case simulation: acute angle closure.", mode: "case" },
  ],
};
const mkCase = (id, title, diff, topic, name, age, pc) => ({
  case_id: id, title, difficulty: diff, topic, estimated_minutes: 12,
  patient: { name, age, presenting_complaint: pc },
});
const cases = { cases: [
  mkCase("C001", "Sudden painful red eye", "intermediate", "Glaucoma", "Mdm Tan", 64, "Acute pain with halos around lights"),
  mkCase("C002", "Gradual vision loss", "beginner", "Cataract", "Mr Lim", 71, "Blurred near vision over months"),
  mkCase("C003", "Flashes and floaters", "advanced", "Retina", "Ms Wong", 55, "New floaters since yesterday"),
] };

async function mockApis(ctx, user) {
  await ctx.route("**/api/**", (r) => r.fulfill(J({ error: "not mocked" }, 404)));
  await ctx.route("**/api/auth/me", (r) => r.fulfill(J(user)));
  await ctx.route("**/api/gamification/sync", (r) => r.fulfill(J({ ok: true })));
  await ctx.route("**/api/progress", (r) => r.fulfill(J(progress)));
  await ctx.route("**/api/checkin/status", (r) => r.fulfill(J({ done: false, streak: 6, weak_topic: "Glaucoma staging" })));
  await ctx.route("**/api/checkin/question", (r) => r.fulfill(J({ question: "Which corneal layer regenerates after abrasion?", topic: "Cornea" })));
  await ctx.route("**/api/checkin/answer", (r) => r.fulfill(J({ correct: true, feedback: "The epithelium regenerates rapidly within 24-48 hours.", streak: 7 })));
  await ctx.route("**/api/cases", (r) => r.fulfill(J(cases)));
  await ctx.route("**/api/cases/C001", (r) => r.fulfill(J(cases.cases[0])));
  await ctx.route("**/api/cases/C001/checklist", (r) => r.fulfill(J({ checklist: { steps: ["History of presenting complaint", "Visual acuity", "IOP measurement"] } })));
  await ctx.route("**/api/flashcards/generate", (r) => r.fulfill(J([
    { card_id: "f1", front: "Normal IOP range?", back: "10-21 mmHg", topic_tag: "glaucoma", repetitions: 0, easiness: 2.5, interval_days: 1 },
    { card_id: "f2", front: "Most common cause of gradual painless vision loss in the elderly?", back: "Cataract", topic_tag: "cataract", repetitions: 1, easiness: 2.6, interval_days: 3 },
  ])));
  await ctx.route("**/api/study-suggestion", (r) => r.fulfill(J({ suggestion: "Review glaucoma staging before your next case.", topic: "Glaucoma" })));
  await ctx.route("**/api/chat", (r) => r.fulfill({
    status: 200, contentType: "text/event-stream",
    body: 'data: {"text":"Mock stream: the "}\n\ndata: {"text":"anterior chamber angle is assessed with gonioscopy."}\n\ndata: [DONE]\n\n',
  }));
  await ctx.route("**/api/supervisor/cohort", (r) => r.fulfill(J({ total_students: 24, active_this_week: 17, at_risk_count: 3, weakest_topics: ["Glaucoma staging", "OCT interpretation"] })));
  await ctx.route("**/api/supervisor/insights", (r) => r.fulfill(J({ narrative: "Cohort momentum is improving; glaucoma staging remains the weakest area this week." })));
  await ctx.route("**/api/supervisor/benchmarks", (r) => r.fulfill(J({ topics: [{ topic: "Glaucoma staging", cohort_avg: 5.2, target: 7 }, { topic: "OCT interpretation", cohort_avg: 6.1, target: 7 }] })));
  await ctx.route("**/api/supervisor/at-risk", (r) => r.fulfill(J({ students: [{ student_id: "S009", last_active: new Date(Date.now() - 9 * 86400000).toISOString(), days_inactive: 9, weak_topics: ["Glaucoma staging", "OCT interpretation"], weak_count: 4 }] })));
  await ctx.route("**/api/admin/students", (r) => r.fulfill(J({ students: [{ student_id: "S001", full_name: "Test Student", email: "student@snec.com.sg", role: "OA", session_count: 18, streak: 6, last_active: new Date().toISOString(), learning_velocity: "improving" }] })));
  await ctx.route("**/api/admin/approved", (r) => r.fulfill(J({ students: [{ email: "student@snec.com.sg", full_name: "Test Student", role: "OA", added_by: "admin", added_at: new Date().toISOString(), student_id: "S001" }] })));
  await ctx.route("**/api/admin/activity", (r) => r.fulfill(J({ feed: [{ type: "chat", student_id: "S001", name: "Test Student", detail: "Asked about gonioscopy", timestamp: new Date().toISOString(), token_count: 412 }] })));
  await ctx.route("**/api/admin/token-summary", (r) => r.fulfill(J({ total_tokens: 48213, by_student: [{ student_id: "S001", tokens: 48213 }] })));
}

async function seededContext(browser, user, viewport) {
  const ctx = await browser.newContext({ viewport: viewport ?? { width: 1440, height: 810 } });
  await ctx.addInitScript(([u]) => {
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
    try { indexedDB.deleteDatabase("eyebot"); } catch {}
    if (u) {
      localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
      localStorage.setItem("eyebot_checkin_date", new Date().toDateString());
      localStorage.setItem("eyebot_tour_seen", "true");
    }
  }, [user]);
  if (user) {
    const host = new URL(base).hostname;
    await ctx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: host, path: "/" }]);
  }
  await mockApis(ctx, user ?? student);
  return ctx;
}

async function sweep(ctx, routes, label) {
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e?.message ?? e).slice(0, 140)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/webpack-hmr|WebSocket/.test(m.text())) errs.push("console: " + m.text().slice(0, 140));
  });
  for (const r of routes) {
    errs.length = 0;
    await page.goto(base + r, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(2200);
    const name = `${prefix}${r === "/" ? "-login" : r.replace(/\//g, "-")}.png`;
    await page.screenshot({ path: name, fullPage: false });
    const status = errs.length ? JSON.stringify(errs.slice(0, 2)) : "CLEAN";
    console.log(`${label} ${r.padEnd(18)} -> ${page.url().replace(base, "") || "/"}  ${status}`);
  }
  await page.close();
}

const STUDENT_ROUTES = ["/", "/checkin", "/dashboard", "/cases", "/flashcards", "/summary", "/progress", "/profile", "/chat"];
const ADMIN_ROUTES = ["/admin", "/admin/students", "/admin/accounts", "/admin/activity"];
const SUPERVISOR_ROUTES = ["/supervisor"];

const browser = await chromium.launch();
if (only.length > 0) {
  const ctx = await seededContext(browser, student);
  await sweep(ctx, only, "custom ");
  await ctx.close();
} else {
  // Login page in a clean (signed-out) context so it doesn't redirect
  const clean = await seededContext(browser, null);
  await clean.route("**/api/auth/me", (r) => r.fulfill(J({ error: "unauthenticated" }, 401)));
  await sweep(clean, ["/"], "public ");
  await clean.close();

  const sctx = await seededContext(browser, student);
  await sweep(sctx, STUDENT_ROUTES.slice(1), "student");
  await sctx.close();

  const supctx = await seededContext(browser, { ...student, role: "supervisor" });
  await sweep(supctx, SUPERVISOR_ROUTES, "superv ");
  await supctx.close();

  const actx = await seededContext(browser, admin);
  await sweep(actx, ADMIN_ROUTES, "admin  ");
  await actx.close();
}
await browser.close();
console.log("sweep complete");
