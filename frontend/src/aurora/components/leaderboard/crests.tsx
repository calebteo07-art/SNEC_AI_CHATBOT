/* Tier crest + champion crown emblems. SVG now (ships keyless); the gated art task
   swaps these to generated webp with an SVG fallback. Presentational; rendered
   inside client trees (mirrors <Selena>). */
import type { Tier } from "@/aurora/leaderboard/tiers";

export function TierCrest({ tier, size = 16 }: { tier: Tier; size?: number }) {
  return (
    <svg className="lb-crest" width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M6 3h12l4 6-10 12L2 9z" fill={tier.c2} />
      <path d="M6 3h12l4 6H2z" fill={tier.c1} />
    </svg>
  );
}

export function ChampionCrown() {
  return (
    <svg className="lb-crown" viewBox="0 0 48 34" aria-hidden focusable="false">
      <path d="M4 30h40l-3-19-9 8-8-14-8 14-9-8z" fill="#FDE68A" stroke="#F59E0B" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="24" cy="6" r="3" fill="#FBBF24" />
      <circle cx="5" cy="10" r="2.4" fill="#FBBF24" />
      <circle cx="43" cy="10" r="2.4" fill="#FBBF24" />
    </svg>
  );
}
