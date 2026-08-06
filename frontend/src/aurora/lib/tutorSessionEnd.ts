/* Pure decision rule for POST /api/end-session — "should this tutor conversation be logged,
   and with what payload." Extracted out of Tutor.tsx so the completed-exchange / fire-once
   rule is unit-testable without mounting the screen (see
   frontend/tests/tutor_end_session_logic.mjs). Dependency-free at runtime, like
   tutorSessions.ts: the only import is an `import type`, which Node's type-stripping erases
   before it ever tries to resolve the specifier. That matters here specifically — this module
   cannot import tutorSessions.deriveTopic as a VALUE and still run standalone under the test
   harness (Node's ESM loader requires a real file extension to resolve a relative import that
   pulls in a value, e.g. "./tutorSessions.ts", but tsconfig's `moduleResolution: "bundler"`
   rejects that same ".ts"-suffixed specifier in application source without
   `allowImportingTsExtensions`, which this project does not set). See firstUserMessageTopic.

   A conversation "ends" when the student leaves /chat or starts a different one mid-thread
   (design doc §6.2a). Both call this with the OUTGOING thread; a null return means don't fire
   the fetch at all. */
import type { StoredMessage } from "./tutorSessions";

export interface EndSessionMessage { role: "user" | "assistant"; content: string }
export interface EndSessionPayload {
  messages: EndSessionMessage[];
  topic: string;
  token_count: number;
}

/* Mirrors tutorSessions.deriveTopic exactly — first user message, whitespace-collapsed, a
   60-char cap with an ellipsis — so the consultation label staff see is byte-for-byte the
   label already shown on the student's own recent-conversations list (design doc §6.2b: the
   two are meant to read identically). Kept as a private duplicate rather than an import; see
   the module comment above. Change this alongside deriveTopic if that rule ever changes. */
function firstUserMessageTopic(messages: StoredMessage[]): string {
  const first = messages.find((m) => m.type === "user");
  const t = (first?.text ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "New chat";
  return t.length > 60 ? t.slice(0, 59).trimEnd() + "…" : t;
}

/**
 * `alreadySent` is the caller's own fire-once flag (a ref in Tutor.tsx) — this function stays
 * pure and never remembers state itself, so a strict-mode double-invoke or an extra render
 * can't make it forget.
 *
 * A thread is loggable once it has a completed exchange: a non-empty user message AND a
 * non-empty assistant one. The empty-string check is load-bearing, not belt-and-braces —
 * Tutor.tsx's sendMessage pushes the assistant bubble with `content: ""` the instant streaming
 * starts, before any text has arrived, so an "ai" entry existing is not on its own proof of a
 * reply; navigating away mid-stream must not log a half-finished thread.
 *
 * No token-usage figure is available client-side (the SSE stream carries text only), so
 * token_count is always 0 — the same literal the pre-Aurora caller sent, and the server's own
 * default.
 */
export function endSessionPayload(
  messages: StoredMessage[],
  alreadySent: boolean,
): EndSessionPayload | null {
  if (alreadySent) return null;

  const hasUserReply = messages.some((m) => m.type === "user" && m.text.trim().length > 0);
  const hasAssistantReply = messages.some((m) => m.type === "ai" && m.text.trim().length > 0);
  if (!hasUserReply || !hasAssistantReply) return null;

  return {
    messages: messages.map((m): EndSessionMessage => ({
      role: m.type === "ai" ? "assistant" : "user",
      content: m.text,
    })),
    topic: firstUserMessageTopic(messages),
    token_count: 0,
  };
}
