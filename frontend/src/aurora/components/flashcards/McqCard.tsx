"use client";
/* McqCard — the two-faced arcade study card. A persistent HUD (running score + streak)
   rides ABOVE the flip so it survives the reveal. Tap = instant ✓/✗ lock on the FRONT
   face (dark question header + neutral option buttons); the power meter charges, then the
   card FLIPS (CSS, .is-flipped) to the BACK face: the Payoff (PERFECT!/MISS + combo +
   score + a streak callout) over the model answer ("Explanation"). Plain cards charge
   straight after the lock; reflection cards (~1 in 5) take a one-line reason on the front
   first; free-text tutor cards "Show answer" → charge → flip → self-mark. Next is held for
   a short SETTLE after the flip. */
import { useEffect, useState, type CSSProperties } from "react";
import {
  type Flashcard, MAX_REASON_CHARS, gradeSelection, XP_CORRECT, XP_ATTEMPT,
  comboMultiplier, comboCallout,
} from "./types";
import { Icon } from "@/aurora/icons";
import { ChargeBeat } from "./ChargeBeat";
import { Payoff } from "./Payoff";
import { useFlashFx } from "./useFlashFx";

const SETTLE_MS = 850; // payoff dwell after the flip before Next/self-mark unlocks

interface Props {
  card: Flashcard; topicLabel: string; idx: number; total: number; combo: number;
  /** Running score BEFORE this card (the HUD tick-up target on reveal). */
  score: number;
  onCheck: (correct: boolean, selected: number[], reasoning: string) => void;
  onReason: (cardId: number, stem: string, text: string, model: string) => void;
  onAdvance: () => void; advanceLabel: string; reasonNote: string | null;
  /** True while the pause overlay is up — freezes the keyboard advance shortcut. */
  paused?: boolean;
}

const CoinIcon = () => (
  <svg className="flash-coin-ico" viewBox="0 0 32 32" width="19" height="19" aria-hidden>
    <circle cx="16" cy="16" r="14" fill="#ffc400" stroke="#c99a00" strokeWidth="2" />
    <circle cx="16" cy="16" r="8.5" fill="none" stroke="#c99a00" strokeWidth="2" />
  </svg>
);

