import { useState, useEffect, useRef } from "react";

interface Props {
  streak: number;
  xp: number;
  level: number;
  hearts: number;
}

export function StatsHelpPopover({ streak, xp, level, hearts }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        className="stats-help-btn"
        onClick={() => setOpen(v => !v)}
        aria-label="How do the stats work?"
        aria-expanded={open}
      >
        ?
      </button>

      {open && (
        <div className="stats-help-popover" role="tooltip" aria-live="polite">
          {/* Streak */}
          <div className="stats-help-row">
            <span className="stats-help-icon">🔥</span>
            <div>
              <div className="stats-help-title">Streak — {streak} day{streak !== 1 ? "s" : ""}</div>
              <div className="stats-help-desc">
                Study every day to keep it alive. Miss a day and it resets to 1.
                Each new day you extend your streak earns <strong>+50 bonus XP</strong>.
              </div>
            </div>
          </div>

          <div className="stats-help-divider" />

          {/* XP */}
          <div className="stats-help-row">
            <span className="stats-help-icon">⭐</span>
            <div>
              <div className="stats-help-title">XP &amp; Level — Lv {level}</div>
              <div className="stats-help-desc">
                Earned for reviewing flashcards: Again&nbsp;=&nbsp;5 · Hard&nbsp;=&nbsp;15 · Good&nbsp;=&nbsp;25 · Easy&nbsp;=&nbsp;35 XP,
                plus <strong>+100 XP</strong> for finishing a session.
                Every <strong>500 XP</strong> levels you up — you're at {xp} XP total.
              </div>
            </div>
          </div>

          <div className="stats-help-divider" />

          {/* Hearts */}
          <div className="stats-help-row">
            <span className="stats-help-icon">❤️</span>
            <div>
              <div className="stats-help-title">Hearts — {hearts} remaining today</div>
              <div className="stats-help-desc">
                You start each day with <strong>5 hearts</strong>. You lose one each time
                you rate a card <em>Again</em> — it means you're still learning that concept.
                Hearts reset to 5 at midnight. Running out never blocks you — keep going!
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
