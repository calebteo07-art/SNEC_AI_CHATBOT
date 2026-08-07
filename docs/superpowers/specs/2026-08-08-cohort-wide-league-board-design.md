# Cohort-wide League board — design

**Date:** 2026-08-08
**Status:** approved (design), not yet implemented
**Refines:** the League design-lock (`docs/design-locks.md`) — see "Criterion changed" below.

## The problem

A batch of students onboarded on 2026-08-07 and did not appear on the leaderboard for
staff or for earlier students. Nothing was broken. `GET /api/leaderboard` ranks only the
viewer's own division (`rank_entries(..., division=my_division)`,
`tools/api/routers/student.py`), and every new profile starts at division 1 (Ember,
`DEFAULT 1` from migration 016). Established accounts had been promoted to division 2
(Volt) by past Monday rollovers, so the two groups were on boards neither could see.

Verified read-only against production on 2026-08-07: all seven students who onboarded
that day were approved, had consent + profile rows, `leaderboard_hidden = false`, and
weekly XP stamped to the current Monday. They ranked #1–#7 on a ten-person Ember board.
The viewer's account sat on a six-person Volt board.

(Separately: four more approved accounts had never logged in — `approved_students.student_id`
null, `must_change = true`, no consent date, no profile. Those are correctly "Pending" in
Provisioning and are out of scope here.)

## The decision

The board shows the **whole cohort**; the promotion **race stays per-league**.

User directive, 2026-08-07: *"i want all students to be able to see everyone, even in
different leagues just place the league label beside the name or something."*

Two follow-up decisions, both confirmed with the user:

1. **The league race survives.** Divisions, multipliers, `close_week`, `run_rollover` and
   the Monday ceremony are untouched. Only the *view* becomes cohort-wide.
2. **The cohort list ranks on weekly Lumens exactly as stored** — the same number in the
   student's own balance and on the home HUD. Not de-multiplied.

### The multiplier, stated plainly

`DIVISION_MULTIPLIERS = [1.0, 1.1, 1.25, 1.5, 2.0]` (`tools/gamification/league.py`)
scales every Lumen earned. That module's comment justifies it on the grounds that "a
student is only ever ranked against their OWN division" — which this change makes false
for the *displayed list*. It stays true for everything consequential: promotion is decided
by rank inside a division, so no multiplier buys a promotion.

The accepted cost is that on the cohort list a higher league out-scores an equal effort in
a lower one. This is disclosed by the league chip on every row and by the trophy road
already in the rules sheet. In the live data it is currently not even decisive — the new
Ember students' 520/474/360 top Volt's best at 505.

**This paragraph supersedes the `league.py` comment's claim.** Update that comment as part
of implementation so the code does not assert something the app no longer does.

## What changes

### 1. The list is the cohort

`rank_entries(profiles, names, ..., division=None)` ranks everyone together. This code path
already exists and is tested — it is the pre-migration-016 fallback — so no new ranking
logic is written. Rank numbers become cohort-wide.

### 2. Every row carries a league chip

The division name in its own hue, reusing the existing tier colour tokens from
`leaderboard.css` and `components/leaderboard/Tiers.tsx`. No new palette, no new hex.
`LeaderboardEntry.division` is already on the payload and already typed.

### 3. The race moves wholly into the head

`TierBand` gains an explicit standing line: **"#2 of 6 in Volt · 120 Lumens to the
promotion zone"**.

`computeChase` is **unchanged**. It is fed a league slice derived on the client:

```ts
entries.filter((e) => e.division === myDivision)   // then renumbered 1..n
```

This is correct with zero extra payload because the cohort sort key `(-xp, name.lower())`
is the same key the division sort used, so filtering preserves relative order exactly. The
renumbered slice *is* the league standing.

### 4. The podium becomes the cohort podium

Top 3 across every league — still a true 1-2-3, so `splitPodium`'s "an underfilled podium
is no podium" rule still holds unchanged.

Its caption must stop claiming promotion. Today the stage says "Top 3 promote to Volt",
which was deliberate (2026-08-04: "the ceremony and the mechanic are one object"). On a
mixed board that identity is false, so the caption names what the stage now is — the
week's top three across every league — and the promotion claim lives in the head instead.

### 5. The promotion zone and cut line are withheld on the cohort list

`PromotionZone` + `PromotionLine` draw a *contiguous* gold region ended by a struck cut.
Your league's promotion slots are no longer contiguous on a mixed list, so the region
cannot be drawn honestly.

Replaced by a per-row flag: the ≤3 rows of **your** league sitting in its promotion zone
keep the existing gold `promo` treatment. `LeagueRow` already takes `promo` as a boolean,
so this is a change of how the flag is computed, not new styling.

**Orphans this creates, to be removed in the same change** (CLAUDE.md: remove only the
orphans your change created). `promotionLineIndex` is called from exactly one place —
`const lineAt = role ? null : promotionLineIndex(...)` — i.e. only on the unfiltered board,
which is the view being replaced. It therefore loses *all* callers, not just one: the
role-filtered path never called it. Going with it:

