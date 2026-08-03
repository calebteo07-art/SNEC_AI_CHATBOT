"use client";
/* The division ladder — five metals, the stakes, and the rules.

   Rebuilt 2026-08-03 on one report: "the league tiers are unclear and do not make sense to
   users". Three separate causes, all fixed here:

   1. Every rung painted the same gold, because the old rule was "division by luminance, never
      hue". A gold SILVER pill is a contradiction, so the ladder carried no information at a
      glance. Each division now wears its own metal (see Metals.tsx).
   2. Nothing said where you were or where you were going. Past rungs are now struck and
      ticked, the current one is lit and labelled "You are here", future ones are locked.
   3. Nothing anywhere on the board said what a division IS, how you entered it, or what
      promotion does — the reader had to infer the whole mechanic from a line halfway down a
      30-row list. There is now a stakes line stating it outright and a "How the league works"
      panel spelling out all five rules. (Standing rule: explain features in-UI.)

   The countdown is real Singapore time, not the viewer's. The server closes the week on the
   SGT Monday boundary (tools/shared/clock.py), so a local countdown would be up to 15 hours
   wrong — on a Sunday night that is the difference between "still time" and "already over".
   msToWeekClose does the conversion; see league.ts. */
import { useEffect, useState } from "react";
import {
  countdownLabel, msToWeekClose, nextDivisionName, DIVISION_NAMES, TOP_DIVISION,
} from "@/aurora/leaderboard/league";
import { Crest, Lock, METALS } from "./Metals";

export function DivisionStrip({
  division, divisionName, promoteCount,
}: {
  division: number;
  divisionName: string;
  promoteCount: number;
}) {
  // Starts null and fills in on the client. Rendering a clock during SSR would hydrate
  // against a different minute and mismatch; a beat of no-clock is invisible.
  const [left, setLeft] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setLeft(countdownLabel(msToWeekClose(new Date())));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const next = nextDivisionName(division);

  return (
    <div className="dv" data-testid="division-strip">
      <ol className="dv-rungs" aria-label="League divisions">
        {DIVISION_NAMES.map((name, i) => {
          const level = i + 1;
          const state = level === division ? "now" : level < division ? "past" : "next";
          return (
            <li
              key={name}
              className="dv-rung"
              data-state={state}
              data-metal={METALS[i]}
              aria-current={level === division ? "true" : undefined}
            >
              <span className="dv-crest">
                <Crest metal={METALS[i]} size={state === "now" ? 30 : 24} dim={state === "next"} />
                {/* Earned divisions are ticked and locked ones are padlocked, so the ladder is
                    legible without relying on colour alone. */}
                {state === "past" && <span className="dv-tick" aria-hidden>✓</span>}
                {state === "next" && <Lock />}
              </span>
              <span className="dv-nm">{name}</span>
              {state === "now" && <span className="dv-here">You are here</span>}
              <span className="dv-sr">
                {state === "past" ? " (earned)" : state === "now" ? " (your division)" : " (locked)"}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="dv-meta">
        <span className="dv-now">{divisionName} division</span>
        {left && (
          <span className="dv-clock" data-testid="lb-reset">
            <span className="dv-dot" aria-hidden />
            Closes in {left}
          </span>
        )}
      </p>

      {/* The stakes, in one sentence, above the fold. This is the sentence the board was
          missing: it names the number, the destination and the safety net together. */}
      <p className="dv-stakes" data-testid="lb-stakes">
        {promoteCount > 0 && next ? (
          <>
            Finish in the <strong>top {promoteCount}</strong> this week to advance to{" "}
            <strong>{next}</strong>. You can never be demoted.
          </>
        ) : division >= TOP_DIVISION ? (
          <>
            <strong>{divisionName}</strong> is the top division — there is nowhere higher to
            climb. Hold the summit.
          </>
        ) : (
          <>Earn Lumens this week to climb the {divisionName} ladder. You can never be demoted.</>
        )}
      </p>

      <details className="dv-help">
        <summary>How the league works</summary>
        <ul>
          <li>
            <strong>You&rsquo;re ranked by Lumens earned this week</strong> — not your all-time
            total. Everyone starts level again each Monday.
          </li>
          <li>
            <strong>The week closes Monday 00:00 Singapore time.</strong> The countdown above
            is the real deadline, wherever you are.
          </li>
          <li>
            <strong>The top finishers move up a division.</strong> The gold line partway down
            the board is the cut — everyone above it advances.
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
      </details>
    </div>
  );
}
