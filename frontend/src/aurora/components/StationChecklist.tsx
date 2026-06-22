"use client";
/* StationChecklist — the auto-tracked OSCE checklist for the Guided OSCE Station.
   Renders a 3-segment phase rail (done / now / todo) and one tinted panel per
   phase. To keep the list short, consecutive clinically-related steps within a
   phase are merged into a single row (e.g. greet + confirm identity + consent →
   one line); every original action is preserved in the row text — nothing is
   dropped. A row ticks live (auto) or by click: ✓ once all of its merged actions
   are done, a partial mark while some are still pending. Each underlying step is
   still tracked individually, so auto-detection, the exam tray, and scoring are
   unchanged. Presentational — all tick state is owned by the parent. */

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

interface StepGroup {
  key: string;
  members: StationStep[];
  action: string;
  critical: boolean;
}

const PHASE_CLASS: Record<number, string> = { 1: "p1", 2: "p2", 3: "p3" };

// Clinically-related step categories collapse into one "family"; consecutive
// same-family steps are merged into a single checklist row (up to MERGE_CAP) so
// the list stays short without dropping any action. Unknown categories only
// merge with an identical category.
const STEP_FAMILY: Record<string, string> = {
  patient_identification: "prep", consent: "prep", patient_education: "prep",
  infection_control: "prep", equipment: "prep", safety_check: "prep", hand_hygiene: "prep",
  clinical_assessment: "assess", clinical_: "assess", medication: "assess",
  examination: "assess", investigation: "assess", investigations: "assess",
  documentation: "wrap", post_procedure: "wrap", follow_up: "wrap",
};
const MERGE_CAP = 3;

function familyOf(category: string): string {
  return STEP_FAMILY[category] ?? (category || "misc");
}

/* Greedily merge consecutive same-family steps (≤ MERGE_CAP) into one row. */
function groupSteps(steps: StationStep[]): StepGroup[] {
  const groups: StepGroup[] = [];
  let run: StationStep[] = [];
  const flush = () => {
    if (!run.length) return;
    groups.push({
      key: run.map((s) => s.step_number).join("-"),
      members: run,
      action: run.map((s) => s.action).join(" · "),
      critical: run.some((s) => s.critical),
    });
    run = [];
  };
  for (const s of steps) {
    if (run.length && (familyOf(run[0].category) !== familyOf(s.category) || run.length >= MERGE_CAP)) flush();
    run.push(s);
  }
  flush();
  return groups;
}

export function StationChecklist({
  procedureName,
  phases,
  ticked,
  autoSteps,
  onToggle,
}: {
  procedureName: string;
  phases: StationPhase[];
  totalSteps: number; // kept for call-site compatibility; the label counts merged rows
  ticked: Set<number>;
  autoSteps: Set<number>;
  onToggle: (stepNumber: number) => void;
}) {
  const grouped = phases.map((p) => groupSteps(p.steps));
  const doneCounts = grouped.map((gs) =>
    gs.filter((g) => g.members.every((m) => ticked.has(m.step_number))).length,
  );
  const totalRows = grouped.reduce((n, gs) => n + gs.length, 0);
  // "current" phase = first phase that is not fully complete; -1 once all done.
  const currentIdx = doneCounts.findIndex((done, i) => done < grouped[i].length);

  // Toggle a merged row: untick everything if it's fully done, else tick the
  // remaining members so one click completes the row.
  const toggleGroup = (g: StepGroup) => {
    const allDone = g.members.every((m) => ticked.has(m.step_number));
    g.members.forEach((m) => {
      if (allDone || !ticked.has(m.step_number)) onToggle(m.step_number);
    });
  };

  return (
    <div>
      <div className="aurora-station-rail" role="list" aria-label="OSCE phases">
        {phases.map((p, i) => {
          const done = doneCounts[i] === grouped[i].length;
          const now = i === currentIdx;
          const cls = done ? "is-done" : now ? "is-now" : "is-todo";
          return (
            <div key={p.phase} className={`aurora-station-rl ${cls}`} role="listitem">
              <b>{`①②③`[i] ?? p.phase} {shortPhase(p.name)}</b>
              {doneCounts[i]}/{grouped[i].length}
            </div>
          );
        })}
      </div>

      <p className="aurora-station-cl-label" title={procedureName}>
        Auto-tracked checklist · {totalRows} point{totalRows !== 1 ? "s" : ""}
      </p>

      {phases.map((p, i) => {
        const groups = grouped[i];
        const done = doneCounts[i] === groups.length;
        const now = i === currentIdx;
        return (
          <div key={p.phase} className={`aurora-station-phase ${PHASE_CLASS[p.phase] ?? "p2"}${done ? " is-done" : ""}${now ? " is-now" : ""}`}>
            <div className="aurora-station-phase-h">
              <span className="aurora-station-node" aria-hidden />
              <span className="aurora-station-phase-t">{p.name}</span>
              <span className="aurora-station-phase-n" aria-hidden>{doneCounts[i]}/{groups.length}</span>
            </div>
            {groups.map((g) => {
              const tickedN = g.members.filter((m) => ticked.has(m.step_number)).length;
              const state = tickedN === g.members.length ? "true" : tickedN > 0 ? "partial" : "false";
              const isAuto = state === "true" && g.members.some((m) => autoSteps.has(m.step_number));
              return (
                <button
                  key={g.key}
                  type="button"
                  className="aurora-station-step"
                  data-ticked={state}
                  onClick={() => toggleGroup(g)}
                  aria-pressed={state === "true"}
                >
                  <span className="bx" aria-hidden>{state === "true" ? "✓" : state === "partial" ? "–" : ""}</span>
                  <span>{g.action}</span>
                  {g.critical && <span className="crit">CRIT</span>}
                  {isAuto && <span className="au" title="Auto-detected from your consult" aria-label="auto-detected">✦</span>}
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
