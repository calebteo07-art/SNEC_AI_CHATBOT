"use client";
/* FlashShell — the immersive dark-arcade root shared by the setup, loading, and study
   states. Defined at module scope so the recall textarea never remounts on a parent
   re-render. Carries the sr-only h1, the top-left control (neon Pause during a game,
   quiet Home pill otherwise), and a subtle mute toggle. */
import type { ReactNode, CSSProperties } from "react";
import { Icon } from "@/aurora/icons";
import { EngravingField } from "./EngravingField";
import { BrownianField } from "./BrownianField";
import { useFlashMute } from "./useFlashFx";
import { CoBrand } from "@/aurora/components/CoBrand";

export function FlashShell({
  onExit, onPause, exitLabel = "Home", topicHue, engraved = false, children,
}: {
  onExit: () => void;
  /** When set, the top-left control is a neon PAUSE button (active game). When
   *  omitted, it's a quiet back pill (selection / intro / results — nothing to pause). */
  onPause?: () => void;
  /** Label for the quiet back pill. Defaults to "Home" (→ dashboard); the pre-deck
   *  intro overrides it to "Topics" since its back steps to the topic fan, not Home. */
  exitLabel?: string;
  topicHue?: number;
  engraved?: boolean;
  children: ReactNode;
}) {
  const [muted, toggleMute] = useFlashMute();
  return (
    <div className="flash-root" style={topicHue != null ? ({ "--flash-topic-hue": topicHue } as CSSProperties) : undefined}>
      <h1 className="sr-only">Flashcards</h1>
      {onPause ? (
        <button type="button" className="flash-pause flash-press" data-testid="flash-pause" aria-label="Pause game" onClick={onPause}>
          <span className="flash-pause-bars" aria-hidden><i /><i /></span> Pause
        </button>
      ) : (
        <button type="button" className="flash-exit flash-press" data-testid="flash-exit" onClick={onExit}>
          <Icon.back size={16} /> {exitLabel}
        </button>
      )}
      {/* Not `dark` since 2026-08-11 — the flashcards ground is light now, and the dark
          variant paints the wordmark and the mono Logo glyph white (1.06:1 on cream). */}
      <CoBrand className="flash-cobrand" />

      {engraved && (
        <button type="button" className="flash-mute" data-testid="flash-mute"
          aria-pressed={muted} aria-label={muted ? "Unmute sound" : "Mute sound"} onClick={toggleMute}>
          {muted ? <Icon.mute size={15} /> : <Icon.sound size={15} />}
        </button>
      )}
      {engraved && <BrownianField />}
      {engraved && <EngravingField />}
      <div className="flash-content">{children}</div>
    </div>
  );
}
