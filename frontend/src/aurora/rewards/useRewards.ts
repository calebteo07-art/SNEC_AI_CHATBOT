"use client";
import { useEffect, useRef } from "react";
import { useProgress } from "@/hooks/useProgress";
import { useAuth } from "@/screens/AuthContext";
import { rankForLevel } from "@/lib/rank";
import { LUMEN_BADGES } from "@/aurora/components/home/lumenBadges";
import { loadTierMark, saveTierMark, type TierMark } from "./store";
import { LEVELUP_ART, BADGE_ART } from "./catalog";
import type { Reward } from "./types";

/** Watches /api/progress and enqueues level-ups + Lumens badge unlocks when a threshold
 *  is newly crossed. First observation on a device baselines silently (never spams
 *  already-earned unlocks). (The separate streak-badge unlock went with the streak vault,
 *  2026-07-29 — the Lumens vault is the only collection now.) */
export function useRewardWatcher(enqueue: (r: Reward) => void) {
  const { user } = useAuth();
  const { data: progress } = useProgress();
  const sid = user?.studentId ?? "";
  const enqRef = useRef(enqueue);
  enqRef.current = enqueue;

  useEffect(() => {
    if (!sid || !progress) return;
    const level = progress.level ?? 1;
    const earned = progress.coins_earned ?? 0;
    const lumenTier = LUMEN_BADGES.filter((b) => earned >= b.at).length;

    const stored = loadTierMark(sid);
    if (!stored) {
      saveTierMark(sid, { level, lumenTier });  // baseline silently
      return;
    }
    const next: TierMark = { ...stored };

    if (level > stored.level) {
      enqRef.current({ id: `level-up:${level}`, kind: "level-up", title: `Level ${level}`, subtitle: rankForLevel(level).title, art: LEVELUP_ART });
      next.level = level;
    }
    for (let i = stored.lumenTier; i < lumenTier; i++) {
      const b = LUMEN_BADGES[i];
      enqRef.current({ id: `lumen-badge:${b.name}`, kind: "lumen-badge", title: b.name, subtitle: b.tagline, art: BADGE_ART, medal: b.image });
    }
    if (lumenTier > stored.lumenTier) next.lumenTier = lumenTier;

    saveTierMark(sid, next);
  }, [sid, progress]);
}
