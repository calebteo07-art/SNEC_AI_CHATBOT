# Home → the HUD (Phase 2) — design

**Date:** 2026-08-05
**Status:** approved, not yet implemented
**Phase 1:** `2026-08-04-homepage-game-hud-design.md` — shipped, migration 018 applied
2026-08-05. The loop is live and invisible.
**Supersedes:** named criteria in `docs/design-locks.md` § *Home / Dashboard — LOCKED
2026-07-01*. See § *What this supersedes*.

## The diagnosis, corrected

Phase 1's spec said Home was "warm cream wellness while The League next door is dark
STRUCK arcade." **That is wrong about the League and it mattered.** Line 1 of
`frontend/src/aurora/leaderboard.css` reads *"bright arcade on a light stage"*, and its
doctrine pins base luminance > 0.7 with the stack ending in a solid. Two of the four
rejected League passes were the dark ones; light is what finally landed.

So Home's LOOK gap was never brightness. Home is already light. The gap is **material**.

That same file names Home's exact construction as the disease:

> 1px hairlines at ~10% ink, 4–6% blurred shadows, pastel fills, smooth washes. That
> combination IS the house style of a generated dashboard.

Home is built entirely from those four things — the toybox pass added *gloss sheens*
and *heat glows*, which are more wash, not less. Four League passes of re-colouring
could not shake the word "slop" until the objects were rebuilt. Home will not shake it
either.

**Phase 2 is a re-materialisation, not a re-colouring.** The colours stay bold; the
surfaces change. Every object on Home gets the five moves the League proved:

1. a dark defining outline in `--mat-ink` #2A1F3D — never grey, never pure black
2. a hard lip — zero-blur offset shadow, plus a second at the same offset carrying the
   outline as *spread*, so the keyline wraps the lip's crescents
3. hard-stop fills — a gradient that holds a colour then steps is a moulded surface; one
   that eases across the box is a wash
4. a lit top edge + dark base, inset — one key light from above
5. a drawn floor — objects that float read as a chart

## Decisions taken

| Fork | Decision | Why |
|---|---|---|
| Scope | **Deck on top, record below** | The fold becomes forward-looking; the month calendar and the 20-badge vault survive, re-materialised, beneath it. Nothing is deleted — which also keeps eight harnesses' selectors alive. |
| Generated art | **Rasters are the actors** | Every generated asset stays: the Veo greeting loop, the three mascot cut-outs, the 20 medallions. The League's zero-raster rule governs *ornament*; Home is the one screen with a cast. STRUCK gives the art **frames** instead of washes. |
| Chest | **Loud — it takes the screen** | This is the PAYOFF gap. Struck chest, shake, tap, burst, drop lands, boost timer starts ticking in the status bar. |
| Stage | **Stays light** | Not a new decision — the correction above. Base luminance > 0.7, every gradient also declares a solid `background-color`. |
| Coverflow | **Mechanics untouched** | Drift / tap-to-nearest / arrows / keyboard / hover-pause are locked and gated by three harnesses. Only the card's *frame* is restruck. |

## Architecture — three zones

`.aurora-home` becomes three bands. The top chrome (`.hm-top`: logo, level chip,
Eyecon menu) is unchanged.

```
┌ THE DECK ─ new, above the fold ────────────────────────────┐
│  status bar   level · XP-to-next · streak-at-risk · boost  │
│  ┌ host ────────────┐ ┌ quest board ──────────────────┐    │
│  │ Iris (Veo loop)  │ │ adaptive   1/2   +40    [ ]   │    │
│  │ greeting line    │ │ breadth    0/1   +30    [ ]   │    │
│  │ + sub            │ │ stretch   60/100 +50    [ ]   │    │
│  └──────────────────┘ └───────────────────────────────┘    │
│  ┌ chest ─────┐ ┌ rank strip ──────────────────────┐       │
│  │  sealed /  │ │ Silver · #7 of 24 · 120 XP to    │       │
│  │  spent     │ │ promotion            → /leaderboard      │
│  └────────────┘ └──────────────────────────────────┘       │
└────────────────────────────────────────────────────────────┘
┌ THE MODES ── FeatureCarousel, restruck frames only ────────┐
┌ THE RECORD ─ streak month calendar │ Lumens vault ─────────┐
```

