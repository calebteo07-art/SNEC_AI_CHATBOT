/* GreetingHero — the deck's SCREEN (design-lock Home, 5th pass 2026-08-06). A rotating
   teasing headline (accent word emphasised) and the teasing sub in the flexible track, the
   living default Eyecon standing in a fixed one. Never a student's custom render — that
   lives in Studio + the leaderboard (Custom-Eyecon lock amended 2026-07-10). Presentational;
   the Dashboard owns the greeting seed.

   ⚠ THE BAKED VEO LOOP IS RETIRED, AND THE MASCOT IS THE ALPHA-CUT <EyeconLogo>. The clip
   was opaque (Veo can't emit alpha) with a baked peach→pink field, and the card's fill was
   SAMPLED off that field to hide the join — which meant the card could not be recoloured at
   all while the clip stayed. Same character, same wave: `motion="hello"` cross-fades
   iris.png → wave.webp on a ~9s beat, and both rasters carry real alpha, so the card's own
   fill shows through around her.

   ⚠ THE CARD IS A FLEX ROW, AND THAT IS LOAD-BEARING, NOT LAYOUT TASTE. She used to be
   `position:absolute` UNDERNEATH the copy (z-index 0 vs 3) — survivable only because the
   opaque clip and its veil sat between them. Against a transparent mascot, cream text
   crossing her pale skin is ~1.3:1. Two tracks make text-over-mascot impossible by
   construction at every width and height, instead of relying on the card being tall enough.
   ⚠ THE BODY MUST STAY THE FIRST CHILD — the row's order IS the reading order.

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

export function GreetingHero({ greeting }: { greeting: Greeting }) {
  // Split the title at the first occurrence of the accent word so it can be emphasised.
  const i = greeting.title.indexOf(greeting.emphasis);
  const pre = i >= 0 ? greeting.title.slice(0, i) : greeting.title;
  const post = i >= 0 ? greeting.title.slice(i + greeting.emphasis.length) : "";

  return (
    <section className="hm-greet struck-structural">
      <div className="hm-greet-body">
        <h1 data-testid="greeting">
          {pre}{i >= 0 && <em>{greeting.emphasis}</em>}{post}
        </h1>
        <p className="hm-sub">{greeting.sub}</p>
      </div>

      {/* the living default mascot — her own track, so no word can ever run under her */}
      <div className="hm-iriswrap" aria-hidden>
        <span className="hm-irisfloor" />
        <EyeconLogo motion="hello" className="hm-iris" />
      </div>
    </section>
  );
}
