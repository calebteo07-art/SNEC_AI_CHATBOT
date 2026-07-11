# Design Locks

Settled UI design decisions. A **locked** feature is refined, not redesigned: state
which acceptance criterion you're changing, or consciously break the lock with a new
brief via `/design-lock`. This ledger exists because the June-2026 session audit found
the same features rebuilt from scratch repeatedly (flashcards: 4+ full redesigns in 18
days) for lack of a written spec to refine against.

## Global language — LOCKED 2026-06-13
Light "AURORA" system: Gemini-gradient accents on light surfaces, Google Sans,
the **mono EyeBot logo** (one black/white eye glyph — see the Mono-logo lock),
auto-collapsing Atlas Rail (72px → 248px on hover, pinnable).
Student app motion is CSS-only (`motion.css` + Reveal/RouteReveal) — no GSAP fx
wrappers (MotionProvider is not mounted).

## Mono EyeBot logo — LOCKED 2026-07-11
**Direction**: the EyeBot **brand logo mark** is ONE glyph, drawn once (`aurora/Logo.tsx`),
painted with `currentColor` and rendered strictly **monochrome — solid black on light
surfaces, solid white on dark** ("black or white depending on scenario", Caleb 2026-07-11).
The glyph is a **rounded eye outline + iris ring + pupil** (refined from the legacy 4-point
"Spark-Eye" sparkle — criterion changed: *glyph interior*). At ≤20px the ring collapses to a
solid iris disc for legibility (favicon/rail). The **favicon** (`public/icon.svg`) flips
black↔white via `@media (prefers-color-scheme: dark)`. The wordmark "EyeBot" is live mono
text in the app font (not a gradient). This is the mark on: rails (`Wordmark`), favicon,
login (`EyeLogo` → shared `<Logo>`), the CoBrand mark, and `BrandSplash`.
- **Out of scope (stays as-is)**: the Iris/Selena **mascot character** (Home greeting,
  dancing-Iris video, reply-bubble, Selena Studio, leaderboard headshots), the photoreal
  "Living Eye" login hero (`login-eye.png`), and the **SNEC** institutional logo.
- **Acceptance criteria when refining**: one source glyph (no second copy of the eye path
  anywhere); every surface solid black-on-light / white-on-dark, no colour on the mark;
  favicon flips with OS theme; mascot + Living-Eye hero + SNEC unchanged; WCAG-legible at
  every size; `aurora` harness + `frontend/tests/logo_mark_assert.mjs` green.
- Spec: `docs/superpowers/specs/2026-07-11-mono-eyebot-logo-design.md`.

## Login — LOCKED 2026-06-13
Kept verbatim from the original app (explicit user preference). Do not restyle.
**Amended 2026-07-11**: the login's eye glyph (`EyeLogo`) is the shared **mono `<Logo>`
mark** (refreshed with the rest of the app) — still mono ink on the light card, no colour
or brand chrome added, so "verbatim/minimal" holds. The photoreal Living-Eye hero is unchanged.

