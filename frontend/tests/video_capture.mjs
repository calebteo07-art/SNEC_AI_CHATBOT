// Records live feature clips for the EyeBot marketing video.
// Usage (app must be serving on :3000):
//   node tests/video_capture.mjs            -> records all specs
//   node tests/video_capture.mjs 04_livingeye  -> records only that one
import { chromium } from "playwright";
import { mockApis, student } from "./_mocks.mjs";
import { mkdirSync, renameSync, readdirSync } from "fs";
import { join } from "path";

const BASE = "http://127.0.0.1:3000";
const OUT = "../.tmp/video/live";           // relative to frontend/
const VP = { width: 1920, height: 1080 };
const only = process.argv[2] || "";

async function ctxFor(browser, dir) {
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: VP, recordVideo: { dir, size: VP } });
  await ctx.addInitScript((u) => {
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
    try { indexedDB.deleteDatabase("eyebot"); } catch {}
    localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
    sessionStorage.setItem("eyebot_checkin_session", "1");
    localStorage.setItem("eyebot_tour_seen", "true");
  }, student);
  await ctx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: "127.0.0.1", path: "/" }]);
  await mockApis(ctx, student);
  return ctx;
}

async function record(browser, name, route, interact) {
  if (only && only !== name) return;
  const dir = join(OUT, name);
  const ctx = await ctxFor(browser, dir);
  const page = await ctx.newPage();
  await page.goto(BASE + route, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.mouse.move(960, 540);           // neutral cursor — avoid the auto-expanding rail
  await page.waitForTimeout(1100);
  await interact(page);
  await page.waitForTimeout(1300);
  await ctx.close();                         // finalizes the webm
  const f = readdirSync(dir).find((x) => x.endsWith(".webm"));
  renameSync(join(dir, f), join(OUT, name + ".webm"));
  console.log("captured", name);
}

const browser = await chromium.launch();

// 03 - AI Tutor: type a simple human question, watch the grounded answer stream in.
await record(browser, "03_chat", "/chat", async (page) => {
  const box = page.locator('textarea, input[type="text"]').first();
  await box.click().catch(() => {});
  await box.type("What is a cataract?", { delay: 55 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter").catch(() => {});
  await page.waitForTimeout(3500);           // answer streams (mock SSE)
});

// 04 - Virtual Patients: see the Living Eye, click into a patient, type to them.
await record(browser, "04_livingeye", "/cases", async (page) => {
  await page.waitForTimeout(1500);           // hold on the Living Eye atlas
  const link = page.locator('a[href*="/cases/C0"]').first();
  if (await link.count()) await link.click().catch(() => {});
  else await page.getByText(/Mdm Tan/i).first().click().catch(() => {});
  await page.waitForTimeout(2300);           // consult opens
  if (!/\/cases\/C0/.test(page.url())) {
    await page.goto(BASE + "/cases/C001", { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(1600);
  }
  const box = page.getByPlaceholder(/talk to your patient/i).first();
  await box.click().catch(() => {});
  await box.type("Good morning, what brings you in today?", { delay: 45 }).catch(() => {});
  await page.waitForTimeout(1700);
});

// 06 - Flashcards (new interface): pick a topic, type an answer, submit for AI grading.
await record(browser, "06_flashcards", "/flashcards", async (page) => {
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /continue/i }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.getByText(/glaucoma/i).first().click().catch(() => {});
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /start session/i }).first().click().catch(() => {});
  await page.waitForTimeout(2200);                 // deck loads, card appears
  const ta = page.getByPlaceholder(/type your answer/i).first();
  await ta.click().catch(() => {});
  await ta.type("Around 10 to 21 mmHg.", { delay: 48 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /submit for grading/i }).first().click().catch(() => {});
  await page.waitForTimeout(2800);                 // grading -> springy flip -> score (+confetti)
});

await browser.close();
console.log("live capture complete");
