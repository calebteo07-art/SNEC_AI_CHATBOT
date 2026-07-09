/* GreetingHero — the warm greeting tile: eyebrow, the big rotating teasing headline
   (accent word emphasised), the level-up XP bar, primary + "Surprise me" CTAs, and
   Iris grounded on the card surface. Presentational; the Dashboard owns the greeting
   seed and passes `onSurprise`. */
import Link from "next/link";
import type { Greeting } from "@/aurora/lib/greeting";
import { Icon } from "./HomeIcons";
import { SelenaLogo } from "@/aurora/components/SelenaLogo";
import { backdropGlow } from "@/aurora/avatar/backdrops";

export function GreetingHero({
  greeting,
  level,
  rank,
  xpInLevel,
  xpToNext,
  onSurprise,
  resumeHref,
  portraitUrl,
  background,
}: {
  greeting: Greeting;
  level: number;
  rank: string;
  xpInLevel: number;
  xpToNext: number;
  onSurprise: () => void;
  resumeHref: string;
  /** the student's transparent custom render — null/undefined → default brand mascot */
  portraitUrl?: string | null;
  background?: string;
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
        {portraitUrl ? (
          <span className="hm-selena" style={{ ["--halo" as string]: backdropGlow(background) }}>
            <span className="hm-selena-halo" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="hm-selena-img"
              src={portraitUrl}
              alt=""
              onError={(e) => { e.currentTarget.src = "/brand/iris.png"; }}
            />
          </span>
        ) : (
          <SelenaLogo motion="hello" className="hm-iris" />
        )}
      </div>
    </section>
  );
}
