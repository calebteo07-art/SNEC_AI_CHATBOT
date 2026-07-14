/* Pure unit test for the homepage content-pool toggle logic (spec §4 + §10 /ship-check).
   poolToggle.ts is dependency-free; run under Node type stripping:
     node --experimental-strip-types frontend/tests/pool_toggle_logic.mjs

   Covers: segment shape, active-pool mapping, the exact invalidation key set, and the
   flip → reload repeat-case (the state invariant: a flipped pool survives a reload). */
import assert from "node:assert";
import { activePool, POOL_SEGMENTS, POOL_INVALIDATE_KEYS } from "../src/aurora/components/home/poolToggle.ts";

// 1) Two loud segments, correct values + labels.
assert.deepStrictEqual(
  POOL_SEGMENTS,
  [{ value: "OA", label: "OA · PSA" }, { value: "OT", label: "OT" }],
  "segments = OA·PSA | OT",
);

// 2) active-pool mapping: OA / PSA / "" → OA clinical pool; only "OT" → OT.
assert.strictEqual(activePool("OA"), "OA", "OA → OA");
assert.strictEqual(activePool("PSA"), "OA", "PSA folds into the OA clinical pool");
assert.strictEqual(activePool(""), "OA", "empty defaults to OA");
assert.strictEqual(activePool("OT"), "OT", "OT → OT");

// 3) exact invalidation set from the naming contract (order-independent).
assert.deepStrictEqual(
  [...POOL_INVALIDATE_KEYS].map((k) => k.join(".")).sort(),
  ["cases", "flashcard-due-count", "flashcard-topics", "flashcards", "leaderboard", "progress"],
  "invalidates every pool-dependent query key",
);

// 4) flip → reload repeat-case. Mirror AuthContext: on a flip the client optimistically
//    persists the pool (sessionStorage mirror) AND the server PATCH stores it; on reload
//    /api/auth/me.student_role (Phase 1: sourced from student_profiles.role) is the source
//    of truth. Simulate the full round-trip and assert the flipped pool survives.
const server = { role: "OA" };                 // server-side student_profiles.role
const store = new Map();                        // sessionStorage mirror ("eyebot_student_role")
function flip(next) {                           // what PoolToggle does on a segment click
  store.set("eyebot_student_role", next);       // AuthContext.setStudentRole mirror
  server.role = next;                           // PATCH /api/profile/role persists it
}
function reload() {                             // AuthContext restore ordering: server wins
  const me = { student_role: server.role };     // /api/auth/me (Phase 1)
  return activePool(me.student_role);
}
assert.strictEqual(reload(), "OA", "starts on OA");
flip("OT");
assert.strictEqual(activePool(store.get("eyebot_student_role")), "OT", "optimistic client flip → OT");
assert.strictEqual(reload(), "OT", "OT pool persists across reload");
flip("OA");
assert.strictEqual(reload(), "OA", "flip back to OA persists (repeat case is stable)");

console.log("pool_toggle_logic: all assertions passed");
