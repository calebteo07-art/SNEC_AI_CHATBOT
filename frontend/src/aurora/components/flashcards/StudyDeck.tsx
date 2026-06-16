"use client";
/* "In Focus" — the study activity. Centered FocusCard over the deep field, a calm
   coach line and a slim readout above it. No imagery, no queue. */
import { useEffect } from "react";
import { type Flashcard, type AiFeedback } from "./types";
import { FocusCard } from "./FocusCard";
import { FocusCoach } from "./FocusCoach";
import { SessionReadout } from "./SessionReadout";

interface Props {
  card: Flashcard;
  idx: number;
  total: number;
  isRetry: boolean;
  deckTitle: string;
  submitted: boolean;
  aiChecking: boolean;
  aiFeedback: AiFeedback | null;
  cardXp: number;
  sessionXp: number;
  gradedCount: number;
  avgScore: number | null;
  userAttempt: string;
  setUserAttempt: (v: string) => void;
  onSubmit: () => void;
  onAdvance: () => void;
  onExplain: () => void;
  weakPending: boolean;
}

export function StudyDeck(p: Props) {
  // Keyboard-first: once graded, Enter / -> advances.
  useEffect(() => {
    if (!p.submitted || p.aiChecking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); p.onAdvance(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.submitted, p.aiChecking, p.onAdvance]);

  const remaining = Math.max(0, p.total - p.idx - 1);
  const coach = (() => {
    if (!p.submitted) return p.isRetry
      ? "↻ Round two on this one — you've got it now."
      : "Reach for it — even a rough answer wires it in.";
    if (p.aiChecking) return "Bringing your answer into focus…";
    const s = p.aiFeedback?.score ?? 60;
    if (s >= 85) return `Crystal clear — +${p.cardXp} XP.`;
    if (s >= 60) return `Sharp — +${p.cardXp} XP. ${remaining} to go.`;
    if (s >= 40) return `Coming into focus — +${p.cardXp} XP.`;
    return `+${p.cardXp} XP for the reach — we'll refocus this one.`;
  })();

  const advanceLabel = p.idx < p.total - 1 ? "Next card →" : (p.weakPending ? "Refocus weak cards →" : "Finish session →");

  return (
    <div className="aperture-deck" data-testid="study-deck">
      <div className="aperture-deck-top"><FocusCoach message={coach} /></div>
      <FocusCard
        card={p.card}
        flipKey={`${p.idx}-${p.isRetry ? "r" : "n"}`}
        isRetry={p.isRetry}
        deckTitle={p.deckTitle}
        submitted={p.submitted}
        aiChecking={p.aiChecking}
        aiFeedback={p.aiFeedback}
        cardXp={p.cardXp}
        userAttempt={p.userAttempt}
        setUserAttempt={p.setUserAttempt}
        onSubmit={p.onSubmit}
        onAdvance={p.onAdvance}
        onExplain={p.onExplain}
        advanceLabel={advanceLabel}
      />
      <SessionReadout idx={p.idx} total={p.total} graded={p.gradedCount} avgScore={p.avgScore} sessionXp={p.sessionXp} />
    </div>
  );
}
