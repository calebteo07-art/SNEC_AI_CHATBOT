/* GreetingHero — the warm greeting tile: eyebrow, the big rotating teasing headline
   (accent word emphasised), the level-up XP bar, primary + "Surprise me" CTAs, and
   the ALWAYS-DEFAULT living Selena mascot grounded on the card surface (never a
   student's custom render — that lives in Studio + the leaderboard; Custom-Selena
   lock amended 2026-07-10). Presentational; the Dashboard owns the greeting seed. */
import Link from "next/link";
import type { Greeting } from "@/aurora/lib/greeting";
import { Icon } from "./HomeIcons";
import { SelenaLogo } from "@/aurora/components/SelenaLogo";
import { SelenaGreetingLoop } from "./SelenaGreetingLoop";

/* Flip to `true` once a reviewed Veo loop is installed at
   /media/loops/greeting-selena.mp4 (plan Task 9). Until then the mascot is the
   CSS-alive SelenaLogo. */
const GREETING_LOOP = false;

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

      <div className="hm-iriswrap" aria-hidden>
        <span className="hm-irisfloor" />
        <SelenaGreetingLoop available={GREETING_LOOP} />
        <SelenaLogo motion="hello" className="hm-iris" />
      </div>
    </section>
  );
}
