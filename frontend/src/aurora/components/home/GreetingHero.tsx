/* GreetingHero — the warm greeting tile. The card's BASE LAYER is the ALWAYS-DEFAULT
   living Selena Veo loop, full-bleed behind a soft legibility veil; a big rotating
   teasing headline (accent word emphasised), the teasing sub, and the level-up XP bar
   layer on top (no eyebrow / CTA row — stripped 2026-07-10 for a cleaner, bigger card).
   Never a student's custom render — that lives in Studio + the leaderboard
   (Custom-Selena lock amended 2026-07-10). The default <SelenaLogo> stays mounted
   beneath as the reduced-motion / no-video fallback. Presentational; the Dashboard
   owns the greeting seed. */
import type { Greeting } from "@/aurora/lib/greeting";
import { SelenaLogo } from "@/aurora/components/SelenaLogo";
import { SelenaGreetingLoop } from "./SelenaGreetingLoop";
import { Lumen } from "@/aurora/components/Lumen";

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
}: {
  greeting: Greeting;
  level: number;
  rank: string;
  xpInLevel: number;
  xpToNext: number;
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
        <h1 data-testid="greeting">
          {pre}{i >= 0 && <em>{greeting.emphasis}</em>}{post}
        </h1>
        <p className="hm-sub">{greeting.sub}</p>

        <div className="hm-lvl">
          <div className="hm-lr">
            <b>{rank} <span>· Level {level}</span></b>
            <span className="hm-z"><Lumen size={14} /> {xpInLevel} / 500 Lumens · {xpToNext} to go</span>
          </div>
          <div className="hm-lvbar"><span style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
    </section>
  );
}
