/* GreetingHero — the deck's SCREEN (design-lock Home, 7th pass 2026-08-06). A rotating
   teasing headline (accent word emphasised) and the teasing sub, laid over a generated shot
   of four Eyecon friends at a picnic. Never a student's custom render — that lives in Studio
   + the leaderboard (Custom-Eyecon lock amended 2026-07-10). Presentational; the Dashboard
   owns the greeting seed.

   ⚠ THE WHOLE CARD IS THE CLIP NOW, AND THE SINGLE <EyeconLogo> IS GONE. Passes 4→5→6 went
   baked-loop → alpha-cut mascot on a peach fill → alpha-cut mascot on periwinkle; the ask
   here was a moving GROUP ("a group of friends of eyecons moving … the whole card to be
   generated on veo"), and four mascots at picnic scale cannot be four alpha-cut rasters
   composited over a fill — they are one shot. `greeting-crew.mp4` is that shot: the outfits
   (striped scarf, orange beanie, brown hoodie, round specs) are baked, and identity comes
   from generating the conditioning still with the real iris.png as a reference part before
   Veo ever saw it (tools/media/greeting_loop.py).

   ⚠ THE COPY IS NO LONGER PROTECTED BY STRUCTURE, SO DO NOT WIDEN IT. The 5th pass made the
   card two flex tracks precisely so that no word could reach the mascot at any width — a
   guarantee a full-bleed backdrop cannot offer. What replaces it is measurement: the shot is
   composed with its top half empty, `.hm-greet::before` lifts the one strip where the copy
   leaves the sky, and the h1/sub max-widths keep both lines inside the x-range those ratios
   were sampled over. All three are load-bearing together; changing one alone re-opens
   dark-text-on-pale-skin at ~1.3:1.

   ⚠ THE VIDEO MUST STAY THE FIRST CHILD AND aria-hidden. It is decorative and out of the tab
   order, so the reading order is still headline → sub, exactly as when the copy was first.
   `muted` + `playsInline` are what let it autoplay at all (iOS refuses inline playback
   without the latter); the installed clip carries no audio track to mute.

   ⚠ THE LEVEL / XP READOUT LEFT THIS CARD when the card moved onto the deck: the status
   bar above it renders the SAME four numbers (level, rank, XP into level, XP to next),
   and two readouts of one number are two chances to disagree. It took the <Lumen> coin
   with it — the coin's specular ellipse carries an SVG `transform="rotate(-32 …)"`, which
   getComputedStyle reports as a rotation matrix, and the deck's geometry bound fails
   anything inside `.hm-deck` that rotates its own box (a rotated square reports a bounding
   rect up to 1.41x its width and escapes an overflow sweep even under overflow:hidden).
   That is why StatusBar / QuestBoard / ChestTile / RankStrip all carry the same warning. */
import type { Greeting } from "@/aurora/lib/greeting";

const LOOP_SRC = "/media/loops/greeting-crew.mp4";
const LOOP_POSTER = "/media/loops/greeting-crew.jpg";

export function GreetingHero({ greeting }: { greeting: Greeting }) {
  // Split the title at the first occurrence of the accent word so it can be emphasised.
  const i = greeting.title.indexOf(greeting.emphasis);
  const pre = i >= 0 ? greeting.title.slice(0, i) : greeting.title;
  const post = i >= 0 ? greeting.title.slice(i + greeting.emphasis.length) : "";

  return (
    <section className="hm-greet struck-structural">
      {/* the card's own surface: the crew loop, full-bleed under the scrim and the copy */}
      <video
        className="hm-greetvid"
        data-testid="greet-loop"
        src={LOOP_SRC}
        poster={LOOP_POSTER}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        tabIndex={-1}
        aria-hidden
      />

      <div className="hm-greet-body">
        <h1 data-testid="greeting">
          {pre}{i >= 0 && <em>{greeting.emphasis}</em>}{post}
        </h1>
        <p className="hm-sub">{greeting.sub}</p>
      </div>
    </section>
  );
}
