import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import confetti from "canvas-confetti";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { XPBar } from "./XPBar";
import { StreakDisplay } from "./StreakDisplay";
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
  Check,
  ChevronRight,
  Home,
  ArrowRight,
  Award,
  HelpCircle,
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
  const firstName = (userData.fullName || "Student").split(" ")[0];

  useEffect(() => {
    addXP(XP_REWARDS.sessionComplete);
    setUserProgress(getUserProgress());
    checkAndUnlockAchievements();

    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.5 },
      colors: ["#8C6D3F", "#C4A57B", "#4F6B3D", "#FBF8F1"],
    });
  }, []);

  const realStats = [
    {
      icon: BookOpen,
      label: "Topic",
      value: sessionData.topic,
    },
    {
      icon: Layers,
      label: "Cards generated",
      value: `${sessionData.flashcardsGenerated}`,
      subvalue: "ready for review",
    },
    {
      icon: HelpCircle,
      label: "Questions explored",
      value: `${sessionData.questionsAnswered}`,
      subvalue: "in conversation",
    },
  ];

  const previewCards = sessionData.cards.slice(0, 6).map((c, i) => ({
    id: i + 1,
    tag: c.topic_tag,
    question: c.front,
    preview: c.back.slice(0, 100) + (c.back.length > 100 ? "…" : ""),
  }));

  const performanceData = [
    { name: "Easy", value: 2, color: "#4F6B3D" },
    { name: "Good", value: 2, color: "#8C6D3F" },
    { name: "Hard", value: 1, color: "#9C7B1F" },
  ];

  const topics = ["Pathophysiology", "Clinical staging", "Management", "Investigations"];

  return (
    <div className="min-h-screen bg-[#FBF8F1]">
      {/* ===== Top strip ===== */}
      <motion.div
        className="border-b border-[#1F1A12]/8 bg-[#FBF8F1]/80 backdrop-blur-sm sticky top-0 z-30"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-5xl mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HolographicEyeLogo size={28} animated={false} />
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
              Session report
            </span>
          </div>
          <div className="flex items-center gap-4">
            <StreakDisplay streak={userProgress.streak} size="sm" />
            <button
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center gap-2 text-[#5C544A] hover:text-[#1F1A12] transition-colors text-sm"
            >
              <Home size={14} strokeWidth={1.5} />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
          </div>
        </div>
      </motion.div>

      <div className="max-w-5xl mx-auto px-8 py-16">
        {/* ===== Editorial hero ===== */}
        <motion.section
          className="mb-20"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <p
            className="text-[#8C6D3F] mb-4"
            style={{ fontSize: "0.72rem", letterSpacing: "0.24em", textTransform: "uppercase", fontWeight: 600 }}
          >
            · Session complete
          </p>
          <h1
            className="text-[#1F1A12] max-w-3xl"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2.5rem, 5vw, 4rem)",
              fontWeight: 400,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            A quiet, considered{" "}
            <span className="italic-display">hour</span> of study,
            <br />
            {firstName}.
          </h1>
          <p
            className="mt-6 text-[#5C544A] max-w-xl"
            style={{ fontSize: "1.05rem", lineHeight: 1.65, fontWeight: 300 }}
          >
            You explored <span className="text-[#1F1A12]">{sessionData.topic}</span>. The cards from this session will resurface tomorrow, when memory is most in need of refreshing.
          </p>
        </motion.section>

        {/* ===== XP rail ===== */}
        <motion.section
          className="mb-16 max-w-2xl"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          <XPBar currentXP={userProgress.xp} level={userProgress.level} size="lg" />
        </motion.section>

        {/* ===== Stats row ===== */}
        <motion.section
          className="mb-20 grid grid-cols-1 md:grid-cols-3 gap-0 bg-[#1F1A12]/8 border border-[#1F1A12]/8 rounded-2xl overflow-hidden"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          style={{ gap: "1px" }}
        >
          {realStats.map((stat, idx) => (
            <div key={idx} className="bg-white p-8">
              <stat.icon size={18} strokeWidth={1.25} className="text-[#8C6D3F] mb-6" />
              <p
                className="text-[#A39A8E] mb-2"
                style={{ fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}
              >
                {stat.label}
              </p>
              <p
                className="text-[#1F1A12]"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.6rem",
                  fontWeight: 400,
                  lineHeight: 1.1,
                  letterSpacing: "-0.01em",
                }}
              >
                {stat.value}
              </p>
              {stat.subvalue && (
                <p className="mt-1 text-[#5C544A]" style={{ fontSize: "0.82rem", fontWeight: 300 }}>
                  {stat.subvalue}
                </p>
              )}
            </div>
          ))}
        </motion.section>

        {/* ===== Performance + topics ===== */}
        <motion.section
          className="mb-20 grid md:grid-cols-2 gap-12"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
        >
          {/* Pie */}
          <div>
            <p
              className="text-[#8C6D3F] mb-6"
              style={{ fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}
            >
              · Recall quality
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={performanceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={62}
                  outerRadius={88}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="#FBF8F1"
                  strokeWidth={3}
                >
                  {performanceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    border: "1px solid rgba(31, 26, 18, 0.08)",
                    borderRadius: "12px",
                    color: "#1F1A12",
                    fontFamily: "var(--font-body)",
                    fontSize: "0.82rem",
                    boxShadow: "0 8px 24px rgba(31,26,18,0.06)",
                    padding: "8px 12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 flex justify-center gap-6">
              {performanceData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                  <span className="text-[#5C544A]" style={{ fontSize: "0.78rem" }}>
                    {d.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Topics */}
          <div>
            <p
              className="text-[#8C6D3F] mb-6"
              style={{ fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}
            >
              · Topics covered
            </p>
            <ul className="space-y-3">
              {topics.map((topic, idx) => (
                <motion.li
                  key={idx}
                  className="flex items-center gap-3 py-3 border-b border-[#1F1A12]/6 last:border-0"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + idx * 0.08 }}
                >
                  <Check size={14} strokeWidth={1.5} className="text-[#4F6B3D]" />
                  <span
                    className="text-[#1F1A12]"
                    style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 400 }}
                  >
                    {topic}
                  </span>
                </motion.li>
              ))}
            </ul>
          </div>
        </motion.section>

        {/* ===== Achievements ===== */}
        {userProgress.achievements.length > 0 && (
          <motion.section
            className="mb-20"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
          >
            <div className="flex items-baseline gap-3 mb-6">
              <Award size={16} strokeWidth={1.25} className="text-[#8C6D3F]" />
              <p
                className="text-[#8C6D3F]"
                style={{ fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}
              >
                · Earned
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {userProgress.achievements.slice(0, 6).map((achievementId, idx) => {
                const achievement = ACHIEVEMENTS.find((a) => a.id === achievementId);
                if (!achievement) return null;
                return (
                  <motion.div
                    key={achievementId}
                    className="surface-card p-5 flex items-start gap-4"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 + idx * 0.06 }}
                  >
                    <span className="text-2xl">{achievement.icon}</span>
                    <div>
                      <p
                        className="text-[#1F1A12]"
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: "1rem",
                          fontWeight: 400,
                          letterSpacing: "-0.005em",
                        }}
                      >
                        {achievement.name}
                      </p>
                      <p className="text-[#5C544A] mt-0.5" style={{ fontSize: "0.78rem", lineHeight: 1.4 }}>
                        {achievement.description}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.section>
        )}

        {/* ===== Generated cards ===== */}
        {previewCards.length > 0 && (
          <motion.section
            className="mb-20"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.6 }}
          >
            <div className="flex items-baseline justify-between mb-6">
              <p
                className="text-[#8C6D3F]"
                style={{ fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}
              >
                · Generated this session · {previewCards.length}
              </p>
              <p className="text-[#A39A8E]" style={{ fontSize: "0.75rem" }}>
                Queued for spaced repetition
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {previewCards.map((card, idx) => (
                <motion.div
                  key={card.id}
                  className="surface-card p-5 cursor-pointer group"
                  onClick={() => navigate("/flashcards")}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 + idx * 0.06 }}
                  whileHover={{
                    y: -2,
                    borderColor: "rgba(140,109,63,0.25)",
                    boxShadow: "0 1px 2px rgba(31,26,18,0.04), 0 12px 32px rgba(31,26,18,0.08)",
                  }}
                >
                  <p
                    className="text-[#8C6D3F] mb-3"
                    style={{ fontSize: "0.66rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600 }}
                  >
                    {card.tag}
                  </p>
                  <p
                    className="text-[#1F1A12] mb-2"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "0.98rem",
                      fontWeight: 400,
                      lineHeight: 1.4,
                    }}
                  >
                    {card.question}
                  </p>
                  <p className="text-[#5C544A]" style={{ fontSize: "0.82rem", lineHeight: 1.55 }}>
                    {card.preview}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {/* ===== CTAs ===== */}
        <motion.section
          className="flex flex-col sm:flex-row gap-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.8 }}
        >
          <motion.button
            onClick={() => navigate("/flashcards")}
            className="flex-1 inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-[#8C6D3F] text-[#FBF8F1]"
            style={{
              fontWeight: 500,
              fontSize: "0.95rem",
              letterSpacing: "0.02em",
              boxShadow: "0 1px 2px rgba(140,109,63,0.18), 0 8px 24px rgba(140,109,63,0.18)",
            }}
            whileHover={{ y: -1 }}
            whileTap={{ y: 0 }}
          >
            Review cards now
            <ArrowRight size={15} strokeWidth={1.5} />
          </motion.button>
          <motion.button
            onClick={() => navigate("/dashboard")}
            className="flex-1 inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-transparent border border-[#1F1A12]/12 text-[#1F1A12] hover:bg-[#1F1A12]/4 transition-all"
            style={{ fontWeight: 500, fontSize: "0.95rem", letterSpacing: "0.02em" }}
            whileHover={{ y: -1 }}
            whileTap={{ y: 0 }}
          >
            <Home size={14} strokeWidth={1.5} />
            Return to dashboard
          </motion.button>
        </motion.section>

        <p
          className="mt-12 text-center text-[#A39A8E] italic-display"
          style={{ fontSize: "0.92rem" }}
        >
          Your next review is suggested for tomorrow.
        </p>
      </div>
    </div>
  );
}
