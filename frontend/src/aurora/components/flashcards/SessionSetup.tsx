"use client";
/* SessionSetup — one calm light screen: difficulty + length pills and a topic
   gallery. Mixed is selected by default (so Start always works, even when topics
   are empty); clicking a topic only selects it. Start commits the set_key (or null
   for Mixed) to the orchestrator. Changing difficulty resets the selection to Mixed. */
import { useState } from "react";
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { type Difficulty, LENGTHS } from "./types";
import { TopicGlyph } from "./TopicGlyph";

interface Props {
  topicSets: FlashcardSetInfo[] | undefined;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  sessionLength: number;
  setSessionLength: (n: number) => void;
  onStart: (setKey: string | null) => void;
}

export function SessionSetup({
  topicSets, difficulty, setDifficulty, sessionLength, setSessionLength, onStart,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null); // null = Mixed
  const sets = (topicSets ?? []).filter((s) => s.difficulty === difficulty);
  const pickDifficulty = (d: Difficulty) => { setDifficulty(d); setSelected(null); };

  return (
    <div className="flash-setup" data-testid="flash-setup">
      <header className="flash-setup-head">
        <p className="flash-eyebrow">Active recall</p>
        <h2 className="flash-setup-title">Flashcards</h2>
        <p className="flash-setup-help">Answer from memory, graded by AI. Pick a focus and start.</p>
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
                {l.label} · {l.n}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="flash-topics" aria-label="Topics">
        <button type="button" className={`flash-topic flash-press${selected === null ? " is-selected" : ""}`}
          aria-pressed={selected === null} onClick={() => setSelected(null)}>
          <span className="flash-topic-glyph"><TopicGlyph topicKey="__mixed" /></span>
          <span className="flash-topic-label">Mixed</span>
          <span className="flash-topic-sub">All topics · no repeats</span>
        </button>
        {sets.map((s) => (
          <button key={s.set_key} type="button" disabled={s.total === 0}
            className={`flash-topic flash-press${selected === s.set_key ? " is-selected" : ""}`}
            aria-pressed={selected === s.set_key} onClick={() => setSelected(s.set_key)}>
            <span className="flash-topic-glyph"><TopicGlyph topicKey={s.topic_key} /></span>
            <span className="flash-topic-label">{s.label}</span>
            <span className="flash-topic-sub">{s.completed}/{s.total} seen</span>
          </button>
        ))}
      </section>

      <div className="flash-setup-foot">
        <button type="button" className="flash-start flash-press" data-testid="flash-start"
          onClick={() => onStart(selected)}>Start session →</button>
      </div>
    </div>
  );
}
