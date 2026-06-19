"use client";
/* SessionSetup — the two-step flashcards selection shell. Owns the step (1|2),
   slide direction, topic pick, and "show all" state; renders a 2-segment progress
   rail, the PERSISTENT slit-lamp hero (one node that morphs from centerpiece to
   badge across steps — it lives here so it never unmounts), and the keyed step
   content (StepSession → StepTopic) that slides/cross-fades. Mixed is selected by
   default so Start always works. Picking a topic cross-fades the whole setup to that
   topic's hue. */
import { useState } from "react";
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { PlateWell } from "@/aurora/components/PlateWell";
import { PLATE } from "@/aurora/media";
import { type Difficulty, topicHue } from "./types";
import { StepSession } from "./StepSession";
import { StepTopic } from "./StepTopic";

interface Props {
  topicSets: FlashcardSetInfo[] | undefined;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  sessionLength: number;
  setSessionLength: (n: number) => void;
  onStart: (setKey: string | null) => void;
}

/** Persistent slit-lamp porthole. Rendered once by the shell; its size morphs across
 *  steps via [data-step] on the setup root (see aurora.css), the auto-drift running
 *  underneath. data-testid lets the harness prove it persists across the step change. */
function HeroPlate() {
  return (
    <div className="flash-hero-stage" data-testid="flash-hero">
      <div className="flash-hero-wrap">
        <PlateWell
          src={PLATE.flashcards}
          alt="Slit-lamp optical section through the cornea, anterior chamber and crystalline lens"
          ratio={1}
          className="flash-hero"
        />
      </div>
      <p className="flash-hero-cap">Slit-lamp optical section</p>
    </div>
  );
}

export function SessionSetup({
  topicSets, difficulty, setDifficulty, sessionLength, setSessionLength, onStart,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [direction, setDirection] = useState<"fwd" | "back">("fwd");
  const [selected, setSelected] = useState<string | null>(null); // null = Mixed
  const [showAll, setShowAll] = useState(false);

  const sets = (topicSets ?? []).filter((s) => s.difficulty === difficulty);
  const pickDifficulty = (d: Difficulty) => { setDifficulty(d); setSelected(null); setShowAll(false); };
  const goTopic = () => { setDirection("fwd"); setStep(2); };
  const goBack = () => { setDirection("back"); setStep(1); };

  // The whole setup adopts the selected topic's hue (Mixed → brand blue 212).
  const selectedSet = sets.find((s) => s.set_key === selected);
  const setupHue = selectedSet ? topicHue(selectedSet.topic_key) : 212;

  return (
    <div className="flash-setup" data-testid="flash-setup" data-step={step}
      style={{ "--flash-topic-hue": setupHue } as React.CSSProperties}>
      <div className="flash-rail" data-testid="flash-rail" role="progressbar"
        aria-valuemin={1} aria-valuemax={2} aria-valuenow={step} aria-label="Setup progress">
        <span className={`flash-rail-seg${step === 1 ? " is-active" : ""}${step > 1 ? " is-done" : ""}`} />
        <span className={`flash-rail-seg${step === 2 ? " is-active" : ""}`} />
      </div>

      <div className="flash-setup-stage">
        <HeroPlate />
        <div className={`flash-step flash-step-${direction}`} key={step}>
          {step === 1 ? (
            <StepSession
              difficulty={difficulty}
              pickDifficulty={pickDifficulty}
              sessionLength={sessionLength}
              setSessionLength={setSessionLength}
              onContinue={goTopic}
            />
          ) : (
            <StepTopic
              sets={sets}
              selected={selected}
              setSelected={setSelected}
              showAll={showAll}
              setShowAll={setShowAll}
              onBack={goBack}
              onStart={() => onStart(selected)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
