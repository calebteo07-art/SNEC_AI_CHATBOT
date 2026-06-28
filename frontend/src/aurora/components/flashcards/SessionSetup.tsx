"use client";
/* SessionSetup — the two-step flashcards intake shell. Owns the step (1|2) and
   renders a 2-segment progress rail plus the keyed step content (StepSession →
   StepTopic). The chrome stays medical-blue; step 2 is a click-to-start topic
   fan, so there is no persistent selection state here. */
import { useState } from "react";
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { type Difficulty } from "./types";
import { StepSession } from "./StepSession";
import { StepTopic } from "./StepTopic";

interface Props {
  topicSets: FlashcardSetInfo[] | undefined;
  difficulty: Difficulty; setDifficulty: (d: Difficulty) => void;
  sessionLength: number; setSessionLength: (n: number) => void;
  onStart: (setKey: string | null) => void;
}

export function SessionSetup({
  topicSets, difficulty, setDifficulty, sessionLength, setSessionLength, onStart,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const sets = (topicSets ?? []).filter((s) => s.difficulty === difficulty);

  return (
    <div className="flash-setup" data-testid="flash-setup" data-step={step}
      style={{ "--flash-topic-hue": 212 } as React.CSSProperties}>
      <div className="flash-rail" data-testid="flash-rail" role="progressbar"
        aria-valuemin={1} aria-valuemax={2} aria-valuenow={step} aria-label="Setup progress">
        <span className={`flash-rail-seg${step === 1 ? " is-active" : ""}${step > 1 ? " is-done" : ""}`} />
        <span className={`flash-rail-seg${step === 2 ? " is-active" : ""}`} />
      </div>

      <div className="flash-setup-stage">
        <div className="flash-step" key={step}>
          {step === 1 ? (
            <StepSession difficulty={difficulty} pickDifficulty={setDifficulty}
              sessionLength={sessionLength} setSessionLength={setSessionLength}
              onContinue={() => setStep(2)} />
          ) : (
            <StepTopic sets={sets} onBack={() => setStep(1)} onStart={onStart} />
          )}
        </div>
      </div>
    </div>
  );
}
