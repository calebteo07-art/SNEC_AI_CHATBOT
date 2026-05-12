import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import confetti from "canvas-confetti";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { XPBar } from "./XPBar";
import { StreakDisplay } from "./StreakDisplay";
import { ParticleBackground } from "./ParticleBackground";
import {
  getUserProgress,
  addXP,
  checkAndUnlockAchievements,
  XP_REWARDS,
  ACHIEVEMENTS,
} from "../utils/gamification";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  BookOpen,
  Layers,
  CheckCircle2,
  ChevronRight,
  Home,
  Trophy,
  ArrowRight,
  HelpCircle,
  Target,
  Award,
  Cpu,
  Activity,
} from "lucide-react";

function loadSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem("eyeq_session") || "{}");
    const cards: { front: string; back: string; topic_tag: string }[] = Array.isArray(s.cards) ? s.cards : [];
    return {
      topic: s.topic || "Ophthalmology",
      flashcardsGenerated: cards.length,
      questionsAnswered: Math.max(0, Math.floor((s.messageCount || 2) / 2)),
      cards,
    };
  } catch {
    return { topic: "Ophthalmology", flashcardsGenerated: 0, questionsAnswered: 0, cards: [] };
  }
}

export function SummaryScreen() {
  const navigate = useNavigate();
  const [userProgress, setUserProgress] = useState(getUserProgress());
  const sessionData = loadSession();

  const userData = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("eyeq_user") || "{}");
    } catch {
      return { fullName: "Student" };
    }
  })();
  const firstName = (userData.fullName || "Student").split(" ")[0].toUpperCase();

  useEffect(() => {
    addXP(XP_REWARDS.sessionComplete);
    setUserProgress(getUserProgress());
    checkAndUnlockAchievements();

    confetti({
      particleCount: 120,
      spread: 100,
      origin: { y: 0.5 },
      colors: ["#00E5FF", "#39FF14", "#FFB300", "#F0F9FF"],
    });
    setTimeout(() => {
      confetti({
        particleCount: 80,
        spread: 90,
        origin: { y: 0.6 },
        colors: ["#00E5FF", "#39FF14"],
      });
    }, 500);
  }, []);

  const realStats = [
    {
      icon: BookOpen,
      label: "Topic_Module",
      value: sessionData.topic,
      accent: "#00E5FF",
    },
    {
      icon: Layers,
      label: "Slates_Generated",
      value: `${sessionData.flashcardsGenerated}`,
      subvalue: "queued_for_review",
      accent: "#FFB300",
    },
    {
      icon: HelpCircle,
      label: "Queries_Resolved",
      value: `${sessionData.questionsAnswered}`,
      subvalue: "neural_exchanges",
      accent: "#39FF14",
    },
  ];

  const previewCards = sessionData.cards.slice(0, 6).map((c, i) => ({
    id: i + 1,
    tag: c.topic_tag,
    question: c.front,
    preview: c.back.slice(0, 80) + (c.back.length > 80 ? "…" : ""),
  }));

  const performanceData = [
    { name: "Mastered", value: 2, color: "#39FF14" },
    { name: "Verified", value: 2, color: "#00E5FF" },
    { name: "Partial", value: 1, color: "#FFB300" },
  ];

  const topics = ["Pathophysiology", "Clinical Staging", "Management", "Investigations"];

  return (
    <div className="min-h-screen bg-black flex flex-col relative overflow-hidden scanline">
      {/* Anatomical Backdrop */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 grid-pattern opacity-25" />
        <ParticleBackground density={40} color="#00E5FF" />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full opacity-[0.08] blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(0,229,255,0.6) 0%, transparent 70%)",
          }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 8, repeat: Infinity }}
        />
      </div>

      {/* Header */}
      <motion.div
        className="relative z-20 glass-panel border-b border-white/5 px-6 py-4 flex items-center justify-between"
        initial={{ y: -60 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="flex items-center gap-3">
          <HolographicEyeLogo size={40} animated />
          <div>
            <p
              className="text-[#00E5FF] font-black uppercase tracking-[0.2em] glow-text-teal"
              style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem" }}
            >
              EyeQ
            </p>
            <p className="text-white/30 text-[0.5rem] uppercase tracking-[0.4em] font-mono">
              Diagnostic_Report_v2
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <StreakDisplay streak={userProgress.streak} size="md" />
          <motion.button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white/50 hover:text-[#00E5FF] hover:border-[#00E5FF]/40 transition-all font-mono text-[0.65rem] uppercase tracking-widest"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
          >
            <Home size={13} />
            Core_Interface
          </motion.button>
        </div>
      </motion.div>

      {/* Animated diagnostic bar */}
      <motion.div
        className="relative z-10 h-1 bg-gradient-to-r from-[#00E5FF] via-[#39FF14] to-[#00E5FF]"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
        style={{
          transformOrigin: "left",
          boxShadow: "0 0 15px rgba(0,229,255,0.5)",
        }}
      >
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
          animate={{ x: ["-100%", "200%"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        />
      </motion.div>

      <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-10 relative z-10">
        {/* Result Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <motion.div
            className="inline-flex items-center justify-center w-24 h-24 rounded-2xl mb-6 relative"
            style={{
              background:
                "radial-gradient(circle, rgba(0,229,255,0.25) 0%, rgba(0,0,0,0.5) 70%)",
              border: "1px solid rgba(0,229,255,0.4)",
              boxShadow:
                "0 0 40px rgba(0,229,255,0.4), inset 0 0 20px rgba(0,229,255,0.15)",
            }}
            animate={{
              boxShadow: [
                "0 0 40px rgba(0,229,255,0.4), inset 0 0 20px rgba(0,229,255,0.15)",
                "0 0 60px rgba(0,229,255,0.6), inset 0 0 30px rgba(0,229,255,0.25)",
                "0 0 40px rgba(0,229,255,0.4), inset 0 0 20px rgba(0,229,255,0.15)",
              ],
            }}
            transition={{ duration: 2.5, repeat: Infinity }}
          >
            <Trophy size={36} className="text-[#00E5FF]" />
            <motion.div
              className="absolute -inset-2 rounded-2xl border border-[#00E5FF]/40"
              animate={{ scale: [1, 1.18], opacity: [0.5, 0] }}
              transition={{ duration: 2.5, repeat: Infinity }}
            />
          </motion.div>

          <div className="flex items-center gap-3 justify-center mb-3">
            <span className="h-px w-12 bg-[#00E5FF]/30" />
            <span
              className="text-[#00E5FF] font-mono text-[0.65rem] uppercase tracking-[0.4em] glow-text-teal"
            >
              Protocol_Complete
            </span>
            <span className="h-px w-12 bg-[#00E5FF]/30" />
          </div>

          <motion.h1
            className="text-white uppercase mb-4 glow-text-teal"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "2.6rem",
              fontWeight: 900,
              letterSpacing: "0.05em",
              textShadow: "0 0 30px rgba(0,229,255,0.4)",
            }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            Mission Successful
          </motion.h1>
          <motion.p
            className="text-white/60 max-w-md mx-auto font-mono"
            style={{ fontSize: "0.85rem", lineHeight: 1.6 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            Operator{" "}
            <span className="text-[#00E5FF] font-bold glow-text-teal">
              {firstName}
            </span>{" "}
            // Module{" "}
            <span className="text-[#39FF14] font-bold glow-text-green">
              {sessionData.topic}
            </span>{" "}
            // Sync confirmed
          </motion.p>
        </motion.div>

        {/* XP Progress */}
        <motion.div
          className="mb-10 glass-panel rounded-2xl p-6 hud-corners border-[#00E5FF]/15"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Activity size={14} className="text-[#00E5FF]" />
            <span className="text-white/40 font-mono text-[0.6rem] uppercase tracking-[0.35em]">
              Neural_XP_Trajectory
            </span>
          </div>
          <XPBar
            currentXP={userProgress.xp}
            level={userProgress.level}
            size="lg"
          />
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
          {realStats.map((stat, idx) => (
            <motion.div
              key={idx}
              className="glass-panel rounded-2xl p-6 hud-corners relative overflow-hidden group"
              style={{ borderColor: `${stat.accent}25` }}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 + idx * 0.1, duration: 0.5 }}
              whileHover={{ y: -4 }}
            >
              <div
                className="absolute top-0 left-0 w-1 h-full"
                style={{ background: stat.accent, boxShadow: `0 0 15px ${stat.accent}` }}
              />
              <div className="absolute top-3 right-3">
                <div
                  className="w-1.5 h-1.5 rounded-full hud-blink"
                  style={{ background: stat.accent }}
                />
              </div>
              <motion.div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 relative"
                style={{
                  background: `radial-gradient(circle, ${stat.accent}25 0%, transparent 70%)`,
                  border: `1px solid ${stat.accent}40`,
                }}
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.7 }}
              >
                <stat.icon size={20} style={{ color: stat.accent }} />
              </motion.div>
              <div
                className="text-white mb-1 glow-text-teal"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.4rem",
                  fontWeight: 800,
                  lineHeight: 1.1,
                }}
              >
                {stat.value}
              </div>
              {stat.subvalue && (
                <div
                  className="font-mono mb-1"
                  style={{ color: stat.accent, fontSize: "0.6rem", letterSpacing: "0.15em" }}
                >
                  {stat.subvalue.toUpperCase()}
                </div>
              )}
              <div className="text-white/40 font-mono text-[0.6rem] uppercase tracking-[0.25em]">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Performance + Topics Row */}
        <div className="grid md:grid-cols-2 gap-6 mb-10">
          {/* Performance Pie */}
          <motion.div
            className="glass-panel rounded-2xl p-6 hud-corners border-[#00E5FF]/15"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.1, duration: 0.5 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Target size={14} className="text-[#00E5FF]" />
              <span className="text-white/50 font-mono text-[0.6rem] uppercase tracking-[0.35em]">
                Performance_Spectrum
              </span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={performanceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={6}
                  dataKey="value"
                  stroke="rgba(0,0,0,0.5)"
                  strokeWidth={2}
                >
                  {performanceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(5, 8, 15, 0.95)",
                    border: "1px solid rgba(0, 229, 255, 0.3)",
                    borderRadius: "8px",
                    color: "#F0F9FF",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.75rem",
                    boxShadow: "0 0 20px rgba(0,229,255,0.2)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              {performanceData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: d.color, boxShadow: `0 0 8px ${d.color}` }}
                  />
                  <span className="text-white/70 font-mono text-[0.6rem] uppercase tracking-widest">
                    {d.name}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Topics Mastered */}
          <motion.div
            className="glass-panel rounded-2xl p-6 hud-corners border-[#39FF14]/15"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.2, duration: 0.5 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Cpu size={14} className="text-[#39FF14]" />
              <span className="text-white/50 font-mono text-[0.6rem] uppercase tracking-[0.35em]">
                Modules_Indexed
              </span>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {topics.map((topic, idx) => (
                <motion.div
                  key={idx}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg relative overflow-hidden"
                  style={{
                    background: "rgba(57,255,20,0.05)",
                    border: "1px solid rgba(57,255,20,0.3)",
                  }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.3 + idx * 0.1 }}
                  whileHover={{
                    scale: 1.06,
                    boxShadow: "0 0 20px rgba(57,255,20,0.3)",
                  }}
                >
                  <CheckCircle2 size={12} className="text-[#39FF14]" />
                  <span
                    className="text-[#39FF14] font-mono uppercase tracking-wider glow-text-green"
                    style={{ fontSize: "0.7rem", fontWeight: 600 }}
                  >
                    {topic}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Achievements */}
        <motion.div
          className="mb-10 glass-panel rounded-2xl p-6 hud-corners border-[#FFB300]/20 relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.3, duration: 0.5 }}
        >
          <motion.div
            className="absolute top-0 left-0 h-px w-full"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, #FFB300 50%, transparent 100%)",
            }}
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          />
          <div className="flex items-center gap-2 mb-4">
            <Award size={16} className="text-[#FFB300]" />
            <span
              className="text-[#FFB300] font-mono text-[0.65rem] uppercase tracking-[0.35em] glow-text-amber"
            >
              Achievement_Crystals
            </span>
            <span className="text-white/20 font-mono text-[0.55rem] uppercase">
              :: {userProgress.achievements.length} unlocked
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            {userProgress.achievements.slice(0, 6).map((achievementId, idx) => {
              const achievement = ACHIEVEMENTS.find((a) => a.id === achievementId);
              if (!achievement) return null;
              return (
                <motion.div
                  key={achievementId}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl glass-panel border-white/10 relative"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.4 + idx * 0.1 }}
                  whileHover={{
                    scale: 1.05,
                    y: -2,
                    boxShadow: "0 0 20px rgba(255,179,0,0.25)",
                  }}
                >
                  <span className="text-2xl">{achievement.icon}</span>
                  <div>
                    <div
                      className="text-white font-black uppercase tracking-tight glow-text-amber"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "0.8rem",
                      }}
                    >
                      {achievement.name}
                    </div>
                    <div className="text-white/40 font-mono text-[0.6rem] uppercase tracking-widest">
                      {achievement.description}
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {userProgress.achievements.length === 0 && (
              <p className="text-white/40 font-mono text-xs uppercase tracking-widest">
                No_crystals_indexed // Continue training
              </p>
            )}
          </div>
        </motion.div>

        {/* Generated Flashcards */}
        {previewCards.length > 0 && (
          <motion.div
            className="mb-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.5 }}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <Layers size={16} className="text-[#00E5FF]" />
                <span
                  className="text-white font-black uppercase tracking-wide glow-text-teal"
                  style={{ fontFamily: "var(--font-display)", fontSize: "0.95rem" }}
                >
                  Generated Memory Slates
                </span>
                <motion.span
                  className="bg-[#00E5FF] text-black rounded-md w-6 h-6 flex items-center justify-center font-mono text-[0.65rem] font-bold"
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{ boxShadow: "0 0 15px rgba(0,229,255,0.5)" }}
                >
                  {previewCards.length}
                </motion.span>
              </div>
              <span className="text-white/30 font-mono text-[0.6rem] uppercase tracking-[0.25em]">
                Queued_for_Spaced_Repetition
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {previewCards.map((card, idx) => (
                <motion.div
                  key={card.id}
                  className="glass-panel rounded-2xl p-5 cursor-pointer group hud-corners relative overflow-hidden"
                  onClick={() => navigate("/flashcards")}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.6 + idx * 0.08 }}
                  whileHover={{
                    y: -4,
                    boxShadow: "0 0 30px rgba(0,229,255,0.2)",
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className="px-2.5 py-1 rounded-md text-[0.55rem] font-mono uppercase tracking-widest"
                      style={{
                        background: "rgba(0,229,255,0.1)",
                        border: "1px solid rgba(0,229,255,0.3)",
                        color: "#00E5FF",
                      }}
                    >
                      {card.tag}
                    </span>
                    <span className="text-white/20 font-mono text-[0.6rem] tracking-widest">
                      #{String(idx + 1).padStart(3, "0")}
                    </span>
                  </div>
                  <p
                    className="text-white mb-2.5"
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: "0.85rem",
                      fontWeight: 500,
                      lineHeight: 1.5,
                    }}
                  >
                    {card.question}
                  </p>
                  <p
                    className="text-white/50 font-mono"
                    style={{ fontSize: "0.7rem", lineHeight: 1.6 }}
                  >
                    {card.preview}
                  </p>
                  <div className="flex items-center gap-1 text-[#00E5FF] mt-3 opacity-0 group-hover:opacity-100 transition-opacity font-mono text-[0.6rem] uppercase tracking-widest">
                    <span>Open_Slate</span>
                    <ChevronRight size={11} />
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* CTA Buttons */}
        <motion.div
          className="flex flex-col sm:flex-row gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2, duration: 0.5 }}
        >
          <motion.button
            onClick={() => navigate("/flashcards")}
            className="flex-1 relative overflow-hidden group rounded-2xl h-16 bg-[#00E5FF] text-black font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(0,229,255,0.4)]"
            style={{ fontFamily: "var(--font-display)", fontSize: "0.95rem" }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
            <Layers size={20} />
            <span className="relative z-10">Review_Slates</span>
            <ArrowRight size={18} />
          </motion.button>
          <motion.button
            onClick={() => navigate("/")}
            className="flex-1 rounded-2xl h-16 glass-panel border-white/10 text-white flex items-center justify-center gap-3 hover:border-[#00E5FF]/40 transition-all font-black uppercase tracking-[0.2em]"
            style={{ fontFamily: "var(--font-display)", fontSize: "0.95rem" }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
          >
            <Home size={18} />
            New_Protocol
          </motion.button>
        </motion.div>

        {/* Footnote */}
        <motion.p
          className="text-center text-white/30 mt-8 font-mono text-[0.65rem] uppercase tracking-[0.3em]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.2 }}
        >
          Next_repetition_scheduled ::{" "}
          <span className="text-[#00E5FF] glow-text-teal">T+24h</span>
        </motion.p>
      </div>
    </div>
  );
}
