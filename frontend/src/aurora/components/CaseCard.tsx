"use client";
/* CaseCard — one patient as a station on the learning journey. Available
   patients carry a gradient avatar + Start cue; locked patients are dashed and
   muted with a prerequisite note. The spine dot is the .aurora-case::before drawn
   by the journey column. Keeps the .aurora-case hook the case-list test relies on. */

export interface CaseInfo {
  case_id: string;
  title: string;
  difficulty: string;
  topic: string;
  estimated_minutes: number;
  locked?: boolean;
  set_key?: string;
  set_label?: string;
  patient: { name: string; age: number; presenting_complaint: string };
}

/** Two-letter initials from a patient name (drops honorifics like Mr/Mdm/Ms). */
function initials(name: string): string {
  const parts = name
    .replace(/^(mr|mrs|ms|mdm|dr|miss)\.?\s+/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function CaseCard({ data, onOpen }: { data: CaseInfo; onOpen: (c: CaseInfo) => void }) {
  const locked = data.locked ?? false;
  const chip = data.set_label || data.topic;

  /* Pointer-tilt depth — feeds --rx/--ry to the .aurora-tilt transform. Disabled
     automatically under reduced motion (the class is reset in motion.css). */
  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--ry", `${(px * 5).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${(-py * 4).toFixed(2)}deg`);
  };
  const onLeave = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.style.setProperty("--rx", "0deg");
    e.currentTarget.style.setProperty("--ry", "0deg");
  };

  if (locked) {
    return (
      <div className="aurora-case aurora-case--locked" aria-disabled>
        <span className="aurora-case-avatar" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>
        <div className="aurora-case-body">
          <p className="aurora-case-title">{data.title}</p>
          <p className="aurora-case-note">Clear an earlier patient to unlock.</p>
          <div className="aurora-case-foot">
            {chip && <span className="aurora-case-chip">{chip}</span>}
            <span className="aurora-case-lock">Locked</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button type="button" className="aurora-case aurora-tilt" onClick={() => onOpen(data)} onPointerMove={onMove} onPointerLeave={onLeave}>
      <span className="aurora-case-avatar aurora-case-avatar--live" aria-hidden>{initials(data.patient.name)}</span>
      <div className="aurora-case-body">
        <p className="aurora-case-name">{data.patient.name} <span>· {data.patient.age}</span></p>
        <p className="aurora-case-cc">“{data.patient.presenting_complaint}”</p>
        <div className="aurora-case-foot">
          {chip && <span className="aurora-case-chip">{chip}</span>}
          <span className="aurora-case-time">~{data.estimated_minutes} min</span>
          <span className="aurora-case-start"><span>Start →</span></span>
        </div>
      </div>
    </button>
  );
}
