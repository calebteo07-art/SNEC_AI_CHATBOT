/* logo_mark_assert.mjs — fast, build-free guard for the mono EyeBot logo mark
   (spec: docs/superpowers/specs/2026-07-11-mono-eyebot-logo-design.md).
   Asserts the OLD Spark-Eye sparkle is gone from every logo copy, the new glyph
   paints with currentColor (so "black vs white" is the inherited/tone colour),
   the favicon flips with the OS theme, and the mascot no longer stands in as the
   mark in CoBrand / BrandSplash. Run: node frontend/tests/logo_mark_assert.mjs */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

let fails = 0;
const ok = (m) => console.log(`PASS: ${m}`);
const bad = (m) => { console.error(`FAIL: ${m}`); fails++; };
const has = (s, re, m) => (re.test(s) ? ok(m) : bad(m));
const not = (s, re, m) => (!re.test(s) ? ok(m) : bad(m));

// The old marks: the almond eye (Q24 7 …) and the 4-point sparkle (…18.8c / 18.4c…).
const OLD_EYE = /Q\s*24\s+7/;                 // legacy almond-eye control point
const SPARKLE = /24\s+18\.[48]c/;             // legacy 4-point sparkle path start

// 1. Logo.tsx — the single source glyph
const logo = read("src/aurora/Logo.tsx");
not(logo, SPARKLE, "Logo.tsx: legacy sparkle path removed");
not(logo, OLD_EYE, "Logo.tsx: legacy almond-eye path removed");
has(logo, /stroke=["']currentColor["']/, "Logo.tsx: eye strokes with currentColor");
has(logo, /fill=["']currentColor["']/, "Logo.tsx: iris/pupil fills with currentColor");
has(logo, /r=["']?7\.4|iris|pupil|<circle/i, "Logo.tsx: renders the iris/pupil circles");

// 2. Favicon — standalone SVG, must flip black<->white with OS theme
const icon = read("public/icon.svg");
not(icon, SPARKLE, "icon.svg: legacy sparkle removed");
has(icon, /prefers-color-scheme:\s*dark/, "icon.svg: dark-mode flip present");

// 3. Login EyeLogo — reuse the shared mark, no private sparkle copy
const onb = read("src/screens/OnboardingScreen.tsx");
not(onb, SPARKLE, "OnboardingScreen: login EyeLogo no longer hand-draws the sparkle");
has(onb, /\bLogo\b/, "OnboardingScreen: login reuses the shared <Logo> mark");

// 4. CoBrand — the EyeBot mark is the mono <Logo>, not the mascot
const cob = read("src/aurora/components/CoBrand.tsx");
not(cob, /SelenaLogo/, "CoBrand: mascot SelenaLogo no longer used as the mark");
has(cob, /<Logo\b/, "CoBrand: renders the mono <Logo> mark");

// 5. BrandSplash — mono mark + wordmark, not the grooving mascot
const spl = read("src/aurora/components/BrandSplash.tsx");
not(spl, /SelenaLogo/, "BrandSplash: grooving mascot removed");
has(spl, /<Logo\b|<Wordmark\b/, "BrandSplash: renders the mono mark / wordmark");

// 6. Home (Dashboard) header — the gem/gradient lockup becomes the mono mark
const dash = read("src/aurora/screens/Dashboard.tsx");
not(dash, /name="eye"\s+gem/, "Dashboard: home header eye no longer gem/gradient");
has(dash, /<Logo\b/, "Dashboard: home header uses the mono <Logo> mark");
const homecss = read("src/aurora/home.css");
not(homecss, /\.hm-wm\s*\{[^}]*linear-gradient/, "home.css: .hm-wm wordmark no longer gradient-filled");

if (fails) { console.error(`\n${fails} assertion(s) failed`); process.exit(1); }
console.log("\nAll logo-mark assertions passed");
