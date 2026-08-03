"use client";
/* Your standing — the ladder, the goal, the clock and the rules, as ONE card.

   Rebuilt twice. The first pass (2026-08-03) fixed the CONTENT: "the league tiers are unclear
   and do not make sense to users" traced to three causes — every rung painted the same gold,
   nothing saying where you were on the ladder, and nothing anywhere defining what a division
   IS. Metals, states and the explainer below fixed all three and are unchanged.

   The second pass fixes the FORM. That version rendered five bordered boxes, a meta row, a
   stakes sentence and a help pill as four separate centred islands; with the title and the
   chase number above them the reader scrolled past eight stacked islands — ~430px — before a
   single rank appeared. league_assert now holds the header to a chrome budget measured off the
   live layout, so this cannot creep back.

   What changed structurally:
   · the five boxes became a TRACK — crests threaded on a rail that fills up to the division
     you hold. Five bordered boxes said "five buttons"; a filled rail says "a ladder, and you
     are on rung two". The fill is driven by --dv-step, set from `division`.
   · the chase number moved INSIDE this card, beside the stakes sentence it explains. They were
     always one thought ("1,550 to go" / "top 7 advance to Gold") split across two islands.
   · the redundant "Silver division" line is gone. The lit rung is labelled and says "You are
     here" — restating it in prose underneath was a whole row spent on nothing.

   The countdown is real Singapore time, not the viewer's. The server closes the week on the
   SGT Monday boundary (tools/shared/clock.py), so a local countdown would be up to 15 hours
   wrong — on a Sunday night that is the difference between "still time" and "already over".
   msToWeekClose does the conversion; see league.ts. */
import { useEffect, useState, type CSSProperties } from "react";
import {
  countdownLabel, msToWeekClose, nextDivisionName, DIVISION_NAMES, TOP_DIVISION,
} from "@/aurora/leaderboard/league";
import type { Chase } from "@/aurora/leaderboard/league";
import { Crest, Lock, METALS } from "./Metals";
import { ChaseStat } from "./ChaseStat";

export function DivisionStrip({
  division, divisionName, promoteCount, chase,
}: {
  division: number;
  divisionName: string;
  promoteCount: number;
  chase: Chase;
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
    <section className="dv" data-testid="division-strip" aria-label="Your standing">
      {/* The ladder. --dv-step is how many rungs are behind you, which is what the rail fills
          to; the crests sit at 10/30/50/70/90% of the row, so the rail spans 10%→90%. */}
      <ol
        className="dv-rungs"
        style={{ "--dv-step": String(Math.max(0, division - 1)) } as CSSProperties}
        aria-label="League divisions"
      >
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
                <Crest metal={METALS[i]} size={state === "now" ? 32 : 22} dim={state === "next"} />
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

      {/* The goal: the number and the sentence that explains it, side by side. */}
      <div className="dv-goal">
        <ChaseStat chase={chase} />
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
      </div>

      <div className="dv-foot">
        {left && (
          <span className="dv-clock" data-testid="lb-reset">
            <span className="dv-dot" aria-hidden />
            Closes in {left}
          </span>
        )}
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
    </section>
  );
}
