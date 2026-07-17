# First-login order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder a brand-new student's first login to password → tooltips tour → Eyecon Studio → check-in, and fix the password step, which today renders last (on `/dashboard`) instead of first.

**Architecture:** One pure function, `onboardingStage()`, owns the order and is read by both `CheckInGuard` (which redirects to the current stage) and `TourProvider` (which fires the tour). Server truth `avatar.customized === false` is the per-account first-run signal; device-local `tourSeen` only splits tour-vs-Studio *within* a first run. `TourProvider` gains a context so the guard can suppress its redirects while the tour drives its own cross-route walk.

**Tech Stack:** Next.js 16 (App Router, `output: standalone`), React 19, TypeScript, TanStack Query. Tests: plain Node asserts run under Node 24 native type-stripping (no runner dep) + Playwright behavioural harnesses.

**Spec:** `docs/superpowers/specs/2026-07-17-first-login-order-design.md`

**Baseline:** this worktree is detached at `origin/main` @ `13e83d4`. The main checkout at `C:\Users\caleb\OneDrive\Desktop\SNEC_AI_CHATBOT` is 87 commits behind and is **not** prod — do not read or edit it.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `frontend/src/screens/onboarding.ts` | **The order.** Pure, no React/DOM. The single place the sequence is encoded. | Create |
| `frontend/tests/onboarding_order_test.mjs` | Exhaustive pure tests over `onboardingStage`. | Create |
| `frontend/src/aurora/tour/tourSteps.ts` | Tour model: steps, copy, `shouldStartTour`. | Modify |
| `frontend/tests/tour_engine_test.mjs` | Pure tests over the tour model. Two cases invert. | Modify |
| `frontend/src/aurora/tour/TourProvider.tsx` | Tour controller **+ new `TourContext`**; wraps children. | Modify |
| `frontend/src/app/providers.tsx` | Provider chain — `TourProvider` becomes a wrapper, not a sibling. | Modify |
| `frontend/src/screens/CheckInGuard.tsx` | Renders/redirects to the current stage. | Modify |
| `frontend/src/screens/OnboardingScreen.tsx` | Login screen — revive the dead forced-password branch. | Modify |
| `frontend/src/aurora/screens/Dashboard.tsx` | Drop the forced-password mount (the guard owns it). | Modify |
| `frontend/src/aurora/screens/EyeconStudio.tsx` | Drop the `removeItem` hack; save hands off to `/checkin`. | Modify |
| `frontend/src/screens/AuthContext.tsx` | Purge user-scoped state on the `/me` failure path. | Modify |
| `frontend/tests/tour_assert.mjs` | Playwright tour harness — premises invert. | Modify |
| `frontend/tests/eyecon_assert.mjs` | Playwright Studio-gate harness — order changes. | Modify |
| `.github/workflows/ci.yml` | Wire the two pure suites into CI. | Modify |

---

### Task 1: The pure order model

**Files:**
- Create: `frontend/src/screens/onboarding.ts`
- Test: `frontend/tests/onboarding_order_test.mjs`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/onboarding_order_test.mjs`:

```js
/* Pure-logic tests for the first-login order. No test runner / deps — plain Node asserts.
   Run: node --experimental-strip-types frontend/tests/onboarding_order_test.mjs
   (Node 24 runs the imported .ts via native type-stripping.) */
import assert from "node:assert/strict";
import { onboardingStage } from "../src/screens/onboarding.ts";

let passed = 0;
const it = (name, fn) => { fn(); passed++; console.log("  ✓", name); };

/* A brand-new student the instant they authenticate: temp password, no Eyecon,
   no tour, no check-in. */
const fresh = { mustChangePassword: true, customized: false, tourSeen: false, isCheckInDone: false };
/* A student who finished onboarding, back the next morning. */
const returning = { mustChangePassword: false, customized: true, tourSeen: true, isCheckInDone: false };

// --- the happy path, in order ---
it("1. a brand-new student is asked for a password first", () =>
  assert.equal(onboardingStage(fresh), "password"));
it("2. then the tour", () =>
  assert.equal(onboardingStage({ ...fresh, mustChangePassword: false }), "tour"));
it("3. then the Eyecon Studio", () =>
  assert.equal(onboardingStage({ ...fresh, mustChangePassword: false, tourSeen: true }), "studio"));
it("4. then the check-in", () =>
  assert.equal(onboardingStage({ ...fresh, mustChangePassword: false, tourSeen: true, customized: true }), "checkin"));
it("5. then the app", () =>
  assert.equal(onboardingStage({ mustChangePassword: false, customized: true, tourSeen: true, isCheckInDone: true }), "app"));

// --- password outranks everything ---
it("password outranks the Studio", () =>
  assert.equal(onboardingStage({ ...fresh, tourSeen: true }), "password"));
it("password outranks a returning student's check-in", () =>
  assert.equal(onboardingStage({ ...returning, mustChangePassword: true }), "password"));
it("password outranks a still-loading avatar", () =>
  assert.equal(onboardingStage({ ...fresh, customized: undefined }), "password"));

// --- the returning student is untouched by the first-run rungs ---
it("a returning student goes straight to the check-in", () =>
  assert.equal(onboardingStage(returning), "checkin"));
it("a returning student who checked in today reaches the app", () =>
  assert.equal(onboardingStage({ ...returning, isCheckInDone: true }), "app"));
