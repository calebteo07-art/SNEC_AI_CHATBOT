"use client";
/* StepSession — step 1 of the flashcards intake: the calm "how" screen. Difficulty and
   length are chosen on two rows of instrument keys (role=radio), with a live session
   summary that updates as you pick. No hero (the shared hero lives in the shell and
   morphs across steps). */
import { type Difficulty, LENGTHS } from "./types";

/** Difficulty options + the descriptor shown on each key. */
const DIFFS: { key: Difficulty; name: string; sub: string }[] = [
  { key: "easy", name: "Easy", sub: "Recall the essentials" },
  { key: "medium", name: "Medium", sub: "Apply & reason" },
  { key: "hard", name: "Hard", sub: "Clinical judgement" },
];

/** Per-length flavour copy keyed by card count. */
const LENGTH_SUB: Record<number, string> = {
  5: "A quick warm-up",
  10: "A balanced set",
  20: "A deep run",
};

/** Rough minutes for the live summary — pace stretches the per-card time a little. */
function estMinutes(cards: number, difficulty: Difficulty): number {
  const perCard = difficulty === "hard" ? 0.9 : difficulty === "medium" ? 0.8 : 0.55;
  return Math.max(2, Math.round(cards * perCard));
}

interface Props {
  difficulty: Difficulty;
  pickDifficulty: (d: Difficulty) => void;
  sessionLength: number;
  setSessionLength: (n: number) => void;
  onContinue: () => void;
}

export function StepSession({
  difficulty, pickDifficulty, sessionLength, setSessionLength, onContinue,
}: Props) {
  const diffName = DIFFS.find((d) => d.key === difficulty)?.name ?? "Easy";
  const minutes = estMinutes(sessionLength, difficulty);

  return (
    <div className="flash-step-body">
      <div className="flash-step-lede">
        <h2 className="flash-setup-title">Flashcards</h2>
      </div>

      <div className="flash-choices">
        <div className="flash-axis">
          <span className="flash-axis-label">Difficulty</span>
          <div className="flash-opts" role="radiogroup" aria-label="Difficulty">
            {DIFFS.map((d) => (
              <button key={d.key} type="button" role="radio" aria-checked={difficulty === d.key}
                className="flash-opt flash-press" onClick={() => pickDifficulty(d.key)}>
                <span className="flash-opt-name">{d.name}</span>
                <span className="flash-opt-sub">{d.sub}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flash-axis">
          <span className="flash-axis-label">Length</span>
          <div className="flash-opts" role="radiogroup" aria-label="Session length">
            {LENGTHS.map((l) => (
              <button key={l.n} type="button" role="radio" aria-checked={sessionLength === l.n}
                className="flash-opt flash-press" onClick={() => setSessionLength(l.n)}>
                <span className="flash-opt-name">{l.label}</span>
                <span className="flash-opt-sub">{l.n} cards · {LENGTH_SUB[l.n]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="flash-summary" aria-live="polite">
        <span className="flash-summary-strong">{diffName}</span> pace
        <span className="flash-summary-dot" aria-hidden="true" />
        <span className="flash-summary-strong">{sessionLength} cards</span>
        <span className="flash-summary-dot" aria-hidden="true" />
        about <span className="flash-summary-strong">{minutes} min</span>
      </p>

      <div className="flash-step-foot">
        <button type="button" className="flash-continue flash-start flash-press" data-testid="flash-continue"
          onClick={onContinue}>Continue →</button>
      </div>
    </div>
  );
}
