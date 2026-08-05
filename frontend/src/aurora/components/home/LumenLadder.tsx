"use client";
/* LumenLadder — the Lumens VAULT, the app's one badge collection. Twenty vision tiers
   unlock as lifetime Lumens (coins_earned) climb: collected → next (glowing) → locked.
   The shelf is a PAGED FRAME: exactly five medallions are on show at a time and the
   ‹ › buttons step a page (20 / 5 = four clean pages). It opens on the page holding the
   student's NEXT badge, not on rung 1. Swiping still works — the frame is a real scroll
   container, so the buttons and a touch drag drive the same thing. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/aurora/motion";
import { LUMEN_BADGES } from "./lumenBadges";
import { LumenBadge } from "./LumenBadge";
import type { BadgeState } from "./lumenBadges";

const PER_FRAME = 5;
const PAGES = Math.ceil(LUMEN_BADGES.length / PER_FRAME);

export function LumenLadder({ current = 0 }: { current?: number }) {
  const nextAt = LUMEN_BADGES.find((b) => current < b.at)?.at ?? null;
  const collected = LUMEN_BADGES.filter((b) => current >= b.at).length;
  const nextIdx = nextAt === null ? -1 : LUMEN_BADGES.findIndex((b) => b.at === nextAt);

  const shelfRef = useRef<HTMLOListElement>(null);
  const [page, setPage] = useState(0);
  const reduce = useReducedMotion();

  /* One page's scroll distance, measured off the DOM rather than computed from
     clientWidth: five slots plus the five gaps between them. Deriving it from the box
     width instead drifts by one gap per page and the frame ends up half a badge off.
     ⚠ MEASURED SUB-PIXEL, via getBoundingClientRect and never offsetLeft. The slot is
     `(100% - 4*gap)/5`, so the badge pitch is fractional at any frame width that is not
     itself a whole number — and offsetLeft ROUNDS. That rounding is a per-page error that
     ACCUMULATES: on a 720.39px frame the true stride is 734.375 and offsetLeft reports
     734, so page 4 is asked for 1.125px short of its own scroll-snap point and only
     `scroll-snap-type: proximity` drags it home. Pages get further from their snap point
     the longer the shelf gets, and a pager that relies on snapping to correct its own
     arithmetic is one badge away from stopping between two pages. */
  const stride = useCallback(() => {
    const el = shelfRef.current;
    if (!el) return 0;
    const kids = el.children;
    return kids.length > PER_FRAME
      ? kids[PER_FRAME].getBoundingClientRect().left - kids[0].getBoundingClientRect().left
      : el.clientWidth;
  }, []);

  /* Open on the page holding the next badge. Assigning scrollLeft (never scrollIntoView)
     keeps this inside the frame — the vault sits below the fold on load, and any
     block-axis scrolling would yank the whole page down to it. */
  useEffect(() => {
    const el = shelfRef.current;
    if (!el) return;
    const p = nextIdx >= 0 ? Math.floor(nextIdx / PER_FRAME) : 0;
    el.scrollLeft = p * stride();
    setPage(p);
  }, [nextIdx, stride]);

  const go = (dir: -1 | 1) => {
    const el = shelfRef.current;
    if (!el) return;
    const p = Math.min(PAGES - 1, Math.max(0, page + dir));
    el.scrollTo({ left: p * stride(), behavior: reduce ? "auto" : "smooth" });
    setPage(p);
  };

  /* Keep the readout honest when the frame is swiped rather than paged. */
  const onScroll = () => {
    const el = shelfRef.current;
    const s = stride();
    if (!el || !s) return;
    const p = Math.min(PAGES - 1, Math.max(0, Math.round(el.scrollLeft / s)));
    setPage((prev) => (prev === p ? prev : p));
  };

  return (
    <section className="hm-panel hm-panel--lumen struck-structural" data-testid="lumen-ladder" aria-label="Lumens vault">
      <p className="hm-ph disp">
        Lumens vault
        <span className="hm-c">{collected} of {LUMEN_BADGES.length} collected</span>
      </p>

      <div className="hm-vaultbar">
        <p className="hm-vault-note">Total Lumens ever earned - keep levelling up to collect all {LUMEN_BADGES.length} badges.</p>
        <div className="hm-vaultpager">
          <button type="button" className="hm-vaultbtn" onClick={() => go(-1)} disabled={page === 0}
            aria-label="Previous badges" data-testid="vault-prev">‹</button>
          <span className="hm-vaultpage" data-testid="vault-page" aria-live="polite">{page + 1} / {PAGES}</span>
          <button type="button" className="hm-vaultbtn" onClick={() => go(1)} disabled={page === PAGES - 1}
            aria-label="Next badges" data-testid="vault-next">›</button>
        </div>
      </div>

      <ol className="hm-badges" ref={shelfRef} onScroll={onScroll} tabIndex={0} aria-label="Badge shelf">
        {LUMEN_BADGES.map((b) => {
          const state: BadgeState = current >= b.at ? "collected" : nextAt === b.at ? "next" : "locked";
          return <LumenBadge key={b.at} badge={b} state={state} toNext={b.at - current} />;
        })}
      </ol>
    </section>
  );
}
