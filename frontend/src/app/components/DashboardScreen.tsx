import React from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { MessageCircle, Stethoscope, BookOpen, ArrowUpRight, LogOut } from "lucide-react";
import { useAuth } from "./AuthContext";

const MODES = [
  {
    icon: MessageCircle,
    label: "Tutor Chat",
    description: "A Socratic dialogue with the AI tutor",
    path: "/chat",
  },
  {
    icon: Stethoscope,
    label: "Case Simulation",
    description: "Walk through a patient case from history to management",
    path: "/cases",
  },
  {
    icon: BookOpen,
    label: "Flashcards",
    description: "Spaced repetition for long-term retention",
    path: "/flashcards",
  },
];

export function DashboardScreen() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const firstName = (user?.fullName || "Student").split(" ")[0];

  const [suggestion, setSuggestion] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (user?.studentId) {
      fetch(`/api/study-suggestion?student_id=${user.studentId}`)
        .then((r) => r.json())
        .then((data) => setSuggestion(data.suggestion))
        .catch(() => setSuggestion("Review your weakest topics today."));
    }
  }, [user]);

  return (
    <div className="min-h-screen aurora-bg relative overflow-hidden">
      {/* ===== Top navigation strip ===== */}
      <motion.div
        className="glass-nav sticky top-0 z-30"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HolographicEyeLogo size={32} animated />
            <span
              className="text-[#1F1A12]"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.3rem",
                fontWeight: 500,
                letterSpacing: "-0.01em",
              }}
            >
              EyeQ
            </span>
          </div>

          <button
            onClick={logout}
            className="inline-flex items-center gap-2 text-[#5C544A] hover:text-[#1F1A12] transition-colors text-sm"
          >
            <LogOut size={14} strokeWidth={1.5} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </motion.div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10 sm:py-16 relative">
        {/* ===== Editorial hero: greeting + eye medallion ===== */}
        <motion.section
          className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-20 items-center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="lg:col-span-7 order-2 lg:order-1">
            <p
              className="text-[#8C6D3F] mb-4"
              style={{ fontSize: "0.7rem", letterSpacing: "0.24em", textTransform: "uppercase", fontWeight: 600 }}
            >
              · Welcome back
            </p>
            <h1
              className="text-[#1F1A12]"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2.5rem, 5vw, 4rem)",
                fontWeight: 400,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
              }}
            >
              Good morning,
              <br />
              <span className="italic-display holo-text-subtle">{firstName}.</span>
            </h1>
            <p
              className="mt-6 text-[#5C544A] max-w-md"
              style={{ fontSize: "1.05rem", lineHeight: 1.65, fontWeight: 300 }}
            >
              Continue your study where you left off, or choose a different path below. Today is a good day for the small, deliberate work.
            </p>
          </div>

          {/* Eye medallion centerpiece */}
          <div className="lg:col-span-5 order-1 lg:order-2 flex justify-center relative">
            {/* Light-leak glow behind medallion */}
            <div
              className="absolute pointer-events-none"
              style={{
                inset: "-20%",
                background: "radial-gradient(circle, rgba(140,109,63,0.08) 0%, rgba(139,123,175,0.05) 40%, transparent 70%)",
                animation: "light-leak 10s ease-in-out infinite",
                borderRadius: "50%",
                zIndex: 0,
              }}
            />
            <motion.div
              className="eye-medallion relative w-[280px] h-[280px] lg:w-[340px] lg:h-[340px]"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <img
                src="/images/sample_fundus_OD.png"
                alt=""
                className="w-full h-full object-cover sepia brightness-105"
                style={{ filter: "sepia(0.7) brightness(0.95) contrast(1.05) saturate(0.7)" }}
              />
              {/* Inner vignette */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle at center, transparent 45%, rgba(31, 26, 18, 0.35) 100%)",
                }}
              />
            </motion.div>
          </div>
        </motion.section>

        {/* ===== AI Suggestion (if present) ===== */}
        {suggestion && (
          <motion.section
            className="mb-16 max-w-2xl"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
          >
            <p
              className="text-[#8C6D3F] mb-3"
              style={{ fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}
            >
              · A suggestion for today
            </p>
            <blockquote
              className="text-[#1F1A12] italic-display border-l-2 border-[#8C6D3F]/40 pl-6"
              style={{ fontSize: "clamp(1.1rem, 3vw, 1.4rem)", lineHeight: 1.5 }}
            >
              "{suggestion}"
            </blockquote>
          </motion.section>
        )}

        {/* ===== Practice modes ===== */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
        >
          <div className="flex items-baseline justify-between mb-8">
            <h2
              className="text-[#1F1A12]"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.75rem",
                fontWeight: 400,
                letterSpacing: "-0.01em",
              }}
            >
              Practice
            </h2>
            <p className="text-[#A39A8E]" style={{ fontSize: "0.78rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Three paths
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {MODES.map(({ icon: Icon, label, description, path }, i) => (
              <motion.button
                key={path}
                onClick={() => navigate(path)}
                className="text-left glass-card iri-border p-8 group transition-all hover-shadow-holo"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.08 }}
                whileHover={{ y: -1 }}
              >
                <div className="flex items-start justify-between mb-10">
                  <Icon size={22} strokeWidth={1.25} className="text-[#8C6D3F]" />
                  <ArrowUpRight
                    size={16}
                    strokeWidth={1.25}
                    className="text-[#A39A8E] group-hover:text-[#8C6D3F] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                  />
                </div>
                <h3
                  className="text-[#1F1A12] mb-2"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.35rem",
                    fontWeight: 400,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {label}
                </h3>
                <p
                  className="text-[#5C544A]"
                  style={{ fontSize: "0.88rem", lineHeight: 1.6, fontWeight: 300 }}
                >
                  {description}
                </p>
              </motion.button>
            ))}
          </div>
        </motion.section>

        {/* ===== Quiet footer ===== */}
        <div className="mt-16 sm:mt-24 pt-8 border-t border-[#1F1A12]/8 flex flex-wrap items-center justify-between gap-2 text-[#A39A8E]" style={{ fontSize: "0.72rem" }}>
          <span style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Singapore National Eye Centre
          </span>
          <span className="italic-display" style={{ fontSize: "0.85rem" }}>
            Vol. II · 2026
          </span>
        </div>
      </div>
    </div>
  );
}
