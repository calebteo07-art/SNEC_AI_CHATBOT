"use client";
/* StationBriefing — the station's cold open. Replaces the old first-run StationCoach
   (user, 2026-07-29: the walkthrough "must be on every session"), so it has NO storage key
   at all: it plays every time a station opens, forever. That is the whole behavioural change,
   and station_assert pins it by opening a second station and expecting it back.

   Playing every time is only tolerable if it is fast and escapable, so:
     · beats auto-advance every BEAT_MS and the progress rail IS the timer readout
     · hovering the card pauses; any click or key hands control over for good (`manual`)
     · a blurred tab never burns through the beats behind the student's back
     · reduced motion drops auto-advance entirely — the same walkthrough, manually paced
     · Skip / Escape / clicking the stage leaves in one action
   shouldAutoAdvance() in stationHelp.ts owns that rule and is unit-tested; this component
   only feeds it inputs.

   Visually it is a stage, not a page dialog: the scrim goes near-black and each pane
   "ignites" out of it as the spotlight travels. Anchors reuse the grand tour's helpers. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { useReducedMotion } from "@/aurora/motion";
import { waitForElement, useAnchorRect } from "@/aurora/tour/useTourAnchor";
import { BRIEFING_BEATS, BEAT_MS, shouldAutoAdvance } from "@/aurora/lib/stationHelp";

const PAD = 10;    // spotlight padding around the anchor
const CARD_W = 340;
const CARD_H = 200; // first-paint estimate only — the real height is measured below
const GAP = 16;

export function StationBriefing({ hasEyebot, onDone }: { hasEyebot: boolean; onDone: () => void }) {
  const beats = useMemo(() => BRIEFING_BEATS.filter((b) => !b.requiresEyebot || hasEyebot), [hasEyebot]);
  const [index, setIndex] = useState(0);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [hovered, setHovered] = useState(false);
  // Sticky: once the student drives, the briefing never grabs the wheel back mid-run.
  const [manual, setManual] = useState(false);
  const [focused, setFocused] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const beat = beats[index];
  const last = index === beats.length - 1;

  const advance = useCallback(() => {
    setIndex((i) => {
      if (i + 1 < beats.length) return i + 1;
      onDone();
      return i;
    });
  }, [beats.length, onDone]);

  // Manual advance — distinct from the timer's, because it also stops the timer.
  const step = useCallback(() => { setManual(true); advance(); }, [advance]);
  const skip = useCallback(() => { setManual(true); onDone(); }, [onDone]);

  // Resolve this beat's anchor. A pane that never rendered ⇒ centred card, so a missing
  // target degrades instead of trapping the student behind a scrim.
  useEffect(() => {
    let cancelled = false;
    setAnchorEl(null);
    if (!beat) return;
    waitForElement([beat.target], 4000).then((el) => { if (!cancelled) setAnchorEl(el); });
    return () => { cancelled = true; };
  }, [beat]);

  const rect = useAnchorRect(anchorEl);

  // Measure the card rather than assuming CARD_H: beats wrap to different line counts, and a
  // stale estimate made the "does it fit above?" test lie — the card then clamped onto its
  // own spotlight. Guarded by the 1px epsilon so it settles in one extra frame.
  const [cardH, setCardH] = useState(CARD_H);
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && Math.abs(h - cardH) > 1) setCardH(h);
  }, [index, cardH, rect]);

  useEffect(() => { cardRef.current?.focus(); }, [index]);

  useEffect(() => {
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    window.addEventListener("focus", on);
    window.addEventListener("blur", off);
    return () => { window.removeEventListener("focus", on); window.removeEventListener("blur", off); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); skip(); }
      else if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") { e.preventDefault(); step(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, skip]);

  const running = shouldAutoAdvance({ reduceMotion: reduce, hovered, manual, focused });

  // The auto-advance timer. Re-armed per beat; pausing (hover/blur) restarts this beat's
  // countdown rather than resuming mid-way — the rail restarts with it, so what the student
  // sees always matches what the timer is doing.
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(advance, BEAT_MS);
    return () => clearTimeout(t);
  }, [running, index, advance]);

  if (!beat || typeof document === "undefined") return null;

  const spot = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null;

  // Card placement: below → above → BESIDE. The beside fallback is the important one — the
  // station's panes are full-height columns, so for three of the four beats neither above
  // nor below fits, and clamping instead parks the card on top of the very pane it is
  // pointing at (it covered the patient's name and turn badge). Beside puts it over dimmed
  // stage, which is where an overlay belongs.
  let cardStyle: CSSProperties;
  if (!spot) {
    cardStyle = { top: `calc(50% - ${cardH / 2}px)`, left: `calc(50% - ${CARD_W / 2}px)` };
  } else {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clampTop = (t: number) => Math.max(GAP, Math.min(t, vh - cardH - GAP));
    const centredLeft = Math.max(GAP, Math.min(spot.left + spot.width / 2 - CARD_W / 2, vw - CARD_W - GAP));
    const below = spot.top + spot.height + GAP;
    const above = spot.top - GAP - cardH;

    if (below + cardH <= vh - GAP) {
      cardStyle = { top: below, left: centredLeft };
    } else if (above >= GAP) {
      cardStyle = { top: above, left: centredLeft };
    } else {
      const right = spot.left + spot.width + GAP;
      const left = spot.left - GAP - CARD_W;
      const beside = right + CARD_W <= vw - GAP ? right : left >= GAP ? left : centredLeft;
      cardStyle = { top: clampTop(spot.top + spot.height / 2 - cardH / 2), left: beside };
    }
  }

  return createPortal(
    <div
      className={`tour-scrim sbrief${spot ? "" : " sbrief--center"}`}
      data-testid="station-briefing"
      data-beat={beat.id}
      data-running={running ? "true" : "false"}
      onClick={skip}
    >
      {spot && <div className="tour-spot sbrief-spot" style={spot} aria-hidden />}
      <motion.div
        ref={cardRef}
        className="sbrief-card"
        style={cardStyle}
        role="dialog" aria-modal="true" aria-label={`Station walkthrough, step ${index + 1} of ${beats.length}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 10 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        transition={reduce ? { duration: 0.15 } : { type: "spring", damping: 20, stiffness: 300 }}
      >
        <div className="sbrief-live" aria-live="polite">
          <div className="sbrief-num" aria-hidden>{String(index + 1).padStart(2, "0")}</div>
          <h2 className="sbrief-title">{beat.title}</h2>
          <p className="sbrief-body">{beat.body}</p>
        </div>
        <div className="sbrief-foot">
          <div className="sbrief-rail" aria-hidden>
            {beats.map((b, i) => (
              <i
                key={b.id}
                className={i === index ? "on" : i < index ? "done" : ""}
                style={i === index ? ({ "--beat-ms": `${BEAT_MS}ms` } as CSSProperties) : undefined}
              />
            ))}
          </div>
          <button type="button" className="sbrief-skip" data-testid="briefing-skip" onClick={skip}>Skip</button>
          <button type="button" className="sbrief-next" data-testid="briefing-next" onClick={step}>
            {last ? "Start" : "Next →"}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
