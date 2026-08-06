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
  **Criterion added 2026-07-24 (user-directed — "hover pause in both spinning parts, but only hover
  over a small region to pause"): HOVER-PAUSE.** The continuous drift **holds while the cursor rests on
  the FRONT CARD**, and only there — a box the card's **laid-out** size (`offsetWidth/offsetHeight`,
  never its 3D-projected client rect, which would breathe with the animation) centred on the stage,
  shared with the home carousel as `inFrontCardZone` (`aurora/lib/hoverPause.ts`). **The zone must stay
  the front card**: grown to the whole stage it would stop the ring wherever the mouse happened to rest,
  which is the regression `hover_pause_assert` exists to catch. Only the **idle drift** is held — an
  arrow nudge or a flick already in flight still eases home, so the arrows keep working with the cursor
  parked mid-stage. Hover is resolved **by geometry at the stage**, never a CSS `:hover` target: the
  cards are `pointer-events:none` and a real hover target would swallow the taps the stage exists to
  catch (the same failure as the per-card `onClick` above). **Mouse only** (`pointerType === "mouse"`) —
  touch has no hover and a finger drag must never leave the ring frozen. Reduced motion is unaffected
  (already parked). Guarded by `hoverPause_logic.mjs` (the zone maths) + `hover_pause_assert.mjs` (the
  live wiring, both surfaces), both in CI.
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
- **Deck-ladder STICKER on the topic card (refine 2026-07-29, user-directed — "show the 1/5
  decks at the top right corner of the topic card with a slick sticker on top of the card")**:
  the per-topic 5-deck ladder is now read off a **die-cut sticker peeled onto the card's
  top-right corner** instead of the caption line. **Criterion amended**: "topic cards carry no
  numbers/dots" still bans **race numbers** and **pagination dots** — it never banned meaning;
  exactly ONE numeric sticker (`n/5` + a `DECKS` microlabel) is now permitted, and nothing else
  numeric may join it. The sticker is a **disc** that **overhangs** the corner, is tilted ~7°,
  wears a near-white **die-cut edge** + drop shadow (so it reads as a sticker, not a HUD chip),
  and casts a drop shadow onto the photo — a sticker sits *on top of* the image, it isn't
  printed into it. Its edge is a **conic-gradient progress sweep** of the cleared fraction.
  Three states: **fresh** `0/5` (neutral, no sweep) → **climbing** `n/5` (topic-hue sweep) →
  **cleared** `5/5` (**coin-gold** ring + glow — the arcade "cleared" read, and the visual echo
  of the topic retiring from Lumens). Rules:
  - It must live **outside `.fan-card-media`** — that box is `overflow:hidden` and would clip
    the overhang, which is the whole sticker read.
  - **⚠ NO `translateZ`.** Lifting the sticker off the card face inside `.fan-card`'s
    `preserve-3d` was tried first and looked great on the upright front card — and broke every
    neighbour: at a 54° bank a +12px Z offset projects into a large X/Y shift, so the side
    stickers **detached** from their corners and floated as orbs across the front card. Keep
    the sticker **coplanar** with the face; it then banks with its own card and the deeper ones
    sort correctly behind. The "on top" read comes from the die-cut edge, shadow, tilt and
    overhang, not from depth. Left-side neighbours legitimately occlude their own sticker (their
    top-right corner is rotated away) — that is honest 3D, not a bug to chase.
  - **No sticker** on the Mixed card (no ladder) or a locked "coming soon" topic (nothing to
    climb) — a `0/5` there is noise.
  - The **caption sub no longer states the counter**. The sticker is the single place progress
    is stated; never render both — that redundancy is what this refine removed. The old prose
    helper `deckProgress()` was deleted with its caller rather than left as dead code.
  - Progress numerals come from the pure `deckSticker()` in `deckLadder.ts` (clamped, and
    `null` on a missing/zero `deck_count`), guarded by `flashcards_deckladder_logic.mjs`; the
    live wiring + all three states are asserted in `aurora_assert.mjs`.
  Every other Selection invariant is preserved (coverflow depth/windowing, stage-resolved pick,
  flat card face, neutral glass arrows, hover-pause, reduced-motion freeze).
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
  - **Criterion changed 2026-08-03 (a picked multi-select option is legible on its own; hover
    is never a selection signal):** selection used to be carried by the tile border alone —
    `.is-picked` recoloured `border-color` and added a 3px ring, and left the `.flash-lamp` chip
    byte-identical to an untouched option. `:hover` spoke the *same* violet language one
    specificity step higher (`:hover:not(:disabled)` (0,3,0) vs `.is-picked` (0,2,0)) and its
    box-shadow carries no ring, so a hovered picked tile and a hovered unpicked tile computed to
    the **identical** border with no ring on either. On touch, where `:hover` latches onto the
    last-tapped element, a *deselected* option kept reading as selected — Branda, 2026-08-03:
    "an option appears selected, but upon submission it is not recorded as selected."
    Now: picked fills the **lamp** (fixed near-white chip, dark ✓ in place of the letter) and
    lifts the tile; hover is wrapped in `@media (hover: hover)` and excludes `.is-picked`. The
    chip fill is deliberately **not** the topic hue — `--flash-topic-hue` spans 184–260°, and at
    88%/62% its luminance swings .16 (violet) → .59 (cyan), so a white ✓ reads ~5:1 on the violet
    topics and **~1.6:1 on the cyan ones**. A fixed chip is ~15:1 on every topic; topic identity
    stays on the tile border + ring, where nothing has to be read against it. The
    lamp is deliberately the primary signal — hover styles the tile and **never** the chip, so
    selection cannot be impersonated or erased by a stray hover state. Keep that separation: a
    restyle may move the colours, but "picked" must stay legible without the border, and no
    `:hover` rule may reach a picked option. Gated by `flashcards_option_state_logic.mjs`
    (cascade, at the source) + `flashcards_multiselect_assert.mjs` (looks-picked === recorded).
    The ✓/✗ green/red **lock** grammar is unchanged — the picked chip is pre-lock and violet.
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
coverflow, back-card fade), ~~MilestoneLadder~~, LumenLadder (lifetime-Lumens vault —
WeekStats retired, see the Task 24 amendment below; the streak vault itself is retired,
see the ONE-vault amendment at the end of this section). Old dark dashboard
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
- **HOVER-PAUSE (criterion added 2026-07-24, user directive: "hover pause in both spinning parts, but
  only hover over a small region to pause")**: the never-stopping drift (`BASE`, incl. the faster phone
  tier) **holds while the cursor rests on the FRONT CARD** — a box the card's **laid-out** size
  centred on `.hm-ring3d`, via the shared `inFrontCardZone` (`aurora/lib/hoverPause.ts`), the same rule
  the flashcards coverflow uses. **The zone is the card, not the stage** — grown to the stage it would
  stop the ring wherever the mouse rested, and the side cards + the `‹ ›` arrows must always keep it
  flowing. Momentum is **not** frozen: an arrow nudge already in flight still decays out, so the arrows
  work with the cursor parked mid-stage. Resolved **by geometry at the stage** (never CSS `:hover` — the
  cards are `pointer-events:none`, so a hover target would swallow the tap-to-nearest clicks this
  carousel was rebuilt to fix) and **mouse only**, so touch and the reduced-motion freeze are untouched.
  Guarded by `hoverPause_logic.mjs` + `hover_pause_assert.mjs`, both in CI.
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
- **Phone: greeting mascot removed + faster coverflow (2026-07-20, user directive: "for phone
  view of the app only, make the spinning cards spin faster, and remove the waving eyecon in the
  greeting card")**: on phones — **both** `(pointer:coarse)` tiers (portrait `max-width:640px`,
  landscape `max-height:480px`) — the greeting card now carries **no living mascot**:
  `.hm-eyeconloop` (the Veo greeting loop) and `.hm-iriswrap` (the fallback logo) are
  `display:none`, leaving just headline + sub + XP + leaderboard CTA on the warm gradient (portrait
  already dropped the veil; nothing to keep text legible over now). The **FeatureCarousel** drift
  `BASE` steps **0.005 → 0.011** on those same tiers, gated in JS by the identical `matchMedia`
  queries. **Criterion changed**: phone greeting-mascot presence (shown → hidden) + phone coverflow
  drift speed. **Desktop/tablet (fine pointer) untouched**; the Veo asset is **preserved** (still
  played on desktop); the aurora harness runs at 1440px fine-pointer, so `.hm-iriswrap` /
  `eyecon-logo` stay visible and the greeting assertions are unaffected.
