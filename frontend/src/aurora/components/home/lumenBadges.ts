/* Lumens vault — the six light/wealth tiers a student unlocks as their LIFETIME Lumens
   (coins_earned) climb. Sibling vibe to the streak badges (which are vision-acuity themed);
   these are Eyecon/Iris getting progressively more radiant + rich in golden light.
   Static generated medallions in /public/brand/lumen-badges (same six for everyone). */
import type { BadgeRarity } from "./streakBadges";

export interface LumenBadge {
  at: number;            // lifetime-Lumens threshold to unlock
  name: string;
  rarity: BadgeRarity;
  tagline: string;
  image: string;
}

export const LUMEN_BADGES: LumenBadge[] = [
  { at: 250,   name: "Spark",          rarity: "common",    tagline: "A tiny gleam. Eyecon approves.",   image: "/brand/lumen-badges/spark.jpg" },
  { at: 1000,  name: "Glimmer",        rarity: "uncommon",  tagline: "Ooh, shiny. Keep 'em coming.",     image: "/brand/lumen-badges/glimmer.jpg" },
  { at: 2500,  name: "Glow-Up",        rarity: "rare",      tagline: "You're literally glowing now.",    image: "/brand/lumen-badges/glow-up.jpg" },
  { at: 6000,  name: "Floodlight",     rarity: "epic",      tagline: "Blindingly bright. Shades on.",    image: "/brand/lumen-badges/floodlight.jpg" },
  { at: 12000, name: "Blaze of Glory", rarity: "mythic",    tagline: "Certified radiant. A whole vibe.", image: "/brand/lumen-badges/blaze.jpg" },
  { at: 25000, name: "Supernova",      rarity: "legendary", tagline: "You have become light itself.",    image: "/brand/lumen-badges/supernova.jpg" },
];
