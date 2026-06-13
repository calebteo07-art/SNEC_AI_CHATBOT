"use client";
/* ChatThread — the scrolling conversation surface on the lavender wash. Calm
   reading area; native scroll (the chat route is excluded from smooth-scroll). */
import { forwardRef, type ReactNode } from "react";

export const ChatThread = forwardRef<HTMLDivElement, { children: ReactNode }>(
  function ChatThread({ children }, ref) {
    return (
      <div ref={ref} className="aurora-chat-thread" role="log" aria-live="polite" aria-label="Conversation">
        <div className="aurora-chat-inner">{children}</div>
      </div>
    );
  },
);
