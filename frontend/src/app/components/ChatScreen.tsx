import React, { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import { AchievementManager } from "./AchievementToast";
import { getUserProgress, addXP, updateStreak, checkAndUnlockAchievements, XP_REWARDS } from "../utils/gamification";
import { useAuth } from "./AuthContext";

/* ── Types (unchanged) ────────────────────────────────────── */
interface AIMessage   { type: "ai";   id: string; content: string; }
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

/* ── ChatScreen ───────────────────────────────────────────── */
export function ChatScreen() {
  const { user } = useAuth();
  const [messages, setMessages]         = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput]               = useState("");
  const [isTyping, setIsTyping]         = useState(false);
  const [streamingId, setStreamingId]   = useState<string | null>(null);
  const [newAchievements, setNewAchievements] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { updateStreak(); }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  /* Preserved: SSE streaming send */
  const sendMessage = async () => {
    if (!input.trim() || isTyping || streamingId) return;
    const userMsg: UserMessage = { type: "user", id: Date.now().toString(), text: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    if (inputRef.current) inputRef.current.style.height = "auto";

    addXP(XP_REWARDS.chatMessage);
    const unlocked = checkAndUnlockAchievements();
    if (unlocked.length > 0) setNewAchievements(prev => [...prev, ...unlocked]);

    const apiMessages = messages.concat(userMsg).map(m =>
      m.type === "user" ? { role: "user", content: m.text } : { role: "assistant", content: m.content }
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

      setMessages(prev => [...prev, { type: "ai", id: aiMsgId, content: "" }]);
      setIsTyping(false);
      setStreamingId(aiMsgId);

      const reader  = res.body.getReader();
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
              setMessages(prev => {
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
      setMessages(prev => {
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  };

  const topicStats = { xp: getUserProgress().xp, sessionCount: messages.filter(m => m.type === "user").length };

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="screen-chat">
      <AchievementManager
        achievements={newAchievements}
        onDismiss={id => setNewAchievements(prev => prev.filter(a => a !== id))}
      />

      {/* ── Main chat pane ────────────────────────────────── */}
      <div className="chat-main">
        {/* Chat topbar */}
        <div className="chat-topbar">
          <div className="chat-avatar">
            <img src="/anatomy/eye-hero.png" alt="AI Tutor" />
          </div>
          <div>
            <div className="chat-avatar-name">EyeBot Tutor</div>
            <div className="chat-avatar-sub">AI Ophthalmology Educator</div>
          </div>
          <div className="chat-online-dot" title="Online" />
        </div>

        {/* Messages */}
        <div className="chat-messages" role="log" aria-live="polite" aria-label="Conversation">
          {messages.map(m => (
            <motion.div
              key={m.id}
              className={`msg ${m.type === "ai" ? "msg-ai" : "msg-user"}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {m.type === "ai" ? (
                <>
                  <div className="msg-sender">Tutor</div>
                  <div className="msg-bubble">
                    {m.content}
                    {streamingId === m.id && (
                      <span
                        style={{ display: "inline-block", width: 3, height: "1.1em", borderRadius: 2, background: "var(--teal)", marginLeft: 3, verticalAlign: "-0.15em", animation: "online-pulse 0.9s ease-in-out infinite" }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="msg-sender" style={{ textAlign: "right" }}>You</div>
                  <div className="msg-bubble">{m.text}</div>
                </>
              )}
            </motion.div>
          ))}

          {isTyping && (
            <div className="msg msg-ai">
              <div className="msg-bubble" style={{ color: "var(--faint)" }}>
                <span className="spinner spinner--teal" style={{ width: 12, height: 12, borderWidth: 2 }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="chat-input-area">
          {/* Suggestion chips */}
          <div className="chat-suggestions">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                className="suggestion-chip"
                onClick={() => { setInput(s); inputRef.current?.focus(); }}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="chat-input-row">
            <textarea
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask about any ophthalmic topic…"
              rows={1}
              style={{ lineHeight: 1.5, resize: "none" }}
              aria-label="Message input"
            />
            <button
              className="send-btn"
              onClick={sendMessage}
              disabled={!input.trim() || isTyping}
              aria-label="Send message"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 14L14 8L2 2V6.5L10 8L2 9.5V14Z" fill="#fff" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Context panel ─────────────────────────────────── */}
      <aside className="chat-context-panel" aria-label="Session info">
        <div className="context-card">
          <img className="context-card-img" src="/anatomy/clinic-slitlamp.png" alt="Clinical context" />
          <div className="context-card-body">
            <div className="context-card-label">Current topic</div>
            <div className="context-card-title">Ophthalmology</div>
          </div>
        </div>

        <div className="context-card">
          <img className="context-card-img" src="/anatomy/eye-fundus.png" alt="Anatomy reference" />
          <div className="context-card-body">
            <div className="context-card-label">Reference</div>
            <div className="context-card-title">Fundus anatomy</div>
          </div>
        </div>

        <div className="context-stat-row">
          <div className="context-stat">
            <div className="context-stat-val">{topicStats.sessionCount}</div>
            <div className="context-stat-key">Messages</div>
          </div>
          <div className="context-stat">
            <div className="context-stat-val">{topicStats.xp}</div>
            <div className="context-stat-key">XP</div>
          </div>
        </div>

        {user?.studentRole && (
          <div style={{ padding: "10px 12px", background: "var(--teal-bg)", borderRadius: "var(--r-sm)", border: "1px solid var(--teal-muted)" }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--teal)", marginBottom: 3 }}>Track</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--teal-deep)" }}>{user.studentRole}</div>
          </div>
        )}
      </aside>
    </div>
  );
}

