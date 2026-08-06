# The League — a calmer palette (2026-08-06)

**Report:** *"color choices of the leaderboard page does not look aesthetically pleasing or
beautiful, too over stimulating. but i dont want it to be quiet or boring either."*

This is the sixth colour pass on this page and the first one whose complaint is about
**quantity** rather than about brightness. Read `docs/design-locks.md` and the top block of
`project_leaderboard_the_climb` before touching anything here.

## 1. Diagnosis

Counted off `origin/main@381ecc6`, one screen carries **seven hue families at once**:

| Surface | Carries |
|---|---|
| Page field | division hue @ .42 · partner hue @ .30–.34 (both top corners) · gold footlights @ .46 · division stripes @ .10 · a tinted base |
| Lane flanks (≥1600px) | the same three, one step deeper, stripes ×3 |
| Tier band | four hard-stop steps of the division hue + an `--f-flash` **second hue** rim |
| Podium | three blocks at max chroma — gold / acid lime / vermilion |
| Ladder | 27 role-tinted gauges (violet / teal / crimson), medallions, division-tinted rank plates |
| Mechanic | gold zone, gold `×N` chip, gold chase number |
| You | `--you-blue #1A56C4` |

Two findings, and neither is "it is too bright":

1. **Nothing on the page is neutral.** The largest surface is itself four hue families deep,
   so the objects standing on it have nothing to be loud *against*. Saturation is ambient
   rather than earned, which is the definition of over-stimulating.
2. **`--f-flash` puts a clashing complement inside single objects** — `#FF6FD0` pink rimming
   acid lime, `#FFD24A` gold rimming hot magenta, `#F5FF6B` yellow rimming emerald. The
   harshest local pairs on the board are *inside* the band and the plinths, not between them.

