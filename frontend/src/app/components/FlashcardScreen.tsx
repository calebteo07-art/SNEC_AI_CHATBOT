import React, { useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import confetti from "canvas-confetti";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { XPBar } from "./XPBar";
import { StreakDisplay } from "./StreakDisplay";
import { AchievementManager } from "./AchievementToast";
import {
  getUserProgress,
  addXP,
  checkAndUnlockAchievements,
  XP_REWARDS,
} from "../utils/gamification";
import {
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Layers,
  Zap,
  Brain,
  CheckCircle,
  XCircle,
  Activity,
  Cpu,
  Database,
} from "lucide-react";

interface Flashcard {
  id: number;
  question: string;
  answer: string;
  tag: string;
}

function loadFlashcards(): Flashcard[] {
  try {
    const session = JSON.parse(sessionStorage.getItem("eyeq_session") || "{}");
    if (Array.isArray(session.cards) && session.cards.length > 0) {
      return session.cards.map(
        (c: { front: string; back: string; topic_tag: string }, i: number) => ({
          id: i + 1,
          question: c.front,
          answer: c.back,
          tag: c.topic_tag,
        })
      );
    }
  } catch {
    /* fall through to defaults */
  }
  return FALLBACK_CARDS;
}

const FALLBACK_CARDS: Flashcard[] = [
  {
    id: 1,
    question:
      "What is the earliest histological finding in diabetic retinopathy, and what is the first clinically visible sign on fundoscopy?",
    answer:
      "Earliest histological finding: Pericyte loss from retinal capillaries — this occurs before any clinically visible changes and is detected on trypsin digest preparations.\n\nFirst visible fundoscopic sign: Microaneurysms (dot-shaped red lesions) — these form due to weakening of capillary walls after pericyte loss.",
    tag: "Pathology",
  },
  {
    id: 2,
    question:
      "Describe the four major pathological pathways activated by chronic hyperglycemia in diabetic retinopathy.",
    answer:
      "1. Polyol Pathway — Aldose reductase converts excess glucose → sorbitol, causing osmotic stress and cellular damage.\n\n2. PKC Activation — Protein kinase C increases VEGF production and enhances vascular permeability.\n\n3. AGE Formation — Advanced glycation end-products cross-link basement membrane proteins, thickening vessel walls and impairing function.\n\n4. Oxidative Stress — ROS generation damages pericytes and endothelial cells, initiating microvascular changes.",
    tag: "Mechanisms",
  },
  {
    id: 3,
    question:
      "What defines Clinically Significant Macular Edema (CSME) according to ETDRS criteria?",
    answer:
      "ETDRS CSME criteria (any one sufficient):\n• Retinal thickening within 500μm of the foveal center\n• Hard exudates within 500μm of the fovea with adjacent thickening\n• Retinal thickening ≥1 disc area, any portion within 1 disc diameter of the fovea\n\nClinical significance: CSME indicates high risk of visual loss requiring treatment — now primarily with anti-VEGF agents for center-involving DME.",
    tag: "Clinical",
  },
  {
    id: 4,
    question:
      "How does VEGF-A cause breakdown of the inner blood-retinal barrier in diabetic macular edema?",
    answer:
      "VEGF-A mediates iBRB breakdown through:\n• Phosphorylation of tight junction proteins occludin and ZO-1\n• This disrupts the integrity of inter-endothelial junctions\n• Plasma proteins and fluid leak into extracellular retinal space\n• Results in retinal thickening visible on OCT\n\nTherapeutic implication: Anti-VEGF agents (ranibizumab, aflibercept, bevacizumab) target this pathway and are now first-line for center-involving DME.",
    tag: "Pharmacology",
  },
  {
    id: 5,
    question:
      "Classify diabetic retinopathy and describe the key distinguishing feature between NPDR and PDR.",
    answer:
      "Classification:\n• Non-Proliferative DR (NPDR): Mild, Moderate, Severe\n• Proliferative DR (PDR): The hallmark is neovascularization\n\nKey distinction: PDR is defined by the presence of new blood vessel formation (neovascularization) on the disc (NVD) or elsewhere (NVE) — driven by chronic ischemia and VEGF overexpression.\n\n4-2-1 Rule (Severe NPDR): >20 microaneurysms in all 4 quadrants, venous beading in ≥2 quadrants, or IRMA in ≥1 quadrant.",
    tag: "Classification",
  },
];

const RATINGS = [
  {
    label: "Again",
    code: "RECYCLE",
    accent: "#FF3D00",
    glow: "rgba(255,61,0,0.35)",
    value: 1,
  },
  {
    label: "Hard",
    code: "PARTIAL",
    accent: "#FFB300",
    glow: "rgba(255,179,0,0.35)",
    value: 2,
  },
  {
    label: "Good",
    code: "VERIFIED",
    accent: "#00E5FF",
    glow: "rgba(0,229,255,0.35)",
    value: 3,
  },
  {
    label: "Easy",
    code: "MASTERED",
    accent: "#39FF14",
    glow: "rgba(57,255,20,0.35)",
    value: 4,
  },
];

const API = "";

interface AiFeedback {
  feedback: string;
  score: number;
}

export function FlashcardScreen() {
  const navigate = useNavigate();
  const [FLASHCARDS] = useState<Flashcard[]>(() => loadFlashcards());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [ratedCards, setRatedCards] = useState<Record<number, number>>({});
  const [animating, setAnimating] = useState(false);

  const [userAttempt, setUserAttempt] = useState("");
  const [aiFeedback, setAiFeedback] = useState<AiFeedback | null>(null);
  const [aiChecking, setAiChecking] = useState(false);
  const studentId = sessionStorage.getItem("eyeq_student_id") ?? "";

  const [userProgress, setUserProgress] = useState(getUserProgress());
  const [newAchievements, setNewAchievements] = useState<string[]>([]);
  const [showXPGain, setShowXPGain] = useState(false);
  const [xpGained, setXpGained] = useState(0);

  const card = FLASHCARDS[currentIndex];
  const progress = (currentIndex / FLASHCARDS.length) * 100;
  const remaining = FLASHCARDS.length - Object.keys(ratedCards).length;

  const resetCardState = () => {
    setUserAttempt("");
    setAiFeedback(null);
    setAiChecking(false);
    setIsFlipped(false);
  };

  const checkWithAi = (attempt: string) => {
    if (!attempt.trim() || aiFeedback) return;
    setAiChecking(true);
    fetch(`${API}/api/flashcards/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: studentId,
        question: card.question,
        student_answer: attempt,
        correct_answer: card.answer,
      }),
    })
      .then((r) => r.json())
      .then((data: AiFeedback) => {
        setAiFeedback(data);
        setAiChecking(false);
      })
      .catch(() => setAiChecking(false));
  };

  const flipCard = () => {
    if (animating) return;
    if (!isFlipped && userAttempt.trim() && !aiFeedback) {
      checkWithAi(userAttempt);
    }
    setIsFlipped((f) => !f);
  };

  const handleRating = (value: number) => {
    setRatedCards((prev) => ({ ...prev, [card.id]: value }));

    let xpReward = 0;
    if (value === 1) xpReward = XP_REWARDS.flashcardAgain;
    else if (value === 2) xpReward = XP_REWARDS.flashcardHard;
    else if (value === 3) xpReward = XP_REWARDS.flashcardGood;
    else if (value === 4) xpReward = XP_REWARDS.flashcardEasy;

    const result = addXP(xpReward);
    const updatedProgress = getUserProgress();
    updatedProgress.totalCards += 1;
    setUserProgress(updatedProgress);
    setXpGained(xpReward);
    setShowXPGain(true);
    setTimeout(() => setShowXPGain(false), 2000);

    if (value >= 3) {
      confetti({
        particleCount: value === 4 ? 80 : 40,
        spread: value === 4 ? 90 : 60,
        origin: { y: 0.6 },
        colors: value === 4 ? ["#39FF14", "#00E5FF", "#F0F9FF"] : ["#00E5FF", "#F0F9FF"],
      });
    }

    if (result.leveledUp) {
      confetti({
        particleCount: 120,
        spread: 110,
        origin: { y: 0.5 },
        colors: ["#FFB300", "#00E5FF", "#39FF14"],
        shapes: ["star"],
      });
    }

    const unlockedAchievements = checkAndUnlockAchievements();
    if (unlockedAchievements.length > 0) {
      setNewAchievements((prev) => [...prev, ...unlockedAchievements]);
    }

    setAnimating(true);
    resetCardState();

    setTimeout(() => {
      if (currentIndex < FLASHCARDS.length - 1) {
        setCurrentIndex((i) => i + 1);
      } else {
        navigate("/summary");
      }
      setAnimating(false);
    }, 350);
  };

  const goToPrev = () => {
    if (currentIndex > 0 && !animating) {
      setAnimating(true);
      resetCardState();
      setTimeout(() => {
        setCurrentIndex((i) => i - 1);
        setAnimating(false);
      }, 300);
    }
  };

  const goToNext = () => {
    if (currentIndex < FLASHCARDS.length - 1 && !animating) {
      setAnimating(true);
      resetCardState();
      setTimeout(() => {
        setCurrentIndex((i) => i + 1);
        setAnimating(false);
      }, 300);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col relative overflow-hidden scanline">
      {/* ===== Anatomical Backdrop ===== */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 grid-pattern opacity-30" />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full overflow-hidden opacity-15"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.15 }}
          transition={{ duration: 2 }}
        >
          <img
            src="/images/sample_fundus_OD.png"
            alt=""
            className="w-full h-full object-cover blur-md grayscale brightness-50"
          />
        </motion.div>
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[850px] border border-[#00E5FF]/10 rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1050px] h-[1050px] border border-dashed border-[#00E5FF]/5 rounded-full"
          animate={{ rotate: -360 }}
          transition={{ duration: 150, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <AchievementManager
        achievements={newAchievements}
        onDismiss={(id) =>
          setNewAchievements((prev) => prev.filter((a) => a !== id))
        }
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
            <span
              className="font-black text-sm tracking-widest"
              style={{ fontFamily: "var(--font-display)" }}
            >
              +{xpGained} XP
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Top Bar HUD ===== */}
      <motion.div
        className="relative z-20 glass-panel border-b border-white/5 px-6 py-4 flex items-center justify-between"
        initial={{ y: -60 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="flex items-center gap-4">
          <motion.button
            onClick={() => navigate("/dashboard")}
            className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-white/40 hover:text-[#00E5FF] hover:border-[#00E5FF]/40 transition-all"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ChevronLeft size={16} />
          </motion.button>
          <div className="flex items-center gap-3">
            <HolographicEyeLogo size={36} animated />
            <div>
              <p
                className="text-[#00E5FF] font-black uppercase tracking-[0.2em] glow-text-teal"
                style={{ fontFamily: "var(--font-display)", fontSize: "0.95rem" }}
              >
                EyeQ
              </p>
              <p className="text-white/30 text-[0.5rem] uppercase tracking-[0.4em] font-mono">
                Memory_Slates_v2
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <StreakDisplay streak={userProgress.streak} size="sm" />
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
            <Database size={12} className="text-[#00E5FF]/70" />
            <span className="text-white/60 font-mono text-[0.65rem] uppercase tracking-widest">
              {currentIndex + 1}
              <span className="text-white/20">/</span>
              {FLASHCARDS.length}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#00E5FF]/5 border border-[#00E5FF]/20">
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-[#00E5FF]"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            />
            <span className="text-[#00E5FF] font-mono text-[0.65rem] uppercase tracking-widest">
              {remaining} pending
            </span>
          </div>
        </div>
      </motion.div>

      {/* XP Bar Row */}
      <div className="relative z-10 px-6 py-3 border-b border-white/5 bg-black/40 backdrop-blur-xl">
        <XPBar currentXP={userProgress.xp} level={userProgress.level} size="sm" />
      </div>

      {/* Progress diagnostic line */}
      <div className="relative z-10 h-1 bg-white/5 w-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-[#00E5FF] via-[#39FF14] to-[#00E5FF] relative"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ boxShadow: "0 0 12px rgba(0,229,255,0.5)" }}
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          />
        </motion.div>
      </div>

      {/* Topic Pill */}
      <div className="relative z-10 flex items-center justify-center mt-8">
        <motion.div
          className="glass-panel border-[#00E5FF]/20 rounded-full px-5 py-2 flex items-center gap-3 hud-corners"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Cpu size={12} className="text-[#00E5FF]" />
          <span
            className="text-white/80 font-mono text-[0.7rem] uppercase tracking-[0.2em]"
          >
            Diabetic_Retinopathy
          </span>
          <span className="text-white/20">|</span>
          <span className="text-[#00E5FF] font-mono text-[0.7rem] uppercase tracking-[0.2em] glow-text-teal">
            {card.tag}
          </span>
        </motion.div>
      </div>

      {/* ===== Flashcard Stage ===== */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-3xl flex items-center gap-4">
          {/* Prev navigation */}
          <motion.button
            onClick={goToPrev}
            disabled={currentIndex === 0 || animating}
            className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border transition-all ${
              currentIndex === 0 || animating
                ? "border-white/5 text-white/10 cursor-not-allowed"
                : "border-[#00E5FF]/20 text-[#00E5FF]/60 hover:border-[#00E5FF] hover:text-[#00E5FF] hover:bg-[#00E5FF]/5 hover:shadow-[0_0_20px_rgba(0,229,255,0.3)]"
            }`}
            whileHover={
              currentIndex !== 0 && !animating ? { scale: 1.05 } : undefined
            }
            whileTap={
              currentIndex !== 0 && !animating ? { scale: 0.95 } : undefined
            }
          >
            <ChevronLeft size={18} />
          </motion.button>

          {/* The Holographic Slate */}
          <div className="flex-1" style={{ perspective: "1800px" }}>
            <motion.div
              onClick={flipCard}
              className="relative cursor-pointer"
              style={{
                transformStyle: "preserve-3d",
                minHeight: "440px",
              }}
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
              whileHover={{ y: -4 }}
            >
              {/* ===== FRONT (Question) ===== */}
              <motion.div
                className="absolute inset-0 holo-slate holo-slate-front rounded-2xl p-8 flex flex-col hud-corners overflow-hidden"
                style={{
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                }}
              >
                {/* Rim sweep top edge */}
                <motion.div
                  className="absolute top-0 left-0 h-px w-full"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent 0%, #00E5FF 50%, transparent 100%)",
                  }}
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                />

                {/* Vignette overlay */}
                <div className="absolute inset-0 pointer-events-none vignette" />

                <div className="relative z-10 flex flex-col h-full">
                  {/* Header chip */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] hud-blink" />
                      <span
                        className="text-[#00E5FF] font-mono text-[0.6rem] uppercase tracking-[0.4em] glow-text-teal"
                      >
                        Query_Node :: {String(card.id).padStart(3, "0")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-white/30">
                      <RotateCcw size={11} />
                      <span className="font-mono text-[0.55rem] uppercase tracking-widest">
                        Tap_to_Decrypt
                      </span>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="flex-1 flex items-center justify-center px-2">
                    <p
                      className="text-white text-center leading-relaxed"
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: "1.05rem",
                        fontWeight: 500,
                        lineHeight: 1.7,
                        textShadow: "0 0 20px rgba(0,229,255,0.15)",
                      }}
                    >
                      {card.question}
                    </p>
                  </div>

                  {/* Progress dots */}
                  <div className="flex justify-center gap-1.5 mt-6">
                    {FLASHCARDS.map((_, idx) => (
                      <div
                        key={idx}
                        className={`h-1 rounded-full transition-all ${
                          idx === currentIndex
                            ? "w-6 bg-[#00E5FF] shadow-[0_0_8px_#00E5FF]"
                            : ratedCards[FLASHCARDS[idx].id]
                            ? "w-1.5 bg-[#39FF14]/60"
                            : "w-1.5 bg-white/10"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* ===== BACK (Answer) ===== */}
              <motion.div
                className="absolute inset-0 holo-slate holo-slate-back rounded-2xl p-8 flex flex-col hud-corners overflow-hidden"
                style={{
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              >
                <motion.div
                  className="absolute top-0 left-0 h-px w-full"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent 0%, #39FF14 50%, transparent 100%)",
                  }}
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                />

                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={11} className="text-[#39FF14]" />
                      <span
                        className="text-[#39FF14] font-mono text-[0.6rem] uppercase tracking-[0.4em] glow-text-green"
                      >
                        Decrypted_Response
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-white/30">
                      <RotateCcw size={11} />
                      <span className="font-mono text-[0.55rem] uppercase tracking-widest">
                        Tap_to_Encrypt
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <p
                      className="text-white/85 whitespace-pre-line"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.85rem",
                        lineHeight: 1.85,
                      }}
                    >
                      {card.answer}
                    </p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>

          {/* Next navigation */}
          <motion.button
            onClick={goToNext}
            disabled={currentIndex === FLASHCARDS.length - 1 || animating}
            className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border transition-all ${
              currentIndex === FLASHCARDS.length - 1 || animating
                ? "border-white/5 text-white/10 cursor-not-allowed"
                : "border-[#00E5FF]/20 text-[#00E5FF]/60 hover:border-[#00E5FF] hover:text-[#00E5FF] hover:bg-[#00E5FF]/5 hover:shadow-[0_0_20px_rgba(0,229,255,0.3)]"
            }`}
            whileHover={
              currentIndex !== FLASHCARDS.length - 1 && !animating
                ? { scale: 1.05 }
                : undefined
            }
            whileTap={
              currentIndex !== FLASHCARDS.length - 1 && !animating
                ? { scale: 0.95 }
                : undefined
            }
          >
            <ChevronRight size={18} />
          </motion.button>
        </div>

        {/* Active recall input (when not flipped) */}
        <AnimatePresence>
          {!isFlipped && (
            <motion.div
              className="w-full max-w-3xl mt-5 px-16"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <textarea
                value={userAttempt}
                onChange={(e) => setUserAttempt(e.target.value)}
                placeholder="// optional: input your hypothesis before decrypting"
                rows={2}
                className="w-full px-5 py-3 rounded-xl bg-black/40 border border-white/10 text-[#00E5FF] placeholder-white/20 resize-none focus:outline-none focus:border-[#00E5FF]/50 focus:ring-1 focus:ring-[#00E5FF]/30 font-mono"
                style={{ fontSize: "0.8rem", lineHeight: 1.5 }}
              />
              <div className="flex items-center justify-between mt-2 px-1">
                <span className="text-white/30 font-mono text-[0.6rem] uppercase tracking-[0.25em]">
                  Click_slate_to_reveal_answer
                </span>
                {userAttempt.trim() && (
                  <button
                    onClick={flipCard}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00E5FF] text-black font-black uppercase text-[0.6rem] tracking-widest hover:shadow-[0_0_20px_rgba(0,229,255,0.4)]"
                  >
                    <Brain size={11} />
                    Run_Diagnostic
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Feedback (after flip) */}
        <AnimatePresence>
          {isFlipped && (userAttempt.trim() || aiChecking) && (
            <motion.div
              className="w-full max-w-3xl mt-5 px-16"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div
                className="px-5 py-4 rounded-xl glass-panel border-[#00E5FF]/20 hud-corners"
              >
                {aiChecking ? (
                  <div className="flex items-center gap-3 text-white/60 font-mono text-xs">
                    <div className="w-3.5 h-3.5 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin" />
                    <span className="uppercase tracking-widest">
                      AI_Auditor_Reviewing_Response...
                    </span>
                  </div>
                ) : aiFeedback ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      {aiFeedback.score >= 7 ? (
                        <CheckCircle size={13} className="text-[#39FF14]" />
                      ) : aiFeedback.score >= 4 ? (
                        <Activity size={13} className="text-[#FFB300]" />
                      ) : (
                        <XCircle size={13} className="text-[#FF3D00]" />
                      )}
                      <span
                        className="font-mono text-[0.65rem] uppercase tracking-widest"
                        style={{
                          color:
                            aiFeedback.score >= 7
                              ? "#39FF14"
                              : aiFeedback.score >= 4
                              ? "#FFB300"
                              : "#FF3D00",
                        }}
                      >
                        AI_Score :: {aiFeedback.score}/10
                      </span>
                    </div>
                    <p
                      className="text-white/75"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.78rem",
                        lineHeight: 1.65,
                      }}
                    >
                      {aiFeedback.feedback}
                    </p>
                  </div>
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rating Buttons (shown when flipped) */}
        <div
          className={`w-full max-w-3xl mt-6 transition-all duration-300 ${
            isFlipped
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4 pointer-events-none"
          }`}
        >
          <p
            className="text-center text-white/40 mb-3 font-mono text-[0.6rem] uppercase tracking-[0.4em]"
          >
            // Submit_recall_strength_assessment
          </p>
          <div className="grid grid-cols-4 gap-3 px-16">
            {RATINGS.map((rating, idx) => (
              <motion.button
                key={rating.label}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRating(rating.value);
                }}
                className="relative py-3.5 rounded-xl glass-panel overflow-hidden group hud-corners"
                style={{
                  borderColor: `${rating.accent}40`,
                  background: `linear-gradient(135deg, ${rating.accent}10 0%, transparent 100%), rgba(5,8,15,0.85)`,
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
                whileHover={{
                  scale: 1.04,
                  y: -3,
                  boxShadow: `0 0 30px ${rating.glow}`,
                }}
                whileTap={{ scale: 0.96 }}
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    background: `radial-gradient(circle at center, ${rating.accent}15 0%, transparent 70%)`,
                  }}
                />
                <div className="relative z-10 flex flex-col items-center gap-1">
                  <span
                    className="font-black uppercase tracking-wider glow-text-teal"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "0.85rem",
                      color: rating.accent,
                      textShadow: `0 0 10px ${rating.glow}`,
                    }}
                  >
                    {rating.label}
                  </span>
                  <span
                    className="font-mono text-[0.5rem] uppercase tracking-[0.3em] text-white/40"
                  >
                    {rating.code}
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
          <div className="flex justify-between mt-3 px-16">
            <span className="text-[#FF3D00]/60 font-mono text-[0.55rem] uppercase tracking-[0.3em]">
              Requires_Reinforcement
            </span>
            <span className="text-[#39FF14]/60 font-mono text-[0.55rem] uppercase tracking-[0.3em]">
              Optimal_Retention
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Action */}
      <div className="relative z-10 flex justify-center pb-6">
        <button
          onClick={() => navigate("/summary")}
          className="text-white/30 hover:text-[#00E5FF] transition-colors flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.3em]"
        >
          Skip_to_Diagnostic_Report
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
