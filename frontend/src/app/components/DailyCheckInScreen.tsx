import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { Flame, Check, X, ArrowRight } from "lucide-react";
import { useAuth } from "./AuthContext";

type Phase = "loading" | "question" | "result";

interface QuestionData {
  question: string;
  topic: string;
}

export function DailyCheckInScreen() {
  const navigate = useNavigate();
  const { user, setCheckInDone } = useAuth();
  const studentId = user?.studentId || "anonymous";

  const [streak, setStreak] = useState(0);
  const [weakTopic, setWeakTopic] = useState<string | null>(null);
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<Phase>("loading");
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const statusRes = await fetch(`/api/checkin/status?student_id=${studentId}`);
        const status = await statusRes.json();
        setStreak(status.streak ?? 0);
        setWeakTopic(status.weak_topic ?? null);

        const qRes = await fetch(`/api/checkin/question?student_id=${studentId}`);
        const q = await qRes.json();
        setQuestion(q);
        setPhase("question");
      } catch {
        setCheckInDone(true);
        navigate("/dashboard");
      }
    })();
  }, [studentId, navigate, setCheckInDone]);

  const handleSubmit = async () => {
    if (!answer.trim() || !question) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/checkin/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          question: question.question,
          answer: answer.trim(),
          topic: question.topic,
        }),
      });
      const data = await res.json();
      setCorrect(data.correct);
      setFeedback(data.feedback);
      setCheckInDone(true);
      setPhase("result");
    } catch {
      toast.error("Couldn't submit answer — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF8F1] flex items-center justify-center px-6 py-16 relative">
      <motion.div
        className="w-full max-w-xl relative z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <HolographicEyeLogo size={56} animated />

          <p
            className="mt-6 text-[#8C6D3F]"
            style={{ fontSize: "0.72rem", letterSpacing: "0.24em", textTransform: "uppercase", fontWeight: 600 }}
          >
            · Daily check-in
          </p>
          <h1
            className="mt-2 text-[#1F1A12] text-center"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "2.2rem",
              fontWeight: 400,
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
            }}
          >
            A small <span className="italic-display">question</span> for today
          </h1>

          {streak > 0 && (
            <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#8C6D3F]/8 border border-[#8C6D3F]/20">
              <Flame size={13} strokeWidth={1.5} className="text-[#8C6D3F]" />
              <span className="text-[#8C6D3F]" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                {streak} day streak
              </span>
            </div>
          )}
        </div>

        {/* Card */}
        <div className="surface-card-lg p-10">
          {/* Focus topic */}
          <AnimatePresence mode="wait">
            {weakTopic && phase !== "loading" && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 pb-5 border-b border-[#1F1A12]/8"
              >
                <p className="text-[#A39A8E]" style={{ fontSize: "0.7rem", letterSpacing: "0.16em", textTransform: "uppercase" }}>
                  Today's focus
                </p>
                <p className="mt-1 text-[#1F1A12] italic-display" style={{ fontSize: "1.1rem" }}>
                  {weakTopic}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading */}
          {phase === "loading" && (
            <div className="flex flex-col items-center justify-center py-20" role="status" aria-label="Loading question">
              <div className="w-10 h-10 border-2 border-[#1F1A12]/10 border-t-[#8C6D3F] rounded-full animate-spin" aria-hidden="true" />
              <p className="mt-5 text-[#A39A8E]" style={{ fontSize: "0.85rem" }}>
                Preparing your question…
              </p>
            </div>
          )}

          {/* Question */}
          <AnimatePresence mode="wait">
            {phase === "question" && question && (
              <motion.div
                key="question"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.4 }}
              >
                <p
                  className="text-[#1F1A12] mb-8"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.3rem",
                    lineHeight: 1.55,
                    fontWeight: 400,
                  }}
                >
                  {question.question}
                </p>

                <label htmlFor="checkin-answer" className="sr-only">Your answer</label>
                <textarea
                  id="checkin-answer"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Write your answer here…"
                  rows={4}
                  className="w-full px-0 py-4 bg-transparent border-0 border-b border-[#1F1A12]/10 text-[#1F1A12] placeholder-[#A39A8E] outline-none focus:border-[#8C6D3F] transition-colors resize-none text-base"
                  style={{ lineHeight: 1.6 }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit();
                  }}
                />

                <div className="flex flex-col gap-3 mt-8">
                  <motion.button
                    onClick={handleSubmit}
                    disabled={!answer.trim() || submitting}
                    aria-busy={submitting}
                    aria-label={submitting ? "Submitting answer" : "Submit answer"}
                    className="w-full inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-[#1F1A12] text-[#FBF8F1] disabled:opacity-40 transition-all"
                    style={{ fontWeight: 500, fontSize: "0.95rem", letterSpacing: "0.02em" }}
                    whileHover={{ y: -1 }}
                    whileTap={{ y: 0 }}
                  >
                    {submitting ? (
                      <div className="w-4 h-4 border-2 border-[#FBF8F1] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                    ) : (
                      <>
                        Submit answer
                        <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
                      </>
                    )}
                  </motion.button>

                  <button
                    onClick={() => {
                      setCheckInDone(true);
                      navigate("/dashboard");
                    }}
                    className="text-[#A39A8E] hover:text-[#5C544A] transition-colors text-sm"
                  >
                    Skip for today
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Result */}
          <AnimatePresence mode="wait">
            {phase === "result" && (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-2"
              >
                <motion.div
                  className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6"
                  style={{
                    background: correct ? "rgba(79,107,61,0.1)" : "rgba(139,45,45,0.08)",
                    border: `1px solid ${correct ? "rgba(79,107,61,0.3)" : "rgba(139,45,45,0.3)"}`,
                  }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 14 }}
                  aria-label={correct ? "Correct" : "Incorrect"}
                >
                  {correct ? (
                    <Check size={26} strokeWidth={1.5} className="text-[#4F6B3D]" aria-hidden="true" />
                  ) : (
                    <X size={26} strokeWidth={1.5} className="text-[#8B2D2D]" aria-hidden="true" />
                  )}
                </motion.div>

                <h2
                  className="text-[#1F1A12] mb-4"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.65rem",
                    fontWeight: 400,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {correct ? "Well answered" : "Almost there"}
                </h2>

                <p className="text-[#5C544A] text-left mb-10" style={{ fontSize: "0.95rem", lineHeight: 1.65 }}>
                  {feedback}
                </p>

                <motion.button
                  onClick={() => navigate("/dashboard")}
                  className="w-full inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-[#8C6D3F] text-[#FBF8F1]"
                  style={{
                    fontWeight: 500,
                    fontSize: "0.95rem",
                    letterSpacing: "0.02em",
                    boxShadow: "0 1px 2px rgba(140,109,63,0.18), 0 8px 24px rgba(140,109,63,0.18)",
                  }}
                  whileHover={{ y: -1 }}
                  whileTap={{ y: 0 }}
                >
                  Continue to dashboard
                  <ArrowRight size={16} strokeWidth={1.5} />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
