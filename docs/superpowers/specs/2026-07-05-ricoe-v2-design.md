# RICOE v2 — world-class rebuild (design spec)

> Supersedes the flat 28-patch [`docs/archive/ricoe-roadmap.md`](../../archive/ricoe-roadmap.md). Same
> underlying intent (Caleb's verbatim [`product-wishlist-2026-07.md`](../../product-wishlist-2026-07.md)), re-architected for
> quality. Captured 2026-07-05 from a brainstorm with Caleb.
>
> Directive: *"reanalyse ricoe deeply and redo the entire thing even phase planning for
> maximum results quality; prioritise that the backend works fully and the frontend is
> world class."*

---

## 1. Problem statement

RICOE v1 shipped ~two-thirds of the intended changes to `main`, but as **isolated UI
patches**: each surface hardcoded its own colours, motion and mascot art, so nothing shared
a substrate. The result reads as inconsistent, and some surfaces are below a world-class
bar (Caleb's assessment — flashcards colour scheme explicitly rejected). We are rebuilding
to a professional standard **without a mass revert** (prod stays green throughout — see §11).

## 2. Goals & non-goals

**Goals**
- One cohesive, world-class design language across Tutor, Flashcards, OSCE, Home, Leaderboard.
- A first-class, free, per-student **Selena** avatar system (Bitmoji-style customization).
- Backend that *works fully*: typed, tested, non-blocking, fails closed, identity from JWT.
- A new Leaderboard (XP-ranked, role filter, Selena headshots).
- Prod never regresses; every phase verified before it ships.

**Non-goals (this program)**
- Role uniforms on avatars — **excluded until Caleb explicitly asks** (wardrobe is casual/fun for now).
- Any wholesale rewrite of backend that tests already prove correct (OSCE grading is *audited*, not rebuilt).
- Ghibli topic cards / topic-card picture list (ricoe B1/B2 — skip, per ricoe).

## 3. Locked decisions (from the 2026-07-05 brainstorm)

| # | Decision | Value |
|---|----------|-------|
| D1 | Reset strategy | **Rebuild in place** to a new bar. No mass revert; supersede surface-by-surface; harden (not discard) tested backend. |
| D2 | Flashcards palette | **Direction A "Ivory & ink"** — warm greige/paper canvas, crisp bright-white study card, **animated (moving) Gemini-gradient accent** (not flat indigo), **stronger card↔canvas contrast**, reveal flips card to deep ink. |
| D3 | Avatar architecture | **Layered-vector** (composited SVG parts from a saved config) — free, instant, animatable, scalable. Not per-user AI raster. |
| D4 | Avatar art style | **Soft-kawaii (Style C)** base; every custom Selena must still **resemble the default** (fixed head shape/proportions/DNA; restyle *within* the silhouette). |
| D5 | Avatar customization axes | Rich enough that every student is unique: skin tone, hairstyle, hair colour, **eye colour** (new), eye shape, brows, mouth, blush, glasses/accessories, outfit (casual wardrobe), background. |
| D6 | Avatar persistence & flow | Persist per-student in Supabase; **first-run "Create your Selena" onboarding** + edit later from home/leaderboard. |
| D7 | Leaderboard visibility | **Everyone by default + hide toggle** (opt-out) + optional display name; rank by **XP only**; role filter; supervisor cohort filter retained. |
| D8 | Paid image-gen | Only **patient faces** + **logo→Selena raster** cost money — batched, fired only on explicit go-ahead. The avatar engine is free vector. |

## 4. Architecture — foundations first

The v1 inconsistency came from having no shared substrate. v2 builds **two foundations**,
then composes every surface on top of them.

### Foundation 1 · Design-system layer
A canonical token set (extends the existing `aurora.css` `:root` — `--ink`/`--ink-2`/`--ink-3`,
`--hairline`, `--aurora-anim` already exist; we consolidate, don't invent).
- **Colour**: ink scale, surfaces, hairlines, verdict green/red, and the **Gemini-gradient
  accent** (blue→indigo→magenta stops + the `aurora-flow` animation already in the file).
- **Motion**: durations, easings, the shared `aurora-flow` keyframe (CSS-only motion system;
  `MotionProvider` is not mounted — no GSAP fx wrappers).
- **Type / spacing / radius / elevation** tokens.
- Discipline: additive. Surfaces migrate to tokens **as we touch them**, not a big-bang
  refactor. Each migration verified by the aurora harness.

### Foundation 2 · Selena engine
The avatar as a reusable system, consumed everywhere (home greeting, streak tiers,
leaderboard headshots, Tutor reply avatar):

- **Config schema** (`avatar_config`, versioned):
  `{ version, skinTone, hairStyle, hairColor, eyeColor, eyeShape, brows, mouth, blush,
  glasses, accessory, outfit, background }`. Derived-not-stored: `tier` (from streak
  milestone) adds "upgraded" layers (crown/sparkles/frame).
- **Parts registry** (server-authoritative id → art): the source of truth for valid option
  ids; used both to render and to **validate** an incoming config (a tampered body cannot
  inject arbitrary values). Sized for uniqueness (target ≥ 8×12×10×8×… ≫ 10⁶ combinations).
- **Renderer**: `<Selena config size expression tier animated />` — a React component that
  composes SVG part layers deterministically (no network, instant). `expression` =
  `smile|focus|celebrate`; CSS-only idle motion (blink/bob) when `animated`.
- **Default**: a canonical default config renders the current "default Selena" look; used
  anywhere a student hasn't customized, and as the Tutor reply avatar (never a student's
  custom avatar — ricoe A3).

## 5. Backend workstreams (build & harden first)

### 5.1 Avatar backend
- Migration `006_avatar_and_leaderboard_visibility.sql` (single migration, also used by §5.2):
  `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS avatar_config JSONB` (nullable →
  default look when null). Graceful if unapplied.
- Endpoints (new `tools/api/routers/avatar.py`, on the shared limiter):
  - `GET /api/avatar` → current user's config (identity from `current_user["sub"]`), default if null.
  - `PUT /api/avatar` → validate every id against the parts registry, then persist.
- Invariants: Supabase sync client wrapped in `asyncio.to_thread` + timeout; fail closed on
  invalid ids; never trust the body for identity.
- Tests (TDD): default when absent, round-trip save/load, rejects unknown option ids, identity
  from JWT not body.

### 5.2 Leaderboard API
- Migration `006_avatar_and_leaderboard_visibility.sql` (same migration as §5.1) also:
  `leaderboard_hidden BOOLEAN NOT NULL DEFAULT false` (visible by default — D7) and optional
  `display_name TEXT`. The v1 `leaderboard_opt_in` column is
  superseded (kept but unused, or repurposed; documented in the migration).
- Endpoint `GET /api/leaderboard?role=&cohort=` — ordered by XP desc, excludes hidden rows,
  returns `{ rank, display_name|name, role, xp, streak_days, avatar_config }`, paginated.
  Streak is a **badge only** — it does not affect rank.
- Invariants: single efficient ordered query (no N+1); role filter; supervisor cohort filter
  retained; non-blocking; tests for ordering, ties (stable by name), hidden exclusion, role filter.

### 5.3 Gamification / streak hardening
- Verify `005_streak_xp.sql` applied; harden the milestone-tier logic in
  `tools/gamification/streak.py` (the tiers that drive "upgraded Selena" + streak badges).
- Ensure `xp_today` sync + `/api/progress` `streak_detail` are correct; ship-check the
  show-once/streak state invariants (regression test covers the repeat case).

### 5.4 OSCE logic audit
- **Audit, not rewrite.** Re-verify `action_model_answer.py`, `examination_actions.py`,
  `station_score.py`, and the checklist-in-score path against edge cases; add tests where thin;
  confirm no event-loop blocking. Keep behaviour; raise the test bar.

## 6. Frontend workstreams (rebuilt on the foundations)

### 6.1 Flashcards (recolour + contrast + cohesion — D2)
Keep the **locked interaction model** (Console instant-tap, Charge→Flip→Payoff, ComboBurst,
TopicIntro, topic fan). Re-theme onto tokens:
- Canvas → warm greige/ivory deepened for contrast; study card → bright white + subtle elevation.
- Accent → moving Gemini gradient (hairline/progress/keyline via `aurora-flow`).
- Reveal → card flips to deep ink for the answer moment. Verdicts bright green/red.
- Update `docs/design-locks.md` flashcards entry to the new theme (this is a refine-within-lock
  of the just-broken B6 lock, with the new acceptance criterion = D2).

### 6.2 Home
Custom Selena in the greeting (from the engine), richer/​routing-correct shortcut cards
(Tutor/OSCE/Flashcards must navigate), wider layout / less side whitespace, shorter-wider
greeting + streak. Refine within the Home lock. Streak-tier "upgraded Selena" surfaces here.

### 6.3 Tutor
Greeting-landing polish, default-Selena reply avatar from the engine, keep "Mono + Electric".
(Sliding-light already removed.) Inspiration screenshot optional — proceed with a world-class
take unless Caleb provides it.

### 6.4 OSCE UI
Action chips (whole-word, de-duped), auto-scroll all three panes, eye-diagram as the **only**
filter with every eye part always populated + bigger/apparent pins, static talking-head / hand
pfps, skip-explanation on mechanical actions. Refine within the OSCE lock.

### 6.5 Leaderboard page (new)
Selena headshot + name/display-name + role + XP + small streak badge; role filter; "you" row
highlighted; hide-me toggle wired to D7. Consumes the engine + `GET /api/leaderboard`.

### 6.6 Branding + Selena surfacing
EyeBot + SNEC lockup on every page (rails have it; add to rail-less pages). Surface Selena with
motion/life where it earns it. Logo→Selena-variation raster is **paid/deferred** (§8).

## 7. Selena onboarding & edit flow
First login with `avatar_config == null` → route to **/onboarding "Create your Selena"**: live
`<Selena>` preview + per-axis pickers → save (`PUT /api/avatar`) → continue to home. An
"Edit Selena" entry lives on home + the leaderboard page thereafter. Streak-tier upgrades are
automatic (derived), not an edit.

## 8. Deferred to one paid go-ahead (§ ricoe rule)
- Patient faces (Chua Ah Hoon + all) via Nano Banana — default to the **non-premium** model
  (premium reserved for clinical/important). Scaffold placeholders now.
- Logo → a *different* Selena variation (angle/headshot) — breaks the "mono Spark-Eye logo"
  global lock; needs a new brief + paid gen.
- **Uniforms: excluded entirely until Caleb says so.**

## 9. Definition of "world-class" (acceptance bar for every phase)
- **Cohesion**: surface consumes shared tokens; zero one-off hardcoded colours introduced.
- **Backend**: typed; TDD (failing test first); never blocks the event loop (`asyncio.to_thread`
  + timeout); fails closed; identity from JWT; rate-limited on the shared limiter.
- **Frontend**: CSS motion system only; 390px responsive; WCAG-legible contrast + a11y labels;
  no layout shift; real data only (no invented stats).
- **Verification gate per phase**: TDD/verify → `/ship-check` for any user-facing state
  invariant → aurora/station harness assert + screenshot → **prod green** → commit + push to `main`.

## 10. Sequencing (backend-first, low→high risk)
0. **Foundation 1** — design tokens (unlocks cohesion; low risk).
1. **Foundation 2 — Selena engine** — schema + migration 006 + endpoints + renderer + a first
   excellent parts library + onboarding + edit. (Backend + core FE.)
2. **Backend hardening** — Leaderboard API, gamification/streak, OSCE logic audit.
3. **Frontend surfaces** — Flashcards → Home → Tutor → OSCE UI → Leaderboard page → Branding/surfacing.
4. **Paid art** — patient faces + logo raster, one consolidated go-ahead.

Each numbered item decomposes into small, atomic, independently shippable phases in the
implementation plan (writing-plans). The Selena engine is large enough it may warrant its own
sub-plan.

## 11. Risks & mitigations
- *Token refactor ripple* → additive tokens, migrate surfaces incrementally, harness after each.
- *Prod regression during rebuild-in-place* → ship-check + harness + screenshot every phase;
  never push red; new required env/DB (migration 006) coordinated so `main` never boots broken.
- *Avatar parts art quality* → invest in a small-but-excellent vector library; expandable later.
- *Leaderboard visibility change* → migration + clear in-UI copy for the hide toggle.

## 12. Out of scope / open items to confirm during planning
- Exact parts-library counts + final vector art (aim for uniqueness; expandable).
- Confirm applied status of migrations 004/005/006 in Supabase before relying on their columns.
- Tutor landing inspiration screenshot (optional).
