"use client";
/* The focus assistant — one calm line of encouragement on the deep field. */
export function FocusCoach({ message }: { message: string }) {
  return (
    <div className="aperture-coach" aria-live="polite" key={message}>
      <span className="aperture-coach-dot" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
