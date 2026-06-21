"use client";
/* StepSession — step 1 of the flashcards setup: the calm "how" screen. The pace is
   chosen on two rows of tactile choice cards (difficulty + length), each with a glyph,
   a descriptor and a live accent, and a running session summary that updates as you
   pick. No hero (the shared hero lives in the shell and morphs across steps). */
import { type Difficulty, LENGTHS } from "./types";

/** Difficulty options + the descriptor and equalizer level shown on each card. */
const DIFFS: { key: Difficulty; name: string; sub: string; level: 1 | 2 }[] = [
  { key: "easy", name: "Easy", sub: "Recall the essentials", level: 1 },
  { key: "medium", name: "Medium", sub: "Apply & reason", level: 2 },
];

/** Per-length flavour copy keyed by card count. */
const LENGTH_SUB: Record<number, string> = {
  5: "A quick warm-up",
  10: "A balanced set",
  20: "A deep run",
};

/** Rough minutes for the live summary — pace stretches the per-card time a little. */
function estMinutes(cards: number, difficulty: Difficulty): number {
  const perCard = difficulty === "medium" ? 0.8 : 0.55;
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
    <div className="flash-step-body flash-step-session">
      <div className="flash-step-lede">
        <h2 className="flash-setup-title">Flashcards</h2>
        <p className="flash-setup-help">Active recall, one card at a time. First, set the pace.</p>
      </div>

      <div className="flash-choices">
        <div className="flash-axis">
          <span className="flash-axis-label">Difficulty</span>
          <div className="flash-opts flash-opts-2" role="radiogroup" aria-label="Difficulty">
            {DIFFS.map((d) => (
              <button key={d.key} type="button" role="radio" aria-checked={difficulty === d.key}
                className="flash-opt flash-press" onClick={() => pickDifficulty(d.key)}>
                <span className="flash-opt-glyph" aria-hidden="true">
                  <span className="flash-meter" data-level={d.level}><i /><i /><i /></span>
                </span>
                <span className="flash-opt-name">{d.name}</span>
                <span className="flash-opt-sub">{d.sub}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flash-axis">
          <span className="flash-axis-label">Length</span>
          <div className="flash-opts flash-opts-3" role="radiogroup" aria-label="Session length">
            {LENGTHS.map((l, i) => (
              <button key={l.n} type="button" role="radio" aria-checked={sessionLength === l.n}
                className="flash-opt flash-press" onClick={() => setSessionLength(l.n)}>
                <span className="flash-opt-glyph" aria-hidden="true">
                  <span className="flash-stack" data-fill={i + 1}><i /><i /><i /></span>
                </span>
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
        <button type="button" className="flash-start flash-press" data-testid="flash-continue"
          onClick={onContinue}>Continue →</button>
      </div>
    </div>
  );
}
