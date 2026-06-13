"use client";
/* MessageBubble — calm reading surface. EyeBot gets a mono Spark Eye avatar + a
   white bubble; the user gets a right-aligned soft blue/purple gradient tint. */
import type { ReactNode } from "react";
import { Logo } from "@/aurora/Logo";

export function MessageBubble({
  role,
  streaming = false,
  children,
}: {
  role: "eyebot" | "user";
  streaming?: boolean;
  children: ReactNode;
}) {
  if (role === "user") {
    return (
      <div className="aurora-msg is-user">
        <div className="aurora-msg-bubble">{children}</div>
      </div>
    );
  }
  return (
    <div className="aurora-msg is-eyebot">
      <span className="aurora-msg-avatar"><Logo size={20} /></span>
      <div className="aurora-msg-bubble">
        {children}
        {streaming && <span className="aurora-caret" />}
      </div>
    </div>
  );
}
