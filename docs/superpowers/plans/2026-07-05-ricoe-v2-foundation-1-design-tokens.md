# RICOE v2 · Foundation 1 — Design-token layer (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the canonical RICOE v2 design-token contract — semantic surface tokens plus one reusable animated "moving Gemini-gradient" accent primitive — so every later surface composes on shared tokens instead of hardcoded hex.

**Architecture:** Purely additive extension of the existing `frontend/src/aurora/tokens.css` `:root`. **No surface is restyled in this plan** (zero visual regression). The new tokens + the `.aurora-gemini-accent` utility are verified by the aurora Playwright harness (`frontend/tests/aurora_assert.mjs`) via computed-style probes — the project's canonical frontend gate. Reduced motion freezes the accent.

**Tech Stack:** Next.js 16 (App Router, `output: standalone`), CSS custom properties, Playwright harness run through `scripts/start-harness.sh`.

**Series note:** This is **plan 1 of the RICOE v2 series** (spec: [`docs/superpowers/specs/2026-07-05-ricoe-v2-design.md`](../specs/2026-07-05-ricoe-v2-design.md)). Next plan = Foundation 2 (Selena engine).

---

## Run notes (read before starting)

- **CSS changes require a rebuild** — do **NOT** pass `SKIP_BUILD=1`. Run the harness with a clean build each time: `bash scripts/start-harness.sh aurora`.
- The dev box is **Windows/PowerShell**, but the harness + git commands here are POSIX — run them through the **Bash tool**, not PowerShell.
- The harness prints `PASS:`/`FAIL:` lines and exits non-zero on the first failure. "Green" = it runs to completion and exits 0.
- Auto-push to `main` after the final gate is green (repo standing rule). This plan is additive CSS with **zero behavioural change**, so it is safe to ship once the harness is green.
- Every commit ends with the repo trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File structure

- **Modify** `frontend/src/aurora/tokens.css` — the canonical `:root` token file. Task 1 adds semantic surface + motion tokens inside the first `:root`; Task 2 appends the animated-accent keyframe + utility class at end of file.
- **Modify** `frontend/tests/aurora_assert.mjs` — add computed-style assertions immediately before the teardown `await b.close();` on line 533.

Current relevant tokens already present in `tokens.css` (do not duplicate): `--paper`, `--canvas`, `--surface`, `--hairline`, `--ink`/`-2`/`-3`, `--g-blue`/`--g-purple`/`--g-rose`, `--gemini`, `--gemini-loop` (5-stop loopable), `--aurora-anim` (`4.5s`, set to `0s` under `html[data-motion="reduce"]`), radii, `--logo-ink`.

---

### Task 1: RICOE v2 semantic surface + motion tokens

**Files:**
- Modify: `frontend/src/aurora/tokens.css` (inside the first `:root`, lines 3–37)
- Modify: `frontend/tests/aurora_assert.mjs` (before line 533)

- [ ] **Step 1: Write the failing harness assertion**

In `frontend/tests/aurora_assert.mjs`, immediately **before** the final `await b.close();` (line 533), insert:

```js
// ── RICOE v2 Foundation 1: semantic token contract ────────────────
await np.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
const rv2Tokens = await np.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  return {
    "flash-canvas": cs.getPropertyValue("--flash-canvas").trim(),
    "flash-card": cs.getPropertyValue("--flash-card").trim(),
    "flash-ink": cs.getPropertyValue("--flash-ink").trim(),
    "dur-base": cs.getPropertyValue("--dur-base").trim(),
    "ease-out": cs.getPropertyValue("--ease-out").trim(),
  };
});
for (const [name, val] of Object.entries(rv2Tokens)) {
  if (!val) { console.error(`FAIL: token --${name} is not defined`); process.exit(1); }
}
console.log("PASS: RICOE v2 semantic tokens resolve");
```

- [ ] **Step 2: Run the harness to verify it fails**

Run: `bash scripts/start-harness.sh aurora`
Expected: `FAIL: token --flash-canvas is not defined` and a non-zero exit.

- [ ] **Step 3: Add the tokens to `tokens.css`**

In `frontend/src/aurora/tokens.css`, replace this exact fragment (end of the first `:root`, lines 36–37):

```css
  --aurora-anim: 4.5s; /* canonical gradient sweep duration */
}
```

with:

