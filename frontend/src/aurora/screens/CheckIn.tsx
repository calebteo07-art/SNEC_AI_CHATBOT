"use client";
/* AURORA Daily check-in — an easy multiple-choice "brain icebreaker". One MCQ a
   day; tapping an option auto-submits and shows the verdict. Grading is
   deterministic on the server (no AI). The /api/checkin/* flow is preserved. */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/screens/AuthContext";
import { syncStreakFromBackend } from "@/lib/legacy/gamification";

type Phase = "loading" | "question" | "result";
interface QuestionData { question: string; topic: string; options: string[]; question_id: string; }

export function CheckIn() {
  const router = useRouter();
  const { setCheckInDone } = useAuth();

  const [streak, setStreak] = useState(0);
  const [weakTopic, setWeakTopic] = useState<string | null>(null);
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState("");
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

  const handleSelect = async (option: string) => {
    if (submitting || !question || phase === "result") return;
    setSelected(option);
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkin/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question_id: question.question_id, answer: option }),
      });
      const data = await res.json();
      setCorrect(data.correct);
      setCorrectAnswer(data.correct_answer ?? "");
      setFeedback(data.feedback ?? "");
      setCheckInDone(true);
      setPhase("result");
    } catch {
      toast.error("Couldn't submit answer — please try again.");
      setSelected(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="aurora-checkin">
      <div className="aurora-checkin-mesh" aria-hidden><span /><span /></div>
      <main className="aurora-checkin-wrap">
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
              <div className="aurora-checkin-options">
                {question.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className="aurora-checkin-option"
                    disabled={submitting}
                    onClick={() => handleSelect(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <button type="button" className="aurora-checkin-skip" onClick={goDashboard}>Skip for today</button>
            </>
          )}

          {phase === "result" && question && (
            <>
              <span className="aurora-checkin-q-topic">{question.topic}</span>
              <p className="aurora-checkin-q">{question.question}</p>
              <div className="aurora-checkin-options is-revealed">
                {question.options.map((opt) => {
                  const isCorrect = opt === correctAnswer;
                  const isChosen = opt === selected;
                  const cls = isCorrect ? "is-correct" : isChosen ? "is-wrong" : "";
                  return (
                    <div key={opt} className={`aurora-checkin-option is-static ${cls}`}>
                      <span>{opt}</span>
                      {isCorrect && <span className="aurora-checkin-mark">✓</span>}
                      {isChosen && !isCorrect && <span className="aurora-checkin-mark">✕</span>}
                    </div>
                  );
                })}
              </div>
              <div className={`aurora-checkin-verdict ${correct ? "is-correct" : "is-wrong"}`}>
                <span className="aurora-checkin-verdict-head">{correct ? "Correct" : "Not quite"}</span>
                <p>{feedback}</p>
              </div>
              <button type="button" className="aurora-checkin-submit aurora-flow" onClick={goDashboard}><span>Start learning →</span></button>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
