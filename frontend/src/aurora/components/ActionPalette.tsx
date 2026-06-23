"use client";
/* ActionPalette — the complete "do something" tray for the OSCE station. Every
   checklist step is a clickable chip above the composer (nothing missing), grouped
   by phase. "do" chips perform the action (reveal a finding + tick); "say" chips
   ask the patient the question so they respond. A chip shows done once any of its
   steps is ticked. Presentational — all state is owned by the parent. */

export interface ExamAction {
  key: string;
  label: string;
  reveal_text: string;
  satisfies_steps: number[];
  mode: "do" | "say";
  prompt_text: string;
  phase: number;
  critical: boolean;
  step_number: number;
}

const PHASE_LABEL: Record<number, string> = { 1: "Prepare", 2: "Assess", 3: "Wrap up" };

export function ActionPalette({
  actions,
  ticked,
  busy,
  onPerform,
}: {
  actions: ExamAction[];
  ticked: Set<number>;
  busy: boolean;
  onPerform: (action: ExamAction) => void;
}) {
  if (actions.length === 0) return null;
  const phases = [1, 2, 3].filter((ph) => actions.some((a) => a.phase === ph));
  return (
    <div className="aurora-palette">
      <p className="aurora-station-tray-label">Actions · click to perform every step</p>
      <div className="aurora-palette-scroll">
        {phases.map((ph) => (
          <div key={ph} className="aurora-palette-group">
            <span className="aurora-palette-gl">{PHASE_LABEL[ph] ?? "Assess"}</span>
            <div className="aurora-palette-chips">
              {actions.filter((a) => a.phase === ph).map((a) => {
                const done = a.satisfies_steps.some((n) => ticked.has(n));
                const disabled = done || (a.mode === "say" && busy);
                return (
                  <button
                    key={a.key}
                    type="button"
                    className="aurora-pchip"
                    data-mode={a.mode}
                    data-done={done ? "true" : "false"}
                    data-crit={a.critical ? "true" : "false"}
                    disabled={disabled}
                    onClick={() => onPerform(a)}
                    aria-label={done ? `${a.label} — done` : `Perform ${a.label}`}
                    title={a.mode === "say" ? a.prompt_text : a.reveal_text || a.label}
                  >
                    <span className="ic" aria-hidden>{done ? "✓" : a.mode === "say" ? "“" : "+"}</span>
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
