/* Pure unit test for the Home HUD's decisions. hud.ts is dependency-free — no React,
   no DOM — so every rule that could lie to a student is testable without a browser.
   Run under Node type stripping:
     node --experimental-strip-types frontend/tests/hud_logic.mjs */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  chestReveal, sgtMsToMidnight, streakRisk, boostRemaining, formatCountdown, questRollup,
} from "../src/aurora/lib/hud.ts";

// ── the chest must not leak its prize ────────────────────────────────────────
// GET /api/home returns key+label even when unclaimed, because the roll is pure.
const sealed = { claimed: false, key: "xp2x", label: "2x Lumens for 20 minutes" };
assert.deepStrictEqual(chestReveal(sealed, false), { sealed: true, label: null },
  "an unclaimed chest reveals NOTHING, however much the payload hands us");
assert.deepStrictEqual(chestReveal(sealed, true),
  { sealed: false, label: "2x Lumens for 20 minutes" },
  "this session's own claim reveals it");
assert.deepStrictEqual(chestReveal({ ...sealed, claimed: true }, false),
  { sealed: false, label: "2x Lumens for 20 minutes" },
  "an already-claimed chest shows what it paid");
assert.deepStrictEqual(chestReveal(null, false), { sealed: true, label: null },
  "a failed read is sealed, never an openable chest that cannot pay");

// ── midnight is SGT's, not the device's ──────────────────────────────────────
// 2026-08-05T16:00:00Z is 2026-08-06T00:00:00+08:00 — exactly SGT midnight.
assert.strictEqual(sgtMsToMidnight(Date.parse("2026-08-05T16:00:00Z")), 86_400_000,
  "at SGT midnight a whole day remains");
assert.strictEqual(sgtMsToMidnight(Date.parse("2026-08-05T15:00:00Z")), 3_600_000,
  "23:00 SGT leaves one hour");
// The two assertions above only prove sgtMsToMidnight is a pure function of nowMs —
// they say nothing about which timezone the arithmetic actually used, because
// Date.parse(...) and `new Date(...).getTime()` both collapse to the identical epoch
// ms BEFORE the function ever runs. A device-local-midnight implementation passes a
// same-epoch-ms comparison too, and on a box whose own TZ happens to be +08:00 it
// passes even the two assertions above — which is exactly this dev box, so "green
// locally" was never evidence for the fixed-offset property. The only real gate is
// asking a process whose OS timezone genuinely is NOT +08:00 what it computes.
//
// Spawns real `node` children pinned to two different TZs via the environment (never
// a shell — execFileSync passes argv directly, so there is no quoting to get wrong),
// each importing hud.ts fresh and evaluating sgtMsToMidnight at the same instant used
// above. Proven by mutation: swapping the fixed +08:00 offset for `new Date(nowMs)`
// local-midnight arithmetic fails this loop under TZ=America/New_York while the two
// fixed-point assertions above keep passing.
const HUD_URL = pathToFileURL(path.join(import.meta.dirname, "../src/aurora/lib/hud.ts")).href;

function sgtMsToMidnightUnderTZ(tz) {
  return Number(execFileSync(
    process.execPath,
    ["--experimental-strip-types", "-e",
     `import(${JSON.stringify(HUD_URL)}).then(m => ` +
       `process.stdout.write(String(m.sgtMsToMidnight(${Date.parse("2026-08-05T15:00:00Z")}))));`],
    { env: { ...process.env, TZ: tz }, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ));
}

for (const tz of ["America/New_York", "Etc/GMT-8"]) {
  assert.strictEqual(sgtMsToMidnightUnderTZ(tz), 3_600_000,
    `sgtMsToMidnight must return the same 1h-to-midnight answer under TZ=${tz} as under ` +
    "SGT — the +08:00 offset is a fixed constant, not the runtime's local midnight");
}

// ── streak risk is informative, and silent once the day is done ──────────────
const t = Date.parse("2026-08-05T15:00:00Z"); // 23:00 SGT
assert.strictEqual(streakRisk(true, t).atRisk, false, "a finished day is never at risk");
assert.strictEqual(streakRisk(false, t).atRisk, true, "an unfinished day late on is at risk");
assert.strictEqual(streakRisk(false, t).msLeft, 3_600_000, "and it reports the real time left");
assert.strictEqual(streakRisk(undefined, t).atRisk, false,
  "an UNKNOWN day is not an at-risk day — a failed read must not invent an alarm");

// ── the boost countdown ──────────────────────────────────────────────────────
assert.strictEqual(boostRemaining("2026-08-05T23:20:00+08:00", t), 1_200_000, "20 minutes left");
assert.strictEqual(boostRemaining("2026-08-05T22:00:00+08:00", t), 0, "an expired boost is 0, never negative");
assert.strictEqual(boostRemaining(null, t), 0, "no boost is 0");
assert.strictEqual(boostRemaining("not-a-date", t), 0, "an unparseable stamp is 0, not NaN");

// ── countdown formatting ─────────────────────────────────────────────────────
assert.strictEqual(formatCountdown(3_600_000), "1h 00m");
assert.strictEqual(formatCountdown(1_200_000), "20:00");
assert.strictEqual(formatCountdown(61_000), "1:01");
assert.strictEqual(formatCountdown(0), "0:00");
assert.strictEqual(formatCountdown(-5), "0:00", "never renders a negative clock");

// ── the quest rollup NEVER fabricates zeros ──────────────────────────────────
const qs = [
  { kind: "adaptive", complete: true,  claimed: true },
  { kind: "breadth",  complete: true,  claimed: false },
  { kind: "stretch",  complete: false, claimed: false },
];
assert.deepStrictEqual(questRollup(qs), { done: 2, total: 3, claimable: 1 });
assert.strictEqual(questRollup(null), null,
  "a failed read is UNKNOWN, not '0/3 done' — that is the lie this codebase guards against");
assert.strictEqual(questRollup([]), null, "and so is an empty set: there are always three");

console.log("PASS: hud_logic");