```css
  --aurora-anim: 4.5s; /* canonical gradient sweep duration */

  /* ── RICOE v2 semantic surfaces + motion (2026-07-05) ───────────
     Flashcards "ivory & ink" (spec D2): a deepened warm canvas so the
     bright-white study card pops (strong card-vs-canvas contrast), plus
     a deep-ink face for the answer reveal. Motion tokens standardise
     duration/easing so surfaces stop hardcoding them. */
  --flash-canvas: #ECE6DA;
  --flash-card:   #FFFFFF;
  --flash-ink:    #141416;
  --flash-ink-2:  #E9E7F2;

  --dur-fast: 140ms; --dur-base: 260ms; --dur-slow: 460ms;
  --ease-out:    cubic-bezier(0.22, 1, 0.36, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

- [ ] **Step 4: Run the harness to verify it passes**

Run: `bash scripts/start-harness.sh aurora`
Expected: `PASS: RICOE v2 semantic tokens resolve`, harness runs to completion, exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/tokens.css frontend/tests/aurora_assert.mjs
git commit -m "feat(tokens): RICOE v2 semantic surfaces + motion tokens (foundation 1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Reusable animated Gemini-accent primitive

**Files:**
- Modify: `frontend/src/aurora/tokens.css` (append at end of file)
- Modify: `frontend/tests/aurora_assert.mjs` (before line 533, after Task 1's block)

- [ ] **Step 1: Write the failing harness assertion**

In `frontend/tests/aurora_assert.mjs`, immediately **before** the final `await b.close();` (now after Task 1's block), insert:

```js
// ── RICOE v2 Foundation 1: animated Gemini-accent primitive ───────
const accent = await np.evaluate(() => {
  const el = document.createElement("div");
  el.className = "aurora-gemini-accent";
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const out = { bg: cs.backgroundImage, size: cs.backgroundSize, anim: cs.animationName };
  el.remove();
  return out;
});
if (!/gradient/.test(accent.bg)) { console.error(`FAIL: gemini accent has no gradient (${accent.bg})`); process.exit(1); }
if (accent.anim !== "aurora-gemini-slide") { console.error(`FAIL: gemini accent not animated (${accent.anim})`); process.exit(1); }
console.log("PASS: animated Gemini accent primitive renders + animates");

await np.evaluate(() => document.documentElement.setAttribute("data-motion", "reduce"));
const frozen = await np.evaluate(() => {
  const el = document.createElement("div");
  el.className = "aurora-gemini-accent";
  document.body.appendChild(el);
  const name = getComputedStyle(el).animationName;
  el.remove();
  return name;
});
if (frozen !== "none") { console.error(`FAIL: gemini accent not frozen under reduced motion (${frozen})`); process.exit(1); }
console.log("PASS: Gemini accent freezes under reduced motion");
await np.evaluate(() => document.documentElement.removeAttribute("data-motion"));
```

- [ ] **Step 2: Run the harness to verify it fails**

Run: `bash scripts/start-harness.sh aurora`
Expected: `FAIL: gemini accent has no gradient (none)` and a non-zero exit.

- [ ] **Step 3: Add the primitive to `tokens.css`**

Append to the **end** of `frontend/src/aurora/tokens.css`:

```css

/* ── Moving Gemini-gradient accent (RICOE v2, spec D2) ─────────────
   One reusable primitive so every surface animates the accent the same
   way (flashcards accent hairline/keyline, etc.). Uses the loopable
   5-stop gradient; freezes under reduced motion. Apply the class to any
   element — or set data-static="true" to hold it still deliberately. */
@keyframes aurora-gemini-slide { to { background-position: -200% 0; } }
.aurora-gemini-accent {
  background-image: var(--gemini-loop);
  background-size: 200% 100%;
  animation: aurora-gemini-slide var(--aurora-anim, 4.5s) linear infinite;
}
html[data-motion="reduce"] .aurora-gemini-accent,
.aurora-gemini-accent[data-static="true"] { animation: none; }
@media (prefers-reduced-motion: reduce) { .aurora-gemini-accent { animation: none; } }
```

- [ ] **Step 4: Run the harness to verify it passes**

Run: `bash scripts/start-harness.sh aurora`
Expected: `PASS: animated Gemini accent primitive renders + animates` and `PASS: Gemini accent freezes under reduced motion`; harness runs to completion, exit 0.

- [ ] **Step 5: Full gate, commit, and push**

```bash
cd frontend && npm run typecheck && npm run build && cd ..
git add frontend/src/aurora/tokens.css frontend/tests/aurora_assert.mjs
git commit -m "feat(tokens): reusable animated Gemini-accent primitive (foundation 1, ricoe D2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```
If `git push` is rejected (keep-alive cron moved the remote): `git pull --rebase && git push`.

---

## Self-review

**Spec coverage (Foundation 1, spec §4):** the canonical token layer is extended in place (✅ semantic surfaces `--flash-canvas`/`--flash-card`/`--flash-ink` for D2's "ivory & ink" + contrast; ✅ motion tokens; ✅ the **moving Gemini-gradient accent** primitive D2 explicitly asks for). Consuming these tokens in actual surfaces is deliberately **out of scope for Foundation 1** (spec: "additive; surfaces migrate to tokens as we touch them") — each surface plan does its own migration + harness pass.

**Placeholder scan:** none — every step has exact file, exact code, exact command, exact expected output.

**Type/name consistency:** the class `.aurora-gemini-accent`, keyframe `aurora-gemini-slide`, and tokens `--flash-canvas`/`--flash-card`/`--flash-ink`/`--flash-ink-2`/`--dur-fast`/`--dur-base`/`--dur-slow`/`--ease-out`/`--ease-spring` are named identically in the CSS and in the harness assertions. The reduced-motion mechanism (`html[data-motion="reduce"]`) matches the existing convention already in `tokens.css` and `aurora.css`.

**No visual regression:** additions are new tokens + one new unused-until-consumed utility class; no existing selector is modified.
