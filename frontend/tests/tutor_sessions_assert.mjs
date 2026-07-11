/* Unit test for the pure tutor-session store. Run with Node type stripping:
 *   node --experimental-strip-types frontend/tests/tutor_sessions_assert.mjs
 * (tutorSessions.ts is dependency-free so it imports in isolation.) */
import assert from "node:assert";
import {
  deriveTopic, derivePreview, loadSessions, saveSessions,
  upsertSession, recentSessions, storageKey, MAX_STORED,
} from "../src/aurora/lib/tutorSessions.ts";

// in-memory Storage double
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}
const mk = (id, updatedAt, messages = []) =>
  ({ id, startedAt: updatedAt, updatedAt, topic: "", preview: "", messages });

// 1) deriveTopic / derivePreview
assert.strictEqual(deriveTopic([]), "New chat");
assert.strictEqual(deriveTopic([{ type: "ai", id: "a", text: "hi" }]), "New chat");
assert.strictEqual(
  deriveTopic([{ type: "user", id: "u", text: "  How do I   measure IOP?  " }]),
  "How do I measure IOP?");
assert.ok(deriveTopic([{ type: "user", id: "u", text: "x".repeat(90) }]).length <= 60);
assert.strictEqual(derivePreview([]), "");
assert.strictEqual(derivePreview([{ type: "user", id: "u", text: "q" }]), "");
assert.strictEqual(
  derivePreview([{ type: "ai", id: "a1", text: "first" }, { type: "ai", id: "a2", text: "last reply" }]),
  "last reply");

// 2) upsertSession replaces by id, newest-first, no dupes
let list = [mk("a", 100), mk("b", 200)];
list = upsertSession(list, mk("a", 300));
assert.deepStrictEqual(list.map((s) => s.id), ["a", "b"]);
assert.strictEqual(list.length, 2);
list = upsertSession(list, mk("c", 50));
assert.deepStrictEqual(list.map((s) => s.id), ["a", "b", "c"]);

// 3) recentSessions slices newest 3
const many = [mk("1", 1), mk("2", 2), mk("3", 3), mk("4", 4), mk("5", 5)];
assert.deepStrictEqual(recentSessions(many, 3).map((s) => s.id), ["5", "4", "3"]);

// 4) saveSessions prunes to MAX_STORED (newest kept); load round-trips
const store = fakeStorage();
const big = Array.from({ length: MAX_STORED + 4 }, (_, i) => mk(`s${i}`, i));
saveSessions("stu1", big, store);
const loaded = loadSessions("stu1", store);
assert.strictEqual(loaded.length, MAX_STORED);
assert.strictEqual(loaded[0].id, `s${MAX_STORED + 3}`);
assert.ok(!loaded.some((s) => s.id === "s0"));

// 5) round-trip preserves messages (reopen fidelity)
const msgs = [{ type: "user", id: "u1", text: "hello" }, { type: "ai", id: "a1", text: "hi there" }];
const store2 = fakeStorage();
saveSessions("stu2", [{ id: "x", startedAt: 1, updatedAt: 2, topic: "t", preview: "p", messages: msgs }], store2);
assert.deepStrictEqual(loadSessions("stu2", store2)[0].messages, msgs);

// 6) tolerant load: absent / bad JSON / non-array / bad shape -> []
assert.deepStrictEqual(loadSessions("nope", fakeStorage()), []);
assert.deepStrictEqual(loadSessions("bad", fakeStorage({ [storageKey("bad")]: "{not json" })), []);
assert.deepStrictEqual(loadSessions("obj", fakeStorage({ [storageKey("obj")]: '{"a":1}' })), []);

// 7) per-user key isolation
const s3 = fakeStorage();
saveSessions("A", [mk("onlyA", 1)], s3);
assert.deepStrictEqual(loadSessions("B", s3), []);
assert.strictEqual(loadSessions("A", s3)[0].id, "onlyA");

console.log("PASS: tutor sessions store");
