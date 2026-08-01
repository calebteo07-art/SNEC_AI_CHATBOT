"use client";
/* The division ladder + the clock.

   Five rungs, the current one lit. This is the only place on the board where a colour other
   than gold appears, and it earns it: the rungs ARE the metals, and seeing four unlit ones
   above you is the whole reason to care about Monday.

   The countdown is real Singapore time, not the viewer's. The server closes the week on the
   SGT Monday boundary (tools/shared/clock.py), so a local countdown would be up to 15 hours
   wrong — on a Sunday night that is the difference between "still time" and "already over".
   msToWeekClose does the conversion; see league.ts. */
import { useEffect, useState } from "react";
import { countdownLabel, msToWeekClose, DIVISION_NAMES } from "@/aurora/leaderboard/league";

const ABBR = ["BRZ", "SLV", "GLD", "PLT", "DIA"];

export function DivisionStrip({ division, divisionName }: { division: number; divisionName: string }) {
  // Starts null and fills in on the client. Rendering a clock during SSR would hydrate
  // against a different minute and mismatch; a beat of no-clock is invisible.
  const [left, setLeft] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setLeft(countdownLabel(msToWeekClose(new Date())));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

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
              data-metal={name.toLowerCase()}
              aria-current={level === division ? "true" : undefined}
            >
              <span className="dv-full">{name}</span>
              <span className="dv-abbr" aria-hidden>{ABBR[i]}</span>
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
    </div>
  );
}
