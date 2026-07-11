"use client";
/* McqCard — the two-faced study instrument. Tap = instant ✓/✗ lock on the FRONT
   face. A ChargeBeat (liquid loader) suspense beat plays, then the card FLIPS (CSS, .is-flipped) to
   a full-bleed BACK face: the Payoff (verdict + combo + points + particles) over the
   model answer ("Findings"). Plain cards charge straight after the lock; reflection
   cards (~1 in 5) take a one-line reason on the front first, then charge. Free-text
   tutor cards "Show answer" → charge → flip → self-mark. After the flip the Next /
   self-mark is held for a short SETTLE so the payoff plays before advancing. The
   drifting colour lights live behind the whole canvas (FlashShell), not in the card. */
import { useEffect, useState } from "react";
import { type Flashcard, MAX_REASON_CHARS, gradeSelection, XP_CORRECT, XP_ATTEMPT } from "./types";
import { Icon } from "@/aurora/icons";
import { ChargeBeat } from "./ChargeBeat";
import { Payoff } from "./Payoff";
import { useFlashFx } from "./useFlashFx";

const SETTLE_MS = 850; // payoff dwell after the flip before Next/self-mark unlocks

interface Props {
  card: Flashcard; topicLabel: string; idx: number; total: number; combo: number;
  onCheck: (correct: boolean, selected: number[], reasoning: string) => void;
  onReason: (cardId: number, stem: string, text: string, model: string) => void;
  onAdvance: () => void; advanceLabel: string; reasonNote: string | null;
}

