/* GreetingHero — the deck's HOST PANEL. The card's BASE LAYER is the ALWAYS-DEFAULT
   living Eyecon Veo loop, full-bleed behind a soft legibility veil; a rotating teasing
   headline (accent word emphasised) and the teasing sub layer on top.
   Never a student's custom render — that lives in Studio + the leaderboard
   (Custom-Eyecon lock amended 2026-07-10). The default <EyeconLogo> stays mounted
   beneath as the reduced-motion / no-video fallback. Presentational; the Dashboard
   owns the greeting seed.

   ⚠ THE LEVEL / XP READOUT LEFT THIS CARD when the card moved onto the deck: the status
   bar above it renders the SAME four numbers (level, rank, XP into level, XP to next),
   and two readouts of one number are two chances to disagree. It took the <Lumen> coin
   with it — the coin's specular ellipse carries an SVG `transform="rotate(-32 …)"`, which
   getComputedStyle reports as a rotation matrix, and the deck's geometry bound fails
   anything inside `.hm-deck` that rotates its own box (a rotated square reports a bounding
   rect up to 1.41x its width and escapes an overflow sweep even under overflow:hidden).
   That is why StatusBar / QuestBoard / ChestTile / RankStrip all carry the same warning. */
import type { Greeting } from "@/aurora/lib/greeting";
import { EyeconLogo } from "@/aurora/components/EyeconLogo";
import { EyeconGreetingLoop } from "./EyeconGreetingLoop";

/* Reviewed Veo loop installed at /media/loops/greeting-selena.mp4 (plan Task 9).
   The opaque baked-bg tile overlays the CSS-alive EyeconLogo, which stays beneath
   as the always-present fallback (null under reduced-motion / save-data / error). */
const GREETING_LOOP = true;

export function GreetingHero({ greeting }: { greeting: Greeting }) {
  // Split the title at the first occurrence of the accent word so it can be emphasised.
  const i = greeting.title.indexOf(greeting.emphasis);
  const pre = i >= 0 ? greeting.title.slice(0, i) : greeting.title;
  const post = i >= 0 ? greeting.title.slice(i + greeting.emphasis.length) : "";

  return (
    <section className="hm-greet">
      {/* base layer: full-bleed Veo loop + soft legibility veil. The default
         <EyeconLogo> stays mounted (bottom-right, beneath the clip) as the
         reduced-motion / no-video fallback — and to satisfy the greeting harness. */}
      <EyeconGreetingLoop available={GREETING_LOOP} />
      <div className="hm-greet-veil" aria-hidden />
      <div className="hm-iriswrap" aria-hidden>
        <span className="hm-irisfloor" />
        <EyeconLogo motion="hello" className="hm-iris" />
      </div>

      <div className="hm-greet-body">
        <h1 data-testid="greeting">
          {pre}{i >= 0 && <em>{greeting.emphasis}</em>}{post}
        </h1>
        <p className="hm-sub">{greeting.sub}</p>
      </div>
    </section>
  );
}
