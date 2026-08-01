"use client";
/* The chase — one number, given the hierarchy it deserves.

   The board this replaces buried the same information in 16px body text, which is why nobody
   below rank 3 had anything to act on. Here it is the largest thing on the page after the
   champion: how far you are from the promotion zone, or how much cushion you have over the
   student chasing you. computeChase decides which; this only renders it. */
import { useCountUp } from "@/hooks/useCountUp";
import type { Chase } from "@/aurora/leaderboard/league";

export function ChaseStat({ chase }: { chase: Chase }) {
  // Counting up to the gap makes the number feel earned. useCountUp freezes itself under
  // reduced motion, so this needs no guard of its own.
  const { ref, display } = useCountUp<HTMLSpanElement>(chase.value ?? 0);
  return (
    <div className="chase" data-testid="chase" data-kind={chase.kind}>
      {chase.value !== null && (
        <span className="chase-n" ref={ref}>{display}</span>
      )}
      <span className="chase-l">{chase.label}</span>
    </div>
  );
}
