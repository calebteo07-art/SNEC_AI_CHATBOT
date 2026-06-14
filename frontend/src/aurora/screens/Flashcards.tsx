"use client";
/* AURORA Flashcards — active-recall spaced repetition, rebuilt calm. A focused
   card (plate + question + optional recall + answer + AI check), SM-2 rating chips
   that ride the gradient by position, and a session side panel. Data + AI check +
   gamification sync are ported from the legacy FlashcardScreen; the fx layer
   (confetti / audio / swipe / framer) is dropped. */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlateWell } from "@/aurora/components/PlateWell";
import { PLATE } from "@/aurora/media";
import { Icon } from "@/aurora/icons";
import { AchievementManager } from "@/screens/AchievementToast";
import {
  getUserProgress, addXP, checkAndUnlockAchievements, XP_REWARDS,
  getStoredHearts, setStoredHearts,
} from "@/lib/legacy/gamification";
import { useFlashcards, useFlashcardCheck, useFlashcardTopics } from "@/hooks/useFlashcards";
import { useGamificationSync } from "@/hooks/useGamification";

type Difficulty = "easy" | "medium";

interface Flashcard {
  id: number; question: string; answer: string; tag: string;
  card_id?: string; repetitions?: number; easiness?: number; interval_days?: number;
}
interface AiFeedback { feedback: string; score: number; }

const RATINGS = [
  { label: "Again", cap: "Try soon",   value: 1, grad: "linear-gradient(120deg, #D96570, #C0496A)" },
  { label: "Hard",  cap: "Effortful",  value: 2, grad: "linear-gradient(120deg, #D96570, #9B72CB)" },
  { label: "Good",  cap: "Solid",      value: 3, grad: "linear-gradient(120deg, #9B72CB, #4285F4)" },
  { label: "Easy",  cap: "Mastered",   value: 4, grad: "linear-gradient(120deg, #4285F4, #6AA3FF)" },
];

function loadSessionCards(): Flashcard[] {
  try {
    const s = JSON.parse(sessionStorage.getItem("eyebot_session") || "{}");
    if (Array.isArray(s.cards) && s.cards.length > 0) {
      return s.cards.map((c: { front: string; back: string; topic_tag: string }, i: number) => ({
        id: i + 1, question: c.front, answer: c.back, tag: c.topic_tag,
      }));
    }
  } catch { /* fall through */ }
  return [];
}