- **ONE vault + month calendar (2026-07-29, user directive: "remove streak badges and vault in
  the app, only lumens vault and badges but lumens badge names change to something like current
  streak badge names (eye-centric and fun) … i want total 20 badges … also remove percentage ring
  in streak card in homepage and show the entire month calendar in the card")**: spec
  `docs/superpowers/specs/2026-07-29-single-lumens-vault-and-month-calendar-design.md`.
  - **Criterion changed (a) — two vaults → ONE.** SUPERSEDES the "Badge cards → dark game vaults"
    two-shelf criterion and the Task-24 "`.hm-lower` right slot" criterion. `MilestoneLadder`,
    `EyeconBadge.tsx`, `streakBadges.ts` and `.hm-panel--streakbadge` are **deleted**; `.hm-lower`
    collapses to a **single full-width column** holding `LumenLadder` alone. The molten-orange
    vault gradient goes with it; `.hm-panel--lumen` (royal-violet → gold) is the only vault skin.
  - **Criterion changed (b) — Lumens badge theme + count.** SUPERSEDES "tiers Spark → Supernova"
    (6, light/wealth themed). The vault is now **20** tiers themed on **vision/acuity** — the
    aesthetic of the retired streak medallions — First Blink → Eye of Eternity, on lifetime
    `coins_earned` (100 → 52,000), rarity spread 4/4/4/3/3/2 so the per-rarity glow CSS is
    unchanged. All 20 medallions are **generated fresh** (Nano-Banana flash, `reference=True`,
    anchored to iris.png, opaque jpg); both retired sets (`brand/badges/*.jpg`,
    the old `brand/lumen-badges/*.jpg`) are **deleted**. This further SUPERSEDES the
    come-alive "badge medallions preserved" hard constraint.
  - **Criterion changed (c) — the vault is a PAGED FRAME OF FIVE.** 20 medallions in a wrapping
    grid is a 7-row tower at 390px. `.hm-badges` becomes one row, `overflow-x:auto` +
    `scroll-snap-type:x`, at **every** viewport; on mount it scrolls the **"next"** badge into
    view (instant under reduced motion) so a student lands on their target, not on rung 1. The
    page itself must still measure **0px horizontal overflow** — the frame scrolls inside its box.
    - **Refined same day (user directive: "show only 5 badges in 1 frame and allow user to click
      left and right buttons to see next/previous badges")**: the criterion changed is
      *free-scrolling shelf → **paged frame***. **Exactly five** medallions are on show at a time
      (`.hm-badge` flex-basis `calc((100% - 4*var(--bgap)) / 5)`), and `‹ ›` buttons
      (`vault-prev`/`vault-next`, with a `vault-page` "n / 4" readout) step **one page**; 20/5 = 4
      clean pages. Buttons **clamp** (disabled at each end), never wrap. It still opens on the page
      holding the next badge. It stays a real scroll container so a **touch swipe and the buttons
      drive the same thing**, and the readout re-syncs from `scrollLeft` after a swipe.
      **Page stride is measured off the DOM** (`children[5].offsetLeft - children[0].offsetLeft`),
      never from `clientWidth` — the latter drifts by one gap per page and the frame ends up half a
      badge off. The **edge fade mask is removed** (with five exactly filling the frame it dimmed
      badges actually on show), and the medallion now **fills its slot** (`width:100%`,
      `max-width:150px`) instead of a fixed 98px, so a full-width vault shows the art bigger.
  - **Criterion changed (d) — streak card: no goal ring, month not week.** SUPERSEDES the
    "jewel week-dots" and white-goal-ring criteria of the toybox + orange-card refines.
    `.hm-goalring` / `.hm-rc` / `.hm-week` / `.hm-wd*` are **deleted with no replacement** (daily-goal
    % is gone from Home entirely). In their place a **full month calendar**: 7 columns, `M T W T F S S`
    header, leading blanks so the 1st sits under its real weekday, one cell per day carrying the
    existing state vocabulary (done ✓ / today ring / missed / weekend rest moon / upcoming), plus a
    month label and an "N days this month" count. Flame, big numeral and next-tier nudge are kept.
    Needs `streak_detail.month` — new pure `current_month_states()` in `tools/gamification/streak.py`,
    sharing one `_day_state` helper with `current_week_states` so the two cannot drift. The leading
    offset is derived from the cell's own `day` NAME, never from `new Date(iso)` (that reintroduces
    the UTC/SGT off-by-one).
  - **Acceptance preserved**: WCAG-AA on every surface; **390px-safe with 0px page overflow**;
    all motion (rarity glows, next-pulse, flame, ember, vault breathe, shelf auto-scroll) freezes
    under `prefers-reduced-motion` / `data-motion=reduce`; `streak-tile` + `lumen-ladder` testids
    and the collected/next/locked badge states unchanged; aurora harness green on a prod build.
- **GAME HUD (2026-08-05, user directive: "the current homepage is decent, but does not feel
  like a addictive game i want it to be")**: spec
  `docs/superpowers/specs/2026-08-05-home-hud-phase2-design.md`, plan
  `docs/superpowers/plans/2026-08-05-home-hud-phase2.md`. Phase 1 (backend loop: daily
  quests, a deterministic daily chest, timed XP boosts, `GET /api/home`) shipped
  2026-08-04; migration 018 applied 2026-08-05. This is Phase 2, the visible half.
  - **THE DIAGNOSIS WAS MATERIAL, NOT COLOUR — and the first reading of it was wrong.**
    Phase 1's spec called The League "dark STRUCK arcade". It is not: `leaderboard.css`
    line 1 says *"bright arcade on a light stage"* and its doctrine pins base luminance
    > 0.7. Two of that file's four rejected passes were the dark ones. Home was never too
    light — it was **flat**, built from the exact four things `leaderboard.css:15-19`
    names as "the house style of a generated dashboard": 1px hairlines, blurred shadows,
    pastel fills, smooth washes. Home's own tokens were the evidence (`--sh`, `--sh-lg`
    at 5-30% blur; `--sheen`; `border:1px solid` on `.hm-chip` and `.hm-panel`). **Phase 2
    is a re-materialisation. The palette is kept; the surfaces change.**
  - **Three zones.** `.hm-deck` (new, owns the fold: StatusBar · greeting host + QuestBoard ·
    ChestTile + RankStrip) → `FeatureCarousel` → `.hm-record` (was `.hm-lower`: StreakTile +
    LumenLadder). **Nothing is deleted.**
  - **THE LIP LADDER — exactly four depths**, ported from `leaderboard.css` so Home and The
    League are one material: structural 5px/2.5px (`.hm-deck .hm-board .hm-fcard .hm-panel
    .hm-streak .hm-greet .hm-hud`), medallion 3px/2px (`.hm-chest .hm-badge`), pill 2px/2px
    (`.hm-chip .hm-claim .hm-boost .hm-risk .hm-lb .hm-pool-seg`), **flat — no lip, no
    outline** (`.hm-quest` rows, the ~35 month-calendar cells, the canvas). The flat rung is
    load-bearing: striking the element you instantiate 35 times is how "material everywhere"
    collapses into "the whole page is buttons". ⚠ **Never 1px or 1.5px** — Chrome snaps used
    border-width to whole device pixels, so 1.5px *renders* as the banned hairline;
    differentiation comes from lip depth, which is an offset and does not snap. ⚠ The press
    depth is scoped to `:where(button,a,[role="button"])` — the pill rung carries both
    controls and readouts, and only a control may claim depth-on-press.
  - **Criterion changed (a) — material.** SUPERSEDES "toybox vibrancy" (2026-07-11): glossy
    vinyl, gloss sheens, blurred heat-glows and smooth candy washes. This is a change of
    *surface*, not of boldness — the directive was "don't hold back", and a hard-stop fill
    under an ink outline is more vivid than a gloss wash, not less.
  - **Criterion changed (b) — layout.** SUPERSEDES `.hm-hero` (greeting + StreakTile side by
    side). `.hm-hero` is retired; `StreakTile` moves into the record **unchanged**. The streak
    numeral is **not** duplicated into the status bar — only the new at-risk countdown lives
    there, so two numerals can never disagree.
  - **Criterion changed (c) — type scale.** SUPERSEDES the 2026-07-10 "headline 50→62px"
    enlargement. The headline drops so the board can own the fold; it has the least claim on
    it. The greeting **engine** (`pickGreeting`, day-of-year rotation, the `<em>` accent) is
    untouched. Also removed: the greeting's level/XP readout (`.hm-lvl` / `.hm-lvbar` /
    `.hm-z`) — it duplicated four numbers the status bar now owns, and one number needs one
    owner.
  - **Criterion changed (d) — the leaderboard tease.** SUPERSEDES the 2026-07-14 BOLD candy
    gradient pill. `.hm-lb` is now the struck **RankStrip** carrying live standing (division ·
    rank of pool · Lumens to promotion; "you're in the promotion zone" at `rank <= promote_count`;
    "top division — hold your rank" when `promote_count === 0`, checked FIRST since `1 <= 0`
    is false and would otherwise fall through to a gap). Still **one** control, not a revived
    CTA row; keeps `data-testid="greeting-leaderboard"`. `@keyframes hm-lb-pulse` and
    `hm-lb-shine` are deleted. It says "Lumens", not "XP" — this app has one name for that
    currency.
  - **Criterion changed (e) — `.hm-lower`.** SUPERSEDED in *placement only*: the record is
    calendar + vault, two-up on desktop, stacked on phone. The ONE-vault decision stands.
  - **The chest may not leak its prize.** `GET /api/home` returns the drop's `key` and `label`
    **even when sealed** — the roll is a pure function of `(student_id, date)`, so the endpoint
    computes it either way. The DOM may only see them once `claimed === true` or this session's
    own claim returned. Everything reads `chestReveal()`; nothing reads `chest.label`. ⚠ The
    ceremony fires on the **claim action**, never on render — a ceremony keyed on
    `claimed === false` re-fires on every mount before the refetch settles — and only on
    `ok === true`, because showing loot the server did not grant is the same lie as painting
    "0 XP" on a failed read. `already_claimed` reconciles silently.
  - **An UNKNOWN is never a ZERO.** A null quests payload renders "couldn't load", never
    "0/3"; an undefined `done_today` renders no streak alarm at all. `questRollup` returns
    null for an empty array too — the backend always generates exactly three quests, so zero
    means the read degraded.
  - **Acceptance (new, gated by `frontend/tests/home_hud_assert.mjs`, auto-discovered by
    `start-harness.sh` and therefore in CI)**: at **390×844** the status bar, all three quest
    rows and the chest are **above the fold**; a sealed chest leaks its label into no text,
    attribute or markup; no struck object renders a border under 2px; every struck object ends
    in a **fully opaque `background-color`** (a gradient-only box has none, so a contrast probe
    walks past it and measures the wrong surface); 0px horizontal page overflow and nothing on
    the deck rotates its own box (a rotated square reports a bounding box 1.41× its width and
    escapes an overflow sweep even under `overflow:hidden`); claim/chest touch targets ≥44px.
  - ⚠ **Reduced motion freezes the shake, the burst and the confetti — but NOT the two
    countdowns.** The boost timer and the streak deadline keep ticking under both signals;
    only their pulse/glow freezes. A frozen clock lies about the time, and reduced motion is
    about vestibular safety, not about withholding information. Gated.
  - **Acceptance preserved**: WCAG-AA on every surface against its new solid fill; 390px-safe;
    every generated asset (the Veo greeting loop, the three mascot cut-outs, the 20 medallions);
    the coverflow mechanics **including hover-pause**; the vault's paged-frame-of-five and its
    clamped pager; the month calendar's day-name-derived leading offset; `streak-tile` /
    `lumen-ladder` / `greeting-leaderboard` testids; the whole browser harness suite green.

  ### Amendment 2026-08-06 — COLOUR (user directive: "the smaller cards within the big card
  are all same color and are boring, i want a variety of vibrant colors", "the homepage
  background change to something more game like and contrast better with the top card")

  The STRUCK material above is unchanged — the lip ladder, the ink outline, the hard-stop
  fills, the flat rung and every acceptance bound still hold exactly as written. What
  changes is that **the deck's objects stop sharing one furniture colour.**

  - **Criterion changed (f) — "one deck, one furniture colour" is SUPERSEDED.** That rule
    produced `.hm-hud` and `.hm-lb` in the same `#FBEFD9` cream, at opposite corners of a
    `#F1E3C7` cream plate, beside a white `.hm-board`. Re-materialising four objects into
    one colour is how a deck ends up correctly built and boring. **Hue is now identity on
    the deck**, one meaning each, and there is still no fifth system:
    | object | fill | why that hue |
    |---|---|---|
    | `.hm-hud` status rail | indigo `#2E2148` / `#41305F` | the machine. It already contained the XP groove; now the bar and the recess are one object, and the certified gold lands on it as light instead of as tint |
    | `.hm-greet` | warm peach → lavender (unchanged) | you |
    | `.hm-board` | plate `#F6F1FF`, head `#6D28D9` | **violet is the quest** — already the deck's rule, now spent at full strength instead of at its palest tint |
    | `.hm-chest` | gold `#DFA828` (unchanged) | **gold is Lumens** |
    | `.hm-lb` rank strip | azure `#BEDCFF` | The League — the only route off the deck |
    ⚠ The strip stays **light** rather than a saturated blue for one reason: **green still
    has to read on it.** Promotion is the strip's one piece of good news and mint on
    mid-blue is the muddiest pair on the deck, so `#0F6B36` — not taste — sets the ceiling
    on this hue, and `#BEDCFF` *is* that ceiling (green 4.7:1, gold glyph 3.4:1; one step
    further and both need re-inking to buy a blue nobody asked for). ⚠ The division still
    does **not** paint it — the ARCADE pass left promotion as the only thing that changes
    colour.
  - **Criterion changed (g) — the canvas.** `.aurora-main:has(.aurora-home)` was `#F1E3CF`
    carrying a `#F1E3C7` deck: the page and the object on it were the same colour to within
    one step of the sixth digit, which is why a 2.5px outline over a 5px lip still read as
    part of the paper. The stage is now **cool periwinkle `#DED8F5`** under a vignette, a
    short warm beam behind the deck, and 2px diagonal banding at 4% ink. ⚠ **Separation
    here is a HUE change, not a brightness one, and that is enforced**: `leaderboard.css`
    pins the stage above **0.7 relative luminance**, `#DED8F5` is **0.712**, and the
    plate/stage luminance contrast is therefore only 1.09:1 — warm-vs-cool plus the vignette
    carry all of it. The first pass sat at 0.641, looked right, and broke the doctrine; it
    was corrected **up**, because a stage that reads correct at one desk is not the same
    claim as a stage that meets the number. The dark rail is a *component* on a light stage,
    exactly as the `#140B26` vault has been since July.
  - **Every ink re-derived against the fill that moved, not left as inherited debt:**
    `.hm-hudxp-*` → `#FFF6EC` 15.2:1 / `#C9BCE0` 8.5:1 on the rail; `.hm-qhead` → white
    7.1:1 and a solid `#E9DDFF` tally 5.5:1 (never white-at-85%-opacity, which is a
    contrast number nobody can look up); `.hm-qspent` `#1E7A46`→`#17693C` 5.6:1 and
    `.hm-lb`'s secondary `--hink2`→`#4E4557` 7.1:1, both of which fell under AA *because
    the surface moved* and are therefore fixed in the same pass.
  - **Criterion changed (h) — the greeting card's height.** `.hm-greet` now carries
    `::before { float:left; width:0; padding-top:29.5% }`. ⚠ **This is load-bearing, not
    styling.** The Veo loop is 1280×720 and the mascot spans 385 source px of it; on a card
    wider than 16:9 `object-fit:cover` scales by WIDTH, so she is drawn at
    `385 × cardW/1280` **however tall the card is** — measured at 1512px she rendered 225px
    inside a 206px card and lost her feet ("the waving eyecon is cut off"). `object-position`
    cannot fix that; it only chooses which end is amputated. A float's `padding-top` is a
    percentage of the containing block's WIDTH, so one declaration holds at every card width
    across all three tiers where the loop renders, and `overflow:hidden` already makes the
    card the BFC that contains it. It is switched **off** in both phone tiers, where
    `.hm-eyeconloop` is `display:none` and the height would come straight out of the fold
    budget. With the lock in place `object-position` is `50% 66%` — the mascot's own centre,
    correct at every width — and the per-tier overrides are **deleted, not retuned**.
  - **Acceptance added**: `frontend/tests/_home_shot.mjs` (underscore-prefixed, not a gate)
    reports the visible source band against the mascot's known bounds, so "she is cut off"
    is a number. Every bound in the acceptance list above still passes unchanged, including
    the 390×844 fold budget — the height lock does not reach the phone.

  ### Amendment 2026-08-06 (second pass) — THE CONSOLE (user directive: "chest, volt, quest
  all in 1 column and have more game-like loud addicting colors. levels strip color choice
  not matching well with rest of page. can you make the streak card merge into the top
  card?") — **THIS IS THE LIVE LOCK for the deck's layout and colour.**

  The STRUCK material is *still* unchanged — the lip ladder, the 2.5px ink outline, the
  hard-stop fills, the flat rung and every acceptance bound hold as written. What changes is
  the deck's **shape** and its **ground**.

  - **Criterion changed (i) — the deck is a two-column console with a floor.** `.hm-deck-foot`
    stops being a second full-width row. The right-hand `.hm-rail` is ONE column in the order
    a student works it — **quest board → chest → League strip** (what to do → what it pays →
    where it puts you) — beside the greeting host; `.hm-streak` moves out of `.hm-record` and
    becomes the deck's full-width floor. ⚠ `.hm-deck-foot` survives *only* as the chest+strip
    wrapper, because the PHONE puts those two abreast in one ~60px row instead of two; on
    every other tier it is a single column and passes through. ⚠ `.hm-record` drops to one
    column — a lone child of its old `1fr 1.5fr` grid would have put the vault, the object
    that looks better wider, in the NARROWER track with the wider one empty.
  - **Criterion changed (j) — the plate is DARK, and that is what makes the rail belong.**
    "The rail is the one dark object on the deck" (amendment 1, criterion f) is **superseded**:
    indigo was right about the *object* and wrong about the *room*. On a cream plate the rail
    read as an alien rather than as the head of the machine. The plate is now the console body
    — `#1C1236` under `#2A1B4E` — and the rail is a *raised* violet bar on it (`#3B2A6B` under
    `#4E3A87`, a 1.67:1 step). **Loud is a figure/ground problem before it is a saturation
    problem**: the five cards did not change hue, they changed background.
    | object | fill | why that hue |
    |---|---|---|
    | `.hm-deck` plate | `#1C1236` / `#2A1B4E` | the console body — the thing every live object is mounted in |
    | `.hm-hud` status rail | `#3B2A6B` / `#4E3A87` | the machine, raised off the body; the XP groove `#170F2B` is the recess cut into it, and the certified gold lands on it as light |
    | `.hm-greet` | `#FFE0B7` → `#F7DAE9` | you — and the outer plane is now the Veo clip's **own sampled field** (see (k)) |
    | `.hm-board` | plate `#F1E9FF`, head `#6D28D9` / `#8241E0` | **violet is the quest**; the one object carrying dense text, so it stays the bright light-on-dark-ink panel |
    | `.hm-chest` | gold `#DFA828` (unchanged) | **gold is Lumens** |
    | `.hm-lb` rank strip | `#1B5FC0` / `#2569CE`, white ink | The League — the only route off the deck |
    | `.hm-streak` | `#BE3C08` / `#D14708` | the flame — the deck's floor |
    ⚠ **The strip's "stay light" ceiling is superseded, not broken.** Amendment 1 capped it at
    `#BEDCFF` because *green has to read on it* and mint-on-mid-blue is the muddiest pair on
    the deck. Going the other way removes the ceiling instead of pushing against it: on a deep
    azure the ink is white (5.26:1) and promotion is a **bright** mint `#C9FCE1` (4.63:1) —
    both louder and further from muddy than any dark-inked azure could reach. The division
    still does **not** paint it.
    ⚠ **The stage is unchanged and still light.** `leaderboard.css`'s >0.7 doctrine is about
    the PAGE; `#DED8F5` (0.712) is untouched. The deck is a *component*, like the `#140B26`
    vault. Plate-vs-stage is now 12.8:1 — the "same colour to within one digit" problem
    amendment 1 fixed by hue is now also fixed by value.
  - **Criterion changed (k) — the mascot's window is the ART BAND, not the card.** Criterion
    (h)'s float lock is **demoted to a minimum height**; it is no longer what decides the
    crop. `inset:0` made the visible window the card, so the crop was a function of how tall
    the card happened to be — and the moment the greeting shares a grid row with a taller
    neighbour (which is exactly what the one-column rail made it), the card stretches past
    `0.5625 × width`, `cover` flips to HEIGHT-driven and the frame crops **sideways** instead.
    She is on the right of the frame, so she goes first. Measured: at a 1000px viewport the
    rail is ~382px against a 539px-wide greeting, whose flip threshold is 303px.
    `.hm-eyeconloop` is now `left:0; right:0; bottom:0; aspect-ratio:1280/510`, so the window
    is always 39.84% of the card's WIDTH and `cover` is always width-driven whatever the card
    does; `padding-top` rises to 40% purely to guarantee the card is never shorter than the
    band. `object-position` is `50% 68%`.
    ⚠ **A band has a top edge, and a top edge is a seam.** Two things kill it, and both are
    needed: the card's outer plane is the clip's own field **sampled off the render** at the
    join (`#F7DAE9`, replacing a lavender `#E4D3FF` that ran into a pink clip), and a
    `mask-image` fade over the band's top 6% — well under the 14.2% of air above her head.
  - **Two inherited AA failures fixed in the rules that name the fills.** Both were
    *light-on-dark, where the worst case is the LIGHTER band* — the inverse of every
    dark-on-light object in `home.css`, and both passes before this one measured only the
    darker one. (1) `.hm-qhead`: white on `#8B5CF6` was **4.23:1**; the lighter plane drops to
    `#8241E0` (5.55:1) and the tally to a solid `#EFE6FF` (4.61:1). (2) `.hm-streak`: the
    previous pass certified white at 4.92:1 on `#C9420A` and wrote "every text colour on this
    card is ≥ 4.92:1", but the card's top half was `#F1600C`, where white is **3.27:1**, and
    that is where "Daily streak" (16.5px), "DAY STREAK" (14px) and half the month grid landed.
    Both planes are re-derived: `#D14708` 4.55:1 / `#BE3C08` 5.47:1. Also on that card: the
    DONE chip's numeral `#E4530B`→`#BE3C08` (3.80→5.47) and the next-tier tag from 20%-white
    over the plane (~3.4:1, carrying a **1px white hairline**) to a solid `#8E2A03` (8.46:1).
    ⚠ **The card-level radial is gone** — a 72%×64% ellipse is a wash, which is the exact
    construction `leaderboard.css:15-19` names as the house style, and in a 1272px band it
    stopped being a glow and became a second background. `.hm-big::before` is the heat source.
  - **Criterion added (l) — NOTHING ON THE DECK ROTATES ITS OWN BOX, and the streak had to
    pay for it.** `hm-flame-flicker` carried `rotate()` + `skewX()` and `hm-dot-pop` carried
    `rotate(-12deg)`; both moved onto the deck with the streak card, where the geometry bound
    fails any non-zero b/c matrix term. The lick is now an off-axis translate plus independent
    scaleX/scaleY, and the pop is the scale — pure a/d terms, same timing, same character.
  - **Acceptance**: all 41 colour pairs certified programmatically before a line was changed;
    `_home_shot.mjs` reports `MASCOT whole=true cutTop=0 cutBottom=0` and 0 page overflow at
    1512/1280/390/844; the 390×844 fold budget still holds (chest bottom 713).

  ### Amendment 2026-08-06 (third pass) — THE STREAK IS ITS OWN CARD (user directive:
  "separate the streak card from the rest of the top card")

  One criterion moves; nothing else in the second pass changes.

  - **Criterion changed (i) — the streak is NOT the deck's floor.** "`.hm-streak` becomes the
    deck's full-width floor" is **superseded**. `<StreakTile>` leaves `.hm-deck` and becomes a
    top-level child of `.aurora-home`, rendered **immediately after** the deck — so Home is
    four zones (`.hm-top` · `.hm-deck` · `.hm-streak` · `.hm-record`) and the console holds
    only what is live *right now*. It does **not** return to `.hm-record`: the merge put it
    up here on purpose and the complaint was that it read as part of the console, not that it
    was in the wrong part of the page.
  - **Radius is the whole visual change.** `border-radius` goes back to the page's `--hr`
    (24px) from the deck's inner 18px. **Radius is what says which plate an object belongs
    to** — at 18px the card read as one of the console's inserts even with 14px of plate
    showing all round it. The gap needs no rule: `.aurora-home` is a flex column with a 16px
    gap, so leaving the plate *is* the separation.
  - **What does NOT change, and why.** The band stays HORIZONTAL — its shape is set by its own
    width (~1272px off the plate vs ~1244px on it), not by its parent, and a column would
    still lay 34px calendar cells out in 178px tracks. The fills, the two AA re-derivations
    and the flat calendar rung are untouched. Criterion (l) stays declared as written for
    everything still on the deck; the streak **keeps** its rotation-free flicker even though
    the bound no longer reaches it, because translate + independent scaleX/scaleY read the
    same and re-earning a geometry risk buys nothing.
  - **Acceptance**: `.hm-streak` is not a descendant of `.hm-deck`; computed radius = 24px;
    0 page overflow and `MASCOT whole=true` still hold at 1512/1280/390/844.

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
- **Filter by topic (2026-07-19, user-directed: "add a filter by topic in virtual patients,
  blends and matches seamlessly")** — criterion changed: *the eye plate is no longer the ONLY
  filter (ricoe C4)*. A quiet horizontal **topic chip-row** (`.aurora-topics` /
  `.aurora-topic-chip` in `aurora.css`, wired in `Cases.tsx`) sits under the journey head as a
  second entry point, driven by the existing role-aware topic-set taxonomy (`set_key`/
  `set_label` + `/api/cases/topics`) — no backend change, no new categories. The plate and the
  chip-row are **mutually exclusive — one active lens at a time** (`caseFilter.ts`, unit-tested):
  picking a topic clears the eye-region and vice-versa. Structure otherwise untouched (difficulty
  tiers, plate/pins, card layout); replaced dead CSS from a prior reverted topic-dropdown attempt.
  **Acceptance when refining**: chips reuse the card-chip/reset-pill tokens, single scrolling row
  (never a wall), 390px no-overflow preserved, mutual exclusion holds (aurora harness asserts).
- **Premium finish, "refine in place" (2026-07-22, user-directed: "make the entire virtual
  patients activity page more sleek and seamless and premium … can be improved way more")** —
  criterion changed: *material finish & craft only* (elevation, radius scale, spacing rhythm,
  motion easing, pane-header alignment, hairline/scrollbar/type finish). The colourful
  warm-patient / cool-examiner identity and **every existing animation are KEPT** — this is the
  chosen "Refine in place" option, NOT calming or reducing the vibrance. CSS-only in
  `aurora.css` (`.aurora-station*`): scoped `--st-*` tokens give all three `.aurora-station-card`s
  ONE glass recipe (concentric radii, layered ambient+contact shadow + a lit top highlight, the
  gradient border retained but thinned to 1px / lower-opacity), the aside patient block gains a
  divider so the three pane-heads align on one baseline, one `--st-ease` drives every transition,
  empty consult/EyeBot panes centre their hint, scroll panes get thin scrollbars, counters use
  tabular numerals. **Acceptance when refining**: (1) one shadow+border+radius recipe across the
  three cards; (2) pane-heads aligned (triptych tops not ragged); (3) 4/8 spacing at ≈today's
  density, **390px no-overflow preserved**; (4) all signature animations still run (mesh, ring
  spin, title flow, reveal shimmer, tick pop, current pulse); (5) tabular numerals + thin
  scrollbars; (6) WCAG-legible, no structural/behavioural change, all test hooks intact, station
  + rotate-gate + aurora asserts green. **Out of scope**: checklist gating/order, the two-pane
  structure, the handover form / debrief flow & copy, the warm/cool colour split, adding/removing
  any animation, backend/API.
- **Clarity, recall & transparency (2026-07-29, user-directed + Branda feedback)** — criteria
  changed: *(1) checklist interactivity — tap-to-tick REMOVED, the checklist is a read-only
  instrument; (2) information disclosure — upcoming steps and the case topic are progressively
  revealed rather than shown at load; (3) attentional state — panes carry an explicit
  active/inactive treatment driven by `data-turn`.* Drivers: students were ticking rows
  instead of doing the work and could not tell where to act; Branda reported the sidebar
  revealed the diagnosis and the tick-boxes replaced recall. The organising split is
  MECHANICS made LOUD (turn spotlight + badge, `?` help on both surfaces, 3-beat first-run
  coach-mark, stuck-valve) vs CLINICAL CONTENT made EARNED (masked future steps, topic hidden
  until the debrief). Turn badges name the CHANNEL only, never a step. New pure modules
  `stationMask.ts` / `stationTurn.ts` / `stationHelp.ts` (unit-tested in CI) own the rules.
  **Acceptance when refining**: checklist rows are never interactive; no future step's action
  text appears in the DOM; `data-turn` matches the gate step; turn badges never contain a step
  number or clinical action; the case `topic` never renders in `.aurora-station-hud` or
  `.aurora-station-mt` before the debrief (the patient's own words may mention it — that is
  not a leak); a student can never dead-end when /observe misses a step; 390px no-overflow
  preserved; station + rotate-gate + aurora asserts green. **Out of scope**: gating order, the
  triptych structure, the warm/cool identity, the handover flow, the two-scheme grade.
- **Help density & briefing frequency (2026-07-29, user-directed: the `?` popup "is too long
  winded and no one is gonna read all that"; the walkthrough "must be on every session and
  look way better and intriguing and aesthetic")** — criteria changed: *(1) help density —
  the `?` card is FOUR one-line facts per surface, not a document; (2) walkthrough frequency
  — feature-first-run becomes every-open; (3) walkthrough register — a page dialog becomes a
  cinematic stage.* The old `?` ran seven ~45-word sections (~330 words) and the coach-mark
  fired once ever behind `eyebot_station_coach_seen`. Now `StationCoach` → **`StationBriefing`**
  with **no storage key at all**, four beats (checklist · patient · EyeBot · handover) that
  **auto-advance every `BEAT_MS`** over a near-black stage while the spotlit pane stays lit;
  `?` becomes a five-second glance whose primary action is **"Replay the walkthrough"**.
  Playing every time is paid for with escapes: hover pauses, any click/key hands over control
  permanently, a blurred tab holds, reduced motion drops auto-advance to manual, and
  Skip/Escape/clicking the stage leaves in one action (WCAG 2.2.2). `shouldAutoAdvance()` in
  `stationHelp.ts` owns that rule and is unit-tested. **Acceptance when refining**: no
  "seen"-flag may gate the briefing (station_assert reloads and expects it back); every help
  body ≤110 chars and ≤400 per surface; exactly four sections per surface and four beats; the
  card never overlaps its own spotlight and never leaves the viewport (placement is
  below → above → **beside**, since full-height panes fit neither above nor below); the stage
  dim measures ≥0.75 alpha while the anchored scrim stays transparent — both are
  load-order-fragile (`tour.css` ships after `aurora.css`, so station spotlight overrides
  need doubled selectors); the anti-spoiler rule still holds — no help text or beat names a
  clinical action. **Out of scope**: the grand tour (`tourSteps.ts`), the `/cases` surface's
  own walkthrough (it has none — `?` only), gating order, the two-scheme grade.
- **Beat cadence (2026-07-30, user-directed: the walkthrough is "too short, flash by before i
  can read finish")** — criterion changed: *`BEAT_MS` 2600 → 5200.* Nothing else moves: still
  four beats, still every-open, still the same escapes. 2600ms was set to keep a veteran from
  being held hostage, and it did — but it priced a beat at "read one line" when a beat is a
  title *plus* a line (~19 words) and the eye must also travel to the spotlit pane and back.
  A veteran now leaves via Next → / Escape (one action, already required above) instead of the
  timer being tuned for them. **Acceptance when refining**: `BEAT_MS` stays in 4.5s–7s
  (`station_help_logic.mjs`); the rail's CSS fallback `var(--beat-ms, …)` and
  `station_assert.mjs`'s auto-advance timeout (one beat + slack) both track the constant —
  a stale fallback silently desyncs the rail from the timer it is meant to read out.
- **Dual-source steps (2026-08-04, user-reported: "check allergy … just states examination
  performed, doesn't show if got allergy or not, and checklist says check emr / ask patient,
  but needs to be both")** — criterion changed: *a manual chip is no longer always the WHOLE
  step.* A checklist row that needs a patient-facing half the panel cannot supply
  (`examination_actions.dual_kind` — `"ask"` for the two drop checklists' CRITICAL allergy row,
  `"identity"` for the hygiene-fused row below) has that STEP in the chip's `also_ask_steps`,
  and the chip is only its **panel half**: it marks itself half-done (amber,
  `data-half="record"`, ◐, disabled) without ticking, while the consult supplies the rest via
  `/observe`. Consequently a dual step is the one manual step that does **not** lock the
  patient composer and is **not** hidden from the examiner — locking it made the step
  impossible to finish, and hiding it made a critical step untickable (×0.6 safety cap)
  forever. `lib/dualStep.ts` owns the AND and is unit-tested; both halves may arrive in either
  order. **Amended 2026-08-04 (all-checklist sweep)**: dual-ness is per **STEP**, not per chip,
  and the panel half is whatever finishing that chip means. "Perform hand hygiene **and**
  confirm the patient's identity…" (Amsler #1, Ishihara #1, both critical) ticked on the
  hygiene click alone, and hand hygiene RECURS at step 13 from the same merged chip — a
  per-chip flag would strand that ordinary step waiting for an identity confirmation nobody
  will ever say. Its panel half is also an **assessed technique**, so it is recorded when the
  typed technique is confirmed, not on the click (`quick: false`), and the hint names the
  *kind*'s outstanding half. **Acceptance when refining**: the half-done state is explained in
  words, not colour alone (`[data-testid="dual-hint"]` names the OUTSTANDING half for that
  kind, ≤110 chars, no step number, no clinical content — the anti-spoiler rule still holds);
  the panel half alone never ticks a dual step and the consult half alone never does either;
  an ordinary step sharing a merged dual chip still ticks on its own; the composer stays live
  while a dual step is the gate; the amber survives the pane's blue chip override (assert the
  **settled** computed colour — `.aurora-pchip` transitions `background`, so a one-shot read
  measures the transition and fails a working rule); every case whose checklist has the
  allergy row carries an authored `history.allergies` (`test_allergy_record_authored.py` fails
  closed). **Out of scope**: which steps are manual vs verbal otherwise, gating order, the
  two-scheme grade, the skip valve's own semantics.
- **A chip reveals only what it performs (2026-08-04, same sweep)** — criterion changed:
  *`reveal_text` is no longer whatever keyword the step text happens to contain.* A finding
  belongs to the chip that produces it (`examination_actions.FINDING_LABELS`), so
  "Check doctor's order for **visual acuity**…" no longer hands over the VA at step 1, and
  "Print out 4 Maps **Cornea** Topography" no longer shows the slit-lamp findings. 110 of 167
  reveals across the 140 stations were such leaks. **Acceptance when refining**: the sweep in
  `test_reveal_source.py` stays green (no chip reveals a family it is not mapped to, in any
  checklist), the performing chips keep their reveals, and a new finding family must be mapped
  deliberately — an unmapped one reveals nowhere. A chart-side reveal that is not an
  examination finding (the allergy record) comes from authored case data, and an unauthored
  field reveals **nothing** rather than implying a clinical negative.
- **The grade is 40/30/30, and the grader marks to a COMPETENT standard (2026-08-04,
  user-directed: "40 30 30 … include checklist as the 40", "make the osce scoring lenient but
  still reasonable and constructive, right now it is very hard to pass even for the trainers
  who tested the app")** — criterion changed: *the two-scheme grade above is SUPERSEDED* (the
  three amendments that list it as out of scope predate this). **Checklist coverage 40** ·
  Consultation & Technique 30 · Clinical Judgement & Safety 30, all still emitted by
  `station_score.py`, which owns the formula — the debrief renders three cards off `*_max` +
  `breakdown`, never its own arithmetic. Coverage is **plain**: a critical step is one step
  here and is punished a second time, and only a second time, by the ×0.6 gate on Judgement. A
  case with **no** resolved checklist awards the full 40 — a data gap must not cap a student at
  60. Two causes were fixed, not one: dropping the checklist to zero (2026-06-26) meant a
  student needed 6/10 from the grader on all four domains to reach the 60 pass line, and
  `rubric_prompts.py` anchored only HIGH (8-10) and LOW (1-4), so the whole 5-7 band was
  undefined and ordinary competent work drifted to the low anchor. Trainers could not pass
  their own stations. Every domain now carries a **COMPETENT PASS (5-7)** anchor written as a
  pass, and the prompt sets a competent-not-perfect standard and resolves a between-bands
  performance **upward**. There is exactly ONE verdict vocabulary — `station_score._verdict`
  on `score_100`. The grader's own `overall_feedback` sentence banded the raw /40 on its own
  Excellent/Good/Satisfactory scale, so it disagreed with both `score_100` and the
  `total_score` shipped beside it; it was never rendered anywhere and was deleted end to end
  on 2026-08-04.
  **Acceptance when refining**: the three buckets always sum to the headline `score_100`
  (`test_station_score_breakdown.py`) and coverage is worth exactly 40 at the /submit boundary
  (`test_checklist_in_score.py`); leniency never dissolves the bottom of the scale — every
  domain keeps a LOW anchor awarding 0-4, a missed red flag stays low, and the scope-of-practice
  and "do not infer" guarantees hold (`test_rubric_calibration.py`). Note that **skipping a step
  now costs marks** (`skipped_steps` are subtracted from `performed` at the endpoint), and a tick
  is partly AI-driven — verbal steps auto-tick via the `/observe` examiner. **Out of scope**: the
  60 pass line, the 85/70/60 verdict bands, `total_score = round(score_100 × 0.4)`, the ×0.6
  safety cap, and the Lumens reward curve.
- **The session record: truthful, and loud about what didn't happen (2026-08-04, user-reported:
  "i only did 15/16 but it stated i completed all checklist steps … when student dont know or
  cannot complete checklist item red and exclamation mark the entire point in the activity page
  and report")** — criteria changed: *(1) the downloaded report's LEDGER outranks its PROSE;
  (2) "Missed or lacking" may never be empty; (3) an unfinished step is an alarm, not a
  footnote; (4) the report is a print-first document, not a styled web page.* The debrief was
  free text nothing checked, so a station with a step outstanding could be congratulated on
  completing every step while the one column the student came for read "— none —".
  **`sessionExport.ts` rebuilt**: masthead + inline-SVG score ring (SVG survives a print with
  background graphics off; a conic-gradient does not), an **at-a-glance ledger** of four tiles
  computed from the record and placed above anything a model wrote, a **bucket-agnostic** grade
  section (`ScoreBucket[]` — the report renders whatever the grade is made of and hardcodes no
  weighting, so a re-weighting is a change at the caller alone; the 40/30/30 amendment above
  landed through it as a third entry in `CaseSession.scoreBuckets()`, with no change to the
  report), pace, coach debrief, phase-grouped
  checklist, transcript appendix. New `stationTimer.paceRead()` reads the clock CROSSED WITH
  coverage — the same elapsed time means "excellent" on a full checklist and "an unfinished
  station" with steps outstanding. New `stationMask.stepMark()` owns the glyph rule for both
  surfaces. Backend `tools/cases/coaching_truth.py` (pure, unit-tested) strips a completion claim
  the ledger contradicts and synthesises a grounded "Missed or lacking" line when the model
  returns none — never a restatement of an unticked row, since the report already prints every
  one of those. **Acceptance when refining**: the performed-of-total count is computed from the
  checklist data and appears above the coach block; no document may read as full coverage while
  `done < total` (`session_export_logic.mjs` + `test_coaching_truth.py` assert both); "Missed or
  lacking" is never `— none —`; every not-done row carries `!` **and** words (`NOT DONE` /
  `unable to complete` / `not performed`) as well as red, so nothing is lost to a mono print or
  to anyone who can't separate the two reds; the report stays self-contained (no external asset
  fetch) and prints A4 with **zero horizontal overflow at the 711px content box**; a case with no
  `estimated_minutes` degrades to the bare elapsed time rather than inventing a verdict.
  **Out of scope**: the grade formula and its weighting, gating order, the two-pane structure,
  the handover flow, the skip valve's own semantics.

- **A step must be reachable in the channel it actually needs (2026-08-06, user-reported:
  "for items that are manual, for example bring patient to doctor for follow-up, they are not
  listed in the manual panel, and when i try to complete the step in convo panel, checklist
  impossible to tick, i want it to be only in manual panel")** — criterion changed: *`kind`
  is no longer "manual if the label is on the allow-list, verbal otherwise"; a step's channel
  must match what performing it physically requires.* `kind` DEFAULTS to verbal, so a
  physical step lands there silently, and the consequence is terminal: `/observe` grades the
  student's words **to the patient**, and no sentence to a patient constitutes walking them
  to the doctor or demonstrating a tonometer's features. The only way past was the skip
  valve, which is subtracted from the score — a guaranteed lost mark for work the student
  really did. `test_action_panel_completeness` only ever asserted a step had *a label*, never
  that its channel was survivable, so all of this passed. Four shapes were stranded:
  **Doctor to examine** (7 cases), **Demonstrate knowledge** (26, assessed against the
  examiner and so `quick: false`), **Select intervention** (9, split out from "Learning
  barriers" — identifying a barrier is conversational, choosing the intervention is not),
  and the big one below. **Acceptance when refining**: `test_physical_steps_are_never_verbal_only`
  and the all-checklist sweep beside it stay green; a new physical shape adds a marker there
  rather than being discovered by a student losing a mark.
- **Identification is DUAL, and it is 117 of 155 cases (2026-08-06, same report: "not limited
  to my listed examples")** — criterion changed: *the dual-source rule above had two shapes;
  it has three, and the third is the app's most common CRITICAL step.* "Identify the correct
  patient … and check the patient's identity **against medical record/EMR** using at least 2
  identifiers: Patient Name, …" names both channels exactly the way the allergy row does —
  you cannot read a chart by talking, and you cannot get a patient's name off a chart by
  reading it — but it ticked from the consult alone, so the EMR half was never once required
  of anybody. Now `dual_kind` returns `"identity"` for it (a RECORD token **and** an
  identity-check token, so "Introduce self … and verify the patient's identity", which names
  no chart, stays plain verbal), the chip is `quick` (one click reads the record; the
  ASSESSED half is the question, graded by `/observe`), and it reveals the chart identifiers
  from authored case data — an unauthored patient reveals **nothing**, the same fail-closed
  rule as the allergy record. The hazard this creates is the mirror image of the bug:
  `_CHART_CONDITIONAL_LABELS` exists because an identify step naming no chart would become a
  manual-**only** chip, which locks the patient composer and makes asking impossible.
  **Acceptance when refining**: `test_no_identify_chip_is_ever_manual_only` and
  `test_identify_patient_stays_visible_to_the_examiner` stay green — a dual step excluded
  from `examiner_excluded_steps` is 117 cases pinned to the ×0.6 safety cap forever, and one
  excluded from `panelOnlySteps` is 117 cases whose patient half cannot be done at all.
- **The spotlight follows the OUTSTANDING half (2026-08-06, user-reported: "the spotlight to
  convo panel and manual panel is not accurate or responsive")** — criterion changed: *`turn`
  is a function of the gate step AND, on a dual step, of which half is still owed.*
  `stationTurn` took `manualSteps`, which deliberately EXCLUDES dual steps, so a dual step
  fell through to `"patient"` — dimming the EyeBot pane that holds the chip the student still
  owes (inaccurate), and never changing when a half landed, because the answer never depended
  on either half (unresponsive). Now: neither half → `data-turn="both"`, which matches none
  of the dimming selectors so both panes stay lit and pulse in their own identity colour;
  record half in → `"patient"`; asked half in → `"eyebot"`. `lockComposer` is **returned by
  `stationTurn`** rather than inferred as `turn === "eyebot"`, because a dual step now
  produces an eyebot turn and locking there would make the half the student owes impossible.
  **Acceptance when refining**: `SKIP_AFTER` keeps a `both` entry (a missing one reads as
  `attempts >= undefined` → the way out is never offered and the student is stranded on the
  one step shape with two ways to go wrong); the badge still names the CHANNEL only; both
  panes carry the badge on a dual turn; station_assert proves the spotlight MOVES in both
  orders and that the composer survives the eyebot turn.
- **The technique grade marks competence, not recall (2026-08-06, user-reported: "some
  procedures that require steps are too strict and hard … not realistic for student to list
  down all 7 steps of hand hygiene, so if student just types something like 7 steps hand
  hygiene they should be able to get the full marks")** — criterion changed: *"strong"
  stops meaning "recited every model point".* Three edits, all in `action_model_answer.py`:
  (1) naming a CURATED standard covers all of it (`_STANDARD_NAMES`) — a fixed protocol is
  learned by name, and only curated standards can be claimed this way, so a case-specific
  rubric answer still has to be described; (2) a `Step N:` prefix is stripped before
  salience, since the scaffolding made every point of a numbered protocol two tokens harder
  to cover; (3) `strong` is `_COMPETENT_RATIO` 0.6 of the points, never fewer than one —
  the same calibration the 40/30/30 amendment applied to the AI grader, which had left the
  longest model answers the hardest stations. `_EXAMINER_SYSTEM` gets the matching clause for
  the conversational side (enumerated sub-items are guidance for the assessor, not a script).
  **Acceptance when refining**: leniency never reaches the bottom of the scale — "I washed my
  hands" is still not a technique, `"7 steps"` is not a skeleton key for an unrelated
  procedure, and the examiner's three EVIDENCE guards (never on mention, never on a "would",
  never because the PATIENT said it) survive verbatim; a `strong` verdict with a point still
  missing NAMES it rather than claiming full coverage.
- **A completed patient stops being in the way, and stops paying (2026-08-06, user-directed:
  "when student finish the virtual patient case, make sure that it is listed at the
  bottom/last with a tick badge and grey off to signify completed, and their second attempt
  does not earn them lumens … if not student can just farm the same case over and over
  again")** — criterion changed: *the journey is difficulty tiers alone; it is now difficulty
  tiers **then** a trailing Completed section.* `CaseInfo.completed` was already computed for
  the tier gate at `GET /api/cases` and thrown away. `journeySections` (pure, unit-tested)
  pulls passed cases OUT of their tier into a ticked section at the very bottom — greyed and
  desaturated, never disabled, because replaying one is good practice. On the wallet side the
  per-case high-water mark alone still paid the DELTA, so scraping a 60 and returning for a
  100 was a second payday on one case; a case the student has **passed** now pays 0
  permanently, with the high-water mark still governing everything before a pass.
  **Acceptance when refining**: "completed" means **passed**, not "attempted", in BOTH places
  and through the same `_row_passed` predicate — a card reading "Completed" while the wallet
  still pays is the farm this closes, and greying a *failed* attempt (or refusing to pay for
  the eventual pass) would punish the student who most needs to go back in; a locked case is
  never completed; no patient is lost by the regrouping (`caseFilter_logic.mjs` asserts the
  set is preserved); the state is carried in WORDS as well as colour.
  **Out of scope**: the reward curve itself, the forfeit penalty, the tier unlock gate.

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

### REFINE 2026-07-28 — roster cull + one rename (user directive)
Refines **only the contents of the roster**; the Studio's presentation, storage model
(`avatar_config.portrait`), fail-closed validation, and first-run welcome gate are **unchanged**.
- **Criterion changed — "~103 tiles across outfit · topper · glasses · mouth · eyeShape · lashes ·
  accessory"** → **83 tiles across outfit · topper · mouth · eyeShape · lashes · accessory**. The
  whole **`glasses` category is retired** (all 15 spectacles), plus `mouth/laugh`, `mouth/ooh`, and
  `lashes/cyber|glam|natural` (lashes keeps butterfly + feathery). The art is **deleted**, not
  merely delisted, so a delisted look can never render.
- **Criterion changed — no two roster labels read alike**: `accessory/sparkles` is renamed
  **`accessory/fairyDust`** ("Fairy dust"). Humanized it sat beside `eyeShape/sparkle` ("Sparkle")
  as two near-identical labels on two different characters. The rename runs through **both**
  catalogs in `parts.py` (the compositor axis and the portrait tile), the prompt phrase in
  `portrait.py`, and both art files (`tiles/` + `overlay/`) — `tests/avatar/test_tiles.py` couples
  the axis ids to the tile filenames, so a half-rename fails the suite.
- **Prop-only categories** are now `lashes`/`mouth` (was `glasses`/`lashes`/`mouth`).
- **Stale saved picks**: a student holding a retired ref keeps `customized: true` and falls back to
  the default mascot (`_resolve_config` logs `avatar_config_corrupt`) — never a broken tile. They
  can re-pick anytime; the Studio is edit-anytime.
- **Acceptance when refining**: the gallery still shows >50 cards; no spectacles, "Laugh", "Ooh",
  "Cyber", "Glam" or "Natural" card anywhere; exactly one "Sparkle" label. Guarded by
  `tests/avatar/test_portrait_tiles.py` (`test_retired_looks_are_gone`,
  `test_sparkles_renamed_so_labels_are_distinguishable`, plus the catalog↔disk parity test).

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

## The League — LOCKED 2026-08-02 (supersedes "vibrant & seamless" 2026-07-13)
User: the board "does not look good at all compared to world class and award winning games…
feels just like a stale and boring placeholder game feature". The audit found the failure is
**structural, not cosmetic**: nothing was at stake below rank 3 (27 of 30 students read a list
they could not act on), there was no time axis, the podium raised #1 by twelve pixels, and the
privacy opt-out was **unreachable** (`useSetLeaderboardPrefs` exported, imported by nothing).
Direction chosen from mockups: a **Duolingo-style weekly league, PROMOTION-ONLY** — never
demote, because the cohort is named and supervisor-visible — with a **"Beam" podium**.

**The stage.** A deep cool ramp (`#10132A → #04050C`) lit warm from above and cool from below
left. Top→bottom: division ladder + SGT countdown + **the stakes line** + **"How the league
works"** · the chase · the Beam · role filter · the league list with the promotion line.
Backend: migration 016 + `tools/gamification/league.py`.

### REFINED 2026-08-03 — all three rules changed, by name

User: the board is **"too dark and flat with no layers"**, the podium is **"too simple… I want
it flamboyant"**, and **"the league tiers are unclear and do not make sense to users"**. Each
complaint traced to a rule the 08-02 pass set deliberately, so each rule is superseded rather
than quietly ignored. The originals are kept below so the trade being made stays visible.

1. ~~ONE LIGHT SOURCE — only `.bm-ray`/`.bm-pool` emit.~~ →
   **FOUR PLANES, TWO TEMPERATURES.** One emitter with surfaces at `#101016` on a `#07070A`
   page is a **4% luminance step** carrying a 1px hairline and no shadow — not a dark theme,
   an *unlit* one, in which nothing sits on anything. Every raised surface now takes the
   elevation pair (`--surf-1/2` gradient + `--rim` top highlight + `--cast` shadow), plus a
   stage floor (`.bm::before`), a vignette (`.lb-climb::after`) and a star field. Warm key
   light above, cool indigo fill below-left: temperature contrast is the cheapest depth cue
   there is and it costs no extra accent.
2. ~~ONE ACCENT — division by luminance, never hue.~~ →
   **HUE IS IDENTITY, BUT ONLY ON THE METALS.** This rule *was* the tier bug: a Silver rung
   painted gold is a contradiction the reader must resolve before the ladder says anything.
   Divisions and podium places now wear their real materials (`Metals.tsx`). Gold everywhere
   **else** still means the mechanic — promotion line, your row, the chase — so the two
   languages never collide. Green climb arrows stay semantic.
3. ~~SCALE IS THE ARGUMENT.~~ → **SCALE, PLUS ORNAMENT.** The ratios are unchanged and still
   asserted numerically (portrait **1.7×** 108/64, plinth **2×** 132/66, 112/56 on phones) —
   but three rectangles and a numeral is a *diagram* of a podium. Plinths gained lit trapezoid
   top faces (`.bm-top`), metal bevels and floor reflections; the champion gained a crowned
   laurel, a masked sunburst, a one-shot shine and drifting embers.

**Second pass, same day** — "make sure white space is reduced, and entire leaderboard page
should be more flamboyant". The flamboyance had stopped at the podium and the page was spending
whitespace in the wrong axis:
- **The dead axis was HORIZONTAL.** A 660px column on a 1280px screen left ~300px of empty
  margin either side *while reading cramped vertically*. The column is now **760px**, and
  **830px** at `(min-width: 860px) and (min-height: 640px)` — height-guarded because 932×430
  phone-landscape also clears 860px wide and 164px plinths do not fit a 430px screen. The
  plinths are `fr` units so they widen for free; their heights are told (**164/82 desktop**,
  still exactly 2×).
- **Vertical rhythm tightened throughout**: root gap 18→12, `.bm` padding 34/32→18/22, plinth
  margin 26→18, list gap 8→7, promotion line 14/12→10/8. `.dv-help` was a full-width 44px bar
  even when shut — it is now a `fit-content` pill that only becomes a panel when `[open]`.
- **Flamboyance is page-wide, not podium-only.** Title and chase number are **struck gold**
  (a three-stop gradient clipped to the glyphs — `background-clip:text` kills `text-shadow`, so
  the glow is a `drop-shadow` filter), the eyebrow wears flanking rules, ranks ride **struck
  discs** (gold-tinted inside the promotion zone, solid gold on your row), the promotion line is
  a **struck banner** rather than an outline, and the current rung + your row **breathe** on
  `::after` layers so neither restates its element's own shadow stack.
- ⚠ **A stale screenshot reads exactly like a no-op change.** Mid-pass a render looked
  completely unaffected while the built CSS provably contained every new rule. `_league_shot.mjs`
  now prints computed values (column width, text-fill, disc width, plinth height) alongside the
  png, so "did it apply" is a fact and not a judgement about an image.

**Also locked by this pass:**
- **The tiers must EXPLAIN THEMSELVES.** Five distinct metals, earned/current/locked all
  legible without colour alone (✓ badge, "You are here", inline `Lock`), a **stakes line**
  naming the cut *and* the destination, and a `<details>` covering weekly scoring, the Monday
  SGT close, no-demotion and all five divisions. `league_assert` checks all four on CONTENT —
  a vague sentence would still render, so an existence check would pass while failing the
  reader.
- **The laurel is tangential, not radial.** Leaves lie ~62° off radial along a visible stem
  arc. The first attempt pointed them outward at even spacing and rendered a **sunflower**.
- **Nothing on the stage may ROTATE its own box.** A rotated square reports a bounding box
  1.41× its width, which escapes a 390px viewport and fails the overflow sweep even under
  `overflow: hidden` — clipping stops the paint, not `getBoundingClientRect()`. The sunburst
  spins on `.bm-burst::before` (pseudo-elements are invisible to `querySelectorAll`) inside
  the clipping `.bm-fx` layer, so the guarantee is real and not merely unmeasured.
- **Podium metals are pitched darker than the ladder's.** A literal silver (`#FFF`/`#C4CFDD`)
  out-reads gold at podium scale, and the champion losing a brightness contest to the
  runner-up is the exact failure the 2× plinth exists to prevent.

### REBUILT 2026-08-03 (third pass) — the STAGE, not the degree

User, after both passes above: **"leaderboard design is still horrendous"**. Direction was put
back to the user rather than guessed a third time, and the answer was **go light, match Aurora**.

**Read the evidence, not the adjective.** Two passes had both answered a dark board by *adding*
— first elevation, then gold. The first report said "too **dark** and flat"; that was read as
*unlit* and answered by keeping the black stage. It meant too dark. The League was the one
student route that looked like a different product.

Rules superseded **by name** (the 08-02 and first-08-03 rules above are now historical):

1. ~~THE BLACK STAGE / FOUR PLANES, TWO TEMPERATURES.~~ → **THE AURORA CANVAS.** The pearl
   Gemini gradient used by `/cases`, white cards, one two-step elevation ladder
   (`--lift-1/--lift-2`). The base ends in a **solid colour** so the theme is measurable:
   `league_assert` reads `.aurora-main`'s `backgroundColor` and requires luminance **> 0.7**.
   A trailing gradient computes to transparent and makes the check vacuous.
2. ~~STRUCK GOLD TITLE AND CHASE NUMBER.~~ → **GOLD IS A FILL, NEVER TEXT.** `#F5C542` on white
   is **2.2:1**. Gold survives as fills (plinth fittings, promotion band, ladder rail); every
   gold *word* uses `--gold-ink: #7A5206` (~6:1). Pinned: the harness samples six informational
   text styles against **the surface each actually renders on**, resolved by walking to the
   nearest opaque ancestor — measuring everything against the page base is wrong in both
   directions (it fails `--ink-3` on a white card at 4.25:1 where it really renders 4.8:1).
   The title carries the **Gemini** gradient, not gold: environment = Gemini · division = its
   metal · promotion = gold · you = Gemini. On the old board the title, chase, plinth, all 27
   scores, crown, chips and promotion line were one colour, so none of them ranked.
3. ~~PODIUM METALS PITCHED DARKER THAN THE LADDER'S.~~ → **THE BLOCK IS A PALE MATERIAL WITH
   METAL FITTINGS.** Filling a 300×164px plinth with `#E8B02F` makes the loudest thing on the
   page a mustard slab — it was the ugliest element on *both* rejected boards, and it is what
   "answer 'too simple' by saturating harder" produces. The face is a light metallic wash
   (`--mw-hi/--mw-lo`); full-strength metal is confined to the top face, the base bar, the
   numeral and the champion's ring/crown/laurel — fittings, landing on a person, not a wall.
4. ~~SCALE, PLUS ORNAMENT.~~ → **SCALE, PLUS STRUCTURE.** Ratios unchanged and still asserted
   (portrait **1.7×**, plinth **2×** — 164/82 desktop, 132/66, 112/56 phone). But the plinths
   sat **6–8px apart**, which is a bar chart. `gap: 0`; `.bm-figure` carries its own padding;
   only the block's **outer** corners round. `league_assert` measures both seams (≤1px).
5. **The header is one card, and it is budgeted.** Eyebrow + title + five crest boxes + meta
   row + stakes + help pill + chase + label was **eight centred islands, ~430px** before a
   single rank. Now a title and one standing card, with the ladder as a **connected track**
   (crests threaded on a rail filled to `--dv-step`) — five bordered boxes read as five
   buttons. The redundant eyebrow and the "Silver division" line are gone: the lit rung is
   labelled and says "You are here". Pinned as a **chrome budget** — `.bm`'s top offset from
   `.lb-climb` must stay **≤330px** at every viewport (was 391–437).

⚠ **Nothing absolutely positioned above a plinth may overlap the figure.** `.bm-top` protrudes
upward by its negative `top` and paints *after* `.bm-figure`, so `.bm-plinth`'s `margin-top`
must exceed that protrusion (**20px**, 24px desktop). At 10px the metal band clipped the
descender off the champion's thousands comma and **9,800 rendered as "9.800"** — which in a
country where `.` is the decimal separator reads as nine-point-eight. Diagnosed only by
clipping to the element at 5× device scale; at page zoom the tail is sub-pixel and *every*
screenshot looks fine, which is why three earlier hypotheses (font, `tabular-nums`, optical
sizing) all survived a casual look and were all wrong.

**Also locked** — each of these is a defect this rebuild fixed, so re-breaking one is a
regression, not a restyle:
- **ZERO baked raster on the stage.** Pure CSS + inline SVG; `bg.webp` + `ped-{gold,silver,
  bronze}.webp` are DELETED. Their overlays were pinned to the art by percentage, so every
  regeneration drifted names and score chips off their plinths. The harness fails on any
  `background-image: url(…)` under `.lb-climb` or on `.aurora-main`.
- **Podium DOM order is 1 → 2 → 3**, painted 2-1-3 by CSS `order`. The old DOM was literally
  2-1-3, so screen readers announced second place first.
- **The promotion line** is drawn only on the **unfiltered** board — `promote_count` describes
  the whole division, so a role-filtered line points at the wrong student.
- **"No snapshot" ≠ "no change".** A student with no prior daily snapshot gets `·`, never `—`.
- **NO visibility panel — removed on request 2026-08-02.** The "Your visibility" card (hide-me
  switch + display-name field, `BoardSettings.tsx`) is gone from the board, and with it the
  only client for `POST /api/leaderboard/prefs`. `useSetLeaderboardPrefs` was deleted rather
  than left exported-and-unimported, because *that* shape is what hid the 214ab7f regression
  for weeks — a dead hook makes a missing feature look present.
  **What this costs, stated plainly:** the board is now everyone-by-default with **no in-app
  opt-out** on a named, supervisor-visible cohort. A student already flagged
  `leaderboard_hidden` in the database stays hidden and now sees a ladder with no row of their
  own and no explanation — `you_would_be_rank` still arrives in the payload and nothing renders
  it. **Backend deliberately untouched**: the endpoint, `leaderboard.would_be_rank`,
  `tests/api/test_leaderboard_prefs.py` and the hidden-student filter all still work, so
  restoring the control is a UI job, not a re-implementation.
  **When refining**: `league_assert.mjs` asserts the panel's ABSENCE. If it is ever meant to
  return, delete that check in the same commit that restores it — and restore the
  after-the-flip guarantees too (own standing stays visible, a failed save says so), which
  lived in the now-deleted `leaderboard_privacy_assert.mjs`.
- **NEVER relax the unconditional `leaderboard_hidden` filter.** `rank_entries` drops hidden
  rows for *everyone including the student themselves*, and that lack of exceptions is what
  makes the opt-out provable.
- **ZERO baked raster survives the 08-03 refit.** Every new ornament is a gradient,
  a `repeating-conic-gradient` or an inline path — the crests, laurel, crown, medals and lock
  are all SVG in `Metals.tsx`. `league_assert` still fails on any `background-image: url(…)`
  under the stage, which includes SVG **data URIs**, so ornament must be real elements.
- **Two type families** (Bricolage display + `--font-body`), tabular numerals on every number.
  Bungee/`--font-arcade` is gone — an arcade face was the loudest reason it read like a
  placeholder.
- **No `background-attachment: fixed`** (mobile-Safari scroll jank); the star field is a
  composited `position: fixed` layer instead.
- Motion frozen under BOTH `prefers-reduced-motion` and `html[data-motion="reduce"]`.
  390px-safe, phone-landscape tier, all touch targets ≥44px.
- **The Monday ceremony** shows **once per closed week, server-side**
  (`student_profiles.league_result_seen_week`), mounted from `AppShell` on an **allowlist**
  (`/homepage`, `/leaderboard`) so it can never interrupt a timed station or deck.

**Deleted**: `BoardSettings.tsx` + `leaderboard_privacy_assert.mjs` + `useSetLeaderboardPrefs`
(the visibility panel, removed on request — see the bullet above), `Podium.tsx`,
`LeaderboardHeader.tsx`, `LeaderboardRow.tsx`, `crests.tsx`,
`leaderboard/tiers.ts` (lifetime XP tiers/rings — division carries prestige now; `splitPodium`
moved into `league.ts`), `leaderboard_logic.mjs`, `leaderboard_mobile_assert.mjs` (every one of
its assertions was registered to the deleted art; `league_assert.mjs` covers the same device
matrix). `public/brand/tiers/*.webp` is paid art orphaned by this change — **flagged, not
deleted**. Gates: `league_logic.mjs`, `league_assert.mjs`, `aurora_assert.mjs`.
Spec `docs/superpowers/specs/2026-08-01-leaderboard-league-design.md`, plans
`2026-08-01-league-backend.md` + `2026-08-02-league-frontend.md`.

### REBUILT 2026-08-03 (fourth pass) — the GENRE, not the palette

User, on the light board above: **"the leaderboard page frontend is still horendous, very
obvious ai slop, and did not seem like a game leaderboard."**

**Measured before touching anything** — the second half of that sentence was literally true:

| viewport | first ranked row began at | ranked rows visible |
|---|---|---|
| 390×844 phone | y ≈ **700** | **1**, half-cut |
| 1280×900 desktop | y ≈ **790** | **1**, half-cut |

Three passes had tuned ornament and then palette on a page whose ranks were below the fold. A
ladder screen where you cannot see the ladder is not a leaderboard; a stack of soft white
rounded cards with 5 % shadows on a four-stop pastel mesh is the house style of every generated
dashboard. **Light stays** (that call was right, and it is measured). Everything else changed.

Rules superseded **by name** — the four numbered rules of the third pass are now historical:

1. ~~THE AURORA CANVAS, AS A CARD STACK.~~ → **ONE BOARD ON A QUIET FIELD.** The canvas drops
   from four radial tints + a fixed drifting bloom to **one tint over a solid**. The list is a
   **single surface**: one radius, one border, one shadow, `overflow: hidden`, rows separated
   by a 1px rule with **no gaps and no per-row card chrome**. Pinned: every seam between
   `.lg-list > li` must be ≤1.5px, and a row's own `border-radius` must be `0px` with
   `box-shadow: none`.
2. ~~THE PLINTH IS A PALE MATERIAL WITH METAL FITTINGS / SCALE PLUS STRUCTURE.~~ → **THE PODIUM
   IS DELETED.** The 1.7× portrait and 2× plinth were held to the pixel across three passes —
   the wrong thing, measured precisely. Three cream plinths and three identical mascots cost
   **~380px** to say what a metal rank plate and a crown say inside a 56px row. **Ranks 1-3 are
   the first three rows**, wearing struck gold/silver/bronze plates, with the crown on rank 1.
   `splitPodium` is gone; the list starts at rank 1. Pinned: first `.lg-rk` reads `"1"`, plates
   are on exactly ranks 1-3, exactly one crown and it is on rank 1.
3. ~~THE HEADER IS ONE CARD, BUDGETED AT 330px.~~ → **THE TIER BAND.** The head is made of the
   division's **own metal** — climbing visibly re-skins the top of the page, which is the
   reward five identical white cards could never pay. Crest, tier name, trophy-road pips, and
   one readout strip carrying the chase and the clock. The stakes paragraph and the "How the
   league works" pill are **off the default view**; the rules live behind a **(?)** in a sheet.
   Budget is now **≤250px to the first ranked row**, plus a floor on rows visible without
   scrolling (**≥7** on a ≥700px-tall viewport, ≥3 on a landscape phone).
4. ~~THE PROMOTION LINE.~~ → **THE PROMOTION ZONE.** A hairline with a caption mid-list is a
   footnote. The cut is a filled gold **region** at the top of the board, headed by its own
   label (`PROMOTION ZONE · TOP 7 ADVANCE TO GOLD`) and ended by a struck 4px bar with **no
   caption** — the mechanic is a place you can be, not a sentence you read.

⚠ **Sample metal as PAINT, never as a data attribute.** The old "five distinct metals" check
read `data-metal` off five list items and would have passed just as happily on five identical
grey dots. It now compares five computed `backgroundColor`s, and earned/current/locked are
required to differ by **size and opacity**, not by hue alone.

⚠ **A gradient-only background makes a contrast probe vacuous.** `.tb-head` and `.lg-zone`
declare a solid `background-color` *under* their sweep (the **darker** stop, the conservative
case for dark ink) or the probe walks past them to the page and measures nothing.

⚠ **The sticky you-bar must clear the bottom bar, and a higher z-index does not do it.** At
390×844 `bottom: 18px + safe-area` put it at 776-826 while the nav occupies 788-844:
`elementFromPoint` at the bar's own centre returned a nav link *while the bar held z-index 40
over the rail's 30* — different stacking contexts. It now sits on `--bar-h`, the shell's single
source of truth (already includes the safe-area inset, absent on desktop). Pinned by **hit
test**, not by z-index. The old harness only counted the bar; it never tapped it.

⚠ **"Off-screen" must mean off-screen to the READER.** The dense board puts rank 12 at y=817 in
an 844px viewport — 49 % visible to an `IntersectionObserver`, 0 % visible to a student because
the nav covers it. The observer carries `rootMargin: 0 0 -96px 0`. The you-bar is now tested in
**both** directions (appears when away, retires after jumping back).

**Kept from the third pass, unchanged and still pinned**: light canvas (base luminance > 0.7,
stack ends in a solid); **gold is a fill, never a glyph** (`--gold-ink #7A5206`, ~6:1) sampled
against the surface each style actually renders on; hue is division identity **only** (band +
top-three plates), gold everywhere else means the mechanic; **zero rasters**; no
`background-attachment: fixed`; motion frozen under both reduce signals; ≥44px touch targets;
the unfiltered-only promotion zone; "no snapshot" ≠ "no change"; no visibility panel; the
Monday ceremony's server-side show-once.

**Deleted**: `Beam.tsx`, `DivisionStrip.tsx`, `ChaseStat.tsx`, `Laurel`/`Medal`/`Lock` from
`Metals.tsx`, `splitPodium` from `league.ts`, and every `.bm-*` / `.dv-*` rule. **Added**:
`TierBand.tsx`, `RulesSheet.tsx`. Gate: `league_assert.mjs` — **115 assertions**, of which the
podium's DOM-order / 1.7× / 2× / seam checks are replaced by the geometry ones above.

### REBUILT 2026-08-04 (fifth pass) — "STRUCK": the OBJECTS, not the layout · **THIS IS THE LIVE LOCK**

User: *"i want the leaderboard page to have a podium, and everything in the page upgraded to a
world class game standard (not like the current ai slop)"*. Direction was put to the user rather
than guessed a fifth time, and the answer was **bright arcade** — Clash Royale / Brawl Stars /
Duolingo — over dark esports, broadcast sports, and trophy-road. **Light stays** (asked and
answered in the third pass, and it is measured).

**Rule 2 of the fourth pass — "THE PODIUM IS DELETED" — is broken deliberately and on request.**
It is not quietly ignored: the deletion was *correct about the geometry* (three cream plinths and
three identical mascots cost ~380px and put ONE half-cut row on a 390×844 phone) and *wrong about
the ceremony*. So the stage returns under a **budget instead of an argument**, and the pass-4
ratio pins (**1.7× portrait, 2× plinth**) are deliberately **NOT** restored — those were held to
the pixel across three rejected passes, which is what precise measurement of the wrong thing
looks like.

**Direction.** The canvas was never the problem. Every OBJECT was flat — 1px hairlines at ~10%
ink, 4–6% blurred shadows, pastel fills, smooth washes — and that combination *is* the house
style of a generated dashboard, which is why four passes of re-colouring and re-arranging could
not shake the word "slop". Every object on the page is now **struck**, from one recipe:

1. **A dark defining outline** in `--mat-ink #2A1F3D` — a warm near-black violet, never grey and
   never `#000`. Grey on a coloured fill reads as a CSS border; this reads as painted plastic.
   This single token does more work than everything else combined.
2. **A hard lip**: an offset `box-shadow` with **zero blur**, plus a second shadow at the same
   offset carrying the outline as **spread** — so the keyline wraps the lip's side crescents
   instead of stopping where the box does. Blur may describe the ground; never an edge.
3. **Hard-stop fills** (`17%` → `17.01%`). A gradient easing across a whole box is a wash.
4. **A lit top edge + dark base**, inset — one key light from above, which is what makes the lip
   read as thickness rather than as a drop shadow.
5. **A drawn floor** (`.pod-floor`). Objects that float are why three plinths read as a chart.

**THE LIP LADDER — exactly four depths**, so "material everywhere" cannot collapse into "the
whole page is buttons". A fifth object gets a lip only if another gives one up:

| tier | lip / outline | objects |
|---|---|---|
| structural | 5px / 2.5px | `.lg-list` `.tb` `.pod-block` |
| medallion | 3px / 2px | `.pod-face` `.lg-face` `.sheet-face` (`.lb-filter` left 2026-08-05) |
| pill | 2px / 1.5px | `.lg-rk` `.lg-score` `.lg-mv[up\|down]` `.tb-help` `.lg-you` `.tb-pip` |
| flat | none | `.lg-row` `.lg-item` `.lg-cut` `.lg-zone` |

**`.lg-row` stays flat — gate-pinned, and correct**: the ladder must never compete with the
objects riding on it. Its material is carried by the **five struck objects inside** each row
(rank token, movement pill, avatar medallion, name, score pill) plus a **machined groove**
(2px dark channel + a lit inset return) between rows. A 9%-alpha hairline instantiated 27 times
across half the viewport was the largest single surface exempting itself from the recipe.

**Acceptance criteria when refining** (all gated in `league_assert.mjs`):
- **≥8 ranks legible without scrolling** on a ≥700px-tall viewport, ≥6 on a landscape phone —
  counted as **podium places + list rows**, because a podium place is a rank you can read.
  Measured **9** at 390×844, **9** at 1440×900, **8** at 1366×768. Chrome above the first rank
  ≤250px. `league_assert` sweeps the shared device matrix **plus a local 1366×768 laptop**, added
  when desktop went back to one column — see "STACKED AGAIN" below.
- **Plinth mass, both bounds** (added by the retune below): the champion's block is **≥0.78× its
  own figure stack** (≥0.6 on a landscape phone), and **no block is taller than it is wide**.
- The podium holds **exactly ranks 1–3**, **DOM order 1-2-3**, **painted 2-1-3**, champion's
  plinth tallest, three **distinct metals sampled as PAINT**, exactly one crown and on 1st.
- The ladder **resumes at rank 4**; stage + ladder together render every rank **exactly once**.
- **Material is measured, not assumed**: computed `border-width ≥2px` and a **zero-blur offset
  shadow** on `.pod-block`, `.lg-list` and `.tb`. This is the check that would have failed all
  four rejected passes.
- The promoted set is **ranks 1..promote_count as the UNION** of stage and ladder, and the stage
  carries the promotion marking it sits inside (a gold lip).
- Both podium **and** promotion zone are **withheld on a role-filtered view** — a filtered top
  three are the best of that ROLE, whose real ranks may be 1, 3 and 6.
- An **underfilled stage is no stage**: below 3 entries everyone goes in the list.

**Also locked by this pass** — each is a defect it fixed, so re-breaking one is a regression:
- ⚠ **The podium's top face is drawn INSIDE the block's own box** (`top: 0`, `clip-path`
  trapezoid). Every protruding version needs `overflow: visible`, which fights the champion's
  sheen needing `overflow: hidden` — so the champion, *and only the champion*, silently loses
  its 3D face. Inside the box both are free, and "nothing is absolutely positioned above a
  plinth" becomes true **by construction** rather than by checking at 5× device scale (which is
  how `.bm-top` clipping a thousands comma into `9.800` was found).
- ⚠ **Gold splits by JOB, and the split is load-bearing.** `--gold-ink #7A5206` is 6.9:1 on
  white but **3.0:1 on the gold fill**. Any glyph landing on gold uses `--ink-on-gold #3A2600`
  (6.7:1). One token for both is exactly what makes 2.2:1 gold lettering plausible.
- ⚠ **A gradient has no `background-color`, so white-on-it is measured against the PAGE.**
  `.lg-you` was white on `var(--gemini)` — 3.56:1 against its own `#4285F4` head, and invisible
  to the probe. It is now a solid `--you-blue #1A56C4` (6.6:1). Same rule made
  `.lg-item[data-promo]` a **solid** `#FFF6E0` instead of a gold wash over white.
- ⚠ **`margin-inline: -1.25px`** on `.pod-block` — half the outline — so adjacent 2.5px outlines
  **overlap into one seam** instead of doubling to 5px. Three plinths 6–8px apart is a bar chart.
- ⚠ **The you-bar must track a student on the STAGE too.** `youRef` is a ref **callback**, not a
  `RefObject`: the tracked element is an `<li>` or an `<article>` depending on rank, and those
  two cannot satisfy one invariant `RefObject<T>`. Tracking only rows silently stops following
  the half of the cohort most likely to scroll the board.
- ⚠ **PHONE-LANDSCAPE is TWO COLUMNS** (band + filter + stage left, ladder right), every query
  carrying a **height** term. At 844×390 stacked, the list starts at y≈321 and shows **zero**
  rows — an outright fail. A wide-and-short viewport has horizontal room a single column throws
  away. *Desktop was two columns too until the same day's second retune put it back to one — see
  "STACKED AGAIN" below. That reversal does NOT reach this tier and never should: here the split
  is the difference between six rungs and none.*
- ⚠ **The role-filter class names are load-bearing**: `league_assert` clicks
  `.lb-filter .lb-chip:has-text(...)` and a rename crashes the run. Restyled in place as a
  segmented switch, never renamed.
- ⚠ **A filter-count assertion can pass before the click lands.** `aurora_assert` filtered on OT
  (4 of 7) — which equals the unfiltered row count once the podium takes three out of the ladder.
  It now filters on **OA (3)** and asserts **podium + rows together**.
- **No sunburst.** A masked `repeating-conic-gradient` ray fan at 13–16% alpha is the pass-2
  ornament returning under a new name, at an alpha too low to read as anything but a smudge.

**Kept from earlier passes, unchanged and still pinned**: light canvas (base luminance > 0.7,
stack ends in a solid); every gradient surface also declares a solid; hue is identity **only** on
the band and the podium, gold elsewhere means the mechanic, green means upward movement; **zero
rasters**; nothing rotates its own box; no `background-attachment: fixed`; motion frozen under
both reduce signals; ≥44px touch targets; the unfiltered-only promotion zone; "no snapshot" ≠ "no
change"; **no visibility panel**; the unconditional `leaderboard_hidden` filter; the Monday
ceremony's server-side show-once; two type families and **no novelty arcade face**.

**Added**: `Podium.tsx`, `PLACE_METALS` + a heavier `Crown` in `Metals.tsx`, `splitPodium` back
in `league.ts`. **Removed**: the list's `data-place` metal plates and its crown (the stage owns
place ornament now). `public/brand/tiers/*.webp` remains paid art orphaned since 2026-08-03 —
still flagged, still not deleted.

#### RETUNED 2026-08-04 — plinth mass and the desktop cap (a refinement *within* this lock)

User, on the shipped board: *"the plinths look too small, make them bigger, too much white space
in the page"*. Direction, material and layout are unchanged; **one acceptance criterion changed
and one was added**, both stated before the code moved:

- **Changed**: "measured 16 at 1440×900" → **15**. The stage grew and bought that rung with it.
  The ≥8/≥6 floors are untouched, and every tier still clears them (9 · 9 · 9 · 15 · 18).
- **Added**: **plinth mass, two-sided**, now gated per viewport in `league_assert`.

**Why the previous numbers were wrong.** The gate checked that the three blocks *step down* —
and they did, at every tier — but three blocks can step down perfectly and all three still be
trays. The bound that was missing is the block against the **figure standing on it** (portrait +
name + score). Every version the user rejected sat at **0.5–0.63×**; a 76px block under a 124px
figure reads as a shadow under a head no matter how it is finished. They now measure
**0.89× at 390×844, 0.81× at 360×800, 0.67× on a landscape phone** (nav-constrained, and the
honest trade there is a shorter stage rather than a lip clipped by the floating nav) and
**1.29× on desktop**, where the champion's block is 219×200 under a 155px figure.

⚠ **The other bound is real and was hit while fixing this one**: a block **taller than it is
wide** stops being a plinth and becomes a tower, and that is exactly the shape you drift into if
you size the stage to fill leftover page instead of to fit its own figure. Desktop stops at
200px under a 219px column for that reason and not because the space ran out.

**The white space was the desktop cap, not the layout.** A 1000px board on a maximised 1920
window is **920px of empty page — wider than the ladder itself**. That finding stands. Its remedy
— widening the two-column board to 1340px with a 560px left column, pinning the stage
`position: sticky`, and anchoring the you-bar right over the ladder — **was undone hours later**
when the layout went back to one column. All three existed to serve a left column. See below.

#### STACKED AGAIN 2026-08-04 — desktop is ONE CENTRED COLUMN (a second refinement, same day)

User: *"i want the layout to be like the old one"*, chosen from a stated fork against the
alternatives. "The old one" is the **pre-4th-pass shape**: podium on top, ladder directly
beneath, one centred column — still the shape of every phone tier, so **desktop now differs from
a phone only in size**. The two-column split bought 15 visible ranks against 9; what it cost was
a board that did not look like a leaderboard, and that was the wrong trade.

**Deleted with the grid, and do not bring them back on their own**: the sticky stage (in one
column it would pin the podium over the ladder it is supposed to sit *above*) and the
right-anchored you-bar (the base rule already centres it correctly over a centred board).

- **Board 760px** — wider than the 640 the smaller tiers use, because a maximised window has room
  to spare; nowhere near 1340, because here the ladder **is** the page rather than one of two
  columns. **A centred column at 760 still leaves ~340px of margin at 1440 and ~580 at 1920, and
  that is the price of the shape, not a defect to engineer away.**
- ⚠ **The stage is capped NARROWER than the board it stands on** (`width: min(520px, 100%)`).
  Stretched across the full column the champion's block is ~294px wide — a 2:1 slab that reads as
  a bar chart's tallest bar, which is the failure the whole STRUCK pass exists to prevent. Cap
  the **stage**, never grow the blocks: block height is the one thing the ladder pays for.
- ⚠ **`width`, not `max-width`.** `.lb-climb` is a **flex column**, so cross size comes from
  `align-items: stretch` — and `max-width` + `margin-inline: auto` (or `align-self: center`,
  identically) **cancels the stretch and drops the stage to shrink-to-fit**. That shipped a 261px
  stage with **103×132 blocks: a champion taller than it is wide**, i.e. the exact tower the mass
  bound above forbids. The mass gate caught it — the first time one of these checks failed on a
  regression introduced *in the same session* rather than a known one.
- ⚠ **TWO HEIGHT STEPS on desktop, not one size.** Stacked, the stage and the ladder share a
  column, so **viewport height is the entire ranks budget** — a pixel of plinth is a pixel of
  rung. ≥620px tall gets the compact stage (champion 203×108, rows 56); ≥860px gets the full one
  (203×118, rows 58). At 64px rows a 1440×900 window landed on **exactly 8** — the floor with
  zero slack — so 6px of row height buys the 9th back without touching a plinth.
- ⚠ **`league_assert` now sweeps a local 1366×768 laptop.** It is the most common laptop and, once
  height became the budget, the board's tightest real case: 1440×900 is 132px taller, which is two
  whole rungs, so it stopped representing anything. The first stacked build measured **7 ranks**
  there — under the floor — while 1440×900 looked fine.

#### A TIER NOW PAYS 2026-08-04 — the division multiplier, and THE ARENA

User: *"what does each tier mean? can it be a multiplier for lumens earned in all activities?"*
plus *"make the background… fun and loud but still matches beautifully"* and *"make every element
bigger to avoid white space, podium can be bigger"*.

**What a tier meant before: nothing but a bracket and a badge.** It decided who you were ranked
against and what colour the band was. The honest answer to the question was that the ladder had
no mechanical consequence at all — so it has one now.

**THE ECONOMY.** `DIVISION_MULTIPLIERS = [1.0, 1.1, 1.25, 1.5, 2.0]` in
`tools/gamification/league.py`, applied at the ONE place any Lumen is credited
(`tools/profile/update_profile.py`) rather than at the four award sites, because four sites is
four chances to drift and the drift is silent — XP still lands, at the wrong rate, and no screen
says so. All four tallies (`xp`, `xp_today`, `xp_week`, `coins_earned`) spend the same scaled
`gain`; three of four scaled would give a student a weekly rank and a level that disagree.

Why multiplying is safe here, and where it would not have been — check all three before touching it:
- A student is ranked only against their **own** division, and everyone in a division shares its
  multiplier, so **the weekly race is untouched**. It rewards the tier you already hold; it
  cannot help you reach the next one.
- **Promotion is by RANK, never by score**, so no multiplier buys a promotion.
- The **staff console does not compare raw XP** between students, so a multiplied Lumen never
  distorts a supervisor's read of who practised more. ⚠ Re-check that the day any analytics work
  starts ranking on `xp`.

- ⚠ **Only EARNINGS scale.** `apply_division_bonus` passes penalties through untouched. A forfeit
  is −30 flat at every tier; running it through the same multiplier would mean the better you do,
  the more one mistake costs you — the exact inverse of a reward. Gated.
- ⚠ **Rounds half-UP, not `round()`.** Python's `round` is banker's rounding (`round(4.5) == 4`,
  `round(5.5) == 6`), so a 5-Lumen chat award and a 3-Lumen one would round by different rules for
  reasons no student could be told.
- ⚠ **The streak bonus is computed INSIDE `update_profile`**, not passed in — it is the one award
  that could silently escape the multiplier, so the scaling is applied to the SUM.
- ⚠ **The client never mirrors the ladder.** `division_multiplier` (scalar) and
  `division_multipliers` (the road) both ship in the leaderboard payload from the same list in the
  same request, so they cannot disagree with each other or with what the server actually pays. A
  hard-coded copy in the rules sheet would drift the first time the economy is retuned — silently,
  because a wrong multiplier still renders.
- **Surfaced twice**: a gold `×N` chip in the tier band (a reward nobody can see is an accounting
  detail) and the full trophy road in the rules sheet, with the viewer's own rung marked and the
  forfeit carve-out stated — it is the first question the multiplier invites.

**THE ARENA.** The canvas was "quiet on purpose" and is now loud on purpose, but the loudness
**means something**: the field wears **your own division's metal** — Silver a cool steel field,
Gold amber, Diamond cyan — so climbing re-skins the whole screen rather than one card. That is
the existing "hue is identity" rule spent on the largest surface in the app, not a fourth colour
system. Four layers: a white **spotlight** behind the stage, a metal **wash** from the top,
**diagonal 135° stripes** at ~7%, and a metal-tinted **light solid base**.
- ⚠ **Still not a dot grid** (the Figma/Notion tell) and **still not a sunburst** (the pass-2 ray
  fan, banned). Stripes are parallel and uniform: a surface, not an explosion behind the champion.
- ⚠ **The stack must END IN AN OPAQUE LIGHT SOLID** or every white-on-canvas glyph measures
  against nothing — the contrast probe walks to the nearest ancestor with alpha > 0.92.

**BIGGER.** Board 800/880 (was 760), stage 620 (was 520), champion block **242×132** (was
203×118), band and row type up throughout. ⚠ **Width is the free axis and height is not** — every
pixel of block height comes straight out of the rungs, so "make everything bigger" is spent on
width first and on block height last. The first attempt at this tier used 140px blocks and cost
the 9th rank; the 8px came back off the block, not off the board.

#### THE LANE AND THE GAUGE 2026-08-04 — where the white space actually was

User: *"make all page elements space out more aesthetically and avoid white spaces at the sides,
background and all cards should be more game like (addicting)"* — the **third** report of side
whitespace on this surface. The two answers before it were both about the COLUMN: widen the cap,
then declare the margins "the price of the shape". Both were wrong, and screenshotting the board
at 1920 before touching anything is what showed why.

**THE COMPLAINT NAMED TWO FIELDS OF WHITE, AND THE BIGGER ONE WAS INSIDE THE BOARD.** At 1440 the
name ended at x≈520 and the score pill began at x≈1046: **62% of every rung was blank**, and at
1920 it was worse. The board looked narrow because its ROWS were empty. Nobody had measured a row
before — three passes of layout argument about the page margins, over a defect one `Range`
measurement finds in a second.

- **THE GAUGE** (`.lg-bar`) — each rung's weekly Lumens against the division leader's, drawn in
  that dead middle. It earns its place three times: it fills the gap, it is the only element on
  the page that gets **better** with more width (so widening the column is now a gain instead of a
  spreadsheet risk), and it turns 27 sorted numbers into a staircase you read at a glance.
  ⚠ **NO NEW HUE.** Graphite by default, **gold inside the promotion zone**, **Gemini blue on your
  own row** — the three meanings the ladder already has. A gold bar on every row would have
  diluted the one colour that means "this is the cut".
  ⚠ It needs an **explicit 6th grid track**. Auto-placed into an implicit `auto` column it
  collapses to 0px, because it has no content — built, invisible, and silently green.
  ⚠ Off below 700px. A 368px phone rung has no dead middle; `rowFill` measures 14-21% there.
- **THE LANE** — the flanks are a *treatment* problem, not a width problem. 520px of 7%-alpha
  stripe reads as unpainted page whether it is 520px or 340px. So the board runs down a lit lane
  and the ground either side is a deeper surface with a hard lit edge facing in: the file's own
  recipe (dark edge, lit return, hard-stop fill) at page scale.
  ⚠ **Two pseudo-elements on `.aurora-main`, not one gradient.** A single background places its
  stops in %, so the lane would stretch and the keylines drift off the board at every size.
  `max(0px, calc(50% - var(--lane)/2))` pins them to a fixed 1400px lane, and self-disables.
  ⚠ **Gated at 1600px, and that gate is NOT redundant.** At a 1440 field the arithmetic yields a
  20px wall, which reads as a rendering artifact at the screen edge. It shipped once and was
  caught in the screenshot. Walls earn their keep at ~100px.
  ⚠ **Nothing horizontal may be painted there.** `.aurora-main` does not scroll — a floor line or
  a horizon would sit still while the ladder slid past it.
- **Board 860 / 920 / 1180** (was 800/880), with a new `≥1500 × ≥620` step. Keyed at 1500, not
  1600, so it meets the 920 tier with no gap: between them a 1590px window on a 920px board fails
  the ribbon floor. **The stage does NOT scale with it** — past ~700px the champion is a 2:1 slab.
- **THE RHYTHM IS GROUPED, NOT FLAT** — one identical gap between band, filter, stage and board
  gave four blocks equal weight, so the head stopped reading as a head. Now 6/14/12 on a phone,
  7/17/15 on desktop, and **the stage buys its own air through its own margins** because a flex
  column has exactly one gap. ⚠ Funded, not free: the gaps grew and the top padding paid it back.
  1366×768 sits **on** the 8-rank floor with zero slack and can pay for nothing.

**THE PILL RUNG WAS 1.5px AND RENDERED AS 1px.** Chrome snaps a used border-width to whole device
pixels, so at DPR 1 every "1.5px" outline on this page WAS the hairline the recipe bans —
`getComputedStyle` reports `1px`. The four smallest, most-repeated objects on the board were the
ones still built the rejected way, which is much of why the ladder kept reading flatter than the
stage however often the stage was retuned. **The rung is 2px; the ladder differentiates by LIP
DEPTH (5/3/2/0), which is an offset and does not snap.**

Six more places the file broke its own recipe, all found by auditing it against its own header:
`.lg-score` wore a **grey** 1.5px border (×27, the flattest object on the board) · `.lg-you` had a
lip and **no outline** · `.lg-mv` used α-0.45 edges (a hairline that happens to be dark) ·
`.lg-face` had the dark base and **no lit top edge** while its twin `.pod-face` had both ·
`.lg-cut` used a **blurred** shadow on the most consequential pixel on the board ("blur may
describe the ground; it may never describe an edge") · `.tb-crest` and `.tb-pip` wore α-0.3 lips.

**THE PRESS IS THE LIP COLLAPSING TO ZERO.** `.tb-help`, `.sheet-close`, `.lr-go` and `.youbar`
already sank when touched; the twenty-seven rows, the three figures and the role chips did
nothing at all. ⚠ Spent on the OBJECTS riding a row, never on `.lg-row` — it is gate-pinned to
`radius: 0 / shadow: none` and has no material to animate. ⚠ The lift is behind
`@media (hover: hover)` or it sticks after a tap and leaves one row permanently raised.

**Four new bounds in `league_assert`, and they pull against each other on purpose:** a rung's dead
middle ≤34% · the board ≥58% of the field (banded 1360–2000px, because above that the honest
answer is furniture, not a 1500px rung) · the rhythm ordered rather than pinned · every struck
object's outline ≥2px, opaque and dark. Plus a **1920×1080 viewport**, without which the ribbon
bound tests nothing: at 1440 an 880px column already covered 61%, so every viewport in the matrix
passed a check aimed at the one it came from. *Precise measurement of the wrong DEVICE.*

#### ARCADE 2026-08-04 — one edge, a field that is not grey, and a podium that PAYS

User: *"the cards and elements are not spaced out nicely (positioning is pivotal), and i want to
have a more variety of pop of colors in this entire page, design currently is decent, and make
sure only podium will be able to promote tiers, and make the lumens multiplier more obvious,
instead of just in the question mark popups. Must be an addictive gamified leaderboard design."*

**"Design currently is decent" is the load-bearing half of that sentence.** The STRUCK recipe,
the lip ladder, the podium geometry, the plinth mass bounds, the ranks budget and the light
canvas all stay. **Four criteria change, and each is named here rather than quietly overwritten.**

**1. ⚠ THE FIELD IS FIXED — this BREAKS "the arena wears your own division's metal" (pass 5).**
On request, and the rule was the direct cause of the complaint: **Silver's metal IS grey**, so
the largest surface in the app desaturated at the tier most of the cohort sits in, and four of
five divisions rendered a pale wash. Identity moved down a layer rather than disappearing — the
metal **wash** still tints the top of the page, and the band, plinths, road and crest are all
still cast in it, so climbing still re-skins the screen. The field is now a warm `#FFFBF4` base,
**five radial blooms** (coral, cyan, violet, green, marigold) and **four-hue candy stripes**.
- ⚠ **Still light** (luminance measured **0.968**, floor 0.7), still ends in an opaque solid,
  still not a dot grid, still not the banned pass-2 sunburst.
- ⚠ **`background-repeat` carries one value per layer — EIGHT now.** Miscounting silently tiles
  a bloom across the page.
- ⚠ **The first build of this was measurably light and visibly PASTEL.** Bloom alphas went
  .22 → .42 and stripes .055 → .10 only after a screenshot, because "the numbers pass" and
  "it reads as vibrant" are different claims and the gate can only make the first one.

**2. ONE EDGE.** Measured before anything moved, which is the only reason this did not become a
sixth argument about margins: at the top tier the page stacked an **1148px band, a ~470px centred
filter, a 700px stage and an 1148px ladder** — four widths on four centres, with ~224px of dead
flank either side of the stage. `.pod-deck` is a new **full-width struck platform**; `.lb-filter`
is a full-width strip with the chips left and the cohort count right. Gated: the four stacked
blocks agree on both edges within 1.5px (**measured ±0/0**).
- ⚠ **THE BLOCKS DO NOT GROW INTO IT.** Past ~700px of stage the champion is a 2:1 slab. The
  deck widens; `--stage-w` is an explicit grid TRACK, because a percentage width inside an
  `auto` track sizes against a track that is sizing against it — that is the 261px shrink-to-fit
  this file already records once.
- ⚠ **The deck's caption row is FUNDED**: the ladder's cut is withheld whenever the podium holds
  the whole promoted set (~28px back against ~24px). **The stage never takes height it has not
  paid for.**
- ⚠ **`rhythm.stacked` had to change with it.** It read `list.left < pod.right - 1`, which a
  full-width deck makes true on the two-column tier too. It is now `list.top >= pod.bottom - 1`
  — "the list starts below the stage", which is what the name always meant.
- ⚠ **The chips needed `min-width: 44px`, not just `min-height`.** They were `flex: 1 1 0` in a
  stretched pill, so width was never the binding dimension; in the strip they shrank to **38px**.
  A 38×44 target passes a height check and fails a human.

**3. COLOUR ON THE OBJECTS.** A vivid canvas behind 27 identical graphite gauges is still a grey
ladder — the flattest object on a page is the one drawn most often. **Role is identity**, the same
licence the band has to wear a metal: OA violet `#5B3BC4`, OT teal `#0E6C80`, PSA pink `#B32B54`,
worn by the filter chips, the `.lg-role` tag and **the gauge fill**. Plus the Forge's ember on
`.lg-streak`. ⚠ **This amends the gauge's "NO NEW HUE"** rule: graphite is now the *fallback*,
you-blue still wins, and gold is **retained** for the underfilled board. Fill only — never an
outline, never a lip — so role can never out-shout the gold that means promotion.

**4. ONLY THE PODIUM PROMOTES.** `promote_count` → `min(n - 1, 3)`. Only divisions of **13+**
change (the old rule already paid 3 for pools of 4–12). At 30 students that is 10% mobility
against Duolingo's 23% — a slower climb, bought deliberately for a much heavier podium, raised
with the user and confirmed.
- ⚠ **The payload never zeroed at the summit.** `close_week` has always refused to promote out of
  Diamond, but the live board sent the pool's raw count — so a Diamond board drew a promotion cut
  and gold podium lips for a promotion that cannot happen, and the client had no way to know
  (`promotionLineIndex` documents "the top division promotes nobody" as a null case reachable
  only via a 0 it was never sent). Found while giving the stage a banner that says the count out
  loud, **which is what turned a quiet wrong marking into a written lie**.
- ⚠ **The cut is drawn once.** Withheld at index 0, where the deck states the same boundary in
  words a few pixels above. It still draws when the podium is withheld — below three entries
  `splitPodium` refuses the stage, so the promoted rank has nowhere to be but a row. **That case
  is now a gated scenario**, without which the zone, the line and the gold rows would keep their
  CSS and lose their gate: paint nothing ever measures again.
- ⚠ **`test_hidden_student_holds_no_promotion_slot` silently lost its teeth**: 16 and 17 both pay
  3 now, so it could no longer tell a counted hidden student from an uncounted one and would have
  passed forever while testing nothing. It keeps a 3-student cohort where the `n-1` guard bites.

**5. THE MULTIPLIER IS THE REWARD, not an accounting detail.** A two-line `×1.1 / LUMENS` module
(medallion rung — the chip it replaced was **44×22 = 968px²** and passed every check on the page;
gated at ≥1700px², measured **80×53.5** on desktop), the five pips become a **labelled road**
(`×1 · ×1.1 · ×1.25 · ×1.5 · ×2`), and the readout carries the **hook** — `Promote → Gold pays
×1.25`. All three read `division_multipliers` off the payload; a constant here would drift the
first time the economy is retuned, silently, because a wrong multiplier still renders.
- ⚠ **`.tb-pip` keeps painting its own metal.** The five-metals gate samples it as PAINT, and a
  fill moved onto the new label child would pass on five grey pips.
- ⚠ **The road is off below the desktop tiers, and its gate is guarded on the LAYOUT.** A 932px
  landscape phone is wider than 700 and runs the two-column tier, whose 356px left column is the
  one head that provably cannot afford five labels.
- ⚠ **The phone head made the NAME pay, which the lock forbids.** The module grew ~10px and the
  pip outline 5, and "Silver League" ellipsed to "Silver L…". The gaps gave back 16px and then
  **`.tb-league` was dropped on phones** — of those two words only one carries information the
  reader does not already have, because this page IS the league.

**Changed measurement, stated rather than buried**: **390×844 now shows 8 ranks, not 9.** Every
tier still clears its floor (9 · 8 · 9 · 10 · 8 · 9 · 12 against ≥8 / ≥6), and recovering the 9th
needs a whole 56px row, not the 8px of padding that was available. 1366×768 remains **on** the
floor with zero slack and can still pay for nothing.

**Also fixed, each a defect this pass found in the harness itself**: `.tb-clock` and `.lg-zone`
were still in the contrast sweep after both stopped rendering there — a probe pointed at nothing
reports nothing wrong. The five objects this pass ADDED joined the sweep at the same time,
because a new coloured word that nothing measures is how a 2.2:1 label ships.
⚠ **Two new regexes shipped broken through a scripted edit**: a template literal turns `\b` into
a **backspace escape**, and a Python rewrite left a raw `0x08` byte in another. Both "passed"
by matching control characters — `cat -A` is what found them.

**Gate**: `league_assert.mjs` — **292 assertions**, plus six new bounds (one edge · the deck is
struck · the banner names count and destination · module area · the road's five labels · the
gauges' role hues) and a new underfilled-stage scenario.
Spec `docs/superpowers/specs/2026-08-04-league-arcade-pass-design.md`, plan
`docs/superpowers/plans/2026-08-04-league-arcade-pass.md`.

#### THE DEAD MIDDLES 2026-08-04 — the same report again, and the cell nobody swept

User, on the ARCADE build: *"you only changed the colors and look, but cards and elements are
still crammed and not displayed clearly and maximising the huge laptop space screen, positioning
is lacking. and eg: top 3 promote to gold is cut off and not displayed clearly"*

**They were looking at a viewport this file had no entry for.** Measured from the screenshot and
reproduced: **~1489×838** — a 1080p laptop at 125–133% Windows scaling, the most common desktop
viewport there is. It is **wide but SHORT**, so it fell below the `min-height: 860px` step *and*
below the old `min-width: 1500px` step, landing on the **smallest board the desktop range can
produce**: 860px on its own 1489px field, **57.8%**, straight through this lock's own 58% ribbon
floor. Both reported defects lived in that one breakpoint cell. Third time: **a bound that cannot
fail on the reported device is not a bound.**

**1. THE FLANKS MAY NOT TOUCH THE STAGE.** `.pod-banner` was a `white-space: nowrap` pill in a
`1fr` track beside a fixed-width stage, and a nowrap pill sizes **itself**: 188.5px of pill in a
**134px** track at 1440 and **154px** at 1366, so ~22–32px of "…to Gold" drew **under the second
plinth** and ~13–23px poked out through the deck's own border. It happened on **every window
under 1500px**. Both flanks are now **two-line modules** (label over value, plus a third line
each — "Nobody drops", "Monday, SGT") which **cannot overflow by construction**, and they moved
to `align-self: center`, which is also what lets them stand next to a 700px stage instead of
hovering beside it.
- ⚠ **The viewport-overflow sweep could never have caught this.** It tests the *viewport's*
  edges, and a pill hidden behind an opaque plinth is inside them. The new bound measures real
  overlap against `.pod` and escape from the deck's padding box, at **0px tolerance**.
- ⚠ **The two sub-lines are DESKTOP lines.** On the phone caption row the flanks share ~350px.

**2. THE ELASTIC TRACK WAS THE WRONG ONE, in three places.** This is the whole "crammed at the
edges with nothing in between" report, and it is one mistake repeated:

| object | elastic track was | measured void | now |
|---|---|---|---|
| `.lg-row` | the name block (`1.4fr`) | 250–400px inside **every** rung | name capped at **232px**, the **gauge** takes `1fr` |
| `.lb-filter` | neither — both ends pinned | **527px** at 860, **843px** at 1180 | chips grow under a per-tier cap; each states its **own count** |
| `.tb-readout` | the chase, left-aligned in it | ~680px at the top tier | a struck **leader groove** ties the chase to the hook |
| `.tb-pips` (≥1400) | the pips, `justify-content: center` | ~280px of band either side | the road **spreads** across its track on a filled **rail** |

- ⚠ **`minmax(a, Npx)`, never `max-content`, on the name track.** Every rung is its own grid, so
  a content-sized name column is a **different width per row** and 27 gauges stop sharing a left
  edge. A fixed cap is identical on every row by construction.
- ⚠ **The gauge's MINIMUM stays 70px.** The landscape phone shares that rule and its ~450px
  column overflows the row by 2px at 90 — clipped, not visible, so nobody finds it later.
- ⚠ **The cap that was protecting against "spreadsheet rows" was protecting the wrong thing.**
  Its reasoning ("a rung wide enough to strand its name at x=200 and its score at x=850") was
  true *only while the name was elastic*. With the gauge elastic, width buys a longer **reading**
  — so the desktop caps rose: **860→980**, **920→1060**, the wide tier re-keyed **1500→1400**
  (1180), and a new **≥1700 tier at 1320**.

**3. TWO FACTS THAT HAD NO HOME, given the space that was empty.** Filter chips carry their own
counts (`All 20 · OA 7 · OT 7 · PSA 6`) — captured from the **unfiltered** payload and remembered,
because `role` narrows `entries` server-side. The strip's other end now says **what the ranking is
of**, which nothing outside the (?) sheet ever said. ⚠ **Two wordings, one per tier**: at 390px
the chips cannot afford counts, so that end keeps the pool size; both spans always render, because
an element that only exists at some widths only gets *checked* at some widths.

**4. `.tb-league` was still ellipsing, at 430×932 and in landscape.** The earlier fix keyed it at
`max-width: 420px` and measured 102px of box against 116px of text one breakpoint up. Now `≤520px`
**or** the landscape-phone tier — that tier is short, not narrow, so its width tells you nothing
about the head's actual space.

**Measured after**: flank↔stage overlap **0.0px on every viewport** (was 22–32px *under a
plinth*) · lens dead middle **843px → 10px (1%)** on desktop, ≤28% on phones · board share
**72 · 82 · 79 · 69 %** at 1366 / 1440 / **1489** / 1920 (was 63 · 64 · **57.8** · 61.5) · ranks
**9 · 8 · 9 · 10 · 8 · 9 · 9 · 12**, every tier still clearing its floor.

**Gate**: `league_assert.mjs` — **347 assertions**, plus a **`short-wide` 1489×838** viewport and
two new bounds (**no flank may touch the stage**, 0px tolerance; the **lens strip's dead middle**
on the rung's own 34% budget). Both were **mutation-verified**: reintroducing the nowrap pill on
the old 920px board fires the flank bound at **30.8–40.8px**, and reverting the chips fires the
lens bound at **48–51%**, against **0.0px / 1%** on the shipped build.

**⚠ The contrast sweep caught one of this pass's own additions the moment it joined.** The chip
counter declared an **alpha** background, and a probe walks up to the first element that DECLARES
a colour — so on the selected chip it read past the 92%-white pill to `--mat-ink` and reported a
genuinely-13:1 label as **1.00:1**. The pixels were fine; the *declaration* was not, and the same
arithmetic in reverse is exactly how an unreadable label ships. **Both surfaces are opaque solids
now** (the composites the alphas produced, frozen), which is this file's existing rule — the same
one `.pod-clock` already carries. `.pod-banner-sub` went **3.8:1 → 6.7:1** for the same reason.
The sweep now covers **20 text styles**, up from 17.

#### THE BUDGET, SPENT 2026-08-05 — the gap was never the gap, and two axes are free

User, on the DEAD MIDDLES build: *"cards and elements still crammed together in laptop version
(space out silver league card, all/oa/ot/psa card, podium card, 4th place card, with each other),
and enlarge the eyecon badges on podium. and make the elements in podium card bigger to prevent
white space."*

**1. THE GAP WAS MEASURED, GROUPED, ASSERTED — AND NEGATIVE.** Every struck object on this board
ends in a zero-blur offset shadow *with a spread*: `.tb` carries `0 6px 0 3px var(--mat-ink)`, so
**9px of outlined lip is painted below a border box that `getBoundingClientRect` reports as ending
at its border**. The column's rhythm was `6 / 15 / 13` of layout, which is **−3 / 10 / 4 of
visible space** — the band's lip and the filter's top edge were *overlapping*, and the harness's
own rhythm check called the column correctly grouped because it was subtracting the wrong two
numbers. Same failure this lock has recorded twice about the wrong *device*; this one is the wrong
**quantity**.
- The gate now computes an **optical** gap — next card's border box minus the previous card's
  painted bottom, counting only **zero-blur** layers (a soft cast shadow is depth, not an edge) —
  and floors the tightest at **3px** on desktop. Shipped: **4/12/9 · 5/13/11 · 7/17/15** by tier.
- ⚠ **A lip is part of the object, not part of the gap.** Anywhere in this app that spaces struck
  cards, the layout gap must be read as `gap − (offset + spread)`.

**2. A THIRD HEIGHT STEP, because the budget is the design.** On this page every vertical pixel is
a rank: `league_assert` fails under **8 ranks visible**, so the stage may only grow into slack that
actually exists. Measured before touching anything — the 8th rank ended at y=737 and the scroller
ends at (viewport height − 8):

| viewport | slack, before | tier it was on |
|---|---|---|
| 1366×768 | **22.7px** | compact |
| 1280×800 | 54.7px | compact |
| **1489×838** — the reported window | **92.7px** | compact |
| 1536×864 | 49.5px | compact |
| 1440×900 | 85.5px | full |

**Both of the viewports a 1080p panel at 125% scaling produces** — the commonest desktop setup
there is, in either width — were on the *small* stage holding 50–93px of unspent budget, because
the full-stage step was keyed at `min-height: 860px`: drawn just under the one tall machine the
matrix happened to contain, not at the height that can pay for it. Re-keyed to **≥830**, plus a
new **≥900** step for windows that can afford more still.

| | ≥620 (768, 800) | ≥830 (838, 864) | ≥900 (900, 1024, 1080) |
|---|---|---|---|
| optical gaps | 4 / 12 / 9 | 5 / 13 / 11 | 7 / 17 / 15 |
| badge rings 1/2/3 | 71 / 69 / 69 | **95 / 85 / 85** | **109 / 97 / 97** |
| plinths | 108 / 92 / 78 | 124 / 100 / 84 | 136 / 112 / 94 |
| flank module | 181×118 | 189×160 | 189–259×184 |
| slack left | 12.7px | 26.2px | 34.6px |

**3. THE STAGE'S HEIGHT IS THE CHAMPION'S COLUMN — so 2nd and 3rd are free and he is not.** +1 of
`--face` on place 1 is −1 from the ladder, and the mass floor (`block ≥ 0.78 × its own figure`)
drags the plinth up behind it. The same pixel on 2nd or 3rd costs **nothing** until their column
reaches his — 234px under a 277px champion at ≥830 — which is where their badge and plinth growth
comes from at zero cost.
- ⚠ That asymmetry is a standing invitation to spend "make the badges bigger" on the two cheap
  ones and end up with **the crowned portrait as the smallest of the three**. New bound: the
  badges must step down `1 > 2 ≥ 3`, ordered rather than pinned.
- ⚠ **1366×768 gives the champion's badge back** and takes the separation instead. It clears the
  floor by ~13px, the gap is charged three times down the column, and between the two things
  asked for the separation was named first and costs a third as much. Stated rather than hidden.

**4. THE FLANKS WERE MADE UN-CLIPPABLE AND THEN LEFT CONTENT-SIZED.** The pass before this one
fixed the overflow and stopped: each module was a **142×74 pill adrift in a ~197px track beside a
283px stage** — 28% of its width and 74% of its height empty deck, which is the white space that
got reported. **Both of its axes are free**: the track is `1fr`, and the deck's row is sized by the
stage, so a flank grows in either direction for nothing. Now `width: 100%` under a 264px cap with
a per-tier `min-height`, `column-gap` 8→16, and type at 21/25/28px. New bound: **≥85% of its own
track and ≥40% of the stage's height**.

**Measured after**: ranks **8 · 8 · 8 · 8 · 8 · 11** across the desktop matrix, every tier still
clearing the floor · optical gaps **−3/10/4 → 5/13/11** at the reported window · champion badge
**71 → 95px** there, 2nd/3rd **67 → 85** · plinths **108/82/66 → 124/100/84** · flanks **82%/27%
→ 100%/58%** of track and stage · board share unchanged at **72 · 79 · 82 · 69 %**.

**Gate**: `league_assert.mjs` — **407 assertions**, plus a **`five-four` 1280×1024** viewport and
three new bounds. 1280×1024 is here for a **code path, not a device**: every wide entry in the
matrix is ≥1400, so `--stage-w: 620px` inside a 1060px board — what *every* 1024–1399px window
≥830 tall renders, with the tightest flank tracks on any desktop tier — was reachable by nobody.
⚠ It is **not** the ranks-budget case: slack rises with height *inside* a step, so a height step's
binding member is its **shortest** window (1489×838 for ≥830, 1440×900 for ≥900), both already in
the matrix. All three bounds **mutation-verified** by reintroducing the defects together: flank
fill fires at **49–82%** against the 85% floor, the badges at **95/105/105**, and the rhythm at
**6/15/13 layout / −3px optical**.

#### THE FOURTH DEAD MIDDLE 2026-08-05 — the fix was right and was keyed one tier too high

A refinement *within* the lock above, and it changes exactly one of its criteria: **which object
owns the head's elastic track**, at **≥1024** instead of only at **≥1400**.

The pass above found the band stranding the same way the rung did and fixed it — but only inside
`@media (min-width: 1400px)`. Below that key `.tb-name` still sat in the `1fr` track, so on a
**1366×768 laptop — the most common desktop viewport there is — 365px of a 914px head was
nothing at all**, between the division name and the first plate of the trophy road. **40% of the
band.** The pips huddled against the multiplier chip at the far right. Fourth time for this one
mistake, and the first three are all recorded above: *the elastic track was a left-aligned text
box, not the object that looks better wider.*

`grid-template-columns: auto minmax(0, max-content) minmax(min-content, 1fr) auto auto` plus the
spread road and its filled rail now start at **≥1024**; the ≥1400 tier inherits them and renders
**pixel-identically to before** (125.8px, 11% — verified, not assumed).

**⚠ THE OLD RULE'S SAFETY ARGUMENT WAS WRONG, and moving it down is what exposed that.** It read
*"`max-content` on the name is safe only here: this tier starts at 1400px"*, and *"this way the
NAME ellipses first, which is the correct thing to lose"*. **Measured, it does not.** A
`max-content` track is maximised **before** an `fr` track expands, so a 36-character name took
515 of 914px and squeezed the road to **183px — under the five plates' own 252px minimum**, which
drew them **straight through the multiplier chip**. Not an overflow (they never reach the band's
edge, so an escape check cannot see it), and not visible either, because every object in the head
is opaque. **The floor belongs on the ROAD, not on the name**: `minmax(min-content, 1fr)` inverts
it, because the name track's base size is 0. Same pathological name now ellipses and the road
holds at **256.9px**. Width was never the safety; the *give-way order* is.
- ⚠ **The margin is real but it is not the guarantee.** `division_name` is a clamped index into
  five server constants (`league.py`), so the worst case that can actually arrive is
  **"Platinum" at 191px against ~560px of track**. That is why this is safe at 1024. The floor is
  why it stays safe if that ever stops being true.
- ⚠ **The landscape-phone tier is NOT a candidate and was not touched.** Its ~356px left column
  cannot afford five labels — the lock above records two failed attempts at widening it, and the
  `min-height: 620px` key keeps it out by construction.

**Measured**: head dead middle **365.6px → 86.9px of a 914px head (40% → 10%)** at 1366×768 and at
1024×700, **401.3px → 95.8px of 990px (41% → 10%)** at 1280×1024; with the longest name the server
can actually send, **36% → 8/9%**. Unchanged above: **11%** at 1440×900 and 1489×838, **13%** at
1920×1080. Phones untouched — 9% at 360, 16% at 390, 12% in landscape — so the budget below passes
them on **geometry, not on an exemption**. The road under pressure holds at exactly its own
minimum (**256 / 275.6px** against 252 / 272) with the name ellipsed, and **0px of collision and
0px of escape on every cell measured**.

**Gate**: `league_assert.mjs` — **424 assertions**, up from 407, and the two new ones run on every
viewport in the matrix:
- **the band's dead middle**, on the rung's own 34% budget — the third object to carry it, which
  is the point: this mistake is not an incident, it is the one this layout keeps making;
- **nothing escapes the band**, at 0.5px. `.tb` sets `overflow: hidden`, so this failure is
  **invisible on screen** — the road is simply cut off at the band's edge — while
  getBoundingClientRect sees it leave. The viewport sweep cannot help: an object escaping the
  band is still inside the window. Same blind spot as the flank drawn under a plinth.

Both **mutation-verified**, and the dead-middle one twice over: it fires at **40% / 41%** both
against a re-injected pre-2026-08-05 head *and* against a real bundle of the old CSS (a stale
server answered one run — the numbers it produced are exactly the baseline's, which is as honest
a mutation as could be asked for). A road wider than its band fires the escape bound at
**501.5px / 433.3px**. On the shipped build: **10% / 0.0px**.
- ⚠ **That stale server is also the warning.** Running `league_assert` by hand against a `serve`
  session skips the script's own `require_alive` guard, and a dying server reports a **false RED**
  the same way a stranger's build reports a false green. Check the server before *and* after a
  hand-run, or run it through `start-harness.sh`.

**⚠ The two viewports this change is visible on are `laptop` 1366×768 and `five-four` 1280×1024**
— the 914px head and the 990px one. Both were already in the matrix (the entry above added the
second one hours earlier, for the stage rather than for the band), which is the only reason this
could be measured before and after rather than argued about. **Everything ≥1400 renders
pixel-identically**, because the rule it used to own now reaches it by inheritance.

#### THREE CARDS 2026-08-05 — the head is one object, and the column is re-cut around it

User, on the shipped board: *"combine top 2 cards silver league and role filter into 1 and make it
seamless, and restructure the positioning of cards and elements in the page accordingly"*. A
refinement *within* the lock, changing **two** of its criteria by name:

- **Changed**: the lip ladder's **medallion** rung loses `.lb-filter`. It is `.pod-face`
  `.lg-face` `.sheet-face` now. A rung **giving an object up** is always safe — the ladder's rule
  bounds additions — and nothing was promoted into the space.
- **Changed**: the rhythm criterion. *"The band and its filter sit closer together than the filter
  sits to the stage"* is retired, because the pair it compares no longer exists. It is replaced by
  **the seam** (below), which asserts the same grouping structurally instead of inferring it from
  a ratio between two gaps — and the old form had already passed on a build where those two cards
  **overlapped**.

**The strip renders inside `.tb`, under `.tb-readout`, as a third full-bleed row.** `TierBand`
takes it as `children`; the state stays in `Leaderboard.tsx`, because `role` is the query key
`useLeaderboard` runs on and threading five values through the band to render markup it does not
own is a worse coupling than a slot.

**⚠ EVERY BOUNDARY THE STRIP USED TO DRAW IS DELETED, not restyled to look joined.** That is what
makes "seamless" structural rather than a set of numbers to keep in sync: no radius (the card's
`overflow: hidden` + 16px clip supplies the corners), no side or bottom border, and **no lip**. A
hard lip is how every object on this page says *"I end here"*; a strip that merely sits flush but
keeps its 3px one paints that mark across the middle of a card, in the one place nothing ends.
What is left is the same `border-top: var(--mat-out)` `.tb-readout` already used, so the head is
**three panels behind one keyline** — metal identity, white instrument, grey control tray. The
tray keeps `--chip-mid #EDF1F8` rather than deepening to `--chip-lo`: every contrast value on it
was certified against that surface, and `#DCE3EE` puts the unselected chip at 4.67:1 against a
4.5:1 gate.

**The column is three objects now, so its spacing was re-cut rather than inherited.** The merge
returned a whole gap plus the strip's own two borders; all of it went into the two gaps that are
left instead of into having more of them. **Optical** (layout minus the lip that paints below it):

| tier | before (band/filter/stage) | after (head/stage) |
|---|---|---|
| ≥1024 ≥620 (1366×768) | 4 / 12 / 9 | **10 / 8** |
| ≥1024 ≥830 (1489×838) | 5 / 13 / 11 | **13 / 11** |
| ≥1024 ≥900 (1440×900) | 7 / 17 / 15 | **17 / 13** |

The tightest **visible** gap on the laptop goes **4px → 8px**, and the two cards that were 4px
apart are one card. Slack over the 8-rank floor is **13.7 / 25.2 / 37.6 / 161.6 / 217.6px** across
the desktop matrix — the laptop *gains* a pixel over what it shipped with, which is why 17px is
what that tier uses where the taller steps use 20 and 22.

- ⚠ **ABOVE > BELOW, and it is bounded now.** `.pod-deck`'s own CSS has claimed since 2026-08-04
  that *"above > below is what makes it read as a stage rather than as the next card down"* — the
  top three and rank 4 are one ranking, so the ceremony belongs to the board beneath it. **Nothing
  checked it, and all three desktop tiers had drifted the other way** (17 above, 18 below). A
  comment is not a constraint.
- ⚠ **`.lb-filter` left the one-edge bound**, and that is not a weakening. Its edges are the
  band's *padding* box now — inset by exactly one border-width, which that bound reads as a
  disagreement. What it is inset from is checked far more tightly by the seam.
- The landscape-phone tier's `grid-column` list drops it too: it is a row inside `.tb`, not a grid
  item of the column.

**⚠ THE FOURTH DEAD MIDDLE WAS INSIDE THE STRIP, AND ITS OWN GATE READ 1%.** A merge makes two
objects agree that never had to before: the lens row sits directly under `.tb-readout`, which is
the *identical* shape — a left object, a right readout, slack between — and which has tied its
two ends together with a 2px groove since 2026-08-04. The lens row left ~400px open. Worse, the
`lensFill` bound said the strip was **1% empty**: `.lb-chips` is `flex: 1 1 auto`, so the GROUP's
right edge sits 10px from the readout while its last **chip**, clamped by `--chip-cap`, is 400px
away. **Fifth instance of measuring the box instead of the ink** on this page (`.lg-nm`,
`.tb-name` and the two flanks are the others).
- `.lb-filter:has(.lb-count) .lb-chips::after` — same material as `.tb-chase::after`, no new hue
  and no new element. It takes exactly the leftover because flexbox freezes a `max-width`-clamped
  item and redistributes to the rest, and `:has()` keeps it from drawing a rule to nowhere when
  there is no readout to reach.
- The bound now measures **from the last chip** and against **what the connector does not span**:
  `empty = gap − ::after width`, on the same 34% budget. Shipped **~1%** of `gap ≈ 400px`;
  mutation-verified by removing the connector, which fires at **36%**.

**Gate**: `league_assert.mjs` — **433 assertions**, up from 424. **THE SEAM** is measured four
ways, because "seamless" is four things that can break independently: the strip is **nested** in
the band (not a sibling styled to look adjacent); it starts **0px** below the row above it; it
reaches **both** inner edges (±0px); and it draws **no radius and no outer zero-blur shadow** of
its own. The non-stacked tier now reports the rhythm separately, because a green line reading
*"the column runs 11/−387.4px"* is how a reader learns to stop reading the green lines.

**Mutation-verified in three builds**, one per failure class: the lens as a **sibling** (fires on
all 9 viewports), the lens with a **6px margin and a 999px radius** (`toRowAbove` 6, `insetL/R`
+12/−12, `radius` 999 — every input observably off its passing 0), and the lens keeping its **3px
lip** (fires the deepest branch on all 5 desktop viewports). The rhythm order fired at **19 above
/ 23 below**. On the shipped build: nested, 0px, ±0/0px, no radius, no lip.

#### BIGGER, AND MEASURED 2026-08-05 — the third "bigger" on one card, and the void was VERTICAL
> *"enlarge the podium card and everything inside the card"* — a refinement **within** the ARCADE
> lock. Nothing is restyled: the same objects, the same material, the same recipe, larger.

**THE CARD IS ALREADY AS WIDE AS THE PAGE.** `.pod-deck` is full-board-width at every tier, so
"enlarge the card" can only mean **height plus interior**, and the interior has exactly three
cost classes. Naming them is the whole of this entry, because the previous two "bigger" reports
were each spent on one class and left the others untouched:

| what | costs | why |
|------|-------|-----|
| the CHAMPION's column (badge, plinth, name, score) | **the ranks budget, 1:1** | the stage's height *is* place 1's column |
| 2nd and 3rd, and both FLANKS | **nothing**, up to the champion | the deck's row is sized by its tallest child |
| the stage's WIDTH | **the flanks** | `--stage-w` is a fixed track; the flanks are what is left of the row |

That third line is why the stage stayed at 520/620/700 and this pass is a height pass. Widening
the stage is free against the ranks budget and *not* free against the card — it is taken straight
out of the two modules, which are also "inside the card".

**THE FLANKS WERE THE VOID, AND IT WAS INVISIBLE TO EVERY BOUND.** 08-05 already made the flank
fill its cell *across* and wrote "the flank fills its cell" into the CSS. Down the other axis it
was **118 of a 232px row — 51%** — so ~57px of empty deck sat above **and** below each module.
Nothing could see it: the module's own box was full, its cell was full across, and the deck had no
overflow. `min-height` 118/160/184 → **172/218/248**, which is the single largest visible change
here and cost the ladder nothing.

**Shipped**, per tier (before → after):

| tier | stage | champion block | badge ring | flank | ranks slack |
|------|-------|----------------|-----------|-------|-------------|
| ≥620 · 1366×768 | 232 → **242** | 203×108 → **203×110** | 71 → **77** | 118 → **172** | 21.7 → **11.7** |
| ≥830 · 1489×838 | 278 → **298** | 273×124 → **273×134** | 95 → **103** | 160 → **218** | 33.2 → **13.2** |
| ≥900 · 1440×900 | 308 → **336** | 273×136 → **273×152** | 109 → **119** | 184 → **248** | 45.6 → **17.6** |
| phone · 390×844 | 261 → **279** | 135×118 → **135×126** | 85 → **93** | caption row | 55.3 → **34.8** |
| phone · 360×800 | 229 → **249** | 125×102 → **125×112** | 71 → **79** | caption row | 62.3 → **39.8** |

Numerals, crowns, names and scores scale with them. **Landscape phone is deliberately unchanged**:
its ladder is a second column, so the ranks gate cannot see the stage's lip running under the
floating nav — the tier's own CSS has said since 08-04 that growth there is unpayable, and it is
the one tier where that is still true. **360×800 goes 9 ranks → 8**: it clears the floor, and it
is the one place the card was bought with a rung.

⚠ **ON A PHONE THE PLINTH IS CAPPED BY WIDTH, NOT BY THE BUDGET.** 390×844 held 55px of slack and
still could not take it: the champion's block is `1.26/3.26` of a 344px stage = **135px**, and a
block taller than it is wide is the tower the mass gate forbids. `--pl-h` stops at 126 with 35px
of budget unspent, and the mass floor then caps the FIGURE at `block/0.78`. The desktop tiers are
budget-bound; the phone is geometry-bound, and the two look identical until you measure.

⚠ **THE HORIZONTAL PADDING CAME DOWN WHILE THE VERTICAL WENT UP.** The binding flank on the ≥900
step is not 1440×900's 189px cell but **1280×1024's 169px** one, where `TOP 3 PROMOTE` at 12px
needs ~119 of the 125px that 22px of side padding would leave. A wrapped three-line module is only
free by luck.

**Gate**: `league_assert.mjs` — **438 assertions**, up from 433. One new bound, `flankFill`, and it
is **two-sided on purpose**:
- **floor** — the shorter flank must reach **65%** of the stage it stands beside. This is the void
  above, stated as a number.
- **ceiling** — and neither flank may exceed the stage. *"It was free"* is exactly the argument
  that ends with the ceremony as the short object on its own deck.

It fires only where the modules share the stage's row, detected from geometry (`flank.top <
stage.bottom`) rather than from a hard-coded breakpoint — on a phone they are a caption row
**below** the stage and the ratio would mean nothing.

**Mutation-verified in two builds, one per branch.** The **floor** fired on the pre-change build
itself — 51%/58%/60% across all five desktop viewports, which is the cleanest possible proof that
the bound describes the reported defect and not the fix. The **ceiling** fired at `min-height:
400px` beside a 242px stage. Every other podium bound already in the file — plinth order, badge
order, mass floor 0.78, the tower ceiling, the 8-rank floor — held unchanged through all of it.

#### THE RARITY LADDER 2026-08-05 — divisions stop being metals, and the ink rule was never gated

User: *"i like the current design of the leaderboard page but not really the color choices
(including the tiers as they are too basic and not vibrant and wild enough) … more wild and
vibrant but still beautiful and game-like addicting"*.

**"I like the current design" is the load-bearing half.** Every geometry criterion this lock
carries — the one edge, the lip ladder, the ranks budget, the optical gap, the three height
steps, the elastic-track rule, the flank bounds, the plinth mass floor — is untouched and still
gated. **This pass changes colour and nothing else.** Two criteria change, both named, plus one
defect found on the way.

**1. ⚠ DIVISIONS ARE A RARITY LADDER, NOT MATERIALS. This retires "hue is identity … cast in the
division's own material"** as a *literal* rule, chosen by the user against a metal-true
alternative. The five divisions now read as game-rarity tiers — vermilion, electric azure, gold,
ultraviolet, prismatic aqua — so **"Silver" is painted blue**, deliberately: the colour marks the
rung, it no longer illustrates the noun. This is the direct answer to the complaint, and it is
the *third* time this file has recorded the same root cause. The ARCADE pass already wrote it
down — *"Silver's metal IS grey, so the largest surface in the app desaturated at the tier most
of the cohort sits in"* — and fixed it only for the **canvas**, leaving the band, the road, the
plinths and the wash still cast in literal metal. Four of five divisions still rendered a pale
wash on the object that names them.
- **Vividness was never the constraint, which is the finding that made this cheap.** Measured
  before choosing anything: every *new* saturated base clears the 4.5 floor with room to spare
  and the ladder as a whole gains margin (bronze **5.6 → 5.5:1**, silver **7.2 → 7.2:1**, gold
  **7.7 → 9.5:1**, platinum **5.8 → 5.5:1**, diamond **8.0 → 10.0:1**). The old palette was
  desaturated **by choice, not by
  contrast budget**. Only ultraviolet had to be lightened from the requested `#A855F7` (4.2:1,
  under AA) to `#B478FA` — the hue is what reads as ultraviolet, not the darkness.
- **Each band carries a SECOND hue** in a thin `--f-flash` rim at the top of the head's hard-stop
  stack (bronze→gold, silver→lilac, gold→cream, platinum→hot pink, diamond→magenta). One extra
  stop in one existing gradient; it is what makes the head read as two-tone enamel rather than as
  one tint, and it is the whole of "wild" that the base colours cannot buy on their own.
- ⚠ **The stack still ends in an opaque light solid, the canvas still measures >0.7, and the band
  still measures under the 0.86 "that is white, not metal" ceiling.** Those are the three things
  that made two dark boards fail, and none of them moved.

**2. THE LADDER'S REPEATED OBJECTS GET COLOUR; THE BOARD DOES NOT.** Chosen by the user over a
louder variant that tinted the board surface itself. The rank token wears a light tint of the
division, the avatar medallion's lip wears the row's role hue, the movement pill goes vivid mint,
and the neutral family shifts from **cool blue-grey to warm violet-grey** so it belongs to
`--mat-ink` instead of to a dashboard. **The board interior stays `#FFFFFF`** — 27 names and 27
scores are what the page is actually for, and the five struck objects per row lose their pop the
moment the surface behind them stops being neutral. This is the same reasoning the ARCADE pass
used for the gauges, spent on the four objects it did not reach.

**3. ⚠ THE DEFECT: `.tb-league` HAS BEEN UNDER AA ON THE BRONZE BAND THE WHOLE TIME, and the
gate cannot see it.** `league_assert` fixes the board at **division 2**, so the contrast sweep has
only ever probed the **Silver** band — the other four metals are never measured. On Bronze
(`--f-lo: #CE8746`) the shipped `#2E3440` lands at **4.27:1**, under the 4.5 floor the same file
enforces everywhere else, *under a comment that was added specifically to fix this label's
contrast*. It went one step and stopped. Fixed by taking `.tb-league` to `var(--ink)` — hierarchy
there is carried by size and weight (800/25px against 600/16px), never by that 1.5% of luminance —
and by holding **every** new `--f-lo` at ≥5.3:1 against it, not just the one the harness looks at.
- ⚠ **A gate pinned to one fixture only tests that fixture.** The band, the road, the plinths and
  the wash are all per-division and only one division is ever mounted. The **new per-division
  sweep** mounts all five and re-runs the two claims that are actually per-metal (the head's ink
  is readable; the band is still material rather than white). Cheap — no geometry, no viewport
  matrix — and it is what turns "four of five metals are unmeasured paint" into a gated surface.

**4. ONE GOLD.** The `--gold-*` family was still `#DFA828` while the ladder's Gold division became
`#FFB800`, so a gold **banner** sat on a gold **plinth** in two different golds, a few pixels apart
on the same deck. Unified to the division's own gold. The lock's rule is that the mechanic's gold
and a division's gold never **collide in meaning** — never that they differ in hue. Both inks
re-measured: **8.3:1** on the fill, **6.9:1** for the word on white, and that split stays
load-bearing.

**5. ⚠ THE DECK'S FLANKS WERE STILL BEIGE, and the first fix was too timid to see.** The blooms
went in at `.30` in the very **bottom corners** — which the plinths cover — so a screenshot showed
the same field of beige the comment above it claims to prevent. This card had **~15:1** of ink
headroom and was spending none of it. Base is a real amber now, the pure-white top band is a warm
tint (a `#FFFFFF` stripe under a saturated band is the one hard edge on the card), and the blooms
moved **up** to wash the flanks rather than the floor. **Third time this file records it**: "the
numbers pass" and "it reads as vibrant" are different claims, and only one of them has a gate.

**Measured after**: `league_assert` **466 assertions, 0 failures** · every division's band clears
the 0.86 "that is white" ceiling (**0.303 · 0.409 · 0.555 · 0.300 · 0.590**) and every head +
plinth numeral clears 4.5:1 on its own metal · all **20** probed text styles still clear 4.5:1 ·
five distinct pips, three distinct plinths, zero rasters, canvas luminance unchanged · rank-token
chroma **18 → 51** · `aurora_assert` 52/0 · typecheck clean.

**Mutation-verified**, all four new bounds, by reintroducing every defect at once — **20 failures,
exit 1**: `.tb-league` fires at **exactly 4.27:1 on Bronze** (the arithmetic's prediction, now
measured) · rank-token chroma at **18** against the 32 floor, on every viewport · the medallion
lips at **1 colour**. ⚠ **And it found one more**: the old `#2E3440` measures **4.17:1 on the NEW
platinum band** — so keeping that token while shipping the rarity ladder would have shipped a
*second* sub-AA label, on a division the harness had never probed either.

**Out of scope, deliberately**: every layout, spacing, size and geometry decision in this lock;
the podium's gold **spotlight** staying gold rather than per-division (the deck is the *promotion*
object — identity is carried by the band, plinths, road, crest and wash, and that split is still
right); the role hues' **word** colours (they are contrast-pinned on white — only the bar
highlights brighten); the board interior staying `#FFFFFF`, chosen by the user over a tinted
variant; the ceremony's from→to pills staying generic (the payload carries division names as
strings, and mapping name → metal there would be a second source of truth for the ladder); the
promotion mechanic; the backend.

#### THE LADDER OF LIGHT 2026-08-06 — the names catch up, the field becomes the division

User: *"rename all tiers to match the colors and make them simple and catchy. and change the
background of the page match more beautifully with all page elements, and improve the top card,
it is too bad and ugly now, maybe can have lesser things or smaller size you decide."*

Three criteria change, all named. Geometry, the lip ladder, the ranks budget, the one edge, the
elastic-track rule and the flank bounds are untouched and still gated.

**1. ⚠ THE DIVISIONS ARE NAMED FOR THEIR COLOUR — `Ember · Volt · Solar · Nova · Prism`.** This
completes the pass above, which repainted the ladder and left the *nouns* behind: the loudest
word on the page was the one thing contradicting it, because a band reading **"Silver League"**
in electric azure asks the reader to resolve a contradiction before they can read the rung. Each
name **is** its colour, and the set escalates the way light does — a coal, an arc, a star, a star
going off, and light split into all of it. The currency is **Lumens**, so the ladder a student
climbs is now made of the thing they earn. Costs no migration: the DB has stored `division` as an
integer since 016, and `division_name` is derived (`tools/gamification/league.py::DIVISIONS`, the
single source).
- ⚠ **The internal keys were renamed too, and that is the half that matters to the next author.**
  `data-metal="silver"` painted electric azure for a whole pass — the same contradiction one
  layer down, where only a maintainer meets it. `Metals.tsx` → **`Tiers.tsx`**, `METALS`/`Metal` →
  `TIERS`/`Tier`, `data-metal` → **`data-tier`**, values `ember|volt|solar|nova|prism`. A rename
  that stops at the display string leaves the contradiction alive in every CSS selector.
- `PLACE_TIERS` is still a **separate axis** from the divisions (first place is gold in every
  division) but now draws from the same five: `solar / volt / ember`, which is the ladder's own
  top three read as 1-2-3. The podium and the ladder are one set of colours instead of two.
- The names are also **shorter** (5 characters at the longest, against 8) — which is what pays
  for the larger name in criterion 3.

**2. THE FIELD IS THE DIVISION'S OWN WEATHER, and this retires "the field is FIXED".** That rule
was right about what it was fixing (a grey Silver page) and produced the report this pass answers.
The canvas carried **six** hues — pink, cyan, violet, green, amber over four-hue diagonal candy
stripes — at the same weight as the objects standing on it. Two failures, and neither is about
loudness: it carried hues that appear **nowhere else on the page** (nothing is green; the
up-arrow's mint is a 10×10 pill), and it argued with the band, the deck and the ladder separately.
- **The rule now: three families, and every one is already an object on the page** — the
  DIVISION's hue (`--arena-wash`), its PARTNER (`--arena-glow`, the counter-note that keeps a
  one-hue field from reading as a tint), and GOLD (the mechanic — the zone, the multiplier, the
  chase number and the deck are all gold, so the footlights are the page's own accent rather than
  a sixth colour). Eight layers become **six**; five blooms become three plus a spotlight.
- **The stripes are ONE hue at `.10` on a third duty cycle**, against four hues at `.13–.16` on a
  half cycle. Same 135°, still parallel and uniform, still not a dot grid and still not the banned
  sunburst — just no longer the loudest object on the page.
- **`--arena-base`, `--arena-deep` and `--arena-stripe` are per-division as a SET.** This reverses
  *"ONE deep surface, not five — ground stopped being identity when the canvas did"*: the criterion
  that changed is the canvas, so a single violet apron under an Ember board is now a hue the page
  carries in exactly one place. **Variety did not leave, it lives on the LADDER** (27 role-tinted
  gauges, medallions and rank plates) — a field is a field.
- The deck's corner blooms were *"in the CANVAS's own hues"* **in the comment only** — fixed pink
  and fixed cyan, written when the canvas was fixed. They read `--arena-glow`/`--arena-wash` now,
  which is what that sentence always meant.

**3. THE TOP CARD GETS A BASE AND A FOCAL POINT.** It measured well and read badly: at 1148px it
was a **9.6:1 letterbox of two pale rows**, above a cream deck and a white ladder, with six
evenly-weighted objects strung along a line. Nothing was wrong with any one of them.
- **The readout row is a dark `--mat-ink` CONSOLE**, not a white strip. It gives the card a base,
  and it turns three rows into *badge / display / controls* — three materials that say what the
  rows are. Not a new material either: `.pod-clock` and `.tb-clock` are already `--mat-ink` HUD
  chips holding white type, so this is that chip grown to the row it always was. Gold on near-black
  is the one place this palette gets to be an arcade readout — the chase number goes from **6.9:1
  to 10.0:1**, which is the rare change that is louder *and* more legible.
- **The leader rule is deleted.** A 2px groove spanning ~700px between the chase and the hook —
  furniture invented to fill a void, and the third-longest hairline on a page whose recipe bans
  hairlines. On a console the space between two readings is what a readout looks like.
- **The name and the crest grow** (26 → 29/34px, 38 → 42/50px); the road's `1fr` absorbs it, and
  the locked rungs go `.58 → .74` so three of the five plates stop reading as washed-out noise.
  ⚠ **The road STAYS, and the "lesser things" option was measured before being declined**: the
  head's dead-middle bound is 34%, and with the road gone a 1148px head holds ~686px of content —
  **39% empty**. The road is not decoration there, it is the only elastic object in the row.
- ⚠ **HEIGHT IS NOT FREE, and 1366×768 is the window that cannot pay.** The first version (46px
  crest, 31px name, 12px padding) put the head at **77px** and cost the **eighth visible rank** on
  the most common laptop — the exact viewport the ranks budget exists for. Keyed at ≥1400 for the
  large step and a modest one below, per this lock's own rule that *a height step's binding member
  is its shortest window*.

**Measured after**: `league_assert` **490 assertions, 0 failures** (was 466) · five divisions paint
five distinct fields, every one a light solid (**0.941 · 0.946 · 0.965 · 0.928 · 0.959**, floor
0.70) · every band still under the 0.86 ceiling (**0.303 · 0.409 · 0.555 · 0.300 · 0.590**) · the
console at **0.018** · `repeat` on layer 5 of 7 · all 20 probed text styles ≥4.5:1 · ranks visible
≥8 on every viewport · `aurora_assert`, `home_hud_assert`, `league_logic` and pytest green ·
typecheck clean.

**Mutation-verified**, all three new bounds at once — **28 failures, exit 1**: a white readout
fires the console ceiling at **1.000** *and* drags `.chase-n`/`.chase-l`/`.tb-hook` to
**1.54 / 1.72 / 1.72:1**, which is the coupling the CSS comment claims (the inks are cut *for* the
dark fill, so reverting the fill silently ships three sub-AA labels) · one extra bloom without a
matching `no-repeat` fires *"`repeat` on layer 5 but the tiling gradient is layer 6 of 8"* · one
shared `--arena-base` fires *"the five divisions paint 1 distinct canvas base"*.
- ⚠ **The first version of the layer check was VACUOUS and had to be rewritten.** Chrome *cycles*
  a short `background-repeat` list up to the layer count before reporting it, so comparing the two
  computed lengths can never fail — and the shorthand's final colour-only layer counts as an image
  layer of `none`, so "six gradients" computes as seven. What a cycled list actually does is slide
  `repeat` onto the **wrong layer**, so that is what the gate reads now.

**Out of scope, deliberately**: every layout, spacing and geometry decision in this lock; the road
(see criterion 3 — its removal is a layout regression, not a simplification); the multiplier
module, which is loud on a standing request; the deck's gold base (it is the *promotion* object);
the board interior staying `#FFFFFF`; the ceremony's from→to pills; the promotion mechanic and the
economy. `tools/leaderboard/` was **deleted** on 2026-08-06: `crest_art.py`, `generate_crests.py`
and `generate_board_art.py` were dead raster generators for art the board no longer paints (every
crest is an inline path, and `league_assert.mjs` fails on any board `url()`), and their prompts
still described the divisions as literal metals — the wrong model of the ladder. The orphaned
`public/brand/tiers/*.webp` remain flagged, not deleted.

#### THE ROAD LEAVES THE BAND 2026-08-06 — Volt turns blue, and locked stops being an opacity

User: *"volt color does not look good, and the texts in the tier color card do not have good
contrast and are somewhat camouflaged and not readable."*

Two criteria change. Everything the lock above pins — the console, the field, the names, the
geometry, the ranks budget, the lip ladder — is untouched and still gated.

**1. VOLT IS ELECTRIC BLUE `#4593FF`, NOT CYAN `#22B8F0`.** The cyan was chosen while the rung was
still called **Silver**, as a literal "azure", and it survived the rename by inertia. Measured, the
problem is a spacing one: it sat at **196°** against Prism's **174°** — the ladder's two coolest
rungs **22° apart on the wheel**, the pale one in the middle of the climb and the vivid one at the
summit, which is the same collapse the silver/platinum pair produced and the rarity ladder exists
to prevent. `#4593FF` is **215°**: 40° clear of Prism, 53° clear of Nova, still HSL S=100%, and the
only hue a name meaning *voltage* can wear without borrowing Solar's gold. Contrast is unchanged as
a claim — **5.33:1** for `--ink` against the old 8.8:1, both far over the floor.
- ⚠ **Eight sites author this one colour**, and the gate only reads three of them: the band tokens,
  the road pip, `.pod-slot[data-place="2"]` (second place *copies* the volt palette rather than
  reading it — the one object that can silently fall out of step), the arena field's five tokens,
  the rank-token tints, `Tiers.tsx::STOPS` (the crest, authored in TSX) and the promotion confetti.
- The field's **partner** (`--arena-glow`) moves to the band's own `--f-flash` violet
  `rgba(150,110,255,.32)`. The old partner was violet too, but chosen against a cyan lead; against
  a blue one it is now literally the second hue the band already wears.

**2. ⚠ LOCKED IS A COLOUR, NOT AN OPACITY — and the road runs in a TROUGH.** This is the whole of
"camouflaged and not readable", and it was two defects that look like one:
- **A faded rung composites its ink into the band.** Locked rungs were `opacity: .74` (`.3` on the
  phone), so plate *and* label mixed with whatever was behind them: a gold rung rendered **khaki**
  over Volt, a Prism rung **sage** over Solar, with ink to match. Every locked rung was a colour
  that appears nowhere in the palette, on a surface no probe could resolve. They are opaque
  `--pm-dim` solids now — the same hue, unlit (**0.10–0.14** luminance against an earned rung's
  **0.28–0.59**) — with white labels, all of it measurable.
- **The current rung was painted the band's own colour, on the band.** "Hue is identity" applies to
  both, so the one plate a student has to find was `Volt on Volt`, `Solar on Solar` — **1.00:1 on
  all five boards**, held together by a white ring and nothing else. The rail under the plates is
  now an opaque **`--mat-ink` trough**: one surface, the same at every division. Not a new material
  — it is the rail that was already there, grown to the plates' height, in the ink the console one
  row below already wears. The head reads **faceplate / track / console**.
- ⚠ **The trough costs the head NO height** (34px against the crest's 48 and the module's 48) —
  measured first, because the pass above lost the eighth visible rank at 1366×768 to a 46px crest.
- `.tb-pips::before` is **deleted**: on an opaque track the translucent unfilled rail is invisible.
  Unlit track ahead, gold behind — one object doing the work of two.
- `.tb-px` inks go `--ink-on-gold` → `--ink` on lit plates. Only one of the five plates is gold;
  `#3A2600` on the Volt plate is 4.54:1 where `#1F1F1F` is 5.14:1, and the tightest pair on the
  road should not be set by the gold exception.
- **The phone road keeps its dots on the band, deliberately.** It carries no labels — the reported
  defect is not there — the current dot already has a 3px white ring, and horizontal space in that
  head is the tightest budget on the page.

**The gate's criterion changed with the design, and that is the point.** *"Locked is ≥0.15 dimmer
by opacity"* was **satisfied by the defect**: 0.74 is a number, and the colour on screen was not
one anybody measured. It now reads painted luminance, forbids a sub-1 opacity on any rung, probes
**all five rung labels on all five divisions** (collected from the DOM, so Ember with no earned
rung and Prism with no locked one both probe five), and adds a 3:1 **object** floor for the current
rung against whatever it stands on.

**Measured after**: `league_assert` **0 failures** · the current rung reads **5.16 / 5.00 / 8.80 /
5.05 / 9.34:1** against the trough, per division · every rung label ≥4.5:1 on its own plate ·
bands still under the 0.86 ceiling (`Volt` 0.409 → **0.294**) · fields still light solids and still
five distinct · ranks visible ≥8 on every viewport · all 22 gated harnesses green · pytest and
typecheck clean.

**Mutation-verified**, all three bounds at once — **16 failures, exit 1**: restoring `opacity: .74`
fires *"3 rung(s) render at opacity <1"* on every plate viewport · lighting one `--pm-dim` fires
the luminance floor at **0.727 against 0.294** *and* is caught a second time by the new label probe
at **1.35:1** · removing the trough fires **`1.00:1` on all five divisions**, which is the defect
itself, quantified.

**Out of scope, deliberately**: everything the lock above pins; the gold multiplier module (it is
the mechanic's colour and it carries its own outline and lip); `.tb-name`/`.tb-league`, which
measure 6.9–8.8:1 on every band and were never the unreadable text; the other four divisions'
hues, which are correctly spaced; the phone road (see above).
> Historical. Its "out of scope: promotion/relegation leagues … rank-movement arrows" is
> exactly what The League ships; `.lb-sub`, `.lb-ped`, `.lb-row` and `tiers.ts` no longer exist.
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

## Staff Console (`/admin`) — LOCKED 2026-08-03 (supersedes the dark Analytics surface below)
**Direction** (approved by the user, 2026-08-02): `/admin` is a **full-bleed light
staff console** — "Aurora Command, light" — that **leaves the student shell entirely**.
It is the surface SNEC leadership is shown, so it optimises for demo impact first and
daily trainer use a very close second. The user's governing constraint: *"I don't want
the admin feature to have too many things and confusing, only what the trainer and admin
truly needs."* The backend is unchanged; this is a recomposition of the same endpoints.

- **Shell** (`aurora/console/ConsoleShell.tsx`, route group `src/app/(console)/`): its
  own `<main id="main">`, **no Atlas Rail**. Top bar = the single `<h1>` ("EyeBot
  Console · <section>"), the discipline segment, a live pill, "← Student app", and its
  **own sign-out** — the rail carried the only one in the app, and a trainer on a shared
  clinic terminal must be able to end a session that shows the whole cohort.
- **Theme**: a scoped **`.cs`** light re-theme (`aurora/console/console.css`), the
  `.aurora-chat` pattern inverted. **Hue encodes DOMAIN, never decoration**:
  blue = population · coral = risk · teal = pass/safe · purple = topics · amber = warning.
  A hue is never chosen for variety; two panels measuring the same kind of thing take the
  same colour. Exactly **one** full-gradient fill per screen (the hero); panels and stat
  cards carry a filled header band over a white body.
- **IA**: Teaching (Overview · Students) / Governance (Accounts · Audit, `role === "admin"`
  only — presentation, with `require_admin` re-enforced server-side).
- **Overview** = one hero + up to five stat cards + **two** panels. It replaced ten
  equal-weight panels, three of which rendered the same topic-mastery fact three ways.
  Cut deliberately: the activity-trend chart, the mastery heatmap, the duplicate
  topic-benchmarks panel, the safety donut, and the standalone most-missed panel (now a
  drill-down that costs **no extra request**).
- **Charts stay hand-written dependency-free SVG.** No chart library, ever.
- **Phone**: gated on `(pointer: coarse)`, **never width** — a 15 Pro Max is 932px in
  landscape. Bottom tab bar; tables re-lay-out as **stacked cards**, each cell printing
  its own label, rather than scrolling six slivers sideways.
- **Acceptance criteria when refining** (name the criterion you change): `/admin` renders
  **exactly one** `<main>`, one `<h1>`, ≥1 `<nav>` and **zero** Atlas Rail nodes; every
  figure either follows the discipline segment or wears the `All disciplines` marker
  (only `useCohortAnalytics` and `usePerformanceTrend` accept the parameter — mark, never
  hide); a **failed read renders as a failure**, never as `0`; a null bucket is a **gap**,
  never a floor point; white-on-hero ≥4.5:1 and every `.cs-badge` ≥4.5:1; no horizontal
  overflow and every tap target ≥44px at 390px coarse; the four pure view-models
  (`cohortAnalyticsView` · `riskRowView` · `masteryView` · `performanceTrendView`) stay
  **byte-identical**; adding a panel to Overview requires naming the decision it changes.
- **Scale conventions differ by endpoint and must not be "tidied" into one**:
  `TrendPoint.avg_score`/`pass_rate`/`safety_fail_rate` are **0–100**;
  `TopicGroupRow.osce.pass_rate`/`safety_fail_rate`/`weakness_score` are **0–1**.
- Harness: `frontend/tests/console_assert.mjs` (owns /admin — role guards, landmarks,
  at-risk agreement, the D13 gap, failed-read behaviour, the note-draft poll regression,
  mastery scales, badge contrast, modal-squash geometry). `aurora_assert.mjs` drives the
  **student** app only; do not re-add /admin coverage there.
- Spec: `docs/superpowers/specs/2026-08-02-admin-console-redesign-design.md`.
  Plan: `docs/superpowers/plans/2026-08-02-admin-console-rebuild.md`.

## Trainer/Admin Analytics + homepage pool toggle — LOCKED 2026-07-13 · the `/analytics` DARK SURFACE is SUPERSEDED 2026-08-03 by the Staff Console above
> Still current: the **homepage pool toggle** and the **admin-only provisioning** rules.
> Superseded: everything describing `/analytics`, the `.aurora-analytics` / `.aurora-admin`
> dark scope, and the PowerBI panel inventory. `/analytics` → `/admin` (redirect kept).

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
