"use client";
/* AURORA Flashcards — orchestrator. Deck state + instant MCQ grading (deterministic,
   client-side), background typed-reasoning grades (off the blocking path), result
   accumulation, the ResultsScreen, batched complete sync, and a missed-card drill.
   Presentation lives in components/flashcards/*. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addXP, incrementTotalCards } from "@/lib/legacy/gamification";
import { useQueryClient } from "@tanstack/react-query";
import {
  useFlashcards, useFlashcardTopics, useReasonCheck, useFlashcardComplete,
  type FlashcardItem, type CompleteCardResult,
} from "@/hooks/useFlashcards";
import {
  type Flashcard, type Difficulty, XP_ATTEMPT, cardBase, cardPoints, sessionBonus,
  loadSessionCards, topicHue, isRenderableCard, comboMultiplier,
} from "@/aurora/components/flashcards/types";
import { SessionSetup } from "@/aurora/components/flashcards/SessionSetup";
import { StudyStage } from "@/aurora/components/flashcards/StudyStage";
import { TopicIntro } from "@/aurora/components/flashcards/TopicIntro";
import { ComboBurst } from "@/aurora/components/flashcards/ComboBurst";
import { ResultsScreen, type DeckResult } from "@/aurora/components/flashcards/ResultsScreen";
import { FlashShell } from "@/aurora/components/flashcards/FlashShell";
import { PauseMenu } from "@/aurora/components/flashcards/PauseMenu";
import { createRoundForfeit, FORFEIT_LUMENS } from "@/aurora/lib/forfeitGuard";
import { leaveGuard } from "@/aurora/lib/leaveGuard";
import { useReward } from "@/aurora/rewards/RewardProvider";
import { grantAchievements } from "@/aurora/rewards/achieve";
import { useAuth } from "@/screens/AuthContext";

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
  const [setKey, setSetKey] = useState<string | null>(null);
  const sessionLength = 10; // fixed deck length — no length picker
  const [pickerDone, setPickerDone] = useState(reviewMode);
  // ricoe B5: after a fan pick, show a topic name+description intro card before Q1.
  // Only fan picks get an intro — tutor-handoff and ?mode=review flows skip straight in.
  const [intro, setIntro] = useState(false);

  const { data: apiCardsRaw, isLoading: apiLoading } = useFlashcards(setKey, !fromSession && pickerDone, sessionLength);
  const reasonCheck = useReasonCheck();
  const { mutate: complete } = useFlashcardComplete();
  const qc = useQueryClient();
  // One choke point for the quit penalty: charges the flat forfeit (server-owned
  // FORFEIT_PENALTY) at most once per active round, and only while a round is active. Every
  // exit route funnels through it so there's no loophole (Switch deck, Quit, browser Back,
  // ⌘K→away, refresh/close all charge once).
  const guard = useRef(createRoundForfeit()).current;
  const [paused, setPaused] = useState(false);
  // Destination of an intercepted rail / ⌘K jump made mid-round — drives the leave confirm.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const { enqueue } = useReward();
  const { user } = useAuth();

  const baseCards: Flashcard[] = useMemo(() => {
    if (sessionCards.length > 0) return sessionCards;
    if (!Array.isArray(apiCardsRaw)) return [];
    // Drop any malformed/stale-shaped card so it can't reach McqCard and crash the
    // page; if that empties the deck we fall through to the graceful empty state.
    return apiCardsRaw.map(toCard).filter(isRenderableCard);
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
  const comboRef = useRef(0);          // consecutive-correct streak (deck-level)
  const [combo, setCombo] = useState(0); // mirror for prop propagation to the card
  // Score telemetry (score = XP so far). scoreShown is the pre-card value handed to the
  // HUD; it only advances to the running total when we move to the next card.
  const [scoreShown, setScoreShown] = useState(0);
  // ricoe B3: the loud combo popup. Keyed so each qualifying streak restarts it.
  const [burst, setBurst] = useState<{ key: number; combo: number } | null>(null);

  // topic_key → human label (from the topics endpoint), falling back to a
  // prettified key so mixed / tutor-handoff decks still name their topic clearly.
  const topicLabels = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of topicSets ?? []) m[s.topic_key] = s.label;
    return m;
  }, [topicSets]);
  const labelForTag = (tag: string) =>
    topicLabels[tag] ?? tag.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());

  const card = deck[idx];
  const total = deck.length;
  const stageHue = topicHue(card?.tag ?? "__mixed");
  const generating = sessionCards.length === 0 && apiLoading;

  // A round is "active" exactly when the study stage below renders a real card — past
  // selection and the Begin/intro beat, deck loaded & non-empty, and not yet finished.
  // Selection / intro / loading / empty / results are NOT active (free to leave). Paused
  // is a sub-state of study, so it stays active. This is the invariant the forfeit binds to.
  const inStudy =
    (fromSession || pickerDone) &&
    !(intro && !fromSession && !reviewMode) &&
    !generating && deck.length > 0 && !!card && !done;
  useEffect(() => { guard.setActive(inStudy); }, [guard, inStudy]);

  // While a round is active, the persistent Atlas Rail and ⌘K palette (rendered by the shell
  // on top of the immersive deck) route through the leave confirm below instead of silently
  // dropping the round — the loophole this closes. The forfeit is still charged once via
  // guard.spend(), so it never double-charges with the pagehide/unmount beacon. Disarms when
  // the round ends or the screen unmounts.
  useEffect(() => {
    if (!inStudy) return;
    leaveGuard.arm((href) => setPendingHref(href));
    return () => leaveGuard.disarm();
  }, [inStudy]);

  // Backstop for exits that can't route through our confirms: pagehide covers a real unload
  // (refresh / tab-close, best-effort sendBeacon) and the effect cleanup covers browser Back
  // (SPA unmount). In-app nav (the rail / ⌘K palette) is now intercepted above and charges
  // through the leave confirm, so for those routes spend() is already spent by the time this
  // fires. guard.spend() dedupes every route against the Quit/Switch charge — once per round.
  useEffect(() => {
    const beacon = () => { if (guard.spend()) navigator.sendBeacon?.("/api/flashcards/forfeit"); };
    window.addEventListener("pagehide", beacon);
    return () => { window.removeEventListener("pagehide", beacon); beacon(); };
  }, [guard]);

  const onCheck = (correct: boolean, _selected: number[], _reasoning: string) => {
    if (checked || !card) return;
    setChecked(true);
    // Single normalisation point: the DB default (migration 010) and the generator's own
    // fallback are both "general", so a blank-tag card buckets the same way here as it
    // does in flashcard_attempts, instead of a "" bucket on the ResultsScreen vs. a
    // "general" row server-side.
    const tag = card.tag || "general";

    // Tally (skip double-counting on the free-text self-mark which calls onCheck once).
    const t = byTopicRef.current[tag] ?? { seen: 0, missed: 0 };
    t.seen += 1; if (!correct) t.missed += 1;
    byTopicRef.current[tag] = t;
    if (!correct) missedRef.current.push(card);

    // Combo: a correct card extends the streak and earns base × multiplier; the
    // bonus folds into xpRef so it flows to /complete as real XP. A miss resets it.
    const oldCombo = comboRef.current;
    const newCombo = correct ? oldCombo + 1 : 0;
    comboRef.current = newCombo; setCombo(newCombo);
    // ricoe B3: fire the loud popup when the streak crosses into a new multiplier tier
    // (×2 at 2, ×3 at 5), then keep rewarding every 2-in-a-row past the cap.
    if (correct) {
      const tierUp = comboMultiplier(newCombo) > comboMultiplier(oldCombo);
      const pastCap = newCombo >= 6 && newCombo % 2 === 0;
      if (tierUp || pastCap) setBurst({ key: Date.now(), combo: newCombo });
    }
    // Difficulty-scaled base × combo, banked as real XP (the same cardPoints the HUD shows).
    // Free-text tutor cards are self-graded → base only, no combo inflation.
    const xp = card.freeText
      ? (correct ? cardBase(card.difficulty) : XP_ATTEMPT)
      : cardPoints(card.difficulty, correct, newCombo);
    // Recorded here, BEFORE addXP: topic_tag is what makes the row survive /complete's
    // filter at all (a result with no topic is dropped, which is how flashcard_attempts
    // stayed at 0 rows in production), so the record must not be skippable by anything
    // downstream. addXP -> getUserProgress/saveUserProgress touch localStorage with no
    // try/catch (frontend/src/lib/legacy/gamification.ts:73-89) — a corrupt
    // eyebot_progress, blocked storage, or a quota error throws, and a throw there must
    // not cost us the attempt record.
    resultsRef.current.push({
      card_id: card.card_id, correct,
      repetitions: card.repetitions, easiness: card.easiness, interval_days: card.interval_days,
      topic_tag: tag, score: xp,
    });
    xpRef.current += xp; addXP(xp); incrementTotalCards();
    if (correct && comboMultiplier(newCombo) >= 3) {
      grantAchievements(user?.studentId ?? "", ["combo_godlike"]).forEach(enqueue);
    }
  };

  // Optional post-reveal reflection → background typed-reasoning grade. Fired from the
  // card's advance (instant reveal carries no reasoning), never awaited, never blocks.
  const onReason = (cardId: number, stem: string, text: string, model: string) => {
    reasonCheck.mutate(
      { question: stem, student_answer: text, correct_answer: model },
      {
        onSuccess: (d) => {
          reasonScoresRef.current.push(Math.max(0, Math.min(100, d.score)));
          reasonNotesRef.current[cardId] = d.feedback; force((x) => x + 1);
        },
        onError: () => { reasonNotesRef.current[cardId] = "Couldn't grade that one — keep going."; force((x) => x + 1); },
      },
    );
  };

  const advance = () => {
    setChecked(false);
    // Roll the HUD's pre-card baseline forward to the running total for the next card.
    setScoreShown(xpRef.current);
    if (idx < total - 1) { setIdx((i) => i + 1); return; }
    finish();
  };

  const finish = () => {
    setDone(true);
    // Deck-completion bonus scales with accuracy — a strong finish is rewarded, a poor one
    // isn't (finishing a deck is no longer a flat, unconditional payout).
    const total = resultsRef.current.length;
    const correctCount = resultsRef.current.filter((r) => r.correct).length;
    const bonus = sessionBonus(total > 0 ? correctCount / total : 0);
    const earned = xpRef.current + bonus;
    addXP(bonus);
    const allCorrect = total > 0 && correctCount === total;
    const isDrill = drill.length > 0;
    const ids = ["first_deck", ...(allCorrect && !isDrill ? ["perfect_deck"] : [])];
    grantAchievements(user?.studentId ?? "", ids).forEach(enqueue);
    complete({ results: resultsRef.current, xp_delta: earned });
  };

  const startDrill = () => {
    const missed = missedRef.current;
    if (missed.length === 0) return;
    // reset accumulators for the drill round (xpRef included — otherwise the drill's
    // /complete would re-send the original deck's XP on top of its own).
    resultsRef.current = []; byTopicRef.current = {}; reasonScoresRef.current = [];
    reasonNotesRef.current = {}; xpRef.current = 0; comboRef.current = 0; setCombo(0);
    setBurst(null);
    setScoreShown(0);
    const next = missed.slice(); missedRef.current = [];
    setDrill(next.map((c, i) => ({ ...c, id: i + 1 })));
    setIdx(0); setChecked(false); setDone(false);
    setDeckEpoch((e) => e + 1);
  };

  const newDeck = () => {
    // ricoe B4: "New deck" goes back to the topic-selection fan, not the dashboard.
    if (fromSession || reviewMode) {
      // These flows bypass the fan (seeded from a Tutor handoff / ?mode=review); clear
      // their origin and reload straight into a fresh topic fan.
      try { sessionStorage.removeItem("eyebot_session"); } catch { /* private mode */ }
      window.location.assign("/flashcards");
      return;
    }
    // Normal deck → reset the run + selection state in place → the topic fan shows again.
    resultsRef.current = []; byTopicRef.current = {}; reasonScoresRef.current = [];
    reasonNotesRef.current = {}; missedRef.current = [];
    xpRef.current = 0; comboRef.current = 0; setCombo(0); setBurst(null);
    setScoreShown(0);
    setDrill([]); setIdx(0); setChecked(false); setDone(false);
    setSetKey(null); setPickerDone(false); setIntro(false);
  };
  const exit = () => router.push("/homepage");
  // From the pre-deck intro, the top-left control steps BACK to the topic fan (not Home) —
  // the intro is a "which topic?" beat, so its natural back is the picker. No forfeit: the
  // intro isn't an active round. In-place reset of the selection state (nothing answered yet,
  // so no accumulators to clear).
  const backToTopics = () => { setSetKey(null); setPickerDone(false); setIntro(false); };
  // Controlled exits from an active round. sendBeacon (not fetch) so the forfeit survives an
  // immediate unload — Switch deck on a tutor/review deck hard-reloads the page, which would
  // abort an in-flight fetch. guard.spend() keeps it to a single charge even if an
  // uncontrolled handler also fires on the way out; then nudge [progress] so the balance
  // reflects the hit on the next screen.
  const chargeForfeit = () => {
    if (!guard.spend()) return;
    navigator.sendBeacon?.("/api/flashcards/forfeit");
    qc.invalidateQueries({ queryKey: ["progress"] });
  };
  const quitForfeit = () => { chargeForfeit(); router.push("/homepage"); };
  const switchDeck = () => { chargeForfeit(); setPaused(false); newDeck(); };
  // An intercepted rail / ⌘K jump: same forfeit as Quit, then continue to where they aimed.
  const confirmNavLeave = () => {
    const href = pendingHref;
    chargeForfeit();
    setPendingHref(null);
    if (href) router.push(href);
  };

  // ── Selection ──
  if (!fromSession && !pickerDone) {
    return (
      <FlashShell onExit={exit}>
        <SessionSetup
          topicSets={topicSets}
          onStart={(key) => { setSetKey(key); setPickerDone(true); setIntro(true); }}
        />
      </FlashShell>
    );
  }

  // ricoe B5 — the pre-deck intro. Only for fan picks (not tutor-handoff / review),
  // and only until Begin. The deck loads in the background while it shows.
  if (intro && !fromSession && !reviewMode) {
    const introKey = setKey ?? "__mixed";
    const introLabel = setKey ? labelForTag(setKey) : "Mixed";
    return (
      <FlashShell onExit={backToTopics} exitLabel="Topics" topicHue={topicHue(introKey)} engraved>
        <TopicIntro label={introLabel} topicKey={introKey}
          count={baseCards.length} onBegin={() => setIntro(false)} />
      </FlashShell>
    );
  }

  if (generating || deck.length === 0 || !card) {
    return (
      <FlashShell onExit={exit} topicHue={stageHue} engraved>
        <div className="flash-stage flash-stage-msg">
          {generating
            ? <div className="flash-load"><span className="flash-spinner" role="status" aria-label="Loading" /></div>
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
      <FlashShell onExit={exit} topicHue={stageHue} engraved>
        <ResultsScreen result={result} onDrillMissed={startDrill} onNewDeck={newDeck} onDone={exit} />
      </FlashShell>
    );
  }

  const advanceLabel = idx < total - 1 ? "Next →" : "Finish →";

  return (
    <FlashShell onExit={exit} onPause={() => setPaused(true)} topicHue={stageHue} engraved>
      <StudyStage
        key={deckEpoch}
        card={card} idx={idx} total={total} topicLabel={labelForTag(card.tag)}
        reasonNote={reasonNotesRef.current[card.id] ?? null} combo={combo}
        score={scoreShown}
        onCheck={onCheck} onReason={onReason} onAdvance={advance} advanceLabel={advanceLabel}
        paused={paused}
      />
      {burst && <ComboBurst key={burst.key} combo={burst.combo} onDone={() => setBurst(null)} />}
      <PauseMenu open={paused} onResume={() => setPaused(false)} onSwitch={switchDeck} onQuit={quitForfeit} />
      {/* Leaving via the rail / ⌘K mid-round forfeits like Quit — same confirm, then it
          continues to where the student aimed. Reuses the pause overlay's arcade styling. */}
      {pendingHref && (
        <div className="flash-pausewrap" role="dialog" aria-modal="true" aria-label="Leave the round?"
          data-testid="flash-leave-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setPendingHref(null); }}>
          <div className="flash-pausecard">
            <p className="flash-pause-h">Leave the round?</p>
            <p className="flash-pause-sub">
              You&rsquo;ll forfeit this round and lose {FORFEIT_LUMENS} Lumens from your stash. No take-backs.
            </p>
            <button type="button" className="flash-pausebtn is-quit flash-press"
              data-testid="flash-leave-confirm" onClick={confirmNavLeave}>Leave &amp; take the hit</button>
            <button type="button" className="flash-pausebtn is-go flash-press" autoFocus
              data-testid="flash-leave-cancel" onClick={() => setPendingHref(null)}>Keep playing</button>
          </div>
        </div>
      )}
    </FlashShell>
  );
}
