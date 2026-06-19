// Records live feature clips for the EyeBot marketing video.
// Usage (app must be serving on :3000):  node tests/video_capture.mjs
import { chromium } from "playwright";
import { mockApis, student } from "./_mocks.mjs";
import { mkdirSync, renameSync, readdirSync } from "fs";
import { join } from "path";

const BASE = "http://127.0.0.1:3000";
const OUT = "../.tmp/video/live";           // relative to frontend/
const VP = { width: 1920, height: 1080 };

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

// Each scene: navigate, perform a real interaction, hold a beat, then save the video.
async function record(browser, name, route, interact) {
  const dir = join(OUT, name);
  const ctx = await ctxFor(browser, dir);
  const page = await ctx.newPage();
  await page.goto(BASE + route, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(1200);
  await interact(page);
  await page.waitForTimeout(1500);
  await ctx.close();                         // finalizes the webm
  const f = readdirSync(dir).find((x) => x.endsWith(".webm"));
  renameSync(join(dir, f), join(OUT, name + ".webm"));
  console.log("captured", name);
}

const browser = await chromium.launch();

// 03 - AI Tutor: type a simple human question, watch the grounded answer stream in.
await record(browser, "03_chat", "/chat", async (page) => {
  const box = page.locator('textarea, input[type="text"]').first();
  await box.click();
  await box.type("What is a cataract?", { delay: 55 });
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3500);           // answer streams (mock SSE)
});

// 04 - Living Eye: the cases atlas; hover/click a pin.
await record(browser, "04_livingeye", "/cases", async (page) => {
  await page.waitForTimeout(1500);
  const pin = page.locator('[class*="pin"], button, a[href*="/cases/"]').first();
  await pin.hover().catch(() => {});
  await page.waitForTimeout(900);
  await pin.click().catch(() => {});
  await page.waitForTimeout(1200);
});

// 06 - Flashcards (immersive light): start a session, reveal a card, rate it.
await record(browser, "06_flashcards", "/flashcards", async (page) => {
  await page.waitForTimeout(1400);
  await page.getByRole("button", { name: /start session/i }).first().click().catch(() => {});
  await page.waitForTimeout(1800);
  await page.getByRole("button", { name: /reveal/i }).first().click().catch(() => {});
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: /good|easy/i }).first().click().catch(() => {});
  await page.waitForTimeout(1400);
});

// 05 - OSCE station (live where possible; falls back to stills if selectors miss).
await record(browser, "05_osce", "/cases/C001", async (page) => {
  await page.waitForTimeout(1500);
  const action = page.getByText(/Measure IOP/i).first();
  await action.click().catch(() => {});
  await page.waitForTimeout(1600);
});

await browser.close();
console.log("live capture complete");
