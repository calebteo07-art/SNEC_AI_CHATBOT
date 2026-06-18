"use client";
/* "Set the lens" — one criterion per step (Clarity -> Depth -> Lens) over a calm
   dark field, with a glass prism dispersing light in the centre. The final topic
   choice fires the spectral light-flood, then hands control to the deck. */
import { useRef, useState } from "react";
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { type Difficulty, LENGTHS } from "./types";
import { PrismStage, type PrismStageHandle } from "./PrismStage";

interface Props {
  topicSets: FlashcardSetInfo[] | undefined;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  sessionLength: number;
  setSessionLength: (n: number) => void;
  onChoose: (setKey: string | null) => void;   // commit topic -> orchestrator loads + shows deck
}

export function ApertureSelect({
  topicSets, difficulty, setDifficulty, sessionLength, setSessionLength, onChoose,
}: Props) {
  const [step, setStep] = useState(0);          // 0 Clarity · 1 Depth · 2 Lens
  const sets = (topicSets ?? []).filter((s) => s.difficulty === difficulty);
  const stageRef = useRef<PrismStageHandle>(null);

  // Commit a topic: play the prism's spectral light-flood, then notify the
  // orchestrator. launch() resolves immediately under reduced motion, so safe there.
  const commit = (setKey: string | null) => {
    const stage = stageRef.current;
    if (stage) stage.launch().then(() => onChoose(setKey));
    else onChoose(setKey);
  };

  return (
    <div className="aperture-step">
      {/* The glass prism, dispersing light, as a centered backdrop. */}
      <PrismStage ref={stageRef} />
      <div className="aperture-step-head">
        <p className="aperture-eyebrow">Set the aperture · {step + 1} of 3</p>
        <h2 className="aperture-title">
          {step === 0 ? "Clarity" : step === 1 ? "Depth" : "Lens"}
        </h2>
        <p className="aperture-help">
          {step === 0 ? "How sharp do you want it? Pick a difficulty."
            : step === 1 ? "How deep should we go? Choose a session length."
            : "Which lens do you look through? Pick a topic — Mixed draws from all."}
        </p>
      </div>

      <div className="aperture-step-body">
        {step === 0 && (
          <div key="clarity" className="aperture-choices aperture-step-slide" role="radiogroup" aria-label="Difficulty">
            {(["easy", "medium"] as Difficulty[]).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={difficulty === d}
                className="aperture-choice aperture-press" onClick={() => setDifficulty(d)}>
                <span className="aperture-choice-k">{d === "easy" ? "Easy" : "Medium"}</span>
                <span className="aperture-choice-v">{d === "easy" ? "Warm up the basics" : "Push a little harder"}</span>
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div key="depth" className="aperture-choices aperture-step-slide" role="radiogroup" aria-label="Session length">
            {LENGTHS.map((l) => (
              <button key={l.n} type="button" role="radio" aria-checked={sessionLength === l.n}
                className="aperture-choice aperture-press" onClick={() => setSessionLength(l.n)}>
                <span className="aperture-choice-k">{l.label}</span>
                <span className="aperture-choice-v">{l.n} cards</span>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div key="lens" className="aperture-choices aperture-step-slide" role="group" aria-label="Topics">
            <button type="button" data-testid="aperture-open" className="aperture-choice aperture-press"
              onClick={() => commit(null)}>
              <span className="aperture-choice-k">Mixed</span>
              <span className="aperture-choice-v">All topics, no repeats</span>
            </button>
            {sets.map((s) => (
              <button key={s.set_key} type="button" disabled={s.total === 0}
                className="aperture-choice aperture-press" onClick={() => commit(s.set_key)}>
                <span className="aperture-choice-k">{s.label}</span>
                <span className="aperture-choice-v">{s.completed}/{s.total} seen</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="aperture-nav">
        <button type="button" className="aperture-back aperture-press"
          onClick={() => (step === 0 ? undefined : setStep((s) => s - 1))}
          style={{ visibility: step === 0 ? "hidden" : "visible" }}>← Back</button>
        <div className="aperture-blades" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`aperture-blade${i < step ? " is-done" : i === step ? " is-active" : ""}`} />
          ))}
        </div>
        {step < 2
          ? <button type="button" className="aperture-next aperture-press" onClick={() => setStep((s) => s + 1)}>Next →</button>
          : <span style={{ width: 88 }} aria-hidden />}
      </div>
    </div>
  );
}
