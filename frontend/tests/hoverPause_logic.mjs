/* Pure unit test for the coverflow hover-pause hot zone (user directive 2026-07-24:
   "hover pause in both spinning parts, but only hover over a small region to pause").
   hoverPause.ts is dependency-free geometry — no React, no DOM. Run under Node type
   stripping:
     node --experimental-strip-types frontend/tests/hoverPause_logic.mjs

   The zone is a box the size of the FRONT CARD, centred on the stage: hovering the card
   you are reading pauses the idle drift; the side cards, the arrows and the surrounding
   stage do not. Both carousels (home FeatureCarousel + flashcards CardFanCarousel) share
   this one hit test, so it is the single place the "small region" rule is guarded. */
import assert from "node:assert";
import { inFrontCardZone } from "../src/aurora/lib/hoverPause.ts";

// A 1200×360 stage at the page origin — the desktop home carousel.
const stage = { left: 0, top: 0, width: 1200, height: 360 };
const W = 466, H = 300; // .hm-fcard desktop

// ── the centre pauses ────────────────────────────────────────────────────────
assert.strictEqual(inFrontCardZone(stage, W, H, 600, 180), true, "dead centre is in the zone");

// ── the edges are the boundary, and they are inclusive ───────────────────────
assert.strictEqual(inFrontCardZone(stage, W, H, 600 - W / 2, 180), true, "left edge is inside");
assert.strictEqual(inFrontCardZone(stage, W, H, 600 + W / 2, 180), true, "right edge is inside");
assert.strictEqual(inFrontCardZone(stage, W, H, 600, 180 - H / 2), true, "top edge is inside");
assert.strictEqual(inFrontCardZone(stage, W, H, 600, 180 + H / 2), true, "bottom edge is inside");
assert.strictEqual(inFrontCardZone(stage, W, H, 600 - W / 2 - 1, 180), false, "1px left of the card is outside");
assert.strictEqual(inFrontCardZone(stage, W, H, 600 + W / 2 + 1, 180), false, "1px right of the card is outside");
assert.strictEqual(inFrontCardZone(stage, W, H, 600, 180 - H / 2 - 1), false, "1px above the card is outside");
assert.strictEqual(inFrontCardZone(stage, W, H, 600, 180 + H / 2 + 1), false, "1px below the card is outside");

// ── BOTH axes must hold: a point on the card's horizontal band but above it, and one
//    on its vertical band but beside it, are both out (this is a box, not a strip).
assert.strictEqual(inFrontCardZone(stage, W, H, 600, 5), false, "same column, above the card → outside");
assert.strictEqual(inFrontCardZone(stage, W, H, 40, 180), false, "same row, beside the card → outside");

// ── the small-region rule: the side cards and the arrows never pause it ──────
// Home side cards sit ±346px off centre (SX in FeatureCarousel), the arrows at the stage edges.
assert.strictEqual(inFrontCardZone(stage, W, H, 600 + 346, 180), false, "the right side card is outside the zone");
assert.strictEqual(inFrontCardZone(stage, W, H, 600 - 346, 180), false, "the left side card is outside the zone");
assert.strictEqual(inFrontCardZone(stage, W, H, 29, 180), false, "the prev arrow is outside the zone");
assert.strictEqual(inFrontCardZone(stage, W, H, 1171, 180), false, "the next arrow is outside the zone");
// The zone really is a small slice of the stage, not most of it.
assert.ok((W * H) / (stage.width * stage.height) < 0.35, "zone is a minority of the stage area");

// ── the zone follows the stage, not the viewport (scrolled / offset page) ────
const offset = { left: 220, top: 640, width: 1200, height: 360 };
assert.strictEqual(inFrontCardZone(offset, W, H, 820, 820), true, "centre of an offset stage is in the zone");
assert.strictEqual(inFrontCardZone(offset, W, H, 600, 180), false, "the old viewport centre is not the offset stage's centre");

// ── flashcards geometry: .fan-card 348×452 on a tall stage ───────────────────
const fanStage = { left: 0, top: 0, width: 1280, height: 640 };
assert.strictEqual(inFrontCardZone(fanStage, 348, 452, 640, 320), true, "flashcards front card centre pauses");
assert.strictEqual(inFrontCardZone(fanStage, 348, 452, 640 + 223, 320), false, "flashcards first neighbour (gap1 = 348*.64) is outside");
assert.strictEqual(inFrontCardZone(fanStage, 348, 452, 640, 30), false, "the taunt/heading band above the cards is outside");

// ── phone breakpoints: the zone shrinks with the CSS card, it is not hardcoded ─
// .hm-fcard under 560px → min(88vw,392px) × 272 on a 390px viewport.
const phone = { left: 0, top: 0, width: 358, height: 300 };
assert.strictEqual(inFrontCardZone(phone, 343, 272, 179, 150), true, "phone home card centre pauses");
assert.strictEqual(inFrontCardZone(phone, 343, 272, 179, 8), false, "phone: above the shorter card → outside");
// .fan-card under 639px → 252×328.
const fanPhone = { left: 0, top: 0, width: 358, height: 420 };
assert.strictEqual(inFrontCardZone(fanPhone, 252, 328, 179, 210), true, "phone flashcards card centre pauses");
assert.strictEqual(inFrontCardZone(fanPhone, 252, 328, 179 + 140, 210), false, "phone flashcards: beside the card → outside");

// ── unmeasured card (offsetWidth 0 before layout) never pauses ───────────────
assert.strictEqual(inFrontCardZone(stage, 0, 0, 600, 180), false, "an unmeasured card can't freeze the ring");
assert.strictEqual(inFrontCardZone(stage, 0, H, 600, 180), false, "zero width → no zone");
assert.strictEqual(inFrontCardZone(stage, W, 0, 600, 180), false, "zero height → no zone");

console.log("hoverPause_logic: all assertions passed");
