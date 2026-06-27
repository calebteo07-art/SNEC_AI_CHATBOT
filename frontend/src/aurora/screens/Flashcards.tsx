"use client";
/* AURORA Flashcards — orchestrator. Deck state + instant MCQ grading (deterministic,
   client-side), background typed-reasoning grades (off the blocking path), result
   accumulation, the ResultsScreen, batched complete sync, and a missed-card drill.
   Presentation lives in components/flashcards/*. */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { rankForLevel } from "@/lib/rank";
import { addXP, checkAndUnlockAchievements, incrementTotalCards, XP_REWARDS } from "@/lib/legacy/gamification";
import {
  useFlashcards, useFlashcardTopics, useReasonCheck, useFlashcardComplete,
  type FlashcardItem, type CompleteCardResult,
} from "@/hooks/useFlashcards";
import {
  type Flashcard, type Difficulty, XP_CORRECT, XP_ATTEMPT, loadSessionCards, topicHue,
} from "@/aurora/components/flashcards/types";
import { SessionSetup } from "@/aurora/components/flashcards/SessionSetup";
import { StudyStage } from "@/aurora/components/flashcards/StudyStage";
import { ResultsScreen, type DeckResult } from "@/aurora/components/flashcards/ResultsScreen";
import { FlashShell } from "@/aurora/components/flashcards/FlashShell";

function toCard(c: FlashcardItem, i: number): Flashcard {
  return {
    id: i + 1, stem: c.stem, options: c.options, correct: c.correct, qtype: c.qtype,
    kind: c.kind, explanation: c.explanation, requiresExplanation: c.requires_explanation,
    tag: c.topic_tag, difficulty: (c.difficulty || "") as Difficulty | "",
    card_id: c.card_id, repetitions: c.repetitions, easiness: c.easiness, interval_days: c.interval_days,
  };
}

