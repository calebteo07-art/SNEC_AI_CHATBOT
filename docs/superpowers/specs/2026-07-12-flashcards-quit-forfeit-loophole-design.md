# Flashcards quit-forfeit loophole — design (2026-07-12)

## Problem
The −20 Lumen forfeit fires from exactly one place: Pause → "Quit game" → confirm →
`quitForfeit()`. A student can dodge it: mid-round, Pause → **Switch deck** (penalty-free,
drops to the topic-selection fan) → **Home** (the quiet exit on selection = `router.push`,
no forfeit). Result: quit a losing round with zero cost. Root cause — the penalty is bound
to one *button*, not to the real invariant: *a round is in progress and you're leaving it
unfinished*.

Uncontrolled escape routes that also skip the forfeit today: browser **Back**, page
**refresh / tab close**, and the **⌘K command palette** (still mounted on the immersive
`/flashcards` shell → can `router.push` to another section).

## Model
A **round is active** from the moment the first study card renders (after the Begin/intro
beat) until the deck is **finished** (`done`). Leaving an active round unfinished — by *any*
route — costs the flat −20, **exactly once per round**. Not active (⇒ free to leave):
topic selection, the Begin/intro card, deck-loading, empty decks, the results screen. That
boundary is the fairness contract: bail before you commit (at Begin) for free; never charged
after you complete.

Coverage chosen: **robust client** (not server-authoritative). Best-effort caveat: a
force-killed mobile app mid-round can still escape; true cross-device airtightness would need
server-side round tracking, deliberately deferred.

## Design

### `forfeitGuard.ts` — one choke point (dependency-free, unit-testable like `tiers.ts`)
```
createRoundForfeit() → {
  setActive(v)      // v && !active ⇒ re-arm (spent=false); records active
  spend(): boolean  // returns true at most once per active round; false if inactive or spent
  active
}
```
**Every** forfeit decision funnels through `spend()`, guaranteeing at-most-once and
only-when-active.

### `Flashcards.tsx` wiring
- Hold one guard in a ref. Effect: `guard.setActive(inStudy)`, where `inStudy` is the exact
  predicate under which the study-stage `return` executes (picker done, not intro, not
  generating, deck non-empty, card present, not done). Paused is a sub-state of study ⇒ still
  active.
- **Controlled exits** (use the `forfeit()` mutation → invalidates `[progress]`):
  - Pause → Quit: `if (guard.spend()) forfeit()` then `router.push('/dashboard')`.
  - **Switch deck**: `if (guard.spend()) forfeit()` then reset to the picker (behavior change).
- **Uncontrolled exits** — one effect:
  - `pagehide` → `guard.spend() && sendBeacon('/api/flashcards/forfeit')` (refresh / tab-close
    / hard nav; best-effort).
  - effect-cleanup (unmount) → same (⌘K palette, browser Back leaving `/flashcards`, any SPA
    nav away — `Flashcards` unmounts).
  - `sendBeacon` carries the HttpOnly cookie same-origin; the endpoint takes no body.
- Deliberately **not** triggered on `visibilitychange`→hidden, so tab-*switching* (peeking
  another tab) never charges.

### `PauseMenu.tsx` — Switch deck warns + charges (design-lock change)
Switching abandons the active round, so it forfeits like quitting. Add a confirm mirroring the
quit-confirm ("Switch decks? You'll forfeit this round — lose 20 Lumens.") so nothing is
deducted silently. After the charge, Home-from-selection is legitimately free ⇒ loophole
sealed.

### Unchanged
Backend `/api/flashcards/forfeit` (flat −20, floors at 0, lifetime `coins_earned` untouched),
complete/finish flow, drill rounds (Pause→Quit already charges in a drill — status quo).

## Tests
1. **Unit** `frontend/tests/flashcards_forfeit_logic.mjs` (mirrors `leaderboard_logic.mjs`,
   `node --experimental-strip-types`): inactive ⇒ `spend()` false; active ⇒ first `spend()`
   true, second false (idempotent); re-activate ⇒ re-armed true; `setActive(false)` ⇒ false.
   Written first, watched fail.
2. **Behavioral** (ship-check): `_mocks.mjs` records POST `/forfeit`; harness asserts
   Switch-deck ⇒ 1 charge, ⌘K→Dashboard mid-round ⇒ 1 charge, complete-then-leave ⇒ 0 charges.
3. Backend `tests/api/test_lumens.py` stays green (endpoint untouched).

## Design-lock delta
`docs/design-locks.md` Flashcards → Pause/Quit bullet: the criterion **"Switch deck is
penalty-free by design"** is changed — it now forfeits (−20, warn-confirm) because penalty-free
Switch deck was the Lumens quit loophole. Quit-forfeit is now bound to the *round-active*
invariant across every exit route, not one button.
