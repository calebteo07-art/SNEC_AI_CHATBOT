"use client";
/* CaseCard — a single clinical case. Available cases get a gradient Start CTA;
   locked cases are dashed and muted with a prerequisite note. Status colour
   comes only from ink + the gradient (difficulty shown as a mono tier label). */

export interface CaseInfo {
  case_id: string;
  title: string;
  difficulty: string;
  topic: string;
  estimated_minutes: number;
  locked?: boolean;
  patient: { name: string; age: number; presenting_complaint: string };
}

export function CaseCard({ data, onOpen }: { data: CaseInfo; onOpen: (c: CaseInfo) => void }) {
  const locked = data.locked ?? false;

  if (locked) {
    return (
      <div className="aurora-case aurora-case--locked" aria-disabled>
        <div className="aurora-case-top">
          <span className="aurora-case-tier">{data.difficulty} · locked</span>
        </div>
        <p className="aurora-case-title">{data.title}</p>
        <p className="aurora-case-note">Complete a prerequisite case to unlock.</p>
      </div>
    );
  }

  return (
    <button type="button" className="aurora-case" onClick={() => onOpen(data)}>
      <div className="aurora-case-top">
        <span className="aurora-case-topic">{data.topic}</span>
        <span className="aurora-case-tier">{data.difficulty}</span>
      </div>
      <p className="aurora-case-title">{data.title}</p>
      <p className="aurora-case-patient">{data.patient.name} · {data.patient.age} yrs</p>
      <p className="aurora-case-cc">“{data.patient.presenting_complaint}”</p>
      <div className="aurora-case-foot">
        <span className="aurora-case-time">~{data.estimated_minutes} min</span>
        <span className="aurora-case-start aurora-flow"><span>Start →</span></span>
      </div>
    </button>
  );
}
