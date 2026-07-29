"use client";
/* LumenLadder — the Lumens VAULT, the app's one badge collection. Twenty vision tiers
   unlock as lifetime Lumens (coins_earned) climb: collected → next (glowing) → locked.
   Twenty medallions never fit a wrapping grid (seven rows at 390px), so the shelf scrolls
   HORIZONTALLY at every size and lands on the student's NEXT badge instead of on rung 1. */
import { useEffect, useRef } from "react";
import { LUMEN_BADGES } from "./lumenBadges";
import { LumenBadge } from "./LumenBadge";
import type { BadgeState } from "./lumenBadges";

export function LumenLadder({ current = 0 }: { current?: number }) {
  const nextAt = LUMEN_BADGES.find((b) => current < b.at)?.at ?? null;
  const collected = LUMEN_BADGES.filter((b) => current >= b.at).length;
  const shelfRef = useRef<HTMLOListElement>(null);

  /* Centre the next badge in the shelf. Deliberately NOT scrollIntoView: the vault sits
     below the fold on load, and any block-axis scrolling would yank the whole page down
     to it. Assigning scrollLeft moves the shelf and nothing else, and it's instant, so
     there's no motion to freeze under prefers-reduced-motion. */
  useEffect(() => {
    const shelf = shelfRef.current;
    const target = shelf?.querySelector<HTMLElement>('[data-state="next"]');
    if (!shelf || !target) return;
    shelf.scrollLeft = Math.max(0, target.offsetLeft - (shelf.clientWidth - target.offsetWidth) / 2);
  }, [nextAt]);

  return (
    <section className="hm-panel hm-panel--lumen" data-testid="lumen-ladder" aria-label="Lumens vault">
      <p className="hm-ph disp">
        Lumens vault
        <span className="hm-c">{collected} of {LUMEN_BADGES.length} collected</span>
      </p>
      <p className="hm-vault-note">Total Lumens ever earned - keep levelling up to collect all {LUMEN_BADGES.length} badges. Scroll the shelf to see what's ahead.</p>
      <ol className="hm-badges" ref={shelfRef} tabIndex={0} aria-label="Badge shelf">
        {LUMEN_BADGES.map((b) => {
          const state: BadgeState = current >= b.at ? "collected" : nextAt === b.at ? "next" : "locked";
          return <LumenBadge key={b.at} badge={b} state={state} toNext={b.at - current} />;
        })}
      </ol>
    </section>
  );
}
