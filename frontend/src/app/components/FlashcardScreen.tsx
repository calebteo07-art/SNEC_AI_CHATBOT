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
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  Check,
  X as XIcon,
  Sparkles,
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
    /* fall through */
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
  { label: "Again", caption: "Try once more soon", accent: "#8B2D2D", value: 1 },
  { label: "Hard", caption: "Recall was effortful", accent: "#9C7B1F", value: 2 },
  { label: "Good", caption: "Recall was solid", accent: "#8C6D3F", value: 3 },
  { label: "Easy", caption: "Mastered", accent: "#4F6B3D", value: 4 },
];

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
    fetch(`/api/flashcards/check`, {
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

    if (value === 4) {
      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.6 },
        colors: ["#8C6D3F", "#C4A57B", "#4F6B3D"],
      });
    }

    if (result.leveledUp) {
      confetti({
        particleCount: 80,
        spread: 100,
        origin: { y: 0.5 },
        colors: ["#8C6D3F", "#9C7B1F", "#C4A57B"],
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
    }, 320);
  };

  const goToPrev = () => {
    if (currentIndex > 0 && !animating) {
      setAnimating(true);
      resetCardState();
      setTimeout(() => {
        setCurrentIndex((i) => i - 1);
        setAnimating(false);
      }, 280);
    }
  };

  const goToNext = () => {
    if (currentIndex < FLASHCARDS.length - 1 && !animating) {
      setAnimating(true);
      resetCardState();
      setTimeout(() => {
        setCurrentIndex((i) => i + 1);
        setAnimating(false);
      }, 280);
    }
  };

  return (
    <div className="min-h-screen aurora-bg flex flex-col">
      <AchievementManager
        achievements={newAchievements}
        onDismiss={(id) => setNewAchievements((prev) => prev.filter((a) => a !== id))}
      />

      {/* ===== Top Bar ===== */}
      <motion.div
        className="glass-nav sticky top-0 z-30"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-2 text-[#5C544A] hover:text-[#1F1A12] transition-colors text-sm"
          >
            <ArrowLeft size={15} strokeWidth={1.5} />
            Dashboard
          </button>

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
              Flashcards
            </span>
          </div>

          <div className="flex items-center gap-4">
            <StreakDisplay streak={userProgress.streak} size="sm" />
          </div>
        </div>
      </motion.div>

      {/* ===== Topic + progress meta ===== */}
      <div className="max-w-4xl w-full mx-auto px-4 sm:px-8 pt-8 sm:pt-12 pb-2">
        <div className="flex items-end justify-between mb-6">
          <div>
            <p className="annotation-label">{card.tag}</p>
            <h1
              className="mt-2 text-[#1F1A12]"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.6rem",
                fontWeight: 400,
                letterSpacing: "-0.01em",
              }}
            >
              Diabetic <span className="italic-display">Retinopathy</span>
            </h1>
          </div>
          <div className="text-right">
            <p className="text-[#1F1A12]" style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 400 }}>
              {currentIndex + 1}
              <span className="text-[#A39A8E]">/{FLASHCARDS.length}</span>
            </p>
            <p className="text-[#A39A8E]" style={{ fontSize: "0.7rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
              {remaining} remaining
            </p>
          </div>
        </div>

        {/* Progress hairline */}
        <div className="progress-rail">
          <motion.div
            className="progress-fill"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-4 max-w-xs">
          <XPBar currentXP={userProgress.xp} level={userProgress.level} size="sm" />
        </div>
      </div>

      {/* ===== Card Stage ===== */}
      <div className="flex-1 max-w-4xl w-full mx-auto px-8 pt-10 pb-16">
        <div className="flex items-center gap-5">
          {/* Prev */}
          <button
            onClick={goToPrev}
            disabled={currentIndex === 0 || animating}
            aria-label="Previous card"
            className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center border transition-all ${
              currentIndex === 0 || animating
                ? "border-[#1F1A12]/8 text-[#A39A8E]/40 cursor-not-allowed"
                : "border-[#1F1A12]/12 text-[#5C544A] hover:border-[#8C6D3F]/40 hover:text-[#8C6D3F] hover:bg-white"
            }`}
          >
            <ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>

          {/* The Card */}
          <div className="flex-1" style={{ perspective: "1800px" }}>
            <motion.div
              onClick={flipCard}
              role="button"
              tabIndex={0}
              aria-label={isFlipped ? "Flip card back to question" : "Flip card to reveal answer"}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flipCard(); } }}
              className="relative cursor-pointer"
              style={{ transformStyle: "preserve-3d", minHeight: "440px" }}
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ duration: 0.75, ease: [0.4, 0, 0.2, 1] }}
              whileHover={{ y: -2 }}
            >
              {/* Front — Question */}
              <motion.div
                className="absolute inset-0 glass-card-lg iri-border flex flex-col p-12"
                style={{
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                }}
              >
                <div className="flex items-center justify-between">
                  <p className="annotation-label">Question</p>
                  <p className="text-[#A39A8E] italic-display" style={{ fontSize: "0.85rem" }}>
                    Tap to reveal
                  </p>
                </div>

                {/* Anatomy header strip */}
                <div className="relative h-24 my-4 overflow-hidden rounded-xl">
                  <motion.img
                    src="/anatomy/eye-flashcard.png"
                    alt=""
                    aria-hidden="true"
                    className="w-full h-full object-cover anatomy-hero"
                    style={{ position: "relative", opacity: 0.22 }}
                    animate={{ scale: [1, 1.06, 1], x: [0, 8, 0, -8, 0] }}
                    transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/60" />
                </div>

                <div className="flex-1 flex items-center justify-center py-4">
                  <p
                    className="text-[#1F1A12] text-center max-w-xl"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "1.5rem",
                      fontWeight: 400,
                      lineHeight: 1.5,
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {card.question}
                  </p>
                </div>

                {/* Progress dots */}
                <div className="flex justify-center gap-1.5">
                  {FLASHCARDS.map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-[3px] rounded-full transition-all ${
                        idx === currentIndex
                          ? "w-8"
                          : ratedCards[FLASHCARDS[idx].id]
                          ? "w-1.5 bg-[#4F6B3D]/50"
                          : "w-1.5 bg-[#1F1A12]/10"
                      }`}
                      style={idx === currentIndex ? {
                        background: "linear-gradient(90deg, #8C6D3F, #C4A57B, #8B7BAF, #8C6D3F)",
                        backgroundSize: "200% 100%",
                        animation: "holo-shimmer 2.5s ease-in-out infinite",
                      } : undefined}
                    />
                  ))}
                </div>
              </motion.div>

              {/* Back — Answer */}
              <motion.div
                className="absolute inset-0 glass-card-lg iri-border flex flex-col p-12 overflow-hidden"
                style={{
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                  background: "linear-gradient(135deg, rgba(79,107,61,0.06) 0%, transparent 50%), rgba(255,255,255,0.6)",
                  backdropFilter: "saturate(1.4) blur(12px)",
                  WebkitBackdropFilter: "saturate(1.4) blur(12px)",
                }}
              >
                <div className="flex items-center justify-between mb-6">
                  <p
                    className="text-[#4F6B3D]"
                    style={{ fontSize: "0.7rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}
                  >
                    · Answer
                  </p>
                  <p className="text-[#A39A8E] italic-display" style={{ fontSize: "0.85rem" }}>
                    Tap to flip back
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <p
                    className="text-[#1F1A12] whitespace-pre-line"
                    style={{
                      fontSize: "1rem",
                      lineHeight: 1.75,
                      fontWeight: 400,
                    }}
                  >
                    {card.answer}
                  </p>
                </div>
              </motion.div>
            </motion.div>
          </div>

          {/* Next */}
          <button
            onClick={goToNext}
            disabled={currentIndex === FLASHCARDS.length - 1 || animating}
            aria-label="Next card"
            className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center border transition-all ${
              currentIndex === FLASHCARDS.length - 1 || animating
                ? "border-[#1F1A12]/8 text-[#A39A8E]/40 cursor-not-allowed"
                : "border-[#1F1A12]/12 text-[#5C544A] hover:border-[#8C6D3F]/40 hover:text-[#8C6D3F] hover:bg-white"
            }`}
          >
            <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        {/* Active recall input (before flip) */}
        <AnimatePresence>
          {!isFlipped && (
            <motion.div
              className="mt-8 max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <label htmlFor="recall-attempt" className="sr-only">Your answer (optional)</label>
              <textarea
                id="recall-attempt"
                value={userAttempt}
                onChange={(e) => setUserAttempt(e.target.value)}
                placeholder="Optional · think it through before revealing"
                rows={2}
                className="w-full px-0 py-3 bg-transparent border-0 border-b border-[#1F1A12]/10 text-[#1F1A12] placeholder-[#A39A8E] resize-none focus:outline-none focus:border-[#8C6D3F] transition-colors"
                style={{ fontSize: "0.95rem", lineHeight: 1.55 }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Feedback (after flip) */}
        <AnimatePresence>
          {isFlipped && (userAttempt.trim() || aiChecking) && (
            <motion.div
              className="mt-8 max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="glass-card p-6" aria-live="polite" aria-atomic="true">
                {aiChecking ? (
                  <div className="flex items-center gap-3 text-[#5C544A]" role="status" style={{ fontSize: "0.88rem" }}>
                    <div className="w-3 h-3 border-2 border-[#8C6D3F] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                    The tutor is reviewing your answer…
                  </div>
                ) : aiFeedback ? (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles size={12} strokeWidth={1.5} className="text-[#8C6D3F]" />
                      <span className="text-[#A39A8E]" style={{ fontSize: "0.7rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600 }}>
                        Tutor's note · {aiFeedback.score}/10
                      </span>
                    </div>
                    <p className="text-[#1F1A12]" style={{ fontSize: "0.95rem", lineHeight: 1.65 }}>
                      {aiFeedback.feedback}
                    </p>
                  </div>
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rating Buttons (after flip) */}
        <div
          className={`mt-8 max-w-2xl mx-auto transition-all duration-300 ${
            isFlipped ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
          }`}
        >
          <p className="annotation-label justify-center mb-4">How well did you recall this?</p>
          <div className="grid grid-cols-4 gap-3">
            {RATINGS.map((rating, idx) => (
              <motion.button
                key={rating.label}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRating(rating.value);
                }}
                aria-label={`Rate recall: ${rating.label} — ${rating.caption}`}
                className="glass-card p-4 text-center group transition-all"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                whileHover={{
                  y: -2,
                  borderColor: `${rating.accent}40`,
                  boxShadow: `0 1px 2px rgba(31,26,18,0.04), 0 12px 24px ${rating.accent}15`,
                }}
                whileTap={{ scale: 0.94 }}
              >
                <p
                  className="text-[#1F1A12] mb-1"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.05rem",
                    fontWeight: 400,
                  }}
                >
                  {rating.label}
                </p>
                <p className="text-[#A39A8E]" style={{ fontSize: "0.7rem", lineHeight: 1.3 }}>
                  {rating.caption}
                </p>
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer skip */}
      <div className="flex justify-center pb-8">
        <button
          onClick={() => navigate("/summary")}
          className="text-[#A39A8E] hover:text-[#5C544A] transition-colors inline-flex items-center gap-1.5"
          style={{ fontSize: "0.82rem" }}
        >
          End session
          <ArrowRight size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
