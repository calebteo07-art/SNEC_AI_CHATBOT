# First-login order — password → tour → Studio → check-in

**Date:** 2026-07-17
**Status:** approved (design)
**Baseline:** `origin/main` @ `13e83d4` (local `main` is 87 behind / 60 ahead and is NOT prod)

## Problem

A brand-new student should meet the onboarding steps in this order:

1. create new password
2. tooltips tour
3. Eyecon Studio
4. check-in / streak question

They currently meet them in a different order, and one of the steps is broken.

### What actually happens today

| # | Today (verified) | Wanted |
|---|---|---|
| 1 | check-in | new password |
| 2 | Eyecon Studio | tour |
| 3 | **password** (modal on `/dashboard`) | Eyecon Studio |
| 4 | tour — collides with the password modal | check-in |

The forced password modal is *intended* to render on the login screen
(`OnboardingScreen.tsx:197-206`) but that branch is **dead code**:
`OnboardingScreen.tsx:134-138` calls `login()` (making `user` non-null) and returns
**without** setting `loggingInRef.current = true` (only `completeLogin` does, `:149`).
The next render therefore hits the bounce at `:103`
(`if (user && !loggingInRef.current) return <Navigate to="/dashboard" replace />`)
and leaves before the JSX. The only live mount is `Dashboard.tsx:87-89`, reached **last**.

Consequences:
- The password step lands dead last instead of first.
- It collides with the tour on `/dashboard` — modal `z-index: 200`
  (`ChangePasswordModal.tsx:61`) covers the tour overlay's `100–103` band.
- `onboardNewStudent()` (POST `/api/onboard`, records PDPA consent) is skipped on a
  `must_change` first login; it only fires on the *second* login.

So this is a bug fix, not only a reorder.

### What blocks the new order

1. `tourSteps.ts:78-86` — `shouldStartTour` requires `isCheckInDone === true &&
   customized === true`. Both are **false** in the tour's new slot.
2. `CheckInGuard.tsx:51-53` — the `/checkin` redirect fires on every route, so the
   tour's cross-route steps (`/chat`, `/cases`, `/flashcards`, `/leaderboard` —
   `tourSteps.ts:39-50`) get bounced mid-walk.
3. `CheckInGuard.tsx:62-65` — the Studio redirect fires for any uncustomized user,
   which is every user during the new tour slot.
4. `EyeconStudio.tsx:105` — the welcome save does
   `localStorage.removeItem("eyebot_tour_seen")`, clearing the flag the tour just set.
   It exists to force the tour to fire after onboarding; under the new order the tour
   *precedes* the Studio, so it re-fires a completed tour on the next page load.
5. `OnboardingScreen.tsx:154` — `completeLogin` hardcodes `navigate("/checkin")`,
   landing every login directly on the new step 4.

## Design

### Single source of order

New pure module `frontend/src/screens/onboarding.ts` — no React, no DOM, unit-tested
directly, consumed by both the guard and the tour. Mirrors the existing
`tourSteps.ts` / `tour_engine_test.mjs` precedent.

```ts
export type Stage = "loading" | "password" | "tour" | "studio" | "checkin" | "app";

export interface StageInput {
  mustChangePassword: boolean;
  /** Server truth from GET /api/avatar. undefined = still loading. */
  customized: boolean | undefined;
  tourSeen: boolean;
  isCheckInDone: boolean;
}

export function onboardingStage(i: StageInput): Stage {
  if (i.mustChangePassword)       return "password";
  if (i.customized === undefined) return "loading";
  if (i.customized === false)     return i.tourSeen ? "studio" : "tour";
  if (!i.isCheckInDone)           return "checkin";
  return "app";
}
```

**Why `customized` is the first-run signal.** It is server truth, per-account
(`useAvatar.ts:10-12`), survives device changes, and is terminated naturally by the
Studio save. `tourSeen` (device-local) only splits tour-vs-Studio *within* a first run.
A returning user has `customized === true` and falls straight through to the check-in
rung — byte-identical behaviour to `CheckInGuard.tsx:51-53` today.

**Bonus fix.** Today a returning student on a *new device* (empty localStorage ⇒
`seen === false`, `customized === true`) gets a spurious tour replay. Gating the tour on
`customized === false` makes it genuinely first-run-per-account.

### Guard

`CheckInGuard.tsx:50-65` — replace both redirects with one switch:

