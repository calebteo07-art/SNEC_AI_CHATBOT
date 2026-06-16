"use client";
/* StationChecklist — the auto-tracked OSCE checklist for the Guided OSCE Station.
   Renders a 3-segment phase rail (done / now / todo) and one tinted panel per
   phase with its steps. Steps tick live (auto) or by manual click (fallback);
   auto-detected steps carry a "✦ auto" marker. Presentational — all tick state
   is owned by the parent. */

export interface StationStep {
  step_number: number;
  action: string;
  critical: boolean;
  category: string;
  notes: string | null;
}
export interface StationPhase {
  phase: number;
  name: string;
  steps: StationStep[];
}

const PHASE_CLASS: Record<number, string> = { 1: "p1", 2: "p2", 3: "p3" };

export function StationChecklist({
  procedureName,
  phases,
  totalSteps,
  ticked,
  autoSteps,
  onToggle,
}: {
  procedureName: string;
  phases: StationPhase[];
  totalSteps: number;
  ticked: Set<number>;
  autoSteps: Set<number>;
  onToggle: (stepNumber: number) => void;
}) {
  const doneCounts = phases.map((p) => p.steps.filter((s) => ticked.has(s.step_number)).length);
  // "current" phase = first phase that is not fully complete; -1 once all done.
  const currentIdx = doneCounts.findIndex((done, i) => done < phases[i].steps.length);

  return (
    <div>
      <div className="aurora-station-rail" role="list" aria-label="OSCE phases">
        {phases.map((p, i) => {
          const done = doneCounts[i] === p.steps.length;
          const now = i === currentIdx;
          const cls = done ? "is-done" : now ? "is-now" : "is-todo";
          return (
            <div key={p.phase} className={`aurora-station-rl ${cls}`} role="listitem">
              <b>{`①②③`[i] ?? p.phase} {shortPhase(p.name)}</b>
              {doneCounts[i]}/{p.steps.length}
            </div>
          );
        })}
      </div>

      <p className="aurora-station-cl-label">
        OSCE checklist · auto-tracked · {totalSteps} steps
        <span style={{ display: "block", fontWeight: 400, marginTop: 2, textTransform: "none", letterSpacing: 0, color: "var(--ink-3)" }}>
          {procedureName}
        </span>
      </p>

      {phases.map((p, i) => {
        const done = doneCounts[i] === p.steps.length;
        const now = i === currentIdx;
        const pct = p.steps.length ? Math.round((doneCounts[i] / p.steps.length) * 100) : 0;
        return (
          <div key={p.phase} className={`aurora-station-phase ${PHASE_CLASS[p.phase] ?? "p2"}${done ? " is-done" : ""}${now ? " is-now" : ""}`}>
            <div className="aurora-station-phase-h">
              <span className="aurora-station-node" aria-hidden />
              <span className="aurora-station-phase-t">{p.name}</span>
              <span className="aurora-station-pbar" aria-hidden><i style={{ width: `${pct}%` }} /></span>
            </div>
            {p.steps.map((s) => {
              const isTicked = ticked.has(s.step_number);
              const isAuto = isTicked && autoSteps.has(s.step_number);
              return (
                <button
                  key={s.step_number}
                  type="button"
                  className="aurora-station-step"
                  data-ticked={isTicked}
                  onClick={() => onToggle(s.step_number)}
                  aria-pressed={isTicked}
                >
                  <span className="bx" aria-hidden>{isTicked ? "✓" : ""}</span>
                  <span>{s.action}</span>
                  {s.critical && <span className="crit">CRIT</span>}
                  {isAuto && <span className="au" title="Detected automatically from your consult">✦ auto</span>}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* Short rail caption: first 1–2 meaningful words of the phase name. */
function shortPhase(name: string): string {
  const map: Record<string, string> = {
    "Preparation & Identification": "Prep & ID",
    "Clinical Assessment": "Assessment",
    "Documentation & Follow-up": "Documentation",
  };
  return map[name] ?? name;
}
