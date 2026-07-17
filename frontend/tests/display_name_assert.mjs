/* Unit test for the pure display-name resolver. Run with Node's type stripping:
 *   node --experimental-strip-types frontend/tests/display_name_assert.mjs
 * (displayName.ts is dependency-free so it imports in isolation.)
 *
 * The invariant under test: a raw email address must NEVER render as a person's
 * name. Staff have no approved_students row, so an identity can legitimately
 * degrade to an email — the UI is the last line of defence. */
import assert from "node:assert";
import { displayName, firstNameOf } from "../src/aurora/lib/displayName.ts";
import { pickGreeting } from "../src/aurora/lib/greeting.ts";

/* 1) A real name passes through untouched — including one-word and mixed case. */
assert.strictEqual(displayName("Caleb Teo"), "Caleb Teo");
assert.strictEqual(displayName("snec"), "snec");
assert.strictEqual(displayName("Coach Lim"), "Coach Lim");
assert.strictEqual(firstNameOf("Caleb Teo"), "Caleb");
assert.strictEqual(firstNameOf("Coach Lim"), "Coach");

/* 2) THE REGRESSION: the reported bug — the super-admin's address was greeted
   verbatim ("Good evening, snec.tne.edu@gmail.com."). Never again, on any surface. */
assert.strictEqual(firstNameOf("snec.tne.edu@gmail.com"), "Snec");
assert.strictEqual(displayName("snec.tne.edu@gmail.com"), "Snec Tne Edu");

/* 3) No output may ever contain an "@" or a domain, whatever we are handed. */
const NASTY = [
  "snec.tne.edu@gmail.com",
  "calebteo07-art@gmail.com",
  "caleb.teo07@snec.com.sg",
  "a@test.com",
  "verify-cookie-test@eyebot.local",
  "claire.ong.g.h@snec.com.sg",
  "first+tag@example.com",
  "UPPER.CASE@EXAMPLE.COM",
];
for (const email of NASTY) {
  for (const out of [displayName(email), firstNameOf(email)]) {
    assert.ok(!out.includes("@"), `"${email}" → "${out}" still contains @`);
    assert.ok(!/\.(com|sg|local|org|net)\b/i.test(out), `"${email}" → "${out}" leaks a domain`);
    assert.ok(out.length > 0, `"${email}" → empty`);
  }
}

/* 4) Sensible humanising of the local part. */
assert.strictEqual(firstNameOf("caleb.teo07@snec.com.sg"), "Caleb");
assert.strictEqual(firstNameOf("first+tag@example.com"), "First");
assert.strictEqual(firstNameOf("UPPER.CASE@EXAMPLE.COM"), "Upper");
assert.strictEqual(displayName("claire.ong.g.h@snec.com.sg"), "Claire Ong G H");

/* 5) Missing / blank / junk identity falls back rather than rendering nothing. */
assert.strictEqual(firstNameOf(undefined), "there");
assert.strictEqual(firstNameOf(null), "there");
assert.strictEqual(firstNameOf(""), "there");
assert.strictEqual(firstNameOf("   "), "there");
assert.strictEqual(displayName(undefined, "EyeBot"), "EyeBot");
assert.strictEqual(firstNameOf("@@@", "there"), "there");
/* An address whose local part is pure noise still must not render as an email. */
assert.strictEqual(firstNameOf("123@test.com", "there"), "there");

/* 6) Whitespace around a real name is trimmed, not treated as a word. */
assert.strictEqual(firstNameOf("  Caleb Teo  "), "Caleb");

/* 7) End-to-end on the surface that was actually reported: the home greeting card
   composed the raw address into its headline ("Good evening, snec.tne.edu@gmail.com.").
   Assert the rendered title for the real offending account, across every bucket. */
const ctx = {
  firstName: firstNameOf("snec.tne.edu@gmail.com"),
  track: "OA", hour: 20, streak: 12, doneToday: false,
  missedYesterday: false, xpToNext: 60, goalMet: false, bestStreak: 12,
};
assert.strictEqual(ctx.firstName, "Snec");
for (const variant of [
  ctx,
  { ...ctx, goalMet: true },
  { ...ctx, missedYesterday: true, streak: 0 },
  { ...ctx, streak: 10 },
  { ...ctx, streak: 2, xpToNext: 40 },
]) {
  for (let seed = 0; seed < 6; seed++) {
    const g = pickGreeting(variant, seed);
    assert.ok(!g.title.includes("@"), `greeting title leaked an email: ${g.title}`);
    assert.ok(!g.sub.includes("@"), `greeting sub leaked an email: ${g.sub}`);
  }
}

console.log("display_name_assert: all assertions passed");
