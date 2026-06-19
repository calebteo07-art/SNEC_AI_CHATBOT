"use client";
/* StepSession — step 1 of the flashcards setup: the calm "how" screen. Difficulty
   and length pill groups + Continue. No hero (the shared hero lives in the shell and
   morphs across steps). */
import { type Difficulty, LENGTHS } from "./types";

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
  return (
    <div className="flash-step-body flash-step-session">
      <div className="flash-step-lede">
        <h2 className="flash-setup-title">Flashcards</h2>
        <p className="flash-setup-help">Active recall, one card at a time. First, set the pace.</p>
      </div>

      <div className="flash-setup-controls">
        <div className="flash-control">
          <span className="flash-control-label">Difficulty</span>
          <div className="flash-pills" role="radiogroup" aria-label="Difficulty">
            {(["easy", "medium"] as Difficulty[]).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={difficulty === d}
                className="flash-pill flash-press" onClick={() => pickDifficulty(d)}>
                {d === "easy" ? "Easy" : "Medium"}
              </button>
            ))}
          </div>
        </div>
        <div className="flash-control">
          <span className="flash-control-label">Length</span>
          <div className="flash-pills" role="radiogroup" aria-label="Session length">
            {LENGTHS.map((l) => (
              <button key={l.n} type="button" role="radio" aria-checked={sessionLength === l.n}
                className="flash-pill flash-press" onClick={() => setSessionLength(l.n)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flash-step-foot">
        <button type="button" className="flash-start flash-press" data-testid="flash-continue"
          onClick={onContinue}>Continue →</button>
      </div>
    </div>
  );
}
