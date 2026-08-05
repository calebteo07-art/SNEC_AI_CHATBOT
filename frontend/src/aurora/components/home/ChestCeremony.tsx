"use client";
/* ChestCeremony — the one moment of ceremony this app has: the chest lands, its lid bursts
   off, the drop rises, confetti.

   PRESENTATIONAL + FOCUS MANAGEMENT ONLY. It knows nothing about claiming. It is mounted
   by ChestTile from the mutation's success callback and only on `ok === true`, so the
   existence of this component IS the proof the server granted something — and `label` is
   the grant itself, read off the POST's `drop`, never off the sealed chest's payload.

   PORTALED TO <body>, deliberately. A modal nested inside the deck inherits the deck's
   stacking context, its overflow clip, and any transform on an ancestor (which would
   re-anchor `position:fixed` to that ancestor). The portal also puts every animated part of
   this ceremony structurally OUTSIDE `.hm-deck`, so the deck's rotation/overflow sweep can
   never see it. The cost is that `.aurora-home`'s custom properties do not cascade here, so
   home.css gives `.hm-cer` its own font stack and literal colours — the same self-contained
   construction ApiErrorNotice and the League's `.lr` use, and the reason a surface outside
   its screen's scope must PIN ITS FONT (an undefined font var resolves to Times).

   ⚠ NOTHING HERE ROTATES OR SKEWS — translate, scale and opacity only. Rotation is banned
   on the deck and this is the same material language; keeping the rule global means the
   ceremony stays safe wherever it is later mounted.

   ⚠ REDUCED MOTION IS AN INSTANT REVEAL, not a slower one. Every base rule in home.css is
   the FINAL state and every keyframe runs from the hidden state with `backwards` fill, so
   killing the animations (both signals) lands the chest open and the drop on screen with no
   burst and no shake. Confetti is gated below for the same reason. */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { confetti } from "@/fx/confetti";

/** Tabbable descendants, in DOM order. */
const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ChestCeremony({ label, onClose }: { label: string; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);

  /* Focus into the card, Esc closes, Tab CYCLES inside it. The house pattern (HelpButton,
     TourOverlay) pins focus to the card by swallowing Tab outright — that works when the
     card has nothing to reach, but it would make this dialog's own button unreachable by
     keyboard, so the trap wraps between the real controls instead.
     Focus RETURN is ChestTile's job: it owns the ref that survives the tile being rebuilt
     from a <button> into a spent <div>, which is exactly the node a restore captured here
     would have lost. `onClose` is stable (useCallback), so this mounts once. */
  useEffect(() => {
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const card = cardRef.current;
      if (!card) return;
      const f = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!f.length) { e.preventDefault(); card.focus(); return; }
      const first = f[0], last = f[f.length - 1];
      const active = document.activeElement;
      // The card itself counts as OUTSIDE the cycle: it is the tabIndex={-1} landing spot,
      // so the first Tab from it must enter the ring rather than leave the dialog.
      const inside = active instanceof HTMLElement && active !== card && card.contains(active);
      if (e.shiftKey) {
        if (!inside || active === first) { e.preventDefault(); last.focus(); }
      } else if (!inside || active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* Confetti closes the sequence, after the drop has risen. Gated on BOTH signals: our
     confetti() wrapper already hands the library `disableForReducedMotion`, which honours
     the OS media query — the app's own html[data-motion="reduce"] toggle is ours to check,
     and it is the same pair every other screen tests (LeagueResult, useCountUp, Payoff). */
  useEffect(() => {
    const reduce = document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setTimeout(() => {
      confetti({ particleCount: 120, spread: 78, startVelocity: 42, origin: { y: 0.42 },
                 colors: ["#F5C63F", "#DFA828", "#FFE9A8", "#FFFFFF"] });
    }, 900);
    return () => clearTimeout(t);
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="hm-cer" data-testid="chest-ceremony" role="dialog" aria-modal="true"
         aria-labelledby="hm-cer-h">
      <div className="hm-cer-scrim" onClick={onClose} aria-hidden />
      <div className="hm-cer-card" ref={cardRef} tabIndex={-1}>
        <span className="hm-cer-chest" aria-hidden>
          <span className="hm-cer-burst" />
          <span className="hm-cer-body" />
          <span className="hm-cer-lid" />
          <span className="hm-cer-lock" />
        </span>

        <div className="hm-cer-drop">
          <p className="hm-cer-eyebrow">Today&rsquo;s chest</p>
          <h2 className="hm-cer-h" id="hm-cer-h">{label}</h2>
          <p className="hm-cer-note">
            Added to your account. A new chest is sealed for you tomorrow.
          </p>
        </div>

        <button type="button" className="hm-cer-go" data-testid="chest-ceremony-go"
                onClick={onClose}>
          Nice
        </button>
      </div>
    </div>,
    document.body,
  );
}
