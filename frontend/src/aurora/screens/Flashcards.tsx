"use client";
/* AURORA Flashcards — "The Aperture". A thin orchestrator: owns session state and
   the grading flow (unchanged mechanics — AI grade /100, XP on the 5-35 scale,
   SM-2 fields passed through, weak-card retry, review + tutor-seed entry), and
   renders the 3-step ApertureSelect then the StudyDeck inside the immersive,
   Twilight-themed root. All presentation lives in components/flashcards/*. */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { rankForLevel } from "@/lib/rank";
import { Icon } from "@/aurora/icons";
import { AchievementManager } from "@/screens/AchievementToast";
import {
  addXP, checkAndUnlockAchievements, incrementTotalCards, XP_REWARDS,
} from "@/lib/legacy/gamification";
import { useFlashcards, useFlashcardCheck, useFlashcardTopics } from "@/hooks/useFlashcards";
import { useGamificationSync } from "@/hooks/useGamification";
import { type Flashcard, type AiFeedback, type Difficulty, RETRY_THRESHOLD, xpForScore, loadSessionCards } from "@/aurora/components/flashcards/types";
import { ApertureSelect } from "@/aurora/components/flashcards/ApertureSelect";
import { StudyDeck } from "@/aurora/components/flashcards/StudyDeck";

/* The immersive Twilight root, shared by the picker / loading / deck states.
   Defined at module scope (NOT inside Flashcards) so it keeps a stable identity
   across renders — otherwise its subtree, including the recall textarea, would
   remount on every keystroke. */
function ApertureShell({
  newAchievements, onDismissAchievement, onExit, children,
}: {
  newAchievements: string[];
  onDismissAchievement: (id: string) => void;
  onExit: () => void;
  children: ReactNode;
}) {
  return (
    <div className="aperture-root" data-theme="aperture">
      <h1 className="sr-only">Flashcards</h1>
      <div className="aperture-field" aria-hidden><span /><span /><span /></div>
      <button type="button" className="aperture-exit aperture-press" data-testid="aperture-exit" onClick={onExit}>
        <Icon.back size={16} /> Exit
      </button>
      <AchievementManager achievements={newAchievements} onDismiss={onDismissAchievement} />
      <div className="aperture-content">{children}</div>
    </div>
  );
}

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

  const resetCardState = () => { setUserAttempt(""); setAiFeedback(null); setAiChecking(false); setSubmitted(false); setCardXp(0); };

  const submitAnswer = () => {
    if (!userAttempt.trim() || submitted || !card) return;
    setSubmitted(true);
    setAiChecking(true);
    checkCard.mutate(
      {
        question: card.question, student_answer: userAttempt, correct_answer: card.answer,
        card_id: card.card_id, repetitions: card.repetitions, easiness: card.easiness, interval_days: card.interval_days,
      },
      {
        onSuccess: (d) => {
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
        },
        onError: () => {
          setAiChecking(false);
          const xp = xpForScore(60);
          setCardXp(xp);
          addXP(xp);
          setSessionXp((p) => p + xp);
          incrementTotalCards();
          const unlocked = checkAndUnlockAchievements();
          if (unlocked.length > 0) setNewAchievements((p) => [...p, ...unlocked]);
        },
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
      <ApertureShell newAchievements={newAchievements} onDismissAchievement={dismissAchievement} onExit={exit}>
        <ApertureSelect
          topicSets={topicSets}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          sessionLength={sessionLength}
          setSessionLength={setSessionLength}
          onChoose={(key) => { setSetKey(key); setPickerDone(true); }}
        />
      </ApertureShell>
    );
  }

  if (generating || cards.length === 0 || !card) {
    return (
      <ApertureShell newAchievements={newAchievements} onDismissAchievement={dismissAchievement} onExit={exit}>
        <div className="aperture-deck" style={{ placeItems: "center" }}>
          {generating
            ? <p style={{ color: "var(--field-ink-2)" }}>Bringing your cards into focus…</p>
            : <p style={{ color: "var(--field-ink-2)" }}>{reviewMode ? "Nothing due to review — great job staying sharp!" : "No cards in this set yet — more are on the way."}</p>}
        </div>
      </ApertureShell>
    );
  }

  const avgScore = gradedCount ? Math.round(scoreSum / gradedCount) : null;
  const weakPending = weakRef.current.length > 0;

  return (
    <ApertureShell newAchievements={newAchievements} onDismissAchievement={dismissAchievement} onExit={exit}>
      <StudyDeck
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
    </ApertureShell>
  );
}