**Phone (390px, `pointer:coarse`):** one column. Iris is already hidden on both coarse
tiers by the 2026-07-20 lock, so the host panel collapses to the greeting line alone.
Chest and rank strip sit side by side.

### The fold budget

The League gates *ranks visible ≥ 8* rather than arguing about layout. Home takes the
same discipline: **at 390×844 the deck must show the status bar, all three quest rows,
and the chest — measured, gated.** If it does not fit, the greeting line shrinks. It is
the object with the least claim on the fold.

## The material contract

The lip ladder is **exactly four depths**, mirroring the League so the two screens read
as one game:

| depth | lip / outline | Home objects |
|---|---|---|
| structural | 5px / 2.5px | `.hm-deck` · `.hm-board` · `.hm-fcard` · the two record plates |
| medallion | 3px / 2px | `.hm-chest` · the Iris frame · `.hm-badge` |
| pill | 2px / 2px | `.hm-chip` · quest claim button · boost timer · `.hm-lb` rank strip |
| flat | none | `.hm-quest` rows · calendar cells · the canvas |

**The repeated elements stay flat.** This is the League's own finding inverted: a
hairline instantiated 27 times was the single largest surface exempting itself from the
recipe, and `.lg-row` stays flat precisely so the ladder never competes with the five
struck objects riding on it. Home has 3 quest rows and ~35 calendar cells. Striking
those is how "material everywhere" collapses into "the whole page is buttons."

**No 1px borders anywhere on the deck.** Chrome snaps a used border-width to whole
device pixels, so a `1.5px` outline *renders* as the banned hairline — measurably, via
`getComputedStyle`. Outlines are 2px or 2.5px; differentiation comes from lip depth,
which is an offset and does not snap.

### Colour — one meaning per hue, no fourth system

Home keeps its candy palette; the discipline comes from the League.

- **gold** = the mechanic → the chest, the boost timer
- **violet** = quests → the board and its rows
- **orange** = the streak → at-risk state, the flame, the calendar
- **green** = complete / claimable → a finished quest row and its button

Gold splits by job, as it must: `--gold-ink` is 6.9:1 on white but only 3.0:1 on a gold
*fill*, so any glyph landing on gold uses `--ink-on-gold`. One token for both is exactly
what makes 2.2:1 gold lettering plausible.

## The deck's objects

**Status bar.** Level + rank, XP-to-next as a struck meter, a streak-at-risk countdown,
and the boost timer when live. Numerals count up on arrival via the existing
`useCountUp` (`frontend/src/hooks/useCountUp.ts`).

**Streak-at-risk.** The loss-aversion Phase 1 chose over hearts. Derived client-side
from `streak_detail.done_today` plus the clock — no new backend. Silent when the day is
already done; a countdown to midnight SGT when it is not. **Informative, never
punitive**: it reports a deadline, it does not lock anyone out of revision. That is the
same reasoning that left `hearts` dormant.

**The quest board.** Three rows from `GET /api/home`. Each carries title, `progress /
target`, reward, and — only when complete and unclaimed — a claim button. A claimed row
reads spent. Rows are flat; the board is structural; a machined groove separates them.

**The chest.** One medallion-depth object. Unclaimed: sealed and shaking (frozen under
reduced motion). Claimed: spent, showing what it paid.

⚠ **The payload leaks the prize, and the HUD must not.** `GET /api/home` returns
`chest: {claimed, key, label}` — the drop's identity is present *before* it is claimed,
because the roll is a pure function of `(student_id, date)` and the endpoint computes it
either way. This is not a security hole (it is the student's own chest, and the roll is
deterministic regardless), but rendering `label` on a sealed chest would spoil the only
ceremony the app has. **Rule: `key`/`label` may only reach the DOM when
`claimed === true`, or after this session's own claim returned.** A sealed chest renders
its sealed art and nothing else. Worth a gate assertion, since the bug is invisible in
review — the data is simply sitting there in props.

