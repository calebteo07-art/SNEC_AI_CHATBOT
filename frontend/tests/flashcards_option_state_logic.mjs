/* The MCQ option cascade — a source-level gate on the "Select all that apply" defect.
 *
 * Branda (2026-08-03): "an option appears selected, but upon submission it is not
 * recorded as selected." The mechanism was pure CSS cascade:
 *
 *   .flash-option:hover:not(:disabled)  → (0,3,0)  border-color, box-shadow WITHOUT a ring
 *   .flash-option.is-picked             → (0,2,0)  border-color, box-shadow WITH the ring
 *
 * Hover outranked picked, so the tile under the pointer lost its selection ring — and a
 * merely-hovered tile gained a violet border. Measured on the built app, a hovered
 * UNPICKED option and a hovered PICKED option computed to the identical border with no
 * ring on either: under the finger, selected and unselected were indistinguishable. On
 * touch, where `:hover` sticks to the last-tapped element until you tap elsewhere, that
 * is exactly "looks selected, isn't recorded".
 *
 * This lives in the pure-logic suite rather than the browser harness on purpose:
 * headless Chromium's `:hover` emulation proved non-deterministic (two runs of the same
 * probe disagreed on whether hover had applied at all), so gating CI on a simulated
 * hover manufactures both false reds and false greens. The cascade is a static property
 * of the stylesheet, so it is read from the stylesheet.
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";

const CSS = path.resolve(import.meta.dirname, "../src/aurora/aurora.css");
const src = readFileSync(CSS, "utf8");

/* Minimal brace scanner: yields every style rule with the stack of at-rule preludes it
   sits inside. Enough for "is this selector nested in @media (hover: hover)?" — it does
   not need to understand declarations, only structure. */
function rules(css) {
  const out = [];
  const stack = [];
  let prelude = "";
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "/" && css[i + 1] === "*") { i = css.indexOf("*/", i + 2) + 1; continue; }
    const c = css[i];
    if (c === "{") {
      const head = prelude.trim();
      prelude = "";
      if (head.startsWith("@")) { stack.push({ at: head, body: true }); continue; }
      // A style rule: capture its declaration block, then skip past it.
      let depth = 1, j = i + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}") depth--;
        j++;
      }
      out.push({ selector: head, decls: css.slice(i + 1, j - 1), at: stack.map((s) => s.at) });
      i = j - 1;
      continue;
    }
    if (c === "}") { stack.pop(); prelude = ""; continue; }
    prelude += c;
  }
  return out;
}

const all = rules(src);
assert.ok(all.length > 500, `the CSS scanner found only ${all.length} rules — it is not parsing aurora.css`);

const optionHover = all.filter((r) =>
  /\.flash-option/.test(r.selector) && /:hover/.test(r.selector));
assert.ok(optionHover.length > 0,
  "found no .flash-option hover rule at all — this gate is only meaningful if it can see them");

for (const r of optionHover) {
  // 1. Touch devices must never latch hover styling. `:hover` sticks to the last-tapped
  //    element on mobile, so an unstyled-by-media hover rule paints a deselected tile as
  //    though it were still selected until the student taps somewhere else.
  const gated = r.at.some((a) => /@media/.test(a) && /\bhover\s*:\s*hover\b/.test(a));
  assert.ok(gated,
    `"${r.selector}" is not inside @media (hover: hover) — on a touch device this latches `
    + "onto the last-tapped option and keeps painting it after it has been deselected");

  // 2. Hover must never restyle a PICKED option. Whatever hover sets, it must not be able
  //    to reach a selected tile, or the tile the student is touching is the one that stops
  //    looking selected.
  if (/border-color|box-shadow|background/.test(r.decls)) {
    assert.ok(/:not\(\.is-picked\)/.test(r.selector),
      `"${r.selector}" restyles the option's border/shadow/background but does not exclude `
      + ".is-picked, so hover can override the selected state (it has the higher specificity)");
  }
}

/* 3. Selection must not be carried by border-color alone. The lamp chip is the signal
      `:hover` cannot impersonate — hover styles the tile, never the lamp — so a picked
      lamp is what makes "selected" survive a sticky hover. */
const pickedLamp = all.filter((r) =>
  /\.is-picked\b/.test(r.selector) && /\.flash-lamp\b/.test(r.selector));
assert.ok(pickedLamp.length > 0,
  "no `.flash-option.is-picked .flash-lamp` rule — selection is carried by the tile border "
  + "alone, which is both hard to see and impossible to distinguish from hover");

console.log(`flashcards_option_state_logic: ${optionHover.length} hover rule(s) gated, `
  + `${pickedLamp.length} picked-lamp rule(s) — all assertions passed`);
