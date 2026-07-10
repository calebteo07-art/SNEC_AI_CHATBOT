"use client";
/* Tier crest + champion crown emblems. Prefer the generated webp art
   (public/brand/tiers/*.webp — keyed Nano-Banana emblems); if an asset is
   missing, fall back to the inline SVG so the board always renders. Rendered
   inside the client leaderboard tree (mirrors <Selena>). */
import { useState } from "react";
import type { Tier } from "@/aurora/leaderboard/tiers";

export function TierCrest({ tier, size = 16 }: { tier: Tier; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <svg className="lb-crest" width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
        <path d="M6 3h12l4 6-10 12L2 9z" fill={tier.c2} />
        <path d="M6 3h12l4 6H2z" fill={tier.c1} />
      </svg>
    );
  }
  return (
    <img
      className="lb-crest"
      src={`/brand/tiers/${tier.id}.webp`}
      width={size}
      height={size}
      alt=""
      aria-hidden
      style={{ objectFit: "contain" }}
      onError={() => setBroken(true)}
    />
  );
}

export function ChampionCrown() {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <svg className="lb-crown" viewBox="0 0 48 34" aria-hidden focusable="false">
        <path d="M4 30h40l-3-19-9 8-8-14-8 14-9-8z" fill="#FDE68A" stroke="#F59E0B" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="24" cy="6" r="3" fill="#FBBF24" />
        <circle cx="5" cy="10" r="2.4" fill="#FBBF24" />
        <circle cx="43" cy="10" r="2.4" fill="#FBBF24" />
      </svg>
    );
  }
  return <img className="lb-crown" src="/brand/tiers/crown.webp" alt="" aria-hidden onError={() => setBroken(true)} />;
}
