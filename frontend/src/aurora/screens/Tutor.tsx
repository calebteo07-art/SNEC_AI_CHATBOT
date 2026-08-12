"use client";
/* AURORA Tutor — the EyeBot chat. "Mono + Electric / Live Wire": a warm ivory + charcoal
   reading surface lit by one electric-indigo accent over a live constellation canvas
   (ChatField), with a blinking realistic-eye avatar, an OCT header trace, charging bubble
   borders and a glowing caret. The SSE /api/chat streaming and the gamification hooks are
   ported verbatim from the legacy ChatScreen. */
import { useEffect, useRef, useState } from "react";
import { ChatThread } from "@/aurora/components/ChatThread";
import { MessageBubble } from "@/aurora/components/MessageBubble";
import { Composer } from "@/aurora/components/Composer";
import { FollowupChip } from "@/aurora/components/FollowupChip";
import { ChatField } from "@/aurora/components/ChatField";
import Link from "next/link";
import { Icon } from "@/aurora/icons";
import { addChatXp, XP_REWARDS } from "@/lib/legacy/gamification";
import { useGamificationSync } from "@/hooks/useGamification";
import { TutorLanding } from "@/aurora/components/TutorLanding";
import {
  loadSessions, saveSessions, upsertSession, recentSessions,
  deriveTopic, derivePreview, type StoredSession, type StoredMessage,
} from "@/aurora/lib/tutorSessions";
import { endSessionPayload } from "@/aurora/lib/tutorSessionEnd";
import { OPENERS, SUBS, nextIndex } from "@/aurora/lib/tutorGreeting";
import { useAuth } from "@/screens/AuthContext";
import { useReward } from "@/aurora/rewards/RewardProvider";
import { grantAchievements } from "@/aurora/rewards/achieve";
import { firstNameOf } from "@/aurora/lib/displayName";
import { apiErrorMessage } from "@/aurora/lib/apiError";
import {
  MAX_IMAGES, imageOnlyText, prepareImage, rejectionMessage, triageFiles,
  type PreparedImage,
} from "@/aurora/lib/tutorImages";

interface AIMessage { type: "ai"; id: string; content: string; }
/* `images` are the live previews — they exist only for as long as this thread is on
   screen. `imageCount` is the part that persists: attachments are never stored, so a
   reopened conversation says how many there were rather than showing a dead frame. */
interface UserMessage { type: "user"; id: string; text: string; images?: PreparedImage[]; imageCount?: number; }
type Message = AIMessage | UserMessage;

/* A sent message renders its thumbnails inside the bubble. On a REOPENED thread the
   bytes are gone — attachments are never stored — so the count stands in for them
   rather than leaving the question hanging with nothing to look at. */
function userBubble(m: UserMessage) {
  const n = m.imageCount ?? 0;
  if (!n) return m.text;
  return (
    <>
      {m.images?.length ? (
        <span className="aurora-msg-shots">
          {m.images.map((img) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img key={img.id} src={img.preview} alt={img.name || "Attached image"} />
          ))}
        </span>
      ) : (
        <span className="aurora-msg-shots-gone">
          {n} image{n > 1 ? "s" : ""} attached — not saved
        </span>
      )}
      {m.text}
    </>
  );
}

const toStored = (m: Message): StoredMessage =>
  m.type === "ai"
    ? { type: "ai", id: m.id, text: m.content }
    : { type: "user", id: m.id, text: m.text, imageCount: m.imageCount };

// The thread is persisted before this renders, so a reload keeps the conversation.
const FALLBACK_CONTENT = apiErrorMessage("I'm having trouble reaching the service right now");
const SUGGESTIONS = [
  "Explain slit-lamp technique",
  "Describe normal OCT layers",
  "How do I measure IOP?",
  "What is the cup-to-disc ratio?",
  "Explain LogMAR visual acuity",
];

