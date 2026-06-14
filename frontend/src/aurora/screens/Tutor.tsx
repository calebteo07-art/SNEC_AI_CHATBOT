"use client";
/* AURORA Tutor — the EyeBot chat. Calm lavender reading surface, a mono Spark Eye
   avatar, gradient send + active follow-up. The SSE /api/chat streaming and the
   gamification hooks are ported verbatim from the legacy ChatScreen. */
import { useEffect, useRef, useState } from "react";
import { ChatThread } from "@/aurora/components/ChatThread";
import { MessageBubble } from "@/aurora/components/MessageBubble";
import { Composer } from "@/aurora/components/Composer";
import { FollowupChip } from "@/aurora/components/FollowupChip";
import { Logo } from "@/aurora/Logo";
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
      <AchievementManager
        achievements={newAchievements}
        onDismiss={(id) => setNewAchievements((prev) => prev.filter((a) => a !== id))}
      />

      <header className="aurora-chat-head">
        <span className="aurora-chat-mark"><Logo size={26} /></span>
        <div className="aurora-chat-head-meta">
          <h1 className="aurora-chat-h1">EyeBot Tutor</h1>
          <span className="aurora-chat-status">AI ophthalmology educator</span>
        </div>
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
            <span className="aurora-typing">• • •</span>
          </MessageBubble>
        )}
      </ChatThread>

      <footer className="aurora-chat-foot">
        <div className="aurora-chat-foot-inner">
          <div className="aurora-chat-followups">
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
