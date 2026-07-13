/* Header: eyebrow chip, the "Leaderboard" title, a short live hook line, and the role
   filter tabs. The title glyph + hook keep it playful without a heavy banner. */
export function LeaderboardHeader({
  roles, role, onRole, hook,
}: {
  roles: string[];
  role: string | null;
  onRole: (r: string | null) => void;
  hook: string;
}) {
  return (
    <header className="lb-head">
      <span className="lb-eyebrow"><span className="lb-dot" aria-hidden /> Season 1 · Your cohort</span>
      <h1 className="lb-title"><span className="lb-title-ico" aria-hidden>🏆</span> Leaderboard</h1>
      <p className="lb-sub">{hook}</p>
      {roles.length > 1 && (
        <div className="lb-filter" role="tablist" aria-label="Filter by role">
          <button type="button" role="tab" aria-selected={role === null} className="lb-chip" data-on={role === null} onClick={() => onRole(null)}>All</button>
          {roles.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={role === r} className="lb-chip" data-on={role === r} onClick={() => onRole(r)}>{r}</button>
          ))}
        </div>
      )}
    </header>
  );
}
