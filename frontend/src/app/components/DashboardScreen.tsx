import React from "react";
import { useNavigate } from "react-router";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { MessageCircle, Stethoscope, BookOpen, ArrowUpRight, LogOut, BarChart2 } from "lucide-react";
import { useAuth } from "./AuthContext";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { cardContainerVariants, cardItemVariants } from "../utils/motionVariants";

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

const ROLE_OPTIONS = ["OA", "OT", "PSA"] as const;

export function DashboardScreen() {
  const navigate = useNavigate();
  const { user, authHeaders, logout, setStudentRole, setMustChangePassword } = useAuth();
  const firstName = (user?.fullName || "Student").split(" ")[0];

  const [suggestion, setSuggestion] = React.useState<string | null>(null);
  const [roleChanging, setRoleChanging] = React.useState(false);

  React.useEffect(() => {
    if (user?.studentId) {
      fetch("/api/study-suggestion", { headers: { ...authHeaders } })
        .then((r) => r.json())
        .then((data) => setSuggestion(data.suggestion))
        .catch(() => setSuggestion("Review your weakest topics today."));
    }
  }, [user, authHeaders]);

  const handleRoleChange = async (role: "OA" | "OT" | "PSA") => {
    if (!user?.studentId || role === user.studentRole || roleChanging) return;
    setRoleChanging(true);
    try {
      await fetch("/api/profile/role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ role }),
      });
      setStudentRole(role);
    } catch {
      /* silently ignore */
    } finally {
      setRoleChanging(false);
    }
  };

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const springX = useSpring(rawX, { stiffness: 60, damping: 25 });
  const springY = useSpring(rawY, { stiffness: 60, damping: 25 });
  const imgX = useTransform(springX, [-1, 1], [-16, 16]);
  const imgY = useTransform(springY, [-1, 1], [-10, 10]);

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      rawX.set((e.clientX / window.innerWidth) * 2 - 1);
      rawY.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [rawX, rawY]);

  return (
    <div className="min-h-screen aurora-bg relative overflow-hidden">
      {/* Forced password change modal */}
      {user?.mustChangePassword && (
        <ChangePasswordModal
          forced
          onSuccess={() => setMustChangePassword(false)}
        />
      )}

      {/* ===== Top navigation strip ===== */}
      <motion.div
        className="glass-nav sticky top-0 z-30"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="glass-editorial rounded-full p-1.5">
              <HolographicEyeLogo size={28} animated />
            </div>
            <span
              className="holo-text-subtle"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.3rem",
                fontWeight: 500,
                letterSpacing: "-0.01em",
              }}
            >
              EyeBot
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
              <motion.img
                src="/anatomy/eye-hero.png"
                alt=""
                className="w-full h-full object-cover"
                style={{
                  x: imgX,
                  y: imgY,
                  scale: 1.15,
                  filter: "sepia(0.45) brightness(0.88) contrast(1.12) saturate(0.75)",
                }}
                animate={{ scale: [1.15, 1.22, 1.15] }}
                transition={{ scale: { duration: 8, repeat: Infinity, ease: "easeInOut" } }}
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
            className="mb-16 max-w-2xl relative"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
          >
            <motion.img
              src="/anatomy/eye-nerve.png"
              alt="" aria-hidden="true"
              style={{
                position: "absolute", top: "50%", left: "-6rem",
                transform: "translateY(-50%)",
                width: "18rem", pointerEvents: "none", opacity: 0.08,
                filter: "sepia(0.4) saturate(0.6)",
                mixBlendMode: "multiply",
              }}
              animate={{ rotate: [0, 3, 0, -3, 0], scale: [1, 1.04, 1] }}
              transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
            />
            <p className="annotation-label mb-3">Today's Directive</p>
            <blockquote
              className="text-[#1F1A12] italic-display border-l-2 border-[#8C6D3F]/40 pl-6"
              style={{ fontSize: "clamp(1.1rem, 3vw, 1.4rem)", lineHeight: 1.5 }}
            >
              "{suggestion}"
            </blockquote>
          </motion.section>
        )}

        {/* ===== Role selector ===== */}
        <motion.section
          className="mb-14 flex items-center gap-6 flex-wrap"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.38 }}
        >
          <p className="annotation-label">Training track</p>
          <div className="flex items-center gap-2">
            {ROLE_OPTIONS.map((role) => (
              <button
                key={role}
                onClick={() => handleRoleChange(role)}
                disabled={roleChanging}
                className="px-4 py-1.5 rounded-full transition-all disabled:opacity-40"
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  border: `1px solid ${user?.studentRole === role ? "#8C6D3F" : "rgba(31,26,18,0.15)"}`,
                  background: user?.studentRole === role ? "rgba(140,109,63,0.07)" : "transparent",
                  color: user?.studentRole === role ? "#8C6D3F" : "#A39A8E",
                }}
              >
                {role}
              </button>
            ))}
          </div>
        </motion.section>

        {/* ===== Practice modes ===== */}
        <section className="relative">
          {/* Anatomy watermark behind cards */}
          <motion.img
            src="/anatomy/eye-hero.png"
            alt=""
            aria-hidden="true"
            className="anatomy-hero right-0 top-1/2 -translate-y-1/2 w-[40%] max-w-xs"
            style={{ pointerEvents: "none" }}
            animate={{ y: [0, -10, 0], rotate: [0, 1.5, 0, -1.5, 0] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          />

          <motion.div
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
              <p className="annotation-label">Three paths</p>
            </div>

            <motion.div
              className="grid grid-cols-1 md:grid-cols-3 gap-3"
              variants={cardContainerVariants}
              initial="hidden"
              animate="visible"
            >
              {MODES.map(({ icon: Icon, label, description, path }) => (
                <motion.button
                  key={path}
                  onClick={() => navigate(path)}
                  className="text-left glass-editorial iri-border p-8 group card-hover-glow"
                  variants={cardItemVariants}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-start justify-between mb-10">
                    <Icon size={22} strokeWidth={1.25} className="text-[#8C6D3F]" aria-hidden="true" />
                    <ArrowUpRight
                      size={16}
                      strokeWidth={1.25}
                      className="text-[#A39A8E] group-hover:text-[#8C6D3F] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                      aria-hidden="true"
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
            </motion.div>
          </motion.div>
        </section>

        {/* ===== My Progress link ===== */}
        <motion.div
          className="mt-12 flex justify-start"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
        >
          <button
            onClick={() => navigate("/progress")}
            className="inline-flex items-center gap-2 text-[#5C544A] hover:text-[#8C6D3F] transition-colors group"
            style={{ fontSize: "0.85rem" }}
          >
            <BarChart2 size={14} strokeWidth={1.5} />
            My Progress
            <ArrowUpRight size={12} strokeWidth={1.5} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          </button>
        </motion.div>

        {/* ===== Quiet footer ===== */}
        <div className="mt-10 sm:mt-16 pt-8 border-t border-[#1F1A12]/8 flex flex-wrap items-center justify-between gap-2 text-[#A39A8E]" style={{ fontSize: "0.72rem" }}>
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
