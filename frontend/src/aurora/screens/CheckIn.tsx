"use client";
/* AURORA Daily check-in — a light, quick gate on the AURORA surface (it lives in
   the (auth) group, so there is no Atlas Rail). Loads status + question, accepts
   an answer, shows the verdict. The /api/checkin/* flow is ported verbatim; fx
   (framer, audio, accent media) is dropped. */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/screens/AuthContext";
import { syncStreakFromBackend } from "@/lib/legacy/gamification";

type Phase = "loading" | "question" | "result";
interface QuestionData { question: string; topic: string; }

export function CheckIn() {
  const router = useRouter();
  const { setCheckInDone } = useAuth();

  const [streak, setStreak] = useState(0);
  const [weakTopic, setWeakTopic] = useState<string | null>(null);
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<Phase>("loading");
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const goDashboard = () => { setCheckInDone(true); router.push("/dashboard"); };
  const handleRetry = () => { setLoadError(false); setPhase("loading"); setLoadAttempt((a) => a + 1); };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statusRes = await fetch("/api/checkin/status", { credentials: "include" });
        if (!statusRes.ok) throw new Error("status_failed");
        const status = await statusRes.json();
        if (cancelled) return;
        setStreak(status.streak ?? 0);
        setWeakTopic(status.weak_topic ?? null);
        syncStreakFromBackend(status.streak ?? 0);
        const qRes = await fetch("/api/checkin/question", { credentials: "include" });
        if (!qRes.ok) throw new Error("question_failed");
        const q = await qRes.json();
        if (cancelled) return;
        setQuestion(q);
        setPhase("question");
        setCheckInDone(true);
      } catch {
        if (cancelled) return;
        setLoadError(true);
        setPhase("question");
      }
    })();
    return () => { cancelled = true; };
  }, [loadAttempt]);

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
    <div className="aurora-checkin">
      <div className="aurora-checkin-mesh" aria-hidden><span /><span /></div>
      <div className="aurora-checkin-wrap">
        <header className="aurora-checkin-head">
          <p className="aurora-eyebrow">Daily check-in</p>
          <h1 className="aurora-checkin-h1">Today&apos;s question</h1>
          {streak > 0 && phase === "question" && !loadError && (
            <p className="aurora-checkin-streak">🔥 {streak}-day streak — answer today to keep it alive.</p>
          )}
        </header>

        <section className="aurora-card aurora-checkin-card">
          {weakTopic && phase !== "loading" && !loadError && (
            <div className="aurora-checkin-focus">
              <span className="aurora-side-label">Today&apos;s focus</span>
              <span className="aurora-checkin-focus-topic">{weakTopic}</span>
            </div>
          )}

          {phase === "loading" && <p className="aurora-muted" style={{ textAlign: "center", padding: "28px 0" }}>Preparing your question…</p>}

          {phase === "question" && loadError && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <p className="aurora-muted" style={{ marginBottom: 16 }}>Couldn&apos;t load today&apos;s question. Check your connection and try again.</p>
              <button type="button" className="aurora-checkin-submit aurora-flow" onClick={handleRetry}><span>Try again</span></button>
              <button type="button" className="aurora-checkin-skip" onClick={goDashboard}>Skip for today</button>
            </div>
          )}

          {phase === "question" && !loadError && question && (
            <>
              <span className="aurora-checkin-q-topic">{question.topic}</span>
              <p className="aurora-checkin-q">{question.question}</p>
              <textarea
                className="aurora-checkin-textarea"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit(); }}
                placeholder="Type your answer…"
                rows={4}
                autoFocus
              />
              <button type="button" className="aurora-checkin-submit aurora-flow" onClick={handleSubmit} disabled={submitting || !answer.trim()}>
                <span>{submitting ? "Checking…" : "Submit answer →"}</span>
              </button>
              <button type="button" className="aurora-checkin-skip" onClick={goDashboard}>Skip for today</button>
            </>
          )}

          {phase === "result" && (
            <>
              <div className={`aurora-checkin-verdict ${correct ? "is-correct" : "is-wrong"}`}>
                <span className="aurora-checkin-verdict-head">{correct ? "Correct" : "Not quite"}</span>
                <p>{feedback}</p>
              </div>
              <button type="button" className="aurora-checkin-submit aurora-flow" onClick={goDashboard}><span>Start learning →</span></button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
