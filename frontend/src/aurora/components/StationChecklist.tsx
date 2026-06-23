"use client";
/* StationChecklist — the auto-tracked OSCE checklist for the Guided OSCE Station.
   Each checklist step is its own clean, tickable row, grouped under its phase. A
   row ticks live (auto, from the consult) or by a tap. Nothing is merged or hidden,
   so every action reads as one discrete, scannable line — clearest for students.
   A 3-segment phase rail and per-phase counters show progress at a glance.
   Presentational — all tick state is owned by the parent. */

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
  ticked,
  autoSteps,
  onToggle,
}: {
  procedureName: string;
  phases: StationPhase[];
  totalSteps: number; // kept for call-site compatibility
  ticked: Set<number>;
  autoSteps: Set<number>;
  onToggle: (stepNumber: number) => void;
}) {
  const doneCounts = phases.map((p) => p.steps.filter((s) => ticked.has(s.step_number)).length);
  const totalSteps = phases.reduce((n, p) => n + p.steps.length, 0);
  const doneTotal = doneCounts.reduce((n, d) => n + d, 0);
  // "current" phase = first phase not yet fully complete; -1 once all are done.
  const currentIdx = doneCounts.findIndex((done, i) => done < phases[i].steps.length);
  const anyAuto = phases.some((p) => p.steps.some((s) => autoSteps.has(s.step_number)));

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

      <p className="aurora-station-cl-label" title={procedureName}>
        Checklist · {doneTotal} of {totalSteps} done
      </p>

      {phases.map((p, i) => {
        const done = doneCounts[i] === p.steps.length;
        const now = i === currentIdx;
        return (
          <div key={p.phase} className={`aurora-station-phase ${PHASE_CLASS[p.phase] ?? "p2"}${done ? " is-done" : ""}${now ? " is-now" : ""}`}>
            <div className="aurora-station-phase-h">
              <span className="aurora-station-node" aria-hidden />
              <span className="aurora-station-phase-t">{p.name}</span>
              <span className="aurora-station-phase-n" aria-hidden>{doneCounts[i]}/{p.steps.length}</span>
            </div>
            {p.steps.map((s) => {
              const isDone = ticked.has(s.step_number);
              const isAuto = isDone && autoSteps.has(s.step_number);
              return (
                <button
                  key={s.step_number}
                  type="button"
                  className="aurora-station-step"
                  data-ticked={isDone ? "true" : "false"}
                  onClick={() => onToggle(s.step_number)}
                  aria-pressed={isDone}
                >
                  <span className="bx" aria-hidden>{isDone ? "✓" : ""}</span>
                  <span>{s.action}</span>
                  {s.critical && <span className="crit">CRIT</span>}
                  {isAuto && <span className="au" title="Auto-detected from your consult" aria-label="auto-detected">✦</span>}
                </button>
              );
            })}
          </div>
        );
      })}

      <p className="aurora-station-cl-legend">
        {anyAuto ? <><span className="au">✦</span> ticked automatically from your conversation · </> : null}
        tap any step to tick it yourself
      </p>
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
