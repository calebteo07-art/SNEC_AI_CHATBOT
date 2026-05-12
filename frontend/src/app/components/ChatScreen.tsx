import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { XPBar } from "./XPBar";
import { StreakDisplay } from "./StreakDisplay";
import { AchievementManager } from "./AchievementToast";
import { getUserProgress, addXP, updateStreak, checkAndUnlockAchievements, XP_REWARDS } from "../utils/gamification";
import { useAuth } from "./AuthContext";
import {
  Send,
  Layers,
  ChevronRight,
  Stethoscope,
  User,
  Bot,
  RotateCcw,
  ArrowRight,
  Zap,
  Activity,
  Cpu,
  Terminal,
} from "lucide-react";

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

const SAMPLE_TOPIC = "Ophthalmology Neural Network";
const INITIAL_MESSAGES: Message[] = [
  {
    type: "ai",
    id: "1",
    content: "Neural link established. Cognitive exchange module ready. State your inquiry regarding ophthalmic protocols.",
  },
];

const FALLBACK_CONTENT = "Data corruption detected. Please re-verify inquiry syntax.";

function AIMessageBubble({ message }: { message: AIMessage }) {
  return (
    <motion.div
      className="flex gap-4 items-start"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-xl glass-panel border-[#00E5FF]/30 flex items-center justify-center mt-1 bg-[#00E5FF]/5 shadow-[0_0_10px_rgba(0,229,255,0.2)]">
        <Bot size={20} className="text-[#00E5FF]" />
      </div>
      <div className="flex-1 max-w-[85%]">
        <div className="glass-panel rounded-2xl rounded-tl-none border-l-4 border-l-[#00E5FF] px-6 py-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-2 opacity-20">
            <Cpu size={12} className="text-[#00E5FF]" />
          </div>
          <p className="text-[#F0F9FF]/90 font-mono text-sm leading-relaxed tracking-tight">
            <span className="text-[#00E5FF]/50 mr-2">[AI]:</span>
            {message.content}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function UserMessageBubble({ message }: { message: UserMessage }) {
  return (
    <motion.div
      className="flex gap-4 items-start justify-end"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex-1 max-w-[85%]">
        <div className="glass-panel rounded-2xl rounded-tr-none border-r-4 border-r-indigo-500/50 px-6 py-4 bg-indigo-500/5">
          <p className="text-[#F0F9FF]/90 font-mono text-sm leading-relaxed text-right">
            {message.text}
            <span className="text-indigo-400/50 ml-2">:[USER]</span>
          </p>
        </div>
      </div>
      <div className="flex-shrink-0 w-10 h-10 rounded-xl glass-panel border-indigo-500/30 flex items-center justify-center mt-1 bg-indigo-500/5 shadow-[0_0_10px_rgba(99,102,241,0.2)]">
        <User size={20} className="text-indigo-400" />
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
  const [showXPGain, setShowXPGain] = useState(false);
  const [xpGained, setXpGained] = useState(0);

  useEffect(() => {
    updateStreak();
    setUserProgress(getUserProgress());
  }, []);

  const firstName = (user?.fullName || "Student").split(" ")[0].toUpperCase();

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
    setXpGained(XP_REWARDS.chatMessage);
    setShowXPGain(true);
    setTimeout(() => setShowXPGain(false), 2000);

    const unlockedAchievements = checkAndUnlockAchievements();
    if (unlockedAchievements.length > 0) {
      setNewAchievements((prev) => [...prev, ...unlockedAchievements]);
    }

    const studentId = user?.studentId || "anonymous";

    const apiMessages = messages
      .concat(userMsg)
      .map((m) => {
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
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  return (
    <div className="h-screen flex bg-black overflow-hidden relative scanline">
      {/* Background Anatomy Backdrop */}
      <div className="absolute inset-0 pointer-events-none opacity-10">
        <img 
          src="/images/sample_fundus_OD.png" 
          alt="" 
          className="w-full h-full object-cover blur-2xl"
        />
      </div>

      <AchievementManager
        achievements={newAchievements}
        onDismiss={(id) => setNewAchievements((prev) => prev.filter((a) => a !== id))}
      />

      {/* XP Gain HUD */}
      <AnimatePresence>
        {showXPGain && (
          <motion.div
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 glass-panel border-[#FFB300]/40 text-[#FFB300] px-6 py-2 rounded-full shadow-[0_0_20px_rgba(255,179,0,0.3)] flex items-center gap-2"
            initial={{ opacity: 0, y: -50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.9 }}
          >
            <Zap size={14} className="fill-[#FFB300]" />
            <span className="font-black text-sm tracking-widest">+{xpGained} XP</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Left Interface Panel */}
      <motion.div
        className="w-72 flex-shrink-0 glass-panel border-r border-white/5 flex flex-col z-20"
        initial={{ x: -300 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Terminal Header */}
        <div className="px-6 py-8 border-b border-white/5">
          <div className="flex items-center gap-3">
            <HolographicEyeLogo size={40} animated={true} />
            <div>
              <span className="text-[#00E5FF] font-black text-xl tracking-tighter drop-shadow-[0_0_10px_rgba(0,229,255,0.4)]">
                EYEQ
              </span>
              <div className="text-white/20 text-[0.5rem] tracking-[0.4em] font-mono mt-0.5">
                NEURAL_LINK_v2
              </div>
            </div>
          </div>
        </div>

        {/* Biometric Stats */}
        <div className="px-6 py-6 border-b border-white/5 space-y-6">
          <XPBar currentXP={userProgress.xp} level={userProgress.level} size="sm" />
          <div className="flex justify-center">
            <StreakDisplay streak={userProgress.streak} size="sm" />
          </div>
        </div>

        {/* Subject Profiler */}
        <div className="px-6 py-6 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl glass-panel border-[#00E5FF]/20 flex items-center justify-center bg-[#00E5FF]/5">
              <User size={18} className="text-[#00E5FF]" />
            </div>
            <div>
              <p className="text-[#00E5FF] font-black text-xs tracking-widest">
                {firstName}
              </p>
              <p className="text-white/20 text-[0.6rem] font-mono uppercase">
                Rank: Resident
              </p>
            </div>
          </div>
        </div>

        {/* Active Protocol */}
        <div className="px-6 py-6 border-b border-white/5 flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-2 mb-4">
            <Terminal size={14} className="text-[#00E5FF]" />
            <span className="text-white/20 text-[0.6rem] font-mono uppercase tracking-[0.2em]">
              Active_Protocol
            </span>
          </div>
          <div className="glass-panel p-4 rounded-xl border-[#00E5FF]/10 bg-[#00E5FF]/5 mb-6">
            <p className="text-white text-xs font-bold leading-relaxed">
              {SAMPLE_TOPIC}
            </p>
          </div>

          <div className="space-y-2">
            <span className="text-white/10 text-[0.5rem] font-mono uppercase tracking-widest block mb-2">Node_History</span>
            {[
              { label: "Neural Init", active: false },
              { label: "Retinal Mapping", active: true },
              { label: "VEGF Synthesis", active: false },
              { label: "Diagnostic Matrix", active: false },
            ].map((topic, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                  topic.active
                    ? "bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/20 shadow-[0_0_15px_rgba(0,229,255,0.1)]"
                    : "text-white/20 hover:text-white/40"
                }`}
              >
                <div className={`w-1 h-1 rounded-full ${topic.active ? "bg-[#00E5FF] shadow-[0_0_5px_#00E5FF]" : "bg-white/10"}`} />
                <span className="text-[0.7rem] font-mono uppercase tracking-tighter">{topic.label}</span>
                {topic.active && <Activity size={10} className="ml-auto animate-pulse" />}
              </div>
            ))}
          </div>
        </div>

        {/* Session Control */}
        <div className="p-6 border-t border-white/5 space-y-3">
          <button
            onClick={() => navigate("/flashcards")}
            className="w-full flex items-center gap-3 px-4 h-12 rounded-xl glass-panel border-[#00E5FF]/20 text-[#00E5FF] hover:bg-[#00E5FF]/10 transition-all font-black uppercase text-[0.65rem] tracking-widest"
          >
            <Layers size={14} />
            Memory Slates
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="w-full flex items-center gap-3 px-4 h-12 rounded-xl text-white/20 hover:text-[#FF3D00] hover:border-[#FF3D00]/20 transition-all font-mono uppercase text-[0.65rem] tracking-widest"
          >
            <RotateCcw size={14} />
            End Protocol
          </button>
        </div>
      </motion.div>

      {/* Main Terminal Area */}
      <div className="flex-1 flex flex-col min-w-0 z-10 relative">
        {/* Terminal Header Bar */}
        <div className="flex-shrink-0 glass-panel border-b border-white/5 px-8 h-20 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-2 h-2 rounded-full bg-[#39FF14] animate-pulse shadow-[0_0_8px_#39FF14]" />
              <h2 className="text-white font-black uppercase tracking-tight text-sm">
                Inquiry Node: {SAMPLE_TOPIC}
              </h2>
            </div>
            <p className="text-white/20 text-[0.6rem] font-mono uppercase tracking-[0.2em]">
              Exchanges: {messages.length} // Buffer: 1024KB
            </p>
          </div>
          
          <div className="flex gap-4">
            <div className="flex flex-col items-end">
              <span className="text-white/20 text-[0.5rem] font-mono uppercase">Encryption</span>
              <span className="text-[#39FF14] text-[0.7rem] font-mono">AES-256-GCM</span>
            </div>
            <div className="w-px h-8 bg-white/5" />
            <div className="flex flex-col items-end">
              <span className="text-white/20 text-[0.5rem] font-mono uppercase">Latency</span>
              <span className="text-[#00E5FF] text-[0.7rem] font-mono">14ms</span>
            </div>
          </div>
        </div>

        {/* Conversation Stream */}
        <div className="flex-1 overflow-y-auto px-8 py-10 space-y-8 custom-scrollbar">
          <div className="flex flex-col items-center gap-4 mb-12">
            <div className="h-px w-32 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <span className="text-white/10 text-[0.55rem] font-mono uppercase tracking-[0.5em]">
              Data_Stream_Initialized
            </span>
          </div>

          {messages.map((msg) =>
            msg.type === "ai" ? (
              <AIMessageBubble key={msg.id} message={msg} />
            ) : (
              <UserMessageBubble key={msg.id} message={msg} />
            )
          )}

          {/* AI Thinking Interface */}
          {isTyping && (
            <motion.div 
              className="flex gap-4 items-start"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-xl glass-panel border-[#00E5FF]/30 flex items-center justify-center mt-1 bg-[#00E5FF]/5">
                <Bot size={20} className="text-[#00E5FF] animate-pulse" />
              </div>
              <div className="glass-panel rounded-2xl border-l-4 border-l-[#00E5FF] px-6 py-4 flex items-center gap-2">
                <span className="text-[#00E5FF] font-mono text-xs uppercase tracking-[0.2em] animate-pulse">
                  Processing_Neural_Response
                </span>
                <div className="flex gap-1 ml-2">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-1 h-1 bg-[#00E5FF] rounded-full"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Interface */}
        <div className="flex-shrink-0 p-8">
          <div className="max-w-4xl mx-auto relative group">
            {/* Input Border Glow */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-[#00E5FF]/0 via-[#00E5FF]/20 to-[#00E5FF]/0 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
            
            <div className="relative glass-panel rounded-2xl overflow-hidden flex items-end gap-2 p-2 border-white/5 bg-black/80">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="INPUT INQUIRY COMMAND..."
                rows={1}
                className="flex-1 bg-transparent px-6 py-4 text-[#00E5FF] placeholder-[#00E5FF]/20 outline-none resize-none font-mono text-sm leading-relaxed min-h-[56px] max-h-[160px]"
              />
              <motion.button
                onClick={sendMessage}
                disabled={!input.trim() || isTyping}
                className={`w-14 h-12 rounded-xl flex items-center justify-center transition-all ${
                  input.trim() && !isTyping
                    ? "bg-[#00E5FF] text-black shadow-[0_0_20px_rgba(0,229,255,0.4)]"
                    : "bg-white/5 text-white/10 cursor-not-allowed"
                }`}
                whileHover={input.trim() && !isTyping ? { scale: 1.05 } : undefined}
                whileTap={input.trim() && !isTyping ? { scale: 0.95 } : undefined}
              >
                <Send size={18} />
              </motion.button>
            </div>
            
            <div className="flex justify-between mt-3 px-2">
              <p className="text-white/10 text-[0.55rem] font-mono uppercase tracking-widest">
                [ENTER] SEND // [SHIFT+ENTER] NEW_LINE
              </p>
              <div className="flex gap-4">
                <span className="text-[#39FF14]/40 text-[0.55rem] font-mono uppercase">Vocal_Input: Disabled</span>
                <span className="text-[#00E5FF]/40 text-[0.55rem] font-mono uppercase">Mode: Diagnostic</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
