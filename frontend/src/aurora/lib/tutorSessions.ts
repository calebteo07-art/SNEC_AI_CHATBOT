/* Pure, dependency-free tutor-session store — persists the FULL /chat thread in
   localStorage so the landing can list recent conversations and reopen them intact.
   No React/next imports so it stays unit-testable via Node type-stripping (see
   frontend/tests/tutor_sessions_assert.mjs). Keyed per student; tolerant of corrupt
   or absent storage (always degrades to []). */

export interface StoredMessage { type: "ai" | "user"; id: string; text: string }
export interface StoredSession {
  id: string;
  startedAt: number;
  updatedAt: number;
  topic: string;    // deriveTopic(firstUserMessage) — card title
  preview: string;  // derivePreview(lastAssistantMessage) — card body
  messages: StoredMessage[];
}

/* Minimal Storage surface so tests can pass a double and the app passes window.localStorage. */
export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREFIX = "eyebot_tutor_sessions:";
export const MAX_STORED = 10;

export function storageKey(userId: string): string {
  return PREFIX + (userId && userId.length ? userId : "_");
}

export function deriveTopic(messages: StoredMessage[]): string {
  const first = messages.find((m) => m.type === "user");
  const t = (first?.text ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "New chat";
  return t.length > 60 ? t.slice(0, 59).trimEnd() + "…" : t;
}

export function derivePreview(messages: StoredMessage[]): string {
  let last: StoredMessage | undefined;
  for (const m of messages) if (m.type === "ai") last = m;
  const p = (last?.text ?? "").trim().replace(/\s+/g, " ");
  if (!p) return "";
  return p.length > 120 ? p.slice(0, 119).trimEnd() + "…" : p;
}

function isValidSession(s: unknown): s is StoredSession {
  const o = s as StoredSession | null;
  return !!o && typeof o.id === "string" && typeof o.updatedAt === "number" && Array.isArray(o.messages);
}

const byNewest = (a: StoredSession, b: StoredSession) => b.updatedAt - a.updatedAt;

export function loadSessions(userId: string, storage: KVStorage): StoredSession[] {
  try {
    const raw = storage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSession);
  } catch {
    return [];
  }
}

export function saveSessions(userId: string, sessions: StoredSession[], storage: KVStorage): void {
  const pruned = [...sessions].sort(byNewest).slice(0, MAX_STORED);
  try {
    storage.setItem(storageKey(userId), JSON.stringify(pruned));
  } catch {
    // quota: keep fewer and retry once, then give up silently (never throw into chat flow)
    try { storage.setItem(storageKey(userId), JSON.stringify(pruned.slice(0, Math.max(1, MAX_STORED - 5)))); }
    catch { /* give up */ }
  }
}

export function upsertSession(sessions: StoredSession[], session: StoredSession): StoredSession[] {
  return [session, ...sessions.filter((s) => s.id !== session.id)].sort(byNewest);
}

export function recentSessions(sessions: StoredSession[], n = 3): StoredSession[] {
  return [...sessions].sort(byNewest).slice(0, n);
}
