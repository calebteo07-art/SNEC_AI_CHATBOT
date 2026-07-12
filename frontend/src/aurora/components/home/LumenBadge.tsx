/* LumenBadge — one collectible medallion in the Lumens vault shelf. Reuses the streak
   badge shelf CSS (hm-badge). Collected shines; next glows; locked is greyscale. */
import type { LumenBadge as LumenBadgeT } from "./lumenBadges";
import type { BadgeState } from "./SelenaBadge";

export function LumenBadge({ badge, state, toNext = 0 }: {
  badge: LumenBadgeT;
  state: BadgeState;
  toNext?: number;
}) {
  const meta =
    state === "collected" ? "Collected"
    : state === "next" ? `${toNext.toLocaleString()} to go`
    : `Reach ${badge.at.toLocaleString()}`;

  return (
    <li className="hm-badge" data-state={state} data-rarity={badge.rarity}
      title={state === "collected" ? badge.tagline : `${badge.name} · ${badge.at.toLocaleString()} Lumens`}>
      <span className="hm-badge-medal">
        {/* eslint-disable-next-line @next/next/no-img-element -- static asset, standalone build */}
        <img className="hm-badge-art" src={badge.image}
          alt={state === "locked" ? `Locked badge — reach ${badge.at.toLocaleString()} Lumens` : `${badge.name} badge`}
          width={76} height={76} loading="lazy" />
        {state === "collected" && <span className="hm-badge-seal" aria-hidden>★</span>}
        {state === "locked" && <span className="hm-badge-lock" aria-hidden>🔒</span>}
      </span>
      <span className="hm-badge-name">{badge.name}</span>
      <span className="hm-badge-meta">{meta}</span>
    </li>
  );
}
