/* GreetingHero — the warm greeting tile. The card's BASE LAYER is the ALWAYS-DEFAULT
   living Selena Veo loop, full-bleed behind a soft legibility veil; the eyebrow, big
   rotating teasing headline (accent word emphasised), level-up XP bar, and primary +
   "Surprise me" CTAs layer on top. Never a student's custom render — that lives in
   Studio + the leaderboard (Custom-Selena lock amended 2026-07-10). The default
   <SelenaLogo> stays mounted beneath as the reduced-motion / no-video fallback.
   Presentational; the Dashboard owns the greeting seed. */
import Link from "next/link";
import type { Greeting } from "@/aurora/lib/greeting";
import { Icon } from "./HomeIcons";
import { SelenaLogo } from "@/aurora/components/SelenaLogo";
import { SelenaGreetingLoop } from "./SelenaGreetingLoop";

/* Reviewed Veo loop installed at /media/loops/greeting-selena.mp4 (plan Task 9).
   The opaque baked-bg tile overlays the CSS-alive SelenaLogo, which stays beneath
   as the always-present fallback (null under reduced-motion / save-data / error). */
const GREETING_LOOP = true;

export function GreetingHero({
  greeting,
  level,
  rank,
  xpInLevel,
  xpToNext,
  onSurprise,
  resumeHref,
}: {
  greeting: Greeting;
  level: number;
  rank: string;
  xpInLevel: number;
  xpToNext: number;
  onSurprise: () => void;
  resumeHref: string;
}) {
  // Split the title at the first occurrence of the accent word so it can be emphasised.
  const i = greeting.title.indexOf(greeting.emphasis);
  const pre = i >= 0 ? greeting.title.slice(0, i) : greeting.title;
  const post = i >= 0 ? greeting.title.slice(i + greeting.emphasis.length) : "";
  const pct = Math.max(0, Math.min(100, Math.round((xpInLevel / 500) * 100)));

  return (
    <section className="hm-greet">
      {/* base layer: full-bleed Veo loop + soft legibility veil. The default
         <SelenaLogo> stays mounted (bottom-right, beneath the clip) as the
         reduced-motion / no-video fallback — and to satisfy the greeting harness. */}
      <SelenaGreetingLoop available={GREETING_LOOP} />
      <div className="hm-greet-veil" aria-hidden />
      <div className="hm-iriswrap" aria-hidden>
        <span className="hm-irisfloor" />
        <SelenaLogo motion="hello" className="hm-iris" />
      </div>

      <div className="hm-greet-body">
        <span className="hm-eyebrow"><Icon name="eye" /> {greeting.eyebrow}</span>
        <h1 data-testid="greeting">
          {pre}{i >= 0 && <em>{greeting.emphasis}</em>}{post}
        </h1>
        <p className="hm-sub">{greeting.sub}</p>

        <div className="hm-lvl">
          <div className="hm-lr">
            <b>{rank} <span>· Level {level}</span></b>
            <span className="hm-z">{xpInLevel} / 500 XP · {xpToNext} to go</span>
          </div>
          <div className="hm-lvbar"><span style={{ width: `${pct}%` }} /></div>
        </div>

        <div className="hm-cta-row">
          <Link href={resumeHref} className="hm-btn primary">
            Pick up where you left off <Icon name="arrow" />
          </Link>
          <button type="button" className="hm-btn ghost" onClick={onSurprise}>
            <Icon name="refresh" /> Surprise me
          </button>
          <Link href="/studio" className="hm-btn ghost" data-testid="edit-selena">
            <Icon name="eye" /> Edit Selena
          </Link>
        </div>
        <div className="hm-reshuffle"><Icon name="refresh" /> a new hello every visit</div>
      </div>
    </section>
  );
}
