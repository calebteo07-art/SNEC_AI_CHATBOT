"use client";
/* "Set the Aperture" — one criterion per step (Clarity -> Depth -> Lens) over the
   deep Twilight field, frosted controls, the iris reacting in the centre. The final
   topic choice fires the dilation launch, then hands control to the deck. */
import { useEffect, useRef, useState } from "react";
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { type Difficulty, LENGTHS } from "./types";
import { ApertureStage } from "./ApertureStage";

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
  const [launching, setLaunching] = useState(false);
  const sets = (topicSets ?? []).filter((s) => s.difficulty === difficulty);

  // The dilation timer is held so it can be cleared if we unmount mid-launch.
  const launchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (launchTimer.current) clearTimeout(launchTimer.current); }, []);

  // Commit a topic: play the dilation, then notify the orchestrator.
  const commit = (setKey: string | null) => {
    const reduce = typeof document !== "undefined" &&
      (document.documentElement.dataset.motion === "reduce" ||
       window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (reduce) { onChoose(setKey); return; }
    setLaunching(true);
    launchTimer.current = setTimeout(() => onChoose(setKey), 820);
  };

  return (
    <div className="aperture-step">
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
        <ApertureStage size={200} launching={launching} />

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
            <button type="button" data-testid="aperture-open" className="aperture-choice aperture-press aperture-topic-card"
              onClick={() => commit(null)}>
              <span><span className="aperture-choice-k">Mixed</span>
                <span className="aperture-choice-v">All topics, no repeats</span></span>
            </button>
            {sets.map((s) => {
              const pct = s.total ? Math.round((s.completed / s.total) * 100) : 0;
              return (
                <button key={s.set_key} type="button" disabled={s.total === 0}
                  className="aperture-choice aperture-press aperture-topic-card" onClick={() => commit(s.set_key)}>
                  <span><span className="aperture-choice-k">{s.label}</span>
                    <span className="aperture-choice-v">{s.completed}/{s.total} seen</span></span>
                  <span className="aperture-choice-ring" style={{ ["--p" as string]: pct }} aria-hidden>
                    <span>{pct}%</span>
                  </span>
                </button>
              );
            })}
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
