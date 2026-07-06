/* Streak badge collection — the six eye-themed tiers a student unlocks as their weekday
   streak climbs. Each is a hand-generated (Nano Banana flash) collectible medallion of the
   BASE Iris mascot (the shared mascot, never the student's custom look — matches the home
   Iris lock) in an escalating tier costume: humble bronze nest → cosmic rainbow-gold deity.
   Fixed static assets in /public/brand/badges (same six for everyone, free at runtime).
   Thresholds mirror the streak engine (tools/gamification/streak.py TIERS). */

export type BadgeRarity = "common" | "uncommon" | "rare" | "epic" | "mythic" | "legendary";

export interface StreakBadge {
  at: number;            // weekday-streak threshold to unlock
  name: string;
  rarity: BadgeRarity;
  tagline: string;       // the payoff line, shown once collected
  image: string;         // generated medallion in /public/brand/badges
}

export const STREAK_BADGES: StreakBadge[] = [
  { at: 3,  name: "First Light",  rarity: "common",    tagline: "Three days in — the spark catches.",   image: "/brand/badges/first-light.jpg" },
  { at: 5,  name: "Clear View",   rarity: "uncommon",  tagline: "A steady week of focus.",              image: "/brand/badges/clear-view.jpg" },
  { at: 10, name: "20/20 Vision", rarity: "rare",      tagline: "Ten days sharp. Crystal clear.",        image: "/brand/badges/twenty-twenty.jpg" },
  { at: 20, name: "Eagle Eye",    rarity: "epic",      tagline: "Twenty days. Nothing gets past you.",   image: "/brand/badges/eagle-eye.jpg" },
  { at: 30, name: "Hawkeye",      rarity: "mythic",    tagline: "Thirty days of relentless focus.",      image: "/brand/badges/hawkeye.jpg" },
  { at: 50, name: "Visionary",    rarity: "legendary", tagline: "Fifty days. A true Visionary.",         image: "/brand/badges/visionary.jpg" },
];
