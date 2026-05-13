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
import {
  BookOpen,
  Layers,
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
      particleCount: 28,
      spread: 50,
      startVelocity: 22,
      gravity: 0.6,
      ticks: 200,
      origin: { y: 0.45 },
      colors: ["#8C6D3F", "#C4A57B", "#9C7B1F", "#E8D5B0"],
      shapes: ["circle"],
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

  return (
    <div className="min-h-screen aurora-bg relative overflow-hidden">
      {/* Fundus watermark — top right */}
      <motion.img
        src="/anatomy/eye-fundus.png"
        alt="" aria-hidden="true"
        style={{
          position: "absolute", top: "5%", right: "-5%",
          width: "45vw", maxWidth: 420,
          pointerEvents: "none", opacity: 0.1,
          filter: "sepia(0.4) saturate(0.7)",
        }}
        animate={{ y: [0, -14, 0], rotate: [0, 2, 0, -2, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Eye-hero watermark — bottom left */}
      <motion.img
        src="/anatomy/eye-hero.png"
        alt="" aria-hidden="true"
        style={{
          position: "absolute", bottom: "10%", left: "-8%",
          width: "35vw", maxWidth: 320,
          pointerEvents: "none", opacity: 0.06,
          filter: "sepia(0.3) saturate(0.5)",
          mixBlendMode: "multiply",
        }}
        animate={{ scale: [1, 1.05, 1], x: [0, 6, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ===== Top strip ===== */}
      <motion.div
        className="glass-nav sticky top-0 z-30"
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
          <p className="annotation-label mb-4">Session Complete</p>
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
            <span className="italic-display holo-text-subtle">hour</span> of study,
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
          className="mb-20 grid grid-cols-1 md:grid-cols-3 gap-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
        >
          {realStats.map((stat, idx) => (
            <div key={idx} className="glass-editorial p-8">
              <stat.icon size={18} strokeWidth={1.25} className="text-[#8C6D3F] mb-6" />
              <p className="annotation-label mb-2">{stat.label}</p>
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

        {/* ===== Achievements ===== */}
        {userProgress.achievements.length > 0 && (
          <motion.section
            className="mb-20"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <Award size={16} strokeWidth={1.25} className="text-[#8C6D3F]" />
              <p className="annotation-label">Earned this session</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {userProgress.achievements.slice(0, 6).map((achievementId, idx) => {
                const achievement = ACHIEVEMENTS.find((a) => a.id === achievementId);
                if (!achievement) return null;
                return (
                  <motion.div
                    key={achievementId}
                    className="glass-card iri-border p-5 flex items-start gap-4"
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
              <p className="annotation-label">Generated this session · {previewCards.length}</p>
              <p className="text-[#A39A8E]" style={{ fontSize: "0.75rem" }}>Queued for spaced repetition</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {previewCards.map((card, idx) => (
                <motion.div
                  key={card.id}
                  className="glass-card iri-border p-5 cursor-pointer group"
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
            className="flex-1 inline-flex items-center justify-center gap-2 px-8 py-4 iri-border-pill"
            style={{
              fontWeight: 500,
              fontSize: "0.95rem",
              letterSpacing: "0.02em",
            }}
            whileHover={{ y: -1, scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            Review cards now
            <ArrowRight size={15} strokeWidth={1.5} />
          </motion.button>
          <motion.button
            onClick={() => navigate("/dashboard")}
            className="flex-1 inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-transparent border border-[#1F1A12]/12 text-[#1F1A12] hover:bg-[#1F1A12]/4 transition-all"
            style={{ fontWeight: 500, fontSize: "0.95rem", letterSpacing: "0.02em" }}
            whileHover={{ y: -1, scale: 1.01 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
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