## Flashcards — LOCKED 2026-06-30 · re-themed "ivory & ink" 2026-07-06 (ricoe D2)
**Theme (ricoe D2, refine 2026-07-06 — supersedes the rejected purple B6)**: the flashcards
world is **"ivory & ink"** — a **warm greige/paper canvas** (`--flash-canvas` #ECE6DA,
deepened toward the edges for contrast) carrying a **crisp bright-white study card**
(`--flash-card` #FFFFFF) with deep-ink text and subtle elevation, so the card pops off the
canvas. The **reveal flips the card to a deep-ink back face** (`--flash-ink` #141416, light
text) — white while you read/answer, deep ink for the answer moment. **Topic intro** uses the
white study-card language; **results** uses the deep-ink reveal language. The **accent is a
*moving* Gemini gradient** (blue→indigo→magenta, animated via `aurora-flow` — not flat indigo)
on the card hairline / progress / keylines. Canvas chrome (Exit pill, mute, empty/loading
copy, fan controls, engravings, Brownian blooms) is warm-ink / gemini-toned for the greige
surface; CoBrand uses its **light** variant. Surfaces consume the RICOE v2 semantic tokens
(`--flash-canvas`/`--flash-card`/`--flash-ink` in `tokens.css`), not hardcoded colours.
**Acceptance criteria when refining**: canvas = warm greige; study-card front = bright white
with deep-ink legible text; reveal/results = deep ink with legible light text; accent = moving
Gemini gradient; verdicts bright green `#16a34a` / red `#e22030`; WCAG-legible on every surface.
- **Selection**: single-screen topic fan carousel, continuous "river" flow (single rAF
  loop, seamless wrap, static under reduced motion), per-topic Nano Banana images, no
  difficulty picker, fixed decks, no scroll (dvh-sized). Fan cards remain dark photo
  tiles with white captions (they sit on their own images); controls are warm-ink on greige.
- **Study**: "Console" instant-tap MCQ on the **bright-white** study card (front face —
  deep-ink text, animated Gemini hairline), Brownian gemini-toned blooms on the greige
  canvas background, engravings etched in the card perimeter. Reveal = **Charge → Flip →
  Payoff** (LiquidLoading ChargeBeat, 3D flip to a **deep-ink** full-bleed explanation,
  combo/XP payoff). Per-topic hue band tuned per face (darker on white, lighter on ink);
  verdicts bright green `#16a34a` / intense red `#e22030`; Next button centered, solid indigo.
- **Topic intro (ricoe B5)**: a fan pick shows a pre-deck `TopicIntro` beat before Q1
  — "Up next", the gradient topic name, a one-line blurb (`TOPIC_BLURBS`), a
  `N cards · mixed difficulty · instant scoring` meta and a Begin CTA — in the study
  card's bright-white language (gemini-gradient topic name). The deck loads in the
  background; tutor-handoff and `?mode=review` flows skip it.
- **Combo burst (ricoe B3)**: crossing into a new multiplier tier fires a loud, game-
  phrased `ComboBurst` slam over the stage (DOUBLE UP ×2 / ON FIRE ×3 / UNSTOPPABLE ×4 /
  GODLIKE 10+) with the ×N, a shockwave ring and the streak count; `pointer-events:none`,
  self-dismissing, keeps rewarding every 2-in-a-row past the ×4 cap. Phrase + multiplier
  come from `comboCallout`/`comboMultiplier` so they never disagree.
- **Out of scope for refinements**: scoring model (deterministic, no AI in study loop),
  two-pool role content model {OA=PSA}+{OT}, 50-cards-per-topic mandate.

## Home / Dashboard — LOCKED 2026-07-01 · refined "come alive" 2026-07-10
Warm-premium bento `.aurora-home` (Bricolage Grotesque): GreetingHero with the
ever-changing greeting engine + **Iris** mascot, StreakTile, FeatureCarousel (3D
coverflow, back-card fade), MilestoneLadder, WeekStats (real data only — no invented
stats). Old dark dashboard (StreakBand/GradientHero/GoalRing) is retired; do not revive.
- **"Come alive" refine (2026-07-10, spec `2026-07-10-homepage-come-alive-design.md`)**:
  enlarged type scale on every card (bigger *and* clearer — darkened a few low-contrast
  grays); the streak flame is **enlarged + alive** (CSS flicker + ember, frozen under
  reduced motion) on a warm surface wash; the FeatureCarousel cards are reskinned to
  **full-bleed default-Selena scenes** (Nano-Banana flash, `reference=True`, a bottom-up
  scrim keeps text legible; the tone gradient is the graceful fallback) — coverflow
  **mechanics unchanged** (drift / tap-to-nearest / arrows / keyboard); the plain
  badge + progress panels are lifted (gradient header rule, themed stat tiles, depth).
  The greeting mascot is **always the default living Selena** (see the Custom-Selena
  amendment) — never a student's custom render. Acceptance: WCAG-AA legible, 390px-safe,
  all added motion freezes under `prefers-reduced-motion` / `data-motion=reduce`.
- **Greeting-card simplification (refine 2026-07-10, user directive)**: the greeting card
  is now **chrome-light** — the eyebrow (role · time-of-day), the `hm-cta-row` (the "Pick
  up where you left off", "Surprise me", and "Edit Selena" buttons), the greeting reshuffle
  seed, and the "a new hello every visit" note are all **removed**. What remains — the big
  rotating headline, the teasing sub, and the level-up XP readout — is **enlarged** (headline
  50→62px, sub 19→23px, XP readout up) and held to the calm **left column** (capped widths)
  so no word runs under the mascot; the living Selena is **nudged well to the right** (Veo-loop
  framing + a small right shift, plus the fallback mascot). On the narrow (≤560px) card the
  copy is column-capped, the level readout stacks left, and the legibility veil carries a
  stronger cream wash across the left ~66% so text stays WCAG-legible where it meets her big
  eye. The greeting still rotates by day-of-year (no in-page re-roll now that "Surprise me" is
  gone). **Acceptance when refining**: greeting card shows only headline + sub + XP bar — no
  eyebrow, no CTA buttons, no reshuffle note; type is visibly larger yet WCAG-AA legible and
  390px-safe; no word overlaps the mascot illegibly; Selena sits toward the right; Edit-Selena
  is reachable elsewhere (leaderboard + Profile — see the onboarding lock).
- **"Toybox vibrancy" refine (2026-07-11, user directive: "colors more bold and vibrant
  like all the games in RODTANG, don't hold back")**: a **colour + material + juice** pass on
  every card, applying RODTANG's cozy-premium grammar — *saturate the actors, calm the stage;
  glossy vinyl-toy material; high-key light; springy squash-and-stretch juice*. Concretely, all
  in `home.css` (CSS-only): the warm cream **canvas stays calm** while the **actors go bold** —
  candy-saturated feature-card tone gradients, **bold saturated candy stat tiles** (white
  numerals/labels on dark-enough violet/teal/orange/coral fills), a **juicy XP meter** (chunkier,
  candy gradient, gloss highlight + a shine sweep), a **glossier streak** (brighter candy numeral
  + a pulsing heat-glow behind the flame), **jewel week-dots** (springy pop-in, glossy on-state,
  pulsing today), **bolder badge rarity glows**, a **candy next-tier pill**, and vinyl **gloss
  sheens** on the toy surfaces. **Nothing structural changes** and **no generated asset is touched.**
- **PRESERVED / untouched (hard constraint of this refine)**: every generated asset — the **Veo
  greeting loop** (`media/loops/greeting-selena.mp4`), **iris.png + poses**, the **feature scenes**
  (`brand/features/{tutor,vp,flash}.webp`), the **badge medallions** (`brand/badges/*.jpg`); the
  bento **layout + card set**; the FeatureCarousel **coverflow mechanics**; **WeekStats real-data-only**;
  the **default Iris mascot**; the greeting-card simplification; and every prior Home acceptance.
- **Acceptance criteria when refining**: bold/saturated yet **WCAG-AA legible on every surface**
  (white-on-fill kept ≥3:1 for the large numerals/labels); **390px-safe** (no horizontal overflow);
  **all added motion** (XP shine, heat-glow, jewel pop, today-pulse, springs) **freezes** under
  `prefers-reduced-motion` / `data-motion=reduce`; the aurora harness stays green (structure,
  testids, badge states, mascot reduced-motion freeze all intact); **no generated asset replaced.**

## Tutor Chat — LOCKED 2026-06-22 (greeting landing added 2026-07-04)
"Mono + Electric / Live Wire": ivory + charcoal + electric indigo `#5B5BFF`, layout
unchanged from pre-recolor. Live constellation canvas (ChatField), realistic eye avatar
under a charging electric ring + blink, OCT trace, charging streaming-bubble borders.
`.aurora-chat` background must keep a linear-gradient (harness asserts it). No sliding
scan-sweep (removed, ricoe A1). Reply-bubble avatar = the default Selena mascot, never a
student's customised avatar (ricoe A3).
- **Greeting landing (ricoe A2)**: `/chat` opens on `TutorLanding` (the empty state) —
  an ever-changing, learning-humour hello opener with a Gemini-gradient name and cheeky sub, a big
  centred prompt (reuses `Composer`), and the student's real recent sessions ("Pick up
  where you left off" cards from `progress.sessions`). Asking / resuming cross-fades
  (`phase: landing → leaving → chat`, ~460ms) into the thread; the shared constellation
  canvas bridges the two so it reads as one surface. Gemini accents on the ivory surface.
  A **waving Selena** greets above the hello — the **same `iris.png` mascot as the Home
  greeting card**, given a whole-image wave + bob (see the Branding lock; default mascot
  only, frozen under reduced motion).
- **Reading type = Manrope (2026-07-11)**: the Tutor/Chat *reading sans* is **Manrope**,
  scoped to `.aurora-chat` via a local `--font-sans` override — hello, sub, "eyebot" name,
  bubbles, composer. The monospace accent labels (`--font-mono`, JetBrains Mono) and the
  electric-indigo `#5B5BFF` identity are unchanged (this refines the *type* criterion only,
  not the "Mono + Electric" system). (Superseded the brief Figtree reading-sans trial.)
- **Ever-fresh greeting (2026-07-11)**: the hello **opener** and the cheeky **sub** both
  rotate from a **learning-humour** bank (`aurora/lib/tutorGreeting.ts`) with **no immediate
  repeats** (last indices in `localStorage.eyebot_tutor_greet`; 0/0 on first render). The
  name still renders as the Gemini-gradient `<em>`. Pure + unit-tested
  (`frontend/tests/tutor_greeting_assert.mjs`, wired into CI).
- **Sleeker refresh (2026-07-11)**: recent sessions are now **real, reopenable
  localStorage conversations** (`aurora/lib/tutorSessions.ts`, past 3; the card restores the
  full thread and continues it under the same id) — replacing the `progress.sessions`
  metadata cards. When a student has none, the recent block shows **nothing** (the hardcoded
  STARTERS fallback was removed). The greeting **name** animates as a **fast motion gradient**
  (frozen under reduced motion). No seeded in-chat AI greeting — the thread's **first bubble
  is the user's** message. Greeting + chatbox enlarged; recent cards shrunk. *Pending
  Workstream B*: the landing mascot becomes a brand-new **dancing-Iris Veo loop** (`iris.png`
  stays the poster/fallback), superseding the waving-Selena treatment in the Branding lock.

## Virtual Patients / OSCE Station — LOCKED 2026-06-25
Living Eye selection plate (photoreal cross-section + fundus inset, calibrated pins).
Station: light two-pane CaseSession (checklist ‖ consult, independent scroll), strict
in-order gating (stationGate.ts — only current step unlockable), Moderate-merged
checklist rows, allied-health handover framing (Findings & clinical impression /
Recommendation & escalation — OA/OT/PSA do not diagnose or prescribe).

## Branding / Selena surfacing — LOCKED 2026-07-06 (ricoe §6.6)
**Amended 2026-07-11 (Mono-logo lock)**: the EyeBot **mark** in this lockup (and in
`BrandSplash`) is now the **mono `<Logo>` glyph** — solid black on light / white on dark, no
colour, no halo — NOT the mascot. `dark` now also flips the EyeBot mark to white. The living
Iris **mascot** is unchanged wherever it's a *character* (Home greeting, the Tutor
dancing-Iris video below, reply bubbles). Criterion changed: *what serves as the mark*
(mascot → mono corporate mark); wordmark + divider + SNEC layout unchanged. The mascot-mark
idle/halo below is retired for this lockup.

**Direction**: the **EyeBot + SNEC co-brand lockup** appears on *every* page. The shell rails
carry it; the rail-less / immersive surfaces (Tutor landing + conversation, Flashcards,
daily Check-in) each render their own complete lockup — a **lone SNEC mark is never a
lockup**. The canonical lockup is `CoBrand.tsx`: the **living EyeBot mascot mark** (the
Selena/Iris one-eyed mascot, `/brand/iris.png`) + "EyeBot" wordmark + hairline divider +
SNEC mark. The mascot mark is **alive** — a subtle CSS-only idle (gentle breathe + a
breathing Gemini-gradient halo), frozen to a faint static halo under reduced motion. The
brand mark is always the **default** Selena, never a student's customised avatar (matches
the Tutor reply-avatar rule, ricoe A3). `dark` inverts the (white-bg) SNEC mark on dark
surfaces.
- **Acceptance criteria when refining**: every rail-less surface renders BOTH an EyeBot
  mark and a SNEC mark (a full lockup); the mascot mark has a tasteful idle that freezes
  under `data-motion=reduce` / `prefers-reduced-motion`; the Tutor landing lockup reads
  native to the "Mono + Electric" ivory surface (no bolted-on chip); WCAG-legible, no
  layout shift, 390px-safe.
- **Waving Selena on the Tutor landing (2026-07-06)**: the Tutor greeting (`TutorLanding`)
  shows a **waving Selena** above the hello. It MUST be the **same `iris.png` mascot as the
  Home greeting card** — identical look (Caleb, 2026-07-06: the flat vector `<Selena>` engine
  looks nothing like the homepage raster; use the raster) — given a **whole-image wave** (a
  tilt burst pivoting near its base, `transform-origin: 50% 92%`) + a gentle bob, with a
  floor shadow to ground it (`.tl-iriswrap`/`.tl-irisfloor`/`.tl-iris`, keyframe
  `tl-iris-wave`). It's the **default** mascot, never a student's custom (matches ricoe A3 /
  the reply-avatar rule). CSS-only; **frozen** under reduced motion. (The layered-vector
  `<Selena>` engine stays the customisation/preview renderer — it is NOT the branding mascot.)
- **Out of scope**: Login (mono `<Logo>` mark only — see the Login lock amendment). The
  **logo → animated Selena hero raster** was delivered as its own brief (see the "Animated
  Selena hero logo" lock, 2026-07-07); the mono rail + favicon logo (now the refined eye
  glyph, see the Mono-logo lock) is preserved.
  Uniforms excluded (ricoe §2).
  No redesign of any locked surface; the convo-header eye avatar keeps its own charging-
  ring/blink life.

## First-run Selena onboarding — LOCKED 2026-07-06 (ricoe §7)
**Direction**: a student who has **never customized** their Selena (`avatar_config` null →
`GET /api/avatar` returns `customized: false`) is routed **once**, on their first authenticated
visit (after check-in), into the existing gamified **Selena Studio** in a **`welcome` mode**
(`/studio?welcome=1`) — "Meet Selena … let's make her yours". The gate lives in `CheckInGuard`
(the same chokepoint as the check-in gate; students only, never staff, exempts `/studio`). Saving
(or **Skip for now**) returns to home; both set a local `eyebot_selena_onboarded` flag so the gate
never nags again, and a save flips `customized` server-side (the real source of truth). An **"Edit
Selena"** entry lives on the **leaderboard** thereafter (Profile already links Studio; the home
greeting-card entry was **removed 2026-07-10** — see the Home greeting-card simplification refine).
- **Acceptance criteria when refining**: null-avatar student is redirected to `/studio?welcome=1`
  once; a customized student (or one who skipped) is **never** redirected (show-once invariant —
  regression-tested for the repeat case); the gate never loops on `/studio` and never blocks staff
  or the check-in flow; Save/Skip in welcome mode return to `/dashboard`; the Edit-Selena entry
  (leaderboard) routes to `/studio`; WCAG-legible, 390px-safe.
