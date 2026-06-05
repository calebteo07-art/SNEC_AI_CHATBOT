import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useAuth } from "./AuthContext";
import { syncStreakFromBackend } from "../utils/gamification";

/* ── Types (unchanged) ────────────────────────────────────── */
type Phase = "loading" | "question" | "result";
interface QuestionData { question: string; topic: string; }

/* ── DailyCheckInScreen ───────────────────────────────────── */
export function DailyCheckInScreen() {
  const navigate = useNavigate();
  const { setCheckInDone } = useAuth();

  const [streak, setStreak]     = useState(0);
  const [weakTopic, setWeakTopic] = useState<string | null>(null);
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [answer, setAnswer]     = useState("");
  const [phase, setPhase]       = useState<Phase>("loading");
  const [correct, setCorrect]   = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /* Load status + question (unchanged) */
  useEffect(() => {
    (async () => {
      try {
        const statusRes = await fetch("/api/checkin/status", { credentials: "include" });
        const status = await statusRes.json();
        setStreak(status.streak ?? 0);
        setWeakTopic(status.weak_topic ?? null);
        syncStreakFromBackend(status.streak ?? 0);
        const qRes = await fetch("/api/checkin/question", { credentials: "include" });
        const q = await qRes.json();
        setQuestion(q);
        setPhase("question");
      } catch {
        toast.error("Could not load check-in. Taking you to the dashboard.");
        setCheckInDone(true);
        navigate("/dashboard");
      }
    })();
  }, [navigate, setCheckInDone]);

  /* Submit (unchanged) */
  const handleSubmit = async () => {
    if (!answer.trim() || !question) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkin/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question: question.question, answer: answer.trim(), topic: question.topic }),
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
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative", overflow: "hidden" }}>
      {/* Floating deco */}
      <img src="/anatomy/eye-scan.png" aria-hidden="true" alt="" style={{ position: "absolute", width: 400, height: 400, objectFit: "cover", opacity: 0.07, mixBlendMode: "multiply", top: "50%", left: "50%", transform: "translate(-50%,-50%)", borderRadius: "50%", pointerEvents: "none" }} />

      <motion.div
        style={{ width: "100%", maxWidth: 480, position: "relative", zIndex: 1 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--teal)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", boxShadow: "0 6px 24px var(--teal-glow)", borderBottom: "4px solid var(--teal-shadow)" }}>
            <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
              <ellipse cx="14" cy="14" rx="11" ry="7" stroke="#fff" strokeWidth="1.8" />
              <circle cx="14" cy="14" r="4.5" fill="#fff" />
              <circle cx="14" cy="14" r="2" fill="rgba(6,13,24,0.8)" />
            </svg>
          </div>
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 6 }}>Daily Check-In</p>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.03em", lineHeight: 1.1 }}>Today's question</h1>
          {streak > 0 && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, padding: "5px 14px", borderRadius: "var(--r-full)", background: "var(--streak-bg)", border: "1px solid var(--streak)", fontSize: 12, fontWeight: 700, color: "var(--streak)" }}>
              🔥 {streak} day streak
            </div>
          )}
        </div>

        {/* Card */}
        <div className="card" style={{ padding: "24px" }}>
          {weakTopic && phase !== "loading" && (
            <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 4 }}>Today's Focus</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{weakTopic}</div>
            </div>
          )}

          {/* Loading */}
          {phase === "loading" && (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <span className="spinner spinner--teal" style={{ width: 28, height: 28, borderWidth: 3, margin: "0 auto 12px" }} />
              <p style={{ fontSize: 13, color: "var(--muted)" }}>Preparing your question…</p>
            </div>
          )}

          {/* Question */}
          <AnimatePresence mode="wait">
            {phase === "question" && question && (
              <motion.div key="q" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--teal)", marginBottom: 10 }}>{question.topic}</div>
                <p style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", lineHeight: 1.45, letterSpacing: "-0.01em", marginBottom: 20 }}>{question.question}</p>
                <textarea
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit(); }}
                  placeholder="Type your answer… (Ctrl+Enter to submit)"
                  rows={4}
                  style={{ width: "100%", padding: "12px 14px", border: "1.5px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--page)", fontSize: 14, lineHeight: 1.6, resize: "none", outline: "none", marginBottom: 16 }}
                  autoFocus
                />
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !answer.trim()}
                  style={{
                    width: "100%", padding: 14, borderRadius: "var(--r-sm)",
                    background: "var(--teal)", color: "#fff",
                    border: "none", borderBottom: "4px solid var(--teal-shadow)",
                    fontSize: 14, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                    cursor: submitting || !answer.trim() ? "not-allowed" : "pointer",
                    opacity: submitting || !answer.trim() ? 0.4 : 1,
                    boxShadow: "0 4px 16px var(--teal-glow)",
                  }}
                >
                  {submitting ? (
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: "#fff", borderColor: "rgba(255,255,255,0.25)" }} />
                      Checking…
                    </span>
                  ) : "Submit Answer →"}
                </button>
              </motion.div>
            )}

            {/* Result */}
            {phase === "result" && (
              <motion.div key="r" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div style={{
                  padding: "14px 16px", borderRadius: "var(--r-sm)",
                  background: correct ? "var(--emerald-bg)" : "var(--heart-bg)",
                  border: `2px solid ${correct ? "var(--emerald)" : "var(--heart)"}`,
                  marginBottom: 20,
                }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: correct ? "var(--emerald-deep)" : "#991b1b", marginBottom: 6 }}>
                    {correct ? "Correct!" : "Not quite"}
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--muted)" }}>{feedback}</p>
                </div>
                <button
                  onClick={() => navigate("/dashboard")}
                  style={{ width: "100%", padding: 14, borderRadius: "var(--r-sm)", background: "var(--teal)", color: "#fff", border: "none", borderBottom: "4px solid var(--teal-shadow)", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
                >
                  Start Learning →
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
