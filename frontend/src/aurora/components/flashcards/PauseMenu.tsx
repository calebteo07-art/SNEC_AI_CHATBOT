"use client";
/* PauseMenu — the dark-arcade pause overlay. Three beats: the menu (Resume / Switch deck /
   Quit) and a confirm for each exit that abandons the round (Switch deck and Quit both
   forfeit 20 Lumens — leaving an in-progress deck is a forfeit no matter which button you
   press). The full-cover scrim blocks taps to the study card, freezing the (tap-driven)
   loop while open. */
import { useEffect, useState } from "react";

export function PauseMenu({ open, onResume, onSwitch, onQuit }: {
  open: boolean;
  onResume: () => void;
  onSwitch: () => void;
  onQuit: () => void;
}) {
  const [confirm, setConfirm] = useState<null | "switch" | "quit">(null);

  useEffect(() => { if (!open) setConfirm(null); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onResume(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onResume]);

  if (!open) return null;

  return (
    <div className="flash-pausewrap" role="dialog" aria-modal="true" aria-label="Game paused"
      data-testid="flash-pausemenu"
      onClick={(e) => { if (e.target === e.currentTarget) onResume(); }}>
      <div className="flash-pausecard">
        {confirm === null && (
          <>
            <p className="flash-pause-h">PAUSED</p>
            <p className="flash-pause-sub">Catch your breath — the deck will wait.</p>
            <button type="button" className="flash-pausebtn is-go flash-press" autoFocus onClick={onResume}>Resume</button>
            <button type="button" className="flash-pausebtn flash-press"
              data-testid="flash-switch" onClick={() => setConfirm("switch")}>Switch deck</button>
            <button type="button" className="flash-pausebtn is-quit flash-press"
              data-testid="flash-quit" onClick={() => setConfirm("quit")}>Quit game</button>
          </>
        )}
        {confirm === "switch" && (
          <>
            <p className="flash-pause-h">Switch decks?</p>
            <p className="flash-pause-sub">
              Leaving this deck forfeits the round — you&rsquo;ll lose 20 Lumens from your stash. A fresh topic is waiting.
            </p>
            <button type="button" className="flash-pausebtn is-quit flash-press"
              data-testid="flash-switch-confirm" onClick={onSwitch}>Switch &amp; take the hit</button>
            <button type="button" className="flash-pausebtn is-go flash-press" onClick={() => setConfirm(null)}>Keep playing</button>
          </>
        )}
        {confirm === "quit" && (
          <>
            <p className="flash-pause-h">Quit for real?</p>
            <p className="flash-pause-sub">
              You&rsquo;ll forfeit this round&rsquo;s Lumens and lose 20 from your stash — and your rank feels it. No take-backs.
            </p>
            <button type="button" className="flash-pausebtn is-quit flash-press"
              data-testid="flash-quit-confirm" onClick={onQuit}>Quit &amp; take the hit</button>
            <button type="button" className="flash-pausebtn is-go flash-press" onClick={() => setConfirm(null)}>Keep playing</button>
          </>
        )}
      </div>
    </div>
  );
}
