/* WeekStats — four at-a-glance numbers, every one backed by a real /api/progress
   field (no invented data): total sessions, best streak, mean recall accuracy, and
   topics mastered (score ≥ 0.65). */
import type { ProgressData } from "@/hooks/useProgress";

export function WeekStats({ progress }: { progress?: ProgressData }) {
  const sessions = progress?.session_count ?? 0;
  const best = progress?.streak_detail?.best ?? progress?.streak ?? 0;
  const perf = progress?.topic_performance ?? [];
  const accuracy = perf.length
    ? Math.round((perf.reduce((s, p) => s + p.score, 0) / perf.length) * 100)
    : 0;
  const mastered = perf.filter((p) => p.score >= 0.65).length;

  const stats: { tone: string; value: string | number; label: string }[] = [
    { tone: "a", value: sessions, label: "Sessions" },
    { tone: "b", value: best, label: "Best streak" },
    { tone: "c", value: `${accuracy}%`, label: "Recall accuracy" },
    { tone: "d", value: mastered, label: "Topics mastered" },
  ];

  return (
    <section className="hm-panel" aria-label="Your progress">
      <p className="hm-ph disp">Your progress</p>
      <div className="hm-stats">
        {stats.map((s) => (
          <div key={s.label} className="hm-stat">
            <div className={`hm-sv ${s.tone} disp`}>{s.value}</div>
            <div className="hm-sl">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