**The rank strip.** Division, rank, pool size, and XP to promotion, linking to
`/leaderboard`. This **replaces** the candy-gradient "See where you stand" tease with
the real number — a tease that says nothing is weaker than a rank that does.

**The host.** The Veo loop of Iris in a struck frame, with the greeting line beside her.
The greeting *engine* is untouched — `pickGreeting` and its day-of-year rotation are
gated by `greeting_assert.mjs` and stay exactly as they are. Only the type scale drops.

## The chest ceremony

Full-screen, focus-trapped, `aria-modal`, Esc to close. Struck chest → tap → lid bursts
→ the drop card lands → the boost timer begins ticking in the status bar behind it.
Confetti reuses the existing `@/fx/confetti` (already imported by `Dashboard.tsx`; the
blob-Worker CSP allowance `worker-src 'self' blob:` is already in place for OSCE).

Two rules that are correctness, not polish:

1. **The ceremony fires on the claim action, never on load.** A ceremony that fired
   whenever `claimed === false` would re-fire on every mount before the refetch settled.
   Show-once-per-day is a bug class this project has already shipped; it needs a
   regression test covering the repeat case.
2. **The ceremony opens only after `ok: true`.** The claim POST can fail. Showing loot
   the server did not grant is the same lie as painting `0 XP` on a failed read — the
   thing this Home already guards against. On failure: an error, not a prize.

Under `prefers-reduced-motion` / `data-motion=reduce`: instant reveal. No shake, no
burst, no confetti.

## Data and error handling

**Home makes two queries, not one.** Phase 1's spec promised a single payload including
progress; the shipped `GET /api/home` returns only `{quests, chest, boost, league}` —
progress stays on `/api/progress`, where the shared `useProgress` hook already caches it
for the rest of the app. That is the better call, but it means the "single honest error
state" rationale only half-landed and Phase 2 must design for two.

| Read | Fails how |
|---|---|
| `/api/progress` | existing `progressUnknown` guard → `ApiErrorNotice`. Unchanged. |
| `/api/home` | each section is independently nullable. A `null` renders as an explicit "couldn't load", **never as zeros** — "0/3 quests" is a lie, and a chest that reads unclaimed after a failed read invites a claim that cannot succeed. |

**The modes stay outside both guards.** `FeatureCarousel` reads no progress, and a
failed read must still leave Tutor, Virtual Patients and Flashcards reachable. That rule
already exists in `Dashboard.tsx` and is preserved verbatim.

**After any claim, invalidate both queries.** A quest payout changes XP, which changes
League rank; leaving `/api/progress` stale would show a student a reward that did not
land.

**No `PERSIST_SCHEMA_VERSION` bump.** A *new* query key does not need one — only a shape
change to an existing persisted key does. `frontend/src/lib/queryClient.ts` stays at
`"10"` unless the progress payload itself changes.

**Day-one wrinkle, accepted:** a student who studied earlier today, before migration 018
ran, has a populated `xp_today` but a null `daily_state`. Their stretch quest will show
real progress while the adaptive and breadth rows read 0. It self-corrects at the next
SGT midnight and is not worth a backfill.

## What this supersedes

Named against `docs/design-locks.md` § *Home / Dashboard*, per the design-lock rule.

- **(a) Material — "toybox vibrancy" (2026-07-11).** Glossy vinyl surfaces, gloss
  sheens, blurred heat-glows and smooth candy washes are SUPERSEDED by STRUCK material
  on every object. This is a change of *surface*, not of *boldness* — the directive was
  "colors more bold and vibrant, don't hold back", and hard-stop fills under an ink
  outline are more vivid than a gloss wash, not less. The palette is kept.
- **(b) Layout — `.hm-hero` (greeting + StreakTile side by side).** SUPERSEDED. The deck
  owns the fold; `StreakTile` moves down into the record. The streak *numeral* is not
  duplicated into the status bar — only the new at-risk countdown lives there, so two
  numerals can never disagree.
- **(c) Type scale — greeting headline 50→62px (2026-07-10).** SUPERSEDED; the headline
  drops to make room for the board. The `home_mobile_assert` bound (`.hm-greet h1` ≤ 40%
  of viewport height) gets easier to hold, not harder.
