/* Pure unit test for the in-app leave guard. Run with Node's type stripping
   (leaveGuard.ts is dependency-free, mirrors flashcards_forfeit_logic.mjs):
     node --experimental-strip-types frontend/tests/leave_guard_logic.mjs

   The leave guard lets an active session (a flashcards deck / a virtual-patient
   station) intercept IN-APP navigation — the Atlas Rail links and the ⌘K palette,
   which sit on top of every route — so leaving mid-session routes through the same
   forfeit confirm the in-screen buttons show, instead of silently escaping the
   penalty. Its one invariant: while ARMED, intercept(href) fires the armed handler
   and returns true (caller must cancel the navigation); while disarmed it returns
   false (navigate freely). The forfeit itself stays owned by forfeitGuard.spend(),
   so no combination of routes can double-charge. */
import assert from "node:assert";
import { createLeaveGuard } from "../src/aurora/lib/leaveGuard.ts";

// 1) Disarmed (no active session) ⇒ navigation is never intercepted.
{
  const g = createLeaveGuard();
  assert.strictEqual(g.armed, false);
  assert.strictEqual(g.intercept("/homepage"), false, "disarmed guard must let navigation through");
}

// 2) Armed ⇒ intercept fires the handler with the target href and reports true.
{
  const g = createLeaveGuard();
  let seen = null;
  g.arm((href) => { seen = href; });
  assert.strictEqual(g.armed, true);
  assert.strictEqual(g.intercept("/cases"), true, "armed guard must intercept");
  assert.strictEqual(seen, "/cases", "handler receives the attempted destination");
}

// 3) Every intercept while armed fires — the student can keep trying to leave and each
//    attempt re-opens the confirm; no accidental one-shot latch.
{
  const g = createLeaveGuard();
  let calls = 0;
  g.arm(() => { calls += 1; });
  g.intercept("/a");
  g.intercept("/b");
  assert.strictEqual(calls, 2, "each attempt while armed re-triggers the confirm");
}

// 4) Disarm (session ended / screen unmounted) ⇒ back to free navigation, handler silent.
{
  const g = createLeaveGuard();
  let calls = 0;
  g.arm(() => { calls += 1; });
  g.disarm();
  assert.strictEqual(g.armed, false);
  assert.strictEqual(g.intercept("/homepage"), false, "disarmed guard must not intercept");
  assert.strictEqual(calls, 0, "handler must not fire once disarmed");
}

// 5) Re-arming replaces the handler — the most recently mounted active screen owns
//    interception, never a stale one from a screen that already unmounted.
{
  const g = createLeaveGuard();
  let a = 0, b = 0;
  g.arm(() => { a += 1; });
  g.arm(() => { b += 1; });
  g.intercept("/x");
  assert.strictEqual(a, 0, "stale handler must not fire");
  assert.strictEqual(b, 1, "the most recently armed handler owns interception");
}

console.log("leave_guard_logic: all assertions passed");