it("a returning student on a NEW device does not replay the tour", () =>
  // empty localStorage ⇒ tourSeen false, but customized===true ⇒ not first-run.
  assert.equal(onboardingStage({ ...returning, tourSeen: false, isCheckInDone: true }), "app"));

// --- loading: never guess "returning" while server truth is in flight ---
it("waits while the avatar is still loading", () =>
  assert.equal(onboardingStage({ mustChangePassword: false, customized: undefined, tourSeen: false, isCheckInDone: false }), "loading"));
it("waits even when a stale device flag says the tour was seen", () =>
  // The hole a tourSeen shortcut would open: a first-run student reloading between
  // tour-finish and Studio-save must NOT be sent to the check-in ahead of the Studio.
  assert.equal(onboardingStage({ mustChangePassword: false, customized: undefined, tourSeen: true, isCheckInDone: false }), "loading"));

// --- reload mid-onboarding resumes at the right rung ---
it("a reload after the tour resumes at the Studio, not the check-in", () =>
  assert.equal(onboardingStage({ mustChangePassword: false, customized: false, tourSeen: true, isCheckInDone: false }), "studio"));
it("a reload mid-tour resumes at the tour", () =>
  assert.equal(onboardingStage({ mustChangePassword: false, customized: false, tourSeen: false, isCheckInDone: false }), "tour"));
it("a first-run student who somehow checked in still owes the tour", () =>
  // isCheckInDone is device-local: another account on this device may have checked in
  // today. It must never let a new student skip the tour or the Studio.
  assert.equal(onboardingStage({ mustChangePassword: false, customized: false, tourSeen: false, isCheckInDone: true }), "tour"));

console.log(`\n${passed} onboarding-order checks passed.`);
```

- [ ] **Step 2: Run test to verify it fails**

Run from `frontend/`: `node --experimental-strip-types tests/onboarding_order_test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `../src/screens/onboarding.ts`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/screens/onboarding.ts`:

```ts
/* First-login order — pure model. No React, no DOM: unit-tested directly
   (frontend/tests/onboarding_order_test.mjs) and read by both CheckInGuard and
   TourProvider. The order a brand-new student meets the gates in lives HERE and
   nowhere else: password → tour → Eyecon Studio → daily check-in → app.
   See docs/superpowers/specs/2026-07-17-first-login-order-design.md. */

export type Stage = "loading" | "password" | "tour" | "studio" | "checkin" | "app";

export interface StageInput {
  /** The account still holds an admin-issued temp password (`must_change`). */
  mustChangePassword: boolean;
  /** Server truth from GET /api/avatar — the per-account first-run signal.
      undefined = still loading. */
  customized: boolean | undefined;
  /** Device-local: the first-run tour ran to completion. Splits tour-vs-Studio
      WITHIN a first run; never used to detect one (a new device would look fresh). */
  tourSeen: boolean;
  /** Device-local, per calendar day. */
  isCheckInDone: boolean;
}