export function Flashcards() {
  const router = useRouter();
  const sessionCards = useMemo(() => loadSessionCards(), []);
  const reviewMode = useMemo(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "review", []);
  const fromSession = sessionCards.length > 0;

  const { data: topicSets } = useFlashcardTopics();
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [setKey, setSetKey] = useState<string | null>(null);
  const [sessionLength, setSessionLength] = useState(10);
  const [pickerDone, setPickerDone] = useState(reviewMode);

  const { data: apiCardsRaw, isLoading: apiLoading } = useFlashcards(setKey, !fromSession && pickerDone, sessionLength);
  const reasonCheck = useReasonCheck();
  const { mutate: complete } = useFlashcardComplete();

  const baseCards: Flashcard[] = useMemo(() => {
    if (sessionCards.length > 0) return sessionCards;
    if (!Array.isArray(apiCardsRaw)) return [];
    return apiCardsRaw.map(toCard);
  }, [sessionCards, apiCardsRaw]);

  const [drill, setDrill] = useState<Flashcard[]>([]);
  const deck = drill.length > 0 ? drill : baseCards;

  const [idx, setIdx] = useState(0);
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState(false);
  // Bumped on each drill round so StudyStage/McqCard remount — drill decks reuse card
  // ids (1..n), so without a fresh mount the child's per-card reset wouldn't fire.
  const [deckEpoch, setDeckEpoch] = useState(0);
  const reasonNotesRef = useRef<Record<number, string>>({});
  const [, force] = useState(0);

  // Accumulators
  const resultsRef = useRef<CompleteCardResult[]>([]);
  const byTopicRef = useRef<Record<string, { seen: number; missed: number }>>({});
  const reasonScoresRef = useRef<number[]>([]);
  const missedRef = useRef<Flashcard[]>([]);
  const xpRef = useRef(0);

  const deckTitle = useMemo(() => {
    if (deck.length === 0) return "Flashcards";
    const freq: Record<string, number> = {};
    for (const c of deck) freq[c.tag] = (freq[c.tag] ?? 0) + 1;
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  }, [deck]);

  const card = deck[idx];
  const total = deck.length;
  const stageHue = topicHue(card?.tag ?? "__mixed");
  const generating = sessionCards.length === 0 && apiLoading;

  const onCheck = (correct: boolean, _selected: number[], reasoning: string) => {
    if (checked || !card) return;
    setChecked(true);

    // Tally (skip double-counting on the free-text self-mark which calls onCheck once).
    resultsRef.current.push({
      card_id: card.card_id, correct,
      repetitions: card.repetitions, easiness: card.easiness, interval_days: card.interval_days,
    });
    const t = byTopicRef.current[card.tag] ?? { seen: 0, missed: 0 };
    t.seen += 1; if (!correct) t.missed += 1;
    byTopicRef.current[card.tag] = t;
    if (!correct) missedRef.current.push(card);

    const xp = correct ? XP_CORRECT : XP_ATTEMPT;
    xpRef.current += xp; addXP(xp); incrementTotalCards();
    const unlocked = checkAndUnlockAchievements();
    if (unlocked.length) toast.success("Achievement unlocked! 🏅");

    // Background typed-reasoning grade — never awaited, never blocks the reveal.
    if (card.requiresExplanation && reasoning) {
      const cardId = card.id;
      reasonCheck.mutate(
        { question: card.stem, student_answer: reasoning, correct_answer: card.explanation },
        {
          onSuccess: (d) => {
            reasonScoresRef.current.push(Math.max(0, Math.min(100, d.score)));
            reasonNotesRef.current[cardId] = d.feedback;
            force((x) => x + 1);
          },
          onError: () => { reasonNotesRef.current[cardId] = "Couldn't grade that one — keep going."; force((x) => x + 1); },
        },
      );
    }
  };

  const advance = () => {
    setChecked(false);
    if (idx < total - 1) { setIdx((i) => i + 1); return; }
    finish();
  };

  const finish = () => {
    setDone(true);
    const earned = xpRef.current + XP_REWARDS.sessionComplete;
    const res = addXP(XP_REWARDS.sessionComplete);
    if (res.leveledUp) {
      const rank = rankForLevel(res.newLevel);
      toast.success(`Level up! You're now Level ${res.newLevel} · ${rank.title} 🎉`);
    }
    complete({ results: resultsRef.current, xp_delta: earned });
  };

  const startDrill = () => {
    const missed = missedRef.current;
    if (missed.length === 0) return;
    // reset accumulators for the drill round (xpRef included — otherwise the drill's
    // /complete would re-send the original deck's XP on top of its own).
    resultsRef.current = []; byTopicRef.current = {}; reasonScoresRef.current = [];
    reasonNotesRef.current = {}; xpRef.current = 0;
    const next = missed.slice(); missedRef.current = [];
    setDrill(next.map((c, i) => ({ ...c, id: i + 1 })));
    setIdx(0); setChecked(false); setDone(false);
    setDeckEpoch((e) => e + 1);
  };

  const newDeck = () => router.push("/dashboard");  // re-enter setup from dashboard launchpad
  const exit = () => router.push("/dashboard");

  // ── Selection ──
  if (!fromSession && !pickerDone) {
    return (
      <FlashShell onExit={exit}>
        <SessionSetup
          topicSets={topicSets} difficulty={difficulty} setDifficulty={setDifficulty}
          sessionLength={sessionLength} setSessionLength={setSessionLength}
          onStart={(key) => { setSetKey(key); setPickerDone(true); }}
        />
      </FlashShell>
    );
  }

  if (generating || deck.length === 0 || !card) {
    return (
      <FlashShell onExit={exit} topicHue={stageHue}>
        <div className="flash-stage flash-stage-msg">
          {generating
            ? <p className="flash-msg">Bringing your cards into focus…</p>
            : <p className="flash-msg">{reviewMode ? "Nothing due to review — great job staying sharp!" : "No cards in this set yet — more are on the way."}</p>}
        </div>
      </FlashShell>
    );
  }

  if (done) {
    const result: DeckResult = {
      total: resultsRef.current.length,
      correct: resultsRef.current.filter((r) => r.correct).length,
      byTopic: byTopicRef.current,
      reasonScores: reasonScoresRef.current,
      missedCount: missedRef.current.length,
    };
    return (
      <FlashShell onExit={exit} topicHue={stageHue}>
        <ResultsScreen result={result} onDrillMissed={startDrill} onNewDeck={newDeck} onDone={exit} />
      </FlashShell>
    );
  }

  const advanceLabel = idx < total - 1 ? "Next card →" : "See results →";

  return (
    <FlashShell onExit={exit} topicHue={stageHue}>
      <StudyStage
        key={deckEpoch}
        card={card} idx={idx} total={total} deckTitle={deckTitle}
        checked={checked} reasonNote={reasonNotesRef.current[card.id] ?? null}
        onCheck={onCheck} onAdvance={advance} advanceLabel={advanceLabel}
      />
    </FlashShell>
  );
}
