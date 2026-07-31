export interface UserProgress {
  level: number;
  xp: number;
  streak: number;
  lastStudyDate: string | null;
  totalCards: number;
  achievements: string[];
}

export const XP_PER_LEVEL = 500;

/** Daily XP goal — roughly one focused study session. Drives the Dashboard ring. */
export const DAILY_XP_GOAL = 100;

function dailyXpKey(): string {
  return "eyebot_daily_xp_" + new Date().toDateString();
}

/** XP earned so far today (resets automatically each calendar day). */
export function getDailyXp(): number {
  try {
    const v = localStorage.getItem(dailyXpKey());
    return v ? Math.max(0, parseInt(v, 10)) : 0;
  } catch {
    return 0;
  }
}

/** Add to today's XP tally and return the new total. */
export function addDailyXp(amount: number): number {
  try {
    const next = getDailyXp() + Math.max(0, amount);
    localStorage.setItem(dailyXpKey(), String(next));
    return next;
  } catch {
    return getDailyXp();
  }
}

/** Award chat XP (Lumens). No daily cap — friendly competition is unlimited. Kept as a
 *  thin wrapper so existing callers stay unchanged; returns the amount granted. */
export function addChatXp(amount: number): number {
  const grant = Math.max(0, amount);
  if (grant > 0) addXP(grant);
  return grant;
}

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

// Lumens for a tutor chat message. Kept small — chat is a learning tool, not a graded
// task, so it trickles rather than rivalling flashcards/OSCE. The server also clamps the
// sync endpoint per request, so this can't be inflated. (Per-card flashcard scoring lives
// in flashcards/types.ts::cardPoints; the deck bonus in sessionBonus; the daily check-in
// bonus and OSCE award are server-owned. Those old per-difficulty/sessionComplete/streak
// constants were dead and have been removed.)
export const XP_REWARDS = {
  chatMessage: 5,
};

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

export function addXP(amount: number): { newXP: number; leveledUp: boolean; newLevel: number } {
  const progress = getUserProgress();
  const oldLevel = progress.level;
  const newXP = progress.xp + amount;
  const newLevel = calculateLevel(newXP);

  progress.xp = newXP;
  progress.level = newLevel;
  saveUserProgress(progress);
  addDailyXp(amount);  // every XP gain also counts toward today's goal ring

  return {
    newXP,
    leveledUp: newLevel > oldLevel,
    newLevel,
  };
}

/** Count reviewed flashcards toward lifetime totals — this is what drives the
 *  card-count achievements (first_session / cards_50 / cards_100). Previously
 *  these could never fire because nothing incremented totalCards. Returns the
 *  new lifetime total. */
export function incrementTotalCards(n = 1): number {
  const progress = getUserProgress();
  progress.totalCards = (progress.totalCards ?? 0) + Math.max(0, n);
  saveUserProgress(progress);
  return progress.totalCards;
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