/** The one gate the student is standing at right now. */
export function onboardingStage(i: StageInput): Stage {
  if (i.mustChangePassword) return "password";
  // `customized` is the only per-account first-run signal, so nothing below it can be
  // decided without it. Guessing "returning" here is exactly what puts a brand-new
  // student on the check-in first — the bug this ordering exists to fix.
  if (i.customized === undefined) return "loading";
  if (i.customized === false) return i.tourSeen ? "studio" : "tour";
  if (!i.isCheckInDone) return "checkin";
  return "app";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `frontend/`: `node --experimental-strip-types tests/onboarding_order_test.mjs`
Expected: PASS — `16 onboarding-order checks passed.`

- [ ] **Step 5: Wire it into CI**

Modify `.github/workflows/ci.yml`, the `Logic harnesses (type-stripped unit tests)` step. Replace:

```yaml
        run: |
          node --experimental-strip-types tests/greeting_assert.mjs
          node --experimental-strip-types tests/tutor_greeting_assert.mjs
          node --experimental-strip-types tests/leaderboard_logic.mjs
```

with:

```yaml
        run: |
          node --experimental-strip-types tests/greeting_assert.mjs
          node --experimental-strip-types tests/tutor_greeting_assert.mjs
          node --experimental-strip-types tests/leaderboard_logic.mjs
          node --experimental-strip-types tests/onboarding_order_test.mjs
          node --experimental-strip-types tests/tour_engine_test.mjs
```

Why: these two suites pin the first-login order and ran in neither CI nor
`scripts/start-harness.sh`. Without this the order can regress silently.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/screens/onboarding.ts frontend/tests/onboarding_order_test.mjs .github/workflows/ci.yml
git commit -m "feat(onboarding): pure onboardingStage() owns the first-login order

password → tour → Studio → check-in, encoded once and CI-gated. Server truth
avatar.customized===false is the per-account first-run signal; tourSeen only
splits tour-vs-Studio within a first run.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Fire the tour while the Eyecon is uncustomized

**Files:**
- Modify: `frontend/src/aurora/tour/tourSteps.ts:66-86`
- Test: `frontend/tests/tour_engine_test.mjs:34-42`

- [ ] **Step 1: Write the failing test**

In `frontend/tests/tour_engine_test.mjs`, replace the whole `shouldStartTour` block
(lines 34-42, from `// --- shouldStartTour(...)` through the `unauthenticated` case) with:

```js
// --- shouldStartTour(...) — the show-once gate ---
// The tour is the first stop AFTER the password step, so it fires while the Eyecon is
// still uncustomized (customized === false is the per-account first-run signal).
const base = { isAuthenticated: true, customized: false, seen: false, pathname: "/dashboard" };
it("fires for a first-run student on the dashboard", () => assert.equal(shouldStartTour(base), true));
it("never re-fires once seen (show-once invariant)", () => assert.equal(shouldStartTour({ ...base, seen: true }), false));
it("waits while the avatar is still loading (customized undefined)", () => assert.equal(shouldStartTour({ ...base, customized: undefined }), false));
it("does not fire once the Eyecon is customized (onboarding already done)", () => assert.equal(shouldStartTour({ ...base, customized: true }), false));
it("does not replay for a returning student on a fresh device (seen false, customized true)", () => assert.equal(shouldStartTour({ ...base, customized: true, seen: false }), false));
it("does not fire off the dashboard hub", () => assert.equal(shouldStartTour({ ...base, pathname: "/chat" }), false));
it("does not fire when unauthenticated", () => assert.equal(shouldStartTour({ ...base, isAuthenticated: false }), false));
```

Note the two deletions: the old `:39` ("does not fire before the Eyecon gate is passed
(customized false)") and `:41` ("does not fire before daily check-in") assert the exact
opposite of the new order. `isCheckInDone` leaves the gate entirely.

- [ ] **Step 2: Run test to verify it fails**

Run from `frontend/`: `node --experimental-strip-types tests/tour_engine_test.mjs`
Expected: FAIL on "fires for a first-run student on the dashboard" — `Expected values to be strictly equal: false !== true` (the current gate requires `customized === true`).

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/aurora/tour/tourSteps.ts`, replace lines 66-86 (`TourGateInput` through the end of `shouldStartTour`) with:

```ts
export interface TourGateInput {
  isAuthenticated: boolean;
  customized: boolean | undefined;
  seen: boolean;
  pathname: string;
}

/** Whether the first-run tour should start right now. The tour is the first stop after
    the password step, so it runs while the Eyecon is still uncustomized —
    `customized === false` is SERVER truth and the per-account first-run signal
    (docs/superpowers/specs/2026-07-17-first-login-order-design.md). Strictly false:
    undefined = still loading ⇒ don't fire, mirroring CheckInGuard's flash-loop guard.
    Keying off the server flag rather than device-local `seen` alone also stops a
    returning student on a new device replaying the tour. */
export function shouldStartTour(i: TourGateInput): boolean {
  return (
    i.isAuthenticated === true &&
    i.customized === false &&
    i.seen === false &&
    i.pathname === "/dashboard"
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `frontend/`: `node --experimental-strip-types tests/tour_engine_test.mjs`
Expected: PASS. (`TourProvider.tsx` still passes `isCheckInDone` — an excess property on
a call-site object literal, which TypeScript flags. Task 3 fixes it; typecheck is not
green until then. Do not `npm run typecheck` between these two tasks.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/tour/tourSteps.ts frontend/tests/tour_engine_test.mjs
git commit -m "feat(tour): fire the tour while the Eyecon is uncustomized

The tour now precedes the Studio, so gate it on customized===false and drop the
isCheckInDone precondition. Also stops a returning student on a new device
(empty localStorage) replaying the tour.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Publish tour state to the guard

The guard must know when the tour is driving, or it will bounce the tour off its own
cross-route steps (`/chat`, `/cases`, `/flashcards`, `/leaderboard`). `TourProvider` is
currently a **sibling** of `children`, so it must become a wrapper.

**Files:**
- Modify: `frontend/src/aurora/tour/TourProvider.tsx` (whole file)
- Modify: `frontend/src/app/providers.tsx:33-38`

- [ ] **Step 1: Rewrite TourProvider**

Replace `frontend/src/aurora/tour/TourProvider.tsx` entirely:

```tsx
"use client";
/* First-run grand tour controller. Runs the cross-route walkthrough exactly once
   (localStorage eyebot_tour_seen) and publishes its state to CheckInGuard via
   TourContext: the guard suppresses its own redirects while `active` (the tour walks
   /chat, /cases, /flashcards, /leaderboard under its own steam), and re-renders off
   `seen` to hand the student on to the Studio the moment the tour ends. Wraps children
   inside AuthProvider so it survives route changes and never remounts. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/screens/AuthContext";
import { useAvatar } from "@/hooks/useAvatar";
import { TourOverlay } from "./TourOverlay";
import { activeSteps, shouldStartTour, TOUR_KEY, type TourStep } from "./tourSteps";

/* Module scope: guards against a double-start across re-renders within one page load.
   A hard reload resets it, so reloading mid-tour restarts the walk from step 0. */
let startedThisLoad = false;

function readSeen(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(TOUR_KEY) === "true"; } catch { return false; }
}

export interface TourState {
  /** The tour is on screen and driving navigation — the guard must not redirect. */
  active: boolean;
  /** The tour has run to completion on this device. */
  seen: boolean;
}

const TourContext = createContext<TourState>({ active: false, seen: false });

/** Read by CheckInGuard. The default is safe: a guard rendered outside the provider
    behaves as though the tour never ran. */
export function useTour(): TourState {
  return useContext(TourContext);
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const { data: avatar } = useAvatar(isAuthenticated);
  const pathname = usePathname();
  const router = useRouter();

  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  /* Mirrored into React state because a bare localStorage read is not reactive: the
     guard needs to re-render the instant end() writes the flag. */
  const [seen, setSeen] = useState(readSeen);

  /* Start gate — fire once, on the dashboard hub, while the Eyecon is uncustomized. */
  useEffect(() => {
    if (steps || startedThisLoad) return;
    if (shouldStartTour({ isAuthenticated, customized: avatar?.customized, seen, pathname })) {
      startedThisLoad = true;
      setSteps(activeSteps(user?.role));
      setIndex(0);
    }
  }, [steps, seen, isAuthenticated, avatar?.customized, pathname, user?.role]);

  const end = useCallback(() => {
    try { localStorage.setItem(TOUR_KEY, "true"); } catch { /* storage disabled — session-only */ }
    setSeen(true);
    setSteps(null);
    setIndex(0);
  }, []);

  const next = useCallback(() => {
    if (!steps) return;
    const ni = index + 1;
    if (ni >= steps.length) { end(); return; }
    const target = steps[ni];
    if (target.route !== pathname) router.push(target.route);
    setIndex(ni);
  }, [steps, index, pathname, router, end]);

  return (
    <TourContext.Provider value={{ active: steps !== null, seen }}>
      {children}
      {steps && <TourOverlay steps={steps} index={index} onNext={next} onEnd={end} />}
    </TourContext.Provider>
  );
}
```

- [ ] **Step 2: Make it wrap children**

In `frontend/src/app/providers.tsx`, replace lines 33-37:

```tsx
          <RewardProvider>
            <div style={{ position: "relative", minHeight: "100%" }}>{children}</div>
          </RewardProvider>
          <TourProvider />
          <Toaster position="bottom-right" />
```

with:

```tsx
          <RewardProvider>
            {/* Wraps children (not a sibling) so CheckInGuard can read tour state and
                suppress its redirects while the tour drives its own cross-route walk. */}
            <TourProvider>
              <div style={{ position: "relative", minHeight: "100%" }}>{children}</div>
            </TourProvider>
          </RewardProvider>
          <Toaster position="bottom-right" />
```

- [ ] **Step 3: Verify the pure suites still pass and typecheck is green**

Run from `frontend/`:
```
node --experimental-strip-types tests/tour_engine_test.mjs
npm run typecheck
```
Expected: both PASS. Typecheck green confirms the `isCheckInDone` call-site removed in
Task 2 is now consistent.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/tour/TourProvider.tsx frontend/src/app/providers.tsx
git commit -m "feat(tour): publish tour state via context; provider wraps children

CheckInGuard needs to know the tour is driving so it doesn't bounce the walk off
/chat, /cases, /flashcards, /leaderboard. Flipping active=false on end() also
re-renders the guard so it re-reads seen and hands on to the Studio.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: The guard routes to the current stage

**Files:**
- Modify: `frontend/src/screens/CheckInGuard.tsx` (whole file)

- [ ] **Step 1: Rewrite CheckInGuard**

Replace `frontend/src/screens/CheckInGuard.tsx` entirely:

```tsx
import React from "react";
import { Navigate, useLocation } from "@/lib/nav";
import { useAuth } from "./AuthContext";
import { useAvatar } from "@/hooks/useAvatar";
import { useTour } from "@/aurora/tour/TourProvider";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { onboardingStage } from "./onboarding";

/** DEV: force the first-run Eyecon onboarding (the welcome Studio) to appear on EVERY page
 *  load — not just the genuine first login — so the customization screen is easy to iterate
 *  on. Automatically ON under `next dev`; on a production build (Render / the harness) it
 *  stays OFF (real students see the normal show-once flow) unless you opt in per-device with
 *  `localStorage.eyebot_always_studio = "1"`. Set it to "0" (or delete it) to turn back off. */
function devAlwaysStudio(): boolean {
  if (typeof window === "undefined") return false;
  const flag = localStorage.getItem("eyebot_always_studio");
  if (flag === "1") return true;
  if (flag === "0") return false;
  return process.env.NODE_ENV !== "production";
}

/** Resets on every hard reload (module scope), so in dev-always mode the welcome Studio
 *  shows once per load and Save can still navigate away without the guard bouncing you
 *  straight back into it. */
let studioShownThisLoad = false;

function Spinner() {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page)" }}>
      <span className="spinner spinner--teal" aria-label="Loading" />
    </div>
  );
}

/** Holds every authenticated route to the first-login order — password → tour → Eyecon
 *  Studio → daily check-in → app. The order itself lives in ./onboarding.ts; this
 *  component only renders or redirects to whichever stage that returns. Trainers/admins
 *  are learners too (D7): every authenticated role runs the same gates. */
export function CheckInGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isCheckInDone, loading, user, setMustChangePassword } = useAuth();
  const location = useLocation();
  // The avatar query is shared/deduped with the rest of the app.
  const { data: avatar, isError: avatarError } = useAvatar(isAuthenticated);
  const { active: tourActive, seen: tourSeen } = useTour();

  // Landing on /studio (however you got there) counts as "shown" this load, so leaving it
  // in dev-always mode doesn't immediately redirect you back.
  const devAlways = devAlwaysStudio();
  React.useEffect(() => {
    if (devAlways && location.pathname === "/studio") studioShownThisLoad = true;
  }, [devAlways, location.pathname]);

  if (loading) return <Spinner />;

  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  /* DEV-only: jump straight to the welcome Studio once per hard load, ahead of the real
     sequence, so it stays easy to iterate on. */
  if (devAlways && !studioShownThisLoad && location.pathname !== "/studio") {
    return <Navigate to="/studio?welcome=1" replace />;
  }

  /* An unreachable avatar API fails OPEN to the returning-student path rather than
     stranding anyone on a spinner; a genuine first-run student retries next load.
     queryClient bounds the wait (networkMode offlineFirst, retry < 2). */
  const stage = onboardingStage({
    mustChangePassword: user?.mustChangePassword === true,
    customized: avatarError ? true : avatar?.customized,
    tourSeen,
    isCheckInDone,
  });

  if (stage === "loading") return <Spinner />;

  /* A real gate now: it sits above every other stage on EVERY route, so a student can't
     navigate out of it (it used to render only on /dashboard, i.e. dead last). */
  if (stage === "password") {
    return <>{children}<ChangePasswordModal forced onSuccess={() => setMustChangePassword(false)} /></>;
  }

  /* The tour drives its own cross-route walk — never redirect while it's on screen, only
     steer the student to the hub it starts from. */
  if (stage === "tour") {
    return tourActive || location.pathname === "/dashboard"
      ? <>{children}</>
      : <Navigate to="/dashboard" replace />;
  }

  /* Mandatory first-run Eyecon onboarding: a student who has never customized their Eyecon
     is routed into the welcome Studio and CANNOT leave until they Save (which flips
     `customized` server-side — the one and only exit). */
  if (stage === "studio") {
    return location.pathname === "/studio"
      ? <>{children}</>
      : <Navigate to="/studio?welcome=1" replace />;
  }

  if (stage === "checkin") {
    return location.pathname === "/checkin"
      ? <>{children}</>
      : <Navigate to="/checkin" replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Verify typecheck**

Run from `frontend/`: `npm run typecheck`
Expected: PASS. If it errors on `setMustChangePassword` not existing on the auth context,
stop — that means `AuthContextType` doesn't expose it; check `AuthContext.tsx` (it is
consumed the same way by `ChangePasswordModal.tsx:15`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/screens/CheckInGuard.tsx
git commit -m "feat(onboarding): guard routes to the current stage

Replaces the check-in and Studio redirects with one switch over onboardingStage.
The password rung now sits above every stage on every route, making it a real
gate instead of a modal the student could navigate away from.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: The four supporting edits

Each is small; together they make the order real end-to-end.

**Files:**
- Modify: `frontend/src/screens/OnboardingScreen.tsx:134-138`
- Modify: `frontend/src/aurora/screens/Dashboard.tsx:87-89`
- Modify: `frontend/src/aurora/screens/EyeconStudio.tsx:97-111`
- Modify: `frontend/src/screens/AuthContext.tsx:105-113`

- [ ] **Step 1: Revive the dead password branch**

This is the fix that makes "new password" genuinely step 1 — on the login screen, before
any navigation. In `frontend/src/screens/OnboardingScreen.tsx`, replace lines 134-138:

```tsx
      if (data.must_change) {
        login({ fullName: data.full_name ?? email, email: email.trim().toLowerCase(), studentId: data.student_id, role: data.role as "student" | "admin" | "trainer", studentRole: (data.student_role ?? "") as "OA" | "OT" | "PSA" | "", mustChangePassword: true });
        setStep("change_password");
        return;
      }
```

with:

```tsx
      if (data.must_change) {
        /* Claim the screen BEFORE login() makes `user` non-null, or the :103 bounce
           fires on the next render and the forced modal below never gets to mount —
           which is how the password step ended up dead last, on /dashboard. */
        loggingInRef.current = true;
        login({ fullName: data.full_name ?? email, email: email.trim().toLowerCase(), studentId: data.student_id, role: data.role as "student" | "admin" | "trainer", studentRole: (data.student_role ?? "") as "OA" | "OT" | "PSA" | "", mustChangePassword: true });
        setStep("change_password");
        return;
      }
```

- [ ] **Step 2: Drop the Dashboard mount**

In `frontend/src/aurora/screens/Dashboard.tsx`, delete lines 87-89:

```tsx
      {user?.mustChangePassword && (
        <ChangePasswordModal forced onSuccess={() => setMustChangePassword(false)} />
      )}
```

Then remove the now-orphaned import of `ChangePasswordModal`, and remove
`setMustChangePassword` from this file's `useAuth()` destructure — but **only if nothing
else in the file uses them**. Check first:

```bash
grep -n "ChangePasswordModal\|setMustChangePassword\|mustChangePassword" frontend/src/aurora/screens/Dashboard.tsx
```

If `user` is unused afterwards, leave it — it is used elsewhere in the file for the
greeting. `npm run typecheck` in Step 5 catches any orphan.

- [ ] **Step 3: Drop the removeItem hack and hand off to the check-in**

In `frontend/src/aurora/screens/EyeconStudio.tsx`, replace lines 97-111:

```tsx
  const save = () => {
    saveMut.mutate(selectedConfig, {
      onSuccess: () => {
        setCelebrate(true);
        // The first-run (welcome) save is the moment onboarding completes — clear the per-device
        // tour flag so the grand tour fires on the /dashboard landing for THIS new account. The
        // flag can linger "true" from a previous account on a shared browser, which is exactly
        // why a fresh account was landing on the dashboard with no tour.
        if (welcome) { try { localStorage.removeItem("eyebot_tour_seen"); } catch { /* storage off */ } }
        // Re-editing is free now (no paid render), so EVERY save — first-run or a later remix —
        // celebrates briefly, then drops the student straight back home.
        window.setTimeout(() => router.push("/dashboard"), 1000);
      },
    });
  };
```

with:

```tsx
  const save = () => {
    saveMut.mutate(selectedConfig, {
      onSuccess: () => {
        setCelebrate(true);
        // The tour now runs BEFORE the Studio, so the first-run save hands straight on to
        // the last stage — the check-in. (It used to clear eyebot_tour_seen here to force
        // the tour AFTER onboarding; that would now wipe the flag the tour just set. The
        // stale-flag leak it worked around is fixed at its source in AuthContext.)
        // A later remix just drops the student back home.
        window.setTimeout(() => router.push(welcome ? "/checkin" : "/dashboard"), 1000);
      },
    });
  };
```

- [ ] **Step 4: Purge user-scoped state on the /me failure path**

This is the real cross-account leak. In `frontend/src/screens/AuthContext.tsx`, replace
lines 105-113:

```tsx
      } catch {
        if (cancelled) return;
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          return check(attempt + 1);
        }
        sessionStorage.clear();
        localStorage.removeItem("eyebot_user_v1");
        setLoading(false);
      }
```

with:

```tsx
      } catch {
        if (cancelled) return;
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          return check(attempt + 1);
        }
        sessionStorage.clear();
        localStorage.removeItem("eyebot_user_v1");
        /* Drop this account's cached data + onboarding flags too. Without it, an expired
           session leaves eyebot_user_v1 gone, so the NEXT login reads prevId = null, the
           account-switch purge short-circuits, and the previous student's persisted
           ["avatar"] cache (customized: true) + eyebot_tour_seen leak into a brand-new
           account — skipping their Studio gate and their tour. */
        resetUserScopedState();
        setLoading(false);
      }
```

`resetUserScopedState` is already defined at `AuthContext.tsx:63-68`, above this effect.

- [ ] **Step 5: Verify typecheck + the pure suites**

Run from `frontend/`:
```
npm run typecheck
node --experimental-strip-types tests/onboarding_order_test.mjs
node --experimental-strip-types tests/tour_engine_test.mjs
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/screens/OnboardingScreen.tsx frontend/src/aurora/screens/Dashboard.tsx frontend/src/aurora/screens/EyeconStudio.tsx frontend/src/screens/AuthContext.tsx
git commit -m "fix(onboarding): password is step 1 again; Studio hands off to check-in

OnboardingScreen's must_change branch called login() without claiming the screen
via loggingInRef, so the :103 bounce fired before the forced modal could mount —
the step landed dead last on /dashboard, colliding with the tour. The Dashboard
mount goes; the guard owns the modal now.

Also drops EyeconStudio's removeItem (it would wipe the flag the tour just set)
and fixes the leak it worked around at source: the /me failure path now purges
user-scoped state, so an expired session can't leak a prior student's
customized=true into a new account.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Retune the tour copy for its new position

The tour is narrated by the user's live `<Eyecon>` (`TourOverlay.tsx:110`), which before
the Studio is the **default** look — `GET /api/avatar` returns the saved config *or the
default* (`useAvatar.ts:4-6`), so it renders cleanly. The copy should own that rather
than pretend otherwise.

**Files:**
- Modify: `frontend/src/aurora/tour/tourSteps.ts:23-57`

- [ ] **Step 1: Rewrite the four affected steps**

In `frontend/src/aurora/tour/tourSteps.ts`, within `TOUR_STEPS`:

Replace the `welcome` step (lines 24-26):
```ts
  { id: "welcome", route: "/dashboard", target: null,
    title: "Welcome to EyeBot! \u{1F441}️",
    body: "I'm your Eyecon — give me 60 seconds and I'll show you around." },
```
with:
```ts
  { id: "welcome", route: "/dashboard", target: null,
    title: "Welcome to EyeBot! \u{1F441}️",
    body: "I'm your Eyecon, your guide. Give me 60 seconds to show you around — then you'll get to make me your own." },
```

Replace the `streak` step (lines 30-32):
```ts
  { id: "streak", route: "/dashboard", target: '[data-testid="streak-tile"]',
    title: "Keep the flame alive \u{1F525}",
    body: "Show up daily to grow your streak and hit your Lumens goal. Miss a day and it cools." },
```
with:
```ts
  { id: "streak", route: "/dashboard", target: '[data-testid="streak-tile"]',
    title: "Keep the flame alive \u{1F525}",
    body: "Show up daily to grow your streak and hit your Lumens goal — miss a day and it cools. You'll light yours the moment this tour ends." },
```

Replace the `account` step (lines 36-38):
```ts
  { id: "account", route: "/dashboard", target: ".hm-eyeconmenu-btn",
    title: "That's you, up top",
    body: "Your Eyecon lives here — account, password, and logout whenever you need them." },
```
with:
```ts
  { id: "account", route: "/dashboard", target: ".hm-eyeconmenu-btn",
    title: "That's you, up top",
    body: "Your Eyecon will live here once you've built it — along with your account, password, and logout." },
```

Replace the `finish` step (lines 54-56):
```ts
  { id: "finish", route: "/dashboard", target: null, confetti: true,
    title: "You're all set! \u{1F389}",
    body: "That's the tour. Come back daily to feed your streak — let's go!" },
```
with:
```ts
  { id: "finish", route: "/dashboard", target: null, confetti: true,
    title: "Tour complete! \u{1F389}",
    body: "Two quick things and you're in: build your Eyecon, then light your first streak." },
```

The confetti stays — it now celebrates finishing the tour, which is honest, rather than
claiming an onboarding that still has two steps left.

- [ ] **Step 2: Verify the copy invariants still hold**

Run from `frontend/`: `node --experimental-strip-types tests/tour_engine_test.mjs`
Expected: PASS — `every step has a route and non-empty copy` covers these.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/tour/tourSteps.ts
git commit -m "feat(tour): retune copy for the tour's new slot before the Studio

The narrator is the default Eyecon now (the student builds theirs next), and the
finale hands off to the Studio + check-in instead of claiming 'You're all set!'
with two mandatory steps still to go.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Update the behavioural harnesses

`tour_assert.mjs` encodes the OLD order in its setup and will fail.
`eyecon_assert.mjs` passes **unchanged** — `seededContext` seeds
`eyebot_tour_seen = "true"` (`_mocks.mjs:144`), so its uncustomized student is at the
`studio` stage exactly as before — but it therefore no longer covers "the tour comes
first", so this task adds that case.

**Files:**
- Modify: `frontend/tests/tour_assert.mjs:1-6,19-24,30-31,78-88`
- Modify: `frontend/tests/eyecon_assert.mjs` (insert a block after line 48)

- [ ] **Step 1: Retarget tour_assert's premises**

In `frontend/tests/tour_assert.mjs`, replace the header (lines 1-6):

```js
/* Behavioral assert for the first-run grand tour (the ACTIVE path; aurora_assert already
   proves it stays dormant when eyebot_tour_seen is seeded). Mirrors the aurora harness mock
   setup but (a) does NOT seed eyebot_tour_seen and (b) mocks /api/avatar as customized, so all
   three onboarding gates are clear and the tour fires on the first /dashboard landing. Drives
   the whole cross-route walkthrough, then verifies show-once persistence.
   Run against a warm standalone server: node frontend/tests/tour_assert.mjs http://127.0.0.1:3000 */
```

with:

```js
/* Behavioral assert for the first-run grand tour (the ACTIVE path; aurora_assert already
   proves it stays dormant when eyebot_tour_seen is seeded). Mirrors the aurora harness mock
   setup but (a) does NOT seed eyebot_tour_seen and (b) mocks /api/avatar as UNCUSTOMIZED.
   The tour is stop 2 of 4 (password → tour → Studio → check-in), so it must fire for a
   student who has neither built an Eyecon nor checked in. Drives the whole cross-route
   walkthrough, then verifies the hand-off to the Studio and show-once persistence.
   Run against a warm standalone server: node frontend/tests/tour_assert.mjs http://127.0.0.1:3000 */
```

Replace lines 19-24 (inside `addInitScript`):

```js
  localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
  localStorage.setItem("eyebot_checkin_date", new Date().toLocaleDateString("en-CA"));
  localStorage.setItem("eyebot_rail_pinned", "1");
  // NB: a fresh context has no eyebot_tour_seen, so the first load is genuinely first-run.
  // We deliberately do NOT clear it here — that would also wipe the value the app persists on
  // finish, breaking the show-once reload check below.
```

with:

```js
  localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
  localStorage.setItem("eyebot_rail_pinned", "1");
  // NB: no eyebot_checkin_date — the tour now PRECEDES the check-in, so it must fire for a
  // student who hasn't checked in. And a fresh context has no eyebot_tour_seen, so the first
  // load is genuinely first-run; we deliberately do NOT clear it here, which would also wipe
  // the value the app persists on finish and break the show-once reload check below.
```

Replace lines 30-31:

```js
// customized avatar → satisfies the third gate AND feeds the Eyecon narrator avatar.
await ctx.route("**/api/avatar", (r) => r.fulfill(JSON_OK({ config: {}, axes: {}, customized: true })));
```

with:

```js
// UNCUSTOMIZED avatar → server truth, and the per-account first-run signal that fires the
// tour. The Eyecon narrator falls back to the default look — exactly what a new student sees
// before they reach the Studio.
await ctx.route("**/api/avatar", (r) => r.fulfill(JSON_OK({ config: {}, axes: {}, customized: false })));
```

- [ ] **Step 2: Assert the hand-off and the resume**

In `frontend/tests/tour_assert.mjs`, replace lines 78-88:

```js
// 3) Finale label + end + persistence.
check((await page.locator('[data-testid="tour-next"]').textContent()) === "Let's go!", "finale CTA reads \"Let's go!\"");
await page.locator('[data-testid="tour-next"]').click();
await tour.waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
check(await tour.count() === 0, "tour ends after the finale");
check(await page.evaluate(() => localStorage.getItem("eyebot_tour_seen")) === "true", "eyebot_tour_seen persisted true on finish");

// 4) Show-once: it does not reappear on reload.
await page.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
check(await tour.count() === 0, "tour does NOT reappear after completion (show-once invariant)");
```

with:

```js
// 3) Finale label + end + persistence + hand-off to the next stage.
check((await page.locator('[data-testid="tour-next"]').textContent()) === "Let's go!", "finale CTA reads \"Let's go!\"");
await page.locator('[data-testid="tour-next"]').click();
await tour.waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
check(await tour.count() === 0, "tour ends after the finale");
check(await page.evaluate(() => localStorage.getItem("eyebot_tour_seen")) === "true", "eyebot_tour_seen persisted true on finish");
// The tour is stop 2 of 4: ending it must hand the student straight to the welcome Studio.
await page.waitForURL((u) => new URL(u).pathname === "/studio", { timeout: 20000 }).catch(() => {});
check(new URL(page.url()).pathname === "/studio", "finishing the tour hands off to the welcome Studio");

// 4) Show-once AND resume-at-the-right-rung: a reload must not replay the tour, and must
//    resume at the Studio — NOT the check-in. This is the hole the "loading" stage closes.
await page.goto(base + "/dashboard", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
check(await tour.count() === 0, "tour does NOT reappear after completion (show-once invariant)");
check(new URL(page.url()).pathname === "/studio", "a reload after the tour resumes at the Studio, not the check-in");
```

- [ ] **Step 3: Add the order case to eyecon_assert**

Block A (`:24-48`) needs **no change**: `seededContext` seeds `eyebot_tour_seen = "true"`
(`_mocks.mjs:144`), so its uncustomized student is past the tour and at the `studio`
stage — the same forced redirect it asserts today. But that means nothing covers the new
ordering, so insert this block immediately after line 48 (the closing `}` of block A/B):

```js
// ── A2) ORDER: the tour comes BEFORE the Studio. A never-customized student who has not yet
//        seen the tour is left on /dashboard to take it; the Studio gate waits its turn. ───
{
  const ctx = await studentCtx(false);
  // seededContext seeds eyebot_tour_seen="true"; drop it so this student is genuinely
  // pre-tour. Init scripts run in the order they were added, so this lands after the seed.
  await ctx.addInitScript(() => { try { localStorage.removeItem("eyebot_tour_seen"); } catch {} });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  if (new URL(p.url()).pathname === "/dashboard") ok("order — uncustomized, untoured student stays on /dashboard for the tour");
  else fail(`order — uncustomized, untoured student was yanked off the tour hub (url=${p.url()})`);
  if ((await p.locator('[data-testid="tour"]').count()) === 1) ok("order — the first-run tour fires before the Studio gate");
  else fail("order — the first-run tour did not fire before the Studio gate");
  await ctx.close();
}
```

Leave blocks B onwards (no-skip escape, Save-is-the-only-exit, logout clears the flag)
untouched — those invariants are unchanged.

- [ ] **Step 4: Run both harnesses**

```bash
bash scripts/start-harness.sh serve      # build + serve a warm standalone server
node frontend/tests/tour_assert.mjs
node frontend/tests/eyecon_assert.mjs
```
Expected: both PASS. `SKIP_BUILD=1` reuses an existing build. Also re-run
`aurora_assert` + `station_assert` — they mock `customized: true` (`_mocks.mjs:73`), so
the new gate can't fire in them and they should stay green untouched.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/tour_assert.mjs frontend/tests/eyecon_assert.mjs
git commit -m "test(onboarding): behavioural harnesses follow the new first-login order

tour_assert's premises inverted (the tour now fires uncustomized, pre-check-in);
eyecon_assert's Studio-gate block splits into tour-first and Studio-after-tour.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Verify the whole sequence end-to-end

Pure tests cannot prove the routing. Drive the real app.

**Files:** none (verification only)

- [ ] **Step 1: Full gates**

Run from the worktree root:
```bash
cd frontend && npm run typecheck && npx next build --webpack
```
Turbopack **panics** on a `node_modules` junction (`Symlink [project]/node_modules is
invalid, it points out of the filesystem root`) — `--webpack` is required in a worktree.
If `node_modules` is absent, copy it rather than `npm ci`:
```bash
robocopy <main-repo>/frontend/node_modules <worktree>/frontend/node_modules /E /MT:32 /NFL /NDL /NJH /NP
```
(robocopy exits 1 on success — check the tree, not the code. Never `Remove-Item -Recurse`
a junction; use `cmd //c rmdir`.)

- [ ] **Step 2: Drive a brand-new student**

Serve the standalone build, then in the browser, for a first-run account
(`customized: false`, no `eyebot_tour_seen`, no `eyebot_checkin_date`):

Confirm this exact sequence, in order:
1. Log in with a `must_change` account ⇒ **"Set your password" modal on the login screen**
   (not on the dashboard).
2. Submit ⇒ lands on `/dashboard` ⇒ **the tour starts**.
3. Advance through every stop — confirm `/chat`, `/cases`, `/flashcards`, `/leaderboard`
   are reachable **and not bounced** mid-walk.
4. Finish the tour ⇒ **pushed to `/studio?welcome=1`**.
5. Save ⇒ **pushed to `/checkin`**.
6. Complete the check-in ⇒ **lands on `/dashboard`**, no tour replay, no modal.

- [ ] **Step 3: Drive a returning student**

Log in as a customized account on a new day. Confirm: no tour, no Studio, straight to the
check-in, then the app. This is the path that must not regress.

- [ ] **Step 4: Reload mid-onboarding**

Hard-reload between tour-finish and Studio-save. Confirm the student resumes at the
**Studio**, not the check-in. This is the hole the `"loading"` stage exists to close.

- [ ] **Step 5: Ship**

```bash
git fetch origin
git rev-list --left-right --count origin/main...HEAD   # confirm origin/main hasn't moved
git push origin HEAD:main
```
Only fast-forward. If `origin/main` moved, rebase this worktree onto it and re-verify —
do **not** force-push. Then `git worktree remove --force <path>` and leave the main
checkout's diverged `main` alone (other sessions own it).
