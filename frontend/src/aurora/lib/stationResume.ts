// frontend/src/aurora/lib/stationResume.ts
/* Durable memory for a live OSCE station, so a reload stops destroying 20 minutes of work.
   Storage-agnostic and dependency-free — the caller injects sessionStorage, the tests
   inject a Map. Pinned by frontend/tests/station_resume_logic.mjs.

   Every piece of station state lived in React state and the backend holds no session, so
   `pagehide` (refresh, tab close, bfcache) and effect cleanup (browser Back) both ended the
   attempt outright: re-entry restarted at step 1 with an empty transcript. The same two
   events fire the 30-Lumen forfeit beacon, and there is no `beforeunload` anywhere in the
   app — so the student was charged, and lost everything, on a path that never warned them.
   Worse, the dedupe flag lived in a per-mount closure, so N reloads cost N x 30.

   Two responsibilities, deliberately in one module because they answer the same question
   ("has this station already happened in this tab?"):

     1. SNAPSHOT — enough state to put the student back exactly where they were.
     2. FORFEIT LEDGER — a durable record that this station already charged, so the penalty
        survives a reload as ONE charge instead of one per reload.

   The forfeit ledger is deliberately NOT cleared on resume. Charging once and only once is
   the invariant (see forfeitGuard); clearing it would let a student re-roll a station they
   are doing badly at by refreshing, which is the exact behaviour the penalty exists to
   prevent. */

export const RESUME_VERSION = 1;

/** Snapshots older than this are discarded rather than resumed. sessionStorage already
    dies with the tab; this guards a tab left open overnight, where silently resuming a
    stale attempt would be worse than starting clean. */
export const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface SnapshotMessage {
  role: "user" | "assistant";
  content: string;
  channel: "patient" | "eyebot";
  id?: string;
}

export interface StationSnapshot {
  v: number;
  caseId: string;
  messages: SnapshotMessage[];
  ticked: number[];
  skipped: number[];
  autoSteps: number[];
  chartDone: number[];
  askedDual: number[];
  /** Epoch ms the station began — restored so the clock does not reset on a reload. */
  startedAt: number;
  savedAt: number;
}

/** The minimal storage surface used here — `sessionStorage` satisfies it structurally. */
export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const snapshotKey = (caseId: string) => `eyebot_station_v${RESUME_VERSION}_${caseId}`;
export const forfeitKey = (caseId: string) => `eyebot_station_forfeited_${caseId}`;

const nums = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((n): n is number => typeof n === "number") : [];

/** Read a resumable snapshot, or null when there is nothing trustworthy to resume.

    Every rejection is silent and lands on "start fresh", which is always safe. A snapshot
    is rejected when it is absent, unparseable, from another schema version, for a different
    case, or stale. */
export function readSnapshot(
  caseId: string, store: KeyStore | null | undefined, now = Date.now(),
): StationSnapshot | null {
  if (!store || !caseId) return null;
  let raw: string | null;
  try { raw = store.getItem(snapshotKey(caseId)); } catch { return null; }
  if (!raw) return null;
  let parsed: Partial<StationSnapshot>;
  try { parsed = JSON.parse(raw) as Partial<StationSnapshot>; } catch { return null; }
  if (!parsed || parsed.v !== RESUME_VERSION || parsed.caseId !== caseId) return null;
  const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
  if (!savedAt || now - savedAt > MAX_AGE_MS) return null;

  const messages = Array.isArray(parsed.messages)
    ? parsed.messages.filter(
        (m): m is SnapshotMessage =>
          !!m && typeof m.content === "string" &&
          (m.role === "user" || m.role === "assistant") &&
          (m.channel === "patient" || m.channel === "eyebot"),
      )
    : [];
  return {
    v: RESUME_VERSION,
    caseId,
    messages,
    ticked: nums(parsed.ticked),
    skipped: nums(parsed.skipped),
    autoSteps: nums(parsed.autoSteps),
    chartDone: nums(parsed.chartDone),
    askedDual: nums(parsed.askedDual),
    startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : savedAt,
    savedAt,
  };
}

/** Persist the station. A full-storage throw is swallowed: failing to save must never take
    down a station that is otherwise working perfectly. */
export function writeSnapshot(
  snap: Omit<StationSnapshot, "v" | "savedAt">, store: KeyStore | null | undefined,
  now = Date.now(),
): void {
  if (!store || !snap.caseId) return;
  const full: StationSnapshot = { ...snap, v: RESUME_VERSION, savedAt: now };
  try { store.setItem(snapshotKey(snap.caseId), JSON.stringify(full)); } catch { /* quota */ }
}

export function clearSnapshot(caseId: string, store: KeyStore | null | undefined): void {
  if (!store || !caseId) return;
  try { store.removeItem(snapshotKey(caseId)); } catch { /* ignore */ }
}

/** True when this station has ALREADY charged its forfeit in this tab.

    The in-memory guard cannot see across a reload, so a student who refreshed mid-station
    and then quit paid twice. This is the half of the dedupe that survives the reload. */
export function wasForfeited(caseId: string, store: KeyStore | null | undefined): boolean {
  if (!store || !caseId) return false;
  try { return store.getItem(forfeitKey(caseId)) === "1"; } catch { return false; }
}

export function markForfeited(caseId: string, store: KeyStore | null | undefined): void {
  if (!store || !caseId) return;
  try { store.setItem(forfeitKey(caseId), "1"); } catch { /* ignore */ }
}

/** Called when a station is GRADED: the attempt is over and paid for, so both records go.
    Clearing the forfeit mark here is safe — a graded station can never forfeit. */
export function clearStation(caseId: string, store: KeyStore | null | undefined): void {
  clearSnapshot(caseId, store);
  if (!store || !caseId) return;
  try { store.removeItem(forfeitKey(caseId)); } catch { /* ignore */ }
}

/** Is there real work in this snapshot? An empty one is not worth announcing a resume for. */
export function hasProgress(snap: StationSnapshot | null): boolean {
  if (!snap) return false;
  return snap.messages.length > 0 || snap.ticked.length > 0;
}
