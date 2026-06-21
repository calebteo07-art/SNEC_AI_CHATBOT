"use client";
/* SessionSetup — the two-step flashcards selection shell. Owns the step (1|2),
   slide direction, topic pick, and "show all" state; renders a 2-segment progress
   rail, the PERSISTENT slit-lamp hero (one node that morphs from centerpiece to
   badge across steps — it lives here so it never unmounts), and the keyed step
   content (StepSession → StepTopic) that slides/cross-fades. Mixed is selected by
   default so Start always works. Picking a topic cross-fades the whole setup to that
   topic's hue. */
import { useEffect, useRef, useState } from "react";
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
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

/** Persistent hero. Rendered once by the shell so it never unmounts; it scales from a
 *  large centred disc (step 1) to a small badge (step 2) via [data-step] on the setup root
 *  (see aurora.css). Renders the login macro-eye (/brand/login-eye.png) EXACTLY as the login
 *  screen does — full round disc, object-fit:contain, no frame — just centred on the cream
 *  and dropped a little lower than dead-centre. Decorative (aria-hidden), like the login eye.
 *  data-testid proves it persists across the morph.
 *
 *  The iris tracks the cursor with HIGH SENSITIVITY: a window pointermove feeds a cheap RAF
 *  loop that smooths the raw pointer with a snappy follow and publishes --hx/--hy (gaze, in
 *  [-1,1]) + --hact (lean-in on movement) onto .flash-scene. CSS turns those into the
 *  translate + 3D tilt (see aurora.css). Before the first move the eye wanders gently so it
 *  never sits dead; honours reduced motion (then it stays still, transform = identity). */
function HeroPlate() {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const reduced =
      document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const st = { tx: 0, ty: 0, x: 0, y: 0, act: 0, has: false };
    const onMove = (e: PointerEvent) => {
      st.tx = (e.clientX / window.innerWidth) * 2 - 1;
      st.ty = (e.clientY / window.innerHeight) * 2 - 1;
      st.has = true;
      st.act = 1; // lean in while the cursor is moving
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.064);
      last = now;
      const t = now / 1000;
      // Idle wander until the cursor first moves, then track it.
      const tx = st.has ? st.tx : Math.sin(t * 0.5) * 0.5;
      const ty = st.has ? st.ty : Math.cos(t * 0.4) * 0.4;
      const follow = 1 - Math.exp(-dt * 12); // high sensitivity: snappy, near-immediate
      st.x += (tx - st.x) * follow;
      st.y += (ty - st.y) * follow;
      st.act *= Math.exp(-dt * 2.4); // relax the lean when the cursor stops
      el.style.setProperty("--hx", st.x.toFixed(4));
      el.style.setProperty("--hy", st.y.toFixed(4));
      el.style.setProperty("--hact", st.act.toFixed(4));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="flash-hero-stage" data-testid="flash-hero">
      <div className="flash-scene" ref={sceneRef} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="flash-scene-img" src="/brand/login-eye.png" alt="" draggable={false} />
      </div>
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
