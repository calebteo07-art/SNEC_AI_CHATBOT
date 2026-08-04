"use client";
/* The league rules, on demand.

   Same content the old <details> pill carried, moved off the default view. It was a labelled
   row sitting between the reader and the ranks; a game keeps its rules behind a (?) and shows
   state instead. The standing rule that every surface explains itself is unchanged — the
   explanation just isn't the first thing you read any more.

   Shares the peek sheet's scrim/panel styling and its Escape handling, so the board has one
   sheet behaviour rather than two. */
import { useEffect, useRef } from "react";
import { DIVISION_NAMES } from "@/aurora/leaderboard/league";

/** Trailing zeros make a game number look like a currency: 1.5, never 1.50. */
const mult = (n: number) => `×${Number(n ?? 1).toFixed(2).replace(/\.?0+$/, "")}`;

export function RulesSheet({
  onClose, division, multipliers,
}: {
  onClose: () => void;
  division: number;
  /** Server-sent ladder. Empty from an older server, in which case the road simply does not
   *  render — five hard-coded numbers that quietly disagree with the economy would be worse
   *  than no table at all, because this sheet is the one place a student comes to trust it. */
  multipliers: number[];
}) {
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
            <strong>The podium is the cut.</strong> Finish in the top three and you move up a
            division on Monday — the three students on the stage are the three who advance.
          </li>
          <li>
            <strong>Nobody is ever demoted.</strong> A division you reach is yours to keep,
            even on a quiet week.
          </li>
          <li>
            <strong>Five divisions:</strong> Bronze → Silver → Gold → Platinum → Diamond.
            You&rsquo;re only ever ranked against people in your own division.
          </li>
          <li>
            <strong>Every division pays more.</strong> Your division multiplies the Lumens you
            earn <em>everywhere</em> — patients, cards, the tutor, your daily check-in. Climbing
            is worth more than the badge.
          </li>
        </ul>

        {/* The road, with real numbers. Rendered from the server's ladder so this table can
            never quietly disagree with what a student is actually paid. */}
        {multipliers.length > 0 && (
          <ol className="rules-road" data-testid="multiplier-road" aria-label="What each division pays">
            {multipliers.map((m, i) => {
              const level = i + 1;
              const state = level === division ? "now" : level < division ? "past" : "next";
              return (
                <li key={DIVISION_NAMES[i] ?? level} className="rules-rung" data-state={state}>
                  <span className="rr-nm">{DIVISION_NAMES[i] ?? `Division ${level}`}</span>
                  <span className="rr-x">{mult(m)}</span>
                  {state === "now" && <span className="rr-you">You</span>}
                </li>
              );
            })}
          </ol>
        )}

        {/* Stated once, plainly, because it is the question a student will actually ask. */}
        <p className="rules-fine">
          A forfeit costs the same at every division — only what you <em>earn</em> is multiplied.
        </p>
        <button type="button" className="sheet-close" ref={closeRef} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
