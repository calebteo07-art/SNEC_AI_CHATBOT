"use client";
/* McqCard — the Console instrument card. Tap = instant lock + verdict (no submit).
   The MODEL EXPLANATION then animates in the same way on every card: straight away on
   plain cards, but AFTER the learner commits a one-line reason on reflection cards
   (reasoning box first, then "Reveal model answer"). Once the model is showing, the
   Next control is held for a short DWELL behind a filling ring so the learner sits with
   it and can't tap-skip. Free-text tutor cards flip to a self-mark. The drifting colour
   lights now live behind the whole canvas (FlashShell), not inside the card. */
import { useEffect, useState, type CSSProperties } from "react";
import { type Flashcard, MAX_REASON_CHARS, gradeSelection } from "./types";
import { Icon } from "@/aurora/icons";

const DWELL_MS = 2200; // "locked in" beat after the model answer lands before Next unlocks

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
  const [modelShown, setModelShown] = useState(false); // model explanation visible + dwell armed
  const [ready, setReady] = useState(false);           // dwell elapsed → advance allowed
  const [marked, setMarked] = useState(false);         // free-text self-mark guard

  useEffect(() => {
    setSelected([]); setReasoning(""); setSentReason(false); setChecked(false);
    setVerdict(false); setModelShown(false); setReady(false); setMarked(false);
  }, [card.id]);

  // Each time the model answer lands, hold Next for the dwell beat, then unlock.
  useEffect(() => {
    if (!modelShown) return;
    setReady(false);
    const t = setTimeout(() => setReady(true), DWELL_MS);
    return () => clearTimeout(t);
  }, [modelShown]);

  // Keyboard advance (Enter / →) — only once the model is showing AND the dwell is done,
  // and never on free-text cards where a Got it / Missed it choice is required first.
  useEffect(() => {
    if (!modelShown || !ready || card.freeText) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); p.onAdvance(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modelShown, ready, card.freeText, p.onAdvance]);

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
    // Plain cards reveal the model straight away; reflection cards wait for the learner.
    if (!needsReason) setModelShown(true);
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
  // Reflection card: learner commits their reason, THEN the model answer animates in.
  const revealModel = () => {
    if (modelShown) return;
    if (reasoning.trim() && !sentReason) {
      p.onReason(card.id, card.stem, reasoning.trim(), card.explanation); setSentReason(true);
    }
    setModelShown(true);
  };
  const advance = () => { if (ready) p.onAdvance(); };
  const showAnswerFree = () => { if (checked) return; setChecked(true); setModelShown(true); };
  const selfMark = (got: boolean) => {
    if (marked || !ready) return;
    setMarked(true); p.onCheck(got, [], ""); p.onAdvance();
  };

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

  // The Next control — held disabled behind a filling ring through the dwell beat.
  const nextBtn = (
    <button type="button" className={`flash-advance${ready ? "" : " is-dwelling"}`}
      data-testid="flash-advance" disabled={!ready} onClick={advance}
      style={{ "--flash-dwell-ms": `${DWELL_MS}ms` } as CSSProperties}>
      {!ready && (
        <svg className="flash-dwell-ring" viewBox="0 0 36 36" aria-hidden>
          <circle className="flash-dwell-track" cx="18" cy="18" r="15" />
          <circle className="flash-dwell-fill" cx="18" cy="18" r="15" />
        </svg>
      )}
      <span>{ready ? p.advanceLabel : "hold…"}</span>
    </button>
  );

  if (card.freeText) {
    return (
      <div className="flash-card">
        <div className="flash-cardin">
          {topBar}<div className="flash-rule" /><p className="flash-kicker">recall</p>
          <p className="flash-q">{card.stem}</p>
          {!checked
            ? <button type="button" className="flash-advance" data-testid="flash-reveal" onClick={showAnswerFree}>Show answer</button>
            : <div className="flash-reveal" data-testid="flash-reveal-back">
                <div className="flash-modelwrap">
                  <p className="flash-compare-label">Model answer</p>
                  <p className="flash-model">{card.explanation}</p>
                  <div className="flash-selfmark">
                    <button type="button" className="flash-mark-miss" disabled={!ready} onClick={() => selfMark(false)}>Missed it</button>
                    <button type="button" className="flash-mark-got" disabled={!ready} onClick={() => selfMark(true)}>Got it</button>
                  </div>
                </div>
              </div>}
        </div>
      </div>
    );
  }

  return (
    <div className={`flash-card${checked && verdict ? " is-right" : ""}`}>
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

            {/* Reflection card — your reasoning first; the model answer is gated behind it. */}
            {needsReason && !modelShown && (
              <div className="flash-reason">
                <p className="flash-compare-label">Your reasoning first</p>
                <textarea className="flash-reason-box" data-testid="flash-reason" rows={2}
                  maxLength={MAX_REASON_CHARS} value={reasoning} autoFocus
                  placeholder="In a sentence, why? (we'll review it — optional)"
                  onChange={(e) => setReasoning(e.target.value.slice(0, MAX_REASON_CHARS))} />
                <button type="button" className="flash-advance flash-reveal-btn"
                  data-testid="flash-reveal-model" onClick={revealModel}>
                  Reveal model answer &rarr;
                </button>
              </div>
            )}

            {/* Model explanation — animates in identically on every card. */}
            {modelShown && (
              <div className="flash-modelwrap">
                <p className="flash-compare-label">Findings</p>
                <p className="flash-model">{card.explanation}</p>
                {needsReason && p.reasonNote && (
                  <p className="flash-reason-note" data-testid="flash-reason-note">{p.reasonNote}</p>
                )}
                {nextBtn}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
