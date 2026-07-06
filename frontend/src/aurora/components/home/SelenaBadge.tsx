/* SelenaBadge — one collectible medallion in the streak badge shelf. The generated tier
   badge (base Iris in costume) sits in the shelf; collected badges shine + float with a
   rarity glow + a ★ seal, the next tier glows with its progress, and locked tiers are a
   greyscale mystery (earn it to reveal the art in colour). CSS-only motion. */
import type { StreakBadge } from "./streakBadges";

export type BadgeState = "collected" | "next" | "locked";

export function SelenaBadge({ badge, state, toNext = 0 }: {
  badge: StreakBadge;
  state: BadgeState;
  toNext?: number;
}) {
  const meta =
    state === "collected" ? "Collected"
    : state === "next" ? `${toNext} day${toNext === 1 ? "" : "s"} to go`
    : `Reach ${badge.at} days`;

  return (
    <li className="hm-badge" data-state={state} data-rarity={badge.rarity} title={state === "collected" ? badge.tagline : `${badge.name} · ${badge.at}-day streak`}>
      <span className="hm-badge-medal">
        {/* eslint-disable-next-line @next/next/no-img-element -- static asset, no next/image on standalone */}
        <img
          className="hm-badge-art"
          src={badge.image}
          alt={state === "locked" ? `Locked badge — reach a ${badge.at}-day streak` : `${badge.name} badge`}
          width={76}
          height={76}
          loading="lazy"
        />
        {state === "collected" && <span className="hm-badge-seal" aria-hidden>★</span>}
        {state === "locked" && <span className="hm-badge-lock" aria-hidden>🔒</span>}
      </span>
      <span className="hm-badge-name">{badge.name}</span>
      <span className="hm-badge-meta">{meta}</span>
    </li>
  );
}
