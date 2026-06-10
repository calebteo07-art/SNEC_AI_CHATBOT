"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useFlashcards, useFlashcardCheck } from "@/hooks/useFlashcards";

interface Flashcard {
  id: number; question: string; answer: string; tag: string;
  card_id?: string; repetitions?: number; easiness?: number; interval_days?: number;
}
interface AiFeedback { feedback: string; score: number; }

const RATINGS = [
  { label: "Again", caption: "Try soon", accent: "#ef4444", value: 1 },
  { label: "Hard", caption: "Effortful", accent: "#f59e0b", value: 2 },
  { label: "Good", caption: "Solid recall", accent: "#3C90FF", value: 3 },
  { label: "Easy", caption: "Mastered", accent: "#22c55e", value: 4 },
];

function tagToImage(tag: string): string {
  const t = tag.toLowerCase();
  if (t.includes("oct")) return "/images/eye-oct.png";
  if (t.includes("hvf") || t.includes("visual field") || t.includes("biometry")) return "/images/eye-innovation.png";
  if (t.includes("anterior") || t.includes("slit") || t.includes("drop")) return "/images/eye-anterior.png";
  if (t.includes("nerve") || t.includes("glaucoma") || t.includes("pfaer")) return "/images/eye-nerve.png";
  if (t.includes("iop") || t.includes("nct") || t.includes("tonometry")) return "/images/eye-scan.png";
  return "/images/eye-fundus.png";
}

