import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { XPBar } from "./XPBar";
import { StreakDisplay } from "./StreakDisplay";
import { AchievementManager } from "./AchievementToast";
import {
  getUserProgress,
  addXP,
  updateStreak,
  checkAndUnlockAchievements,
  XP_REWARDS,
} from "../utils/gamification";
import { useAuth } from "./AuthContext";
import { Send, BookOpen, ArrowLeft, User } from "lucide-react";

interface AIMessage {
  type: "ai";
  id: string;
  content: string;
}

interface UserMessage {
  type: "user";
  id: string;
  text: string;
}

type Message = AIMessage | UserMessage;

const TOPIC_LABEL = "Ophthalmology";
const INITIAL_MESSAGES: Message[] = [
  {
    type: "ai",
    id: "1",
    content:
      "I'm here whenever you're ready. What would you like to think through today?",
  },
];

const FALLBACK_CONTENT = "I'm having trouble reaching the service right now — please try again in a moment.";

function AIBubble({ message }: { message: AIMessage }) {
  return (
    <motion.div
      className="flex gap-5 items-start"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex-shrink-0 mt-1">
        <HolographicEyeLogo size={28} animated={false} />
      </div>
      <div className="flex-1 max-w-[680px]">
        <p
          className="text-[#A39A8E] mb-2"
          style={{ fontSize: "0.68rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600 }}
        >
          Tutor
        </p>
        <p
          className="text-[#1F1A12]"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.08rem",
            lineHeight: 1.65,
            fontWeight: 400,
          }}
        >
          {message.content}
        </p>
      </div>
    </motion.div>
  );
}

