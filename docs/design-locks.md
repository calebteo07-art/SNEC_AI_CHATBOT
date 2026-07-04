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

## Flashcards — LOCKED 2026-06-30
- **Selection**: single-screen Gemini-dark topic fan carousel, continuous "river" flow
  (single rAF loop, seamless wrap, static under reduced motion), per-topic Nano Banana
  images, no difficulty picker, fixed decks, no scroll (dvh-sized).
- **Study**: "Console" instant-tap MCQ on a dark lit-glass card (check-in card language,
  animated cool-Gemini hairline), Brownian colour lights on the canvas background,
  engravings at the card perimeter. Reveal = **Charge → Flip → Payoff** (LiquidLoading
  ChargeBeat, 3D flip to full-bleed explanation, combo/XP payoff). Cool cyan→indigo hue
  band only; verdicts bright green `#16a34a` / intense red `#e22030`; Next button
  centered, solid indigo.
- **Out of scope for refinements**: scoring model (deterministic, no AI in study loop),
  two-pool role content model {OA=PSA}+{OT}, 50-cards-per-topic mandate.

## Home / Dashboard — LOCKED 2026-07-01
Warm-premium bento `.aurora-home` (Bricolage Grotesque): GreetingHero with the
ever-changing greeting engine + **Iris** mascot, StreakTile, FeatureCarousel (3D
coverflow, back-card fade), MilestoneLadder, WeekStats (real data only — no invented
stats). Old dark dashboard (StreakBand/GradientHero/GoalRing) is retired; do not revive.

## Tutor Chat — LOCKED 2026-06-22
"Mono + Electric / Live Wire": ivory + charcoal + electric indigo `#5B5BFF`, layout
unchanged from pre-recolor. Live constellation canvas (ChatField), realistic eye avatar
under a charging electric ring + blink, OCT trace, charging streaming-bubble borders.
`.aurora-chat` background must keep a linear-gradient (harness asserts it).

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
