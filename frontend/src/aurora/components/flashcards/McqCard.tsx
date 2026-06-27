"use client";
/* McqCard — the centered question card. Pick option(s) → Check → instant reveal of the
   model answer (correct/incorrect highlight + explanation). A few cards per deck carry a
   COMPULSORY typed-reasoning box (Check disabled until filled); its grade resolves in the
   background and never blocks the reveal. Free-text tutor cards (no options) flip to a
   reveal + self-mark. No AI on the MCQ path. */
import { useEffect, useRef, useState } from "react";
import { type Flashcard, MAX_REASON_CHARS } from "./types";

interface Props {
  card: Flashcard;
  deckTitle: string;
  /** Called when the student checks the card. `correct` is the instant MCQ verdict;
   *  `reasoning` is the typed text (empty unless requiresExplanation). */
  onCheck: (correct: boolean, selected: number[], reasoning: string) => void;
  onAdvance: () => void;
  advanceLabel: string;
  /** Background typed-reasoning grade for THIS card, once it returns (else null). */
  reasonNote: string | null;
}

export function McqCard(p: Props) {
  const { card } = p;
  const [selected, setSelected] = useState<number[]>([]);
  const [reasoning, setReasoning] = useState("");
  const [checked, setChecked] = useState(false);
  const [verdict, setVerdict] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  // Reset per card.
  useEffect(() => { setSelected([]); setReasoning(""); setChecked(false); setVerdict(false); }, [card.id]);

  const toggle = (i: number) => {
    if (checked) return;
    setSelected((prev) =>
      card.qtype === "single" ? [i] : prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]);
  };

  const needsReason = card.requiresExplanation && !card.freeText;
  const canCheck = card.freeText
    ? true
    : selected.length > 0 && (!needsReason || reasoning.trim().length > 0);

  const doCheck = () => {
    if (!canCheck || checked) return;
    const correct = card.freeText ? false : sameSet(selected, card.correct);
    setVerdict(correct);
    setChecked(true);
    p.onCheck(correct, selected, needsReason ? reasoning.trim() : "");
  };

  // Free-text tutor card → flip-to-reveal self-mark.
  if (card.freeText) {
    return (
      <div className="flash-cardwrap">
        <div className={`flash-card${checked ? " is-flipped" : ""}`}>
          <section className="flash-face is-front">
            <span className="flash-topictag"><span>{card.tag} · {p.deckTitle}</span></span>
            <p className="flash-q">{card.stem}</p>
            {!checked && (
              <button type="button" className="flash-submit flash-press" data-testid="flash-reveal"
                onClick={() => setChecked(true)}>Show answer</button>
            )}
          </section>
          <section className="flash-face is-back">
            {checked && (
              <div className="flash-reveal" data-testid="flash-reveal-back">
                <p className="flash-compare-label">Model answer</p>
                <p className="flash-model">{card.explanation}</p>
                <div className="flash-selfmark">
                  <button type="button" className="flash-press flash-mark-miss"
                    onClick={() => { p.onCheck(false, [], ""); p.onAdvance(); }}>Missed it</button>
                  <button type="button" className="flash-press flash-mark-got"
                    onClick={() => { p.onCheck(true, [], ""); p.onAdvance(); }}>Got it</button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="flash-cardwrap">
      <div className={`flash-card${checked ? " is-flipped" : ""}${checked && verdict ? " is-high" : ""}`}>
        {/* FRONT — options */}
        <section className="flash-face is-front">
          <span className="flash-topictag">
            <span>{card.tag} · {p.deckTitle}{card.qtype === "multi" ? " · select all" : ""}</span>
          </span>
          <p className="flash-q">{card.stem}</p>
          <ul className="flash-options" role={card.qtype === "single" ? "radiogroup" : "group"}>
            {card.options.map((opt, i) => (
              <li key={i}>
                <button type="button" data-testid="flash-option"
                  role={card.qtype === "single" ? "radio" : "checkbox"}
                  aria-checked={selected.includes(i)}
                  className={`flash-option flash-press${selected.includes(i) ? " is-picked" : ""}`}
                  onClick={() => toggle(i)} disabled={checked}>
                  <span className="flash-option-mark" aria-hidden />
                  <span className="flash-option-text">{opt}</span>
                </button>
              </li>
            ))}
          </ul>
          {needsReason && (
            <div className="flash-reason">
              <label className="flash-reason-label" htmlFor="flash-reason-box">
                Explain your reasoning <span className="flash-reason-req">(required)</span>
              </label>
              <textarea id="flash-reason-box" ref={reasonRef} className="flash-reason-box"
                data-testid="flash-reason" value={reasoning} rows={2} maxLength={MAX_REASON_CHARS}
                onChange={(e) => setReasoning(e.target.value.slice(0, MAX_REASON_CHARS))}
                placeholder="In a sentence, why is that your answer?" />
            </div>
          )}
          {!checked && (
            <button type="button" className="flash-submit flash-press" data-testid="flash-check"
              onClick={doCheck} disabled={!canCheck}>Check</button>
          )}
        </section>

        {/* BACK — reveal */}
        <section className="flash-face is-back">
          {checked && (
            <div className="flash-reveal" data-testid="flash-reveal-back">
              <p className={`flash-verdict ${verdict ? "is-right" : "is-wrong"}`}>
                {verdict ? "Correct" : "Not quite"}
              </p>
              <ul className="flash-options is-revealed">
                {card.options.map((opt, i) => {
                  const isCorrect = card.correct.includes(i);
                  const isPicked = selected.includes(i);
                  const cls = isCorrect ? "is-correct" : isPicked ? "is-wrongpick" : "";
                  return (
                    <li key={i} className={`flash-option-result ${cls}`}>
                      <span className="flash-option-text">{opt}</span>
                      {isCorrect && <span className="flash-tick" aria-hidden>&#10003;</span>}
                      {!isCorrect && isPicked && <span className="flash-cross" aria-hidden>&#10007;</span>}
                    </li>
                  );
                })}
              </ul>
              <p className="flash-compare-label">Why</p>
              <p className="flash-model">{card.explanation}</p>
              {needsReason && (
                <p className="flash-reason-note" data-testid="flash-reason-note">
                  {p.reasonNote ?? "Reviewing your written answer…"}
                </p>
              )}
              <button type="button" className="flash-advance flash-press" data-testid="flash-advance"
                onClick={p.onAdvance}>{p.advanceLabel}</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function sameSet(a: number[], b: number[]): boolean {
  const x = [...a].sort((m, n) => m - n);
  const y = [...b].sort((m, n) => m - n);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
