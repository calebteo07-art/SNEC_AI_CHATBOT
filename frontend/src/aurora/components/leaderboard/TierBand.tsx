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

     [crest]  SILVER League   ×1 ×1.1 ×1.25 ×1.5 ×2      [×1.1 LUMENS]  (?)
     1,550 Lumens to the promotion zone            Promote → Gold pays ×1.25

   The band wears the division's metal, so climbing visibly re-skins the top of the page. That
   is the reward the old white card could not pay: every division looked identical.

   The rules did not disappear — they moved behind the (?) into a sheet, which is where a game
   puts them. Nothing on the default view explains itself in sentences.

   SIXTH PASS (2026-08-04), from "make the lumens multiplier more obvious, instead of just in
   the question mark popups". Three changes, and they are one idea: the reason to climb was
   only readable behind a (?).
     · every rung of the road states what it PAYS, not just where you are on it;
     · the multiplier is a two-line module rather than a 44x22 chip — a value with its unit,
       because "×1.1" alone reads as a score bonus rather than as a rate on everything;
     · the readout carries the HOOK, which is the payoff of the mechanic the chase describes.

   ⚠ THE CLOCK LEFT THIS COMPONENT and now sits on the podium deck (2026-08-04). Its state
   lives in Leaderboard.tsx and arrives here as nothing at all — the deck's right flank was
   dead space and the band's readout had gained a third item. The SGT rule is unchanged and
   still load-bearing: the server closes the week on the Singapore Monday boundary
   (tools/shared/clock.py), so a viewer-local countdown is up to 15 hours wrong, which on a
   Sunday night is the difference between "still time" and "already over". */
import type { CSSProperties } from "react";
import { nextRungPayoff, DIVISION_NAMES, TOP_DIVISION } from "@/aurora/leaderboard/league";
import type { Chase } from "@/aurora/leaderboard/league";
import { useCountUp } from "@/hooks/useCountUp";
import { Crest, METALS } from "./Metals";

/** Trailing zeros make a game number look like a currency: ×1.5, never ×1.50. The rules
 *  sheet formats the same way — one rule, stated in both places it is read. */
const mult = (n: number) => `×${Number(n ?? 1).toFixed(2).replace(/\.?0+$/, "")}`;

export function TierBand({
  division, divisionName, multiplier, multipliers, chase, onRules,
}: {
  division: number;
  divisionName: string;
  /** What this division PAYS, straight from the server. A multiplier a student cannot see
   *  is not a reward, it is an accounting detail — so it sits in the band beside the name
   *  it belongs to, not only in the rules sheet. */
  multiplier: number;
  /** The whole road, same payload, same list in tools/gamification/league.py. Drives both the
   *  per-rung labels and the next-rung hook, so neither can disagree with the other or with
   *  what the server actually pays. Empty from an older server: the rungs simply stay bare. */
  multipliers: number[];
  chase: Chase;
  onRules: () => void;
}) {
  // Counting up to the gap makes the number feel earned. useCountUp freezes itself under
  // reduced motion, so this needs no guard of its own.
  const { ref, display } = useCountUp<HTMLSpanElement>(chase.value ?? 0);
  const idx = Math.max(0, Math.min(TOP_DIVISION - 1, division - 1));
  // null at the summit and on an older server that sends no road — the hook falls back to
  // stating the ceiling rather than inventing a rung above Diamond.
  const payoff = nextRungPayoff(division, multipliers);

  return (
    <section className="tb" data-metal={METALS[idx]} data-testid="tier-band" aria-label="Your division">
      <div className="tb-head">
        <span className="tb-crest"><Crest metal={METALS[idx]} size={38} /></span>
        <h1 className="tb-name">{divisionName} <span className="tb-league">League</span></h1>

        {/* The track. Locked divisions still show their own metal, at low opacity — a trophy
            road that hides what is ahead of you is not a road. The three states differ by
            OPACITY and SIZE as well as hue, so the ladder never depends on colour alone. */}
        {/* THE ROAD. It was five 8px dots — a progress track that said which rung you were on
            and nothing about why the next one is worth reaching. Each rung now states what it
            PAYS, which is the whole reason to climb and was previously readable only inside
            the (?) sheet.
            ⚠ The metal stays on .tb-pip itself, never on the label: league_assert samples the
            five rungs as PAINT, and a fill moved onto a child would pass the "five distinct
            metals" check on five grey pips. */}
        {/* --road is how far along the route you are, as a fraction of the whole ladder. It
            drives the rail's filled length at the widest tier, where the road spreads across
            the band; every narrower tier ignores it. Derived from `division` rather than from
            the pips' own states so the two can never disagree. */}
        <ol
          className="tb-pips" aria-label="League divisions"
          style={{ "--road": `${(idx / Math.max(1, TOP_DIVISION - 1)) * 100}%` } as CSSProperties}
        >
          {DIVISION_NAMES.map((name, i) => {
            const level = i + 1;
            const state = level === division ? "now" : level < division ? "past" : "next";
            const pay = multipliers[i];
            return (
              <li
                key={name} className="tb-pip" data-metal={METALS[i]} data-state={state}
                aria-current={state === "now" ? "true" : undefined}
              >
                <span className="tb-sr">
                  {name}
                  {state === "past" ? " (earned)" : state === "now" ? " (your division)" : " (locked)"}
                  {typeof pay === "number" ? `, pays ${mult(pay)} Lumens` : ""}
                </span>
                {typeof pay === "number" && <span className="tb-px" aria-hidden>{mult(pay)}</span>}
              </li>
            );
          })}
        </ol>

        {/* What the tier PAYS, as the loudest object in the head after the name itself. It was
            a 44x22 chip, which is the size you give an accounting detail rather than a reward
            — and "make the lumens multiplier more obvious" was the report. Formatted here
            rather than server-side because it is a display decision. */}
        <span className="tb-mult" data-testid="tier-multiplier">
          <span className="tb-sr">This division earns </span>
          <span className="tb-mult-n">{mult(multiplier)}</span>
          <span className="tb-mult-l" aria-hidden>Lumens</span>
          <span className="tb-sr"> Lumens on everything you do</span>
        </span>

        <button
          type="button" className="tb-help" onClick={onRules}
          aria-label="How the league works"
        >
          <span aria-hidden>?</span>
        </button>
      </div>

      {/* The readout strip: the one number worth acting on, what acting on it PAYS, and the
          deadline both run against. */}
      <div className="tb-readout">
        <p className="tb-chase" data-testid="chase" data-kind={chase.kind}>
          {chase.value !== null && <span className="chase-n" ref={ref}>{display}</span>}
          <span className="chase-l">{chase.label}</span>
        </p>

        {/* THE HOOK. The board already said what to do; this says what it is worth, in the
            same glance. Deliberately worded without a count — "promote" stays true whether
            the cut is three students or, in a cohort of two, one. */}
        <p className="tb-hook" data-testid="tier-hook">
          {payoff
            ? <><span className="tb-hook-do"><b>Promote</b> → </span>{payoff.name} pays {payoff.mult}</>
            : <><b>{divisionName}</b> pays {mult(multiplier)} — the ceiling</>}
        </p>
      </div>
    </section>
  );
}
