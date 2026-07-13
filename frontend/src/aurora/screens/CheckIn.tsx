"use client";
/* AURORA Daily check-in — an easy multiple-choice "brain icebreaker". One MCQ a
   day; tapping an option auto-submits and shows the verdict. Grading is
   deterministic on the server (no AI). The /api/checkin/* flow is preserved. */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/screens/AuthContext";
import { syncStreakFromBackend } from "@/lib/legacy/gamification";
import { confetti } from "@/fx/confetti";
import { CoBrand } from "@/aurora/components/CoBrand";

type Phase = "loading" | "question" | "result";
interface QuestionData { question: string; topic: string; options: string[]; question_id: string; }

export function CheckIn() {
  const router = useRouter();
  const qc = useQueryClient();
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

  const goDashboard = () => {
    setCheckInDone(true);
    // Pull the freshest streak/Lumens/level onto the dashboard we're about to show.
    qc.invalidateQueries({ queryKey: ["progress"] });
    router.push("/dashboard");
  };
  const handleRetry = () => { setLoadError(false); setPhase("loading"); setLoadAttempt((a) => a + 1); };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statusRes = await fetch("/api/checkin/status", { credentials: "include" });
        if (!statusRes.ok) throw new Error("status_failed");
        const status = await statusRes.json();
        if (cancelled) return;
        // Once per day: if today's check-in is already recorded (server truth, e.g.
        // done earlier on another device), don't show it again — go straight in.
        if (status.checkin_done_today) {
          setCheckInDone(true);
          router.replace("/dashboard");
          return;
        }
        setStreak(status.streak ?? 0);
        setWeakTopic(status.weak_topic ?? null);
        syncStreakFromBackend(status.streak ?? 0);
        const qRes = await fetch("/api/checkin/question", { credentials: "include" });
        if (!qRes.ok) throw new Error("question_failed");
        const q = await qRes.json();
        if (cancelled) return;
        setQuestion(q);
        setPhase("question");
        /* Do NOT mark the check-in done just for loading the question — it counts as
           done only once the student skips or answers (see handleSelect / goDashboard).
           That date-keyed flag (AuthContext) is what keeps it from reappearing in a
           later session on the same day. */
      } catch {
        if (cancelled) return;
        setLoadError(true);
        setPhase("question");
      }
    })();
    return () => { cancelled = true; };
  }, [loadAttempt]);

  /* Celebrate a correct answer with a gem-spectrum burst. The wrapper disables
     itself under reduced motion, so no guard is needed here. */
  useEffect(() => {
    if (phase === "result" && correct) {
      confetti({ particleCount: 110, spread: 78, startVelocity: 42, origin: { y: 0.42 },
        colors: ["#3C90FF", "#34A853", "#AD72FF", "#FFCF03", "#F96BD6", "#00BDD2"] });
    }
  }, [phase, correct]);

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
      // The check-in advanced the streak server-side — refresh so every surface
      // (dashboard streak card, sidebar) shows the new count in real time.
      qc.invalidateQueries({ queryKey: ["progress"] });
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
      <main className="aurora-checkin-wrap aurora-rise-in">
        <CoBrand className="aurora-checkin-cobrand" />
        <header className="aurora-checkin-head">
          <p className="aurora-eyebrow">Daily check-in</p>
          <h1 className="aurora-checkin-h1">Today&apos;s question</h1>
        </header>

        <section className="aurora-card aurora-checkin-card">
          <span className="aurora-checkin-sheen" aria-hidden />

          {phase !== "loading" && !loadError && (weakTopic || streak > 0) && (
            <div className="aurora-checkin-meta">
              {weakTopic && (
                <span className="aurora-checkin-focus">
                  <span className="aurora-checkin-focus-dot" aria-hidden />
                  <span className="aurora-checkin-focus-text">
                    <span className="aurora-side-label">Today&apos;s focus</span>
                    <span className="aurora-checkin-focus-topic">{weakTopic}</span>
                  </span>
                </span>
              )}
              {streak > 0 && (
                <span className="aurora-checkin-flame" title={`${streak}-day streak — answer today to keep it alive`}>
                  <span className="aurora-checkin-flame-ico" aria-hidden>🔥</span>
                  <span className="aurora-checkin-flame-n">{streak}</span>
                  <span className="aurora-checkin-flame-u">day{streak === 1 ? "" : "s"}</span>
                </span>
              )}
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
              <span className="aurora-checkin-q-topic aurora-rise-in" style={{ display: "inline-block", animationDelay: "40ms" }}>{question.topic}</span>
              <p className="aurora-checkin-q aurora-rise-in" style={{ animationDelay: "120ms" }}>{question.question}</p>
              <div className="aurora-checkin-options aurora-stagger">
                {question.options.map((opt, idx) => (
                  <button
                    key={opt}
                    type="button"
                    className="aurora-checkin-option aurora-press"
                    style={{ ["--i" as string]: idx + 2 }}
                    disabled={submitting}
                    onClick={() => handleSelect(opt)}
                  >
                    <span className="aurora-checkin-key" aria-hidden>{String.fromCharCode(65 + idx)}</span>
                    <span className="aurora-checkin-opt-text">{opt}</span>
                    <span className="aurora-checkin-opt-go" aria-hidden>→</span>
                  </button>
                ))}
              </div>
              <button type="button" className="aurora-checkin-skip aurora-rise-in" style={{ animationDelay: `${(question.options.length + 2) * 78}ms` }} onClick={goDashboard}>Skip for today</button>
            </>
          )}

          {phase === "result" && question && (
            <>
              <span className="aurora-checkin-q-topic">{question.topic}</span>
              <p className="aurora-checkin-q">{question.question}</p>
              <div className="aurora-checkin-options is-revealed">
                {question.options.map((opt, idx) => {
                  const isCorrect = opt === correctAnswer;
                  const isChosen = opt === selected;
                  const cls = isCorrect ? "is-correct" : isChosen ? "is-wrong" : "";
                  const shake = isChosen && !isCorrect ? " aurora-shake-in" : "";
                  return (
                    <div key={opt} className={`aurora-checkin-option is-static ${cls}${shake}`}>
                      <span className="aurora-checkin-key" aria-hidden>
                        {isCorrect ? "✓" : isChosen ? "✕" : String.fromCharCode(65 + idx)}
                      </span>
                      <span className="aurora-checkin-opt-text">{opt}</span>
                      {isCorrect && <span className="aurora-bloom-ring" data-on="true" aria-hidden />}
                    </div>
                  );
                })}
              </div>
              <div className={`aurora-checkin-verdict ${correct ? "is-correct" : "is-wrong"} aurora-rise-in`} style={{ animationDelay: "150ms" }}>
                <span className="aurora-checkin-verdict-head">{correct ? "Correct" : "Not quite"}</span>
                <p>{feedback}</p>
              </div>
              <button type="button" className="aurora-checkin-submit aurora-flow aurora-press aurora-rise-in" style={{ animationDelay: "260ms" }} onClick={goDashboard}><span>Start learning →</span></button>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