- **(d) The leaderboard tease — bold candy gradient pill (2026-07-14).** SUPERSEDED by
  the struck rank strip carrying live standing. It remains **one** control linking to
  `/leaderboard`, not a revived CTA row. `.hm-lb` keeps its class; its assertion moves
  from "capped left column / no mascot overlap" to "in the deck / fully on screen and
  hittable".
- **(e) `.hm-lower` as a single full-width vault column (2026-07-29).** SUPERSEDED in
  *placement only* — the record is calendar + vault, two-up on desktop, stacked on
  phone. The ONE-vault decision itself stands.

**Explicitly PRESERVED:** every generated asset; the coverflow mechanics including
hover-pause; the vault's paged-frame-of-five with its DOM-measured stride and clamped
buttons; the month calendar's day-name-derived leading offset (never `new Date(iso)`,
which reintroduces the UTC/SGT off-by-one); the greeting engine; `streak-tile` and
`lumen-ladder` testids and every badge state.

## Testing and gates

At least eight harnesses in `frontend/tests/` reference Home selectors —
`aurora_assert`, `home_mobile_assert`, `home_carousel_assert`, `hoverPause_logic`,
`greeting_assert`, `display_name_assert`, `fixed_overlay_assert`, `api_error_assert`.
Because nothing is deleted, their selectors survive; each must be **re-run and read**,
not assumed. A zero exit only means nothing that ran failed — the harness count is the
gate.

New: **`home_hud_assert.mjs`**. It needs no registration — `scripts/start-harness.sh`
*discovers* browser harnesses (any `frontend/tests/*.mjs` that is not `_`-prefixed and
contains `from "playwright"`), and exclusion is opt-**out** via a `NOT_GATED` list
holding only `visual_sweep.mjs`. So the harness is gated the moment it lands, and the
`MIN_HARNESSES=15` floor guards against a collapsed discovery reading as green.

It pins:

1. **The fold budget** — at 390×844 the status bar, all three quest rows and the chest
   are above the fold.
2. **No hairlines on the deck** — every struck object reports a computed border-width
   ≥ 2px. This is the measured form of the League's DPR finding.
3. **Every struck object declares a solid `background-color`** — a gradient-only box has
   none, so the contrast probe walks past it to the page and measures nothing.
4. **0px horizontal page overflow at 390px**, and nothing rotates its own box (a rotated
   square reports a bounding box 1.41× its width and escapes the overflow sweep even
   under `overflow:hidden`).
5. **Reduced motion freezes** the shake, the burst, the confetti — but **not** the two
   countdowns. A frozen clock lies about the time; only its pulse freezes.
6. **Touch targets ≥ 44px** on the claim buttons and the chest.
7. **A sealed chest does not leak its drop** — with `chest.claimed === false` and a
   known `label` in the mocked payload, that text appears nowhere in the deck's DOM.

Behavioural, on the running app: claim the chest → ceremony once → reload → tile is
spent and the ceremony does **not** re-fire. Complete a quest → claim → XP moves and the
rank strip updates.

Backend: unchanged. Phase 1's 1731 tests stay green; this phase adds no Python.

## Out of scope

- Hearts. The column stays dormant.
- Spending boosts on anything but the XP multiplier.
- A `/record` route. The calendar and vault stay on Home.
- Tuning the Phase 1 constants (quest targets, chest weights). They are pure constants
  in `quests.py` / `chest.py` and are a data question, not a design one.

## Risks

- **Eight gated harnesses on one screen.** The mitigation is the scope choice: deck on
  top, record below, nothing deleted. Selectors survive; layout assertions move.
- **"The whole page is buttons."** Guarded by the four-depth ladder and by keeping the
  repeated elements — rows, calendar cells — flat.
- **A 20-minute boost is aggressive.** Short on purpose, because the countdown is the
  pull. But a student who opens the app on a break and cannot study right then watches
  it expire, and a reward that evaporates reads as a loss. Worth watching once real
  students hit it; it is one constant to change.
