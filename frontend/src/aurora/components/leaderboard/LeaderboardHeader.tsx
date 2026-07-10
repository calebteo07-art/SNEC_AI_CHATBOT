/* Header banner: eyebrow, "The Climb" title, a live hook line, and the role filter tabs. */
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
      <span className="lb-eyebrow"><span className="lb-dot" aria-hidden /> Cohort leaderboard · Season 1</span>
      <h1>The <em>Climb</em></h1>
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