- **Out of scope**: the Studio builder itself (locked, gamified one-per-page — reused as-is); the
  paid 3D portrait (fires on save as today); staff.

## Selena preview renderer — raster-composite, LOCKED 2026-07-07 · SUPERSEDED 2026-07-08
**Superseded 2026-07-08** by *Custom Selena surfaces* (below): client-side raster compositing
was removed (`renderSelena.ts` deleted, seamless-custom spec) — a student's look is now ONE
transparent AI render, and the **Selena Studio** became a **loadout** builder (the **hero** shows
only the saved render or the default mascot; picks dock as **tiles** in a **tray**; Save fuses a
new render). The original raster-composite direction is retained below for history only.
**Direction**: the instant `<Selena>` preview is composited **on top of the real homepage
raster** (`/brand/iris.png`), not drawn as flat vector — the user's non-negotiable
("identical to the selena in the homepage", 2026-07-07, after rejecting two vector looks).
The raster is the SVG base layer; customizations apply as scoped recolors + sticker overlays:
bodyColor = hue/sat/gamma filter with the eyeball repainted from the original (sclera and
highlights stay true), irisColor = the same tint clipped to the measured iris circle,
eyeShape = body-matched lids clipped to the eyeball, mouth = skin patch over the baked smile
plus a drawn mouth, everything else = remapped sticker overlays (`renderSelena.ts`).
- **Acceptance criteria when refining**: the DEFAULT config renders pixel-identical to the
  Home greeting mascot (it IS iris.png — default lashes are `none` to match); every axis id
  in the backend registry stays handled (typed-Record parity guard must compile); recolors
  keep the painterly look (whites stay white, pupil stays black — gamma, never linear);
  overlays stay anchored to the measured raster geometry (eye centre ≈ 234,234 in the 512px
  source); free/instant/deterministic — no AI in the preview loop.
