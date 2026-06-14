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
  getStoredHearts,
} from "@/lib/legacy/gamification";
import { useFlashcards, useFlashcardCheck, useFlashcardTopics } from "@/hooks/useFlashcards";
import { useGamificationSync } from "@/hooks/useGamification";

type Difficulty = "easy" | "medium";

/** Hard cap on a student's typed recall answer — keeps answers concise (matching
 *  the short model answers) and bounds the tokens sent to the AI grader. */
const MAX_ANSWER_CHARS = 300;

interface Flashcard {
  id: number; question: string; answer: string; tag: string;
  card_id?: string; repetitions?: number; easiness?: number; interval_days?: number;
}
interface AiFeedback { feedback: string; score: number; }

/** The AI's 0-100 grade decides the XP, on the same 5-35 per-card scale the old
 *  self-rating used. A floor of 5 rewards every genuine attempt. */
function xpForScore(score: number): number {
  const s = Math.max(0, Math.min(100, score));
  return Math.max(5, Math.round((s / 100) * 35));
}

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
  const [cardXp, setCardXp] = useState(0);            // XP the AI awarded for the current card
  const [gradedCount, setGradedCount] = useState(0);
  const [scoreSum, setScoreSum] = useState(0);
  const [displayHearts, setDisplayHearts] = useState(() => getStoredHearts());

  const deckTitle = useMemo(() => {
    if (cards.length === 0) return "Flashcards";
    const freq: Record<string, number> = {};
    for (const c of cards) freq[c.tag] = (freq[c.tag] ?? 0) + 1;
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  }, [cards]);

  const card = cards[idx];

  const resetCardState = () => { setUserAttempt(""); setAiFeedback(null); setAiChecking(false); setSubmitted(false); setCardXp(0); };

  // Answering is compulsory: the typed attempt is submitted, the AI grades it
  // out of 100 against the crafted model answer (the card's KB-grounded back),
  // and that grade decides the XP — awarded the moment it's known. Only then is
  // the model answer revealed. A grading failure still rewards the attempt and
  // lets the student continue.
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
          const xp = xpForScore(d.score);
          setCardXp(xp);
          addXP(xp);
          setSessionXp((p) => p + xp);
          setGradedCount((n) => n + 1);
          setScoreSum((s) => s + Math.max(0, Math.min(100, d.score)));
          const unlocked = checkAndUnlockAchievements();
          if (unlocked.length > 0) setNewAchievements((p) => [...p, ...unlocked]);
        },
        onError: () => {
          setAiChecking(false);
          // Grading unavailable — still reward the attempt generously so nobody is stuck.
          const xp = xpForScore(60);
          setCardXp(xp);
          addXP(xp);
          setSessionXp((p) => p + xp);
        },
      },
    );
  };

  // No more self-rating — the AI's grade already set the XP. Advancing just moves
  // to the next card, or finishes the run and syncs the session XP.
  const advance = () => {
    resetCardState();
    if (idx < cards.length - 1) {
      setIdx((i) => i + 1);
    } else {
      syncGamification({ xp_delta: sessionXp + XP_REWARDS.sessionComplete, hearts_used: 0 })
        .finally(() => router.push("/summary"));
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

  // Encouraging coach bubbles — informal, lighthearted, and context-aware. Phrasing
  // is keyed off idx (stable per card) so it never flickers while the student types.
  const remaining = Math.max(0, cards.length - idx - 1);
  const progressTip =
    remaining === 0 ? "🏁 Last card — finish strong!"
    : remaining <= 2 ? `Almost there — ${remaining} to go! 🙌`
    : `${remaining} cards left · ${sessionXp} XP so far ⚡`;
  const coach: { msg: string; tip: string } = (() => {
    const pick = (arr: string[]) => arr[idx % arr.length];
    if (!submitted) return {
      msg: pick([
        "Give it a real go — even a rough guess wires it in 🧠",
        "Type what you remember. Half-right still earns XP 💪",
        "No peeking! Your brain learns most when it has to reach 🤓",
      ]),
      tip: "Answer well for up to +35 XP a card ⚡",
    };
    if (aiChecking) return { msg: "Marking your answer… ✍️", tip: "" };
    if (!aiFeedback) return { msg: `Nice try! +${cardXp} XP — peek at the model answer 👇`, tip: progressTip };
    const s = aiFeedback.score;
    const msg =
      s >= 85 ? `🔥 Smashed it! +${cardXp} XP in the bank.`
      : s >= 60 ? `💪 Solid — +${cardXp} XP. You're really getting it.`
      : s >= 40 ? `📈 Good effort — +${cardXp} XP. The model answer will top you up.`
      : `🌱 +${cardXp} XP for trying — read the model answer, you've got this.`;
    return { msg, tip: progressTip };
  })();

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
                  onChange={(e) => setUserAttempt(e.target.value.slice(0, MAX_ANSWER_CHARS))}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && userAttempt.trim()) { e.preventDefault(); submitAnswer(); } }}
                  placeholder="Type your answer — you must answer before it's graded"
                  rows={3}
                  maxLength={MAX_ANSWER_CHARS}
                  aria-label="Your answer"
                />
                <div className="aurora-recall-meta">
                  {!userAttempt.trim()
                    ? <span className="aurora-recall-hint">Answering is required — this is active recall.</span>
                    : <span aria-hidden />}
                  <span
                    className={`aurora-recall-count${userAttempt.length >= MAX_ANSWER_CHARS - 20 ? " is-warn" : ""}`}
                    aria-live="polite"
                  >
                    {userAttempt.length} / {MAX_ANSWER_CHARS}
                  </span>
                </div>
                <button
                  type="button"
                  className="aurora-cta aurora-flow aurora-reveal-btn"
                  onClick={submitAnswer}
                  disabled={!userAttempt.trim()}
                >
                  <span>Submit for grading</span>
                </button>
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
                          <span className="aurora-feedback-head">
                            <span>Tutor · {aiFeedback.score}/100</span>
                            <span className="aurora-feedback-xp">+{cardXp} XP</span>
                          </span>
                          <p>{aiFeedback.feedback}</p>
                        </>
                      ) : (
                        <>
                          <span className="aurora-feedback-head">
                            <span>Graded offline</span>
                            <span className="aurora-feedback-xp">+{cardXp} XP</span>
                          </span>
                          <p className="aurora-muted">Couldn&apos;t grade automatically — compare your answer with the model answer below.</p>
                        </>
                      )}
                    </div>

                    <div className="aurora-answer">
                      <span className="aurora-answer-label">Model answer</span>
                      <p>{card.answer}</p>
                    </div>

                    <button type="button" className="aurora-cta aurora-flow aurora-reveal-btn" onClick={advance}>
                      <span>{idx < cards.length - 1 ? "Next card →" : "Finish session →"}</span>
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </section>

        <aside className="aurora-deck-side" aria-label="Session">
          <div className="aurora-card aurora-coach">
            <div className="aurora-coach-top">
              <span className="aurora-coach-avatar" aria-hidden>✦</span>
              <span className="aurora-side-label">Coach</span>
            </div>
            <div key={coach.msg} className="aurora-coach-bubble" aria-live="polite">{coach.msg}</div>
            {coach.tip && <div key={coach.tip} className="aurora-coach-bubble is-tip">{coach.tip}</div>}
          </div>

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
            <p className="aurora-side-label">This session</p>
            <p className="aurora-side-xp"><span className="aurora-clip">+{sessionXp}</span> <small>XP</small></p>
            <div className="aurora-matrix-row"><span>Graded</span><span className="aurora-matrix-val">{gradedCount}</span></div>
            <div className="aurora-matrix-row"><span>Avg score</span><span className="aurora-matrix-val">{gradedCount ? Math.round(scoreSum / gradedCount) : "—"}</span></div>
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
