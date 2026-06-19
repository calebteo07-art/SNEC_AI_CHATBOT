"use client";
/* RecallCard — the centered focus card. Front = topic tag, question, a compulsory
   typed recall and Submit; on submit the input is replaced by a calm loader (so it
   can't be pressed twice). On grading it does a springy 3D flip to RevealBack.
   Confetti fires (CSS-only) only on a high score. */
import { useEffect, useRef } from "react";
import { type Flashcard, type AiFeedback, MAX_ANSWER_CHARS } from "./types";
import { RevealBack } from "./RevealBack";

interface Props {
  card: Flashcard;
  flipKey: string;
  isRetry: boolean;
  deckTitle: string;
  submitted: boolean;
  aiChecking: boolean;
  aiFeedback: AiFeedback | null;
  cardXp: number;
  userAttempt: string;
  setUserAttempt: (v: string) => void;
  onSubmit: () => void;
  onAdvance: () => void;
  onExplain: () => void;
  advanceLabel: string;
}

export function RecallCard(p: Props) {
  const flipped = p.submitted && !p.aiChecking;
  const isHigh = (p.aiFeedback?.score ?? 0) >= 85;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (!p.submitted) textareaRef.current?.focus(); }, [p.flipKey, p.submitted]);

  return (
    <div className="flash-cardwrap">
      <div className={`flash-card${flipped ? " is-flipped" : ""}${flipped && isHigh ? " is-high" : ""}`}>
        {/* FRONT */}
        <section className="flash-face is-front">
          <span className="flash-topictag">
            <span>{p.card.tag} · {p.deckTitle}{p.isRetry ? " · ↻ refocus" : ""}</span>
          </span>
          <p className="flash-q">{p.card.question}</p>
          {p.submitted ? (
            <div className="flash-loading" role="status" aria-live="polite">
              <span className="flash-loader" aria-hidden><i /><i /><i /></span>
              <span className="flash-loading-label">Grading your answer…</span>
            </div>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                className="flash-recall"
                value={p.userAttempt}
                onChange={(e) => p.setUserAttempt(e.target.value.slice(0, MAX_ANSWER_CHARS))}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && p.userAttempt.trim()) { e.preventDefault(); p.onSubmit(); } }}
                placeholder="Type your answer — recall it before you grade"
                rows={3}
                maxLength={MAX_ANSWER_CHARS}
                aria-label="Your answer"
              />
              <div className="flash-meta">
                {!p.userAttempt.trim()
                  ? <span className="flash-hint">Active recall — answer first. ⌘/Ctrl+Enter to submit.</span>
                  : <span aria-hidden />}
                <span className={`flash-count${p.userAttempt.length >= MAX_ANSWER_CHARS - 20 ? " is-warn" : ""}`} aria-live="polite">
                  {p.userAttempt.length}/{MAX_ANSWER_CHARS}
                </span>
              </div>
              <button type="button" className="flash-submit flash-press" data-testid="flash-submit"
                onClick={p.onSubmit} disabled={!p.userAttempt.trim()}>Submit for grading</button>
            </>
          )}
        </section>

        {/* BACK */}
        <section className="flash-face is-back">
          {flipped && (
            <RevealBack
              aiFeedback={p.aiFeedback}
              cardXp={p.cardXp}
              userAttempt={p.userAttempt}
              modelAnswer={p.card.answer}
              onExplain={p.onExplain}
              onAdvance={p.onAdvance}
              advanceLabel={p.advanceLabel}
            />
          )}
        </section>
      </div>

      {flipped && isHigh && (
        <span className="flash-confetti" aria-hidden>
          {Array.from({ length: 22 }).map((_, i) => (
            <i key={i} style={{ ["--i" as string]: i } as React.CSSProperties} />
          ))}
        </span>
      )}
    </div>
  );
}
