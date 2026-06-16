"use client";
/* ExamTray — the examination "do something" tray for the OSCE station. Each
   action, when clicked, performs the examination (parent reveals the finding,
   ticks the satisfied steps, marks the chip used). Pure presentational. */

export interface ExamAction {
  key: string;
  label: string;
  reveal_text: string;
  satisfies_steps: number[];
}

export function ExamTray({
  actions,
  performed,
  onPerform,
}: {
  actions: ExamAction[];
  performed: Set<string>;
  onPerform: (action: ExamAction) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <div className="aurora-station-tray">
      <p className="aurora-station-tray-label">Examination tray · click to perform &amp; reveal</p>
      {actions.map((a) => {
        const used = performed.has(a.key);
        return (
          <button
            key={a.key}
            type="button"
            className={`aurora-station-act${used ? " is-used" : ""}`}
            disabled={used}
            onClick={() => onPerform(a)}
            aria-label={used ? `${a.label} — performed` : `Perform ${a.label}`}
          >
            {used && <span aria-hidden>✓</span>}
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
