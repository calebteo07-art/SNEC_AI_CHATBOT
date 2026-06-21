"use client";
/* StepTopic — step 2 of the flashcards setup: the vivid "what" screen. The topic
   gallery (Mixed selected by default) fills the page; picking a tile floods the
   setup's --flash-topic-hue. Back returns to step 1; Start commits the set. No hero
   (the shared hero lives in the shell, shrunk to a badge above this content). */
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { galleryHue } from "./types";

const PREVIEW = 6;

interface Props {
  sets: FlashcardSetInfo[];
  selected: string | null;
  setSelected: (key: string | null) => void;
  showAll: boolean;
  setShowAll: (v: boolean) => void;
  onBack: () => void;
  onStart: () => void;
}

export function StepTopic({
  sets, selected, setSelected, showAll, setShowAll, onBack, onStart,
}: Props) {
  const visible = showAll ? sets : sets.slice(0, PREVIEW);
  const hiddenCount = sets.length - visible.length;

  return (
    <div className="flash-step-body flash-step-topic">
      <div className="flash-step-lede">
        <p className="flash-eyebrow">Step 2 of 2 · choose a channel</p>
        <h2 className="flash-setup-title">Topics</h2>
        <p className="flash-setup-help">Tune to one topic, or go Mixed for the full spread.</p>
      </div>

      <section className="flash-topics" aria-label="Topics">
        <button type="button"
          className={`flash-topic is-mixed flash-press${selected === null ? " is-selected" : ""}`}
          style={{ "--i": 0 } as React.CSSProperties}
          aria-pressed={selected === null} onClick={() => setSelected(null)}>
          <span className="flash-topic-label">Mixed</span>
          <span className="flash-topic-sub">full spectrum</span>
        </button>
        {visible.map((s, i) => (
          <button key={s.set_key} type="button" disabled={s.total === 0}
            className={`flash-topic flash-press${selected === s.set_key ? " is-selected" : ""}`}
            style={{ "--flash-topic-hue": galleryHue(i), "--i": i + 1 } as React.CSSProperties}
            aria-pressed={selected === s.set_key} onClick={() => setSelected(s.set_key)}>
            <span className="flash-topic-label">{s.label}</span>
            <span className="flash-topic-sub">{s.total} cards</span>
          </button>
        ))}
        {hiddenCount > 0 && (
          <button type="button" className="flash-topic is-more flash-press" onClick={() => setShowAll(true)}>
            <span className="flash-topic-label">Show all topics</span>
            <span className="flash-topic-sub">+{hiddenCount} more</span>
          </button>
        )}
      </section>

      <div className="flash-step-foot flash-step-foot-split">
        <button type="button" className="flash-back flash-press" data-testid="flash-back"
          onClick={onBack}>← Back</button>
        <button type="button" className="flash-start flash-press" data-testid="flash-start"
          onClick={onStart}>Start session →</button>
      </div>
    </div>
  );
}
