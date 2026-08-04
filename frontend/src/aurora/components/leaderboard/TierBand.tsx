"use client";
/* The tier band — the head of the board, as a HUD.

   Replaces DivisionStrip, which was a white card holding a five-box ladder, a 38px numeral, a
   two-sentence stakes paragraph, a countdown and a "How it works" disclosure. That card plus
   the podium under it put the first ranked row ~700px down a 844px phone: a ladder screen
   where you could not see the ladder. The report was "very obvious ai slop, and did not seem
   like a game leaderboard", and this is the half of the fix that is about the HEAD.

   What a competitive ladder puts at the top — Duolingo Leagues, trophy roads, ranked queues —
   is an EMBLEM, a TIER NAME, a progress track and a clock, on a band that is made of the tier's
   own material. Not prose. Two rows, ~100px:

     [crest]  SILVER League   • • ○ ○ ○                    (?)
     1,550 Lumens to the promotion zone          Closes in 6d 7h

   The band wears the division's metal, so climbing visibly re-skins the top of the page. That
   is the reward the old white card could not pay: every division looked identical.

   The rules did not disappear — they moved behind the (?) into a sheet, which is where a game
   puts them. Nothing on the default view explains itself in sentences.

   The countdown is real Singapore time, not the viewer's. The server closes the week on the
   SGT Monday boundary (tools/shared/clock.py), so a local countdown would be up to 15 hours
   wrong — on a Sunday night that is the difference between "still time" and "already over".
   msToWeekClose does the conversion; see league.ts. */
import { useEffect, useState } from "react";
import { countdownLabel, msToWeekClose, DIVISION_NAMES, TOP_DIVISION } from "@/aurora/leaderboard/league";
import type { Chase } from "@/aurora/leaderboard/league";
import { useCountUp } from "@/hooks/useCountUp";
import { Crest, METALS } from "./Metals";

export function TierBand({
  division, divisionName, multiplier, chase, onRules,
}: {
  division: number;
  divisionName: string;
  /** What this division PAYS, straight from the server. A multiplier a student cannot see
   *  is not a reward, it is an accounting detail — so it sits in the band beside the name
   *  it belongs to, not only in the rules sheet. */
  multiplier: number;
  chase: Chase;
  onRules: () => void;
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

  // Counting up to the gap makes the number feel earned. useCountUp freezes itself under
  // reduced motion, so this needs no guard of its own.
  const { ref, display } = useCountUp<HTMLSpanElement>(chase.value ?? 0);
  const idx = Math.max(0, Math.min(TOP_DIVISION - 1, division - 1));

  return (
    <section className="tb" data-metal={METALS[idx]} data-testid="tier-band" aria-label="Your division">
      <div className="tb-head">
        <span className="tb-crest"><Crest metal={METALS[idx]} size={38} /></span>
        <h1 className="tb-name">{divisionName} <span className="tb-league">League</span></h1>

        {/* The track. Locked divisions still show their own metal, at low opacity — a trophy
            road that hides what is ahead of you is not a road. The three states differ by
            OPACITY and SIZE as well as hue, so the ladder never depends on colour alone. */}
        <ol className="tb-pips" aria-label="League divisions">
          {DIVISION_NAMES.map((name, i) => {
            const level = i + 1;
            const state = level === division ? "now" : level < division ? "past" : "next";
            return (
              <li
                key={name} className="tb-pip" data-metal={METALS[i]} data-state={state}
                aria-current={state === "now" ? "true" : undefined}
              >
                <span className="tb-sr">
                  {name}
                  {state === "past" ? " (earned)" : state === "now" ? " (your division)" : " (locked)"}
                </span>
              </li>
            );
          })}
        </ol>

        {/* What the tier PAYS. Formatted here rather than server-side because this is a
            display decision: 1.25 reads as "×1.25" and 1.5 must read as "×1.5", not
            "×1.50" — trailing zeros make a game number look like a currency. */}
        <span className="tb-mult" data-testid="tier-multiplier">
          <span className="tb-sr">This division earns </span>
          ×{Number(multiplier ?? 1).toFixed(2).replace(/\.?0+$/, "")}
          <span className="tb-sr"> Lumens on everything you do</span>
        </span>

        <button
          type="button" className="tb-help" onClick={onRules}
          aria-label="How the league works"
        >
          <span aria-hidden>?</span>
        </button>
      </div>

      {/* The readout strip: the one number worth acting on, and the deadline it runs against. */}
      <div className="tb-readout">
        <p className="tb-chase" data-testid="chase" data-kind={chase.kind}>
          {chase.value !== null && <span className="chase-n" ref={ref}>{display}</span>}
          <span className="chase-l">{chase.label}</span>
        </p>
        {left && (
          <span className="tb-clock" data-testid="lb-reset">
            <span className="tb-dot" aria-hidden />
            Closes in {left}
          </span>
        )}
      </div>
    </section>
  );
}
