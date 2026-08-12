/* Unit test for the pure half of the tutor's image attachments. Run with Node type
 * stripping:
 *   node --experimental-strip-types frontend/tests/tutor_images_assert.mjs
 * (tutorImages.ts keeps every canvas/DOM call inside a function, so the module imports
 * and its decision rules run in isolation.)
 *
 * What is worth pinning here is the triage: which files are taken, which are refused,
 * and — the one that actually bites — that refusing a file for its TYPE must not also
 * cost the student one of their three slots. */
import assert from "node:assert";
import {
  ACCEPTED_MIME, MAX_IMAGES, MAX_EDGE, IMAGE_ONLY_PROMPT,
  triageFiles, rejectionMessage, fitWithin, imageOnlyText,
} from "../src/aurora/lib/tutorImages.ts";

const png = (name = "a.png") => ({ name, type: "image/png" });
const gif = (name = "a.gif") => ({ name, type: "image/gif" });

// 0) the client cap mirrors the server's; drifting apart means a silent 422
assert.strictEqual(MAX_IMAGES, 3);
assert.deepStrictEqual([...ACCEPTED_MIME], ["image/png", "image/jpeg", "image/webp"]);

// 1) plain accept
let t = triageFiles(0, [png("a.png"), { name: "b.jpg", type: "image/jpeg" }]);
assert.deepStrictEqual(t.accepted.map((f) => f.name), ["a.png", "b.jpg"]);
assert.deepStrictEqual(t.rejected, []);

// 2) unsupported type is refused by type
t = triageFiles(0, [gif("bad.gif")]);
assert.deepStrictEqual(t.accepted, []);
assert.deepStrictEqual(t.rejected, [{ name: "bad.gif", reason: "type" }]);

// 3) beyond the cap is refused by count
t = triageFiles(0, [png("1.png"), png("2.png"), png("3.png"), png("4.png")]);
assert.deepStrictEqual(t.accepted.map((f) => f.name), ["1.png", "2.png", "3.png"]);
assert.deepStrictEqual(t.rejected, [{ name: "4.png", reason: "count" }]);

// 4) a type rejection must NOT consume a slot — the student still gets all three
t = triageFiles(0, [gif("bad.gif"), png("1.png"), png("2.png"), png("3.png")]);
assert.deepStrictEqual(t.accepted.map((f) => f.name), ["1.png", "2.png", "3.png"]);
assert.deepStrictEqual(t.rejected, [{ name: "bad.gif", reason: "type" }]);

// 5) already-attached images count against the cap
t = triageFiles(2, [png("1.png"), png("2.png")]);
assert.deepStrictEqual(t.accepted.map((f) => f.name), ["1.png"]);
assert.deepStrictEqual(t.rejected, [{ name: "2.png", reason: "count" }]);
t = triageFiles(MAX_IMAGES, [png("1.png")]);
assert.deepStrictEqual(t.accepted, []);
assert.deepStrictEqual(t.rejected, [{ name: "1.png", reason: "count" }]);

// 6) the student is told WHY, and told nothing when nothing was refused
assert.strictEqual(rejectionMessage([]), "");
assert.match(rejectionMessage([{ name: "x.gif", reason: "type" }]), /PNG, JPEG/);
assert.match(rejectionMessage([{ name: "4.png", reason: "count" }]), /up to 3/i);
const both = rejectionMessage([
  { name: "x.gif", reason: "type" },
  { name: "4.png", reason: "count" },
]);
assert.match(both, /PNG, JPEG/);
assert.match(both, /up to 3/i);

// 7) fitWithin never upscales, preserves aspect, returns whole pixels
assert.deepStrictEqual(fitWithin(800, 600, MAX_EDGE), { width: 800, height: 600 });
assert.deepStrictEqual(fitWithin(2048, 1024, 1024), { width: 1024, height: 512 });
assert.deepStrictEqual(fitWithin(1024, 2048, 1024), { width: 512, height: 1024 });
const odd = fitWithin(3000, 1999, 1024);
assert.strictEqual(odd.width, 1024);
assert.ok(Number.isInteger(odd.height) && odd.height > 0);
assert.deepStrictEqual(fitWithin(0, 0, 1024), { width: 1, height: 1 });

// 8) an attachment with no typed question still asks something
assert.strictEqual(imageOnlyText("   "), IMAGE_ONLY_PROMPT);
assert.strictEqual(imageOnlyText(""), IMAGE_ONLY_PROMPT);
assert.strictEqual(imageOnlyText("  what is this?  "), "what is this?");

console.log("tutor_images_assert: OK");
