"use client";
/* The focus assistant — one calm line of encouragement on the deep field. The
   parent keys this element by message so the entrance animation replays on change. */
export function FocusCoach({ message }: { message: string }) {
  return (
    <div className="aperture-coach" aria-live="polite">
      <span className="aperture-coach-dot" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