- **Out of scope**: the paid per-config 3D portrait (D12, unchanged — still swaps in after
  save); the D11 curated sprite library (largely superseded by this: the base already IS the
  3D art; revisit only if extras need painterly treatment).

## Custom Selena surfaces (LOCKED 2026-07-08 · amended 2026-07-10)
A student's Selena is ONE AI render of the whole look — transparent, anchored to
iris.png — shown by the raster-only `<Selena>` component. No client-side part
compositing anywhere (vector stickers over the raster were rejected as ugly,
2026-07-08). Every fallback path is the default `/brand/iris.png`. The custom
render is shown in **Selena Studio + the leaderboard**; brand surfaces
(SelenaLogo, CoBrand, splash, rails, favicon, login) stay the DEFAULT mascot.
Spec: docs/superpowers/specs/2026-07-07-selena-seamless-custom-design.md.
- **Amended 2026-07-10 (come-alive spec)**: the **greeting card now hosts the
  DEFAULT living mascot for every student** (CSS-alive `<SelenaLogo>`; an optional
  baked **Veo** loop swaps in when installed via `<SelenaGreetingLoop>`), **not**
  the custom render (user directive 2026-07-10, "greeting Selena default from now
  on"). `GreetingHero` no longer takes `portraitUrl`. The custom render is
  unaffected on Studio + the leaderboard; all other brand surfaces unchanged.

## Animated Selena hero logo — LOCKED 2026-07-07 (logo→raster brief)
**Direction**: a **living Selena mascot logo** on three hero surfaces — the Home
greeting, a new full-screen **Splash/loading** screen, and the **CoBrand** lockups —
driven by CSS choreography over **3 paid Nano-Banana-flash pose frames** (`wave`,
`cheer`, `groove`) anchored to `iris.png` (`reference=True`), plus the existing
`iris.png` reused free as the `rest` frame. The component is `<SelenaLogo>` (two
stacked rasters: rest + one pose that cross-fades on a beat) with a live CSS
"EyeBot" wordmark — never baked into a raster. The **mono Spark-Eye** mark
(`Logo.tsx` / `icon.svg`) stays **unchanged** in the rails + favicon / PWA icon;
**Login** stays untouched.
- **Flash can't emit alpha** (D12): poses render opaque on flat chroma-green
  (`#00B140`) and are keyed to transparency + normalised to 512² by a **dev-only**
  PIL pipeline (`tools/brand/keying.py`) so they register with `iris.png`. Fallback
  if a pose halos: place it on a soft circular chip (as the OSCE faces do).
- **Motion** (CSS-only, frozen to static `rest` under reduced motion): Home = calm
  bob + a ~9s wave beat; Splash = continuous groove; CoBrand = restrained breathe +
  a rare ~12s cheer-blink. A missing/failed pose degrades to the calm rest mascot.
- **Approved prompt contract** — flash (`gemini-3.1-flash-image`), `reference=True`:
  > "The same one-eyed EyeBot mascot as the reference image — a soft, rounded,
  > hairless teal-and-cream character with a single large friendly eye and a calm
  > gentle smile, identical proportions, colours, and rendering to the reference.
  > `<pose line>`. Full body centered, plain flat solid chroma-green (#00B140)
  > background, soft even lighting. No text, no border, no watermark, no extra
  > characters."
- **Acceptance criteria when refining**: every surface reads identical to homepage
  `iris.png` (rest IS iris.png); poses keyed + 512²-normalised so swaps don't jump;
  all motion freezes to static rest under `prefers-reduced-motion` / `data-motion=reduce`;
  wordmark is live text; mono Spark-Eye rails + favicon and Login unchanged;
  WCAG-legible, 390px-safe, no layout shift. Regenerate a pose with
  `python tools/brand/generate_poses.py --generate --only <id>` then `--install`.
- **Out of scope**: rails / favicon / PWA icon (mono stays); Login; flipbook
  sequences; any new API/DB/runtime AI; the student-customisation `<Selena>` preview
  renderer (unchanged).

## OSCE patient faces — LOCKED 2026-07-07 (ricoe §8 paid art)
**Direction**: every OSCE virtual patient shows a warm, **semi-realistic** archetype face in
the consult pfp (`PatientChat`) + the station patient card (`CaseSession`), **deterministically
mapped** from the case's patient demographics — never a per-patient unique render. A curated
library of **26 faces** keyed by ethnicity × gender × age-band (+ 2 children), generated once via
**Nano-Banana flash** and committed as static `.webp` under `frontend/public/patients/`. The
classifier (`tools/patients/archetypes.py`) is the single source of truth; the cases API serves the
face path on `CasePatientInfo`; the pfp **falls back to the generic talking-head SVG** when a face
is absent (nothing depends on the asset existing).
- **Archetype axes**: ethnicity {Chinese, Malay, Indian} × gender {male, female} × age-band
  {young 18–39, middle 40–59, senior 60–74, elderly 75+} = 24 adults, + `child_boy`/`child_girl`
  (age < 16, ethnicity-agnostic) = 26. Ambiguous/Eurasian names default to Chinese (SG's largest
  group), logged — a conservative, default-safe heuristic, never a wrong guess that crashes.
- **Style**: warm, softly-rendered semi-realistic portraits — photo-like, dignified, plain
  warm-neutral background, head-and-shoulders, front-facing; **not** hyperreal, **not** cartoon.
  Culturally appropriate dress renders naturally (tudung, songkok, batik, sari).
- **Approved prompt contract** (recorded per the generated-imagery standing rule) — Nano-Banana
  flash (`gemini-3.1-flash-image`), `reference=False` (patients are NOT the Iris mascot):
  > "A warm, semi-realistic portrait of {a/an [elderly] `<Ethnicity>` Singaporean `<man|woman>`
  > in their `<age>`} / {a Singaporean `<boy|girl>` around eight years old}, friendly approachable
  > expression, soft even studio lighting, plain warm-neutral background, head-and-shoulders,
  > facing the camera, dignified and natural. Softly rendered photorealism — not hyperreal, not a
  > cartoon. No text, no border, no watermark."
- **Rendering**: circular pfp, `object-fit: cover` + `object-position: center 30%` (biases the crop
  to the face for both landscape and portrait renders); **static** (OSCE lock — no motion); graceful
  SVG fallback.
- **Acceptance criteria when refining**: every case resolves to a registered archetype (coverage
  test); face served on `CasePatientInfo`; dignified + demographically plausible + culturally
  appropriate; WCAG / 390px-safe; SVG fallback intact. Regenerate individual faces with
  `python tools/patients/generate_faces.py --generate --only <ids>` then `--install`.
- **Out of scope**: per-patient unique faces; SNEC clinical uniforms (excluded until specified);
  the logo→Selena raster (separate deferred brief); any animation on the face.

## Generated imagery standard — STANDING
Medically and anatomically correct AND beautiful; accuracy baked into prompts; SNEC
staff wear SingHealth blue scrubs with orange trim (pure-orange collar, no gap, plain
sleeves); user confirms before any paid generation; approved prompts get recorded in
the feature's brief here.

## Leaderboard "The Climb" — LOCKED 2026-07-10 (ricoe D7 refresh)
Warm-premium gamified board scoped under `.lb-climb` (home palette + Bricolage, soft
shadows, gradient banner, self-hosted `:has(.lb-climb)` warm canvas in leaderboard.css).
Four layers, all derived client-side from the existing `/api/leaderboard` payload (no
backend/DB change): **podium** (top 3, gold/silver/bronze, crown + champion glow on #1,
tier crests), **rivalry spotlight** (`computeRivals`: exact XP to overtake the person
above — flagged when it reaches the podium — plus the chaser below; handles #1 / last /
hidden), **XP tiers** Bronze<2000 · Silver 2000 · Gold 4500 · Platinum 7000 · Diamond
10000 (`tiers.ts`, banded rows + crests), and **glowing tiered rows** (count-up XP +
leader-relative bar, violet you-row). Settings (hide toggle, display name, Edit Selena)
demoted to one slim bar. Tier crests + champion crown are generated Nano-Banana-flash webp
with committed SVG fallbacks (`crests.tsx`). CSS-only motion, frozen under reduced motion;
390px-safe; one-time podium confetti (session + reduced-motion gated, via `@/fx/confetti`).
- **Preserved D7 behavior**: everyone-by-default, XP-only rank, opt-out hide, optional
  display name, role filter, real `<Selena>` headshots (default-mascot fallback), the
  "Edit Selena" entry.
- **Acceptance criteria when refining**: reads as the `.aurora-home` family; podium +
  spotlight + tiers + glowing you-row all present; every D7 behavior intact; zero
  backend/DB change; motion fully frozen under reduced motion; 390px-safe; WCAG-legible;
  crests degrade to committed SVG if a webp is missing. Spec:
  docs/superpowers/specs/2026-07-10-leaderboard-the-climb-design.md.
- **Out of scope**: real weekly leagues (promotion/relegation/reset — needs backend),
  rank-movement arrows (needs history).
