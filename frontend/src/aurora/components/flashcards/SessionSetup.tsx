"use client";
/* SessionSetup — the two-step flashcards intake shell. Owns the step (1|2), topic pick
   and "show all" state; renders a 2-segment progress rail, the PERSISTENT instrument
   hero (one CSS node that morphs from a large iris disc on step 1 to a small badge on
   step 2 — it lives here so it never unmounts), and the keyed step content
   (StepSession → StepTopic). Mixed is selected by default so Start always works. Picking
   a topic floods the whole setup with that topic's hue via --flash-topic-hue. */
import { useEffect, useRef, useState } from "react";
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { type Difficulty, galleryHue } from "./types";
import { StepSession } from "./StepSession";
import { StepTopic } from "./StepTopic";

interface Props {
  topicSets: FlashcardSetInfo[] | undefined;
  difficulty: Difficulty; setDifficulty: (d: Difficulty) => void;
  sessionLength: number; setSessionLength: (n: number) => void;
  onStart: (setKey: string | null) => void;
}

/** Persistent instrument hero — a single CSS iris under a slow aperture ring. Rendered
 *  once by the shell so it never unmounts; CSS sizes it by [data-step] on the setup root.
 *  Decorative (aria-hidden); data-testid proves it persists across the morph. */
function Hero() {
  return (
    <div className="flash-hero" data-testid="flash-hero" aria-hidden="true">
      <span className="flash-hero-ring" /><span className="flash-hero-iris" />
    </div>
  );
}

export function SessionSetup({
  topicSets, difficulty, setDifficulty, sessionLength, setSessionLength, onStart,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<string | null>(null); // null = Mixed
  const [showAll, setShowAll] = useState(false);
  const setupRef = useRef<HTMLDivElement>(null);

  const sets = (topicSets ?? []).filter((s) => s.difficulty === difficulty);
  const pickDifficulty = (d: Difficulty) => { setDifficulty(d); setSelected(null); setShowAll(false); };

  // The whole setup adopts the selected tile's vivid hue (Mixed → brand blue 212). Index
  // matches the tile's gallery position so the accent equals the picked card.
  const selectedIndex = sets.findIndex((s) => s.set_key === selected);
  const setupHue = selectedIndex >= 0 ? galleryHue(selectedIndex) : 212;

  // Publish the live hue up to .flash-root so the whole field re-tints on every pick.
  useEffect(() => {
    setupRef.current?.closest<HTMLElement>(".flash-root")?.style.setProperty("--flash-topic-hue", String(setupHue));
  }, [setupHue]);

  return (
    <div className="flash-setup" data-testid="flash-setup" data-step={step} ref={setupRef}
      style={{ "--flash-topic-hue": setupHue } as React.CSSProperties}>
      <div className="flash-rail" data-testid="flash-rail" role="progressbar"
        aria-valuemin={1} aria-valuemax={2} aria-valuenow={step} aria-label="Setup progress">
        <span className={`flash-rail-seg${step === 1 ? " is-active" : ""}${step > 1 ? " is-done" : ""}`} />
        <span className={`flash-rail-seg${step === 2 ? " is-active" : ""}`} />
      </div>

      <div className="flash-setup-stage">
        <Hero />
        <div className="flash-step" key={step}>
          {step === 1 ? (
            <StepSession difficulty={difficulty} pickDifficulty={pickDifficulty}
              sessionLength={sessionLength} setSessionLength={setSessionLength}
              onContinue={() => setStep(2)} />
          ) : (
            <StepTopic sets={sets} selected={selected} setSelected={setSelected}
              showAll={showAll} setShowAll={setShowAll}
              onBack={() => setStep(1)} onStart={() => onStart(selected)} />
          )}
        </div>
      </div>
    </div>
  );
}
