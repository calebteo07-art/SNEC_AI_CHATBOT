export type Feature = "flashcards" | "tutor" | "osce";

export interface AchievementDef { id: string; title: string; subtitle: string; feature: Feature; }

export const ACHIEVEMENTS: Record<string, AchievementDef> = {
  first_deck:       { id: "first_deck",       title: "First Deck Down",    subtitle: "You cleared your very first deck.",       feature: "flashcards" },
  perfect_deck:     { id: "perfect_deck",     title: "Flawless!",          subtitle: "A perfect deck — every card correct.",    feature: "flashcards" },
  combo_godlike:    { id: "combo_godlike",    title: "GODLIKE Combo",      subtitle: "You hit a ×4 combo. Unstoppable.",         feature: "flashcards" },
  first_chat:       { id: "first_chat",       title: "First Question",     subtitle: "You started your first tutor session.",   feature: "tutor" },
  first_station:    { id: "first_station",    title: "First Patient",      subtitle: "You finished your first OSCE station.",    feature: "osce" },
  station_pass:     { id: "station_pass",     title: "Station Passed",     subtitle: "You passed an OSCE station. Clean work.",  feature: "osce" },
  flawless_station: { id: "flawless_station", title: "Perfect Station",    subtitle: "100/100, safe, nothing missed.",           feature: "osce" },
};

const FEATURE_ART: Record<Feature, string> = {
  flashcards: "/brand/reward-banners/achievement-flashcards.webp",
  tutor:      "/brand/reward-banners/achievement-tutor.webp",
  osce:       "/brand/reward-banners/achievement-osce.webp",
};

export const LEVELUP_ART = "/brand/reward-banners/level-up.webp";
export const BADGE_ART = "/brand/reward-banners/badge-unlock.webp";

export function achievementArt(feature: Feature): string { return FEATURE_ART[feature]; }