export function McqCard(p: Props) {
  const { card } = p;
  const fx = useFlashFx();
  const [selected, setSelected] = useState<number[]>([]);
  const [reasoning, setReasoning] = useState("");
  const [sentReason, setSentReason] = useState(false);
  const [checked, setChecked] = useState(false);   // verdict computed, options locked
  const [verdict, setVerdict] = useState(false);
  const [charging, setCharging] = useState(false);  // ChargeRing on the front
  const [revealed, setRevealed] = useState(false);  // flipped to the back face
  const [ready, setReady] = useState(false);        // settle elapsed → advance allowed
  const [marked, setMarked] = useState(false);      // free-text self-mark guard

  useEffect(() => {
    setSelected([]); setReasoning(""); setSentReason(false); setChecked(false);
    setVerdict(false); setCharging(false); setRevealed(false); setReady(false); setMarked(false);
  }, [card.id]);

  // After the flip lands, hold the Next/self-mark for the settle beat, then unlock.
  useEffect(() => {
    if (!revealed) return;
    setReady(false);
    const t = setTimeout(() => setReady(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, [revealed]);

  // Keyboard advance (Enter / →) — only once revealed AND settled, never on free-text
  // cards where a Got it / Missed it choice is required first.
  useEffect(() => {
    if (!revealed || !ready || card.freeText) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); p.onAdvance(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, ready, card.freeText, p.onAdvance]);

  const needsReason = card.requiresExplanation && !card.freeText;
  const letters = ["a", "b", "c", "d", "e", "f"];

  const ignite = (li: Element | null) => {
    const lamp = li?.querySelector(".flash-lamp"); if (!lamp) return;
    const r = document.createElement("span"); r.className = "flash-ignite";
    lamp.appendChild(r); setTimeout(() => r.remove(), 650);
  };

  // The suspense beat → on complete, fire the verdict cue and flip.
  const startCharge = () => { setCharging(true); fx.charge(); };
  const onCharged = () => {
    setCharging(false); setRevealed(true);
    // Free-text cards have no programmatic verdict (the learner self-marks), so the
    // reveal stays neutral — no win/miss cue and no "Correct" payoff claim.
    if (!card.freeText) { if (verdict) fx.win(); else fx.miss(); }
  };

  const doReveal = (sel: number[]) => {
    if (checked) return;
    const correct = gradeSelection(card, sel);
    setSelected(sel); setVerdict(correct); setChecked(true);
    p.onCheck(correct, sel, "");
    if (!needsReason) startCharge(); // plain cards charge straight away
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
  // Reflection card: learner commits a reason, THEN the reveal charges + flips.
  const revealModel = () => {
    if (charging || revealed) return;
    if (reasoning.trim() && !sentReason) {
      p.onReason(card.id, card.stem, reasoning.trim(), card.explanation); setSentReason(true);
    }
    startCharge();
  };
  const advance = () => { if (ready) p.onAdvance(); };
  const showAnswerFree = () => { if (checked) return; setChecked(true); startCharge(); };
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

  const nextBtn = (
    <button type="button" className="flash-advance" data-testid="flash-advance"
      disabled={!ready} onClick={advance}>
      <span>{ready ? p.advanceLabel : "hold…"}</span>
    </button>
  );

  // Back face: the model answer, owned by the whole card, under the Payoff.
  const basePoints = verdict ? XP_CORRECT : XP_ATTEMPT;
  const backFace = (
    <div className="flash-face is-back">
      <div className="flash-cardin" data-testid="flash-reveal-back">
        {topBar}<div className="flash-rule" />
        {!card.freeText && <Payoff correct={verdict} combo={p.combo} basePoints={basePoints} />}
        <p className="flash-compare-label">Findings</p>
        <p className="flash-model flash-model-big">{card.explanation}</p>
        {needsReason && p.reasonNote && (
          <p className="flash-reason-note" data-testid="flash-reason-note">{p.reasonNote}</p>
        )}
        {card.freeText ? (
          <div className="flash-selfmark">
            <button type="button" className="flash-mark-miss" disabled={!ready} onClick={() => selfMark(false)}>Missed it</button>
            <button type="button" className="flash-mark-got" disabled={!ready} onClick={() => selfMark(true)}>Got it</button>
          </div>
        ) : nextBtn}
      </div>
    </div>
  );

  if (card.freeText) {
    return (
      <div className={`flash-card${revealed && verdict ? " is-right" : ""}${revealed ? " is-flipped" : ""}`}>
        <div className="flash-lift">
        <div className="flash-flip">
          <div className="flash-face is-front">
            <div className="flash-cardin">
              {topBar}<div className="flash-rule" /><p className="flash-kicker">recall</p>
              <p className="flash-q">{card.stem}</p>
              {!checked && (
                <button type="button" className="flash-advance flash-reveal-btn"
                  data-testid="flash-reveal" onClick={showAnswerFree}>Show answer</button>
              )}
            </div>
          </div>
          {backFace}
        </div>
        </div>
        <span className="flash-boost" aria-hidden />
        {charging && <ChargeBeat onComplete={onCharged} />}
      </div>
    );
  }

  return (
    <div className={`flash-card${revealed && verdict ? " is-right" : ""}${revealed ? " is-flipped" : ""}`}>
      <div className={`flash-lift${revealed ? (verdict ? " is-boost" : " is-spin") : ""}`}>
      <div className="flash-flip">
        <div className="flash-face is-front">
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

            {/* Reflection card — reason first; the reveal is gated behind it. */}
            {checked && needsReason && !charging && !revealed && (
              <div className="flash-reason">
                <p className={`flash-verdict ${verdict ? "is-right" : "is-wrong"}`}>{verdict ? "signal locked" : "review this one"}</p>
                <p className="flash-compare-label">Your reasoning first</p>
                <textarea className="flash-reason-box" data-testid="flash-reason" rows={2}
                  maxLength={MAX_REASON_CHARS} value={reasoning} autoFocus
                  placeholder="In a sentence, why? (we'll review it — optional)"
                  onChange={(e) => setReasoning(e.target.value.slice(0, MAX_REASON_CHARS))} />
                <button type="button" className="flash-advance flash-reveal-btn"
                  data-testid="flash-reveal-model" onClick={revealModel}>
                  Charge reveal &rarr;
                </button>
              </div>
            )}
          </div>
        </div>
        {backFace}
      </div>
      </div>
      <span className={`flash-boost${revealed && verdict ? " is-pop" : ""}`} aria-hidden />
      {charging && <ChargeBeat onComplete={onCharged} />}
    </div>
  );
}
