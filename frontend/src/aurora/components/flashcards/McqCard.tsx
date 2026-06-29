"use client";
/* McqCard — the Console instrument card. Tap = instant lock + reveal (no submit). Multi
   cards toggle then fire a small lock reticle. A few cards show an OPTIONAL typed reflection
   in the readout (background-graded, never gates). Free-text tutor cards flip to a self-mark.
   The lower-band Brownian colour field lives inside the card, masked below the question. */
import { useEffect, useState } from "react";
import { type Flashcard, MAX_REASON_CHARS, gradeSelection } from "./types";
import { BrownianField } from "./BrownianField";
import { Icon } from "@/aurora/icons";

interface Props {
  card: Flashcard; topicLabel: string; idx: number; total: number;
  onCheck: (correct: boolean, selected: number[], reasoning: string) => void;
  onReason: (cardId: number, stem: string, text: string, model: string) => void;
  onAdvance: () => void; advanceLabel: string; reasonNote: string | null;
}

export function McqCard(p: Props) {
  const { card } = p;
  const [selected, setSelected] = useState<number[]>([]);
  const [reasoning, setReasoning] = useState("");
  const [sentReason, setSentReason] = useState(false);
  const [checked, setChecked] = useState(false);
  const [verdict, setVerdict] = useState(false);

  useEffect(() => {
    setSelected([]); setReasoning(""); setSentReason(false); setChecked(false); setVerdict(false);
  }, [card.id]);

  const needsReason = card.requiresExplanation && !card.freeText;
  const letters = ["a", "b", "c", "d", "e", "f"];

  const ignite = (li: Element | null) => {
    const lamp = li?.querySelector(".flash-lamp"); if (!lamp) return;
    const r = document.createElement("span"); r.className = "flash-ignite";
    lamp.appendChild(r); setTimeout(() => r.remove(), 650);
  };

  const doReveal = (sel: number[]) => {
    if (checked) return;
    const correct = gradeSelection(card, sel);
    setSelected(sel); setVerdict(correct); setChecked(true);
    p.onCheck(correct, sel, "");
  };

  const tap = (i: number, el: HTMLElement) => {
    if (checked) return;
    if (card.qtype === "single") { ignite(el); doReveal([i]); return; }
    setSelected((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]);
  };
  const fireLock = (root: HTMLElement) => {
    if (checked || selected.length === 0) return;
    selected.forEach((i) => ignite(root.querySelector(`[data-opt="${i}"]`)));
    doReveal(selected);
  };
  const advance = () => {
    if (needsReason && reasoning.trim() && !sentReason) {
      p.onReason(card.id, card.stem, reasoning.trim(), card.explanation); setSentReason(true);
    }
    p.onAdvance();
  };
  const selfMark = (got: boolean) => { if (checked) return; setChecked(true); p.onCheck(got, [], ""); p.onAdvance(); };

  const topBar = (
    <div className="flash-top">
      <span className="flash-tag"><span aria-hidden>&#9673;</span>{p.topicLabel}</span>
      <span className="flash-track" aria-label={`Card ${p.idx + 1} of ${p.total}`}>
        <span className="flash-segs">{Array.from({ length: p.total }).map((_, i) =>
          <i key={i} className={i < p.idx ? "is-done" : i === p.idx ? "is-now" : ""} />)}</span>
        <span className="flash-count">{String(p.idx + 1).padStart(2, "0")} / {String(p.total).padStart(2, "0")}</span>
      </span>
    </div>
  );

  if (card.freeText) {
    return (
      <div className="flash-card"><BrownianField />
        <div className="flash-cardin">
          {topBar}<div className="flash-rule" /><p className="flash-kicker">recall</p>
          <p className="flash-q">{card.stem}</p>
          {!checked
            ? <button type="button" className="flash-advance" data-testid="flash-reveal" onClick={() => setChecked(true)}>Show answer</button>
            : <div className="flash-reveal" data-testid="flash-reveal-back">
                <p className="flash-compare-label">Model answer</p>
                <p className="flash-model">{card.explanation}</p>
                <div className="flash-selfmark">
                  <button type="button" className="flash-mark-miss" onClick={() => selfMark(false)}>Missed it</button>
                  <button type="button" className="flash-mark-got" onClick={() => selfMark(true)}>Got it</button>
                </div>
              </div>}
        </div>
      </div>
    );
  }

  return (
    <div className={`flash-card${checked && verdict ? " is-right" : ""}`}>
      <BrownianField />
      <div className="flash-cardin">
        {topBar}<div className="flash-rule" />
        <p className="flash-kicker">
          question {String(p.idx + 1).padStart(2, "0")}
          {card.qtype === "multi" && (
            <span className="flash-multi" data-testid="flash-multi">
              <span aria-hidden>&#10003;&#10003;</span> Select all that apply
            </span>
          )}
        </p>
        <p className="flash-q">{card.stem}</p>
        <ul className="flash-options" role={card.qtype === "single" ? "radiogroup" : "group"}>
          {card.options.map((opt, i) => {
            const picked = selected.includes(i);
            const cls = checked
              ? card.correct.includes(i) ? "is-correct" : picked ? "is-wrong" : ""
              : picked ? "is-picked" : "";
            return (
              <li key={i}>
                <button type="button" data-testid="flash-option" data-opt={i}
                  role={card.qtype === "single" ? "radio" : "checkbox"} aria-checked={picked}
                  className={`flash-option ${cls}`} disabled={checked}
                  onClick={(e) => tap(i, e.currentTarget.parentElement as HTMLElement)}>
                  <span className="flash-lamp" aria-hidden>{checked
                    ? (card.correct.includes(i) ? "✓" : picked ? "✗" : letters[i])
                    : letters[i]}</span>
                  <span className="flash-otext">{opt}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {!checked && (
          <div className="flash-foot">
            <span className="flash-hint">{card.qtype === "multi" ? "tap all that apply, then lock" : "tap to lock — no submit"}</span>
            {card.qtype === "multi" && (
              <button type="button" aria-label="Lock in your answer"
                className={`flash-lock${selected.length ? " is-armed" : ""}`}
                onClick={(e) => fireLock(e.currentTarget.closest(".flash-card") as HTMLElement)}>
                <Icon.lock size={18} />
              </button>
            )}
          </div>
        )}

        {checked && (
          <div className="flash-reveal" data-testid="flash-reveal-back">
            <p className={`flash-verdict ${verdict ? "is-right" : "is-wrong"}`}>{verdict ? "signal locked" : "review this one"}</p>
            <p className="flash-compare-label">Findings</p>
            <p className="flash-model">{card.explanation}</p>
            {needsReason && (
              <div className="flash-reason">
                <textarea className="flash-reason-box" data-testid="flash-reason" rows={2}
                  maxLength={MAX_REASON_CHARS} value={reasoning}
                  placeholder="Optional: in a sentence, why? (we'll review it)"
                  onChange={(e) => setReasoning(e.target.value.slice(0, MAX_REASON_CHARS))} />
                {p.reasonNote && <p className="flash-reason-note" data-testid="flash-reason-note">{p.reasonNote}</p>}
              </div>
            )}
            <button type="button" className="flash-advance" data-testid="flash-advance" onClick={advance}>{p.advanceLabel}</button>
          </div>
        )}
      </div>
    </div>
  );
}
