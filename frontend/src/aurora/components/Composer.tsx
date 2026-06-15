"use client";
/* Composer — a clean rounded "Message…" field (Enter sends, Shift+Enter newline,
   auto-grow) with a blue "Send" button that appears once you type. No camera, photo,
   emoji or voicenote controls — this is a focused, text-only tutor input. */
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

      {hasText && (
        <button
          type="button"
          className="aurora-composer-send aurora-press"
          onClick={onSend}
          disabled={disabled}
          aria-label="Send message"
        >
          Send
        </button>
      )}
    </div>
  );
}
