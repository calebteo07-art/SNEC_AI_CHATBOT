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
import { toast } from "sonner";
import { AchievementManager } from "@/screens/AchievementToast";
import { addChatXp, checkAndUnlockAchievements, XP_REWARDS } from "@/lib/legacy/gamification";
import { useGamificationSync } from "@/hooks/useGamification";
import { TutorLanding, type RecentSession } from "@/aurora/components/TutorLanding";
import { OPENERS, SUBS, nextIndex } from "@/aurora/lib/tutorGreeting";
import { useAuth } from "@/screens/AuthContext";
import { useProgress } from "@/hooks/useProgress";

interface AIMessage { type: "ai"; id: string; content: string; }
interface UserMessage { type: "user"; id: string; text: string; }
type Message = AIMessage | UserMessage;

const INITIAL_MESSAGES: Message[] = [
  { type: "ai", id: "1", content: "I'm here whenever you're ready. What would you like to think through today?" },
];
const FALLBACK_CONTENT = "I'm having trouble reaching the service right now — please try again in a moment.";
const SUGGESTIONS = [
  "Explain slit-lamp technique",
  "Describe normal OCT layers",
  "How do I measure IOP?",
  "What is the cup-to-disc ratio?",
  "Explain LogMAR visual acuity",
];

export function Tutor() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [newAchievements, setNewAchievements] = useState<string[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);
  const chatCapNotified = useRef(false);
  const { mutate: syncGamification } = useGamificationSync();
  const { user } = useAuth();
  const { data: progress } = useProgress();
  const firstName = (user?.fullName ?? "there").split(" ")[0];

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
  const startFromLanding = () => { if (!input.trim() || isTyping || streamingId) return; enterChat(); void sendMessage(); };
  const startWith = (text: string) => { if (!text.trim() || isTyping || streamingId) return; enterChat(); void sendMessage(text); };
  const resumeSession = (s: RecentSession) =>
    startWith(`Let's pick up where I left off on ${s.topic}.${s.summary ? ` Earlier: ${s.summary}` : ""} Can we go a bit deeper?`);

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
    const text = (override ?? input).trim();
    if (!text || isTyping || streamingId) return;
    const userMsg: UserMessage = { type: "user", id: Date.now().toString(), text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Chat XP is capped per day so it can't be farmed by spamming messages.
    // Sync the grant to the backend (single source of truth) so it shows up in
    // the dashboard XP + daily-goal ring — both read from the synced total.
    const granted = addChatXp(XP_REWARDS.chatMessage);
    if (granted > 0) {
      syncGamification({ xp_delta: granted, hearts_used: 0 });
    } else if (!chatCapNotified.current) {
      chatCapNotified.current = true;
      toast("You've reached today's chat XP — keep asking questions to learn; chat XP resumes tomorrow 🙂");
    }
    const unlocked = checkAndUnlockAchievements();
    if (unlocked.length > 0) setNewAchievements((prev) => [...prev, ...unlocked]);

    const apiMessages = messages.concat(userMsg).map((m) =>
      m.type === "user" ? { role: "user", content: m.text } : { role: "assistant", content: m.content },
    );

    const aiMsgId = `ai-${Date.now() + 1}`;
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
    } catch {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last.type === "ai" && last.id === aiMsgId)
          return [...prev.slice(0, -1), { ...last, content: FALLBACK_CONTENT }];
        return [...prev, { type: "ai", id: aiMsgId, content: FALLBACK_CONTENT }];
      });
    } finally {
      setIsTyping(false);
      setStreamingId(null);
    }
  };

  return (
    <section className="aurora-chat">
      <ChatField />

      <AchievementManager
        achievements={newAchievements}
        onDismiss={(id) => setNewAchievements((prev) => prev.filter((a) => a !== id))}
      />

      {phase !== "chat" && (
        <TutorLanding
          firstName={firstName}
          input={input}
          onChange={setInput}
          onSend={startFromLanding}
          disabled={isTyping || streamingId !== null}
          sessions={(progress?.sessions ?? []) as RecentSession[]}
          onResume={resumeSession}
          onStarter={startWith}
          openerSeed={openerSeed}
          subSeed={subSeed}
          leaving={phase === "leaving"}
        />
      )}

      {phase !== "landing" && (
        <div className="aurora-chat-convo" data-entering={phase === "leaving" || undefined}>
          <header className="aurora-chat-head">
            <Link href="/dashboard" className="aurora-chat-back" aria-label="Back to dashboard">
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
                {m.type === "ai" ? m.content : m.text}
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
              />
            </div>
          </footer>
        </div>
      )}
    </section>
  );
}
