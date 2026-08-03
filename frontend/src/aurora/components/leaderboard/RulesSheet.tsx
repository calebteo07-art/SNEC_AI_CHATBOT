"use client";
/* The league rules, on demand.

   Same content the old <details> pill carried, moved off the default view. It was a labelled
   row sitting between the reader and the ranks; a game keeps its rules behind a (?) and shows
   state instead. The standing rule that every surface explains itself is unchanged — the
   explanation just isn't the first thing you read any more.

   Shares the peek sheet's scrim/panel styling and its Escape handling, so the board has one
   sheet behaviour rather than two. */
import { useEffect, useRef } from "react";

export function RulesSheet({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-scrim" data-testid="rules-sheet" onClick={onClose}>
      <div
        className="sheet" role="dialog" aria-modal="true" aria-label="How the league works"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="sheet-grip" aria-hidden />
        <h2 className="sheet-nm">How the league works</h2>
        <ul className="rules">
          <li>
            <strong>You&rsquo;re ranked by Lumens earned this week</strong> — not your all-time
            total. Everyone starts level again each Monday.
          </li>
          <li>
            <strong>The week closes Monday 00:00 Singapore time.</strong> The countdown on the
            band is the real deadline, wherever you are.
          </li>
          <li>
            <strong>The top finishers move up a division.</strong> The gold zone at the top of
            the board is the cut — everyone inside it advances.
          </li>
          <li>
            <strong>Nobody is ever demoted.</strong> A division you reach is yours to keep,
            even on a quiet week.
          </li>
          <li>
            <strong>Five divisions:</strong> Bronze → Silver → Gold → Platinum → Diamond.
            You&rsquo;re only ever ranked against people in your own division.
          </li>
        </ul>
        <button type="button" className="sheet-close" ref={closeRef} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
