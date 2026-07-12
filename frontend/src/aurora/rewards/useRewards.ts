"use client";
import { useEffect, useRef } from "react";
import { useProgress } from "@/hooks/useProgress";
import { useAuth } from "@/screens/AuthContext";
import { rankForLevel } from "@/lib/rank";
import { STREAK_BADGES } from "@/aurora/components/home/streakBadges";
import { LUMEN_BADGES } from "@/aurora/components/home/lumenBadges";
import { loadTierMark, saveTierMark, type TierMark } from "./store";
import { LEVELUP_ART, BADGE_ART } from "./catalog";
import type { Reward } from "./types";

/** Watches /api/progress and enqueues level-ups + streak/Lumens badge unlocks when a
 *  threshold is newly crossed. First observation on a device baselines silently (never
 *  spams already-earned unlocks). */
export function useRewardWatcher(enqueue: (r: Reward) => void) {
  const { user } = useAuth();
  const { data: progress } = useProgress();
  const sid = user?.studentId ?? "";
  const enqRef = useRef(enqueue);
  enqRef.current = enqueue;

  useEffect(() => {
    if (!sid || !progress) return;
    const level = progress.level ?? 1;
    const streak = progress.streak_detail?.current ?? 0;
    const earned = progress.coins_earned ?? 0;
    const streakTier = STREAK_BADGES.filter((b) => streak >= b.at).length;
    const lumenTier = LUMEN_BADGES.filter((b) => earned >= b.at).length;

    const stored = loadTierMark(sid);
    if (!stored) {
      saveTierMark(sid, { level, streakTier, lumenTier });  // baseline silently
      return;
    }
    const next: TierMark = { ...stored };

    if (level > stored.level) {
      enqRef.current({ id: `level-up:${level}`, kind: "level-up", title: `Level ${level}`, subtitle: rankForLevel(level).title, art: LEVELUP_ART });
      next.level = level;
    }
    for (let i = stored.streakTier; i < streakTier; i++) {
      const b = STREAK_BADGES[i];
      enqRef.current({ id: `streak-badge:${b.name}`, kind: "streak-badge", title: b.name, subtitle: b.tagline, art: BADGE_ART, medal: b.image });
    }
    if (streakTier > stored.streakTier) next.streakTier = streakTier;

    for (let i = stored.lumenTier; i < lumenTier; i++) {
      const b = LUMEN_BADGES[i];
      enqRef.current({ id: `lumen-badge:${b.name}`, kind: "lumen-badge", title: b.name, subtitle: b.tagline, art: BADGE_ART, medal: b.image });
    }
    if (lumenTier > stored.lumenTier) next.lumenTier = lumenTier;

    saveTierMark(sid, next);
  }, [sid, progress]);
}
