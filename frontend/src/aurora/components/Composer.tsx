"use client";
/* Composer — Instagram-DM input row: a gradient camera circle, a rounded
   "Message…" field (Enter sends, Shift+Enter newline, auto-grow), and IG behaviour
   where decorative photo/mic/emoji glyphs give way to a blue "Send" button once you
   type. The glyphs are visual-only (aria-hidden); send + the field are functional. */
import { useRef, type KeyboardEvent } from "react";

export function Composer({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Message…",
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const hasText = value.trim().length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  return (
    <div className="aurora-composer">
      <span className="aurora-composer-cam" aria-hidden>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
          <circle cx="12" cy="13" r="3.1" />
        </svg>
      </span>

      <textarea
        ref={ref}
        className="aurora-composer-field"
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={1}
        aria-label="Message input"
      />

      {hasText ? (
        <button
          type="button"
          className="aurora-composer-send aurora-press"
          onClick={onSend}
          disabled={disabled}
          aria-label="Send message"
        >
          Send
        </button>
      ) : (
        <span className="aurora-composer-glyphs" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" />
          </svg>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 15l-5-4-7 6" />
          </svg>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01M8.5 14.5a4 4 0 0 0 7 0" />
          </svg>
        </span>
      )}
    </div>
  );
}
