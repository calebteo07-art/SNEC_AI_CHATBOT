"use client";
/* FollowupChip — a suggested prompt. Active chip carries the animated Gemini
   sweep; the rest are outlined. */
export function FollowupChip({ label, active = false, onClick }: { label: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`aurora-followup ${active ? "aurora-flow" : ""}`} data-active={active} onClick={onClick}>
      <span>{label}</span>
    </button>
  );
}
