"use client";
/* StationCoach — the first time a student ever opens a station, three spotlighted beats
   naming what each pane is for. Reuses the grand tour's anchor helpers (waitForElement /
   useAnchorRect) but keeps its OWN storage key: the grand tour is account-first-run, this
   is feature-first-run, and neither may gate the other. Re-openable forever from "?". */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { waitForElement, useAnchorRect } from "@/aurora/tour/useTourAnchor";
import { COACH_BEATS } from "@/aurora/lib/stationHelp";

export const STATION_COACH_KEY = "eyebot_station_coach_seen";

const PAD = 10;
const CARD_W = 320;
const GAP = 14;

export function StationCoach({ hasEyebot, onDone }: { hasEyebot: boolean; onDone: () => void }) {
  const beats = COACH_BEATS.filter((b) => !b.requiresEyebot || hasEyebot);
  const [index, setIndex] = useState(0);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const beat = beats[index];

  const advance = useCallback(() => {
    setIndex((i) => {
      if (i + 1 < beats.length) return i + 1;
      onDone();
      return i;
    });
  }, [beats.length, onDone]);

  useEffect(() => {
    let cancelled = false;
    setAnchorEl(null);
    if (!beat) return;
    waitForElement([beat.target], 4000).then((el) => { if (!cancelled) setAnchorEl(el); });
    return () => { cancelled = true; };
  }, [beat]);

  const rect = useAnchorRect(anchorEl);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onDone(); }
      else if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") { e.preventDefault(); advance(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, onDone]);

  if (!beat || typeof document === "undefined") return null;

  const spot = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null;
  // Card sits under the spotlight when it fits, else clamped into the viewport. No anchor
  // (a pane that never rendered) ⇒ centred card, so a missing target never traps the user.
  const style = spot
    ? {
        top: Math.min(spot.top + spot.height + GAP, window.innerHeight - 190),
        left: Math.max(GAP, Math.min(spot.left + spot.width / 2 - CARD_W / 2, window.innerWidth - CARD_W - GAP)),
      }
    : { top: "50%", left: `calc(50% - ${CARD_W / 2}px)` };

  const last = index === beats.length - 1;

  return createPortal(
    <div className="tour-scrim" data-testid="station-coach" data-beat={beat.id}>
      {spot && <div className="tour-spot" style={spot} aria-hidden />}
      <div className="tour-card aurora-coach-card" style={style} role="dialog" aria-modal="true" aria-label={beat.title}>
        <h2 className="tour-title">{beat.title}</h2>
        <p className="tour-body">{beat.body}</p>
        <div className="tour-foot">
          <div className="tour-dots" aria-hidden>
            {beats.map((b, i) => <i key={b.id} className={i === index ? "on" : ""} />)}
          </div>
          <button type="button" className="tour-next" data-testid="coach-next" onClick={advance}>
            {last ? "Start" : "Next →"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
