"use client";
/* AURORA Flashcards — a thin orchestrator. Owns session state and the grading flow
   (unchanged mechanics — AI grade /100, XP on the 5-35 scale, SM-2 fields passed
   through, weak-card retry, review + tutor-seed entry), and renders SessionSetup
   then StudyStage inside the immersive light FlashShell. All presentation lives in
   components/flashcards/*. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { rankForLevel } from "@/lib/rank";
import {
  addXP, checkAndUnlockAchievements, incrementTotalCards, XP_REWARDS,
} from "@/lib/legacy/gamification";
import { useFlashcards, useFlashcardCheck, useFlashcardTopics } from "@/hooks/useFlashcards";
import { useGamificationSync } from "@/hooks/useGamification";
import { type Flashcard, type AiFeedback, type Difficulty, RETRY_THRESHOLD, xpForScore, loadSessionCards, topicHue } from "@/aurora/components/flashcards/types";
import { SessionSetup } from "@/aurora/components/flashcards/SessionSetup";
import { StudyStage } from "@/aurora/components/flashcards/StudyStage";
import { FlashShell } from "@/aurora/components/flashcards/FlashShell";


export function Flashcards() {
  const router = useRouter();
  const sessionCards = useMemo(() => loadSessionCards(), []);
  const reviewMode = useMemo(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "review",
    [],
  );

  const fromSession = sessionCards.length > 0;
  const { data: topicSets } = useFlashcardTopics();
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [setKey, setSetKey] = useState<string | null>(null);
  const [sessionLength, setSessionLength] = useState(10);
  const [pickerDone, setPickerDone] = useState(reviewMode);

  const { data: apiCardsRaw, isLoading: apiLoading } = useFlashcards(setKey, !fromSession && pickerDone, sessionLength);
  const checkCard = useFlashcardCheck();
  const { mutateAsync: syncGamification } = useGamificationSync();

  const cards: Flashcard[] = useMemo(() => {
    if (sessionCards.length > 0) return sessionCards;
    if (!Array.isArray(apiCardsRaw)) return [];
    return apiCardsRaw.map((c, i) => ({
      id: i + 1, question: c.front, answer: c.back, tag: c.topic_tag,
      card_id: c.card_id, repetitions: c.repetitions, easiness: c.easiness, interval_days: c.interval_days,
    }));
  }, [sessionCards, apiCardsRaw]);

  const generating = sessionCards.length === 0 && apiLoading;
  const [idx, setIdx] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [userAttempt, setUserAttempt] = useState("");
  const [aiFeedback, setAiFeedback] = useState<AiFeedback | null>(null);
  const [aiChecking, setAiChecking] = useState(false);
  const [newAchievements, setNewAchievements] = useState<string[]>([]);
  const [sessionXp, setSessionXp] = useState(0);
  const [cardXp, setCardXp] = useState(0);
  const [gradedCount, setGradedCount] = useState(0);
  const [scoreSum, setScoreSum] = useState(0);
  const [retries, setRetries] = useState<Flashcard[]>([]);
  const weakRef = useRef<Flashcard[]>([]);
  const retriedRef = useRef<Set<number>>(new Set());

  const deckTitle = useMemo(() => {
    if (cards.length === 0) return "Flashcards";
    const freq: Record<string, number> = {};
    for (const c of cards) freq[c.tag] = (freq[c.tag] ?? 0) + 1;
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  }, [cards]);

  const deck = useMemo(() => [...cards, ...retries], [cards, retries]);
  const total = deck.length;
  const card = deck[idx];
  const isRetry = idx >= cards.length;
  const stageHue = topicHue(card?.tag ?? "__mixed");

  const resetCardState = () => { setUserAttempt(""); setAiFeedback(null); setAiChecking(false); setSubmitted(false); setCardXp(0); };

  // Hold the focusing loader on screen for a satisfying minimum before the reveal,
  // even when grading returns fast. Reduced motion reveals immediately.
  const MIN_FOCUS_MS = 850;
  const gradeStartRef = useRef(0);
  const gradeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (gradeTimerRef.current) clearTimeout(gradeTimerRef.current); }, []);
  const revealAfterFocus = (fn: () => void) => {
    const reduce = document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wait = reduce ? 0 : Math.max(0, MIN_FOCUS_MS - (Date.now() - gradeStartRef.current));
    if (wait === 0) { fn(); return; }
    gradeTimerRef.current = setTimeout(fn, wait);
  };

  const submitAnswer = () => {
    if (!userAttempt.trim() || submitted || !card) return;
    setSubmitted(true);
    setAiChecking(true);
    gradeStartRef.current = Date.now();
    checkCard.mutate(
      {
        question: card.question, student_answer: userAttempt, correct_answer: card.answer,
        card_id: card.card_id, repetitions: card.repetitions, easiness: card.easiness, interval_days: card.interval_days,
      },
      {
        onSuccess: (d) => revealAfterFocus(() => {
          setAiFeedback(d);
          setAiChecking(false);
          const score = Math.max(0, Math.min(100, d.score));
          const xp = xpForScore(score);
          setCardXp(xp);
          const res = addXP(xp);
          setSessionXp((p) => p + xp);
          setGradedCount((n) => n + 1);
          setScoreSum((s) => s + score);
          if (score < RETRY_THRESHOLD && !retriedRef.current.has(card.id)) weakRef.current.push(card);
          if (res.leveledUp) {
            const rank = rankForLevel(res.newLevel);
            toast.success(`Level up! You're now Level ${res.newLevel} · ${rank.title} 🎉`);
          }
          incrementTotalCards();
          const unlocked = checkAndUnlockAchievements();
          if (unlocked.length > 0) setNewAchievements((p) => [...p, ...unlocked]);
        }),
        onError: () => revealAfterFocus(() => {
          setAiChecking(false);
          const xp = xpForScore(60);
          setCardXp(xp);
          addXP(xp);
          setSessionXp((p) => p + xp);
          incrementTotalCards();
          const unlocked = checkAndUnlockAchievements();
          if (unlocked.length > 0) setNewAchievements((p) => [...p, ...unlocked]);
        }),
      },
    );
  };

  const finishSession = () => {
    const earnedXp = sessionXp + XP_REWARDS.sessionComplete;
    const avgScore = gradedCount ? Math.round(scoreSum / gradedCount) : 0;
    try {
      sessionStorage.setItem("eyebot_session", JSON.stringify({
        topic: deckTitle, cardsReviewed: gradedCount, avgScore, earnedXp,
        cardXp: sessionXp, bonusXp: XP_REWARDS.sessionComplete,
      }));
      sessionStorage.setItem("eyebot_session_complete", "1");
    } catch { /* no storage — Dashboard simply shows no toast */ }
    syncGamification({ xp_delta: earnedXp, hearts_used: 0 }).finally(() => router.push("/dashboard"));
  };

  const advance = () => {
    resetCardState();
    if (idx < cards.length + retries.length - 1) { setIdx((i) => i + 1); return; }
    const pending = weakRef.current.filter((c) => !retriedRef.current.has(c.id));
    if (pending.length > 0) {
      pending.forEach((c) => retriedRef.current.add(c.id));
      weakRef.current = [];
      setRetries((prev) => [...prev, ...pending]);
      setIdx((i) => i + 1);
      return;
    }
    finishSession();
  };

  const explainThis = () => {
    if (!card) return;
    try { sessionStorage.setItem("eyebot_tutor_seed", card.question); } catch { /* ignore */ }
    router.push("/chat");
  };

  const exit = () => router.push("/dashboard");
  const dismissAchievement = (id: string) => setNewAchievements((p) => p.filter((a) => a !== id));

  // Selection (skipped from a tutor session or review).
  if (!fromSession && !pickerDone) {
    return (
      <FlashShell newAchievements={newAchievements} onDismissAchievement={dismissAchievement} onExit={exit} topicHue={stageHue}>
        <SessionSetup
          topicSets={topicSets}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          sessionLength={sessionLength}
          setSessionLength={setSessionLength}
          onStart={(key) => { setSetKey(key); setPickerDone(true); }}
        />
      </FlashShell>
    );
  }

  if (generating || cards.length === 0 || !card) {
    return (
      <FlashShell newAchievements={newAchievements} onDismissAchievement={dismissAchievement} onExit={exit} topicHue={stageHue}>
        <div className="flash-stage flash-stage-msg">
          {generating
            ? <p className="flash-msg">Bringing your cards into focus…</p>
            : <p className="flash-msg">{reviewMode ? "Nothing due to review — great job staying sharp!" : "No cards in this set yet — more are on the way."}</p>}
        </div>
      </FlashShell>
    );
  }

  const avgScore = gradedCount ? Math.round(scoreSum / gradedCount) : null;
  const weakPending = weakRef.current.length > 0;

  return (
    <FlashShell newAchievements={newAchievements} onDismissAchievement={dismissAchievement} onExit={exit} topicHue={stageHue}>
      <StudyStage
        card={card}
        idx={idx}
        total={total}
        isRetry={isRetry}
        deckTitle={deckTitle}
        submitted={submitted}
        aiChecking={aiChecking}
        aiFeedback={aiFeedback}
        cardXp={cardXp}
        sessionXp={sessionXp}
        gradedCount={gradedCount}
        avgScore={avgScore}
        userAttempt={userAttempt}
        setUserAttempt={setUserAttempt}
        onSubmit={submitAnswer}
        onAdvance={advance}
        onExplain={explainThis}
        weakPending={weakPending}
      />
    </FlashShell>
  );
}
