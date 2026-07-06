# Design Locks

Settled UI design decisions. A **locked** feature is refined, not redesigned: state
which acceptance criterion you're changing, or consciously break the lock with a new
brief via `/design-lock`. This ledger exists because the June-2026 session audit found
the same features rebuilt from scratch repeatedly (flashcards: 4+ full redesigns in 18
days) for lack of a written spec to refine against.

## Global language — LOCKED 2026-06-13
Light "AURORA" system: Gemini-gradient accents on light surfaces, Google Sans,
mono Spark Eye logo, auto-collapsing Atlas Rail (72px → 248px on hover, pinnable).
Student app motion is CSS-only (`motion.css` + Reveal/RouteReveal) — no GSAP fx
wrappers (MotionProvider is not mounted).

## Login — LOCKED 2026-06-13
Kept verbatim from the original app (explicit user preference). Do not restyle.

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

## Home / Dashboard — LOCKED 2026-07-01
Warm-premium bento `.aurora-home` (Bricolage Grotesque): GreetingHero with the
ever-changing greeting engine + **Iris** mascot, StreakTile, FeatureCarousel (3D
coverflow, back-card fade), MilestoneLadder, WeekStats (real data only — no invented
stats). Old dark dashboard (StreakBand/GradientHero/GoalRing) is retired; do not revive.

## Tutor Chat — LOCKED 2026-06-22 (greeting landing added 2026-07-04)
"Mono + Electric / Live Wire": ivory + charcoal + electric indigo `#5B5BFF`, layout
unchanged from pre-recolor. Live constellation canvas (ChatField), realistic eye avatar
under a charging electric ring + blink, OCT trace, charging streaming-bubble borders.
`.aurora-chat` background must keep a linear-gradient (harness asserts it). No sliding
scan-sweep (removed, ricoe A1). Reply-bubble avatar = the default Selena mascot, never a
student's customised avatar (ricoe A3).
- **Greeting landing (ricoe A2)**: `/chat` opens on `TutorLanding` (the empty state) —
  time-of-day hello with a Gemini-gradient name, an ever-changing cheeky sub, a big
  centred prompt (reuses `Composer`), and the student's real recent sessions ("Pick up
  where you left off" cards from `progress.sessions`). Asking / resuming cross-fades
  (`phase: landing → leaving → chat`, ~460ms) into the thread; the shared constellation
  canvas bridges the two so it reads as one surface. Gemini accents on the ivory surface.

## Virtual Patients / OSCE Station — LOCKED 2026-06-25
Living Eye selection plate (photoreal cross-section + fundus inset, calibrated pins).
Station: light two-pane CaseSession (checklist ‖ consult, independent scroll), strict
in-order gating (stationGate.ts — only current step unlockable), Moderate-merged
checklist rows, allied-health handover framing (Findings & clinical impression /
Recommendation & escalation — OA/OT/PSA do not diagnose or prescribe).

## Generated imagery standard — STANDING
Medically and anatomically correct AND beautiful; accuracy baked into prompts; SNEC
staff wear SingHealth blue scrubs with orange trim (pure-orange collar, no gap, plain
sleeves); user confirms before any paid generation; approved prompts get recorded in
the feature's brief here.
