/* Pure unit test for OSCE station resume + the durable forfeit ledger.
     node --experimental-strip-types frontend/tests/station_resume_logic.mjs

   A refresh or browser Back used to charge 30 Lumens with no warning and irrecoverably
   destroy the station: every piece of state was in-memory React state, the backend holds
   no session, and both `pagehide` and effect-cleanup fire the forfeit beacon. There is no
   `beforeunload` anywhere in the app, so nothing asked first. And the dedupe flag lived in
   a per-mount closure, so N reloads cost N x 30 — refresh mid-station charged once, then
   quitting after the reload charged again.

   Two invariants here:
     RESUME  — a snapshot round-trips, and anything untrustworthy starts fresh instead.
     LEDGER  — the forfeit mark SURVIVES a reload, so the penalty is charged exactly once
               per station however many times the tab reloads. It is deliberately not
               cleared on resume: clearing it would let a student re-roll a station they
               are doing badly at by refreshing, which is what the penalty exists to stop. */
import assert from "node:assert";
import {
  MAX_AGE_MS, RESUME_VERSION, clearSnapshot, clearStation, forfeitKey, hasProgress,
  markForfeited, readSnapshot, snapshotKey, wasForfeited, writeSnapshot,
} from "../src/aurora/lib/stationResume.ts";

function fakeStore(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    _map: m,
  };
}

const CASE = "case_oa_001_history_triage";
const live = {
  caseId: CASE,
  messages: [
    { role: "user", content: "Good morning, Mr Tan.", channel: "patient" },
    { role: "assistant", content: "My eye has been red for two days.", channel: "patient", id: "p1" },
    { role: "user", content: "[EXAM] Hand hygiene → performed]", channel: "eyebot" },
  ],
  ticked: [1, 2, 3],
  skipped: [2],
  autoSteps: [1, 3],
  chartDone: [4],
  askedDual: [4],
  startedAt: 1_000_000,
};

// 1) Round trip: everything the student had comes back, byte for byte.
{
  const s = fakeStore();
  writeSnapshot(live, s, 1_500_000);
  const back = readSnapshot(CASE, s, 1_500_001);
  assert.ok(back, "a fresh snapshot must resume");
  assert.deepStrictEqual(back.messages, live.messages);
  assert.deepStrictEqual(back.ticked, [1, 2, 3]);
  assert.deepStrictEqual(back.skipped, [2]);
  assert.deepStrictEqual(back.chartDone, [4]);
  assert.deepStrictEqual(back.askedDual, [4]);
  assert.strictEqual(back.startedAt, 1_000_000, "the clock must not restart on a reload");
}

// 2) Every untrustworthy shape starts FRESH rather than resuming something wrong.
{
  assert.strictEqual(readSnapshot(CASE, null), null, "no storage → fresh");
  assert.strictEqual(readSnapshot("", fakeStore()), null, "no caseId → fresh");
  assert.strictEqual(readSnapshot(CASE, fakeStore()), null, "nothing stored → fresh");
  assert.strictEqual(
    readSnapshot(CASE, fakeStore({ [snapshotKey(CASE)]: "{not json" })), null, "garbage → fresh");

  // Another case's snapshot must never bleed into this station.
  const cross = fakeStore();
  writeSnapshot({ ...live, caseId: "case_ot_099" }, cross, 1_500_000);
  assert.strictEqual(readSnapshot(CASE, cross, 1_500_001), null, "another case → fresh");

  // A schema bump invalidates old snapshots instead of half-restoring them.
  const old = fakeStore({
    [snapshotKey(CASE)]: JSON.stringify({ ...live, v: RESUME_VERSION + 1, savedAt: 1 }),
  });
  assert.strictEqual(readSnapshot(CASE, old, 2), null, "wrong version → fresh");

  // Stale (tab left open overnight). savedAt is deliberately non-zero: 0 is also how a
  // snapshot says "no timestamp", which is its own rejection.
  const stale = fakeStore();
  writeSnapshot(live, stale, 1_000);
  assert.strictEqual(readSnapshot(CASE, stale, 1_000 + MAX_AGE_MS + 1), null, "stale → fresh");
  assert.ok(readSnapshot(CASE, stale, 1_000 + MAX_AGE_MS), "just inside the window → resume");

  // A snapshot with no savedAt at all is rejected too — it cannot be aged.
  const undated = fakeStore({
    [snapshotKey(CASE)]: JSON.stringify({ ...live, v: RESUME_VERSION }),
  });
  assert.strictEqual(readSnapshot(CASE, undated, 5), null, "no savedAt → fresh");
}