export function Flashcards() {
  const router = useRouter();
  const sessionCards = useMemo(() => loadSessionCards(), []);

  // Topic + difficulty picker — skipped when arriving from a tutor session.
  const fromSession = sessionCards.length > 0;
  const { data: topicSets } = useFlashcardTopics();
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [setKey, setSetKey] = useState<string | null>(null);
  const [pickerDone, setPickerDone] = useState(false);

  const { data: apiCardsRaw, isLoading: apiLoading } = useFlashcards(
    setKey,
    !fromSession && pickerDone,
  );
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
  const [matrix, setMatrix] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [displayHearts, setDisplayHearts] = useState(() => getStoredHearts());

  const deckTitle = useMemo(() => {
    if (cards.length === 0) return "Flashcards";
    const freq: Record<string, number> = {};
    for (const c of cards) freq[c.tag] = (freq[c.tag] ?? 0) + 1;
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  }, [cards]);

  const card = cards[idx];

  const resetCardState = () => { setUserAttempt(""); setAiFeedback(null); setAiChecking(false); setSubmitted(false); };

  // Answering is compulsory: the typed attempt is submitted, the AI grades it
  // against the crafted model answer (the card's KB-grounded back), and only then
  // is the model answer revealed for comparison. A grading failure still lets the
  // student see the model answer and continue.
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
        onSuccess: (d) => { setAiFeedback(d); setAiChecking(false); },
        onError: () => setAiChecking(false),
      },
    );
  };

  const handleRating = (value: number) => {
    if (!card) return;
    const xpMap: Record<number, number> = {
      1: XP_REWARDS.flashcardAgain, 2: XP_REWARDS.flashcardHard, 3: XP_REWARDS.flashcardGood, 4: XP_REWARDS.flashcardEasy,
    };
    const xpAmount = xpMap[value] ?? 0;
    addXP(xpAmount);
    setSessionXp((p) => p + xpAmount);

    let nextAgain = matrix.again;
    if (value === 1) {
      const newH = Math.max(0, getStoredHearts() - 1);
      setStoredHearts(newH); setDisplayHearts(newH);
      nextAgain = matrix.again + 1;
      setMatrix((m) => ({ ...m, again: m.again + 1 }));
    } else if (value === 2) setMatrix((m) => ({ ...m, hard: m.hard + 1 }));
    else if (value === 3) setMatrix((m) => ({ ...m, good: m.good + 1 }));
    else setMatrix((m) => ({ ...m, easy: m.easy + 1 }));

    const unlocked = checkAndUnlockAchievements();
    if (unlocked.length > 0) setNewAchievements((p) => [...p, ...unlocked]);

    resetCardState();
    if (idx < cards.length - 1) {
      setIdx((i) => i + 1);
    } else {
      const totalXp = sessionXp + xpAmount + XP_REWARDS.sessionComplete;
      syncGamification({ xp_delta: totalXp, hearts_used: nextAgain }).finally(() => router.push("/summary"));
    }
  };

  useEffect(() => { /* keep hearts mirror fresh on mount */ setDisplayHearts(getStoredHearts()); }, []);

  // Topic + difficulty picker (shown until a set is chosen; skipped from a session).
  if (!fromSession && !pickerDone) {
    const sets = (topicSets ?? []).filter((s) => s.difficulty === difficulty);
    return (
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "32px 20px", width: "100%" }}>
        <header style={{ marginBottom: 20 }}>
          <p className="aurora-eyebrow">Flashcards</p>
          <h1 className="aurora-h1">Choose a topic</h1>
          <p className="aurora-sub">Pick a difficulty and a topic. Cards don&apos;t repeat until you&apos;ve seen the whole set.</p>
        </header>

        <div className="aurora-topic-picker" role="tablist" aria-label="Difficulty">
          {(["easy", "medium"] as Difficulty[]).map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={difficulty === d}
              className={`aurora-topic-chip${difficulty === d ? " is-active" : ""}`}
              onClick={() => setDifficulty(d)}
            >
              {d === "easy" ? "Easy" : "Medium"}
            </button>
          ))}
        </div>

        <div className="aurora-topic-picker" role="tablist" aria-label="Topics" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="aurora-topic-chip"
            onClick={() => { setSetKey(null); setPickerDone(true); }}
          >
            Mixed (all topics)
          </button>
          {sets.map((s) => (
            <button
              key={s.set_key}
              type="button"
              className="aurora-topic-chip"
              disabled={s.total === 0}
              onClick={() => { setSetKey(s.set_key); setPickerDone(true); }}
            >
              {s.label}
              <span className="aurora-topic-count">{s.completed}/{s.total}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="aurora-toggle"
          style={{ marginTop: 24 }}
          onClick={() => router.push("/dashboard")}
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (generating || cards.length === 0) {
    return (
      <div className="aurora-deck-empty">
        <h1 className="sr-only">Flashcards</h1>
        {generating ? (
          <p className="aurora-muted">Loading your cards…</p>
        ) : (
          <>
            <p className="aurora-muted">No cards in this set yet — more are on the way.</p>
            <button type="button" className="aurora-toggle" onClick={() => { setPickerDone(false); }}>Choose another topic</button>
          </>
        )}
      </div>
    );
  }

  const totalDots = Math.min(cards.length, 10);
  const dotIdx = Math.min(idx, totalDots - 1);
  const xpTotal = getUserProgress().xp;

  return (
    <div className="aurora-deck">
      <h1 className="sr-only">Flashcards</h1>
      <AchievementManager achievements={newAchievements} onDismiss={(id) => setNewAchievements((p) => p.filter((a) => a !== id))} />

      <div className="aurora-deck-head">
        <button type="button" className="aurora-deck-close" onClick={() => router.push("/dashboard")} aria-label="Exit deck"><Icon.close size={18} /></button>
        <div className="aurora-deck-dots" role="progressbar" aria-valuenow={idx + 1} aria-valuemax={cards.length}>
          {Array.from({ length: totalDots }).map((_, i) => (
            <span key={i} className={`aurora-dot${i < dotIdx ? " is-done" : i === dotIdx ? " is-active" : ""}`} />
          ))}
        </div>
        <span className="aurora-deck-hearts" aria-label={`${displayHearts} hearts`}>♥ {displayHearts}</span>
      </div>

      <div className="aurora-deck-body">
        <section className="aurora-card aurora-deck-card">
          <div className="aurora-deck-plate"><PlateWell src={PLATE.flashcards} alt={`${card.tag} reference eye`} ratio={1} /></div>
          <div className="aurora-deck-content">
            <span className="aurora-deck-topic">{card.tag} · {deckTitle}</span>
            <p className="aurora-deck-q">{card.question}</p>

            {!submitted && (
              <>
                <textarea
                  className="aurora-deck-recall"
                  value={userAttempt}
                  onChange={(e) => setUserAttempt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && userAttempt.trim()) { e.preventDefault(); submitAnswer(); } }}
                  placeholder="Type your answer — you must answer before it's graded"
                  rows={3}
                  aria-label="Your answer"
                />
                <button
                  type="button"
                  className="aurora-cta aurora-flow aurora-reveal-btn"
                  onClick={submitAnswer}
                  disabled={!userAttempt.trim()}
                >
                  <span>Submit for grading</span>
                </button>
                {!userAttempt.trim() && <p className="aurora-recall-hint">Answering is required — this is active recall.</p>}
              </>
            )}

            {submitted && (
              <>
                <div className="aurora-answer aurora-your-answer">
                  <span className="aurora-answer-label">Your answer</span>
                  <p>{userAttempt}</p>
                </div>

                {aiChecking ? (
                  <div className="aurora-feedback"><p className="aurora-muted">Grading your answer…</p></div>
                ) : (
                  <>
                    <div className="aurora-feedback">
                      {aiFeedback ? (
                        <>
                          <span className="aurora-feedback-head">Tutor · {aiFeedback.score}/10</span>
                          <p>{aiFeedback.feedback}</p>
                        </>
                      ) : (
                        <p className="aurora-muted">Couldn&apos;t grade automatically — compare your answer with the model answer below.</p>
                      )}
                    </div>

                    <div className="aurora-answer">
                      <span className="aurora-answer-label">Model answer</span>
                      <p>{card.answer}</p>
                    </div>

                    <p className="aurora-rate-head">How well did you recall this?</p>
                    <div className="aurora-rate-grid">
                      {RATINGS.map((r) => (
                        <button key={r.label} type="button" className="aurora-rate" style={{ backgroundImage: r.grad }} onClick={() => handleRating(r.value)}>
                          <span className="aurora-rate-label">{r.label}</span>
                          <span className="aurora-rate-cap">{r.cap}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </section>

        <aside className="aurora-deck-side" aria-label="Session">
          <div className="aurora-card aurora-side-card">
            <p className="aurora-side-label">Queue · {Math.max(0, cards.length - idx - 1)} left</p>
            {cards.slice(idx + 1, idx + 6).map((c, i) => (
              <div key={c.id} className="aurora-queue-item">
                <span className="aurora-queue-num">{idx + 2 + i}</span>
                <span className="aurora-queue-q">{c.question.length > 38 ? c.question.slice(0, 38) + "…" : c.question}</span>
              </div>
            ))}
            {cards.slice(idx + 1, idx + 6).length === 0 && <p className="aurora-muted">Last card</p>}
          </div>

          <div className="aurora-card aurora-side-card">
            <p className="aurora-side-label">Session</p>
            {([["Again", matrix.again], ["Hard", matrix.hard], ["Good", matrix.good], ["Easy", matrix.easy]] as const).map(([label, val]) => (
              <div key={label} className="aurora-matrix-row">
                <span>{label}</span>
                <span className="aurora-matrix-val">{val}</span>
              </div>
            ))}
          </div>

          <div className="aurora-card aurora-side-card">
            <p className="aurora-side-label">This session</p>
            <p className="aurora-side-xp"><span className="aurora-clip">+{sessionXp}</span> <small>XP</small></p>
            <div className="aurora-matrix-row"><span>Total XP</span><span className="aurora-matrix-val">{xpTotal}</span></div>
            <div className="aurora-deck-progress">
              <div className="aurora-progress"><div className="aurora-progress-fill aurora-flow" style={{ width: `${((idx + 1) / cards.length) * 100}%` }} /></div>
              <span className="aurora-deck-count">{idx + 1} / {cards.length}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