function UserBubble({ message }: { message: UserMessage }) {
  return (
    <motion.div
      className="flex gap-5 items-start"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex-shrink-0 mt-1 w-7 h-7 rounded-full bg-[#8C6D3F]/12 flex items-center justify-center">
        <User size={14} strokeWidth={1.5} className="text-[#8C6D3F]" />
      </div>
      <div className="flex-1 max-w-[680px]">
        <p
          className="text-[#A39A8E] mb-2"
          style={{ fontSize: "0.68rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600 }}
        >
          You
        </p>
        <p
          className="text-[#5C544A]"
          style={{ fontSize: "1rem", lineHeight: 1.65 }}
        >
          {message.text}
        </p>
      </div>
    </motion.div>
  );
}

export function ChatScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [userProgress, setUserProgress] = useState(getUserProgress());
  const [newAchievements, setNewAchievements] = useState<string[]>([]);

  useEffect(() => {
    updateStreak();
    setUserProgress(getUserProgress());
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const sendMessage = async () => {
    if (!input.trim() || isTyping) return;
    const userMsg: UserMessage = {
      type: "user",
      id: Date.now().toString(),
      text: input.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    addXP(XP_REWARDS.chatMessage);
    setUserProgress(getUserProgress());

    const unlockedAchievements = checkAndUnlockAchievements();
    if (unlockedAchievements.length > 0) {
      setNewAchievements((prev) => [...prev, ...unlockedAchievements]);
    }

    const studentId = user?.studentId || "anonymous";

    const apiMessages = messages.concat(userMsg).map((m) => {
      if (m.type === "user") return { role: "user", content: m.text };
      return { role: "assistant", content: m.content };
    });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: studentId, messages: apiMessages }),
      });
      const data = await res.json();
      const aiMsg: AIMessage = {
        type: "ai",
        id: (Date.now() + 1).toString(),
        content: data.content || FALLBACK_CONTENT,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      const aiMsg: AIMessage = {
        type: "ai",
        id: (Date.now() + 1).toString(),
        content: FALLBACK_CONTENT,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  };

  return (
    <div className="min-h-screen bg-[#FBF8F1] flex flex-col">
      <AchievementManager
        achievements={newAchievements}
        onDismiss={(id) => setNewAchievements((prev) => prev.filter((a) => a !== id))}
      />

      {/* ===== Top navigation strip ===== */}
      <motion.div
        className="border-b border-[#1F1A12]/8 bg-[#FBF8F1]/80 backdrop-blur-sm sticky top-0 z-30"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-3xl mx-auto px-8 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-2 text-[#5C544A] hover:text-[#1F1A12] transition-colors text-sm"
          >
            <ArrowLeft size={15} strokeWidth={1.5} />
            Dashboard
          </button>

          <div className="flex items-center gap-3">
            <span
              className="text-[#1F1A12]"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.05rem",
                fontWeight: 500,
                letterSpacing: "-0.01em",
              }}
            >
              EyeQ
            </span>
            <span className="text-[#A39A8E]">·</span>
            <span className="text-[#5C544A]" style={{ fontSize: "0.85rem" }}>
              Tutor
            </span>
          </div>

          <button
            onClick={() => navigate("/flashcards")}
            className="inline-flex items-center gap-2 text-[#5C544A] hover:text-[#1F1A12] transition-colors text-sm"
          >
            <BookOpen size={15} strokeWidth={1.5} />
            <span className="hidden sm:inline">Flashcards</span>
          </button>
        </div>
      </motion.div>

      {/* ===== Topic / context strip ===== */}
      <div className="max-w-3xl w-full mx-auto px-8 pt-10 pb-2">
        <div className="flex items-center justify-between">
          <p
            className="text-[#8C6D3F]"
            style={{ fontSize: "0.72rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}
          >
            · Conversation · {TOPIC_LABEL}
          </p>
          <div className="flex items-center gap-3">
            <StreakDisplay streak={userProgress.streak} size="sm" />
          </div>
        </div>
        <div className="mt-3 max-w-xs">
          <XPBar currentXP={userProgress.xp} level={userProgress.level} size="sm" />
        </div>
      </div>

      {/* ===== Conversation stream ===== */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-8 pt-8 pb-32">
        <div className="space-y-10">
          {messages.map((msg) =>
            msg.type === "ai" ? (
              <AIBubble key={msg.id} message={msg} />
            ) : (
              <UserBubble key={msg.id} message={msg} />
            )
          )}

          {isTyping && (
            <motion.div
              className="flex gap-5 items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="flex-shrink-0">
                <HolographicEyeLogo size={28} animated={true} />
              </div>
              <div className="flex gap-1 items-center">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-[#8C6D3F]/60"
                    animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }}
                  />
                ))}
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ===== Composer ===== */}
      <div className="fixed bottom-0 inset-x-0 bg-gradient-to-t from-[#FBF8F1] via-[#FBF8F1] to-transparent pt-10 pb-8 z-20">
        <div className="max-w-3xl mx-auto px-8">
          <div
            className="relative bg-white rounded-3xl border border-[#1F1A12]/10 transition-all focus-within:border-[#8C6D3F]/40 focus-within:shadow-md"
            style={{ boxShadow: "0 1px 2px rgba(31,26,18,0.04), 0 8px 24px rgba(31,26,18,0.05)" }}
          >
            <div className="flex items-end gap-2 p-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="What's on your mind?"
                rows={1}
                className="flex-1 bg-transparent px-4 py-3 text-[#1F1A12] placeholder-[#A39A8E] outline-none resize-none min-h-[48px] max-h-[160px]"
                style={{ fontSize: "1rem", lineHeight: 1.55, fontFamily: "var(--font-body)" }}
              />
              <motion.button
                onClick={sendMessage}
                disabled={!input.trim() || isTyping}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                  input.trim() && !isTyping
                    ? "bg-[#8C6D3F] text-[#FBF8F1]"
                    : "bg-[#1F1A12]/5 text-[#A39A8E] cursor-not-allowed"
                }`}
                whileHover={input.trim() && !isTyping ? { scale: 1.05 } : undefined}
                whileTap={input.trim() && !isTyping ? { scale: 0.95 } : undefined}
              >
                <Send size={15} strokeWidth={1.5} />
              </motion.button>
            </div>
          </div>
          <p className="mt-3 text-center text-[#A39A8E]" style={{ fontSize: "0.72rem" }}>
            Press Enter to send · Shift + Enter for a new line
          </p>
        </div>
      </div>
    </div>
  );
}
