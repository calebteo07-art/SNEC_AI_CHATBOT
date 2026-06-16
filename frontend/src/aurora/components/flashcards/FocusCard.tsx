"use client";
/* The focus card: a centered frosted panel with no imagery. Front = the question
   and a compulsory typed recall; on grading it does a true 3D flip to the back =
   AI score (count-up), feedback, and the model answer. */
import { useEffect, useRef } from "react";
import { useCountUp } from "@/hooks/useCountUp";
import { type Flashcard, type AiFeedback, MAX_ANSWER_CHARS } from "./types";

interface Props {
  card: Flashcard;
  flipKey: string;                 // changes per card so the flip resets
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

export function FocusCard(p: Props) {
  const flipped = p.submitted && !p.aiChecking;
  const isHigh = (p.aiFeedback?.score ?? 0) >= 85;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const score = p.aiFeedback?.score ?? 0;
  const { ref: scoreRef, display: scoreText } = useCountUp<HTMLSpanElement>(score, { duration: 900 });

  useEffect(() => { if (!p.submitted) textareaRef.current?.focus(); }, [p.flipKey, p.submitted]);

  return (
    <div className="aperture-cardwrap">
      <div className={`focus-card${flipped ? " is-flipped" : ""}${isHigh ? " is-high" : ""}`}>
        {/* FRONT */}
        <section className="focus-face is-front">
          <span className="focus-ring" aria-hidden />
          <span className="focus-topic">{p.card.tag} · {p.deckTitle}{p.isRetry ? " · ↻ refocus" : ""}</span>
          <p className="focus-q">{p.card.question}</p>
          {p.submitted ? (
            /* Pressing Submit flips `submitted` on immediately, so the input + button
               are replaced by the focusing loader — it can't be pressed twice. */
            <div className="focus-loading" role="status" aria-live="polite">
              <span className="focus-aperture-loader" aria-hidden><i /><i /><i /></span>
              <span className="focus-loading-label">Bringing your answer into focus…</span>
            </div>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                className="focus-recall"
                value={p.userAttempt}
                onChange={(e) => p.setUserAttempt(e.target.value.slice(0, MAX_ANSWER_CHARS))}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && p.userAttempt.trim()) { e.preventDefault(); p.onSubmit(); } }}
                placeholder="Type your answer — you must answer before it's graded"
                rows={3}
                maxLength={MAX_ANSWER_CHARS}
                aria-label="Your answer"
              />
              <div className="focus-meta">
                {!p.userAttempt.trim()
                  ? <span className="focus-hint">Active recall — answer first. ⌘/Ctrl+Enter to submit.</span>
                  : <span aria-hidden />}
                <span className={`focus-count${p.userAttempt.length >= MAX_ANSWER_CHARS - 20 ? " is-warn" : ""}`} aria-live="polite">
                  {p.userAttempt.length} / {MAX_ANSWER_CHARS}
                </span>
              </div>
              <button type="button" className="focus-submit aperture-press" data-testid="focus-submit"
                onClick={p.onSubmit} disabled={!p.userAttempt.trim()}>Submit for grading</button>
            </>
          )}
        </section>

        {/* BACK */}
        <section className="focus-face is-back">
          <span className="focus-ring" aria-hidden />
          {flipped && (
            <div className="aperture-focuspull">
              <div className="focus-scoreline" data-testid="focus-feedback-head">
                <span className="focus-score"><span ref={scoreRef}>{scoreText}</span>{p.aiFeedback ? "/100" : ""}</span>
                <span className="focus-xp">+{p.cardXp} XP</span>
              </div>
              <p className="focus-feedback">{p.aiFeedback ? p.aiFeedback.feedback : "Graded offline — compare with the model answer below."}</p>
              <div className="focus-model">
                <span className="focus-model-label">Model answer</span>
                <p>{p.card.answer}</p>
              </div>
              <button type="button" className="focus-toggle aperture-press" style={{ marginTop: 12 }} onClick={p.onExplain}>
                🎓 Explain this in the Tutor
              </button>
              <button type="button" className="focus-advance aperture-press" data-testid="focus-advance" onClick={p.onAdvance}>
                {p.advanceLabel}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
