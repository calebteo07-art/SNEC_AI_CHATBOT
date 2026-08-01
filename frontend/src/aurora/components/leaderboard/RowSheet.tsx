"use client";
/* The peek sheet — who is this person, and how are they doing?

   A named, supervisor-visible cohort board invites the question "who is #3?", and the row
   itself has no room for the answer. Deliberately shows only what the board already shows
   in aggregate (division, weekly Lumens, streak, level) — the sheet is a zoom, not a
   profile, and it must never become a way to mine a classmate's record. */
import { useEffect, useRef } from "react";
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { Lumen } from "@/aurora/components/Lumen";
import { arrowFor, DIVISION_NAMES } from "@/aurora/leaderboard/league";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";

export function RowSheet({ e, onClose }: { e: LeaderboardEntry; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mv = arrowFor(e.rank_delta);
  const div = DIVISION_NAMES[Math.max(0, Math.min(DIVISION_NAMES.length - 1, (e.division || 1) - 1))];

  return (
    <div className="sheet-scrim" data-testid="row-sheet" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${e.name}, rank ${e.rank}`}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="sheet-grip" aria-hidden />
        <div className="sheet-head">
          <span className="sheet-face">
            <Eyecon config={e.avatar_config} background={e.avatar_config?.background} size={72} />
          </span>
          <div className="sheet-id">
            <p className="sheet-nm">{e.name}</p>
            <p className="sheet-sub">{e.role ? `${e.role} · ` : ""}{div} division</p>
          </div>
          <span className="sheet-rk">#{e.rank}</span>
        </div>
        <dl className="sheet-stats">
          <div><dt>This week</dt><dd><Lumen size={14} decorative />{e.xp.toLocaleString()}</dd></div>
          <div><dt>Movement</dt><dd data-dir={mv.dir}>{mv.dir === "none" ? "New" : mv.glyph}</dd></div>
          <div><dt>Streak</dt><dd>{e.streak_days}d</dd></div>
          <div><dt>Level</dt><dd>{e.level}</dd></div>
        </dl>
        <button type="button" className="sheet-close" ref={closeRef} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
