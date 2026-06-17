"use client";
/* AURORA Tutor — the EyeBot chat. Calm lavender reading surface, a mono Spark Eye
   avatar, gradient send + active follow-up. The SSE /api/chat streaming and the
   gamification hooks are ported verbatim from the legacy ChatScreen. */
import { useEffect, useRef, useState } from "react";
import { ChatThread } from "@/aurora/components/ChatThread";
import { MessageBubble } from "@/aurora/components/MessageBubble";
import { Composer } from "@/aurora/components/Composer";
import { FollowupChip } from "@/aurora/components/FollowupChip";
import Link from "next/link";
import { Logo } from "@/aurora/Logo";
import { Icon } from "@/aurora/icons";
import { toast } from "sonner";
import { AchievementManager } from "@/screens/AchievementToast";
import { addChatXp, updateStreak, checkAndUnlockAchievements, XP_REWARDS } from "@/lib/legacy/gamification";

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

  useEffect(() => { updateStreak(); }, []);

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

  /* Preserved verbatim: SSE streaming send. */
  const sendMessage = async () => {
    if (!input.trim() || isTyping || streamingId) return;
    const userMsg: UserMessage = { type: "user", id: Date.now().toString(), text: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Chat XP is capped per day so it can't be farmed by spamming messages.
    const granted = addChatXp(XP_REWARDS.chatMessage);
    if (granted === 0 && !chatCapNotified.current) {
      chatCapNotified.current = true;
      toast("You've reached today's chat XP — keep asking questions to learn; chat XP resumes tomorrow 🙂");
    }
    const unlocked = checkAndUnlockAchievements();
    if (unlocked.length > 0) setNewAchievements((prev) => [...prev, ...unlocked]);

    const apiMessages = messages.concat(userMsg).map((m) =>
      m.type === "user" ? { role: "user", content: m.text } : { role: "assistant", content: m.content },
    );

    const nudgeId = `ai-${Date.now() + 1}`;
    const answerId = `ai-${Date.now() + 2}`;
    // EyeBot replies in two parts: a "💭" reflective nudge, then (after a blank
    // line) the answer. We surface them as two separate bubbles — the nudge first,
    // then a short typing beat, then the answer — never both at once.
    const setBubble = (id: string, content: string) =>
      setMessages((prev) => prev.map((m) => (m.type === "ai" && m.id === id ? { ...m, content } : m)));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: apiMessages }),
      });
      if (!res.ok || !res.body) throw new Error("Stream unavailable");

      setMessages((prev) => [...prev, { type: "ai", id: nudgeId, content: "" }]);
      setIsTyping(false);
      setStreamingId(nudgeId);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accum = "";
      let phase: "nudge" | "answer" = "nudge";

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
            if (!parsed.text) continue;
            accum += parsed.text;
            const idx = accum.indexOf("\n\n");

            if (phase === "nudge") {
              if (idx === -1) {
                // Still inside the nudge — stream it into the first bubble.
                setBubble(nudgeId, accum);
              } else {
                // Blank line reached: finalise the nudge, pause, then open the answer.
                setBubble(nudgeId, accum.slice(0, idx).trimEnd());
                phase = "answer";
                setStreamingId(null);
                setIsTyping(true);
                await new Promise((r) => setTimeout(r, 650));
                setIsTyping(false);
                setMessages((prev) => [...prev, { type: "ai", id: answerId, content: "" }]);
                setStreamingId(answerId);
                setBubble(answerId, accum.slice(idx + 2).trimStart());
              }
            } else {
              setBubble(answerId, accum.slice(idx + 2).trimStart());
            }
          } catch { /* skip malformed SSE */ }
        }
      }
    } catch {
      setMessages((prev) => {
        const exists = prev.some((m) => m.type === "ai" && m.id === nudgeId);
        if (exists) return prev.map((m) => (m.type === "ai" && m.id === nudgeId ? { ...m, content: FALLBACK_CONTENT } : m));
        return [...prev, { type: "ai", id: nudgeId, content: FALLBACK_CONTENT }];
      });
    } finally {
      setIsTyping(false);
      setStreamingId(null);
    }
  };

  return (
    <section className="aurora-chat">
      <AchievementManager
        achievements={newAchievements}
        onDismiss={(id) => setNewAchievements((prev) => prev.filter((a) => a !== id))}
      />

      <header className="aurora-chat-head">
        <Link href="/dashboard" className="aurora-chat-back" aria-label="Back to dashboard">
          <Icon.back size={24} />
        </Link>
        <span className="aurora-chat-avatar">
          <span className="aurora-chat-ring"><Logo size={22} /></span>
        </span>
        <h1 className="aurora-chat-name">eyebot</h1>
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
            onSend={sendMessage}
            disabled={isTyping || streamingId !== null}
          />
        </div>
      </footer>
    </section>
  );
}
