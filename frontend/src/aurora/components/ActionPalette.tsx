"use client";
/* ActionPalette — the quiet "manual procedures" strip above the composer. Only
   hands-on procedures (hand hygiene, VA, IOP, slit-lamp…) appear here; everything
   verbal (history, intro, consent…) is typed in the live consult and auto-ticked
   by the examiner. Clicking a chip does NOT auto-complete the step — the parent
   switches the composer into "procedure mode" where the student types the technique
   before it ticks. Presentational — all state is owned by the parent. */

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
  kind: "manual" | "verbal";
}

export function ActionPalette({
  actions,
  ticked,
  activeKey,
  onPerform,
}: {
  actions: ExamAction[];
  ticked: Set<number>;
  activeKey: string | null;
  onPerform: (action: ExamAction) => void;
}) {
  const manual = actions.filter((a) => a.kind === "manual");
  if (manual.length === 0) return null;
  return (
    <div className="aurora-protray">
      <span className="aurora-protray-cap">Manual procedures · click one, then type your technique</span>
      <div className="aurora-protray-chips">
        {manual.map((a) => {
          const done = a.satisfies_steps.some((n) => ticked.has(n));
          const active = a.key === activeKey;
          return (
            <button
              key={a.key}
              type="button"
              className="aurora-pchip"
              data-done={done ? "true" : "false"}
              data-active={active ? "true" : "false"}
              data-crit={a.critical ? "true" : "false"}
              disabled={done}
              onClick={() => onPerform(a)}
              aria-label={done ? `${a.label} — done` : `Perform ${a.label}`}
              title={a.reveal_text || a.label}
            >
              <span className="ic" aria-hidden>{done ? "✓" : active ? "✎" : "+"}</span>
              {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
