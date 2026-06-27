"use client";
/* FlashShell — the immersive light root shared by the setup, loading, and study
   states. Defined at module scope so the recall textarea never remounts on a parent
   re-render. Carries the sr-only h1 and the single Exit affordance. */
import type { ReactNode, CSSProperties } from "react";
import { Icon } from "@/aurora/icons";
import { AchievementManager } from "@/screens/AchievementToast";

export function FlashShell({
  newAchievements = [], onDismissAchievement = () => {}, onExit, topicHue, children,
}: {
  newAchievements?: string[];
  onDismissAchievement?: (id: string) => void;
  onExit: () => void;
  topicHue?: number;
  children: ReactNode;
}) {
  return (
    <div className="flash-root" style={topicHue != null ? ({ "--flash-topic-hue": topicHue } as CSSProperties) : undefined}>
      <h1 className="sr-only">Flashcards</h1>
      <button type="button" className="flash-exit flash-press" data-testid="flash-exit" onClick={onExit}>
        <Icon.back size={16} /> Exit
      </button>
      <AchievementManager achievements={newAchievements} onDismiss={onDismissAchievement} />
      <div className="flash-content">{children}</div>
    </div>
  );
}
