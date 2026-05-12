import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { Flame, CheckCircle, XCircle, ArrowRight, Activity, Cpu } from "lucide-react";
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
        // If we can't load the check-in, skip straight to dashboard
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
      setFeedback("Link unstable. Evaluation failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-12 relative overflow-hidden scanline">
      {/* Background elements */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute inset-0" style={{ 
          backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0, 229, 255, 0.15) 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <motion.div
        className="w-full max-w-xl relative z-10"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Header HUD */}
        <div className="flex items-center justify-between mb-8 px-2">
          <div className="flex items-center gap-4">
            <div className="relative">
              <HolographicEyeLogo size={48} animated />
              <motion.div 
                className="absolute -inset-2 border border-[#00E5FF]/30 rounded-full"
                animate={{ rotate: -360 }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              />
            </div>
            <div>
              <h1 className="text-[#00E5FF] font-black uppercase tracking-[0.2em] text-xl drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]">
                Daily Check-In
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <Activity size={12} className="text-[#00E5FF]/60" />
                <span className="text-[#00E5FF]/60 text-[0.6rem] uppercase tracking-widest font-mono">
                  Neural_Sync_Active
                </span>
              </div>
            </div>
          </div>

          {streak > 0 && (
            <div className="glass-panel px-4 py-2 rounded-xl flex items-center gap-3 border-[#FFB300]/30 bg-[#FFB300]/5">
              <Flame size={20} className="text-[#FFB300] animate-pulse" />
              <div className="flex flex-col">
                <span className="text-[#FFB300] font-black text-lg leading-none">{streak}</span>
                <span className="text-[#FFB300]/60 text-[0.5rem] uppercase tracking-tighter">Day_Streak</span>
              </div>
            </div>
          )}
        </div>

        {/* Main Interface Panel */}
        <div className="glass-panel rounded-3xl overflow-hidden border-t-2 border-t-[#00E5FF]/40 relative">
          {/* Diagnostic Bar */}
          <div className="h-1 w-full bg-white/5 relative overflow-hidden">
            <motion.div 
              className="absolute inset-0 bg-gradient-to-r from-transparent via-[#00E5FF] to-transparent w-1/3"
              animate={{ left: ['-100%', '200%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />
          </div>

          <div className="p-8">
            {/* Focus Topic Badge */}
            <AnimatePresence mode="wait">
              {weakTopic && phase !== "loading" && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 flex items-center gap-3 px-4 py-2 rounded-lg bg-[#39FF14]/5 border border-[#39FF14]/20"
                >
                  <Cpu size={14} className="text-[#39FF14]" />
                  <p className="text-[#39FF14] text-[0.7rem] uppercase tracking-widest font-mono">
                    Priority_Protocol: <span className="font-black">{weakTopic}</span>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Loading State */}
            {phase === "loading" && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 relative">
                  <div className="absolute inset-0 border-4 border-[#00E5FF]/10 rounded-full" />
                  <div className="absolute inset-0 border-4 border-[#00E5FF] border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(0,229,255,0.5)]" />
                </div>
                <p className="mt-6 text-[#00E5FF]/60 text-[0.7rem] uppercase tracking-[0.3em] font-mono animate-pulse">
                  Decrypting_CheckIn_Module...
                </p>
              </div>
            )}

            {/* Question Phase */}
            <AnimatePresence mode="wait">
              {phase === "question" && question && (
                <motion.div
                  key="question"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="mb-8 p-6 rounded-2xl bg-white/[0.02] border border-white/5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3">
                      <div className="w-2 h-2 rounded-full bg-[#00E5FF]/40 animate-ping" />
                    </div>
                    <p className="text-[#00E5FF]/40 mb-4 text-[0.6rem] uppercase tracking-[0.3em] font-mono">
                      Neural_Assessment_Prompt_01
                    </p>
                    <p className="text-white text-lg font-medium leading-relaxed drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">
                      {question.question}
                    </p>
                  </div>

                  <div className="relative mb-6">
                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="Input neural response..."
                      rows={4}
                      className="w-full px-6 py-5 rounded-2xl bg-black/40 border border-white/10 text-[#00E5FF] placeholder-[#00E5FF]/20 outline-none focus:border-[#00E5FF] focus:ring-1 focus:ring-[#00E5FF]/30 transition-all font-mono text-sm resize-none custom-scrollbar"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit();
                      }}
                    />
                    <div className="absolute bottom-4 right-4 text-[0.5rem] text-white/20 uppercase font-mono">
                      CTRL + ENTER TO UPLOAD
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <motion.button
                      onClick={handleSubmit}
                      disabled={!answer.trim() || submitting}
                      className="w-full h-14 rounded-xl bg-[#00E5FF] text-black font-black uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-3 disabled:opacity-30 disabled:grayscale transition-all hover:shadow-[0_0_20px_rgba(0,229,255,0.4)]"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      {submitting ? (
                        <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <ArrowRight size={18} />
                          Commit Response
                        </>
                      )}
                    </motion.button>

                    <button
                      onClick={() => {
                        setCheckInDone(true);
                        navigate("/dashboard");
                      }}
                      className="w-full py-3 text-white/20 hover:text-[#00E5FF]/60 text-[0.65rem] uppercase tracking-[0.3em] font-mono transition-colors"
                    >
                      Bypass_Evaluation
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Result Phase */}
            <AnimatePresence mode="wait">
              {phase === "result" && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-4"
                >
                  <div className="flex justify-center mb-8 relative">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", damping: 12 }}
                    >
                      {correct ? (
                        <div className="relative">
                          <CheckCircle size={80} className="text-[#39FF14] drop-shadow-[0_0_20px_rgba(57,255,20,0.5)]" />
                          <motion.div 
                            className="absolute -inset-4 border-2 border-[#39FF14]/30 rounded-full"
                            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0, 0.3] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          />
                        </div>
                      ) : (
                        <div className="relative">
                          <XCircle size={80} className="text-[#FF3D00] drop-shadow-[0_0_20px_rgba(255,61,0,0.5)]" />
                          <motion.div 
                            className="absolute -inset-4 border-2 border-[#FF3D00]/30 rounded-full"
                            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0, 0.3] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          />
                        </div>
                      )}
                    </motion.div>
                  </div>

                  <h2 className={`text-2xl font-black uppercase tracking-[0.2em] mb-4 ${correct ? 'text-[#39FF14]' : 'text-[#FF3D00]'}`}>
                    {correct ? "Link_Verified" : "Neural_Mismatch"}
                  </h2>
                  
                  <div className="glass-panel p-6 rounded-2xl mb-10 text-left border-white/5 bg-white/[0.02]">
                    <p className="text-white/40 text-[0.6rem] uppercase tracking-widest font-mono mb-3">Feedback_Log</p>
                    <p className="text-[#F0F9FF]/80 text-sm leading-relaxed font-mono">
                      {feedback}
                    </p>
                  </div>

                  <motion.button
                    onClick={() => navigate("/dashboard")}
                    className="w-full h-14 rounded-xl bg-[#00E5FF] text-black font-black uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-3 hover:shadow-[0_0_20px_rgba(0,229,255,0.4)]"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Enter Core Interface
                    <ArrowRight size={18} />
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-8 flex justify-between items-center px-4">
          <div className="flex gap-4">
            <div className="w-1 h-1 rounded-full bg-[#00E5FF]" />
            <div className="w-1 h-1 rounded-full bg-white/20" />
            <div className="w-1 h-1 rounded-full bg-white/20" />
          </div>
          <span className="text-white/10 text-[0.5rem] uppercase tracking-[0.5em] font-mono">
            Secure_Data_Handshake_Complete
          </span>
        </div>
      </motion.div>
    </div>
  );
}
