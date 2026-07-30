/* Pure unit test for stationHelp — the help + briefing content model.
   Run: node --experimental-strip-types frontend/tests/station_help_logic.mjs

   Students said the whole feature was confusing (2026-07-29), so `?` and the briefing read
   from ONE model and can never describe the system differently. Then the user said the `?`
   modal was "too long winded and no one is gonna read all that" — so the LENGTH CEILINGS
   below are the feature, not decoration: they are what stops the card growing back into a
   document. Guards three contracts:
     1. brevity   — a card you can read in five seconds
     2. anti-spoiler — help explains MECHANICS; no beat may name a clinical action
     3. auto-advance — the briefing must stop moving when a human needs it to */
import assert from "node:assert";
import { HELP, BRIEFING_BEATS, helpFor, shouldAutoAdvance, BEAT_MS } from "../src/aurora/lib/stationHelp.ts";

// ── 1. Brevity ───────────────────────────────────────────────────────────────
// Per-section ceiling: one scannable line, not a paragraph. The old station card ran seven
// sections of ~45 words each (~330 words) and nobody read it.
const LINE_MAX = 110;
const CARD_MAX = 400;

for (const surface of ["cases", "station"]) {
  const help = helpFor(surface);
  assert.ok(help, `${surface} must have help content`);
  assert.ok(help.title.length > 0, `${surface} help needs a title`);
  assert.strictEqual(help.sections.length, 4, `${surface} help is exactly four lines — five is a document`);

  let total = 0;
  for (const s of help.sections) {
    assert.ok(s.heading.length > 0, `${surface}: every section needs a heading`);
    assert.ok(s.body.length > 20, `${surface}: section "${s.heading}" is too thin to help`);
    assert.ok(
      s.body.length <= LINE_MAX,
      `${surface}: "${s.heading}" is ${s.body.length} chars — over the ${LINE_MAX} ceiling, it is a paragraph again`,
    );
    total += s.body.length;
  }
  assert.ok(total <= CARD_MAX, `${surface}: ${total} chars of body — over the ${CARD_MAX} ceiling, nobody reads that`);
}

// Unknown surfaces fall back rather than crashing a screen.
assert.strictEqual(helpFor("nonsense"), HELP.station, "unknown surface falls back to station help");

// ── 2. The briefing beats ────────────────────────────────────────────────────
// Four beats: checklist · patient · EyeBot · handover. The handover beat exists because the
// `?` card no longer carries it — students kept missing that the handover is what's graded.
assert.strictEqual(BRIEFING_BEATS.length, 4, "four beats — checklist, patient, EyeBot, handover");
for (const b of BRIEFING_BEATS) {
  assert.ok(b.id && b.title && b.body, `beat ${b.id} is incomplete`);
  assert.match(b.target, /^[.[]/, `beat ${b.id} needs a CSS selector, got "${b.target}"`);
  assert.ok(b.body.length <= LINE_MAX, `beat ${b.id} is ${b.body.length} chars — a beat is one line`);
}
assert.strictEqual(BRIEFING_BEATS[2].requiresEyebot, true, "the EyeBot beat must be skippable");
assert.ok(!BRIEFING_BEATS[0].requiresEyebot, "the checklist beat always shows");
assert.ok(!BRIEFING_BEATS[3].requiresEyebot, "the handover beat shows on conversation-only cases too");

// The checklist beat must state the read-only rule — it is the single biggest change.
assert.match(BRIEFING_BEATS[0].body, /tick/i, "beat 1 must explain that ticking is automatic");
// The handover beat must connect the handover to the grade — that is its whole reason to exist.
assert.match(
  BRIEFING_BEATS[3].title + " " + BRIEFING_BEATS[3].body,
  /grade|scor/i,
  "beat 4 must say the handover is what's scored",
);

// ── 3. Anti-spoiler: MECHANICS only, never a clinical action ─────────────────
// The checklist masks upcoming steps so the student recalls them. Help that names a step
// would hand back exactly what the mask protects.
const CLINICAL = /tonometr|acuity|slit.?lamp|fundus|intraocular|\bIOP\b|dilat|refract|pupil|visual field|instil|anaesthe/i;
for (const s of [...HELP.cases.sections, ...HELP.station.sections]) {
  assert.ok(!CLINICAL.test(s.heading + " " + s.body), `help section "${s.heading}" names a clinical action — spoiler`);
}
for (const b of BRIEFING_BEATS) {
  assert.ok(!CLINICAL.test(b.title + " " + b.body), `beat ${b.id} names a clinical action — spoiler`);
}

// ── 4. Auto-advance stops for humans ─────────────────────────────────────────
// The briefing plays on EVERY station open and advances itself, so every reason a human
// needs it to hold still is pinned here (WCAG 2.2.2: pause/stop/hide).
const RUNNING = { reduceMotion: false, hovered: false, manual: false, focused: true };
assert.strictEqual(shouldAutoAdvance(RUNNING), true, "by default the briefing advances itself");
assert.strictEqual(shouldAutoAdvance({ ...RUNNING, reduceMotion: true }), false, "reduced motion ⇒ manual only");
assert.strictEqual(shouldAutoAdvance({ ...RUNNING, hovered: true }), false, "hovering the card pauses it");
assert.strictEqual(shouldAutoAdvance({ ...RUNNING, manual: true }), false, "taking manual control stops the timer for good");
assert.strictEqual(shouldAutoAdvance({ ...RUNNING, focused: false }), false, "a blurred tab must not burn through the beats");
// Any one reason is enough on its own — they must not need to combine.
assert.strictEqual(shouldAutoAdvance({ reduceMotion: true, hovered: true, manual: true, focused: false }), false);

// Long enough to read the beat AND look at the pane it points at, short enough that a
// veteran isn't held hostage. Raised from 2s-4s (user, 2026-07-30: the beats "flash by
// before i can read finish") — a title + one line is ~19 words, and the eye also has to
// travel to the spotlight and back, so the floor is 4.5s, not 2s.
assert.ok(BEAT_MS >= 4500 && BEAT_MS <= 7000, `BEAT_MS ${BEAT_MS} should sit between 4.5s and 7s`);

console.log("station_help_logic: all assertions passed");
