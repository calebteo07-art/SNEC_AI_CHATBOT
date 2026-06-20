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

/** The four staff sprites, each with its own out-of-phase idle motion (duration / delay /
 *  lean) so the group feels alive without any two bobbing in sync. Order matches media.ts:
 *  Chinese man, Malay woman (tudung), Indian woman, White man. */
const CAST = [
  { src: PLATE.cast[0], dur: "3.8s", delay: "0s", lean: ".8deg" },
  { src: PLATE.cast[1], dur: "4.6s", delay: ".6s", lean: "-.7deg" },
  { src: PLATE.cast[2], dur: "4.1s", delay: "1.1s", lean: ".9deg" },
  { src: PLATE.cast[3], dur: "4.9s", delay: ".3s", lean: "-1deg" },
] as const;

/** Persistent hero CAST. Rendered once by the shell so it never unmounts; the band scales
 *  from a centred centerpiece (step 1) to a slim strip (step 2) via [data-step] on the
 *  setup root (see aurora.css). Sprites are transparent PNGs on the cream — they blend by
 *  construction; CSS adds the soft contact shadow and the idle motion. The group carries
 *  one aria-label; individual sprites are decorative. data-testid proves it persists. */
function HeroPlate() {
  return (
    <div className="flash-hero-stage" data-testid="flash-hero">
      <div className="flash-cast" role="img"
        aria-label="Four SNEC eye-care staff in SingHealth blue scrubs with orange trim">
        {CAST.map((c) => (
          <span key={c.src} className="flash-cast-figure"
            style={{ "--cast-dur": c.dur, "--cast-delay": c.delay, "--cast-lean": c.lean } as React.CSSProperties}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="flash-cast-sprite" src={c.src} alt="" draggable={false} />
          </span>
        ))}
      </div>
      <p className="flash-hero-cap">Your SNEC eye-care team</p>
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
