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

## Flashcards — LOCKED 2026-06-30 · re-themed "Dark Arcade" 2026-07-12 (supersedes "Grand Prix") · topic-picker → 3D depth-banked COVERFLOW 2026-07-12 (readable at the full role syllabus, OA 26 / OT 31 topics)
**Theme (2026-07-12 — user-directed, supersedes "Grand Prix"/Mario-Kart)**: the flashcards world
is **one dark ARCADE world** — clinical active-recall as an addictive game, in **classic/arcade
language** (no Mario/Grand-Prix/racing terms anywhere — copy, class names, or `--fc-*` tokens).
**Selection, intro, study and results all share ONE dark graphite ground** (`#1b2636→#0a0d12`)
with a **slow moving colour-bloom** (`@keyframes flash-drift` on `.flash-root::before`, topic-hue
driven — beautiful, never distracting) so pick → play is one seamless scene (no bright-sky→dark
jump). **Vibrant, high-saturation neon palette** as `--fc-*` on `.flash-root` (red #ff3b30, blue
#22bcff, green #2ee85a, coin #ffd21e, peach #ff7ab8, purple #9b6bff). **Selection** is a **large 3D COVERFLOW** (a rotating depth carousel, one dominant front card) of topic cards
(`CardFanCarousel`) over the dark ground — **no race numbers, no
pagination dots**, neutral glass arrows only, a topic-hue glow pool under the cards. **Study/intro**
is the **dark graphite card** (front #1b2029, back #14171d) with an **animated glowing topic-hue
rim**; the study card **matches the intro card** — same dark surface + rim and a **dark question
header with a glowing topic eyebrow** (NOT a coloured banner). A **persistent HUD** above the flip
carries `Q n / N` + segment pips (left) and **SCORE + STREAK ×N** (right); score ticks up on reveal,
**no grid-position / overtake mechanic**. Tap an answer → the **power meter** fills (`ChargeBeat`
transparent tap-through timer) → the card **rolls + flips** to the payoff (**PERFECT! / MISS** +
score + combo + a streak callout) over the model answer (**"Explanation"**). **Answer buttons are
dark NEUTRAL by default (never red)**; a correct lock is **✓ bright green**, a wrong lock is **✗
bright red** — card-verdict red is reserved for wrong answers (icon + colour, colour-blind-safe); a
second, permitted red lives on the fixed top-left **Pause** control (control-chrome, not a verdict —
see the Pause/Quit bullet below), so the two reds never collide in one glance. A correct reveal cycles
a bright celebratory rim. The **reveal back face is fully CENTRED** and the **Next button sinks to
the card's bottom**.
**Acceptance criteria when refining**: selection + activity share ONE dark moving-gradient ground;
topic cards are LARGE with no numbers/dots; study card = dark graphite on BOTH faces matching the
intro card; answer buttons neutral (green ✓ / red ✗ only on lock); reveal centred with Next at the
bottom; **carousel motion (topic select) + real 3D flip (activity) are mandatory and never regress**;
verdicts icon+colour; everything **freezes hard under reduced motion** (no drift, no roll, instant
flip, spinner slows); WCAG-legible.
- **Selection**: the coverflow (`CardFanCarousel`) — a 3D depth carousel with ONE dominant front card;
  continuous auto-drift, drag/flick to spin,
  neutral glass arrows nudge (**no dots**, **no race numbers**, **no wheels/speed-lines/asphalt**);
  freezes to a static parked coverflow (Mixed facing front) under reduced motion. **Topic pick is resolved at the STAGE, not
  per-card**: cards are `pointer-events:none` and a tap opens the topic whose live on-screen centre
  is nearest the pointer. **Never regress to a per-card `<button>` onClick** — the drift + 3D
  projection make each card a moving, mis-projected target, so taps fall through to `.fan-layout`
  and do nothing (shipped broken 2026-07-11; identical to the home FeatureCarousel failure).
  Keyboard Enter still picks via the button. **The harness must click a topic in FULL motion** —
  the pick was only ever tested after reduced motion froze the fan, which hid the bug. Per-topic
  Nano Banana photos (SG stock-photo look, plain solid-blue scrubs, no institutional branding —
  see the topic-art contract below), in a premium image card with a topic-hue frame + halo. No
  difficulty picker, fixed 10-card decks, no scroll (dvh-sized).
  **Motion geometry (amended 2026-07-12, user-directed — CRITERION: the front card must be clearly
  dominant and readable at the REAL role syllabus size, OA/PSA 26 topics / OT 31)**: the picker is a
  **3D depth-banked COVERFLOW**. Each frame, per card, `.fan-ring` writes a coverflow transform as a
  smooth function of the card's signed distance from the front: the centre card is pushed **FORWARD**
  (`+frontZ`, bigger, upright, opaque, on top), neighbours are pushed **BACK** (`-backZ`/`-stepZ`) and
  **banked away** (`rotateY` saturating to `±TILT` 54°), sliding out sideways (`translateX` gap1 + stepX).
  `.fan-layout` stays a **flat, full-stage pointer catcher** (a tap anywhere resolves against live card
  rects). **⚠ TWO THINGS ARE MANDATORY, both because a real role has 26–31 topics:**
  1. **Real DEPTH, not a flat ring.** The earlier ring pushed EVERY card to nearly the same depth
     (`translateZ(radius)`); under a weak `perspective(2500)` all the windowed cards were ~the same size
     and read as one overlapping slab (shipped broken TWICE). The fix is `perspective: 1200px` **plus**
     forward/back Z, so the front card is unmistakably the biggest. **Never flatten the perspective or
     drop the front/back Z split.**
  2. **WINDOWING.** Only the front card ± `WINDOW` (3) is drawn; the rest park at opacity 0. The pool
     still contains EVERY role topic (nothing is excluded — all 26/31 are reachable by drag/arrows);
     windowing only bounds what's VISIBLE so many topics never crush.
  Every other selection invariant is preserved — LARGE cards, no numbers/dots, neutral glass arrows,
  drag/flick + one-topic arrow nudge, **stage-resolved pick** (which also skips parked out-of-window
  cards), and a reduced-motion freeze **parked with Mixed facing front**.
  **Criterion changed 2026-07-13 (user-directed — topic cards 100% opaque):** every VISIBLE card is
  now **fully opaque** — the front card AND both banked neighbours (`opacity: clamp01(WINDOW - a)` in
  `CardFanCarousel`'s paint loop, so `a ≤ WINDOW-1` ⇒ 1). Depth + bank alone rank the cards; there is
  no dimming of neighbours. The opacity fades **only across the final window step** (`a` = `WINDOW-1` →
  `WINDOW`) so a card entering/leaving the window still eases 1→0 instead of popping. **Windowing is
  untouched** — cards beyond `WINDOW` still park at `opacity 0`; that hard cap is what keeps 26–31
  topics from crushing into a slab and must never be removed. **ALWAYS verify the picker at the real ~26-topic scale, not the toy harness mock — the
  harness `flashcards/topics` mock is now the full 26-topic OA syllabus (27 cards) so a crush-at-scale
  regression fails CI.**
- **Flat card face + enlarged cards + gold-title lede (refine 2026-07-12, user-directed)**: the topic
  card interior is now **completely flat** — the glassy inner treatment is gone (the `.fan-card-gloss`
  white-gloss overlay + the inner `inset` highlight/vignette box-shadows on `.fan-card-media`), leaving
  just the image inside the **kept** colourful outline (4px hue frame + crisp ring + wide hue halo) and
  the outer depth shadow. Cards are **enlarged** (desktop 300×392 → **348×452**, mobile 220×288 →
  **252×328**; `getCardWidth`, the `.fan-card` centering margins and both `.fan-stage` height clamps move
  together so the bigger forward front card never clips). The lede's **top line** (`.flash-setup-title`,
  the rotating `flashTaunt` dare) is the addictive arcade **coin-gold** (`--fc-coin`) — enlarged to
  `clamp(46,9.2vw,88)`, 900, with a topic-hue glow so it harmonizes with the moving bloom — so it
  **dominates**; the **sub** (`.flash-step-sub`) is **enlarged** to `clamp(16,3.2vw,23)` but keeps its
  original **neutral gray `#b9c2ce`** (user reverted the sub colour back 2026-07-12), so the gold title
  overpowers by colour + scale. **Criteria changed**: *card-face material* (glass → flat), *card size*
  (larger), *lede type/colour* (title white→gold, both lines enlarged; sub stays gray). Every other
  Selection invariant is preserved (coverflow depth/windowing, stage-resolved pick, no numbers/dots,
  neutral glass arrows, reduced-motion freeze).
- **Study**: instant-tap MCQ on the dark card — persistent HUD (**score + streak**) above the flip,
  a **dark question header** with a glowing topic eyebrow, **neutral option buttons** (✓ green / ✗
  red on lock), **power meter** at the base. Reveal = **Charge → Roll + Flip → Payoff** (power-meter
  fill is the charge, transparent tap-through `ChargeBeat`; 3D flip to the graphite back face, flash,
  **PERFECT!/MISS** verdict + score + combo + streak callout, **centred**, Next at the bottom). The
  deck-load wait shows a **classic ring spinner** (`.flash-spinner`); the old `3·2·1·GO` start-lights
  (`GridLights`) are **removed**. Per-topic hue rim; green/red verdicts.
  - **Criterion changed 2026-07-13 (user-directed — the streak reads as a real fire emoji + transforms
    drastically):** the HUD streak flame is no longer the abstract CSS teardrop cluster (`.flash-flames`
    5×`<i>`); it is now a proper **flame SILHOUETTE** — an inline SVG (Lucide-flame path) with an outer
    gradient **body** + a hotter inner **core**, so it unmistakably reads as 🔥. It **escalates per tier**
    on the SAME locked colour-ramp (cold → **lit** warm orange → **blaze** gold → **inferno** red-white →
    **max** blue-white plasma): the whole glyph **grows** with `--fire`, the flame licks + the core
    flickers faster, **embers** rise from blaze up, and max adds a pulsing heat **halo**. Kept: left-gutter
    placement (flame LEFT of the number), baseline-alignment with Score (the flame is `position:absolute`
    so it adds no row height), and a **hard freeze under reduced motion** (static coloured flame, no
    licking/embers/halo). Selectors: `.flash-flame` / `.flash-flame-svg` / `.flash-flame-body` /
    `.flash-flame-core` / `.flash-embers`; `@keyframes flame-lick` / `flame-core` / `ember-rise` /
    `flame-halo`. The `.flash-fire.is-*` tier vars (`--flame-base/mid/hi/tip/core`, `--wild`,
    `--flame-speed`) are unchanged — refine the ramp within them, never revert to the teardrop cluster.
  **Full-motion paint invariant (2026-07-11, still holds)**: any study-card element whose base state
  is `opacity:0` MUST have its reveal `@keyframes` defined. The options (`.flash-option`) start at
  `opacity:0` and depend on `@keyframes flash-rise`; a referenced-but-missing (no-op) animation once
  stranded **every MCQ answer invisible in FULL motion** — a "blank" card body. Reduced motion HID it
  (it force-sets `.flash-option opacity:1`) and a plain `.click()` succeeds at `opacity:0`, so it went
  uncaught. **Define the keyframe (never delete it)**; the harness enters study in FULL motion and
  asserts the options actually PAINT (computed `opacity → ~1`). The **decorative** loops — `fan-in`
  (coverflow/stage entrance), `flash-seg` (current-pip breathe), `flash-ignite` (option tap-spark),
  `flash-pulse` (armed multi-select lock throb), `flash-drift` (background bloom), `flash-spin`
  (loading ring) — are real `@keyframes` and **hard-frozen/slowed under both reduced-motion paths**
  (`html[data-motion="reduce"]` + the `prefers-reduced-motion` media block); refine within them,
  never strip them as "unused".
  **Shell layers stay out of flow (2026-07-11)**: FlashShell's engraved background layers —
  `EngravingField` (`.flash-engravings` / `.flash-engraving`) + `BrownianField` (`.flash-bg` /
  `.flash-spot`) — MUST be `position:absolute; inset:0` at z0, behind the z2 `.flash-content`.
  A 2026-07-11 CSS rewrite dropped these rules but kept the components, so they rendered IN
  FLOW; their unstyled, unsized glyph/spot SVGs ballooned the box to ~20000px and shoved the
  whole intro/card ~20000px BELOW the viewport — it painted fine but off-screen = the "blank
  screen after a topic pick." Like the paint bug, a `waitForSelector`/`innerText` check passes
  on off-screen content, so the harness now asserts the intro's box sits WITHIN the viewport,
  not merely that it is attached to the DOM.
  - **Criterion changed 2026-07-12 (option tiles fill the card; no tap-to-lock hint line):** the
    front face used to carry a `.flash-hint` foot line ("tap to lock — no submit" / "tap all that
    apply, then lock") and short option boxes pinned near the top, leaving a dead gap above the
    power meter. Now the hint line is **gone** — a single-select card locks instantly on tap (no
    hint, no submit), and only multi-select keeps a control (its lone lock reticle, right-aligned;
    the qhead "Select all" badge already signals multi). The option list `flex:1`-grows and the
    tiles share that height (`.flash-options > li { flex:1 1 0 }`) so they **fill the space between
    the question header and the meter** — bigger boxes, bigger text (`.flash-otext` ~17–20px, lamp
    38px), no white space inside the card. Harness asserts `.flash-hint` is absent on the study card.
- **Pause / Quit (Task 24)**: a **neon-red PAUSE control** replaces **Exit** once a game is under
  way — same fixed **top-left** position as the retired Exit, distinguished by the pause-bars icon
  + "Pause" label, red permitted here as control-chrome (see the reworded verdict-red note above).
  Tapping it opens a dark-arcade `PauseMenu` (`data-testid="flash-pausemenu"`): **Resume** / **Switch
  deck** / **Quit game**. Both **Switch deck** and **Quit** forfeit the round: each asks for a confirm,
  then deducts a flat **20 Lumens** (`POST /api/flashcards/forfeit`, server-owned amount). Quit routes
  home to `/homepage`; Switch deck re-rolls to the topic picker. The lifetime `coins_earned` counter
  (badges) is untouched — only the spendable balance takes the hit.
  - **Criterion changed 2026-07-12 (was "Switch deck is penalty-free"):** penalty-free Switch deck was
    a Lumens quit loophole — pause → Switch deck → the free Home on selection let a student bail a
    losing round for nothing. The forfeit is now bound to the **round-active** invariant (first study
    card rendered → deck finished), not to one button, and fires **exactly once per round** on *every*
    unfinished exit: Switch deck, Quit, browser Back, ⌘K→away, refresh/tab-close (`pagehide`+`sendBeacon`,
    best-effort). Selection / Begin-intro / loading / empty / results are not active rounds ⇒ free to
    leave. Guard: `forfeitGuard.ts::createRoundForfeit().spend()`. Spec:
    `docs/superpowers/specs/2026-07-12-flashcards-quit-forfeit-loophole-design.md`.
- **One coin glyph app-wide (Task 24)**: the HUD **Score** stat and the reveal **Payoff** points both
  render the single `<Lumen>` coin — the old flat, two-circle local `CoinIcon` in
  `McqCard.tsx` is retired. Every Lumens surface in the app (flashcards, home, leaderboard, tutor
  rewards) now shares this one glyph; never reintroduce a bespoke coin icon.
  - **Criterion changed 2026-07-12 (was "engraved-iris" = a colored blue eye on the disc):** the coin
    is now an eye **engraved INTO the gold** — a struck medallion whose eye motif (chiselled almond,
    domed iris ring, iris striations, deep pupil recess, catch-light) is minted from the **same metal**,
    read purely by **tonal-gold relief** (double-offset bevel: a dark wall up-left + a bright wall
    down-right). NO colored eye — no blue iris / white sclera / black pupil pasted on top; the deepest
    recess is warm dark (`#5a3d00`/`#2a1c00`), never blue/white/black-as-colour. Legible down to 14px
    (the pupil anchors the read); verify at 14/18px, not just large. Refine the metal/relief within this
    lock; never regress to a colour-filled eye. `frontend/src/aurora/components/Lumen.tsx`.
  - **Optional `spark` prop (celebratory surfaces only):** adds a slow sheen sweep + a rim twinkle + an
    occasional blink (the engraved eye squashes shut, ~5.2s cycle). Enabled ONLY on the reveal **Payoff**
    (correct answers) and the **RewardBanner**; **off by default** so the many small inline coins
    (leaderboard rows, home, HUD) stay calm and never distract. Freezes under reduced motion (OS pref +
    the app `data-motion="reduce"` toggle). Keep motion opt-in and hero-only.
- **Topic intro (ricoe B5)**: a fan pick shows a pre-deck `TopicIntro` beat before Q1 — a "Ready"
  kicker, the topic name, a one-line blurb (`TOPIC_BLURBS`), an `N questions · mixed difficulty ·
  instant scoring` meta and a "Press start" CTA — in the same dark arcade card language. Deck loads
  in the background; tutor-handoff and `?mode=review` flows skip it.
  - **Criterion changed 2026-07-12 (was "intro top-left → Home/dashboard"):** the intro's top-left
    control now reads **"Topics"** and steps **back to the topic fan** (in-place selection reset), not
    the dashboard — the intro is a "which topic?" beat, so its natural back is the picker. Still a
    free exit (the intro is not an active round → no forfeit). `Flashcards.tsx::backToTopics`;
    `FlashShell` `exitLabel` prop. Selection/loading/empty/results keep the "Home" → dashboard control.
- **Combo burst (ricoe B3)**: crossing into a new multiplier tier fires a loud, game-phrased
  `ComboBurst` slam (DOUBLE UP ×2 / ON FIRE ×3 / UNSTOPPABLE ×4 / GODLIKE 10+) with the ×N, a
  shockwave ring and the streak count; `pointer-events:none`, self-dismissing, keeps rewarding
  every 2-in-a-row past the ×4 cap. Phrase + multiplier from `comboCallout`/`comboMultiplier`.
- **Topic-art contract** (`tools/media/generate_flashcards_topics.py`; per-topic prompts in the
  sibling data file `flashcard_topic_subjects.json`, 3:4). Every image must be: bright professional
  **stock-photo** look; **clinically/anatomically accurate AND instantly recognizable** (an OA/OT/PSA
  names the exact topic in one glance — the top priority); any people reflect **Singapore's**
  multi-ethnic mix; any scrubs **plain solid blue — no trim/piping/collar/lanyard/badge/ID**;
  **no text/letters/numbers/labels/UI/watermark** (a clinical scan *image* on a screen is fine, sans
  readable text); **no logos or SNEC/SingHealth/institutional branding**. **Faces are welcome** (the
  old "hands-only / faces minimal" rule is retired — recognition beats face-avoidance). **Model tier
  is a flash/pro mix** (`model_for` / `PRO_TOPICS`): **pro** (`gemini-3-pro-image`) for fine clinical
  detail — eye/fundus macros, pathology, plates, diagnostic scans, obscure instruments (PAM/HRT); **flash**
  (`gemini-3.1-flash-image`) for clinic scenes/people. One image per `topic_key` + `mixed`. Regenerated
  46/46 + **adversarially verified** (one strict ophthalmic reviewer per image) 2026-07-11. Gotcha:
  never name a device brand in the prompt (the model prints it as on-device text/branding); describe
  instruments functionally.
- **Out of scope for refinements**: scoring model (deterministic, no AI in study loop),
  two-pool role content model {OA=PSA}+{OT}, 50-cards-per-topic mandate.

## Home / Dashboard — LOCKED 2026-07-01 · refined "come alive" 2026-07-10
Warm-premium bento `.aurora-home` (Bricolage Grotesque): GreetingHero with the
ever-changing greeting engine + **Iris** mascot, StreakTile, FeatureCarousel (3D
coverflow, back-card fade), MilestoneLadder, LumenLadder (lifetime-Lumens vault —
WeekStats retired, see the Task 24 amendment below). Old dark dashboard
(StreakBand/GradientHero/GoalRing) is retired; do not revive.
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
- **Leaderboard tease (refine 2026-07-14, user directive)**: the simplification acceptance
  ("only headline + sub + XP bar") is amended to also allow **one leaderboard tease** — a
  pill (`.hm-lb`, gold medal + "See where you stand" + arrow) linking to `/leaderboard`, placed
  **under the XP bar in the capped left column** so it never overlaps the right-side mascot.
  Amended same day (user: *"too subtle, make it in your face"*) from a quiet translucent chip to
  a **BOLD candy CTA** — saturated violet→magenta→burnt-orange gradient, gloss + travelling shine
  sweep + an attention pulse, white text. Still **one** control (not a revived CTA-button *row*).
  **Acceptance**: single pill, left-column only, no mascot overlap at 900/560/390px, all motion
  (pulse/shine/hover-lift) freezes under reduced motion, white text stays WCAG-AA on every
  gradient stop.
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
  bento **layout + card set**; the FeatureCarousel **coverflow mechanics**; ~~WeekStats
  real-data-only~~ (superseded by the Task 24 Lumens-vault amendment directly below — WeekStats
  itself is removed); the **default Iris mascot**; the greeting-card simplification; and every
  prior Home acceptance not otherwise superseded.
- **Lumens vault replaces WeekStats (Task 24, 2026-07-12)**: the `.hm-lower` right slot is now the
  **Lumens vault badge card** (`LumenLadder`, `data-testid="lumen-ladder"`) — lifetime-Lumens
  (`coins_earned`) tiers **Spark → Supernova**, a sibling vibe to the streak-badge card
  (MilestoneLadder) at its left with distinct art. This **SUPERSEDES** the prior "WeekStats
  preserved" hard constraint above; the dropped week stats (recall / topics / sessions) are an
  accepted product tradeoff, not a regression to fix.
- **Acceptance criteria when refining**: bold/saturated yet **WCAG-AA legible on every surface**
  (white-on-fill kept ≥3:1 for the large numerals/labels); **390px-safe** (no horizontal overflow);
  **all added motion** (XP shine, heat-glow, jewel pop, today-pulse, springs) **freezes** under
  `prefers-reduced-motion` / `data-motion=reduce`; the aurora harness stays green (structure,
  testids, badge states, mascot reduced-motion freeze all intact); **no generated asset replaced.**
- **Split-hero feature cards + coloured stat/badge cards (2026-07-13, user directive: "cards too
  small / dull / too layered — not seamless; regenerate all 3 with nano banana; the boring-white
  stat cards should be beautifully coloured; the two badge cards same size + bigger badges")**:
  - **FeatureCarousel is now SPLIT-HERO** (`FeatureCarousel.tsx` + `.hm-fcard*` in `home.css`): each
    card is **two layers** — a bold candy CSS gradient (dark-enough on the LEFT for WCAG white text,
    brighter right) + a **transparent Nano-Banana mascot cut-out** bleeding off the right — with only
    **title + sub + CTA** on the solid left. The kicker pill, the big deco icon, the tile-icon, the
    orb and the scrim are **removed** (`FEATURES` lost `icon`/`kicker`); cards **enlarged** 384×220→
    **466×300** (carousel 306→360px; SX/DZ retuned). Each mascot now **DOES its feature action**
    (tutor → points at a glowing lightbulb; vp → examines with a handheld **ophthalmoscope**; flash →
    fans glowing recall cards). This **SUPERSEDES** the come-alive "full-bleed default-Selena scenes"
    + the "**feature scenes preserved / no generated asset replaced**" hard constraints — the three
    `brand/features/{tutor,vp,flash}.webp` are **replaced with transparent alpha cut-outs**.
  - **Stat/badge cards coloured** (were boring white): daily-streak = warm **amber/peach** wash
    (`.hm-streak`); streak-badge shelf = **violet** tint (`.hm-panel--streakbadge`); Lumens vault =
    **gold** tint (`.hm-panel--lumen`) — one cohesive family from the homepage candy palette, CSS-only.
  - **Badge shelves equal-size + bigger**: `.hm-lower` `1.55fr/1fr` → **`1fr/1fr`**; medallions
    76→**98px**, name 13.5→15.5px, meta 11.5→12.5px, tighter padding (kills the white space).
  - **Pipeline gotcha (recorded so nobody re-fights it)**: Nano-Banana **flash ignores "transparent
    background"** and paints the transparency **checkerboard** (fully opaque). `tools/brand/
    generate_feature_art.py::key_background` flood-fills the desaturated bg (chroma ≤46, connected
    from the border) to **real alpha**, erodes 2px + feathers to kill the grey fringe; `--key`
    re-keys existing `.tmp` PNGs without a paid regen; install saves **RGBA→webp** (alpha kept).
  - **Acceptance preserved**: WCAG-AA white-on-gradient, **390-safe** (`.aurora-main-scroll`
    `overflow-x:hidden` clips the oversized coverflow; measured 0px), coverflow **mechanics
    unchanged** (drift / tap-to-nearest / arrows / keyboard), reduced-motion freezes + all home
    testids intact, aurora harness green on a prod build.
- **Badge cards → dark "game vaults" (2026-07-13, user directive: "make the lumens and streak
  badge cards a dark, addicting game gradient — still matching the homepage, both different;
  the streak orange more vibrant; rename Badge collection → Daily streak vault")**: the two
  `.hm-lower` shelves are no longer light tints. **SUPERSEDES** the "streak = violet tint / Lumens
  = gold tint" criterion directly above.
  - **`.hm-panel--streakbadge`** = molten-**ORANGE** fire (dark ember base + a saturated orange
    glow blooming from below); **`.hm-panel--lumen`** = deep royal-**violet → GOLD** treasure —
    two distinct dark vaults, both still from the homepage palette. The streak card is renamed
    **"Daily streak vault"** (`MilestoneLadder` header + `aria-label`); Lumens keeps its name.
  - **Legibility rule (keep when refining)**: the hot glow blooms from *below the opaque
    medallions* so the header band stays dark; every label is lifted to warm-white + a soft
    text-shadow (small count/note/meta rely on the shadow). The global violet "next" pulse ring
    is retinted **per vault** (orange / gold). A slow inset-glow *breathes* and **freezes** under
    `prefers-reduced-motion` / `data-motion=reduce`. CSS-only; medallions/badge-states/testids
    untouched; 390-safe. Shipped isolated on `origin/main` (the local tree was a stale
    re-derivation of already-pushed home work).
- **Daily-streak CARD -> bold orange+yellow, all-white text (2026-07-13, user directive: "streak
  card base orange & yellow gradient, white-outline flame, no dark text — only white/light")**:
  the `.hm-streak` card (the StreakTile hero, NOT the `.hm-panel--streakbadge` vault above) drops
  the **warm amber/peach wash** criterion for a **bold deep-orange gradient** (`#F1600C->#CE440A`)
  with the **yellow** delivered as a heat-glow *behind the flame* (a text-free zone, so white labels
  stay legible). **Every** label/number/dot is now **white/light** (were ink/violet/burnt-orange):
  `.hm-t`, `.hm-rc`, `.hm-snum` (solid white, was orange->red clip), `.hm-slbl`, week `.hm-wl`,
  `.hm-nl`; done week-dots = white chip w/ orange check; today = white ring; the goal-ring SVG
  strokes (`StreakTile.tsx`) are white/translucent; the "days to go" tag is a frosted-white pill.
  The **flame is a clean white outline** (`.hm-flame` + `.core` + header `.ico` -> `#fff`; flicker
  drop-shadows retinted warm-brown so they don't tint the white flame). **Criterion changed**: base
  hue and text colour (mixed dark -> white only). **Acceptance preserved**: white large text >=3:1 on
  the deep-orange fill; 390-safe; structure/testids (`streak-tile`) unchanged; reduced-motion still
  freezes flame/ember/heat/dot animations; aurora harness green on a prod build.

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
- **Type-scale + density refine (2026-07-13, user-directed: "enlarge all words in osce
  activity and osce selection, reduce white space significantly")** — CSS-only in
  `aurora.css`, criterion changed: *type scale + spacing density* (structure/gating/
  handover framing untouched). Both OSCE screens read **bigger and denser**: selection
  (`.aurora-cases*`) enlarged page/journey/tier/patient-card type + atlas readout + pin
  labels; activity (`.aurora-station*`) enlarged station title/HUD/patient header/
  checklist phase+step rows/consult bubbles/pane titles/grade card/tray chips/handover
  form/`.aurora-s100-*` debrief — with page/card/step/thread padding, gaps and margins
  trimmed throughout. The shared `.aurora-eyebrow` bump is **scoped** under
  `.aurora-cases`/`.aurora-station` so no other screen changes. **Acceptance when
  refining**: visibly larger type on both screens, WCAG-legible, **390px no-overflow
  preserved** (aurora + station harness assert it); no structural/behavioural change.

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
  or the check-in flow; Save/Skip in welcome mode return to `/homepage`; the Edit-Selena entry
  (leaderboard) routes to `/studio`; WCAG-legible, 390px-safe.
- **Out of scope**: the Studio builder itself (locked, gamified one-per-page — reused as-is); the
  paid 3D portrait (fires on save as today); staff.

### AMENDMENT 2026-07-13 — Eyecon rename + MANDATORY first-login + instant preview + surface restriction
Supersedes the criteria above (skip flow, `eyebot_selena_onboarded`, Profile Studio link,
"Edit Selena" leaderboard entry) and the *Custom Selena surfaces* lock. Authored with the user.
- **Rename**: the customizable avatar is **Eyecon** (not Selena) across the student-facing product —
  component/file names (`<Eyecon>`, `EyeconStudio`, `EyeconLogo`, `EyeconBadge`,
  `EyeconGreetingLoop`, `EyeconMenu`), CSS classes (`.eyecon-*`, `.hm-eyecon*`), test-ids
  (`eyecon-logo`), and all user-visible copy. Intentionally kept as legacy (user-invisible): the
  Supabase `selena-avatars` bucket, the `greeting-selena.*` loop binaries, `/api/avatar` + the
  `avatar_config` column, and Python-side comments.
- **Mandatory & unskippable**: the first-run gate now keys off **server truth only**
  (`avatar.customized === false`) — the local skip flag is deleted. A student who hasn't created
  their Eyecon is forced into `/studio?welcome=1` and **cannot reach any feature page** until they
  **Save** (the only exit). There is **no "Skip for now"**.
- **One-time / locked**: once `customized === true`, `/studio` redirects to `/homepage` — the
  Eyecon is created exactly once and can **never** be re-customized (dev-always mode exempt). **All
  "Edit Eyecon/Selena" entry points are removed.**
- **Instant preview + vibrant Studio**: every tap updates the hero live (last-touched feature tile
  swaps in; colour axes light a ring + body/eye/blush hue echo), fixing "no response / shows
  default". `<Eyecon>` gains a **representative-tile fallback** so a saved look shows customized even
  without the paid render. Studio styling is a **vibrant warm "sunset arcade" character-select**
  (scoped `--st-*` palette, conic hero frame, chunky tiles, springy pops) — explicitly **no
  kart/racing/Mario motifs**; reduced-motion aware; 390px-safe.
- **Surfaces (restricted)**: the customized Eyecon appears **only** in (a) the **home top-right
  button** (opens a popover: Change password + Log out) and (b) the **leaderboard**, plus the
  **nav-rail chip** as **display-only** (no navigation). The **Profile screen + `/profile` route are
  removed**; staff change-password/sign-out live on the Console rail. The Home greeting stays the
  **default brand mascot**, never the custom Eyecon.
- **Acceptance when refining**: uncustomized → forced/unskippable welcome Studio, blocked from
  dashboard/features; no Skip control; customized → `/studio` redirects home; a tile tap swaps the
  hero `<img src>`; home button opens the popover; leaderboard renders the fallback tile from
  `avatar_config` and carries no Edit control. Regression-tested in `frontend/tests/eyecon_assert.mjs`.

### AMENDMENT 2026-07-14 — Eyecon Studio is a fixed PRESET LIBRARY (no layered customization)
Supersedes the *builder* interaction above (per-axis steps, colour swatches, layered compositing,
"one of N combos"). Authored with the user ("create a long, expanded library of preset Eyecons…
they click the one they want and that is their Eyecon, fixed, no customisation… use what you
already generated in past sessions, do not regenerate").
- **Library, not builder**: `/studio` is now a single scrollable gallery of **every pre-rendered
  character tile already committed** under `frontend/public/avatar/tiles/<category>/<id>.webp`
  (~103 across outfit · topper · glasses · mouth · eyeShape · lashes · accessory), grouped by
  category, plus a leading **Classic** (the default mascot). The student taps **one**; that is their
  Eyecon. **No mixing, no colour/shape/axis pickers, no regeneration** — the tiles are the ~105 paid
  renders from past sessions, reused as-is.
- **Storage = a portrait ref**: a pick saves `avatar_config.portrait = "<category>/<id>"` (JSONB,
  **no migration**), validated **fail-closed** against the `PORTRAIT_TILES` catalog in
  `tools/avatar/parts.py` (rejects unknown ids, path traversal, non-strings). Categories may be
  prop-only (`glasses`/`lashes`/`mouth`) with no compositor layer art — the ref carries them anyway.
- **Render**: `<Eyecon>` renders `config.portrait` as one baked `/avatar/tiles/<ref>.webp` image;
  absent ⇒ it composites the axes as before (backward-compatible — old composite configs still work
  on the home button + leaderboard, which pass the full `avatar_config` through unchanged).
- **Kept from the prior lock**: the mandatory unskippable first-run welcome gate (Save is the only
  exit), the one-time re-customization lock for students (staff may re-open), and the restricted
  surfaces (home button + leaderboard). `PORTRAIT_TILES` is kept in lockstep with the committed
  files by `tests/avatar/test_portrait_tiles.py`.
- **Acceptance when refining**: `/studio?welcome=1` shows the gallery (>50 tile cards); tapping a
  card swaps the hero to that baked image and arms Save; Save persists `portrait` and the pick shows
  on the home button + leaderboard. Regression-tested in `frontend/tests/eyecon_assert.mjs` (C).

### REFINE 2026-07-14 — "Eyecon Studio" arcade restyle + edit-anytime + merged roster + save→home
Authored with the user. Refines the presentation and the re-editing rule of the preset library above;
the storage model, fail-closed validation, and mandatory first-run welcome gate are **unchanged**.
- **Criterion changed — "Library" → "Studio" wordmark**: the header/copy is renamed **Eyecon Studio**
  (no longer "Eyecon Library"), set as a beautifully-designed **Bricolage** wordmark (hot sunset
  gradient + gold 3D underprint + shimmer + twinkle) with a fun, high-energy pitch that emphasises
  *having fun while learning*.
- **Criterion changed — one merged section, no category headers**: the per-category `.lib-head`
  headers are **removed**; every character (Classic + all ~103 tiles) lives in **one** `.lib-grid`,
  headed by a big in-your-face **"Choose your fighter"** rally line (`.lib-rally`) + a short kicker.
- **Criterion changed — fill the width**: `.studio-wrap` widens to `min(1360px, 100%)` and the body
  is a desktop two-column **character-select** (sticky `<Eyecon>` preview `|` full-width roster), so
  the roster fills the side whitespace; single-column and 390px-safe on phones.
- **Criterion changed — edit ANYTIME (supersedes the one-time lock)**: re-editing is now **unlimited
  and free** (client-composited tile, **no paid render**). The `CheckInGuard` student re-customization
  bounce is **deleted** — any authenticated user (students included) may re-open `/studio` anytime; the
  **only** gate left is the first-run welcome force. Every user gets an **"Edit Eyecon"** entry in the
  home popover (`EyeconMenu`). *(This reverses the "created exactly once / all edit entries removed"
  clause of the AMENDMENT 2026-07-13.)*
- **Criterion changed — save → home**: **every** save (first-run or a later remix) briefly celebrates
  then routes straight to `/homepage` (was: only welcome-mode returned home).
- **Acceptance when refining**: header reads "Eyecon Studio"; a single `.lib-grid` with **no**
  `.lib-head`; a customized student can open `/studio` and is **not** bounced; the home popover shows
  "Edit Eyecon" → `/studio`; save routes to `/homepage`; the first-run welcome gate + no-skip still
  hold; WCAG-legible, 390px-safe. Regression-tested in `frontend/tests/eyecon_assert.mjs` (A/B/C/D/F).

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

## Leaderboard "vibrant & seamless" — LOCKED 2026-07-13 (supersedes "The Climb" D7)
User de-cluttered "The Climb": the old board stacked **five** individually-styled floating
panels (header card · podium · rivalry-spotlight card · tier-band headers · rows · settings
card) and read "messy". Rebuilt as **one continuous board** on a richer warm candy canvas,
scoped under `.lb-climb` (home palette + Bricolage), all derived client-side from the
existing `/api/leaderboard` payload (**zero backend/DB change**). Direction approved via
mockup; brief: *vibrant, seamless, gamified, addicting — "don't hold back"*.
Top→bottom: **header** (one gradient-text `Leaderboard` h1 + trophy glyph, `Season 1`
eyebrow, a short personal **chase hook** in `.lb-sub` computed from `computeRivals`
(rank + Lumens to podium/next), role-filter chips) · **podium** (top 3, glossy
gold/silver/bronze, crown + champion glow/float on #1, tier-ringed `<Selena>`, Lumens with
the `<Lumen>` coin, tier crest **+ streak flame**) · **one color-graded ranked list** (rank
4+: chunky glossy pill rows, tinted + left-accented + avatar-ringed by XP **tier** via inline
`--rc`/`--rc1` — tiers survive as a per-row accent, NOT separate band headers; each row
carries a `data-you` violet-glow state and a right cluster with **BOTH** a gold Lumens badge
(count-up) **and** a 🔥 streak badge, stacked so they always fit at 390px; `Lv` chip hides
≤420px) · **demoted settings** strip (hide toggle, display name, Edit Selena). Tier crests +
champion crown are generated webp with committed SVG fallbacks (`crests.tsx`). CSS-only motion
(header/podium shine, podium float, row entrance stagger, count-up, pulsing you-row),
**fully frozen under reduced motion**; 390px-safe; one-time podium confetti (session +
reduced-motion gated, via `@/fx/confetti`).
- **Preserved behavior**: everyone-by-default, Lumens-only rank, opt-out hide, optional
  display name, role filter, real `<Selena>` headshots (default-mascot fallback), the
  "Edit Selena" entry, `tiers.ts` math (`tierForXp`/`splitPodium`/`computeRivals`; `bandRows`
  now test-only). **Deleted**: `RivalrySpotlight.tsx`, `TierBand.tsx`.
- **Acceptance criteria when refining** (name the criterion you're changing): one seamless
  board (header → podium → single list → settings), NOT a multi-panel stack; unmistakably
  more vibrant/gamified than "The Climb" yet still the warm Aurora family; every ranked row
  shows BOTH a Lumens and a streak badge, fitting at 390px; podium (3 slots) + glowing you-row
  + real Selena portrait + role filter + hide toggle + Edit Selena all present; zero
  backend/DB change; motion fully frozen under reduced motion; WCAG-legible; crests degrade to
  committed SVG. Spec: docs/superpowers/specs/2026-07-13-leaderboard-redesign-design.md.
- **Weekly reset (refine 2026-07-15, user directive "make the leaderboard refresh weekly")**:
  the criterion changed is **"Lumens-only rank"** — it was *lifetime* Lumens, now it's **Lumens
  earned in the current week**; the board refreshes every Monday (SGT). Backend: new `xp_week` /
  `xp_week_start` columns (migration 012), the lazy-reset twin of `xp_today` — a stale/absent
  stamp reads as 0, so the reset needs no cron. `rank_entries(week_start=…)` ranks by weekly XP;
  each entry's `xp` is now the *weekly* score while `xp_total` (lifetime) still drives the **tier
  ring** and `level` (so the per-row tier accents and prestige are unchanged). Header gains a quiet
  `.lb-reset` "Resets Monday · N days left" pill under the hook; chase copy reframed to "this week".
  Everything else in this lock is preserved (one seamless board, podium, both badges, you-row,
  role filter, hide). Pre-migration the board falls back to lifetime ranking (graceful).
- **Background canvas (refine 2026-07-18, user directive "the current background looks tacky …
  nano-generated but not tacky and matches all app components")**: the criterion changed is the
  **full-bleed arena raster**. The literal gold "hall of champions" scene (regenerated 3×, still
  tacky — it was brighter/busier than the flat board on top of it) is retired for a Nano-Banana
  **abstract** canvas: a tone-on-tone antique-gold/espresso surface with a very subtle *debossed
  laurel-wreath + sunburst* motif (echoes the podium frames + hero trophy) and a soft champagne
  glow, in the exact component palette (--gold `#F59E0B`, hero `#33210f`, floor `#ECD9BC`).
  Centred (`50% 50%`) so the symmetric motif reads in the desktop side-gutters (the only place the
  canvas shows past the board); a faint warm wash + espresso floor-tint seat the ivory rows; the
  warm-sand solid backs it while it loads. Rule for the next refine: the canvas is **abstract,
  back-sitting and in-palette — never a literal scene** (that is what read tacky). Reproduced by
  `tools/leaderboard/generate_board_art.py --only bg`. Everything else in this lock is preserved.
- **Out of scope (still)**: promotion/relegation leagues, weekly *history*/standings archive,
  rank-movement arrows (needs history).

## Trainer/Admin Analytics + homepage pool toggle — LOCKED 2026-07-13
**Direction** (approved via the trainer-role spec): trainers and admins run the
**exact light student app** (daily check-in + mandatory first-login Eyecon gate
included) plus **two** additions — a homepage content-pool toggle and a dedicated
dark Analytics page. The `supervisor` role and the old dark admin/supervisor
console (Overview/Students/Accounts/Activity) are **retired**, their reusable
pieces repurposed inside Analytics.
- **Pool toggle** (`PoolToggleSwitch.tsx`, exports `<PoolToggle>`, rendered in
  `Dashboard.tsx` `.hm-topr` beside the Level chip, only for `role ∈ {trainer, admin}`):
  a **loud segmented switch `OA · PSA | OT`** with in-UI helper text (explains it flips
  which discipline's content they see, per the standing "explain to users" rule). A flip
  optimistically calls `setStudentRole` + `PATCH /api/profile/role` and invalidates
  the progress / flashcard / cases / leaderboard queries; the whole pool (flashcards,
  OSCE, check-in question, greeting track, leaderboard membership) follows. Students
  **never** see it; their pool stays fixed.
- **Analytics page** (`/analytics`, `AnalyticsGuard` → `role ∈ {admin, trainer}`
  else `Navigate('/')`; screen `aurora/screens/Analytics.tsx`): keeps the light rail
  but **self-themes dark** via a scoped **`.aurora-analytics`** wrapper (the
  `.aurora-chat` pattern — a coherent dark surface inside the light shell, palette
  mirroring the retired `.console-dark` tokens); it is **not** added to the immersive
  list and **not** wrapped in `CheckInGuard`. PowerBI-style: cohort KPI band, AI
  insight banner, engagement trend, weak-topic/benchmark bars, mastery heatmap, OSCE
  safety/most-missed; searchable roster → per-student drill-down with a one-click
  **downloadable self-contained HTML report** (`studentReportExport.ts`, cloning
  `sessionExport.ts`). Charts are **bespoke dependency-free dark SVG** primitives
  (`TrendChart` / `DonutGauge` / `BarSeries` + reused `Heatmap`/`EngagementBlock`) —
  **no new npm dependency** (keeps the supply-chain audit + bundle clean).
- **Admin-only provisioning block**: rendered only when `role === 'admin'` **and**
  backend-enforced (`require_admin`) — add account (role dropdown OA/OT/PSA/Trainer/
  Admin), CSV import, remove, promote existing email. Trainers never see it.
- **Acceptance criteria when refining** (name the criterion you change): trainer/admin
  get the light student shell + the toggle + the Analytics link and **nothing else
  role-conditional**; the toggle is a loud `OA · PSA | OT` segment beside the Level
  chip with helper text and persists the flipped pool across reload; `/analytics`
  renders **dark** via `.aurora-analytics` (not immersive), guarded to `{admin,
  trainer}`; charts stay dependency-free SVG (no chart-library import); the report is
  fully self-contained (starts `<!doctype html>`, no external `src/href/link`, every
  value HTML-escaped, `@media print`); provisioning UI is admin-only and
  backend-enforced; students see zero change; WCAG-legible, 390px-safe, motion frozen
  under `prefers-reduced-motion` / `data-motion=reduce`.
- Spec: `docs/superpowers/specs/2026-07-13-trainer-role-analytics-design.md`.