export function Tutor() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [shots, setShots] = useState<PreparedImage[]>([]);
  const [notice, setNotice] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const { mutate: syncGamification } = useGamificationSync();
  const { user } = useAuth();
  const { enqueue } = useReward();
  const firstName = firstNameOf(user?.fullName);
  const userId = user?.studentId || user?.email || "_";
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [recent, setRecent] = useState<StoredSession[]>([]);
  // Load this student's recent conversations for the landing (client-only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    setRecent(recentSessions(loadSessions(userId, window.localStorage), 3));
  }, [userId]);

  // Persist the full thread (normalized) to localStorage under `sid`, upserting to the front.
  const persistThread = (thread: Message[], sid: string) => {
    if (typeof window === "undefined") return;
    const stored: StoredMessage[] = thread.map(toStored);
    const now = Date.now();
    const existing = loadSessions(userId, window.localStorage);
    const prior = existing.find((s) => s.id === sid);
    const session: StoredSession = {
      id: sid,
      startedAt: prior?.startedAt ?? now,
      updatedAt: now,
      topic: deriveTopic(stored),
      preview: derivePreview(stored),
      messages: stored,
    };
    saveSessions(userId, upsertSession(existing, session), window.localStorage);
  };

  // POST /api/end-session bookkeeping — the only path that writes a chat_sessions row and
  // fires update_profile(source="tutor"), so a tutor consult now actually feeds streaks/XP
  // and gives staff reports a label. `messagesRef` (not `messages` state directly) so the
  // unmount effect below — armed once with `[]` deps — reads the latest thread instead of
  // whatever was live on first render. `endSentRef` is the fire-once guard; `resumeBaselineRef`
  // is the resumed-thread starting length (0 for a conversation that was never resumed) —
  // see endSessionPayload's baselineCount for why both live in the pure function, not just here.
  const messagesRef = useRef<Message[]>(messages);
  const endSentRef = useRef(false);
  const resumeBaselineRef = useRef(0);
  useEffect(() => { messagesRef.current = messages; });

  // Logs the outgoing conversation when it ends: on unmount (below) or from switchConversation
  // when a different conversation starts mid-thread. Best-effort — a failed or skipped call
  // must never block navigation or surface an error to the student, so failures are swallowed.
  // `keepalive` lets the browser finish sending the request even if the page is already
  // unloading, shrinking (not closing — see the effect comment below) the tab-close loss window.
  const endTutorSession = () => {
    const stored: StoredMessage[] = messagesRef.current.map(toStored);
    const payload = endSessionPayload(stored, endSentRef.current, resumeBaselineRef.current);
    if (!payload) return;
    endSentRef.current = true;
    fetch("/api/end-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify(payload),
    }).catch(() => { /* best-effort — see comment above */ });
  };

  // Ends whatever conversation was live, then arms the guards fresh for the one replacing it —
  // folded into one helper (rather than two-or-three manual lines at each call site) so a
  // future second "start something new" trigger (a "New chat" button, say) cannot forget a
  // reset line and silently mis-log the next conversation.
  const switchConversation = (nextBaselineCount: number) => {
    endTutorSession();
    endSentRef.current = false;
    resumeBaselineRef.current = nextBaselineCount;
  };

  // Fires on unmount — reliably on an in-app route change (the SPA stays alive, so the fetch
  // above completes even after the component is gone). An abrupt tab close can still kill the
  // page before this cleanup ever runs at all — the accepted limitation in the design doc;
  // `keepalive` only shrinks that window, it doesn't close it. `[]` deps means this cleanup is
  // set up once and reads messagesRef at the moment it actually runs, so it survives a React
  // strict-mode double invoke (the synthetic mount→cleanup→mount happens before the student has
  // typed anything, so messagesRef is still empty and endSessionPayload is a no-op) and fires
  // for real exactly once.
  useEffect(() => {
    return () => endTutorSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Greeting landing (ricoe A2): /chat opens on a hello + prompt + recent sessions, then
  // cross-fades into the live thread once the student asks something. "leaving" keeps both
  // mounted for the ~460ms cross-fade; the shared constellation canvas bridges them.
  const [phase, setPhase] = useState<"landing" | "leaving" | "chat">("landing");
  // Opener + sub seeds: 0/0 on first render (stable), then fresh non-repeating indices
  // after mount so the greeting differs every visit (last shown persisted in localStorage).
  const [openerSeed, setOpenerSeed] = useState(0);
  const [subSeed, setSubSeed] = useState(0);
  useEffect(() => {
    let last: { o: number; s: number } = { o: -1, s: -1 };
    try {
      const raw = localStorage.getItem("eyebot_tutor_greet");
      if (raw) last = JSON.parse(raw);
    } catch { /* ignore */ }
    const o = nextIndex(OPENERS.length, last?.o ?? -1, Math.random());
    const s = nextIndex(SUBS.length, last?.s ?? -1, Math.random());
    setOpenerSeed(o);
    setSubSeed(s);
    try { localStorage.setItem("eyebot_tutor_greet", JSON.stringify({ o, s })); } catch { /* ignore */ }
  }, []);
  const enterChat = () => { setPhase("leaving"); window.setTimeout(() => setPhase("chat"), 460); };
  const startFromLanding = () => {
    if ((!input.trim() && shots.length === 0) || preparing > 0 || isTyping || streamingId) return;
    enterChat();
    void sendMessage();
  };

  /* Attach: refuse what can't be sent and SAY why, then downscale the rest.
     Slot accounting is a REF, not `shots.length`. `prepareImage` decodes and re-encodes
     the source file, which is 100ms+ for a phone photo, and nothing sets state before it
     — so a second paste inside that window would read the same pre-attach count, both
     calls would think all three slots were free, and the surplus image would be dropped
     by the cap with nothing to explain it. Reserving synchronously is what lets the
     second call see the truth and report an honest "up to 3" instead of silence. */
  const reservedRef = useRef(0);
  const [preparing, setPreparing] = useState(0);
  const addFiles = async (files: File[]) => {
    const { accepted, rejected } = triageFiles(reservedRef.current, files);
    reservedRef.current += accepted.length;
    let why = rejectionMessage(rejected);
    if (!accepted.length) { if (why) setNotice(why); return; }
    setPreparing((n) => n + 1);   // before the first await — this is what gates send
    const prepared: PreparedImage[] = [];
    for (const file of accepted) {
      try { prepared.push(await prepareImage(file)); }
      catch { reservedRef.current = Math.max(0, reservedRef.current - 1); }
    }
    if (prepared.length < accepted.length) why = `${why} Some images could not be read.`.trim();
    // Never clear with an empty string: a concurrent call may have just written a real one.
    if (why) setNotice(why);
    if (prepared.length) setShots((prev) => [...prev, ...prepared].slice(0, MAX_IMAGES));
    setPreparing((n) => n - 1);
  };
  const removeImage = (id: string) => {
    setShots((prev) => prev.filter((i) => i.id !== id));
    reservedRef.current = Math.max(0, reservedRef.current - 1);
    setNotice("");
  };

  const resumeSession = (s: StoredSession) => {
    // Starting a different conversation counts as ending whatever was live (design doc
    // §6.2a) — log it before it's overwritten. The baseline is this resumed thread's OWN
    // length, so resuming-then-immediately-leaving without adding anything logs nothing —
    // a resumed thread already satisfies the completed-exchange check by construction, so
    // without a baseline every re-read would write a duplicate row.
    switchConversation(s.messages.length);
    const restored: Message[] = s.messages.map((m) =>
      m.type === "ai"
        ? { type: "ai", id: m.id, content: m.text }
        : { type: "user", id: m.id, text: m.text, imageCount: m.imageCount });
    setMessages(restored);
    setActiveSessionId(s.id);
    setPhase("chat");
  };

  // F3 — "Explain this" from a flashcard pre-seeds the composer with the question.
  useEffect(() => {
    try {
      const seed = sessionStorage.getItem("eyebot_tutor_seed");
      if (seed) {
        sessionStorage.removeItem("eyebot_tutor_seed");
        setInput(`Please explain this and the key concepts behind it: ${seed}`);
      }
    } catch { /* ignore */ }
  }, []);

  /* Container-local autoscroll: pin the thread to the bottom while streaming
     without scrolling any ancestor scrollport. */
  useEffect(() => {
    const box = threadRef.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  /* SSE streaming send. Accepts an optional override (resume / quick-start from the
     landing) so it doesn't depend on the async `input` state having flushed. */
  const sendMessage = async (override?: string) => {
    const raw = (override ?? input).trim();
    const attached = shots;
    // `preparing` blocks the window where an image is still being decoded: sending now
    // would snapshot the pre-attach `shots` and ask about a picture that never rode along.
    // Enter reaches here even when Composer is `disabled`, so the guard has to live here.
    if ((!raw && attached.length === 0) || preparing > 0 || isTyping || streamingId) return;
    // An attachment sent with no typed question still has to ask something — the server
    // substitutes the same default, so the thread and the model see one question.
    const text = attached.length ? imageOnlyText(raw) : raw;
    const sid = activeSessionId ?? `sess-${Date.now()}`;
    if (!activeSessionId) setActiveSessionId(sid);
    const userMsg: UserMessage = {
      type: "user", id: Date.now().toString(), text,
      images: attached.length ? attached : undefined,
      imageCount: attached.length || undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setShots([]);
    reservedRef.current = 0;
    setNotice("");
    setIsTyping(true);
    // Persist immediately so the session appears even if the user leaves before a reply.
    persistThread(messages.concat(userMsg), sid);

    // Chat Lumens have no daily cap. Sync the grant to the backend (single source of
    // truth) so it shows up in the dashboard Lumens + daily-goal ring — both read from
    // the synced total.
    const granted = addChatXp(XP_REWARDS.chatMessage);
    if (granted > 0) {
      syncGamification({ xp_delta: granted, hearts_used: 0 });
    }
    grantAchievements(user?.studentId ?? "", ["first_chat"]).forEach(enqueue);

    // Attachments ride the FINAL turn only — they ask about the message they arrived
    // with, and re-sending them every turn would re-bill them. The server enforces the
    // same rule; this just avoids sending what would be discarded.
    const thread = messages.concat(userMsg);
    const apiMessages = thread.map((m, i) =>
      m.type === "user"
        ? {
            role: "user",
            content: m.text,
            ...(i === thread.length - 1 && attached.length
              ? { images: attached.map(({ mime, data }) => ({ mime, data })) }
              : {}),
          }
        : { role: "assistant", content: m.content },
    );

    const aiMsgId = `ai-${Date.now() + 1}`;
    let aiContent = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: apiMessages }),
      });
      if (!res.ok || !res.body) throw new Error("Stream unavailable");

      setMessages((prev) => [...prev, { type: "ai", id: aiMsgId, content: "" }]);
      setIsTyping(false);
      setStreamingId(aiMsgId);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data) as { text: string };
            if (parsed.text) {
              aiContent += parsed.text;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last.type === "ai" && last.id === aiMsgId)
                  return [...prev.slice(0, -1), { ...last, content: last.content + parsed.text }];
                return prev;
              });
            }
          } catch { /* skip malformed SSE */ }
        }
      }
      persistThread(messages.concat(userMsg, { type: "ai", id: aiMsgId, content: aiContent }), sid);
    } catch {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last.type === "ai" && last.id === aiMsgId)
          return [...prev.slice(0, -1), { ...last, content: FALLBACK_CONTENT }];
        return [...prev, { type: "ai", id: aiMsgId, content: FALLBACK_CONTENT }];
      });
      persistThread(messages.concat(userMsg, { type: "ai", id: aiMsgId, content: FALLBACK_CONTENT }), sid);
    } finally {
      setIsTyping(false);
      setStreamingId(null);
    }
  };

  return (
    <section className="aurora-chat">
      <ChatField />

      {phase !== "chat" && (
        <TutorLanding
          firstName={firstName}
          input={input}
          onChange={setInput}
          onSend={startFromLanding}
          disabled={isTyping || streamingId !== null}
          sessions={recent}
          onResume={resumeSession}
          images={shots}
          onAddFiles={(f) => void addFiles(f)}
          onRemoveImage={removeImage}
          notice={preparing > 0 ? "Preparing your image…" : notice}
          openerSeed={openerSeed}
          subSeed={subSeed}
          leaving={phase === "leaving"}
        />
      )}

      {phase !== "landing" && (
        <div className="aurora-chat-convo" data-entering={phase === "leaving" || undefined}>
          <header className="aurora-chat-head">
            <Link href="/homepage" className="aurora-chat-back" aria-label="Back to homepage">
              <Icon.back size={24} />
            </Link>
            <span className="aurora-chat-avatar">
              <span className="aurora-chat-eye">
                <span className="aurora-chat-eye-orb">
                  {/* Reuse the Nano-Banana login eye — a photoreal round iris on near-white. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/login-eye.png" alt="" />
                  <span className="aurora-chat-eye-lid" aria-hidden="true" />
                </span>
                <span className="aurora-chat-eye-ring" aria-hidden="true" />
              </span>
            </span>
            <h1 className="aurora-chat-name">eyebot</h1>
            <svg className="aurora-chat-oct" viewBox="0 0 120 16" aria-hidden="true">
              <polyline points="0,8 16,8 22,3 28,13 34,8 56,8 62,2 68,14 74,8 120,8" />
            </svg>
            {/* SNEC co-brand — the rail (which normally carries it) is hidden on the
                immersive Tutor, so complete the EyeBot + SNEC lockup here (ricoe E2). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="aurora-snec aurora-chat-snec" src="/brand/snec-logo.jpg" alt="Singapore National Eye Centre" />
          </header>

          <ChatThread ref={threadRef}>
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                role={m.type === "ai" ? "eyebot" : "user"}
                streaming={streamingId === m.id}
              >
                {m.type === "ai" ? m.content : userBubble(m)}
              </MessageBubble>
            ))}
            {isTyping && (
              <MessageBubble role="eyebot">
                <span className="aurora-typing" aria-label="EyeBot is typing"><i /><i /><i /></span>
              </MessageBubble>
            )}
          </ChatThread>

          <footer className="aurora-chat-foot">
            <div className="aurora-chat-foot-inner">
              <div className="aurora-chat-followups aurora-stagger">
                {SUGGESTIONS.map((s) => (
                  <FollowupChip key={s} label={s} active={input === s} onClick={() => setInput(s)} />
                ))}
              </div>
              <Composer
                value={input}
                onChange={setInput}
                onSend={() => void sendMessage()}
                disabled={isTyping || streamingId !== null}
                images={shots}
                onAddFiles={(f) => void addFiles(f)}
                onRemoveImage={removeImage}
                notice={preparing > 0 ? "Preparing your image…" : notice}
              />
            </div>
          </footer>
        </div>
      )}
    </section>
  );
}
