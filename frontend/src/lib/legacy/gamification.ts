export interface UserProgress {
  level: number;
  xp: number;
  streak: number;
  lastStudyDate: string | null;
  totalCards: number;
  achievements: string[];
}

export const XP_PER_LEVEL = 500;

export function calculateLevel(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

export function getXPForNextLevel(currentXP: number): number {
  const currentLevel = calculateLevel(currentXP);
  return currentLevel * XP_PER_LEVEL;
}

export function getXPProgress(currentXP: number): number {
  const currentLevelXP = (calculateLevel(currentXP) - 1) * XP_PER_LEVEL;
  const xpIntoLevel = currentXP - currentLevelXP;
  return (xpIntoLevel / XP_PER_LEVEL) * 100;
}

export const XP_REWARDS = {
  chatMessage: 10,
  flashcardAgain: 5,
  flashcardHard: 15,
  flashcardGood: 25,
  flashcardEasy: 35,
  sessionComplete: 100,
  streakBonus: 50,
};

export const ACHIEVEMENTS = [
  { id: "first_session", name: "First Steps", description: "Complete your first study session", icon: "🎯" },
  { id: "streak_3", name: "Getting Consistent", description: "Maintain a 3-day streak", icon: "🔥" },
  { id: "streak_7", name: "Week Warrior", description: "Maintain a 7-day streak", icon: "⚡" },
  { id: "streak_30", name: "Monthly Master", description: "Maintain a 30-day streak", icon: "👑" },
  { id: "cards_50", name: "Flashcard Enthusiast", description: "Review 50 flashcards", icon: "📚" },
  { id: "cards_100", name: "Century Club", description: "Review 100 flashcards", icon: "💯" },
  { id: "level_5", name: "Rising Star", description: "Reach level 5", icon: "⭐" },
  { id: "level_10", name: "Expert", description: "Reach level 10", icon: "🌟" },
  { id: "perfect_session", name: "Perfect Performance", description: "Rate all cards as Easy in one session", icon: "✨" },
];

export function getUserProgress(): UserProgress {
  const stored = localStorage.getItem("eyebot_progress");
  if (stored) {
    return JSON.parse(stored);
  }
  return {
    level: 1,
    xp: 0,
    streak: 0,
    lastStudyDate: null,
    totalCards: 0,
    achievements: [],
  };
}

export function saveUserProgress(progress: UserProgress) {
  localStorage.setItem("eyebot_progress", JSON.stringify(progress));
}

export function syncStreakFromBackend(backendStreak: number): void {
  const progress = getUserProgress();
  if (backendStreak > progress.streak) {
    saveUserProgress({ ...progress, streak: backendStreak });
  }
}

export function getStoredHearts(): number {
  const stored = localStorage.getItem("eyebot_hearts");
  return stored !== null ? Math.max(0, parseInt(stored, 10)) : 5;
}

export function setStoredHearts(hearts: number): void {
  localStorage.setItem("eyebot_hearts", String(Math.max(0, hearts)));
}

export function syncHeartsFromBackend(backendHearts: number): void {
  setStoredHearts(backendHearts);
}

export async function syncGamificationToBackend(
  xpDelta: number,
  heartsUsed: number,
  topic?: string,
  score?: number,
): Promise<{ xp: number; hearts: number; level: number; streak: number } | null> {
  try {
    const res = await fetch("/api/gamification/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ xp_delta: xpDelta, hearts_used: heartsUsed, topic, score }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const progress = getUserProgress();
    saveUserProgress({ ...progress, xp: data.xp, level: data.level, streak: data.streak });
    setStoredHearts(data.hearts);
    return data;
  } catch {
    return null;
  }
}

export function addXP(amount: number): { newXP: number; leveledUp: boolean; newLevel: number } {
  const progress = getUserProgress();
  const oldLevel = progress.level;
  const newXP = progress.xp + amount;
  const newLevel = calculateLevel(newXP);

  progress.xp = newXP;
  progress.level = newLevel;
  saveUserProgress(progress);

  return {
    newXP,
    leveledUp: newLevel > oldLevel,
    newLevel,
  };
}

export function updateStreak(): { streak: number; isNewRecord: boolean } {
  const progress = getUserProgress();
  const today = new Date().toDateString();

  if (progress.lastStudyDate === today) {
    return { streak: progress.streak, isNewRecord: false };
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  if (progress.lastStudyDate === yesterdayStr) {
    progress.streak += 1;
  } else if (progress.lastStudyDate !== today) {
    progress.streak = 1;
  }

  progress.lastStudyDate = today;
  saveUserProgress(progress);

  return { streak: progress.streak, isNewRecord: true };
}

export function checkAndUnlockAchievements(): string[] {
  const progress = getUserProgress();
  const newAchievements: string[] = [];

  if (!progress.achievements.includes("first_session") && progress.totalCards > 0) {
    progress.achievements.push("first_session");
    newAchievements.push("first_session");
  }

  if (!progress.achievements.includes("streak_3") && progress.streak >= 3) {
    progress.achievements.push("streak_3");
    newAchievements.push("streak_3");
  }

  if (!progress.achievements.includes("streak_7") && progress.streak >= 7) {
    progress.achievements.push("streak_7");
    newAchievements.push("streak_7");
  }

  if (!progress.achievements.includes("streak_30") && progress.streak >= 30) {
    progress.achievements.push("streak_30");
    newAchievements.push("streak_30");
  }

  if (!progress.achievements.includes("cards_50") && progress.totalCards >= 50) {
    progress.achievements.push("cards_50");
    newAchievements.push("cards_50");
  }

  if (!progress.achievements.includes("cards_100") && progress.totalCards >= 100) {
    progress.achievements.push("cards_100");
    newAchievements.push("cards_100");
  }

  if (!progress.achievements.includes("level_5") && progress.level >= 5) {
    progress.achievements.push("level_5");
    newAchievements.push("level_5");
  }

  if (!progress.achievements.includes("level_10") && progress.level >= 10) {
    progress.achievements.push("level_10");
    newAchievements.push("level_10");
  }

  saveUserProgress(progress);
  return newAchievements;
}
