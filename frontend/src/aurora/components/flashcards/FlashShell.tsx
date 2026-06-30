"use client";
/* FlashShell — the immersive light root shared by the setup, loading, and study
   states. Defined at module scope so the recall textarea never remounts on a parent
   re-render. Carries the sr-only h1, the Exit affordance, and a subtle mute toggle. */
import type { ReactNode, CSSProperties } from "react";
import { Icon } from "@/aurora/icons";
import { AchievementManager } from "@/screens/AchievementToast";
import { EngravingField } from "./EngravingField";
import { BrownianField } from "./BrownianField";
import { useFlashMute } from "./useFlashFx";

export function FlashShell({
  newAchievements = [], onDismissAchievement = () => {}, onExit, topicHue, engraved = false, children,
}: {
  newAchievements?: string[];
  onDismissAchievement?: (id: string) => void;
  onExit: () => void;
  topicHue?: number;
  /** Activity flow (loading / study / results) — drifts the colour-bloom lights
   *  behind everything and etches the engraving rim around the card. Off for the
   *  setup/fan screen, which keeps its own design. */
  engraved?: boolean;
  children: ReactNode;
}) {
  const [muted, toggleMute] = useFlashMute();
  return (
    <div className="flash-root" style={topicHue != null ? ({ "--flash-topic-hue": topicHue } as CSSProperties) : undefined}>
      <h1 className="sr-only">Flashcards</h1>
      <button type="button" className="flash-exit flash-press" data-testid="flash-exit" onClick={onExit}>
        <Icon.back size={16} /> Exit
      </button>
      {engraved && (
        <button type="button" className="flash-mute" data-testid="flash-mute"
          aria-pressed={muted} aria-label={muted ? "Unmute sound" : "Mute sound"} onClick={toggleMute}>
          {muted ? <Icon.mute size={15} /> : <Icon.sound size={15} />}
        </button>
      )}
      {engraved && <BrownianField />}
      {engraved && <EngravingField />}
      <AchievementManager achievements={newAchievements} onDismiss={onDismissAchievement} />
      <div className="flash-content">{children}</div>
    </div>
  );
}