export function McqCard(p: Props) {
  const { card } = p;
  const fx = useFlashFx();
  const [selected, setSelected] = useState<number[]>([]);
  const [reasoning, setReasoning] = useState("");
  const [sentReason, setSentReason] = useState(false);
  const [checked, setChecked] = useState(false);   // verdict computed, options locked
  const [verdict, setVerdict] = useState(false);
  const [charging, setCharging] = useState(false);  // power meter filling on the front
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
  // cards where a Got it / Missed it choice is required first, and never while paused
  // (the pause overlay's scrim blocks taps but not window-level key events).
  useEffect(() => {
    if (!revealed || !ready || card.freeText || p.paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); p.onAdvance(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, ready, card.freeText, p.paused, p.onAdvance]);

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

  // Score telemetry: a correct card earns base × combo multiplier; a miss banks the
  // consolation. The HUD tick-up shows the new running total once the reveal lands.
  const mult = comboMultiplier(p.combo);
  const earned = card.freeText ? 0 : (verdict ? XP_CORRECT * mult : XP_ATTEMPT);
  const shownScore = revealed ? p.score + earned : p.score;
  // Streak: ALWAYS a number 0–10 (deck is 10 cards). The fire below grows hotter as the run
  // climbs — cold → lit → blaze → inferno → max — so a long streak is loud and addictive.
  const streakNum = Math.max(0, Math.min(10, p.combo));
  const fireTier = streakNum >= 10 ? "is-max" : streakNum >= 6 ? "is-inferno"
    : streakNum >= 3 ? "is-blaze" : streakNum >= 1 ? "is-lit" : "is-cold";
  const cw = verdict ? comboCallout(p.combo) : null;

  // The persistent HUD — lives ABOVE the flip so it survives the reveal.
  const hud = (
    <div className="flash-hud" aria-hidden>
      <span className="flash-hud-l">
        <span className="flash-deckcount">Q {p.idx + 1} / {p.total}</span>
        <span className="flash-segs">{Array.from({ length: p.total }).map((_, i) =>
          <i key={i} className={i < p.idx ? "is-done" : i === p.idx ? "is-now" : ""} />)}</span>
      </span>
      <span className="flash-hud-r">
        <span className="flash-stat flash-stat-fire">
          <span className="flash-stat-k">Streak</span>
          <b className={`flash-stat-v flash-fire ${fireTier}`} style={{ "--fire": streakNum } as CSSProperties}>
            <span className="flash-flames" aria-hidden><i /><i /><i /><i /><i /></span>
            <span key={streakNum} className="flash-fire-num">{streakNum}</span>
          </b>
        </span>
        <span className="flash-stat">
          <span className="flash-stat-k">Score</span>
          <b className="flash-stat-v flash-stat-score"><CoinIcon />{shownScore}</b>
        </span>
      </span>
    </div>
  );

  // The XP meter — the charge suspense on the front face. Fills as the card charges, then
  // the card flips to the points payoff (classic-gamification framing: you're banking XP).
  const meter = (
    <div className={`flash-meter${charging ? " is-charging" : ""}`} aria-hidden>
      <div className="flash-meter-lab">
        <span>Lumens</span>
        <span className="flash-meter-stat">{charging ? "Banking…" : "Charge up"}</span>
      </div>
      <div className="flash-meter-track"><div className="flash-meter-fill" /></div>
    </div>
  );

  const nextBtn = (
    <button type="button" className="flash-advance" data-testid="flash-advance"
      disabled={!ready} onClick={advance}>
      <span>{ready ? p.advanceLabel : "hold…"}</span>
    </button>
  );

  // Back face: the boost payoff + the model answer, owned by the whole card.
  const basePoints = verdict ? XP_CORRECT : XP_ATTEMPT;
  const backFace = (
    <div className="flash-face is-back">
      <div className="flash-cardin flash-back" data-testid="flash-reveal-back">
        {!card.freeText && <Payoff correct={verdict} combo={p.combo} basePoints={basePoints} />}
        {!card.freeText && (
          <p className={`flash-callout ${verdict ? "is-right" : "is-wrong"}`}>
            {verdict
              ? (cw ? <><b>{cw.word}</b> · streak ×{p.combo}!</> : "Nice — locked in!")
              : "Missed — still +3 score, keep the run going!"}
          </p>
        )}
        <p className="flash-compare-label">Explanation</p>
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
      <div className={`flash-card${revealed && verdict ? " is-right" : ""}${revealed ? " is-flipped" : ""}${charging ? " is-charging" : ""}`}>
        {hud}
        <div className="flash-lift">
        <div className="flash-flip">
          <div className="flash-face is-front">
            <div className="flash-cardin">
              <div className="flash-qhead">
                <span className="flash-qtag"><span aria-hidden>&#9673;</span> {p.topicLabel} &middot; RECALL</span>
                <p className="flash-q">{card.stem}</p>
              </div>
              {!checked && (
                <div className="flash-foot">
                  <button type="button" className="flash-advance flash-reveal-btn"
                    data-testid="flash-reveal" onClick={showAnswerFree}>Show answer</button>
                </div>
              )}
              {meter}
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
    <div className={`flash-card${revealed && verdict ? " is-right" : ""}${revealed ? " is-flipped" : ""}${charging ? " is-charging" : ""}`}>
      {hud}
      <div className={`flash-lift${revealed ? (verdict ? " is-boost" : " is-spin") : ""}`}>
      <div className="flash-flip">
        <div className="flash-face is-front">
          <div className="flash-cardin">
            <div className="flash-qhead">
              <span className="flash-qtag">
                <span aria-hidden>&#9673;</span> {p.topicLabel}
                {card.qtype === "multi" && (
                  <span className="flash-multi" data-testid="flash-multi">
                    <span aria-hidden>&#10003;&#10003;</span> Select all
                  </span>
                )}
              </span>
              <p className="flash-q">{card.stem}</p>
            </div>

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

            {meter}
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