```tsx
const stage = onboardingStage({ mustChangePassword, customized, tourSeen, isCheckInDone });
if (stage === "loading")  return <Spinner/>;
if (stage === "password") return <>{children}<ChangePasswordModal forced onSuccess={…} /></>;
if (stage === "tour")     return (tourActive || pathname === "/dashboard")
                                 ? <>{children}</> : <Navigate to="/dashboard" replace/>;
if (stage === "studio")   return pathname === "/studio"  ? <>{children}</> : <Navigate to="/studio?welcome=1" replace/>;
if (stage === "checkin")  return pathname === "/checkin" ? <>{children}</> : <Navigate to="/checkin" replace/>;
return <>{children}</>;
```

Pass `customized: avatarIsError ? true : avatar?.customized` — an unreachable avatar API
**fails open** to the returning path rather than stranding a user on a spinner.
`queryClient.ts:11-14` bounds the wait (`networkMode: "offlineFirst"`, `retry < 2`).

The `password` rung sits above every other rung on every route, so it is a real gate:
the student cannot navigate out of it. This replaces the `Dashboard.tsx:87-89` mount.

### Tour

- `tourSteps.ts` — `shouldStartTour` requires `customized === false`; the
  `isCheckInDone` requirement is dropped.
- `TourProvider.tsx` — exposes `{ active, seen }` via context and **wraps** children
  (today it is a sibling of `children` at `providers.tsx:33-38`, so the guard cannot see it).
- `providers.tsx` — `<TourProvider>` wraps `{children}`.

`tourActive` is load-bearing twice: it stops the guard bouncing the tour off its own
cross-route steps, **and** flipping it false on `end()` re-renders the guard so it
re-reads `tourSeen` and pushes on to the Studio. This works for the natural finish, for
Escape (`TourOverlay.tsx:61`), and on any route. A hard reload mid-tour resets
module-scope `startedThisLoad` (`TourProvider.tsx:14`) ⇒ `tourActive` false ⇒ guard
pushes to `/dashboard` ⇒ tour restarts at step 0. No hole.

### Copy (approved)

The tour is narrated by the user's live `<Eyecon>` (`TourOverlay.tsx:32,110`), which
before the Studio is the **default** look — `GET /api/avatar` returns the saved config
*or the default* (`useAvatar.ts:4-6`), so it renders cleanly. Copy is retuned to own that:

