"use client";
/* PauseMenu — the dark-arcade pause overlay. Two beats: the menu (Resume / Switch deck /
   Quit) and a quit-confirm with the Lumens-loss warning. The full-cover scrim blocks taps
   to the study card, freezing the (tap-driven) loop while open. */
import { useEffect, useState } from "react";

export function PauseMenu({ open, onResume, onSwitch, onQuit }: {
  open: boolean;
  onResume: () => void;
  onSwitch: () => void;
  onQuit: () => void;
}) {
  const [confirmQuit, setConfirmQuit] = useState(false);

  useEffect(() => { if (!open) setConfirmQuit(false); }, [open]);
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
        {!confirmQuit ? (
          <>
            <p className="flash-pause-h">PAUSED</p>
            <p className="flash-pause-sub">Catch your breath — the deck will wait.</p>
            <button type="button" className="flash-pausebtn is-go flash-press" autoFocus onClick={onResume}>Resume</button>
            <button type="button" className="flash-pausebtn flash-press" onClick={onSwitch}>Switch deck</button>
            <button type="button" className="flash-pausebtn is-quit flash-press"
              data-testid="flash-quit" onClick={() => setConfirmQuit(true)}>Quit game</button>
          </>
        ) : (
          <>
            <p className="flash-pause-h">Quit for real?</p>
            <p className="flash-pause-sub">
              You&rsquo;ll forfeit this round&rsquo;s Lumens and lose 20 from your stash — and your rank feels it. No take-backs.
            </p>
            <button type="button" className="flash-pausebtn is-quit flash-press"
              data-testid="flash-quit-confirm" onClick={onQuit}>Quit &amp; take the hit</button>
            <button type="button" className="flash-pausebtn is-go flash-press" onClick={() => setConfirmQuit(false)}>Keep playing</button>
          </>
        )}
      </div>
    </div>
  );
}
