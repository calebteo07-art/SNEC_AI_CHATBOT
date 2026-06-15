"use client";
/* Composer — rounded white input row with an attach glyph and a gradient
   circular send button. Enter sends (Shift+Enter for newline). */
import { useRef, type KeyboardEvent } from "react";
import { Icon } from "@/aurora/icons";

export function Composer({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Ask about any ophthalmic topic…",
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

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
      <button type="button" className="aurora-composer-attach" aria-label="Attach"><Icon.attach size={18} /></button>
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
      <button type="button" className="aurora-send aurora-flow aurora-press" onClick={onSend} disabled={disabled || !value.trim()} aria-label="Send message">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
    </div>
  );
}