- `promotionLineIndex` and its unit tests in `frontend/tests/`;
- the `PromotionZone` and `PromotionLine` exports in `components/leaderboard/LeagueRow.tsx`
  and their CSS, which have no other consumer;
- `lineAt` and `showCut` in `screens/Leaderboard.tsx`, and the four things derived from
  them — the `promo` prop, the `YouBar` promo flag, and the promotion-zone branch of the
  auto-scroll skip. All are re-derived from league membership instead.

Keep `splitPodium`, `computeChase`, `arrowFor` and `nextRungPayoff` — all still called.

### 6. Unchanged

- `data-tier` canvas tint stays the **viewer's own** division colour — identity, not content.
- The role lens stays a server-side view filter. On a filtered view the podium is withheld
  exactly as today, and the head's league line is withheld too: a filtered payload cannot
  derive the league slice honestly.
- `pool_size` / `promote_count` keep describing the viewer's real division. They are
  computed from `profiles`, not from `entries`, so that logic survives as-is. They now feed
  the head's league line rather than the list's caption.
- Home's rank strip (`tools/api/routers/home.py`) stays the league race, so it and the
  board's head state the same standing.
- `run_rollover`, `close_week`, `league_week`, `league_seal`, the Monday ceremony.

### 7. The lens strip counts the cohort, not the division

Two exact strings, because the current ones name a population the list no longer shows:

- The **"All" chip** count reads `data?.pool_size || entries.length` today — the *division*
  pool. It becomes the cohort count. On the unfiltered read that is exactly
  `entries.length`, so no new payload field is needed; the existing `roleCounts` ref
  already remembers per-role counts across a filtered read and needs no change.
- `.lb-count-sm` (the 390px wording) reads **"N in your division"**. It becomes
  **"N in the cohort"**. `.lb-count-lg` ("Ranked by Lumens earned this week") is already
  true of the cohort list and stays verbatim.

The empty-list copy also names the division — *"That's the whole division this week"* — and
becomes the cohort equivalent. The no-rows-at-all copy ("No one's on the board yet") is
unchanged.

## The one migration-ish concern: movement arrows

`rank_delta` compares the live rank against `rank_prev`, stamped once a day
(`tools/api/routers/student.py`, the `take_seal("day:…")` block). That snapshot currently
loops **per division**. It becomes one cohort-wide pass.

Values already stored are per-division and therefore on a different scale. A student ranked
#2 in Volt and #7 across the cohort would render **▼5** having done nothing.

**Decision: clear `rank_prev` once on deploy.** `arrowFor` already treats "no snapshot" as a
distinct, honest state ("· New this week") deliberately different from a flat dash, so this
needs no new code — one `UPDATE student_profiles SET rank_prev = NULL, rank_prev_day = NULL`
coordinated with the push. Arrows resume from the first cohort-wide snapshot the next day.

This is the "ships before out-of-band setup" case in CLAUDE.md: harmless if the UPDATE is
late (one day of odd arrows), so it does not gate the deploy, but it must be run.

## Two rank numbers

A student sees **#7** on the list and **#2 of 6 in Volt** in the head. This is the accepted
cost of showing everyone while keeping the race — the motorsport convention of an overall
position and a class position. Both are labelled with what they measure. The head says
"in Volt"; the list is captioned as the whole cohort.

## Testing

Backend (`tests/`, pytest):
- `/api/leaderboard` returns every visible profile regardless of division, for a viewer in
  any division. This is the regression test for the reported bug — it must fail before the
  change.
- `pool_size` / `promote_count` still describe the viewer's own division, not the cohort.
- The daily snapshot writes one cohort-wide rank per student, not a per-division rank.
  Assert a student who is #1 in their division but #4 overall is stamped 4.

Frontend (`frontend/tests/`, Node harnesses):
- The league slice derivation: filtering the cohort list by division and renumbering
  reproduces the division standing, including ties.
- `promo` is set for your own league's top `promote_count` rows and for nobody else's —
  specifically NOT for another league's leaders.
- `league_assert` still counts ≥8 ranks visible (the existing gate; a cohort board has more
  rows, so this should get easier, not harder).

## Criterion changed (design-lock)

The League lock is refined, not rebuilt. The criterion being changed is **"the board is
your division"** → **"the board is the cohort; the race is your division"**. Three lock
statements follow from it and must be amended in `docs/design-locks.md`:

- the podium is the promotion set → the podium is the cohort's top three;
- the promotion zone is a filled contiguous region ended by a struck cut → it is a per-row
  state on your own league's rows;
- the lens strip captioned "N in your division" → "N in the cohort" (see §7).

Everything else in the lock — the STRUCK arcade material, the lip ladder, the hue-is-identity
rule, the >0.7 stage doctrine, the ranks-visible budget — is untouched.