- `welcome` — default Eyecon narrates and says so ("I'll show you around, then you'll
  make me yours").
- `account` (`tourSteps.ts:36-38`) — reworded; it currently says "Your Eyecon lives
  here" while pointing at a look the student has not made.
- `streak` (`:30-32`) — reworded; the streak tile reads empty until the check-in that
  now *follows* the tour.
- `finish` (`:54-56`) — stops claiming "You're all set! 🎉 / That's the tour"; hands off
  to the Studio. `confetti: true` moves off this step to the true end of onboarding.

Tour stays **unskippable** (approved) — unchanged behaviour, only position.

### Supporting edits

| File | Change | Why |
|---|---|---|
| `OnboardingScreen.tsx:136` | `loggingInRef.current = true` | Revives the dead modal ⇒ password is genuinely step 1, on the login screen, before any navigation. Also un-skips `onboardNewStudent`. |
| `Dashboard.tsx:87-89` | delete the forced mount | The guard owns it; avoids a double mount. |
| `EyeconStudio.tsx:105` | delete the `removeItem` | Would clear the flag the tour just set. |
| `EyeconStudio.tsx:108` | save → `/checkin` when `welcome` | Next stage directly; avoids a light-shell frame through `/dashboard` (`(shell)/layout.tsx:16-18` mounts `AppShell` outside the guard, and `lib/nav.ts:37-44` redirects in an effect). |
| `AuthContext.tsx:111` | `resetUserScopedState()` on the `/me` failure path | The real cross-account leak — see below. |
| `CheckInGuard.tsx:11-22` | keep `devAlwaysStudio` as an explicit rung | Otherwise the sequence is untestable under `next dev`. |

**The `AuthContext.tsx:111` leak.** `resetUserScopedState()` (`:63-68`) clears the tour
key *and* the query cache, and is called from `logout()` (`:169`) and from `login()` on
an account switch (`:128`). The residual hole is the `/api/auth/me` failure path
(`:111-112`): it does `sessionStorage.clear(); localStorage.removeItem("eyebot_user_v1")`
but neither. Session expires ⇒ `eyebot_user_v1` gone ⇒ next login reads `prevId = null`
⇒ `:128`'s `prevId &&` short-circuits ⇒ no purge ⇒ the prior account's
`eyebot_tour_seen="true"` **and their persisted `["avatar"]` cache with
`customized: true`** leak into the new account. This is why the `EyeconStudio.tsx:105`
hack existed. Fixing the cause lets us delete the hack rather than invert it.

Rejected: scoping the key to `eyebot_tour_seen:<studentId>`. It breaks 6 seed sites
(`_mocks.mjs:144`, `aurora_assert.mjs:16,728,766,794`, `station_assert.mjs:14`,
`eyecon_assert.mjs:177`) and `tour_engine_test.mjs:44` to fix what one line fixes.

## Accepted tradeoff

`customized === undefined ⇒ "loading"` adds a brief spinner on cold loads, where today
the check-in redirect fires without waiting on the avatar. Correctness wins: any
shortcut past the spinner (e.g. trusting `tourSeen`) reopens a hole where a hard reload
between tour-finish and Studio-save routes the student to check-in **before** the
Studio. The avatar query is one small JSON and is persisted. Fail-open on error bounds
the worst case. Revisit only if measurably slow.

## Testing

Pure (no browser, Node 24 native type-stripping — the `tour_engine_test.mjs` pattern):

- **new** `frontend/tests/onboarding_order_test.mjs` — exhaustive over `onboardingStage`,
  including the full first-run walk password → tour → studio → checkin → app, the
  returning-user path, the reload-mid-onboarding cases, and fail-open on avatar error.
- `frontend/tests/tour_engine_test.mjs` — `:39` ("does not fire before the Eyecon gate
  is passed") and `:41` ("does not fire before daily check-in") assert the **exact
  opposite** of the new order and invert; the `:35` `base` fixture is rewritten.

Behavioural (Playwright, vs a warm standalone server):

- `frontend/tests/tour_assert.mjs` — `:20` seeds `eyebot_checkin_date` and `:31` mocks
  `customized: true` to make the tour fire; both premises invert.
- `frontend/tests/eyecon_assert.mjs` — `:31` asserts an uncustomized student is forced
  to `/studio?welcome=1` (now: the tour first) and `:37` asserts they cannot reach
  `/leaderboard` (now: the tour's `leaderboard` step must go exactly there).

**Process gap — fix as part of this.** `tour_engine_test.mjs`, `tour_assert.mjs`, and
`eyecon_assert.mjs` run in **neither** `scripts/start-harness.sh:71-77` nor
`.github/workflows/ci.yml:51-56`. The three suites that pin gate order are hand-run
only, so this change could land green through `/harness` **and** CI while broken. Wire
`tour_engine_test.mjs` + the new `onboarding_order_test.mjs` into `ci.yml` alongside
`greeting_assert` — both are pure and dependency-free.

The `_mocks`-based harnesses (aurora, station, rotate_gate, flashcards_forfeit,
visual_sweep, mobile_audit) mock `customized: true` (`_mocks.mjs:71-73`), so the new
gate cannot fire in them regardless of their `eyebot_tour_seen` seed — they stay green
without edits.

## Out of scope (flagged, not fixed)

- **No backend enforcement of `must_change`** — no endpoint rejects requests while it is
  true; the gate is client-side only.
- `auth.py:112` defaults `must_change` **True** but `auth.py:150` (`/me`) defaults it
  **False**. `AuthContext.tsx:85` re-seeds from `/me` on every reload, so a hard reload
  can silently drop the password gate. Benign today; load-bearing once password gates
  everything downstream. Worth a follow-up.
- `isCheckInDone` is derived purely from device-local localStorage
  (`AuthContext.tsx:32-39,51`), never from the server. A new user on a device where
  another account checked in today starts `isCheckInDone === true` and skips the
  check-in. Pre-existing; the new order does not worsen it (check-in is now last, so the
  failure is "goes straight to the app" rather than "skips the first gate").

## Ship

Local `main` is diverged (87 behind / 60 ahead of `origin/main`) and carries other
sessions' commits. Ship via the isolated-worktree recipe against `origin/main` — see
`project_concurrent_sessions_isolated_ship`. Turbopack rejects a `node_modules`
junction; build with `next build --webpack` in the worktree.
