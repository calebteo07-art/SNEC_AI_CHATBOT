/* Lumens vault — the twenty vision/acuity tiers a student unlocks as their LIFETIME
   Lumens (coins_earned) climb. Each is a hand-generated (Nano Banana flash) collectible
   medallion of the BASE Iris mascot (the shared mascot, never the student's custom look —
   matches the home Iris lock) inside an escalating frame: a sleepy bronze first blink →
   a crowned, winged, galaxy-irised deity. Fixed static assets in /public/brand/lumen-badges
   (the same twenty for everyone, free at runtime).

   This is the app's ONLY badge collection — the separate daily-streak vault was retired
   2026-07-29. Names deliberately avoid the streak engine's tier ladder
   (tools/gamification/streak.py TIERS), which still drives the streak card's next-tier nudge. */

export type BadgeRarity = "common" | "uncommon" | "rare" | "epic" | "mythic" | "legendary";
export type BadgeState = "collected" | "next" | "locked";

export interface LumenBadge {
  at: number;            // lifetime-Lumens threshold to unlock
  name: string;
  rarity: BadgeRarity;
  tagline: string;       // the payoff line, shown once collected
  image: string;         // generated medallion in /public/brand/lumen-badges
}

/* Gentle early (the first four land inside a week of normal use), steep late (the top
   rung is roughly six months of heavy study). Rarity spreads 4/4/4/3/3/2. */
export const LUMEN_BADGES: LumenBadge[] = [
  { at: 100,    name: "First Blink",     rarity: "common",    tagline: "Eyes open. Here we go.",                  image: "/brand/lumen-badges/first-blink.jpg" },
  { at: 300,    name: "First Light",     rarity: "common",    tagline: "The spark catches.",                      image: "/brand/lumen-badges/first-light.jpg" },
  { at: 600,    name: "Wide Awake",      rarity: "common",    tagline: "Fully open, fully in.",                   image: "/brand/lumen-badges/wide-awake.jpg" },
  { at: 1000,   name: "Clear View",      rarity: "common",    tagline: "The blur is gone.",                       image: "/brand/lumen-badges/clear-view.jpg" },
  { at: 1500,   name: "Sharp Focus",     rarity: "uncommon",  tagline: "Dialled in to the millimetre.",           image: "/brand/lumen-badges/sharp-focus.jpg" },
  { at: 2200,   name: "Keen Eye",        rarity: "uncommon",  tagline: "You spot what others scroll past.",       image: "/brand/lumen-badges/keen-eye.jpg" },
  { at: 3000,   name: "Steady Gaze",     rarity: "uncommon",  tagline: "Unblinking. Unbothered.",                 image: "/brand/lumen-badges/steady-gaze.jpg" },
  { at: 4000,   name: "20/20 Vision",    rarity: "uncommon",  tagline: "Textbook perfect. Literally.",            image: "/brand/lumen-badges/twenty-twenty.jpg" },
  { at: 5200,   name: "Crystal Lens",    rarity: "rare",      tagline: "Ground, polished, flawless.",             image: "/brand/lumen-badges/crystal-lens.jpg" },
  { at: 6600,   name: "Eagle Eye",       rarity: "rare",      tagline: "Nothing gets past you.",                  image: "/brand/lumen-badges/eagle-eye.jpg" },
  { at: 8200,   name: "Hawkeye",         rarity: "rare",      tagline: "Locked on from a mile out.",              image: "/brand/lumen-badges/hawkeye.jpg" },
  { at: 10000,  name: "Night Vision",    rarity: "rare",      tagline: "You see in the dark now. Rude.",          image: "/brand/lumen-badges/night-vision.jpg" },
  { at: 12500,  name: "Laser Focus",     rarity: "epic",      tagline: "Pinpoint. Do not stare back.",            image: "/brand/lumen-badges/laser-focus.jpg" },
  { at: 15500,  name: "Farsight",        rarity: "epic",      tagline: "Seeing the answer before the question.",  image: "/brand/lumen-badges/farsight.jpg" },
  { at: 19000,  name: "Prism Sight",     rarity: "epic",      tagline: "Every wavelength, all at once.",          image: "/brand/lumen-badges/prism-sight.jpg" },
  { at: 23000,  name: "Third Eye",       rarity: "mythic",    tagline: "Two was never going to be enough.",       image: "/brand/lumen-badges/third-eye.jpg" },
  { at: 28000,  name: "All-Seeing",      rarity: "mythic",    tagline: "Everywhere. At once. Somehow.",           image: "/brand/lumen-badges/all-seeing.jpg" },
  { at: 34000,  name: "Cosmic Gaze",     rarity: "mythic",    tagline: "Staring politely into the void.",         image: "/brand/lumen-badges/cosmic-gaze.jpg" },
  { at: 42000,  name: "Visionary",       rarity: "legendary", tagline: "A true Visionary.",                       image: "/brand/lumen-badges/visionary.jpg" },
  { at: 52000,  name: "Eye of Eternity", rarity: "legendary", tagline: "You have become sight itself.",           image: "/brand/lumen-badges/eye-of-eternity.jpg" },
];
