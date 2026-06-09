"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/providers/AuthProvider";

interface QuestionData { question: string; topic: string; }
type Phase = "loading" | "question" | "result";

export default function CheckInPage() {
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

  const handleSkip = () => {
    setCheckInDone(true);
    router.push("/dashboard");
  };

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
        // If already done today, go to dashboard
        if (status.done) {
          setCheckInDone(true);
          router.replace("/dashboard");
          return;
        }
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
  }, [loadAttempt, setCheckInDone, router]);

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
      setLoadError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#181717] flex items-center justify-center overflow-hidden">
      {/* Full-bleed background */}
      <div className="absolute inset-0">
        <Image src="/images/eye-scan.png" alt="" fill sizes="100vw" className="object-cover object-center" priority />
        <div className="absolute inset-0 bg-[#181717]/80" />
      </div>

      {/* Top wordmark */}
      <div className="absolute top-8 left-8 z-10">
        <div className="text-[#F4EFE7] text-xl font-medium tracking-[-0.03em]">EyeBot®</div>
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-[16px] bg-[#F4EFE7]/10 border border-[#F4EFE7]/15 flex items-center justify-center mx-auto mb-4">
            <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
              <ellipse cx="14" cy="14" rx="11" ry="7" stroke="#F4EFE7" strokeWidth="1.8" />
              <circle cx="14" cy="14" r="4.5" fill="#F4EFE7" />
              <circle cx="14" cy="14" r="2" fill="rgba(6,13,24,0.8)" />
            </svg>
          </div>
          <p className="text-[#F4EFE7]/40 text-[10px] uppercase tracking-[0.18em] font-semibold mb-2">Daily Check-In</p>
          <h1 className="text-[#F4EFE7] text-[36px] font-medium tracking-[-0.04em] leading-none">Today&apos;s question</h1>

          {streak > 0 && phase === "question" && (
            <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-[14px] p-3 flex items-center gap-3">
              <span className="text-xl">🔥</span>
              <div className="text-left">
                <div className="text-amber-400 font-semibold text-sm">{streak}-day streak at risk!</div>
                <div className="text-[#F4EFE7]/40 text-xs">Submit your answer today to keep it alive.</div>
              </div>
            </div>
          )}
        </div>

        {/* Main card body */}
        <div
          className="rounded-[30px] p-6 overflow-hidden"
          style={{
            background: "rgba(244,239,231,0.05)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(244,239,231,0.1)",
          }}
        >
          {weakTopic && phase !== "loading" && (
            <div className="mb-5 pb-4 border-b border-[#F4EFE7]/10">
              <div className="text-[#F4EFE7]/40 text-[10px] uppercase tracking-[0.14em] font-semibold mb-1">Today&apos;s Focus</div>
              <div className="text-[#F4EFE7] text-sm font-semibold">{weakTopic}</div>
            </div>
          )}

          {/* Loading */}
          {phase === "loading" && (
            <div className="text-center py-10">
              <span className="w-7 h-7 border-2 border-[#F4EFE7]/20 border-t-[#F4EFE7]/70 rounded-full animate-spin block mx-auto mb-3" />
              <p className="text-[#F4EFE7]/40 text-sm">Preparing your question…</p>
            </div>
          )}

          {/* Load error */}
          {phase === "question" && loadError && (
            <div className="text-center py-8">
              <p className="text-[#F4EFE7]/50 text-sm mb-5 leading-relaxed">
                Couldn&apos;t load today&apos;s question.<br />Check your connection and try again.
              </p>
              <button
                onClick={() => { setLoadError(false); setPhase("loading"); setLoadAttempt(a => a + 1); }}
                className="w-full bg-[#F4EFE7] text-[#181717] rounded-[12px] py-3 text-sm font-semibold mb-3 hover:bg-white transition-colors"
              >
                Try again
              </button>
              <button onClick={handleSkip} className="text-[#F4EFE7]/30 text-xs hover:text-[#F4EFE7]/60 transition-colors">
                Skip for today
              </button>
            </div>
          )}

          {/* Question */}
          {phase === "question" && !loadError && question && (
            <div>
              <div className="text-[#F4EFE7]/50 text-[10px] uppercase tracking-[0.12em] font-semibold mb-2">{question.topic}</div>
              <p className="text-[#F4EFE7] text-lg font-medium leading-snug tracking-[-0.01em] mb-5">{question.question}</p>
              <textarea
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit(); }}
                placeholder="Type your answer…"
                rows={4}
                className="w-full bg-[#F4EFE7]/5 border border-[#F4EFE7]/10 rounded-[14px] px-4 py-3 text-[#F4EFE7] text-sm placeholder:text-[#F4EFE7]/25 outline-none focus:border-[#F4EFE7]/25 transition-colors resize-none mb-4"
                autoFocus
              />
              <button
                onClick={handleSubmit}
                disabled={submitting || !answer.trim()}
                className="w-full bg-[#F4EFE7] text-[#181717] rounded-[12px] py-3 text-sm font-semibold hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <span className="w-4 h-4 border-2 border-[#181717]/20 border-t-[#181717] rounded-full animate-spin" />
                ) : "Submit Answer →"}
              </button>
              <button onClick={handleSkip} className="w-full mt-3 text-[#F4EFE7]/30 text-xs hover:text-[#F4EFE7]/60 transition-colors">
                Skip for today
              </button>
            </div>
          )}

          {/* Result */}
          {phase === "result" && (
            <div>
              <div
                className={`rounded-[14px] p-4 mb-5 border ${correct ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"}`}
              >
                <div className={`text-base font-bold mb-1.5 ${correct ? "text-emerald-400" : "text-red-400"}`}>
                  {correct ? "Correct!" : "Not quite"}
                </div>
                <p className="text-[#F4EFE7]/60 text-sm leading-relaxed">{feedback}</p>
              </div>
              <button
                onClick={() => router.push("/dashboard")}
                className="w-full bg-[#F4EFE7] text-[#181717] rounded-[12px] py-3 text-sm font-semibold hover:bg-white transition-colors"
              >
                Start Learning →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
