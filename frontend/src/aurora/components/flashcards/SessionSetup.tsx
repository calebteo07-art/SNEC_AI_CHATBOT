"use client";
/* SessionSetup — one calm light screen: a round slit-lamp hero that tilts toward the
   cursor, difficulty + length pills, and a colour-led topic gallery (each tile a white
   card carrying its own topic tint — no icons). Mixed is selected by default (so Start
   always works, even when topics are empty); picking a topic cross-fades the whole
   setup to that topic's hue. Only a handful of topics show until "Show all topics" is
   opened. Start commits the set_key (or null for Mixed) to the orchestrator. */
import { useEffect, useRef, useState } from "react";
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { PlateWell } from "@/aurora/components/PlateWell";
import { PLATE } from "@/aurora/media";
import { type Difficulty, LENGTHS, topicHue } from "./types";

interface Props {
  topicSets: FlashcardSetInfo[] | undefined;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  sessionLength: number;
  setSessionLength: (n: number) => void;
  onStart: (setKey: string | null) => void;
}

const PREVIEW = 5;

/** Round slit-lamp porthole that tilts toward the cursor. Pointer position is written
 *  to --hx/--hy on the wrapper (rAF-batched); the frame rotates and the image
 *  parallax-shifts via CSS. Reduced motion neutralises the transforms (see aurora.css). */
function HeroPlate() {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty("--hx", x.toFixed(3));
      el.style.setProperty("--hy", y.toFixed(3));
    });
  };
  const reset = () => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    el.style.setProperty("--hx", "0");
    el.style.setProperty("--hy", "0");
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <div className="flash-hero-stage">
      <div ref={ref} className="flash-hero-wrap" onPointerMove={onMove} onPointerLeave={reset}>
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
  const [selected, setSelected] = useState<string | null>(null); // null = Mixed
  const [showAll, setShowAll] = useState(false);
  const sets = (topicSets ?? []).filter((s) => s.difficulty === difficulty);
  const pickDifficulty = (d: Difficulty) => { setDifficulty(d); setSelected(null); };

  const visible = showAll ? sets : sets.slice(0, PREVIEW);
  const hiddenCount = sets.length - visible.length;

  // The whole setup adopts the selected topic's hue (Mixed → brand blue default 212).
  const selectedSet = sets.find((s) => s.set_key === selected);
  const setupHue = selectedSet ? topicHue(selectedSet.topic_key) : 212;

  return (
    <div className="flash-setup" data-testid="flash-setup"
      style={{ "--flash-topic-hue": setupHue } as React.CSSProperties}>
      <header className="flash-setup-head">
        <HeroPlate />
        <h2 className="flash-setup-title">Flashcards</h2>
        <p className="flash-setup-help">Active recall, one card at a time — pick a topic colour or go Mixed.</p>
      </header>

      <section className="flash-setup-controls">
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
      </section>

      <section className="flash-topics" aria-label="Topics">
        <button type="button"
          className={`flash-topic is-mixed flash-press${selected === null ? " is-selected" : ""}`}
          aria-pressed={selected === null} onClick={() => setSelected(null)}>
          <span className="flash-topic-label">Mixed</span>
        </button>
        {visible.map((s) => (
          <button key={s.set_key} type="button" disabled={s.total === 0}
            className={`flash-topic flash-press${selected === s.set_key ? " is-selected" : ""}`}
            style={{ "--flash-topic-hue": topicHue(s.topic_key) } as React.CSSProperties}
            aria-pressed={selected === s.set_key} onClick={() => setSelected(s.set_key)}>
            <span className="flash-topic-label">{s.label}</span>
          </button>
        ))}
        {hiddenCount > 0 && (
          <button type="button" className="flash-topic is-more flash-press" onClick={() => setShowAll(true)}>
            <span className="flash-topic-label">Show all topics</span>
            <span className="flash-topic-sub">+{hiddenCount} more</span>
          </button>
        )}
      </section>

      <div className="flash-setup-foot">
        <button type="button" className="flash-start flash-press" data-testid="flash-start"
          onClick={() => onStart(selected)}>Start session →</button>
      </div>
    </div>
  );
}