// 3) Malformed fields are dropped, not trusted — a corrupted array must not crash a station.
{
  const s = fakeStore({
    [snapshotKey(CASE)]: JSON.stringify({
      v: RESUME_VERSION, caseId: CASE, savedAt: 10, startedAt: 5,
      messages: [
        { role: "user", content: "keep", channel: "patient" },
        { role: "bogus", content: "drop", channel: "patient" },
        { role: "user", content: "drop", channel: "nope" },
        null,
        { role: "user", channel: "patient" },
      ],
      ticked: [1, "2", null, 3], skipped: "nope",
    }),
  });
  const back = readSnapshot(CASE, s, 11);
  assert.strictEqual(back.messages.length, 1);
  assert.strictEqual(back.messages[0].content, "keep");
  assert.deepStrictEqual(back.ticked, [1, 3], "non-numbers are dropped");
  assert.deepStrictEqual(back.skipped, [], "a non-array degrades to empty");
}

// 4) A storage that throws must never take down a working station.
{
  const hostile = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("quota"); },
    removeItem() { throw new Error("blocked"); },
  };
  assert.strictEqual(readSnapshot(CASE, hostile), null);
  writeSnapshot(live, hostile);            // must not throw
  clearSnapshot(CASE, hostile);            // must not throw
  clearStation(CASE, hostile);             // must not throw
  assert.strictEqual(wasForfeited(CASE, hostile), false);
  markForfeited(CASE, hostile);            // must not throw
}

// 5) THE LEDGER: the forfeit mark survives a reload, so N reloads cost ONE charge.
{
  const s = fakeStore();
  assert.strictEqual(wasForfeited(CASE, s), false, "a fresh station has not forfeited");

  markForfeited(CASE, s);                                   // reload #1 charges
  assert.strictEqual(wasForfeited(CASE, s), true, "the mark must survive the reload");
  assert.strictEqual(s.getItem(forfeitKey(CASE)), "1");

  // Resuming does NOT clear it — otherwise refreshing would re-roll a bad station free.
  writeSnapshot(live, s, 10);
  readSnapshot(CASE, s, 11);
  assert.strictEqual(wasForfeited(CASE, s), true, "resume must not wipe the charge record");

  // Per-case, not global: a different station is still unpaid.
  assert.strictEqual(wasForfeited("case_ot_004_dayward", s), false);
}

// 6) A GRADED station clears both records — it can never forfeit, and it must not resume.
{
  const s = fakeStore();
  writeSnapshot(live, s, 10);
  markForfeited(CASE, s);
  clearStation(CASE, s);
  assert.strictEqual(readSnapshot(CASE, s, 11), null, "a graded station must not resume");
  assert.strictEqual(wasForfeited(CASE, s), false, "a graded station starts clean next time");
}

// 7) hasProgress decides whether a resume is worth announcing.
{
  const s = fakeStore();
  writeSnapshot({ ...live, messages: [], ticked: [] }, s, 10);
  assert.strictEqual(hasProgress(readSnapshot(CASE, s, 11)), false, "empty → nothing to announce");
  writeSnapshot({ ...live, messages: [], ticked: [1] }, s, 10);
  assert.strictEqual(hasProgress(readSnapshot(CASE, s, 11)), true, "a tick is progress");
  writeSnapshot({ ...live, ticked: [] }, s, 10);
  assert.strictEqual(hasProgress(readSnapshot(CASE, s, 11)), true, "a transcript is progress");
  assert.strictEqual(hasProgress(null), false);
}

// 8) Successive saves overwrite rather than accumulate, and the newest wins.
{
  const s = fakeStore();
  writeSnapshot(live, s, 10);
  writeSnapshot({ ...live, ticked: [1, 2, 3, 4, 5] }, s, 20);
  assert.strictEqual(s._map.size, 1, "one key per station");
  assert.deepStrictEqual(readSnapshot(CASE, s, 21).ticked, [1, 2, 3, 4, 5]);
}

console.log("station_resume_logic: all assertions passed");
