/* Hero card: the "Leaderboard" title, a short live hook line, the role filter tabs, and —
   folded in at the bottom — the board settings. One red gradient banner carries it all. */
import type { ReactNode } from "react";

export function LeaderboardHeader({
  roles, role, onRole, hook, reset, settings,
}: {
  roles: string[];
  role: string | null;
  onRole: (r: string | null) => void;
  hook: string;
  reset?: string;
  settings?: ReactNode;
}) {
  return (
    <header className="lb-head">
      <h1 className="lb-title"><span className="lb-title-ico" aria-hidden>🏆</span> Leaderboard</h1>
      <p className="lb-sub">{hook}</p>
      {reset && <p className="lb-reset" data-testid="lb-reset">{reset}</p>}
      {roles.length > 1 && (
        <div className="lb-filter" role="tablist" aria-label="Filter by role">
          <button type="button" role="tab" aria-selected={role === null} className="lb-chip" data-on={role === null} onClick={() => onRole(null)}>All</button>
          {roles.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={role === r} className="lb-chip" data-on={role === r} onClick={() => onRole(r)}>{r}</button>
          ))}
        </div>
      )}
      {settings}
    </header>
  );
}
