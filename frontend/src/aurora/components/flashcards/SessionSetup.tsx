"use client";
/* SessionSetup — one calm light screen: a slit-lamp hero, difficulty + length
   pills, and a color-led topic gallery. Mixed is selected by default (so Start
   always works, even when topics are empty); each real topic tile carries its own
   topicHue. Only a handful of topics show until "Show all topics" is opened. Start
   commits the set_key (or null for Mixed) to the orchestrator. */
import { useState } from "react";
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { PlateWell } from "@/aurora/components/PlateWell";
import { PLATE } from "@/aurora/media";
import { type Difficulty, LENGTHS, topicHue } from "./types";
import { TopicGlyph } from "./TopicGlyph";

interface Props {
  topicSets: FlashcardSetInfo[] | undefined;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  sessionLength: number;
  setSessionLength: (n: number) => void;
  onStart: (setKey: string | null) => void;
}

const PREVIEW = 5;

export function SessionSetup({
  topicSets, difficulty, setDifficulty, sessionLength, setSessionLength, onStart,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null); // null = Mixed
  const [showAll, setShowAll] = useState(false);
  const sets = (topicSets ?? []).filter((s) => s.difficulty === difficulty);
  const pickDifficulty = (d: Difficulty) => { setDifficulty(d); setSelected(null); };

  const visible = showAll ? sets : sets.slice(0, PREVIEW);
  const hiddenCount = sets.length - visible.length;

  return (
    <div className="flash-setup" data-testid="flash-setup">
      <header className="flash-setup-head">
        <PlateWell
          src={PLATE.flashcards}
          alt="Slit-lamp optical section through the cornea, anterior chamber and crystalline lens"
          ratio={16 / 9}
          caption="Slit-Lamp Optical Section"
          className="flash-hero"
        />
        <h2 className="flash-setup-title">Flashcards</h2>
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
          <span className="flash-topic-glyph"><TopicGlyph topicKey="__mixed" /></span>
          <span className="flash-topic-label">Mixed</span>
        </button>
        {visible.map((s) => (
          <button key={s.set_key} type="button" disabled={s.total === 0}
            className={`flash-topic flash-press${selected === s.set_key ? " is-selected" : ""}`}
            style={{ "--flash-topic-hue": topicHue(s.topic_key) } as React.CSSProperties}
            aria-pressed={selected === s.set_key} onClick={() => setSelected(s.set_key)}>
            <span className="flash-topic-glyph"><TopicGlyph topicKey={s.topic_key} /></span>
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