Underneath both: the **150°–300° closure** (user's call, 2026-08-06, gated in `league_assert`)
squeezed five max-chroma hues onto half the wheel. Lime beside magenta beside vermilion is a
fairground by construction, not by tuning.

## 2. Direction chosen

Put to the user as two forks; both answered:

- **Where colour lives → "quiet field, loud objects."** The page goes near-neutral; the band,
  podium, promotion zone and your row keep full punch. 90% calm is what makes the 10% land.
- **The blue ban → reopen it.** 150°–300° is no longer closed to tier hues.

Not chosen, and therefore out of scope: flattening the ladder's role tints. They are the loud
objects the user asked to keep, and `league_assert:1265` actively forbids it ("the ladder is
the flattest thing on a page that is meant to be loud").

## 3. The five moves

### 3.1 The field goes quiet — all five divisions

Drop both partner blooms and the gold footlights: two hue families off the largest surface in
one cut. Gold stays where it *means* something — the promotion zone, the `×N` chip, the chase
number, the podium deck — which is what it was always supposed to mean.

| Token | Now | New |
|---|---|---|
| `--arena-wash` | .40–.46 | **.15**, on a tighter radial (`104% 46%` → `92% 38%`) |
| `--arena-glow` | .30–.34, two blooms | **removed** |
| gold footlights | .46 | **removed** |
| `--arena-stripe` | .10, pitch 26/78 | **.045**, pitch 30/120 (quarter duty cycle) |
| `--arena-base` | per-division tint | kept, pulled toward neutral — tint reads as temperature |
| `--arena-deep` | per-division | **deepened**, so the lane wall earns its keep by VALUE |

The lane and its flanks stay — the white-sides complaint was reported three times and the
structure is the answer to it. But the walls are repainted: one pass of the stripe plus the
deeper solid, not three stripe passes over both blooms.

⚠ The layer count on `.aurora-main` drops **6 → 3**, so `background-repeat` must be rewritten
to match. The file's own comment warns that miscounting here silently tiles a bloom across the
page; `league_assert` already pins that `repeat` lands on the *index of* the tiling gradient
(Chrome cycles the list, so comparing lengths is a vacuous gate).

⚠⚠ **`--arena-glow` HAS A SECOND CONSUMER, and deleting a token is not a local edit.** The
podium **deck** reads it for its left flank bloom. A `var()` with no fallback and no definition
is invalid at computed-value time, which does not fade one gradient — it throws away the whole
`background-image` declaration, so the deck would have lost its gold as well as its flank. Both
flanks now read `--arena-wash`, so the deck picks up the division's one hue from both sides.
Worth carrying forward before any other `--arena-*` token is removed.

Preserved and still gated: the stack ends in an **opaque light solid**, base luminance stays
over the 0.7 floor (it rises), transparent stops stay `rgba(c, 0)` rather than the keyword.

### 3.2 The ladder respreads over the whole wheel

| Rung | Now | New | Hue | Lum |
|---|---|---|---|---|
| 1 Ember | `#FF6320` vermilion | **unchanged** | 19° | 0.303 |
| 2 Volt | `#A5F000` acid lime | `#3D9BFF` electric blue | 211° | 0.317 |
| 3 Solar | `#FFB800` gold | **unchanged** | 43° | 0.555 |
| 4 Nova | `#FF47AE` hot magenta | `#D06BFF` violet | 281° | 0.312 |
| 5 Prism | `#28E063` emerald | `#2BE8CE` aqua | 172° | 0.627 |

Only the three rungs the closed arc actually distorted move. Ember and Solar were never the
problem and repainting them would be change for its own sake.

⚠ **THE INK FLOOR PICKS THE VALUES, and it is the constraint that is invisible until you go
looking.** `.tb-head` paints `--f-lo` and `.tb-name` / `.tb-league` put `--ink` on it, so any
rung below ~0.29 luminance fails 4.5:1 **on its own band**. That is what rules out the deep
azure and deep violet these three obviously want to be: `#0A84FF` measures 4.23:1 and
`#C93BF5` is worse. Volt is a *bright* electric blue for a contrast reason, not a taste one.

Two rungs sit inside 60° of hue (Volt 211 / Prism 172, at 39°) and are held apart by 0.31 of
luminance — the same doubling the closed arc forced on lime and emerald, but now by choice and
with three times the luminance separation.

The names survive the repaint, which is the test of whether the ladder-of-light reading was
ever real: Volt is electricity, and electric blue is what the name meant before the ban; Nova
is a star going off; Prism gets its name back honestly, since aqua *is* light at its most
split and the summit is now also the brightest rung on the ladder.

### 3.3 The clashing rims die

`--f-flash` becomes a light tint of the rung's **own** hue — a highlight, not a second colour.
Solar's cream flash already worked this way and is the model. The four hard stops stay: this
changes which colour the top rim carries, not the material recipe.

### 3.4 "You" stops being a colour

Forced by 3.2, not optional alongside it: `--you-blue #1A56C4` now sits 47° from Volt, and
`--role-ot` teal sits 20° from Prism, so on a Volt board the band, your row and every OT gauge
all read blue. The wheel is full — there is no spare hue to move to.

Your row becomes the one **dark** object in a light ladder: the `--mat-ink #2A1F3D` console
fill the readout row already wears. Unmistakable on all five boards, reuses a material already
on the page, and deletes an entire colour system. The token is renamed `--you-blue` →
`--you-ink` so the name cannot lie about what it holds.

⚠ **It is bigger than the token.** "You" was not one blue — it was a whole **Gemini family**,
and the token was only its most obvious member. Also moving to ink: the row's own tint
(`rgba(66,133,244,.16)` → `rgba(155,114,203,.07)`, a blue-into-violet wash), the animated 4px
rail (`var(--gemini)`, a gradient), the XP bar's two-stop fill, the podium face ring, and the
blue lip under both YOU pills. That is a sixth hue family on a board whose complaint was
having too many — and the family with the weakest claim to one, since "this row is you" is the
single thing on the page a reader finds without being told a hue. The rail keeps its breathing
animation, which is what actually makes it findable.

⚠ White-on-`--mat-ink` is ~13:1, so this strengthens the contrast that
`.lg-you`-white-on-gradient (3.56:1) originally failed at. It does not weaken it.

⚠ The YOU pill keeps its `--mat-ink` border even though the fill is now the same value. The
outline's job is defining an object against a **light** page; a dark object against a white row
is already defined by being dark. Special-casing the border would break the material recipe for
no gain.

**Net effect on the complaint: seven hue families per screen → three** (the division, the role
tints on the ladder, gold for the mechanic).

### 3.5 The gate changes shape, it does not disappear

`league_assert` pins `150°–300° is CLOSED` in two places — the five road rungs
(`league_assert:1330`) and each division's band (`:1675`). Deleting a rule and replacing it
with nothing is how a palette drifts back inside a month, so the ban is replaced by the two
claims it was a crude proxy for:

> **1 · SPREAD** — the five rungs occupy ≥210° of the wheel, measured as 360 minus the largest
> gap between adjacent hues (the only definition that survives the wrap at 0°).
> **2 · SEPARATION** — no two rungs sit within 60° of hue *unless* they are ≥0.15 apart in
> relative luminance.

⚠ **BOTH rules fire on the rejected palette, and that is what locates the ugliness.** Measured
directly against both sets:

| | spread | collapsing pairs |
|---|---|---|
| rejected (closed arc) | **173°** — fails the 210° floor | **Ember–Nova** 52° @ 0.015 lum · **Volt–Solar** 35° @ 0.148 lum |
| shipped (arc reopened) | **233°** | none |

The Ember–Nova pair is the finding worth keeping: vermilion `#FF6320` and hot magenta `#FF47AE`
sit 52° apart at luminance **0.303 against 0.288**. Two hot colours of the same weight and
almost the same value, neither able to sit behind the other — that pair is most of what
"fairground" actually was, and **the closed-arc rule could never have seen it**, because both
hues are outside 150°–300°. The ban was policing the wrong property.

⚠ The `OR` in rule 2 is load-bearing. Ember and Solar are 25° apart and always have been; they
read as vermilion and gold on luminance, and a hue-only rule would ban the one pair the eye has
never confused.

**The band's arc check becomes something better rather than being deleted.** Spread cannot be
measured per-division (one board shows one band), so `:1675` now checks what *is* per-division
and was never gated: the band (`--f-lo`) and its own rung on the road (`--pm`) are **two
authoring sites for one colour** and must agree within 12°. That is the documented failure mode
for this page — `Tiers.tsx` carries a third copy — and it had no test at all.

Plus a new field-quiet pin, swept across all five divisions:

> `--arena-wash` alpha ≤ .18 · `--arena-stripe` alpha ≤ .06 · `--arena-glow` unset ·
> `.aurora-main` carries ≤3 image layers.

Token alphas are read off `getComputedStyle`, which is exact and cheap — and unlike a
screenshot sample it cannot go vacuous when a bloom moves.

## 4. Success criteria

1. All five divisions render with the new field and the new rung; `league_assert` green.
2. The two arc checks are **replaced**, not deleted — the separation gate fails a hand-mutated
   palette that puts two rungs within 60° at equal luminance.
3. The field-quiet gate fails when `--arena-wash` is reverted to .42.
4. Per-division contrast sweep (§5c) stays green on all five boards. **This is the live risk:**
   a lighter field raises luminance everywhere, so glyphs that currently pass *because* they
   sit on a saturated wash can drift. Spot-checking division 2 does not cover it —
   `league_assert` mounts `division: 2` and only 2.
5. `frontend/tests/_league_shot.mjs` renders 5 divisions × laptop+phone for a visual read.
6. typecheck + build green.

## 5. Measured (built, served, swept)

`league_assert` **523 assertions, 0 failures** — 545 before, minus the 50 arc checks, plus 28
new (spread ×9, separation ×9, band/rung agreement ×5, quiet field ×5).

| claim | measured |
|---|---|
| spread, all nine viewports | **233°** (floor 210) |
| band luminance, five divisions | 0.303 · 0.317 · 0.555 · 0.311 · 0.627 (ceiling 0.86) |
| band vs its own rung | 18/18 · 211/211 · 43/43 · 281/281 · 172/172 — exact |
| current rung vs trough | 5.18 · 5.38 · 8.89 · 5.31 · 9.94:1 (floor 3) |
| head styles on the division's metal | all 8 ≥4.5:1 on all five |
| field base luminance | 0.970 · 0.960 · 0.974 · 0.965 · 0.967 (floor 0.70; was 0.929–0.982) |
| field tokens | wash 0.149–0.161 · stripe 0.043–0.051 · glow unset |

`aurora_assert` and `console_assert` green. Typecheck clean. Screenshots rendered for all five
divisions × laptop + phone via `_league_shot.mjs` and read visually.

⚠⚠ **THE PROBE BUG WORTH CARRYING FORWARD.** The first quiet-field gate parsed only `rgba(…)`,
but a custom property computes to its **token text** and the build minifies
`rgba(255, 99, 32, .15)` to **`#ff632026`**. The regex found one number, fell back to opaque,
and the gate fired on all five divisions. It failed *loudly* only because the fallback breached
a **ceiling** — against a FLOOR it would have passed vacuously on every board. Same class of
hole as measuring text on a gradient with no `background-color`. Parse the authored form and
the shipped form.

## 6. Out of scope

- The ladder's 27 role-tinted gauges (§2).
- The lane's existence and geometry — only its paint changes.
- Any payload or backend change. `DIVISION_NAMES` keeps its five names, `division_name` still
  derives from `tools/gamification/league.py::DIVISIONS`, and no persisted-query shape moves,
  so **`PERSIST_SCHEMA_VERSION` does not bump**.
- The podium's material recipe, the lip ladder, plinth mass bounds, the ranks budget.