export default function FlashcardsPage() {
  const router = useRouter();
  const { data: apiCards, isLoading } = useFlashcards();
  const checkCard = useFlashcardCheck();

  const cards: Flashcard[] = useMemo(() => {
    if (!apiCards) return [];
    return apiCards.map((c, i) => ({
      id: i + 1, question: c.front, answer: c.back, tag: c.topic_tag,
      card_id: c.card_id, repetitions: c.repetitions, easiness: c.easiness, interval_days: c.interval_days,
    }));
  }, [apiCards]);

  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [userAttempt, setUserAttempt] = useState("");
  const [aiFeedback, setAiFeedback] = useState<AiFeedback | null>(null);
  const [aiChecking, setAiChecking] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [sessionRatings, setSessionRatings] = useState<Record<number, number>>({});
  const [done, setDone] = useState(false);

  const card = cards[idx];

  const resetCard = () => {
    setUserAttempt(""); setAiFeedback(null); setAiChecking(false); setRevealed(false);
  };

  const reveal = () => {
    if (animating || revealed) return;
    if (userAttempt.trim() && !aiFeedback && card) {
      setAiChecking(true);
      checkCard.mutate(
        { question: card.question, student_answer: userAttempt, correct_answer: card.answer, card_id: card.card_id, repetitions: card.repetitions, easiness: card.easiness, interval_days: card.interval_days },
        { onSuccess: (d) => { setAiFeedback(d); setAiChecking(false); }, onError: () => setAiChecking(false) }
      );
    }
    setRevealed(true);
  };

  const handleRating = (value: number) => {
    if (!card) return;
    setSessionRatings(prev => ({ ...prev, [card.id]: value }));
    setAnimating(true);
    resetCard();
    if (idx < cards.length - 1) {
      setTimeout(() => { setIdx(i => i + 1); setAnimating(false); }, 250);
    } else {
      setTimeout(() => { setDone(true); setAnimating(false); }, 250);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] flex-col gap-4">
        <span className="w-8 h-8 border-2 border-[#3C90FF]/20 border-t-[#3C90FF] rounded-full animate-spin" />
        <span className="text-[#1F1F1F]/40 text-sm">Loading flashcards…</span>
      </div>
    );
  }

  if (!isLoading && cards.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] flex-col gap-4 text-[#1F1F1F]/40">
        <p className="text-sm">No flashcards available.</p>
        <button onClick={() => router.push("/dashboard")} className="text-[#3C90FF] text-sm font-semibold hover:opacity-70 transition-opacity">
          Back to Learn
        </button>
      </div>
    );
  }

  if (done) {
    const ratingCounts = { again: 0, hard: 0, good: 0, easy: 0 };
    Object.values(sessionRatings).forEach(v => {
      if (v === 1) ratingCounts.again++;
      else if (v === 2) ratingCounts.hard++;
      else if (v === 3) ratingCounts.good++;
      else if (v === 4) ratingCounts.easy++;
    });

    return (
      <div className="max-w-md mx-auto px-5 py-12 text-center">
        <p className="text-[#1F1F1F]/40 text-[10px] uppercase tracking-[0.18em] font-semibold mb-2">Session complete</p>
        <h2 className="gem-gradient-text text-[48px] font-medium tracking-[-0.04em] leading-none mb-6">Well done</h2>
        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { label: "Again", val: ratingCounts.again, color: "#ef4444" },
            { label: "Hard", val: ratingCounts.hard, color: "#f59e0b" },
            { label: "Good", val: ratingCounts.good, color: "#3C90FF" },
            { label: "Easy", val: ratingCounts.easy, color: "#22c55e" },
          ].map(({ label, val, color }) => (
            <div key={label} className="gem-glass rounded-[16px] p-3 text-center">
              <div className="text-2xl font-medium" style={{ color }}>{val}</div>
              <div className="text-[10px] font-semibold mt-1" style={{ color }}>{label}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => { setIdx(0); setDone(false); setSessionRatings({}); resetCard(); }}
            className="px-6 py-2.5 rounded-full bg-[#3C90FF] text-white text-sm font-semibold hover:bg-[#5AA6FF] transition-colors"
          >
            Restart deck
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2.5 rounded-full gem-glass text-[#1F1F1F]/60 text-sm font-semibold hover:text-[#1F1F1F] transition-colors"
          >
            Back to Learn
          </button>
        </div>
      </div>
    );
  }

  if (!card) return null;

  const imgSrc = tagToImage(card.tag);
  const totalDots = Math.min(cards.length, 12);
  const dotIdx = Math.min(idx, totalDots - 1);

  return (
    <div className="max-w-2xl mx-auto px-5 py-4 flex flex-col" style={{ height: "calc(100vh - 0px)" }}>
      {/* Progress bar header */}
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-[#1F1F1F]/30 hover:text-[#1F1F1F]/60 transition-colors text-lg"
        >
          ✕
        </button>
        <div className="flex-1 flex gap-1">
          {Array.from({ length: totalDots }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-1.5 rounded-full transition-colors"
              style={{
                background: i < dotIdx ? "#3C90FF" : i === dotIdx ? "rgba(60,144,255,0.5)" : "rgba(0,0,0,0.1)"
              }}
            />
          ))}
        </div>
        <span className="text-[#1F1F1F]/40 text-xs font-mono">{idx + 1}/{cards.length}</span>
      </div>

      {/* Card */}
      <div className="flex-1 gem-glass rounded-[30px] overflow-hidden relative">
        {/* Background anatomy image */}
        <div className="absolute inset-0 opacity-12 pointer-events-none">
          <Image src={imgSrc} alt="" fill sizes="700px" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-transparent to-white/80" />
        </div>

        {/* Content */}
        <div className="relative z-10 h-full overflow-y-auto p-6 flex flex-col">
          {/* Topic pill */}
          <div className="mb-4">
            <span className="bg-[#3C90FF]/10 border border-[#3C90FF]/20 rounded-full px-3 py-1 text-[10px] font-semibold text-[#3C90FF]">
              {card.tag}
            </span>
          </div>

          {/* Question */}
          <p className="text-[#1F1F1F] text-lg font-medium leading-snug tracking-[-0.01em] mb-5">{card.question}</p>

          {/* Pre-reveal: user attempt textarea */}
          {!revealed && (
            <div className="mb-4">
              <textarea
                value={userAttempt}
                onChange={e => setUserAttempt(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && userAttempt.trim()) { e.preventDefault(); reveal(); } }}
                placeholder="Write your answer before revealing — optional, but builds retention"
                rows={3}
                className="w-full bg-transparent border-b border-black/[0.1] py-2 text-[#1F1F1F] text-sm placeholder:text-[#1F1F1F]/25 outline-none resize-none leading-relaxed"
              />
              {userAttempt.trim() && <div className="text-[#1F1F1F]/25 text-[10px] mt-1">Ctrl+Enter to reveal</div>}
            </div>
          )}

          {/* Post-reveal: answer */}
          {revealed && (
            <div className="mb-5">
              <div className="border-l-2 border-[#3C90FF] pl-4 mb-4">
                <div className="text-[#3C90FF] text-[10px] uppercase tracking-[0.12em] font-semibold mb-2">Answer</div>
                <p className="text-[#1F1F1F] text-sm leading-relaxed whitespace-pre-wrap">{card.answer}</p>
              </div>

              {/* AI feedback */}
              {(aiChecking || aiFeedback) && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-[14px] p-3 mb-4">
                  {aiChecking ? (
                    <div className="flex items-center gap-2 text-blue-500 text-xs">
                      <span className="w-3 h-3 border border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                      Reviewing your answer…
                    </div>
                  ) : aiFeedback ? (
                    <>
                      <div className="text-blue-500 text-[9px] uppercase tracking-[0.12em] font-semibold mb-1.5">
                        Tutor · {aiFeedback.score}/10
                      </div>
                      <p className="text-[#1F1F1F]/60 text-xs leading-relaxed">{aiFeedback.feedback}</p>
                    </>
                  ) : null}
                </div>
              )}

              {/* Rating buttons */}
              <div>
                <div className="text-[#1F1F1F]/30 text-[10px] uppercase tracking-[0.1em] font-semibold mb-3">How well did you recall this?</div>
                <div className="grid grid-cols-4 gap-2">
                  {RATINGS.map(r => (
                    <button
                      key={r.label}
                      onClick={() => handleRating(r.value)}
                      className="py-3 rounded-[14px] text-center transition-all hover:scale-[1.03] active:scale-[0.97]"
                      style={{ background: `${r.accent}12`, border: `2px solid ${r.accent}30` }}
                    >
                      <div className="text-sm font-bold" style={{ color: r.accent }}>{r.label}</div>
                      <div className="text-[9px] font-medium opacity-70 mt-0.5" style={{ color: r.accent }}>{r.caption}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex-1" />

          {/* Reveal button or end session */}
          {!revealed ? (
            <button
              onClick={reveal}
              className="w-full py-3.5 rounded-full bg-[#3C90FF] text-white text-sm font-semibold hover:bg-[#5AA6FF] transition-colors"
            >
              Reveal Answer
            </button>
          ) : (
            <button
              onClick={() => router.push("/dashboard")}
              className="text-[#1F1F1F]/30 text-xs hover:text-[#1F1F1F]/60 transition-colors text-center"
            >
              End session →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
